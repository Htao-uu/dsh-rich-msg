/**
 * Session-scoped artifact store for dsh-rich-msg.
 *
 * The tool bridge needs a place where a tool call can park a validated rich
 * document and hand back a stable reference id. This store is that place.
 *
 * Design constraints, all enforced here:
 *   - every artifact belongs to exactly one session id; a lookup carrying a
 *     different session id is indistinguishable from a missing artifact;
 *   - memory is bounded per session and across sessions, with oldest-first
 *     eviction and a time-to-live bound;
 *   - nothing is ever written to disk, logged, or shared across sessions;
 *   - dispose() releases every artifact when the host plugin unloads.
 *
 * The durable source of truth for rendering is still the session log itself:
 * the browser half can rebuild the same mapping from recorded tool calls, so a
 * host restart degrades the reference route but does not lose history. See
 * docs/TOOL-BRIDGE.md.
 *
 * @module dsh-rich-msg/host/artifacts
 */
import { randomBytes } from 'node:crypto';
import type { RichSpec } from '../core/schema.ts';
import { MAX_SOURCE_LENGTH } from '../shared/protocol.ts';

/** Hard bounds applied by {@link ArtifactStore}. */
export interface ArtifactLimits {
  /** Stored artifacts kept per session; the oldest is evicted first. */
  readonly maxPerSession: number;
  /** Sessions with at least one artifact kept at once; the least recently used is dropped. */
  readonly maxSessions: number;
  /** Age after which an artifact is no longer served. */
  readonly ttlMs: number;
  /** Largest serialized document accepted into the store. */
  readonly maxDocumentBytes: number;
}

/** Default limits: small, bounded, and generous enough for a conversation. */
export const DEFAULT_ARTIFACT_LIMITS: ArtifactLimits = Object.freeze({
  maxPerSession: 64,
  maxSessions: 256,
  ttlMs: 6 * 60 * 60 * 1000,
  maxDocumentBytes: MAX_SOURCE_LENGTH
});

/** One stored document with the identity and display hints the UI needs. */
export interface StoredArtifact {
  readonly id: string;
  readonly sessionId: string;
  readonly createdAt: number;
  /** Last time the artifact was read; drives eviction order (store-internal). */
  lastAccessAt: number;
  /** Coarse document kind derived from the first node type. */
  readonly kind: string;
  /** One-line human summary derived from the document itself. */
  readonly summary: string;
  readonly spec: RichSpec;
}

/** Summary text derived from a validated document, bounded to one short line. */
export function describeSpec(spec: RichSpec): { kind: string; summary: string } {
  const first = spec.nodes[0];
  const kind = first === undefined ? 'document' : String(first.type);
  const title = typeof spec.title === 'string' && spec.title.trim() !== '' ? spec.title.trim() : '';
  if (title !== '') return { kind, summary: clip(title) };
  for (const node of spec.nodes) {
    if (node.type === 'text' && typeof node.content === 'string' && node.content.trim() !== '') {
      return { kind, summary: clip(node.content.trim()) };
    }
  }
  return { kind, summary: kind + ' document' };
}

/** Trim and bound one summary string. */
function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? flat.slice(0, 117) + '...' : flat;
}

/** Session-isolated, bounded, in-memory artifact store. */
export class ArtifactStore {
  readonly limits: ArtifactLimits;
  /** session id -> (artifact id -> artifact), in insertion order. */
  private readonly sessions = new Map<string, Map<string, StoredArtifact>>();
  private readonly sessionTouched = new Map<string, number>();
  private disposed = false;

  constructor(limits: Partial<ArtifactLimits> = {}) {
    this.limits = Object.freeze({ ...DEFAULT_ARTIFACT_LIMITS, ...sanitizeLimits(limits) });
  }

  /** Number of live artifacts, for diagnostics only (never content). */
  get size(): number {
    let total = 0;
    for (const artifacts of this.sessions.values()) total += artifacts.size;
    return total;
  }

