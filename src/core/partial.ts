/**
 * Streaming prefix reader for the rich-ui fence.
 *
 * It never repairs malformed JSON: it only reports the part of the document
 * that is already complete. A partially written string, an unfinished node or
 * an unresolved entity reference simply stops the prefix, so the reader can
 * show finished components while the model is still writing.
 */
import { parseRichSpec, type RichNode, type RichSpec } from "./schema.ts";

interface Scan {
  version?: unknown;
  title?: unknown;
  initialState?: unknown;
  entities?: unknown;
  nodes?: unknown[];
  /** True when the whole root object closed, so nothing is left to stream. */
  complete: boolean;
  /** An unrecognised root member; the final parser rejects it, so the preview must not hide it. */
  unknown?: boolean;
}

/** Walk a JSON value starting at `start`, returning the end index or -1. */
function valueEnd(raw: string, start: number): number {
  const first = raw[start];
  if (first === '"') return stringEnd(raw, start);
  if (first === "{" || first === "[") {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }
  // Primitive value: stop at the member or array delimiter.
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === "," || ch === "}" || ch === "]" || /\s/.test(ch)) return i;
  }
  return -1;
}

function skipSpace(raw: string, index: number): number {
  while (index < raw.length && /\s/.test(raw[index]!)) index++;
  return index;
}

/** Read the string literal starting at `start` (which must be `"`). */
function stringEnd(raw: string, start: number): number {
  let escaped = false;
  for (let i = start + 1; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) escaped = false;
    else if (ch === "\\") escaped = true;
    else if (ch === '"') return i + 1;
  }
  return -1;
}

function tryJson(raw: string, from: number, to: number): unknown {
  try {
    return JSON.parse(raw.slice(from, to));
  } catch {
    return undefined;
  }
}

/** Elements of an array that are already closed; the trailing one is dropped. */
function completeElements(
  raw: string,
  open: number,
): { items: unknown[]; complete: boolean } {
  const items: unknown[] = [];
  let index = skipSpace(raw, open + 1);
  if (raw[index] === "]") return { items, complete: true };
  for (;;) {
    if (index >= raw.length) return { items, complete: false };
    const end = valueEnd(raw, index);
    if (end === -1) return { items, complete: false };
    const value = tryJson(raw, index, end);
    if (value === undefined) return { items, complete: false };
    items.push(value);
    index = skipSpace(raw, end);
    if (raw[index] === ",") {
      index = skipSpace(raw, index + 1);
      continue;
    }
    if (raw[index] === "]") return { items, complete: true };
    return { items, complete: false };
  }
}

/** Read the root object up to the first byte that is not a complete member. */
export function scanPrefix(raw: string): Scan {
  const text = raw.trimStart();
  if (text[0] !== "{") return { complete: false };
  const result: Scan = { complete: false };
  let index = skipSpace(text, 1);
  for (;;) {
    if (text[index] !== '"') return result;
    const keyEnd = stringEnd(text, index);
    if (keyEnd === -1) return result;
    const key = tryJson(text, index, keyEnd);
    if (typeof key !== "string") return result;
    index = skipSpace(text, keyEnd);
    if (text[index] !== ":") return result;
    index = skipSpace(text, index + 1);
    if (key === "nodes" && text[index] === "[") {
      const { items, complete } = completeElements(text, index);
      result.nodes = items;
      if (!complete) return result;
      // An array closed but the root may continue (e.g. entities after nodes).
      const end = valueEnd(text, index);
      if (end === -1) return result;
      index = skipSpace(text, end);
    } else if (key === "entities" && text[index] === "[") {
      const { items, complete } = completeElements(text, index);
      if (!complete) return result;
      result.entities = items;
      const end = valueEnd(text, index);
      if (end === -1) return result;
      index = skipSpace(text, end);
    } else {
      const end = valueEnd(text, index);
      // An initialState after nodes is part of the answer's meaning. Do not
      // paint completed nodes without it: that briefly shows wrong computed
      // values and conditional branches.
      if (end === -1)
        return key === "initialState" ? { complete: false } : result;
      const value = tryJson(text, index, end);
      if (value === undefined)
        return key === "initialState" ? { complete: false } : result;
      if (key === "version") result.version = value;
      else if (key === "title") result.title = value;
      else if (key === "initialState") result.initialState = value;
      else result.unknown = true;
      index = skipSpace(text, end);
    }
    if (text[index] === ",") {
      index = skipSpace(text, index + 1);
      continue;
    }
    if (text[index] === "}") {
      result.complete = true;
      return result;
    }
    return result;
  }
}

/**
 * Build a renderable spec from the completed prefix. Nodes are accepted only in
 * order; a node that fails validation or points at an unknown entity stops the
 * prefix instead of being skipped, so what the reader sees matches the document.
 */
export function parseStreamingSpec(raw: string): RichSpec | null {
  const scan = scanPrefix(raw);
  if (
    scan.version !== 1 ||
    scan.unknown ||
    !Array.isArray(scan.nodes) ||
    scan.nodes.length === 0
  )
    return null;
  const entities = Array.isArray(scan.entities) ? scan.entities : [];
  const nodes = scan.nodes as RichNode[];
  const base: Record<string, unknown> = { version: 1, entities };
  if (scan.title !== undefined) base.title = scan.title;
  if (scan.initialState !== undefined) base.initialState = scan.initialState;
  // A node can be rejected only after the prefix that contains it, so valid
  // prefixes are monotonic. Binary search finds the longest one with O(log n)
  // full validations instead of validating every prefix on every frame.
  const valid = (count: number) => {
    try {
      parseRichSpec({ ...base, nodes: nodes.slice(0, count) });
      return true;
    } catch {
      return false;
    }
  };
  let low = 0;
  let high = nodes.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (valid(mid)) low = mid;
    else high = mid - 1;
  }
  if (low === 0) return null;
  try {
    return parseRichSpec({ ...base, nodes: nodes.slice(0, low) });
  } catch {
    return null;
  }
}
