import React from "react";
import type { Entity } from "../core/schema";
import { EntityDetails } from "../ui/EntityDetails";

export const ENTITY_TAB_KIND = "rich-ui-entity";
export const ENTITY_TAB_ID = "dsh-rich-msg/entity";

/** Last opened entity, used only when the host restores the tab without its
 * navigation params after a reload. It is a display fallback, not a source of
 * truth: the next click from a response replaces it. */
const ENTITY_FALLBACK_KEY = "dsh-rich-msg:entity-tab:v1";
const ENTITY_FALLBACK_LIMIT = 200_000;

function rememberEntity(entity: Entity, entities: Entity[]): void {
  try {
    const value = JSON.stringify({ entity, entities });
    if (value.length <= ENTITY_FALLBACK_LIMIT)
      sessionStorage.setItem(ENTITY_FALLBACK_KEY, value);
  } catch {
    /* Session storage is optional. */
  }
}

function recallEntity(): TabParams | undefined {
  try {
    const raw = sessionStorage.getItem(ENTITY_FALLBACK_KEY);
    if (!raw || raw.length > ENTITY_FALLBACK_LIMIT) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return undefined;
    const params = value as TabParams;
    if (
      !params.entity ||
      typeof params.entity.id !== "string" ||
      !params.entity.title ||
      !Array.isArray(params.entities)
    )
      return undefined;
    return params;
  } catch {
    return undefined;
  }
}

interface TabParams {
  entity?: Entity;
  entities?: Entity[];
}
interface TabInfo {
  tab: { navigation: { params?: TabParams } };
}
interface TabProps {
  useTabInfo?: () => TabInfo;
}

/** Structural faces of the host services; this plugin does not depend on their package types. */
export interface SidebarHost {
  inject?(
    names: string[],
    callback: (injected: { get(name: string): unknown }) => void,
  ): (() => void) | void;
  slots?: {
    inject(name: string, callback: () => () => void): () => void;
    register(
      options: {
        name: string;
        key: string;
        inject: (sessionId: string) => object;
      },
      component: React.ComponentType<Record<string, unknown>>,
    ): () => void;
  };
  sidebarRight?: {
    openTab(kind: string, options?: { params?: unknown }): void;
  };
}

/**
 * Put the entity into the native right column, which makes room for itself by
 * reflowing the conversation. Returns false when the host has no such column or
 * the open fails, so the caller can keep the in-page drawer.
 */
export function openEntityInSidebar(
  ctx: SidebarHost,
  entity: Entity,
  entities: Entity[],
  isReady?: () => boolean,
): boolean {
  const sidebar = ctx.sidebarRight;
  if (!sidebar?.openTab) return false;
  // Never open a tab whose body is not registered: the host would show its
  // empty-pane fallback. Returning false keeps the in-page drawer instead.
  if (isReady && !isReady()) return false;
  try {
    sidebar.openTab(ENTITY_TAB_KIND, { params: { entity, entities } });
    rememberEntity(entity, entities);
    return true;
  } catch {
    // No mounted session or a host-side refusal: keep the in-page drawer.
    return false;
  }
}

function paramsOf(info: TabInfo | undefined): TabParams | undefined {
  return info?.tab?.navigation?.params;
}

/** Body for a right-sidebar tab; the host delivers the live tab through `useTabInfo`. */
export function makeEntityTabBody(
  open: (entity: Entity, entities: Entity[]) => boolean,
) {
  return function EntityTabBody({ useTabInfo }: TabProps) {
    const params = paramsOf(useTabInfo?.()) ?? recallEntity();
    const entity = params?.entity;
    const entities = params?.entities ?? (entity ? [entity] : []);
    if (!entity || typeof entity.id !== "string" || !entity.title)
      return <p className="ru-empty">No entity data.</p>;
    return (
      <div data-rich-ui-root="">
        <section
          className="rich-ui ru-entity-tab"
          data-rich-ui-entity-tab=""
          aria-label={`Details: ${entity.title}`}
        >
          <EntityDetails
            entity={entity}
            entities={entities}
            onSelect={(id) => {
              const next = entities.find((entry) => entry.id === id);
              if (next) open(next, entities);
            }}
          />
        </section>
      </div>
    );
  };
}

