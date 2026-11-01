import { describe, expect, it, vi } from "vitest";
import { apply, buildSection, buildValidateTool } from "./index";
import { parseRichSpec } from "../core/schema";

const valid = JSON.stringify({
  version: 1,
  title: "Check",
  entities: [{ id: "one", kind: "Film", title: "One" }],
  nodes: [
    { type: "text", content: "Hello" },
    { type: "entity-ref", entityId: "one" },
  ],
});

const run = async (document: unknown) =>
  buildValidateTool().execute({ document }, {});

describe("rich_ui_validate host tool", () => {
  it("accepts a complete document and reports its shape", async () => {
    await expect(run(valid)).resolves.toEqual({
      valid: true,
      title: "Check",
      nodes: 2,
      entities: 1,
    });
  });

  it("counts nodes inside tabs and alternate branches", async () => {
    const document = JSON.stringify({
      version: 1,
      nodes: [
        {
          type: "conditional",
          when: true,
          children: [{ type: "text", content: "yes" }],
          elseChildren: [{ type: "text", content: "no" }],
        },
        {
          type: "tabs",
          stateKey: "tab",
          tabs: [
            {
              id: "a",
              label: "A",
              children: [{ type: "text", content: "in tab" }],
            },
          ],
        },
      ],
    });
    await expect(run(document)).resolves.toEqual({
      valid: true,
      nodes: 5,
      entities: 0,
    });
  });

  it("returns the schema error instead of throwing, so the model can correct it", async () => {
    const result = await run('{"version":1,"nodes":[{"type":"text"}]}');
    expect(result.valid).toBe(false);
    expect(String(result.error)).toContain("content");
  });

  it("rejects malformed JSON, unsafe keys, non-strings and the size cap", async () => {
    expect((await run("{")).valid).toBe(false);
    expect((await run('{"__proto__":{"x":1}}')).valid).toBe(false);
    expect((await run('{"version":1,"nodes":[{"type":"nope"}]}')).valid).toBe(
      false,
    );
    await expect(run(12)).rejects.toThrow("document must be a string");
    const result = await run(" ".repeat(256_001));
    expect(result.valid).toBe(false);
    expect(String(result.error)).toContain("256000");
  });

  it("registers once with the tools service and releases it on dispose", () => {
    const release = vi.fn();
    const register = vi.fn(() => release);
    const section = vi.fn();
    const dispose = apply({
      systemPrompt: {
        getSectionOrder: () => 1,
        section,
      },
      tools: { register },
    });
    expect(section).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ name: "rich_ui_validate" }),
    );
    dispose?.();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not advertise the tool when registration fails", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const section = vi.fn();
    const dispose = apply({
      systemPrompt: { getSectionOrder: () => 1, section },
      tools: {
        register: () => {
          throw new Error("unsupported schema");
        },
      },
    });
    expect(dispose).toBeUndefined();
    const text = section.mock.calls[0]![0].text as string;
    expect(text).toContain("No `rich_ui_validate` tool is registered");
    expect(text).not.toContain(
      "The host registers the `rich_ui_validate` tool",
    );
  });

  it("makes collections the default and keeps one decision ladder", () => {
    const section = buildSection();
    expect(section).toContain("## Choose the surface");
    expect(section).toContain(
      "Never answer a collection with a Markdown table",
    );
    expect(section).toContain("collections and comparisons by default");
    expect(section).toContain("anime");
    expect(section).toContain("Stop after two failed validations");
    expect(section).toContain('"entity-list"');
    expect(section).not.toContain("Use this skill for");
    expect(section).not.toContain("Do not force every answer into UI");
  });

  it("keeps the inline example valid and the prompt within budget", () => {
    const section = buildSection();
    const block = /```rich-ui\n([\s\S]*?)\n```/.exec(section)?.[1];
    expect(block).toBeTruthy();
    const spec = parseRichSpec(JSON.parse(block!));
    expect(spec.entities).toHaveLength(1);
    expect(spec.nodes.map((node) => node.type)).toEqual([
      "text",
      "entity-list",
    ]);
    const words = section.split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThan(1250);
  });

  it("is advertised in the system prompt as a tool, not a chat message", () => {
    const section = buildSection();
    expect(section).toContain("rich_ui_validate");
    expect(section).not.toContain("No rich-ui validation tool is installed");
  });
});
