import {
  assertSafeKey,
  LIMITS,
  type RichNode,
  type RichSpec,
  type Scalar,
} from "../core/schema";
import { getInitialState } from "../core/evaluator";

/** Opt-in, tab-local persistence. Host keys must include session + response/block identity.
 * Only declared slider/switch/select/tabs controls persist. Inputs (including number),
 * unbound state, entity selection and action payloads are never written. Any input sharing
 * a state key excludes that key. Storage denial/quota/corruption gracefully disables restore.
 */
const PREFIX = "dsh-rich-msg:state:v1:";
const MAX_RECORD = 32768;
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}
// Two independent 32-bit accumulators. Identity fingerprint, not a cryptographic trust boundary.
function hash(text: string): string {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b, 33) ^ c;
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}
export function contentFingerprint(spec: RichSpec): string {
  return hash(canonical(spec));
}
export function persistenceStorageKey(owner: string): string {
  return PREFIX + hash(owner);
}
function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}
function rules(spec: RichSpec): Map<string, ((v: Scalar) => boolean)[]> {
  const result = new Map<string, ((v: Scalar) => boolean)[]>();
  const excluded = new Set<string>();
  const add = (key: string, valid: (v: Scalar) => boolean) => {
    assertSafeKey(key);
    result.set(key, [...(result.get(key) ?? []), valid]);
  };
  function walk(nodes: RichNode[]): void {
    for (const node of nodes) {
      switch (node.type) {
        case "input":
          excluded.add(node.stateKey);
          break;
        case "switch":
        case "checkbox":
          add(node.stateKey, (v) => typeof v === "boolean");
          break;
        case "select":
        case "radio":
        case "segmented":
          add(node.stateKey, (v) => node.options.some((o) => o.value === v));
          break;
        case "tabs":
          add(node.stateKey, (v) => node.tabs.some((t) => t.id === v));
          node.tabs.forEach((t) => walk(t.children));
          break;
        case "slider":
          add(node.stateKey, (v) => {
            if (
              typeof v !== "number" ||
              !Number.isFinite(v) ||
              v < node.min ||
              v > node.max
            )
              return false;
            const steps = (v - node.min) / (node.step ?? 1);
            return (
              Number.isFinite(steps) &&
              Math.abs(steps - Math.round(steps)) < 1e-7
            );
          });
          break;
      }
      if ("children" in node) walk(node.children);
      if (node.type === "conditional" && node.elseChildren)
        walk(node.elseChildren);
    }
  }
  walk(spec.nodes);
  for (const key of excluded) result.delete(key);
  return result;
}
function scalar(value: unknown): value is Scalar {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      Math.abs(value) <= 1e12) ||
    (typeof value === "string" && value.length <= LIMITS.string)
  );
}
function filtered(
  spec: RichSpec,
  state: Record<string, unknown>,
): Record<string, Scalar> {
  const out: Record<string, Scalar> = Object.create(null);
  for (const [key, validators] of rules(spec)) {
    const descriptor = Object.getOwnPropertyDescriptor(state, key);
    if (!descriptor || !("value" in descriptor)) continue;
    const value: unknown = descriptor.value;
    if (scalar(value) && validators.every((valid) => valid(value)))
      out[key] = value;
  }
  return out;
}
export function loadPersistedState(
  spec: RichSpec,
  owner?: string,
): Record<string, Scalar> {
  const initial = getInitialState(spec);
  if (!owner || owner.length > 1024) return initial;
  try {
    const raw = storage()?.getItem(persistenceStorageKey(owner));
    if (!raw || raw.length > MAX_RECORD) return initial;
    const record: unknown = JSON.parse(raw);
    if (!record || typeof record !== "object" || Array.isArray(record))
      return initial;
    const data = record as Record<string, unknown>;
    if (
      data.version !== 1 ||
      data.fingerprint !== contentFingerprint(spec) ||
      !data.state ||
      typeof data.state !== "object" ||
      Array.isArray(data.state)
    )
      return initial;
    const values = data.state as Record<string, unknown>;
    if (Object.keys(values).length > LIMITS.stateKeys) return initial;
    // Reject pollution/sensitive keys even though they are never assigned into an object prototype.
    for (const key of Object.keys(values)) assertSafeKey(key);
    return Object.assign(initial, filtered(spec, values));
  } catch {
    return initial;
  }
}
export function savePersistedState(
  spec: RichSpec,
  owner: string | undefined,
  state: Record<string, Scalar>,
): void {
  if (!owner || owner.length > 1024) return;
  try {
    const record = JSON.stringify({
      version: 1,
      fingerprint: contentFingerprint(spec),
      state: filtered(spec, state),
    });
    if (record.length <= MAX_RECORD)
      storage()?.setItem(persistenceStorageKey(owner), record);
  } catch {
    /* Storage is optional. */
  }
}
export function clearPersistedState(owner?: string): void {
  if (!owner || owner.length > 1024) return;
  try {
    storage()?.removeItem(persistenceStorageKey(owner));
  } catch {
    /* Storage is optional. */
  }
}
