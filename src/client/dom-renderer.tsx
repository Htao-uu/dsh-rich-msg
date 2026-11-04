/**
 * DOM fence renderer for dsh-rich-msg.
 *
 * DSH renders assistant Markdown through its own component set and exposes no
 * fenced-code renderer registry (verified against the installed client
 * packages: the only Markdown extension points are link/file/image delegates,
 * not code blocks). The supported technique is a read-only DOM adapter: find
 * finished code surfaces, validate replacements, mount an isolated React root
 * next to them and hide the source block.
 *
 * What makes this adapter different from a naive ``` scanner:
 *
 *   - a fence is claimed only inside an assistant row of the **final** answer.
 *     The chat snapshot decides this: intermediate steps that precede another
 *     tool call are never claimed;
 *   - a fence that belongs to a reasoning block is never claimed, even though
 *     reasoning renders in the same row;
 *   - a fence in a normal code block, an ordinary JSON block, a tool row or a
 *     different fence language is left exactly as the host rendered it;
 *   - every DOM mutation stays additive: the host's own elements are hidden
 *     with the `hidden` attribute only, and restored on unload or removal.
 *
 * Scheduling is fully event driven: MutationObserver batches from the host,
 * chat-snapshot subscriptions, and `visibilitychange` are the only triggers.
 * Bursts are coalesced onto one microtask; there is no polling timer and no
 * animation-frame loop. Scanning is scoped to the rows an event actually
 * touched, and every step is idempotent, so a self-inflicted mutation settles
 * in the next observer round instead of breeding work.
 *
 * @module dsh-rich-msg/client/dom-renderer
 */
import React, { Component, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RichResponse } from '../ui/RichResponse.tsx';
import { Diagnostic } from '../ui/Diagnostic.tsx';
import { parseRichSpec, type RichSpec } from '../core/schema.ts';
import { parseStreamingSpec } from '../core/partial.ts';
import { DOM_MARKERS, FENCE_LANGUAGES, MAX_SOURCE_LENGTH, parseReference } from '../shared/protocol.ts';
import { parseDocumentText } from '../shared/document.ts';
import type { ChatView, RowFacts } from './chat-view.ts';
import type { ArtifactResolver, ResolvedArtifact } from './artifact-resolver.ts';

