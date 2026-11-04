/**
 * Browser half of dsh-rich-msg.
 *
 * The plugin owns exactly three things in the browser:
 *   1. a one-time stylesheet (the host loads one JS artifact, no CSS manifest);
 *   2. the fence renderer: validated rich-msg code fences in final assistant
 *      answers are replaced by real components, everything else is untouched;
 *   3. a session-scoped action relay that forwards viewer activations as plain
 *      user messages.
 *
 * It registers no slot occupant that would replace host rendering, reads no
 * prompt and injects no model guidance. Everything it mounts is disposable and
 * restores the host DOM on unload.
 *
 * @module dsh-rich-msg/client
 */
import { ChatView, readSessions, readUiConversation } from './chat-view.ts';
import { ArtifactResolver } from './artifact-resolver.ts';
import { createActionRelay } from './actions.ts';
import { installStyles } from './styles.ts';
import { installFenceRenderer } from './dom-renderer.tsx';
import { installEntityTab, openEntityInSidebar, type EntityTabHandle } from './entity-tab.tsx';

/** Cordis plugin name (matches package.json). */
export const name = 'dsh-rich-msg';

/** The session controller provides the viewed session and the send face. */
export const inject = ['sessions'];

/** Read one service from a cordis face, tolerating both access styles. */
function service<T>(face: unknown, name: string): T | undefined {
  if (face === null || face === undefined) return undefined;
  const record = face as Record<string, unknown> & { get?(name: string): unknown };
  if (record[name] !== undefined) return record[name] as T;
  if (typeof record.get === 'function') {
    try {
      return record.get(name) as T | undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Structural view of the browser plugin context. */
interface ClientContext {
  inject?(names: string[], callback: (injected: ClientContext) => (() => void) | void): unknown;
  effect?(execute: () => () => void, label?: string): unknown;
  slots?: Parameters<typeof installEntityTab>[0]['slots'];
  sidebarRight?: Parameters<typeof openEntityInSidebar>[0]['sidebarRight'];
}

/**
 * Apply the browser plugin.
 * @param ctx - Cordis client context.
 * @returns a disposer that removes every mounted root and restores host DOM.
 */
export function apply(ctx: ClientContext): () => void {
  const services: {
    uiConversation?: ReturnType<typeof readUiConversation>;
    sidebar?: Parameters<typeof openEntityInSidebar>[0]['sidebarRight'];
  } = {};
  const chat = new ChatView({
    getSessions: () => readSessions(ctx),
    getUiConversation: () => services.uiConversation
  });
  const artifacts = new ArtifactResolver({ chat });
  const relay = createActionRelay({ getSessions: () => readSessions(ctx) });
  let entityTab: EntityTabHandle | undefined;
  const seats: Array<unknown> = [];

  // Optional: the conversation assembly service enables snapshot verification.
  if (typeof ctx.inject === 'function') {
    seats.push(
      ctx.inject(['uiConversation'], (sub) => {
        services.uiConversation = readUiConversation(sub) ?? service(sub, 'uiConversation');
        chat.notify();
      })
    );
    seats.push(
      ctx.inject(['sidebarRight'], (sub) => {
        services.sidebar = service(sub, 'sidebarRight') ?? sub.sidebarRight;
      })
    );
    seats.push(
      ctx.inject(['slots'], (sub) => {
        const slots = (service(sub, 'slots') ?? sub.slots) as Parameters<typeof installEntityTab>[0]['slots'];
        if (slots === undefined) return;
        entityTab?.dispose();
        entityTab = installEntityTab(
          {
            inject: (names, callback) => {
              ctx.inject?.(names, callback as (injected: ClientContext) => void);
            },
            slots
          },
          () => services.sidebar
        );
        return () => {
          entityTab?.dispose();
          entityTab = undefined;
        };
      })
    );
  }

  const disposeFence = installFenceRenderer({
    chat,
    artifacts,
    sendAction: (sessionId, action, payload) => relay.send(sessionId, action, payload),
    openEntity: (entity, entities) => {
      if (entityTab === undefined) return false;
      try {
        return openEntityInSidebar({ sidebarRight: services.sidebar }, entity as never, entities as never, () => entityTab?.ready() ?? false);
      } catch {
        return false;
      }
    }
  });
  const disposeStyles = installStyles();

  // Diagnostics for the test harness only; no host state is exposed.
  try {
    (globalThis as unknown as { __DSH_RICH_MSG__?: unknown }).__DSH_RICH_MSG__ = {
      version: '0.1.0',
      hat: 'browser',
      hasSnapshot: () => services.uiConversation !== undefined
    };
  } catch {
    /* A frozen global scope is fine. */
  }

  const dispose = (): void => {
    disposeFence();
    disposeStyles();
    for (const seat of seats) {
      try {
        if (typeof seat === 'function') (seat as () => void)();
        else if (seat !== null && typeof seat === 'object' && 'dispose' in (seat as object)) {
          const maybe = (seat as { dispose?: unknown }).dispose;
          if (typeof maybe === 'function') (maybe as () => unknown).call(seat);
        } else if (seat !== null && typeof seat === 'object' && typeof (seat as { then?: unknown }).then === 'function') {
          void (seat as Promise<unknown>).then((fiber) => (fiber as { dispose?: () => void })?.dispose?.());
        }
      } catch {
        /* Seat cleanup is best-effort. */
      }
    }
    entityTab?.dispose();
    entityTab = undefined;
    chat.dispose();
    artifacts.dispose();
    try {
      delete (globalThis as unknown as { __DSH_RICH_MSG__?: unknown }).__DSH_RICH_MSG__;
    } catch {
      /* ignore */
    }
  };

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => dispose, 'dsh-rich-msg: browser resources');
  }
  return dispose;
}
