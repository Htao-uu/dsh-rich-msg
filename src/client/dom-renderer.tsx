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
 * What makes this adapter different from a naive \``\`` scanner:
 *
 *   - a fence is claimed only inside an assistant row of the **final** answer.
 *     The chat snapshot decides this: intermediate steps that precede another
 *     tool call are never claimed, and a streaming step loses its preview the
 *     moment a later tool call makes it intermediate;
 *   - a fence that belongs to a reasoning block is never claimed, even though
 *     reasoning renders in the same row;
 *   - a fence in a normal code block, an ordinary JSON block, a tool row or a
 *     different fence language is left exactly as the host rendered it;
 *   - every DOM mutation stays additive: the host's own elements are hidden
 *     with the \`hidden\` attribute only, and restored on unload or removal.
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
    if (isOurs(labelToken(fenceLabel(source, body)))) return { kind: 'invalid', error: 'Document is longer than ' + MAX_SOURCE_LENGTH + ' characters' };
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

/** Fingerprint of the facts that decide whether a mount can be reused. */
function factsTag(facts: RowFacts | undefined): string {
  if (facts === undefined) return 'no-facts';
  return facts.finality + '|' + facts.fenceLocation;
}

/**
 * Install the fence renderer over one document scope.
 * @param deps - chat snapshot, artifact resolver and action delivery.
 * @param scope - DOM scope observed for code surfaces; defaults to body.
 * @returns the disposer: unmounts every root and restores every source block.
 */
export function installFenceRenderer(deps: FenceRendererDeps, scope: HTMLElement = document.body): () => void {
  const mounts = new Map<HTMLElement, Mount>();
  let disposed = false;
  let scheduled = false;

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
    const sessionId = mount.sessionId;
    const onAction = (action: string, payload?: Record<string, unknown>): void => {
      deps.sendAction(sessionId, action, payload);
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

  const claimFor = (source: HTMLElement, body: HTMLElement, raw: string, row: HTMLElement): { claim: Claim; facts: RowFacts | undefined; streaming: boolean } => {
    const facts = deps.chat.factsForRow(row, raw);
    const claim = claimFence(source, body, raw);
    if (claim === null) return { claim: null, facts, streaming: false };
    if (facts !== undefined) {
      // Reasoning never renders rich content, and intermediate steps are not answers.
      if (facts.fenceLocation === 'reasoning') return { claim: null, facts, streaming: false };
      if (facts.finality === 'not-final') return { claim: null, facts, streaming: false };
      // During streaming the text can lag the DOM; only claim blocks already in a text block.
      if (facts.finality === 'streaming-final' && facts.fenceLocation !== 'text') return { claim: null, facts, streaming: false };
      return { claim, facts, streaming: facts.finality === 'streaming-final' };
    }
    // Fallback without a readable snapshot: settled rows only, never a live stream.
    if (isStreamingDom(source)) return { claim: null, facts, streaming: false };
    return { claim, facts, streaming: false };
  };

  const scan = (): void => {
    scheduled = false;
    if (disposed) return;
    for (const [source, mount] of mounts) {
      if (!scope.contains(source)) remove(source, mount);
    }
    const candidates = new Set<HTMLElement>(scope.querySelectorAll<HTMLElement>(SURFACES));
    for (const body of scope.querySelectorAll<HTMLElement>('[data-code-block-content]')) {
      if (body.parentElement !== null) candidates.add(body.parentElement);
    }
    const sessionId = deps.chat.sessionId();
    for (const source of candidates) {
      if (source.closest(OWN)) continue;
      const row = rowOf(source);
      const body = source.querySelector('pre') ?? source.querySelector('[data-code-block-content]');
      if (row === null || body === null || row.getAttribute('data-chat-flow-kind') !== ANSWER_ROW) {
        const mount = mounts.get(source);
        if (mount !== undefined) remove(source, mount);
        continue;
      }
      const raw = body.textContent ?? '';
      const evaluated = claimFor(source, body, raw, row);
      const mount = mounts.get(source);
      if (evaluated.claim === null) {
        if (mount !== undefined) remove(source, mount);
        continue;
      }
      if (mount !== undefined && mount.sessionId !== sessionId) {
        remove(source, mount);
      }
      const existing = mounts.get(source);
      const owner = fenceOwnerKey(source, row);
      const mode: Mount['mode'] = evaluated.claim.kind === 'spec' ? 'rich' : evaluated.claim.kind === 'ref' ? 'resolving' : 'diagnostic';
      const ref = evaluated.claim.kind === 'ref' ? evaluated.claim.ref : undefined;
      if (
        existing !== undefined &&
        !existing.failed &&
        existing.raw === raw &&
        existing.sessionId === sessionId &&
        existing.streaming === evaluated.streaming &&
        existing.owner === owner &&
        existing.ref === ref &&
        existing.mode === mode
      ) {
        if (source.nextSibling !== existing.container) source.after(existing.container);
        if (!source.hidden) {
          existing.container.hidden = true;
          source.hidden = true;
        }
        continue;
      }
      if (existing !== undefined) remove(source, existing);
      // An unfinished stream keeps native code until the block is claimable.
      if (evaluated.streaming && evaluated.claim.kind === 'invalid') continue;

      const container = document.createElement('div');
      container.setAttribute(DOM_MARKERS.root, '');
      const root = createRoot(container);
      const next: Mount = {
        source,
        container,
        root,
        raw,
        sourceHidden: source.hidden,
        streaming: evaluated.streaming,
        mode,
        ref,
        spec: evaluated.claim.kind === 'spec' ? evaluated.claim.spec : undefined,
        error: evaluated.claim.kind === 'invalid' ? evaluated.claim.error : undefined,
        sessionId,
        owner
      };
      mounts.set(source, next);
      source.after(container);
      source.hidden = true;
      if (mode === 'rich') {
        paint(next, evaluated.facts);
        continue;
      }
      if (mode === 'diagnostic') {
        paint(next, evaluated.facts);
        continue;
      }
      // Reference fences resolve synchronously from the session log in the common case.
      const referenceId = next.ref ?? '';
      const immediate = deps.artifacts.sync(sessionId, referenceId);
      if (immediate !== undefined) {
        applyResolution(next, immediate);
        continue;
      }
      paint(next, evaluated.facts);
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
      paint(mount, undefined);
      return;
    }
    mount.mode = 'diagnostic';
    mount.error = 'Unresolved rich-msg reference: ' + (resolved.id || 'missing id');
    mount.container.hidden = false;
    paint(mount, undefined);
  };

  const schedule = (): void => {
    if (scheduled || disposed) return;
    scheduled = true;
    if (scope.querySelector('[data-streaming]') !== null && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(scan);
    } else {
      queueMicrotask(scan);
    }
  };

  const observer = new MutationObserver((records) => {
    if (records.every((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target?.closest(OWN) !== null && target?.closest(OWN) !== undefined;
    })) {
      return;
    }
    schedule();
  });
  observer.observe(scope, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-streaming', 'hidden', 'data-chat-node-key', 'data-chat-anchor-key', 'data-chat-flow-kind']
  });
  const unsubscribeFacts = deps.chat.subscribe(schedule);
  scan();

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribeFacts();
    observer.disconnect();
    for (const [source, mount] of mounts) remove(source, mount);
  };
}

/** Stable persistence identity for one mounted block. */
function persistenceKeyOf(mount: Mount, facts: RowFacts | undefined): string | undefined {
  if (mount.sessionId === undefined) return undefined;
  const tag = factsTag(facts);
  return JSON.stringify(['dsh-rich-msg', mount.sessionId, mount.owner ?? '', tag, mount.ref ?? '']);
}

/** Re-exported for tests: the pure fence claim decision. */
export const __test__ = { claimFence, fenceLabel, looksLikeDocument, labelToken, isOurs };