/** Code surfaces the host Markdown renderer produces. */
const SURFACES = '.md-code-block, .code-block, .code-block-small';
/** Our own mounted containers, excluded from every scan. */
const OWN = '[' + DOM_MARKERS.root + ']';
/** Row kinds that may carry a final answer. */
const ANSWER_ROW = 'assistant-step';
/** Languages the host replaces with a localized generic label. */
const GENERIC_LABEL = /^(code|code block|代码|代码块)$/i;
/** Explicit language tokens the host keeps verbatim. */
const LANGUAGE_TOKEN = /^[a-z0-9+#._-]{1,24}$/;

/** Render failure boundary: one broken document must not blank the answer. */
class RenderBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(): void {
    this.props.onFailure();
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** What one code surface means. */
type Claim =
  | { readonly kind: 'spec'; readonly spec: RichSpec }
  | { readonly kind: 'ref'; readonly ref: string }
  | { readonly kind: 'invalid'; readonly error: string }
  | null;

/** One mounted replacement. */
interface Mount {
  readonly source: HTMLElement;
  readonly container: HTMLElement;
  readonly root: Root;
  raw: string;
  /** Source block hidden state before we touched it. */
  readonly sourceHidden: boolean;
  streaming: boolean;
  mode: 'rich' | 'diagnostic' | 'resolving';
  spec?: RichSpec;
  error?: string;
  ref?: string;
  sessionId?: string;
  owner?: string;
  failed?: boolean;
  /** Identity of the painted tree, so repeated scans never repaint. */
  renderedKey?: string;
  /** How often the host removed our container; a row that keeps fighting is dropped. */
  reinserts: number;
}

/** How the renderer receives its data. */
export interface FenceRendererDeps {
  readonly chat: ChatView;
  readonly artifacts: ArtifactResolver;
  /** Session captured for action delivery; resolved per mount, never at click time. */
  readonly sendAction: (sessionId: string | undefined, action: string, payload?: unknown) => void;
  /** Optional right-sidebar entity opener; returning false keeps the inline drawer. */
  readonly openEntity?: (entity: unknown, entities: unknown[]) => boolean;
}

/** Renderer tuning; all optional, all event-driven. */
export interface FenceRendererOptions {
  /**
   * Render a still-streaming closing answer as an inert preview. Off by
   * default: settled-only rendering avoids per-token React work, which is the
   * expensive and risky path on a long transcript.
   */
  readonly previewDuringStreaming?: boolean;
  /** Hard cap on concurrently mounted rich blocks. */
  readonly maxMounts?: number;
}

/** Identity of the response row that owns a fence, independent of its content. */
export function fenceOwnerKey(source: HTMLElement, row: HTMLElement): string | undefined {
  const anchor = row.getAttribute('data-chat-node-key') ?? row.getAttribute('data-chat-anchor-key');
  if (anchor === null || anchor === '') return undefined;
  const blocks = [...row.querySelectorAll<HTMLElement>(SURFACES)].filter(
    (block) => !block.closest(OWN) && !block.parentElement?.closest(SURFACES)
  );
  const ordinal = blocks.indexOf(source);
  return ordinal >= 0 ? anchor + '\u0000' + ordinal : undefined;
}

/** Read the language label the host banner shows for one code block. */
function fenceLabel(source: HTMLElement, body: HTMLElement): string {
  const banner = source.querySelector('[data-code-block-banner]');
  const scope = banner ?? source;
  const candidates = [...scope.querySelectorAll('*')].filter(
    (element) => !body.contains(element) && element.children.length === 0
  );
  for (const element of candidates) {
    const text = (element.textContent ?? '').trim();
    if (text !== '') return text;
  }
  return '';
}

/** Whether a payload looks like a rich-msg document even behind a generic label. */
function looksLikeDocument(raw: string): boolean {
  const text = raw.trim();
  if (!text.startsWith('{')) return false;
  if (parseReference(text) !== null) return true;
  if (text.length > MAX_SOURCE_LENGTH) return false;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return false;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as { version?: unknown; nodes?: unknown };
  return record.version === 1 && Array.isArray(record.nodes);
}

/** Parse one fence body into a claim, before row-level gating. */
function claimFence(source: HTMLElement, body: HTMLElement, raw: string): Claim {
  if (raw.length > MAX_SOURCE_LENGTH) {
    if (isOurs(labelToken(fenceLabel(source, body)))) {
      return { kind: 'invalid', error: 'Document is longer than ' + MAX_SOURCE_LENGTH + ' characters' };
    }
    return null;
  }
  const label = fenceLabel(source, body);
  const token = labelToken(label);
  const explicit = token !== '' && LANGUAGE_TOKEN.test(token);
  const ours = isOurs(token);
  if (explicit && !ours) return null;
  const reference = parseReference(raw);
  if (reference !== null) {
    if (explicit || looksLikeDocument(raw)) return { kind: 'ref', ref: reference.ref };
    return null;
  }
  if (!explicit && !looksLikeDocument(raw)) return null;
  try {
    const spec = parseDocumentText(raw.trim());
    return { kind: 'spec', spec };
  } catch (error) {
    if (!explicit && !looksLikeDocument(raw)) return null;
    return { kind: 'invalid', error: error instanceof Error ? error.message.slice(0, 500) : 'Invalid document' };
  }
}

/** Lower-cased language token from a banner label. */
function labelToken(label: string): string {
  const text = label.trim().toLowerCase();
  if (text === '' || GENERIC_LABEL.test(text)) return '';
  return text;
}

/** Whether a token is one of the fence languages this plugin claims. */
function isOurs(token: string): boolean {
  return (FENCE_LANGUAGES as readonly string[]).includes(token);
}

/** Find the nearest chat row for one code surface. */
function rowOf(source: HTMLElement): HTMLElement | null {
  return source.closest<HTMLElement>('[data-chat-flow-kind]');
}

/** Whether the source sits inside the streaming subtree the host marks. */
function isStreamingDom(source: HTMLElement): boolean {
  return source.closest('[data-streaming]') !== null;
}

/** All candidate code surfaces inside one row (excluding our own containers). */
function surfacesOf(row: HTMLElement): HTMLElement[] {
  return [...row.querySelectorAll<HTMLElement>(SURFACES)].filter(
    (surface) => !surface.closest(OWN) && !surface.parentElement?.closest(SURFACES)
  );
}

/** Stable fingerprint of a row's claim-relevant state, for idempotent rescans. */
function rowSignature(row: HTMLElement): string {
  const key = row.getAttribute('data-chat-node-key') ?? row.getAttribute('data-chat-anchor-key') ?? '';
  const streaming = isStreamingDom(row) ? '1' : '0';
  const surfaces = surfacesOf(row);
  const lengths = surfaces.map((surface) => {
    const body = surface.querySelector('pre') ?? surface.querySelector('[data-code-block-content]');
    return body?.textContent?.length ?? 0;
  });
  return key + '|' + streaming + '|' + surfaces.length + '|' + lengths.join(',');
}

/**
 * Install the fence renderer over one document scope.
 * @param deps - chat snapshot, artifact resolver and action delivery.
 * @param scope - DOM scope observed for code surfaces; defaults to body.
 * @param options - event-driven renderer tuning.
 * @returns the disposer: unmounts every root and restores every source block.
 */
export function installFenceRenderer(
  deps: FenceRendererDeps,
  scope: HTMLElement = document.body,
  options: FenceRendererOptions = {}
): () => void {
  // One renderer per document scope. A reload, an HMR pass or a repeated
  // install replaces the previous instance instead of racing it for the same
  // rows (two renderers would each mount their own root).
  if (activeScopeRenderer !== undefined && activeScopeRenderer.scope === scope) {
    try {
      activeScopeRenderer.dispose();
    } catch {
      /* Replacing a broken instance must not block the new one. */
    }
  }
  const previewAllowed = options.previewDuringStreaming === true;
  const maxMounts = typeof options.maxMounts === 'number' && options.maxMounts > 0 ? options.maxMounts : 40;
  const mounts = new Map<HTMLElement, Mount>();
  /** Rows currently known to contain at least one candidate code surface. */
  const knownRows = new Set<HTMLElement>();
  /** Rows whose host reconciler keeps removing our container; never claimed again. */
  const unstableRows = new WeakSet<HTMLElement>();
  /** Cached signatures for rows we already evaluated. */
  const rowSignatures = new Map<HTMLElement, string>();
  let disposed = false;
  let flushPending = false;
  let pendingRows = new Set<HTMLElement>();
  let fullRescan = true;
  let sessionId: string | undefined;

  const remove = (source: HTMLElement, mount: Mount): void => {
    try {
      mount.root.unmount();
    } catch {
      /* A root that failed while rendering may already be detached. */
    }
    mount.container.remove();
    source.hidden = mount.sourceHidden;
    mounts.delete(source);
  };

  const paint = (mount: Mount, facts: RowFacts | undefined): void => {
    const session = mount.sessionId;
    const onAction = (action: string, payload?: Record<string, unknown>): void => {
      deps.sendAction(session, action, payload);
    };
    const onOpenEntity = (entity: unknown, entities: unknown[]): boolean => {
      if (deps.openEntity === undefined) return false;
      try {
        return deps.openEntity(entity, entities);
      } catch {
        return false;
      }
    };
    const common = {
      onAction,
      onOpenEntity,
      preview: mount.streaming,
      persistenceKey: persistenceKeyOf(mount, facts)
    };
    const integrity = (): void => {
      mount.failed = true;
      mount.container.hidden = true;
      mount.source.hidden = mount.sourceHidden;
    };
    if (mount.mode === 'rich' && mount.spec !== undefined) {
      mount.root.render(
        createElement(RenderBoundary, {
          onFailure: integrity,
          children: createElement(RichResponse, { ...common, spec: mount.spec, parsedSpec: mount.spec })
        })
      );
      return;
    }
    const error = mount.mode === 'resolving' ? 'Resolving reference...' : (mount.error ?? 'Invalid document');
    mount.root.render(createElement(Diagnostic, { key: error + ':' + mount.raw, error, source: mount.raw }));
  };

  /** Paint once per distinct tree identity; repeated scans stay free. */
  const paintIfNeeded = (mount: Mount, facts: RowFacts | undefined): void => {
    const key = mount.mode + '|' + mount.raw + '|' + (mount.error ?? '') + '|' + (mount.ref ?? '') + '|' + (facts?.finality ?? '');
    if (mount.renderedKey === key) return;
    mount.renderedKey = key;
    paint(mount, facts);
  };

  /**
   * Keep the container directly after the source and hide the source. A host
   * reconciler that keeps deleting our container marks the row unstable instead
   * of starting an insert/remove fight.
   * @returns false when the mount must be dropped.
   */
  const ensurePlacement = (source: HTMLElement, mount: Mount): boolean => {
    if (source.nextSibling !== mount.container) {
      if (!source.isConnected) return false;
      mount.reinserts += 1;
      if (mount.reinserts > 3) {
        const row = rowOf(source);
        if (row !== null) unstableRows.add(row);
        return false;
      }
      source.after(mount.container);
    }
    if (!source.hidden) source.hidden = true;
    if (mount.container.hidden) mount.container.hidden = false;
    return true;
  };

  /**
   * Evaluate the claim for one row and reconcile its mount.
   * @param row - row element to evaluate.
   * @param force - ignore the cached signature (chat/session state changed).
   */
  const evaluateRow = (row: HTMLElement, force = false): void => {
    if (disposed || !row.isConnected) return;
    if (unstableRows.has(row)) return;
    if (row.getAttribute('data-chat-flow-kind') !== ANSWER_ROW) {
      for (const source of surfacesOf(row)) {
        const mount = mounts.get(source);
        if (mount !== undefined) remove(source, mount);
      }
      knownRows.delete(row);
      return;
    }
    const surfaces = surfacesOf(row);
    if (surfaces.length === 0) {
      knownRows.delete(row);
      return;
    }
    knownRows.add(row);
    const signature = rowSignature(row);
    if (!force && rowSignatures.get(row) === signature) {
      // Nothing changed since the last evaluation; only repair placement.
      for (const source of surfaces) {
        const mount = mounts.get(source);
        if (mount !== undefined && !ensurePlacement(source, mount)) remove(source, mount);
      }
      return;
    }
    rowSignatures.set(row, signature);

    for (const source of surfaces) {
      const body = source.querySelector('pre') ?? source.querySelector('[data-code-block-content]');
      if (body === null) {
        const stale = mounts.get(source);
        if (stale !== undefined) remove(source, stale);
        continue;
      }
      const raw = body.textContent ?? '';
      const facts = deps.chat.factsForRow(row, raw);
      const claim = claimFence(source, body, raw);
      const mount = mounts.get(source);
      const streaming = facts !== undefined ? facts.finality === 'streaming-final' : isStreamingDom(source);
      // Settled-only by default: a streaming row keeps its native code until it settles.
      const claimable = claim !== null
        && !(facts !== undefined && facts.fenceLocation === 'reasoning')
        && !(facts !== undefined && facts.finality === 'not-final')
        && !(facts !== undefined && facts.finality === 'streaming-final' && facts.fenceLocation !== 'text')
        && !(streaming && !previewAllowed);
      if (!claimable || claim === null) {
        if (mount !== undefined) remove(source, mount);
        continue;
      }
      const owner = fenceOwnerKey(source, row);
      const nextMode: Mount['mode'] = claim.kind === 'spec' ? 'rich' : claim.kind === 'ref' ? 'resolving' : 'diagnostic';
      const nextRef = claim.kind === 'ref' ? claim.ref : undefined;
      // Same fence, new content: update in place instead of replacing the root.
      if (
        mount !== undefined
        && !mount.failed
        && mount.sessionId === sessionId
        && mount.owner === owner
        && mount.ref === nextRef
        && mount.mode !== 'resolving'
      ) {
        mount.raw = raw;
        mount.streaming = streaming;
        mount.error = claim.kind === 'invalid' ? claim.error : undefined;
        mount.spec = claim.kind === 'spec' ? claim.spec : mount.spec;
        if (!ensurePlacement(source, mount)) {
          remove(source, mount);
          continue;
        }
        paintIfNeeded(mount, facts);
        continue;
      }
      if (mount !== undefined) remove(source, mount);
      if (mounts.size >= maxMounts) continue;
      const container = document.createElement('div');
      container.setAttribute(DOM_MARKERS.root, '');
      const root = createRoot(container);
      const next: Mount = {
        source,
        container,
        root,
        raw,
        sourceHidden: source.hidden,
        streaming,
        mode: nextMode,
        ref: nextRef,
        spec: claim.kind === 'spec' ? claim.spec : undefined,
        error: claim.kind === 'invalid' ? claim.error : undefined,
        sessionId,
        owner,
        reinserts: 0
      };
      mounts.set(source, next);
      source.after(container);
      source.hidden = true;
      if (nextMode === 'rich' || nextMode === 'diagnostic') {
        paintIfNeeded(next, facts);
        continue;
      }
      // Reference fence: resolve from the session log first, then the host route.
      const referenceId = next.ref ?? '';
      const immediate = deps.artifacts.sync(sessionId, referenceId);
      if (immediate !== undefined) {
        applyResolution(next, immediate);
        continue;
      }
      paintIfNeeded(next, facts);
      void deps.artifacts.resolve(sessionId, referenceId).then((resolved) => {
        if (disposed || mounts.get(source) !== next) return;
        applyResolution(next, resolved);
      });
    }
  };

  const applyResolution = (mount: Mount, resolved: ResolvedArtifact): void => {
    if (resolved.status === 'resolved' && resolved.spec !== undefined) {
      mount.mode = 'rich';
      mount.spec = resolved.spec;
      mount.container.hidden = false;
      mount.renderedKey = undefined;
      paintIfNeeded(mount, undefined);
      return;
    }
    mount.mode = 'diagnostic';
    mount.error = 'Unresolved rich-msg reference: ' + (resolved.id || 'missing id');
    mount.container.hidden = false;
    mount.renderedKey = undefined;
    paintIfNeeded(mount, undefined);
  };

  /** Collect rows touched by one batch of host mutations. */
  const rowsFromRecords = (records: MutationRecord[]): { rows: Set<HTMLElement>; full: boolean } => {
    const rows = new Set<HTMLElement>();
    let full = false;
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target === null) {
        full = true;
        continue;
      }
      if (target.closest(OWN) !== null) continue;
      const row = target.closest<HTMLElement>('[data-chat-flow-kind]');
      if (row !== null) rows.add(row);
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (!(node instanceof Element)) continue;
        if (node.matches(OWN) || node.closest(OWN) !== null) continue;
        const addedRow = node.closest?.<HTMLElement>('[data-chat-flow-kind]');
        if (addedRow !== null && addedRow !== undefined) rows.add(addedRow);
        for (const nested of node.querySelectorAll?.('[data-chat-flow-kind]') ?? []) {
          if (nested instanceof HTMLElement) rows.add(nested);
        }
      }
      // A code surface added or removed means the row's candidate set changed.
      if (record.type === 'childList' || record.type === 'characterData') {
        const owner = target.closest<HTMLElement>('[data-chat-flow-kind]');
        if (owner !== null) rows.add(owner);
      }
    }
    return { rows, full };
  };

  /** Coalesce one flush onto a microtask; no timers and no frame loop. */
  const schedule = (rows?: Iterable<HTMLElement>, full = false): void => {
    if (disposed) return;
    if (full) fullRescan = true;
    if (rows !== undefined) for (const row of rows) pendingRows.add(row);
    if (flushPending) return;
    flushPending = true;
    queueMicrotask(() => {
      flushPending = false;
      if (disposed) return;
      flush();
    });
  };

  /** Apply one coalesced batch: known rows, touched rows, session resets. */
  const flush = (): void => {
    if (disposed) return;
    const nextSession = deps.chat.sessionId();
    if (nextSession !== sessionId) {
      sessionId = nextSession;
      fullRescan = true;
    }
    if (fullRescan) {
      fullRescan = false;
      for (const [source, mount] of mounts) remove(source, mount);
      knownRows.clear();
      rowSignatures.clear();
      // Discover rows without touching unrelated DOM: only candidate surfaces matter.
      const rows = new Set<HTMLElement>();
      for (const surface of scope.querySelectorAll<HTMLElement>(SURFACES)) {
        if (surface.closest(OWN) !== null) continue;
        const row = rowOf(surface);
        if (row !== null) rows.add(row);
      }
      for (const row of rows) evaluateRow(row, true);
      return;
    }
    for (const row of pendingRows) {
      if (!row.isConnected) {
        knownRows.delete(row);
        continue;
      }
      evaluateRow(row);
    }
    pendingRows = new Set();
    // A session switch or a host-side row replacement can strand mounts.
    for (const [source, mount] of mounts) {
      if (!source.isConnected || !mount.container.isConnected) remove(source, mount);
    }
    void knownRows;
  };

  /** Ask the chat snapshot for the rows it can still verify after an update. */
  const onChatChange = (): void => {
    if (disposed) return;
    const nextSession = deps.chat.sessionId();
    const rows = new Set<HTMLElement>();
    for (const row of knownRows) {
      if (row.isConnected) rows.add(row);
    }
    // Finality can change without a DOM mutation (a later tool call appears),
    // so the chat signal forces re-evaluation of the rows we already know.
    if (nextSession !== sessionId) {
      schedule(rows, true);
      return;
    }
    if (rows.size === 0) return;
    if (flushPending) return;
    flushPending = true;
    queueMicrotask(() => {
      flushPending = false;
      if (disposed) return;
      for (const row of rows) if (row.isConnected) evaluateRow(row, true);
      for (const [source, mount] of mounts) {
        if (!source.isConnected || !mount.container.isConnected) remove(source, mount);
      }
    });
  };

  const observer = new MutationObserver((records) => {
    if (disposed) return;
    const { rows, full } = rowsFromRecords(records);
    if (full || rows.size > 0) schedule(rows, full);
  });
  observer.observe(scope, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-streaming', 'data-chat-node-key', 'data-chat-anchor-key', 'data-chat-flow-kind']
  });

  const onVisibility = (): void => {
    if (disposed) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    schedule(undefined, true);
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  const unsubscribeChat = deps.chat.subscribe(onChatChange);
  // First pass is synchronous so a static transcript is renderable immediately.
  sessionId = deps.chat.sessionId();
  fullRescan = true;
  flush();

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    unsubscribeChat();
    observer.disconnect();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    for (const [source, mount] of mounts) remove(source, mount);
    knownRows.clear();
    rowSignatures.clear();
    pendingRows = new Set();
    if (activeScopeRenderer !== undefined && activeScopeRenderer.dispose === dispose) {
      activeScopeRenderer = undefined;
    }
  };
  activeScopeRenderer = { scope, dispose };
  return dispose;
}

/** The single live renderer for one document scope. */
let activeScopeRenderer: { scope: HTMLElement; dispose: () => void } | undefined;

/** Stable persistence identity for one mounted block. */
function persistenceKeyOf(mount: Mount, facts: RowFacts | undefined): string {
  if (mount.sessionId === undefined) return JSON.stringify(['dsh-rich-msg', mount.owner ?? '', mount.ref ?? '']);
  const tag = facts === undefined ? 'no-facts' : facts.finality + '|' + facts.fenceLocation;
  return JSON.stringify(['dsh-rich-msg', mount.sessionId, mount.owner ?? '', tag, mount.ref ?? '']);
}

/** Re-exported for tests: the pure fence claim decision. */
export const __test__ = { claimFence, fenceLabel, looksLikeDocument, labelToken, isOurs };
