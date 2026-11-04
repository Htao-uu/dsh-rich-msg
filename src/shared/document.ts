/**
 * Document parsing shared by both halves of dsh-rich-msg.
 *
 * The host tools and the browser reference resolver must accept exactly the
 * same documents, so the JSON guard, the size cap and the schema call live in
 * one place. This module has no Node or browser dependencies.
 *
 * @module dsh-rich-msg/shared/document
 */
import { parseRichSpec, type RichNode, type RichSpec } from '../core/schema.ts';
import { MAX_SOURCE_LENGTH } from './protocol.ts';

/**
 * Parse one document string with pollution guards and the size cap, then
 * validate it against the rich-msg schema.
 * @param document - complete JSON document text.
 * @returns the validated document.
 * @throws Error with a readable message when the document is rejected.
 */
export function parseDocumentText(document: unknown): RichSpec {
  if (typeof document !== 'string') throw new Error('document must be a string');
  if (document.length > MAX_SOURCE_LENGTH) {
    throw new Error('Document is longer than ' + MAX_SOURCE_LENGTH + ' characters');
  }
  const value: unknown = JSON.parse(document, (key, item: unknown) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error('Unsafe JSON key');
    }
    return item;
  });
  return parseRichSpec(value);
}

/** Count nodes in a validated document (top-level plus nested children). */
export function countNodes(spec: RichSpec): number {
  let count = 0;
  const visit = (nodes: RichSpec['nodes']): void => {
    for (const node of nodes) {
      count += 1;
      if (node.type === 'conditional') {
        visit(node.children);
        if (node.elseChildren) visit(node.elseChildren);
      } else if ('children' in node) {
        visit(node.children as RichSpec['nodes']);
      }
      if (node.type === 'tabs') for (const tab of node.tabs) visit(tab.children);
    }
  };
  visit(spec.nodes);
  return count;
}

/** Structural narrow helper for callers that already hold unknown JSON. */
export function isRichNodeList(value: unknown): value is readonly RichNode[] {
  return Array.isArray(value);
}
