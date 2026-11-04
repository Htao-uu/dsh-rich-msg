import { describe, expect, it } from 'vitest';
import { ArtifactStore } from '../../src/host/artifacts';
import { installArtifactRoute, type WebServerLike } from '../../src/host/route';
import { parseRichSpec } from '../../src/core/schema';

interface Registered {
  kind: string;
  path: string;
  resource: (request: Request) => Promise<Response>;
}

function fakeServer(): { server: WebServerLike; routes: Registered[] } {
  const routes: Registered[] = [];
  return {
    routes,
    server: {
      register(route) {
        routes.push(route as Registered);
        return () => {
          routes.splice(routes.indexOf(route as Registered), 1);
        };
      }
    }
  };
}

function spec() {
  return parseRichSpec({ version: 1, nodes: [{ type: 'text', content: 'route-test' }] });
}

describe('artifact route', () => {
  it('registers one prefix route and disposes it', () => {
    const { server, routes } = fakeServer();
    const dispose = installArtifactRoute(server, new ArtifactStore());
    expect(routes).toHaveLength(1);
    expect(routes[0].kind).toBe('prefix');
    expect(routes[0].path).toBe('/rich-msg/artifact');
    dispose();
    expect(routes).toHaveLength(0);
  });

  it('serves an artifact to its own session only', async () => {
    const store = new ArtifactStore();
    const artifact = store.publish('s1', spec(), 64)!;
    const { server } = fakeServer();
    installArtifactRoute(server, store);
    const route = (server as unknown as { register: (r: Registered) => void });
    const registered: Registered[] = [];
    const server2: WebServerLike = {
      register(routeDef) {
        registered.push(routeDef as Registered);
        return () => {};
      }
    };
    installArtifactRoute(server2, store);
    const resource = registered[0].resource;
    const ok = await resource(new Request('http://127.0.0.1/rich-msg/artifact/' + artifact.id + '?session=s1'));
    expect(ok.status).toBe(200);
    const payload = await ok.json();
    expect(payload.ok).toBe(true);
    expect(payload.spec.version).toBe(1);

    const foreign = await resource(new Request('http://127.0.0.1/rich-msg/artifact/' + artifact.id + '?session=s2'));
    expect(foreign.status).toBe(404);

    const missingSession = await resource(new Request('http://127.0.0.1/rich-msg/artifact/' + artifact.id));
    expect(missingSession.status).toBe(404);

    const badId = await resource(new Request('http://127.0.0.1/rich-msg/artifact/nope?session=s1'));
    expect(badId.status).toBe(404);

    const readme = await resource(new Request('http://127.0.0.1/rich-msg/artifact/' + artifact.id + '?session=s1', { method: 'POST' }));
    expect(readme.status).toBe(405);
    store.dispose();
  });

  it('answers HEAD without a body', async () => {
    const store = new ArtifactStore();
    const artifact = store.publish('s1', spec(), 64)!;
    const registered: Registered[] = [];
    installArtifactRoute({ register(r) { registered.push(r as Registered); return () => {}; } }, store);
    const head = await registered[0].resource(
      new Request('http://127.0.0.1/rich-msg/artifact/' + artifact.id + '?session=s1', { method: 'HEAD' })
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    store.dispose();
  });
});
