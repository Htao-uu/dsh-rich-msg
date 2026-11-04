import { describe, expect, it } from 'vitest';
import { ArtifactStore } from '../../src/host/artifacts';
import { createRichMsgTools, buildValidateTool, buildPublishTool } from '../../src/host/tools';

/** Words that would turn a tool description into behaviour guidance. */
const FORBIDDEN = [
  'you should',
  'you must',
  'default to',
  'prefer ',
  'when the user',
  'always use',
  'use this when',
  '优先',
  '默认使用',
  '应该使用',
  '必须使用'
];

const validDocument = JSON.stringify({
  version: 1,
  nodes: [{ type: 'text', content: 'hello' }]
});

describe('host tools', () => {
  it('registers exactly two tools with neutral descriptions', () => {
    const store = new ArtifactStore();
    const tools = createRichMsgTools({ store });
    expect(tools.map((tool) => tool.name)).toEqual(['rich_msg_validate', 'rich_msg_publish']);
    for (const tool of tools) {
      const description = tool.description.toLowerCase();
      for (const phrase of FORBIDDEN) expect(description.includes(phrase)).toBe(false);
      expect(description.length).toBeLessThanOrEqual(900);
    }
    store.dispose();
  });

  it('declares closed parameter and output schemas', () => {
    const store = new ArtifactStore();
    for (const tool of createRichMsgTools({ store })) {
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.additionalProperties).toBe(false);
      expect(tool.output.schema.type).toBe('object');
      expect(typeof tool.output.render).toBe('function');
    }
    store.dispose();
  });

  it('validates a good document and reports the first violation', async () => {
    const store = new ArtifactStore();
    const validate = buildValidateTool({ store });
    const ok = await validate.execute({ document: validDocument }, {});
    expect(ok).toMatchObject({ valid: true, nodes: 1, entities: 0 });
    const bad = await validate.execute({ document: JSON.stringify({ version: 9, nodes: [] }) }, {});
    expect(bad.valid).toBe(false);
    expect(typeof bad.error).toBe('string');
    const notString = await validate.execute({ document: 42 }, {});
    expect(notString.valid).toBe(false);
    store.dispose();
  });

  it('publishes into the calling session and returns a reference id', async () => {
    const store = new ArtifactStore();
    const publish = buildPublishTool({ store });
    const result = await publish.execute({ document: validDocument }, { agent: { id: 'session-z' } });
    expect(result.ok).toBe(true);
    expect(String(result.id)).toMatch(/^rm_[0-9a-f]{20}$/);
    expect(store.get('session-z', String(result.id))).toBeDefined();
    expect(store.get('other-session', String(result.id))).toBeUndefined();
    store.dispose();
  });

  it('refuses publication without a session identity', async () => {
    const store = new ArtifactStore();
    const publish = buildPublishTool({ store });
    const result = await publish.execute({ document: validDocument }, {});
    expect(result.ok).toBe(false);
    store.dispose();
  });

  it('does not store invalid documents', async () => {
    const store = new ArtifactStore();
    const publish = buildPublishTool({ store });
    const result = await publish.execute({ document: '{"version":2,"nodes":[]}' }, { agent: { id: 's' } });
    expect(result.ok).toBe(false);
    expect(store.size).toBe(0);
    store.dispose();
  });

  it('rejects oversized input without parsing it', async () => {
    const store = new ArtifactStore();
    const validate = buildValidateTool({ store });
    const oversized = 'x'.repeat(256_001);
    const result = await validate.execute({ document: oversized }, {});
    expect(result.valid).toBe(false);
    store.dispose();
  });

  it('observes the abort signal', async () => {
    const store = new ArtifactStore();
    const validate = buildValidateTool({ store });
    const controller = new AbortController();
    controller.abort();
    await expect(validate.execute({ document: validDocument }, { signal: controller.signal })).rejects.toThrow();
    store.dispose();
  });
});
