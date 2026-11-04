/**
 * Host tools for dsh-rich-msg.
 *
 * Two pure technical tools, both registered with strictly neutral descriptions:
 *
 *   rich_msg_validate  validate a document against the renderer schema
 *   rich_msg_publish   validate and park a document in the session store,
 *                      returning a stable reference id
 *
 * Neither tool decides when a model should use rich content. Neither injects
 * guidance, examples or policy. Their descriptions document inputs, outputs
 * and side effects only, because that is what the tool API is for.
 *
 * @module dsh-rich-msg/host/tools
 */
import { MAX_SOURCE_LENGTH, TOOL_NAMES } from '../shared/protocol.ts';
import { countNodes, parseDocumentText } from '../shared/document.ts';
import type { RichSpec } from '../core/schema.ts';
import type { ArtifactStore } from './artifacts.ts';

/** Structural shape of the tool definition the registry accepts. */
export interface RichMsgToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: {
    schema: Record<string, unknown>;
    render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>;
  };
  execute(args: unknown, exec: { signal?: AbortSignal; agent?: { id?: string } }): Promise<Record<string, unknown>>;
}

/** Options for tool construction. */
export interface ToolOptions {
  readonly store: ArtifactStore;
  /** Session id of one execution, resolved by the caller; undefined means unavailable. */
  readonly sessionOf?: (exec: { agent?: { id?: string } }) => string | undefined;
  /** Names override, for hosts that already reserved the default names. */
  readonly names?: { validate?: string; publish?: string };
}

const DOCUMENT_PARAMETER = {
  type: 'string',
  description:
    'Complete rich-msg v1 JSON document as text. Maximum ' + MAX_SOURCE_LENGTH + ' characters.'
} as const;

/** Session id resolution from an execution context. */
export function defaultSessionOf(exec: { agent?: { id?: string } }): string | undefined {
  const id = exec?.agent?.id;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

/**
 * Build the validation tool.
 * @param options - store and session resolution (the store is unused here).
 * @returns one registry-ready definition.
 */
export function buildValidateTool(options: ToolOptions): RichMsgToolDefinition {
  return {
    name: options.names?.validate ?? TOOL_NAMES.validate,
    description:
      'Validate a rich-msg v1 JSON document against the renderer schema. Input: {document: string} — the complete document as text. ' +
      'Returns {valid:true, title?, nodes?, entities?} for an accepted document, or {valid:false, error} naming the first schema violation. ' +
      'This tool only validates: it does not send, store or display anything and has no side effects.',
    parameters: {
      type: 'object',
      properties: { document: DOCUMENT_PARAMETER },
      required: ['document'],
      additionalProperties: false
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          error: { type: 'string' },
          title: { type: 'string' },
          nodes: { type: 'integer' },
          entities: { type: 'integer' }
        },
        required: ['valid'],
        additionalProperties: false
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
    },
    async execute(args, exec) {
      exec.signal?.throwIfAborted();
      let document: string;
      try {
        document = readDocumentArg(args);
      } catch (error) {
        return { valid: false, error: errorMessage(error) };
      }
      try {
        const spec = parseDocumentText(document);
        return {
          valid: true,
          ...(spec.title === undefined ? {} : { title: spec.title }),
          nodes: countNodes(spec),
          entities: spec.entities?.length ?? 0
        };
      } catch (error) {
        return { valid: false, error: errorMessage(error) };
      }
    }
  };
}

/**
 * Build the publication tool: validate, park in the session store, return the id.
 * @param options - store and session resolution.
 * @returns one registry-ready definition.
 */
export function buildPublishTool(options: ToolOptions): RichMsgToolDefinition {
  const sessionOf = options.sessionOf ?? defaultSessionOf;
  return {
    name: options.names?.publish ?? TOOL_NAMES.publish,
    description:
      'Validate a rich-msg v1 JSON document and store it in the current session artifact store. Input: {document: string}. ' +
      'Returns {ok:true, id, kind, summary} on success, or {ok:false, error} naming the first schema violation. ' +
      'The returned id is a stable reference: a fenced code block whose language is rich-msg and whose body is ' +
      '{"version":1,"ref":"<id>"} makes the renderer display the stored document. ' +
      'Storing itself displays nothing and leaves the conversation unchanged.',
    parameters: {
      type: 'object',
      properties: { document: DOCUMENT_PARAMETER },
      required: ['document'],
      additionalProperties: false
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          id: { type: 'string' },
          kind: { type: 'string' },
          summary: { type: 'string' },
          error: { type: 'string' }
        },
        required: ['ok'],
        additionalProperties: false
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
    },
    async execute(args, exec) {
      exec.signal?.throwIfAborted();
      let document: string;
      try {
        document = readDocumentArg(args);
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
      const sessionId = sessionOf(exec);
      if (sessionId === undefined) {
        return { ok: false, error: 'No session identity is available for this execution.' };
      }
      let spec: RichSpec;
      try {
        spec = parseDocumentText(document);
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
      const artifact = options.store.publish(sessionId, spec, document.length);
      if (artifact === null) {
        return { ok: false, error: 'The session artifact budget refused this document.' };
      }
      return { ok: true, id: artifact.id, kind: artifact.kind, summary: artifact.summary };
    }
  };
}

/** Read the document argument as a string without trusting its shape. */
function readDocumentArg(args: unknown): string {
  if (args === null || typeof args !== 'object') throw new Error('document must be a string');
  const document = (args as { document?: unknown }).document;
  if (typeof document !== 'string') throw new Error('document must be a string');
  return document;
}

/** Bounded, human-readable error text. */
function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 1000);
}

/** Build both tools for one plugin instance. */
export function createRichMsgTools(options: ToolOptions): RichMsgToolDefinition[] {
  return [buildValidateTool(options), buildPublishTool(options)];
}