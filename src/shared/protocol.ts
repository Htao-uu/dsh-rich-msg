/**
 * Shared wire protocol constants and parsers for dsh-rich-msg.
 *
 * This module is framework-free and runs in both halves: the Node plugin and
 * the browser renderer import the same definitions, so the document contract,
 * the reference contract and the action envelope cannot drift.
 *
 * @module dsh-rich-msg/shared/protocol
 */

/** Fence languages this plugin claims. `rich-ui` is the upstream-compatible alias. */
export const FENCE_LANGUAGES = ['rich-msg', 'rich-ui'] as const;

/** Language used by first-party documentation and tools. */
export const PRIMARY_FENCE_LANGUAGE = 'rich-msg';

/** Largest fence/document source accepted, in UTF-16 code units. */
export const MAX_SOURCE_LENGTH = 256_000;

/** Largest rendered action envelope accepted by the action relay. */
export const MAX_ACTION_LENGTH = 32_000;

/** User-message prefix emitted when a viewer activates a rich control. */
export const ACTION_PREFIX = '[rich-msg-action]';

/** Durable-fence reference object shape: `{"version":1,"ref":"<artifact id>"}`. */
export const REF_VERSION = 1;

/** Artifact ids: `rm_` plus 20 lowercase hex characters. */
export const ARTIFACT_ID_PATTERN = /^rm_[0-9a-f]{20}$/;

/** Sessions accepted by the artifact read route (DSH session ids are opaque). */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

/** Host route that serves stored artifacts to the browser half. */
export const ARTIFACT_ROUTE_PREFIX = '/rich-msg/artifact';

/** Tool names registered by the host half. */
export const TOOL_NAMES = Object.freeze({
  validate: 'rich_msg_validate',
  publish: 'rich_msg_publish'
});

/** Attributes the renderer sets on its own DOM; host DOM is never mutated structurally. */
export const DOM_MARKERS = Object.freeze({
  root: 'data-rich-msg-root',
  style: 'data-rich-msg-style',
  sourceHidden: 'data-rich-msg-source'
});

/** One reference document parsed from a fence body. */
export interface RichMsgReference {
  readonly version: 1;
  readonly ref: string;
}

/** Parse a fence body as a reference document; returns null for any other shape. */
export function parseReference(raw: string): RichMsgReference | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) return null;
  const text = raw.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  let value: unknown;
  try {
    value = JSON.parse(text, (key, item: unknown) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new Error('unsafe key');
      }
      return item;
    });
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('version') || !keys.includes('ref')) return null;
  if (record.version !== REF_VERSION) return null;
  if (typeof record.ref !== 'string' || !ARTIFACT_ID_PATTERN.test(record.ref)) return null;
  return { version: REF_VERSION, ref: record.ref };
}

/** Build the action relay text for one viewer activation. */
export function formatActionText(action: string, payload: unknown): string | null {
  if (typeof action !== 'string' || action.length === 0 || action.length > 256) return null;
  let body: string;
  try {
    body = JSON.stringify({ action, payload: payload ?? {} });
  } catch {
    return null;
  }
  const text = ACTION_PREFIX + ' ' + body;
  return text.length > MAX_ACTION_LENGTH ? null : text;
}

/** Browser URL for one stored artifact. */
export function artifactUrl(base: string, id: string, sessionId: string): string {
  const origin = base.endsWith('/') ? base.slice(0, -1) : base;
  return origin + ARTIFACT_ROUTE_PREFIX + '/' + encodeURIComponent(id) + '?session=' + encodeURIComponent(sessionId);
}
