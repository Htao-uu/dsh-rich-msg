import { describe, expect, it } from 'vitest';
import { ArtifactResolver } from '../../src/client/artifact-resolver';

const EXPECTED = 'rm_0123456789abcdef0123';
const SPEC = { version: 1, nodes: [{ type: 'text', content: 'resolved' }] };

/** Fake chat adapter that indexes one artifact. */
function chatWithArtifact(spec: unknown | undefined) {
  return {
    sessionId: () => 's1',
    snapshot: () => ({ fake: true }),
    artifactsOf: () => new Map([[EXPECTED, { id: EXPECTED, kind: 'text', summary: 'x', spec }]]),
    factsForRow: () => undefined,
    subscribe: () => () => {},
    dispose() {}
  };
}

describe('artifact resolver', () => {
  it('resolves from the session log synchronously', () => {
    const resolver = new ArtifactResolver({ chat: chatWithArtifact(SPEC) as never, getOrigin: () => 'http://host' });
    const resolved = resolver.sync('s1', EXPECTED);
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.via).toBe('session');
    expect(resolved?.spec).toBeDefined();
  });

  it('does not resolve a foreign artifact shape', () => {
    const resolver = new ArtifactResolver({ chat: chatWithArtifact(SPEC) as never, getOrigin: () => 'http://host' });
    expect(resolver.sync('s1', 'rm_ffffffffffffffffffff')).toBeUndefined();
    expect(resolver.sync('s1', 'not-an-id')?.status).toBe('missing');
    expect(resolver.sync(undefined, EXPECTED)).toBeUndefined();
  });

  it('falls back to the host route and reports missing on failure', async () => {
    const resolver = new ArtifactResolver({ chat: chatWithArtifact(undefined) as never, getOrigin: () => 'http://host' });
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (url: string) => {
        expect(String(url)).toContain('/rich-msg/artifact/' + EXPECTED);
        expect(String(url)).toContain('session=s1');
        return new Response(JSON.stringify({ ok: true, spec: SPEC, kind: 'text', summary: 'x' }), { status: 200 });
      }) as typeof fetch;
      const resolved = await resolver.resolve('s1', EXPECTED);
      expect(resolved.status).toBe('resolved');
      expect(resolved.via).toBe('route');
    } finally {
      globalThis.fetch = originalFetch;
    }
    const missingResolver = new ArtifactResolver({ chat: chatWithArtifact(undefined) as never, getOrigin: () => 'http://host' });
    globalThis.fetch = (async () => new Response('no', { status: 404 })) as typeof fetch;
    try {
      const missing = await missingResolver.resolve('s1', EXPECTED);
      expect(missing.status).toBe('missing');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
