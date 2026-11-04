/**
 * Read-only HTTP route for stored artifacts.
 *
 * The browser half renders a referenced document from the session log when it
 * can and falls back to this route when it cannot (for example a compacted
 * tool result). The route is deliberately minimal:
 *
 *   GET /rich-msg/artifact/<id>?session=<session id>
 *
 * It answers only the artifacts that belong to the session id in the query and
 * never lists, mutates or searches. Responses carry no-store cache headers and
 * are JSON only. The route is registered only when the host exposes the
 * `webServer` service; headless compositions simply do not get it.
 *
 * @module dsh-rich-msg/host/route
 */
import { ARTIFACT_ID_PATTERN, ARTIFACT_ROUTE_PREFIX, SESSION_ID_PATTERN } from '../shared/protocol.ts';
import type { ArtifactStore } from './artifacts.ts';

/** Structural subset of the DSH webServer service this module needs. */
export interface WebServerLike {
  register(route: {
    kind: 'prefix';
    path: string;
    resource: (request: Request) => Promise<Response>;
  }): () => void;
}

/** Shared response headers; artifacts are never cached by intermediaries. */
const HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
});

/** Build one JSON response with the shared headers. */
function jsonResponse(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
}

/** Build the uniform not-found answer: missing, foreign and invalid all look the same. */
function notFound(): Response {
  return jsonResponse(404, { ok: false, error: 'not-found' });
}

/** Extract the artifact id part of the matched path, or empty string. */
function artifactIdOf(pathname: string): string {
  if (!pathname.startsWith(ARTIFACT_ROUTE_PREFIX + '/')) return '';
  const rest = pathname.slice(ARTIFACT_ROUTE_PREFIX.length + 1);
  if (rest === '' || rest.includes('/')) return '';
  try {
    return decodeURIComponent(rest);
  } catch {
    return '';
  }
}

/**
 * Register the artifact route on a host web server.
 * @param webServer - the host service exposing `register`.
 * @param store - the session artifact store to read.
 * @returns the disposer removing the route.
 */
export function installArtifactRoute(webServer: WebServerLike, store: ArtifactStore): () => void {
  return webServer.register({
    kind: 'prefix',
    path: ARTIFACT_ROUTE_PREFIX,
    resource: async (request: Request): Promise<Response> => {
      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        return jsonResponse(405, { ok: false, error: 'method-not-allowed' }, { allow: 'GET, HEAD' });
      }
      let url: URL;
      try {
        url = new URL(request.url, 'http://127.0.0.1');
      } catch {
        return notFound();
      }
      const id = artifactIdOf(url.pathname);
      const sessionId = url.searchParams.get('session') ?? '';
      if (!ARTIFACT_ID_PATTERN.test(id) || !SESSION_ID_PATTERN.test(sessionId)) return notFound();
      const artifact = store.get(sessionId, id);
      if (artifact === undefined) return notFound();
      const payload = {
        ok: true,
        id: artifact.id,
        kind: artifact.kind,
        summary: artifact.summary,
        spec: artifact.spec
      };
      if (method === 'HEAD') {
        return new Response(null, { status: 200, headers: HEADERS });
      }
      return jsonResponse(200, payload);
    }
  });
}