  /**
   * Store one validated document.
   * @param sessionId - owning session; required and never inferred.
   * @param spec - validated rich document.
   * @param documentBytes - serialized size used for the size guard.
   * @returns the stored artifact, or null when the session budget refuses it.
   */
  publish(sessionId: string, spec: RichSpec, documentBytes: number): StoredArtifact | null {
    if (this.disposed || typeof sessionId !== 'string' || sessionId === '') return null;
    if (documentBytes > this.limits.maxDocumentBytes) return null;
    this.prune();
    let bucket = this.sessions.get(sessionId);
    if (bucket === undefined) {
      bucket = new Map();
      this.sessions.set(sessionId, bucket);
    }
    while (bucket.size >= this.limits.maxPerSession) {
      const oldest = bucket.keys().next().value;
      if (oldest === undefined) break;
      bucket.delete(oldest);
    }
    while (this.sessions.size > this.limits.maxSessions) {
      this.evictLeastRecentlyUsedSession(sessionId);
    }
    const now = Date.now();
    const { kind, summary } = describeSpec(spec);
    const artifact: StoredArtifact = {
      id: mintArtifactId(),
      sessionId,
      createdAt: now,
      lastAccessAt: now,
      kind,
      summary,
      spec
    };
    bucket.set(artifact.id, artifact);
    this.sessionTouched.set(sessionId, now);
    return artifact;
  }

  /**
   * Read one artifact for one session.
   * @param sessionId - caller's session; a foreign artifact answers undefined.
   * @param id - reference id from the fence.
   * @returns the artifact when it exists, belongs to the session and is fresh.
   */
  get(sessionId: string, id: string): StoredArtifact | undefined {
    if (this.disposed || typeof sessionId !== 'string' || typeof id !== 'string') return undefined;
    const bucket = this.sessions.get(sessionId);
    if (bucket === undefined) return undefined;
    const artifact = bucket.get(id);
    if (artifact === undefined) return undefined;
    if (Date.now() - artifact.createdAt > this.limits.ttlMs) {
      bucket.delete(id);
      if (bucket.size === 0) this.sessions.delete(sessionId);
      return undefined;
    }
    artifact.lastAccessAt = Date.now();
    this.sessionTouched.set(sessionId, artifact.lastAccessAt);
    return artifact;
  }

  /** Drop one session's artifacts (session close, tests, or explicit cleanup). */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.sessionTouched.delete(sessionId);
  }

  /** Drop expired artifacts; called on publish and read paths. */
  prune(now: number = Date.now()): void {
    for (const [sessionId, bucket] of this.sessions) {
      for (const [id, artifact] of bucket) {
        if (now - artifact.createdAt > this.limits.ttlMs) bucket.delete(id);
      }
      if (bucket.size === 0) {
        this.sessions.delete(sessionId);
        this.sessionTouched.delete(sessionId);
      }
    }
  }

  /** Release everything; the store refuses further work afterwards. */
  dispose(): void {
    this.disposed = true;
    this.sessions.clear();
    this.sessionTouched.clear();
  }

  /** Evict the least recently used session other than the one just touched. */
  private evictLeastRecentlyUsedSession(keep: string): void {
    let victim: string | undefined;
    let victimTime = Number.POSITIVE_INFINITY;
    for (const [sessionId, touched] of this.sessionTouched) {
      if (sessionId === keep) continue;
      if (touched < victimTime) {
        victim = sessionId;
        victimTime = touched;
      }
    }
    if (victim === undefined) {
      const first = this.sessions.keys().next().value;
      if (first === undefined || first === keep) return;
      victim = first;
    }
    this.clearSession(victim);
  }
}

/** Mint one reference id: `rm_` plus 20 lowercase hex characters. */
export function mintArtifactId(): string {
  return 'rm_' + randomBytes(10).toString('hex');
}

/** Keep caller-provided limits inside safe integer ranges. */
function sanitizeLimits(limits: Partial<ArtifactLimits>): Partial<ArtifactLimits> {
  const out: { -readonly [K in keyof ArtifactLimits]?: ArtifactLimits[K] } = {};
  const int = (value: unknown, min: number, max: number): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.min(max, Math.max(min, Math.trunc(value)));
  };
  const perSession = int(limits.maxPerSession, 1, 1000);
  if (perSession !== undefined) out.maxPerSession = perSession;
  const sessions = int(limits.maxSessions, 1, 10_000);
  if (sessions !== undefined) out.maxSessions = sessions;
  const ttl = int(limits.ttlMs, 1000, 7 * 24 * 60 * 60 * 1000);
  if (ttl !== undefined) out.ttlMs = ttl;
  const bytes = int(limits.maxDocumentBytes, 1024, 1024 * 1024);
  if (bytes !== undefined) out.maxDocumentBytes = bytes;
  return out;
}
