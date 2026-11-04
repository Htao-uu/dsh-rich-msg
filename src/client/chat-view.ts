/**
 * Read-only adapter over the DSH chat conversation data.
 *
 * The fence renderer needs more than DOM ancestry to decide whether a code
 * block is part of the final assistant answer:
 *
 *   - an assistant step exists for every model step, including the narration
 *     that precedes a tool call, so "inside assistant-step" is not enough;
 *   - reasoning is rendered by the same assistant row, so a fence written in a
 *     reasoning block would otherwise be claimed as an answer;
 *   - a stored reference must resolve to the tool call that produced it.
 *
 * This module reads the Chat target snapshot published by
 * `@deepseek-ai/dsh-client-ui-chat` through the `uiConversation` service. It
 * never writes to the conversation and it degrades to `undefined` when the
 * service or the target is unavailable, leaving the renderer on its documented
 * DOM-only fallback.
 *
 * @module dsh-rich-msg/client/chat-view
 */
import { ARTIFACT_ID_PATTERN } from '../shared/protocol.ts';
import { parseDocumentText } from '../shared/document.ts';
import type { RichSpec } from '../core/schema.ts';

/** Minimal observable-source shape used by the conversation services. */
interface Source<T> {
  getSnapshot(): T;
  subscribe?(listener: () => void): () => void;
}

/** Structural subset of the Session controller client face. */
export interface SessionsLike {
  list?: Source<{ ids: readonly string[] }>;
  retainInfo?(id: string): Source<{ retainedBy?: { mainView?: number } }>;
  scope?(id: string): { get?(name: string): unknown } | undefined;
}

/** One assistant content block as projected for the chat target. */
interface AssistantBlockLike {
  readonly kind?: string;
  readonly text?: string;
}

/** One chat node as published by the chat target. */
export interface ChatNodeLike {
  readonly key: string;
  readonly kind: string;
  readonly anchorSeq: number;
  readonly location?: {
    readonly kind?: string;
    readonly turn?: { readonly turn?: number };
    readonly step?: { readonly step?: number };
  };
  readonly data?: Record<string, unknown>;
}

/** Structural subset of the chat snapshot this module reads. */
export interface ChatSnapshotLike {
  readonly nodes?: {
    get?(key: string): ChatNodeLike | undefined;
    values?(): readonly ChatNodeLike[];
  };
}

/** Structural subset of the uiConversation service. */
export interface UiConversationLike {
  binding?(sessionId: string): {
    target?(name: string): Source<unknown> | undefined;
  } | undefined;
}

/** How a stored reference was resolved. */
export interface ChatArtifact {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly spec?: RichSpec;
}

/** Everything the renderer needs to know about one assistant row. */
export interface RowFacts {
  /** Chat node key when the row maps to one; null for a non-chat surface. */
  readonly key: string | null;
  readonly kind: string | null;
  readonly turn: number | null;
  /** final = settled closing answer; streaming-final = closing answer still growing; not-final = intermediate. */
  readonly finality: 'final' | 'streaming-final' | 'not-final';
  /** Whether the fence text belongs to a text block, a reasoning block, or neither. */
  readonly fenceLocation: 'text' | 'reasoning' | 'unknown';
  /** Artifacts published by tool calls in this turn, keyed by reference id. */
  readonly artifacts: ReadonlyMap<string, ChatArtifact>;
}

