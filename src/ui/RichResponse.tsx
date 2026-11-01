import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Info,
  X,
} from "lucide-react";
import {
  collectStateDomains,
  parseRichSpec,
  stateValueFits,
  type Entity,
  type Expr,
  type GalleryImage,
  type RadioNode,
  type RichAction,
  type RichNode,
  type RichSpec,
  type Scalar,
  type TabsNode,
} from "../core/schema";
import { evaluate, getInitialState } from "../core/evaluator";
import {
  clearPersistedState,
  loadPersistedState,
  savePersistedState,
} from "./persistence";
import { ImageLightbox, Popover, Tooltip } from "./primitives";
import { InlineGallery } from "./Gallery";
import { EntityList } from "./EntityList";
import { Inline } from "./inline";
import { EntityDetails } from "./EntityDetails";
import { Picture } from "./Picture";
import { resolveIcon } from "./icons";
import { Chart } from "./blocks/Chart";
import { CodeBlock } from "./blocks/CodeBlock";
import {
  Diagram,
  Progress,
  Stat,
  Status,
  formatNumber,
} from "./blocks/Metrics";
import { SortableTable } from "./blocks/Table";
import { Layers } from "./blocks/Layers";
import { InputField } from "./blocks/Field";
import { Audio, Video } from "./blocks/Media";
import "./rich-ui.css";

const TONE_ICONS = {
  success: CheckCircle2,
  error: CircleX,
  warning: AlertTriangle,
  info: Info,
} as const;

type Update = (key: string, value: Scalar) => void;
type RenderNode = (node: RichNode, key: number | string) => React.ReactNode;

/** One radio/segmented group has one DOM name. Deriving it inside the component
 * keeps two groups with the same stateKey from sharing (and clearing) each
 * other's selection. */