/** Chip text for the same tab: the entity's own name, not a generic label. */
export function makeEntityTabTitle() {
  return function EntityTabTitle({ useTabInfo }: TabProps) {
    const entity = paramsOf(useTabInfo?.())?.entity;
    return <>{entity?.title ?? "Entity"}</>;
  };
}

/** Live registration state, so a click can fall back instead of opening an empty tab. */
export interface EntityTabHandle {
  dispose(): void;
  ready(): boolean;
}

/**
 * Register the tab type, its body and its chip title. The service appears after
 * this plugin's apply, so registration waits for it, exactly like the shipped
 * right-sidebar integrations.
 *
 * The body and title slots are registered once. The tab type may be
 * re-injected while the plugin runs; disposing the slots inside that callback
 * leaves the pane without a body for an already-open tab, which is exactly the
 * empty-panel failure. `ready()` describes the real registration state rather
 * than assuming that a successful `openTab` call means a rendered body.
 */
export function installEntityTab(
  ctx: SidebarHost,
  getSidebar?: () => SidebarHost["sidebarRight"],
): EntityTabHandle {
  if (typeof ctx.inject !== "function" || !ctx.slots)
    return { dispose() {}, ready: () => false };
  const slots = ctx.slots;
  let bodyReady = false;
  let titleReady = false;
  let typeReady = false;
  let disposed = false;
  const ready = () => !disposed && bodyReady && titleReady && typeReady;
  const safeRelease = (release: (() => void) | undefined) => {
    try {
      release?.();
    } catch (error) {
      console.warn("[rich-ui] right sidebar release failed", error);
    }
  };
  const body = makeEntityTabBody((entity, entities) =>
    openEntityInSidebar(
      { sidebarRight: getSidebar?.() },
      entity,
      entities,
      ready,
    ),
  );
  const title = makeEntityTabTitle();
  const registerSlot = (
    name: string,
    component: React.ComponentType<Record<string, unknown>>,
    mark: (value: boolean) => void,
  ) =>
    slots.inject(name, () => {
      if (disposed) return () => {};
      try {
        const release = slots.register(
          {
            name,
            key: ENTITY_TAB_ID,
            inject: (sessionId) => ({ sessionId }),
          },
          component,
        );
        mark(true);
        return () => {
          mark(false);
          safeRelease(release);
        };
      } catch (error) {
        console.warn(`[rich-ui] ${name} unavailable`, error);
        return () => {};
      }
    });

  // Registration is transactional enough to survive a partially available
  // host: either both slots are installed or the first one is released before
  // the plugin reports that the native tab is unavailable.
  const slotDisposers: Array<() => void> = [];
  try {
    slotDisposers.push(
      registerSlot("sidebar.right.pane.tab", body, (value) => {
        bodyReady = value;
      }),
    );
    slotDisposers.push(
      registerSlot("sidebar.right.pane.tab.title", title, (value) => {
        titleReady = value;
      }),
    );
  } catch (error) {
    console.warn("[rich-ui] right sidebar slots unavailable", error);
    for (const release of slotDisposers) safeRelease(release);
    return { dispose() {}, ready: () => false };
  }

  let typeDispose: (() => void) | undefined;
  let seat: (() => void) | void;
  try {
    seat = ctx.inject(["sidebarRightTabs"], (injected) => {
      if (disposed) return;
      safeRelease(typeDispose);
      typeDispose = undefined;
      typeReady = false;
      let tabs: { register?: (definition: object) => () => void } | undefined;
      try {
        tabs = injected.get("sidebarRightTabs") as typeof tabs;
      } catch (error) {
        console.warn("[rich-ui] entity tab service unavailable", error);
        return;
      }
      if (!tabs?.register) return;
      let release: (() => void) | undefined;
      try {
        release = tabs.register({
          id: ENTITY_TAB_ID,
          kind: ENTITY_TAB_KIND,
          keepMounted: true,
          title: () => "Entity",
        });
        typeReady = true;
      } catch (error) {
        console.warn("[rich-ui] entity tab type unavailable", error);
        return;
      }
      typeDispose = () => {
        typeReady = false;
        safeRelease(release);
      };
    });
  } catch (error) {
    console.warn("[rich-ui] entity tab registration failed", error);
    for (const release of slotDisposers) safeRelease(release);
    return { dispose() {}, ready: () => false };
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      safeRelease(seat ?? undefined);
      safeRelease(typeDispose);
      typeDispose = undefined;
      for (const release of slotDisposers) safeRelease(release);
    },
    ready,
  };
}
