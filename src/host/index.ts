/**
 * Host half of dsh-rich-msg.
 *
 * Responsibilities, and nothing else:
 *   1. register the technical tools (schema validation, artifact publication);
 *   2. own the session-scoped artifact store and its lifecycle;
 *   3. expose the read-only artifact route when the host has a web server.
 *
 * It deliberately does NOT touch `systemPrompt`, register personas or skills,
 * read any prompt file, or add model behaviour guidance of any kind. Loading
 * this plugin leaves the model contract exactly as the host and the user's own
 * configuration define it. See docs/SECURITY.md and docs/TOOL-BRIDGE.md.
 *
 * @module dsh-rich-msg
 */
import { ArtifactStore, type ArtifactLimits } from './artifacts.ts';
import { createRichMsgTools, type RichMsgToolDefinition } from './tools.ts';
import { installArtifactRoute, type WebServerLike } from './route.ts';

/** Stable Cordis plugin name. */
export const name = 'dsh-rich-msg';

/** The tool registry is the only hard service dependency. */
export const inject = ['tools'];

/** Plugin configuration; every field is optional. */
export interface Config {
  /** Register the two technical tools. Defaults to true. */
  readonly tools?: boolean;
  /** Register the read-only artifact route when the host has a web server. Defaults to true. */
  readonly httpRoute?: boolean;
  /** Artifact store bounds. */
  readonly artifacts?: Partial<ArtifactLimits>;
  /** Reserved name overrides, for compositions that already use the defaults. */
  readonly toolNames?: { validate?: string; publish?: string };
}

/** Knobs the browser half learns from the host at build time (kept for parity/tests). */
export interface HostDiagnostics {
  artifactRoute: boolean;
  tools: string[];
}

/** Structural subset of the Cordis context this plugin uses. */
export interface HostContext {
  tools: { register(definition: RichMsgToolDefinition): () => void };
  effect?(execute: () => () => void, label?: string): unknown;
  inject?(deps: string[], callback: (sub: HostContext) => (() => void) | void): unknown;
  logger?(name: string): { warn(message: string, error?: unknown): void; info(message: string): void };
  webServer?: WebServerLike;
}

/** Normalize user configuration without trusting its shape. */
function normalizeConfig(config: unknown): {
  tools: boolean;
  httpRoute: boolean;
  artifacts: Partial<ArtifactLimits>;
  toolNames: { validate?: string; publish?: string };
} {
  const raw = config !== null && typeof config === 'object' ? (config as Record<string, unknown>) : {};
  const limits = raw.artifacts !== null && typeof raw.artifacts === 'object' ? (raw.artifacts as Record<string, unknown>) : {};
  const names = raw.toolNames !== null && typeof raw.toolNames === 'object' ? (raw.toolNames as Record<string, unknown>) : {};
  return {
    tools: raw.tools !== false,
    httpRoute: raw.httpRoute !== false,
    artifacts: {
      ...(typeof limits.maxPerSession === 'number' ? { maxPerSession: limits.maxPerSession } : {}),
      ...(typeof limits.maxSessions === 'number' ? { maxSessions: limits.maxSessions } : {}),
      ...(typeof limits.ttlMs === 'number' ? { ttlMs: limits.ttlMs } : {}),
      ...(typeof limits.maxDocumentBytes === 'number' ? { maxDocumentBytes: limits.maxDocumentBytes } : {})
    },
    toolNames: {
      ...(typeof names.validate === 'string' && names.validate !== '' ? { validate: names.validate } : {}),
      ...(typeof names.publish === 'string' && names.publish !== '' ? { publish: names.publish } : {})
    }
  };
}

/**
 * Apply the host plugin.
 * @param ctx - Cordis plugin context.
 * @param config - optional plugin configuration.
 * @returns a disposer for hosts that treat the return value as cleanup.
 */
export function apply(ctx: HostContext, config?: Config): () => void {
  const settings = normalizeConfig(config);
  const store = new ArtifactStore(settings.artifacts);
  const disposers: Array<() => void> = [];
  const diagnostics: HostDiagnostics = { artifactRoute: false, tools: [] };
  let disposed = false;

  const disposeAll = (): void => {
    if (disposed) return;
    disposed = true;
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch {
        /* A failing disposer must not block the remaining cleanup. */
      }
    }
    store.dispose();
  };

  if (settings.tools) {
    for (const definition of createRichMsgTools({ store, names: settings.toolNames })) {
      const dispose = ctx.tools.register(definition);
      disposers.push(typeof dispose === 'function' ? dispose : () => {});
      diagnostics.tools.push(definition.name);
    }
  }

  if (settings.httpRoute) {
    const register = (sub: HostContext): (() => void) | void => {
      const webServer = sub.webServer;
      if (webServer === undefined || typeof webServer.register !== 'function') return;
      const dispose = installArtifactRoute(webServer, store);
      diagnostics.artifactRoute = true;
      return dispose;
    };
    if (typeof ctx.inject === 'function') {
      // Optional seat: loads when (and only when) a web server service exists.
      ctx.inject(['webServer'], register);
    } else if (ctx.webServer !== undefined) {
      const dispose = register(ctx);
      if (typeof dispose === 'function') disposers.push(dispose);
    }
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => disposeAll, 'dsh-rich-msg: host resources');
    }
  } else if (typeof ctx.effect === 'function') {
    ctx.effect(() => disposeAll, 'dsh-rich-msg: host resources');
  }

  return disposeAll;
}