function ChoiceBlock({
  node,
  state,
  update,
}: {
  node: RadioNode;
  state: Record<string, Scalar>;
  update: Update;
}) {
  const uid = useId();
  const current = state[node.stateKey];
  return (
    <fieldset
      className={`ru-choice ru-${node.type}`}
      aria-label={node.label}
      data-layout={node.layout}
    >
      {node.label && <legend>{node.label}</legend>}
      <div className="ru-choice-options">
        {node.options.map((option, index) => (
          <label key={index}>
            <input
              type="radio"
              name={`${uid}-group`}
              value={index}
              checked={current === option.value}
              onChange={() => update(node.stateKey, option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Tab ids are local to one tabs node, never to the shared state key. */
function TabsBlock({
  node,
  state,
  update,
  render,
}: {
  node: TabsNode;
  state: Record<string, Scalar>;
  update: Update;
  render: RenderNode;
}) {
  const uid = useId();
  const requested = String(state[node.stateKey] ?? node.tabs[0]?.id);
  const current = node.tabs.some((tab) => tab.id === requested)
    ? requested
    : (node.tabs[0]?.id ?? "");
  return (
    <div>
      <div className="ru-tabs" role="tablist">
        {node.tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            id={`${uid}-${tab.id}`}
            role="tab"
            aria-selected={current === tab.id}
            aria-controls={`${uid}-panel`}
            tabIndex={current === tab.id ? 0 : -1}
            onClick={() => update(node.stateKey, tab.id)}
            onKeyDown={(event) => {
              if (
                !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? node.tabs.length - 1
                    : (index +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        node.tabs.length) %
                      node.tabs.length;
              update(node.stateKey, node.tabs[next]!.id);
              (
                event.currentTarget.parentElement?.children[next] as HTMLElement
              )?.focus();
            }}
          >
            {(() => {
              const Glyph = tab.icon ? resolveIcon(tab.icon) : undefined;
              return Glyph ? <Glyph size={14} aria-hidden="true" /> : null;
            })()}
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-${current}`}
        className="ru-tabpanel"
        // A tab is a separate declarative subtree. Keying the panel stops a
        // filter, popover or scroll position from moving to the next tab when
        // both hold a node at the same position.
        key={current}
      >
        {node.tabs.find((tab) => tab.id === current)?.children.map(render)}
      </div>
    </div>
  );
}

export interface RichResponseProps {
  spec: RichSpec;
  /** Already-validated document from a host that parsed it. Avoids a second full validation per streamed token. */
  parsedSpec?: RichSpec;
  /** Opt-in sessionStorage identity; include owning session and response/block. Inputs never persist. */
  persistenceKey?: string;
  /** Streaming preview: inert and short-lived, so it must not reload control state per token. */
  preview?: boolean;
  /** Desktop defaults to non-modal fixed drawer; host owns surrounding layout reflow. Mobile uses a modal sheet. */
  detailMode?: "drawer" | "modal";
  /**
   * Preferred entity surface. Return true when the host opened it; false keeps
   * the in-page drawer, so a host without a right sidebar still works.
   */
  onOpenEntity?: (entity: Entity, entities: Entity[]) => boolean;
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
}

export function RichResponse({
  spec: raw,
  parsedSpec,
  onAction,
  onOpenEntity,
  persistenceKey,
  preview = false,
  detailMode = "drawer",
}: RichResponseProps) {
  const spec = React.useMemo(
    () => parsedSpec ?? parseRichSpec(raw),
    [parsedSpec, raw],
  );
  const [interactiveState, setInteractiveState] = useState<
    Record<string, Scalar>
  >(() =>
    preview
      ? getInitialState(spec, true)
      : loadPersistedState(spec, persistenceKey),
  );
  // A streaming preview is inert, so it can always show the document's actual
  // initial state. Deriving it here, rather than only in the mount state, makes
  // a late-arriving initialState visible without resetting a live response.
  const state = React.useMemo(
    () => (preview ? getInitialState(spec, true) : interactiveState),
    [preview, spec, interactiveState],
  );
  const domains = React.useMemo(() => collectStateDomains(spec), [spec]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLElement>(null);
  const closePanel = React.useCallback(() => setSelected(null), []);
  const update = (key: string, value: Scalar) => {
    const next = { ...state, [key]: value };
    setInteractiveState(next);
    savePersistedState(spec, persistenceKey, next);
  };
  useEffect(() => {
    if (preview) return;
    setInteractiveState(loadPersistedState(spec, persistenceKey));
    setSelected(null);
  }, [spec, persistenceKey, preview]);
  const ev = (expr: Expr) => evaluate(expr, state);
  const openEntity = React.useCallback(
    (id: string) => {
      const entity = spec.entities?.find((entry) => entry.id === id);
      if (entity && onOpenEntity?.(entity, spec.entities ?? [])) return;
      setSelected(id);
    },
    [spec, onOpenEntity],
  );
  const act = async (action: RichAction) => {
    try {
      switch (action.type) {
        case "set": {
          const value = ev(action.value);
          const domain = domains.get(action.key);
          if (domain && !stateValueFits(domain, value))
            throw new Error(`value is not valid for "${action.key}"`);
          update(action.key, value);
          break;
        }
        case "toggle": {
          // Unbound keys keep the documented truthiness semantics. A key that
          // owns a control is held to that control's domain instead.
          const next = !state[action.key];
          const domain = domains.get(action.key);
          if (domain && !stateValueFits(domain, next))
            throw new Error(`value is not valid for "${action.key}"`);
          update(action.key, next);
          break;
        }
        case "reset":
          setInteractiveState(getInitialState(spec, true));
          clearPersistedState(persistenceKey);
          break;
        case "open-entity":
          openEntity(action.entityId);
          break;
        case "close-entity":
          setSelected(null);
          break;
        case "copy":
          try {
            await navigator.clipboard.writeText(String(ev(action.text)));
            setNotice("Copied");
          } catch {
            setNotice("Copy failed");
          }
          break;
        case "open-url":
          window.open(action.url, "_blank", "noopener,noreferrer");
          break;
        case "send-message":
          if (onAction)
            onAction("send-message", { text: String(ev(action.text)) });
          break;
      }
    } catch (error) {
      setNotice(
        `Action failed: ${
          error instanceof Error ? error.message : "calculation error"
        }.`,
      );
    }
  };
  const render = (n: RichNode, i: number | string): React.ReactNode => {
    const key = n.id ?? i;
    try {
      switch (n.type) {
        case "popover":
          return (
            <Popover key={key} label={n.label}>
              {n.children.map(render)}
            </Popover>
          );
        case "tooltip":
          return (
            <Tooltip key={key} text={n.text}>
              <button type="button" className="ru-primitive-trigger">
                {n.label}
              </button>
            </Tooltip>
          );
        case "image-group": {
          const pictures: GalleryImage[] = n.items?.length
            ? n.items
            : (n.src ?? []).map((src, index) => ({
                src,
                alt: `${n.alt} — image ${index + 1}`,
              }));
          return n.presentation === "gallery" ? (
            <InlineGallery key={key} images={pictures} label={n.label} />
          ) : (
            <ImageLightbox
              key={key}
              src={pictures.map((picture) => picture.src)}
              captions={pictures.map((picture) => picture.caption)}
              alt={n.alt}
              label={n.label}
            />
          );
        }
        case "text":
          return (
            <div key={key} className={`ru-text ru-${n.variant ?? "body"}`}>
              <Inline
                text={String(ev(n.content) ?? "")}
                entities={spec.entities}
                onEntity={openEntity}
              />
            </div>
          );
        case "row":
        case "stack":
        case "grid":
        case "card":
          return (
            <div
              key={key}
              className={`ru-${n.type}`}
              data-columns={
                n.type === "row" && n.columns ? n.columns : undefined
              }
              style={
                {
                  gap: n.gap,
                  ...(n.type === "grid"
                    ? { "--ru-columns": n.columns ?? 2 }
                    : {}),
                } as React.CSSProperties
              }
            >
              {n.title && <h3 className="ru-section-title">{n.title}</h3>}
              {n.children.map(render)}
            </div>
          );
        case "icon": {
          const Glyph = resolveIcon(n.name) ?? Info;
          return (
            <span
              key={key}
              className="ru-icon"
              data-tone={n.tone ?? "default"}
              aria-hidden="true"
            >
              <Glyph size={n.size ?? 19} strokeWidth={1.7} />
            </span>
          );
        }
        case "stat":
          return (
            <Stat
              key={key}
              node={n}
              value={ev(n.value)}
              delta={n.delta === undefined ? undefined : ev(n.delta)}
            />
          );
        case "progress":
          return <Progress key={key} node={n} value={ev(n.value)} />;
        case "status":
          return <Status key={key} node={n} />;
        case "diagram":
          return <Diagram key={key} node={n} />;
        case "layers":
          return <Layers key={key} node={n} />;
        case "meta":
          return (
            <div key={key} className="ru-meta">
              {n.items.map((item, index) => {
                const Glyph = item.icon ? resolveIcon(item.icon) : undefined;
                return (
                  <span key={index} className="ru-meta-item">
                    {Glyph && (
                      <span className="ru-icon" data-tone="muted">
                        <Glyph size={15} strokeWidth={1.7} />
                      </span>
                    )}
                    {item.text}
                  </span>
                );
              })}
            </div>
          );
        case "entity-list":
          return (
            <EntityList
              key={key}
              node={n}
              entities={spec.entities ?? []}
              onOpen={openEntity}
            />
          );
        case "divider":
          return (
            <div key={key} className="ru-divider">
              {n.label && <span>{n.label}</span>}
            </div>
          );
        case "callout": {
          const Icon = TONE_ICONS[n.tone ?? "info"];
          return (
            <aside key={key} className={`ru-callout ru-${n.tone ?? "info"}`}>
              <Icon size={18} aria-hidden="true" />
              <div>
                {n.title && (
                  <strong className="ru-callout-title">{n.title}</strong>
                )}
                <Inline
                  text={String(ev(n.content) ?? "")}
                  entities={spec.entities}
                  onEntity={openEntity}
                />
              </div>
            </aside>
          );
        }
        case "computed": {
          const value = ev(n.expr);
          return (
            <div key={key} className="ru-computed">
              {n.label && <span>{n.label}</span>}
              <output>
                {typeof value === "number"
                  ? formatNumber(value)
                  : String(value ?? "")}
              </output>
            </div>
          );
        }
        case "button":
          return (
            <button
              key={key}
              type="button"
              className={`ru-button ru-button-${n.variant ?? "secondary"}`}
              disabled={
                Boolean(n.disabled && ev(n.disabled)) ||
                (n.action.type === "send-message" && !onAction)
              }
              onClick={() => void act(n.action)}
            >
              {n.label}
              {n.action.type === "open-url" && <ArrowUpRight size={15} />}
            </button>
          );
        case "input":
          return (
            <InputField
              key={key}
              node={n}
              value={state[n.stateKey]}
              onCommit={(value) => update(n.stateKey, value)}
            />
          );
        case "select":
          return (
            <label key={key} className="ru-field">
              <span>{n.label}</span>
              <select
                aria-label={n.label ?? n.stateKey}
                value={n.options.findIndex(
                  (option) => option.value === state[n.stateKey],
                )}
                onChange={(event) =>
                  update(
                    n.stateKey,
                    n.options[Number(event.target.value)]?.value ?? null,
                  )
                }
              >
                {n.options.map((option, index) => (
                  <option key={index} value={index}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        case "slider":
          return (
            <label key={key} className="ru-field ru-slider">
              <span>
                {n.label}
                <output>
                  {Number(state[n.stateKey] ?? n.min).toLocaleString("en-US")}
                </output>
              </span>
              <input
                aria-label={n.label ?? n.stateKey}
                type="range"
                min={n.min}
                max={n.max}
                step={n.step ?? 1}
                value={Number(state[n.stateKey] ?? n.min)}
                onChange={(event) =>
                  update(n.stateKey, Number(event.target.value))
                }
              />
            </label>
          );
        case "switch":
          return (
            <label key={key} className="ru-switch">
              <span>{n.label}</span>
              <input
                aria-label={n.label ?? n.stateKey}
                type="checkbox"
                role="switch"
                checked={Boolean(state[n.stateKey])}
                onChange={(event) => update(n.stateKey, event.target.checked)}
              />
            </label>
          );
        case "checkbox":
          return (
            <label key={key} className="ru-checkbox">
              <input
                type="checkbox"
                checked={Boolean(state[n.stateKey])}
                onChange={(event) => update(n.stateKey, event.target.checked)}
              />
              <span>{n.label}</span>
            </label>
          );
        case "radio":
        case "segmented":
          return (
            <ChoiceBlock key={key} node={n} state={state} update={update} />
          );
        case "conditional": {
          const branch = ev(n.when) ? "then" : "else";
          return (
            // The two branches are separate subtrees, so a node at the same
            // position must not inherit the other branch's local UI state.
            <React.Fragment key={`${String(key)}:${branch}`}>
              {(branch === "then" ? n.children : (n.elseChildren ?? [])).map(
                render,
              )}
            </React.Fragment>
          );
        }
        case "tabs":
          return (
            <TabsBlock
              key={key}
              node={n}
              state={state}
              update={update}
              render={render}
            />
          );
        case "table":
          return <SortableTable key={key} node={n} state={state} />;
        case "chart":
          return <Chart key={key} node={n} state={state} />;
        case "code":
          return (
            <CodeBlock
              key={key}
              code={n.code}
              language={n.language}
              title={n.title}
              lineNumbers={n.lineNumbers}
            />
          );
        case "image":
          return (
            <figure key={key} className="ru-image">
              <Picture src={n.src} alt={n.alt} />
              {n.caption && <figcaption>{n.caption}</figcaption>}
            </figure>
          );
        case "video":
          return <Video key={key} node={n} />;
        case "audio":
          return <Audio key={key} node={n} />;
        case "carousel":
          return <Carousel key={key}>{n.children.map(render)}</Carousel>;
        case "entity-ref": {
          const entity = spec.entities?.find(
            (entry) => entry.id === n.entityId,
          );
          if (!entity) return null;
          return (
            <button
              key={key}
              type="button"
              className="ru-entity-card"
              onClick={() => openEntity(entity.id)}
              aria-label={`Details: ${entity.title}`}
            >
              {entity.image && (
                <span className="ru-poster-frame">
                  <Picture src={entity.image} alt="" className="ru-poster" />
                </span>
              )}
              <span className="ru-entity-meta">
                <span className="ru-eyebrow">{entity.kind}</span>
                <strong>{entity.title}</strong>
                {entity.subtitle && <span>{entity.subtitle}</span>}
                {entity.description && (
                  <span className="ru-entity-description">
                    {entity.description}
                  </span>
                )}
                <span className="ru-entity-open">
                  Details <ArrowUpRight size={14} />
                </span>
              </span>
            </button>
          );
        }
      }
    } catch {
      return (
        <p key={key} role="alert" className="ru-evaluation-error">
          Could not compute this block.
        </p>
      );
    }
  };
  const entity = spec.entities?.find((entry) => entry.id === selected);
  return (
    <section
      ref={root}
      className={`rich-ui${entity ? " ru-has-detail" : ""}`}
      data-detail-mode={detailMode}
      aria-label={spec.title ?? "Interactive response"}
    >
      {spec.title && <h2>{spec.title}</h2>}
      <div className="ru-response-body">{spec.nodes.map(render)}</div>
      <span role="status" className="ru-status">
        {notice}
      </span>
      {entity && (
        <EntityPanel
          entity={entity}
          entities={spec.entities ?? []}
          onClose={closePanel}
          onSelect={setSelected}
          themeSource={root}
          detailMode={detailMode}
        />
      )}
    </section>
  );
}

function Carousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (direction: 1 | -1) => {
    const track = ref.current;
    if (!track) return;
    const card = track.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const distance = card ? card.getBoundingClientRect().width + gap : 330;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({
      left: direction * distance,
      behavior: reduced ? "auto" : "smooth",
    });
  };
  return (
    <div className="ru-carousel">
      <div className="ru-carousel-controls">
        <button
          type="button"
          aria-label="Previous cards"
          onClick={() => move(-1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button type="button" aria-label="Next cards" onClick={() => move(1)}>
          <ChevronRight size={17} />
        </button>
      </div>
      <div
        ref={ref}
        className="ru-carousel-track"
        tabIndex={0}
        aria-label="Card collection"
      >
        {children}
      </div>
    </div>
  );
}

/** The host may expose the theme as an attribute, a class or only through the
 * effective palette. The drawer is portaled outside the response wrapper, so it
 * has to reproduce that decision instead of assuming the light base tokens. */
function themeOf(source: HTMLElement): string | undefined {
  let node: HTMLElement | null = source;
  while (node) {
    const explicit = node.getAttribute("data-theme");
    if (explicit) return explicit;
    if (node.hasAttribute("data-ds-dark-theme")) return "dark";
    if (node.classList.contains("dark")) return "dark";
    node = node.parentElement;
  }
  let probe: HTMLElement | null = source;
  while (probe) {
    const background = getComputedStyle(probe).backgroundColor;
    if (background && background !== "transparent") {
      const rgb = background.match(/rgba?\(([^)]+)\)/);
      if (rgb) {
        const [r, g, b, a = "1"] = rgb[1]!
          .split(",")
          .map((part) => part.trim());
        if (Number(a) > 0) {
          const luminance =
            (0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b)) /
            255;
          return luminance < 0.45 ? "dark" : "light";
        }
      }
    }
    probe = probe.parentElement;
  }
  return undefined;
}

function EntityPanel({
  entity,
  entities,
  onClose,
  onSelect,
  themeSource,
  detailMode,
}: {
  entity: Entity;
  entities: Entity[];
  onClose: () => void;
  onSelect: (id: string) => void;
  themeSource: React.RefObject<HTMLElement>;
  detailMode: "drawer" | "modal";
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [mobile, setMobile] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 600px)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 600px)");
    const change = () => setMobile(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const modal = detailMode === "modal" || mobile;
  const title = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [theme, setTheme] = useState<string>();
  useEffect(() => {
    const source = themeSource.current;
    const sync = () => setTheme(source ? themeOf(source) : undefined);
    sync();
    const observer = new MutationObserver(sync);
    if (source) {
      let ancestor: HTMLElement | null = source;
      while (ancestor) {
        observer.observe(ancestor, {
          attributes: true,
          attributeFilter: ["data-theme", "data-ds-dark-theme", "class"],
        });
        ancestor = ancestor.parentElement;
      }
    }
    return () => observer.disconnect();
  }, [themeSource]);
  React.useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    // A drawer that never takes focus leaves Escape dead: move the caret into
    // the panel without trapping Tab, so the surface is announced and closable.
    if (!modal && panel && !panel.contains(document.activeElement)) {
      heading.current?.focus({ preventScroll: true });
    }
    return () => {
      if (
        !modal &&
        panel?.contains(document.activeElement) &&
        opener?.isConnected
      )
        opener.focus();
    };
  }, [modal]);
  useEffect(() => {
    if (!modal) {
      const listener = (event: KeyboardEvent) => {
        if (
          event.key === "Escape" &&
          ref.current?.contains(document.activeElement)
        ) {
          event.preventDefault();
          onCloseRef.current();
        }
      };
      document.addEventListener("keydown", listener);
      return () => document.removeEventListener("keydown", listener);
    }
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // aria-modal alone does not stop programmatic or virtual-cursor focus from
    // reaching the page behind the dialog. Inert the siblings while it is open.
    const overlay = ref.current?.parentElement;
    const behind = [...document.body.children].filter(
      (element) => element !== overlay,
    );
    const wasInert = behind.map((element) => element.hasAttribute("inert"));
    for (const element of behind) element.setAttribute("inert", "");
    close.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!ref.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", listener);
      behind.forEach((element, index) => {
        if (!wasInert[index]) element.removeAttribute("inert");
      });
      if (previous?.isConnected) previous.focus();
    };
  }, [modal]);
  return createPortal(
    <div
      className={`rich-ui ru-overlay ${modal ? "ru-modal" : "ru-drawer"}`}
      data-rich-ui-root=""
      data-theme={theme}
      onClick={(event) => {
        if (modal && event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={ref}
        className="ru-detail"
        role={modal ? "dialog" : "complementary"}
        aria-modal={modal ? true : undefined}
        aria-labelledby={title}
      >
        {modal && <span className="ru-sheet-handle" aria-hidden="true" />}
        <header className="ru-detail-top">
          <span className="ru-eyebrow">{entity.kind}</span>
          <button
            ref={close}
            type="button"
            aria-label="Close details"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <EntityDetails
          entity={entity}
          entities={entities}
          titleId={title}
          titleRef={heading}
          onSelect={(id) => {
            close.current?.focus();
            onSelect(id);
          }}
        />
      </aside>
    </div>,
    document.body,
  );
}