/** Normalize markdown text for containment checks. */
function normalize(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

/** Read one service from a cordis face, tolerating either access style. */
function readService<T>(face: unknown, name: string): T | undefined {
  if (face === null || face === undefined) return undefined;
  const record = face as Record<string, unknown> & { get?(key: string): unknown };
  const direct = record[name];
  if (direct !== undefined) return direct as T;
  if (typeof record.get === 'function') {
    try {
      return record.get(name) as T | undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Read the id of the session the main view is showing. */
export function viewedSessionId(sessions: SessionsLike | undefined): string | undefined {
  const list = sessions?.list;
  if (list === undefined || typeof list.getSnapshot !== 'function') return undefined;
  let ids: readonly string[] = [];
  try {
    ids = list.getSnapshot()?.ids ?? [];
  } catch {
    return undefined;
  }
  for (const id of ids) {
    try {
      const retained = sessions?.retainInfo?.(id)?.getSnapshot()?.retainedBy?.mainView ?? 0;
      if (retained > 0) return id;
    } catch {
      /* A broken binding is simply not the viewed session. */
    }
  }
  return undefined;
}

/** Collect text of every text content block in a tool result payload. */
function resultText(root: Record<string, unknown>): string {
  const content = root.content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.join('');
}

/** Read the raw argument text of a tool call through any available reader. */
function toolDocument(root: Record<string, unknown>): string | undefined {
  const args = root.args as { text?(key: string): string | undefined } | undefined;
  if (args !== undefined && typeof args.text === 'function') {
    try {
      const document = args.text('document');
      if (typeof document === 'string') return document;
    } catch {
      /* Fall through to the raw argument text. */
    }
  }
  const call = root.call as { argsRaw?: unknown } | null | undefined;
  const raw = call?.argsRaw;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1_000_000) return undefined;
  try {
    const parsed = JSON.parse(raw) as { document?: unknown };
    return typeof parsed?.document === 'string' ? parsed.document : undefined;
  } catch {
    return undefined;
  }
}

/** Read the empty shell of the chat target for one session. */
export class ChatView {
  private readonly getSessions: () => SessionsLike | undefined;
  private readonly getUiConversation: () => UiConversationLike | undefined;
  private readonly artifactCache = new Map<string, { signature: unknown; artifacts: Map<string, ChatArtifact> }>();
  private readonly listeners = new Set<() => void>();
  private unsubscribes = new Map<string, () => void>();

  constructor(deps: {
    getSessions: () => SessionsLike | undefined;
    getUiConversation: () => UiConversationLike | undefined;
  }) {
    this.getSessions = deps.getSessions;
    this.getUiConversation = deps.getUiConversation;
  }

  /** Session id currently shown by the main view. */
  sessionId(): string | undefined {
    return viewedSessionId(this.getSessions());
  }

  /** Subscribe to chat snapshots; returns the disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Notify subscribers (used when the optional service appears). */
  notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        /* One listener must not break the rest. */
      }
    }
  }

  /** Read the chat snapshot for one session, when the target is available. */
  snapshot(sessionId: string): ChatSnapshotLike | undefined {
    const uiConversation = this.getUiConversation();
    if (uiConversation === undefined) return undefined;
    try {
      const binding = uiConversation.binding?.(sessionId);
      const source = binding?.target?.('chat');
      const snapshot = source?.getSnapshot?.();
      if (snapshot !== null && typeof snapshot === 'object') {
        // Subscribe once per session so streaming updates retrigger verification.
        if (!this.unsubscribes.has(sessionId) && typeof source?.subscribe === 'function') {
          const unsubscribe = source.subscribe(() => this.notify());
          this.unsubscribes.set(sessionId, unsubscribe);
        }
        return snapshot as ChatSnapshotLike;
      }
    } catch {
      /* A missing chat target means the DOM fallback applies. */
    }
    return undefined;
  }

  /** Drop per-session subscriptions (plugin unload). */
  dispose(): void {
    for (const unsubscribe of this.unsubscribes.values()) {
      try {
        unsubscribe();
      } catch {
        /* ignore */
      }
    }
    this.unsubscribes.clear();
    this.artifactCache.clear();
    this.listeners.clear();
  }

  /** All chat nodes of a snapshot, in no guaranteed order. */
  private nodesOf(snapshot: ChatSnapshotLike): readonly ChatNodeLike[] {
    try {
      const values = snapshot.nodes?.values?.();
      if (Array.isArray(values)) return values;
      return [];
    } catch {
      return [];
    }
  }

  /** Node key of one DOM row, if the row carries it. */
  static rowKey(row: HTMLElement): string | null {
    const key = row.getAttribute('data-chat-node-key') ?? row.getAttribute('data-chat-anchor-key');
    return key === null || key === '' ? null : key;
  }

  /**
   * Facts about one rendered assistant row.
   * @param row - the row element that owns the fence.
   * @param raw - fence source text, used to tell text from reasoning blocks.
   * @returns facts, or undefined when the snapshot cannot be read.
   */
  factsForRow(row: HTMLElement, raw: string): RowFacts | undefined {
    const sessionId = this.sessionId();
    if (sessionId === undefined) return undefined;
    const snapshot = this.snapshot(sessionId);
    if (snapshot === undefined) return undefined;
    const key = ChatView.rowKey(row);
    if (key === null) return undefined;
    const node = snapshot.nodes?.get?.(key);
    if (node === undefined || node.kind !== 'assistant-step') return undefined;
    const data = node.data ?? {};
    const blocks = Array.isArray(data.blocks) ? (data.blocks as readonly AssistantBlockLike[]) : [];
    const probe = normalize(raw);
    const inText = probe !== '' && blocks.some((block) => block.kind === 'text' && typeof block.text === 'string' && normalize(block.text).includes(probe));
    const inReasoning = probe !== '' && blocks.some((block) => block.kind === 'reasoning' && typeof block.text === 'string' && normalize(block.text).includes(probe));
    const fenceLocation = inText ? 'text' : inReasoning ? 'reasoning' : 'unknown';
    const turn = typeof data.turn === 'number' ? data.turn : (turnOf(node) ?? null);
    return {
      key,
      kind: node.kind,
      turn,
      finality: this.finalityOf(node, snapshot),
      fenceLocation,
      artifacts: this.artifactsOf(snapshot)
    };
  }

  /** Whether one assistant node is the closing answer of its turn. */
  private finalityOf(node: ChatNodeLike, snapshot: ChatSnapshotLike): RowFacts['finality'] {
    const all = this.nodesOf(snapshot);
    const turn = turnOf(node);
    const assistants = all
      .filter((candidate) => candidate.kind === 'assistant-step' && turnOf(candidate) === turn)
      .sort((left, right) => (left.anchorSeq ?? 0) - (right.anchorSeq ?? 0));
    const last = assistants[assistants.length - 1];
    if (last === undefined || last.key !== node.key) return 'not-final';
    const anchor = node.anchorSeq ?? 0;
    const hasLaterTool = all.some(
      (candidate) => candidate.kind === 'tool-call' && turnOf(candidate) === turn && (candidate.anchorSeq ?? 0) > anchor
    );
    if (hasLaterTool) return 'not-final';
    const status = (node.data as { status?: unknown } | undefined)?.status;
    return status === 'running' ? 'streaming-final' : 'final';
  }

  /** Artifacts published by tool calls recorded in the loaded window. */
  artifactsOf(snapshot: ChatSnapshotLike): ReadonlyMap<string, ChatArtifact> {
    const signature = snapshot as unknown;
    const cached = this.artifactCache.get(signatureKey(snapshot));
    if (cached !== undefined && cached.signature === signature) return cached.artifacts;
    const artifacts = new Map<string, ChatArtifact>();
    for (const node of this.nodesOf(snapshot)) {
      if (node.kind !== 'tool-call') continue;
      const root = node.data?.root as Record<string, unknown> | undefined;
      if (root === undefined || root.kind !== 'tool-result' || root.isError === true) continue;
      let parsed: { ok?: unknown; id?: unknown; kind?: unknown; summary?: unknown } | undefined;
      try {
        const text = resultText(root);
        if (text === '' || text.length > 4096) continue;
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        continue;
      }
      if (parsed === undefined || parsed.ok !== true || typeof parsed.id !== 'string' || !ARTIFACT_ID_PATTERN.test(parsed.id)) continue;
      const document = toolDocument(root);
      let spec: RichSpec | undefined;
      if (document !== undefined) {
        try {
          spec = parseDocumentText(document);
        } catch {
          spec = undefined;
        }
      }
      artifacts.set(parsed.id, {
        id: parsed.id,
        kind: typeof parsed.kind === 'string' ? parsed.kind : 'document',
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        spec
      });
    }
    const mapKey = signatureKey(snapshot);
    this.artifactCache.set(mapKey, { signature, artifacts });
    if (this.artifactCache.size > 8) {
      const oldest = this.artifactCache.keys().next().value;
      if (oldest !== undefined && oldest !== mapKey) this.artifactCache.delete(mapKey);
    }
    return artifacts;
  }
}

