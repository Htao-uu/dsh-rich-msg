import { describe, expect, it, vi } from 'vitest';
import { ArtifactStore, mintArtifactId } from '../../src/host/artifacts';
import { parseRichSpec } from '../../src/core/schema';

const document = { version: 1, nodes: [{ type: 'text', content: 'hello' }] } as const;

function spec() {
  return parseRichSpec(JSON.parse(JSON.stringify(document)));
}

describe('artifact store', () => {
  it('mints ids in the documented grammar', () => {
    const id = mintArtifactId();
    expect(id).toMatch(/^rm_[0-9a-f]{20}$/);
    expect(mintArtifactId()).not.toBe(id);
  });

  it('stores per session and refuses cross-session reads', () => {
    const store = new ArtifactStore();
    const artifact = store.publish('session-a', spec(), 64);
    expect(artifact).not.toBeNull();
    expect(store.get('session-a', artifact!.id)).toBeDefined();
    expect(store.get('session-b', artifact!.id)).toBeUndefined();
    store.dispose();
  });

  it('bounds a session with oldest-first eviction', () => {
    const store = new ArtifactStore({ maxPerSession: 2 });
    const first = store.publish('s', spec(), 64)!;
    const second = store.publish('s', spec(), 64)!;
    const third = store.publish('s', spec(), 64)!;
    expect(store.get('s', first.id)).toBeUndefined();
    expect(store.get('s', second.id)).toBeDefined();
    expect(store.get('s', third.id)).toBeDefined();
    store.dispose();
  });

  it('expires artifacts after the ttl', () => {
    vi.useFakeTimers();
    try {
      const store = new ArtifactStore({ ttlMs: 1000 });
      const artifact = store.publish('s', spec(), 64)!;
      vi.advanceTimersByTime(2000);
      expect(store.get('s', artifact.id)).toBeUndefined();
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds the number of sessions and refuses oversized documents', () => {
    // The byte limit is clamped to a 1 KiB floor by the store itself.
    const store = new ArtifactStore({ maxSessions: 2, maxDocumentBytes: 1024 });
    const a = store.publish('one', spec(), 64)!;
    const b = store.publish('two', spec(), 64)!;
    const c = store.publish('three', spec(), 64)!;
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).not.toBeNull();
    expect(store.size).toBeLessThanOrEqual(2);
    expect(store.publish('one', spec(), 1025)).toBeNull();
    store.dispose();
  });

  it('clearSession and dispose release memory', () => {
    const store = new ArtifactStore();
    const artifact = store.publish('s', spec(), 64)!;
    store.clearSession('s');
    expect(store.get('s', artifact.id)).toBeUndefined();
    const again = store.publish('s', spec(), 64)!;
    store.dispose();
    expect(store.get('s', again.id)).toBeUndefined();
  });

  it('describes a document from its title or first text node', () => {
    const store = new ArtifactStore();
    const titled = store.publish('s', parseRichSpec({ version: 1, title: 'Deck', nodes: [{ type: 'text', content: 'x' }] }), 64)!;
    expect(titled.summary).toBe('Deck');
    expect(titled.kind).toBe('text');
    store.dispose();
  });
});
