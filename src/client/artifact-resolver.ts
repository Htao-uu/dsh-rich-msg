/**
 * Reference resolution for \`{"version":1,"ref":"<id>"}\` fences.
 *
 * Order of resolution:
 *   1. the loaded chat snapshot: the publication tool result carries the id and
 *      the tool call arguments carry the document itself. This path is durable
 *      (it is part of the session log) and needs no host call;
 *   2. the host read route \`/rich-msg/artifact/<id>?session=<id>\`, which
 *      answers from the in-memory session store when the tool result was
 *      compacted away or the tool call left the loaded window;
 *   3. a typed \`missing\` result, rendered as a diagnostic instead of silently
 *      showing nothing.
 *
 * A reference is only ever resolved for the session currently on screen, so a
 * foreign artifact id resolves to \`missing\` rather than crossing sessions.
 *
 * @module dsh-rich-msg/client/artifact-resolver
 */
import { ARTIFACT_ROUTE_PREFIX, ARTIFACT_ID_PATTERN } from '../shared/protocol.ts';
import { parseDocumentText } from '../shared/document.ts';
import type { RichSpec } from '../core/schema.ts';
import type { ChatView } from './chat-view.ts';

/** One resolution attempt. */
export interface ResolvedArtifact {
  readonly status: 'resolved' | 'missing';
  readonly id: string;
  readonly spec?: RichSpec;
  readonly kind: string;
  readonly summary: string;
  readonly via: 'session' | 'route' | 'none';
}

/** Bounded fetch with a timeout; failures degrade to a missing result. */
async function fetchArtifact(base: string, id: string, sessionId: string, signal: AbortSignal): Promise<ResolvedArtifact> {
  const url = base.replace(/\/$/, '') + ARTIFACT_ROUTE_PREFIX + '/' + encodeURIComponent(id) + '?session=' + encodeURIComponent(sessionId);
  const response = await fetch(url, { method: 'GET', credentials: 'same-origin', signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('artifact route answered ' + response.status);
  const payload = (await response.json()) as { ok?: unknown; spec?: unknown; kind?: unknown; summary?: unknown };
  if (payload === null || typeof payload !== 'object' || payload.ok !== true) throw new Error('artifact route rejected the request');
  const spec = parseDocumentText(JSON.stringify(payload.spec));
  return {
    status: 'resolved',
    id,
    spec,
    kind: typeof payload.kind === 'string' ? payload.kind : 'document',
    summary: typeof payload.summary === 'string' ? payload.summary : '',
    via: 'route'
  };
}

/** Cache of resolved artifacts, keyed by session + id. */
export class ArtifactResolver {
  private readonly chat: ChatView;
  private readonly cache = new Map<string, ResolvedArtifact>();
  private readonly pending = new Map<string, Promise<ResolvedArtifact>>();
  private readonly getOrigin: () => string;

  constructor(deps: { chat: ChatView; getOrigin?: () => string }) {
    this.chat = deps.chat;
    this.getOrigin = deps.getOrigin ?? (() => (typeof location === 'undefined' ? '' : location.origin));
  }

  /** Synchronous session-log lookup; returns undefined when the id is not in the loaded window. */
  sync(sessionId: string | undefined, id: string): ResolvedArtifact | undefined {
    if (sessionId === undefined) return undefined;
    const cacheKey = sessionId + '\u0000' + id;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;
    if (!ARTIFACT_ID_PATTERN.test(id)) return { status: 'missing', id, kind: 'unknown', summary: '', via: 'none' };
    const snapshot = this.chat.snapshot(sessionId);
    if (snapshot === undefined) return undefined;
    const artifact = this.chat.artifactsOf(snapshot).get(id);
    if (artifact === undefined || artifact.spec === undefined) return undefined;
    const resolved: ResolvedArtifact = {
      status: 'resolved',
      id,
      spec: artifact.spec,
      kind: artifact.kind,
      summary: artifact.summary,
      via: 'session'
    };
    this.cache.set(cacheKey, resolved);
    return resolved;
  }

  /** Async resolution with the host route fallback. */
  async resolve(sessionId: string | undefined, id: string): Promise<ResolvedArtifact> {
    const local = this.sync(sessionId, id);
    if (local !== undefined) return local;
    if (sessionId === undefined || !ARTIFACT_ID_PATTERN.test(id)) {
      return { status: 'missing', id, kind: 'unknown', summary: '', via: 'none' };
    }
    const cacheKey = sessionId + '\u0000' + id;
    const inflight = this.pending.get(cacheKey);
    if (inflight !== undefined) return inflight;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const task = fetchArtifact(this.getOrigin(), id, sessionId, controller.signal)
      .catch((): ResolvedArtifact => ({ status: 'missing', id, kind: 'unknown', summary: '', via: 'none' }))
      .then((result) => {
        this.cache.set(cacheKey, result);
        return result;
      })
      .finally(() => {
        clearTimeout(timer);
        this.pending.delete(cacheKey);
      });
    this.pending.set(cacheKey, task);
    return task;
  }

  /** Forget per-session resolutions (plugin unload). */
  dispose(): void {
    this.cache.clear();
    this.pending.clear();
  }
}