/** Extract the turn number of one node from its data or location. */
function turnOf(node: ChatNodeLike): number | undefined {
  const dataTurn = (node.data as { turn?: unknown } | undefined)?.turn;
  if (typeof dataTurn === 'number') return dataTurn;
  const location = node.location;
  if (location !== undefined && location !== null) {
    if (location.kind === 'turn' && typeof location.turn?.turn === 'number') return location.turn.turn;
    if (location.kind === 'step' && typeof location.turn?.turn === 'number') return location.turn.turn;
  }
  return undefined;
}

/** Stable cache key for a snapshot object. */
let snapshotCounter = 0;
const snapshotKeys = new WeakMap<object, string>();
function signatureKey(snapshot: ChatSnapshotLike): string {
  const target = snapshot as unknown as object;
  const existing = snapshotKeys.get(target);
  if (existing !== undefined) return existing;
  snapshotCounter += 1;
  const key = 'snapshot-' + snapshotCounter;
  snapshotKeys.set(target, key);
  return key;
}

/** Convenience accessor used by the plugin entry. */
export function readUiConversation(face: unknown): UiConversationLike | undefined {
  return readService<UiConversationLike>(face, 'uiConversation');
}

/** Convenience accessor used by the plugin entry. */
export function readSessions(face: unknown): SessionsLike | undefined {
  return readService<SessionsLike>(face, 'sessions');
}
