import { describe, expect, it } from "vitest";
import {
  LIMITS,
  isCalendarDate,
  parseRichSpec,
  stateValueFits,
  validateExpr,
} from "../../src/core/schema";
import { getInitialState } from "../../src/core/evaluator";
const spec = (node: unknown) => ({ version: 1, nodes: [node] });
describe("safe schema", () => {
  it("accepts typed primitives and initializes controls inside popovers", () => {
    const parsed = parseRichSpec({
      version: 1,
      nodes: [
        {
          type: "popover",
          label: "Settings",
          children: [{ type: "switch", stateKey: "enabled" }],
        },
        { type: "tooltip", label: "Help", text: "Plain text only" },
        {
          type: "image-group",
          src: ["https://example.org/a.jpg"],
          alt: "Gallery",
          label: "Photos",
        },
      ],
    });
    expect(parsed.nodes).toHaveLength(3);
    expect(getInitialState(parsed).enabled).toBe(false);
  });
  it("strictly rejects unsafe primitive fields, URLs and undeclared tooltip children", () => {
    for (const node of [
      { type: "tooltip", label: "Help", text: "Tip", children: [] },
      { type: "popover", label: "Settings", children: [], onOpen: "eval()" },
      { type: "image-group", src: ["data:image/png;base64,abc"], alt: "X" },
      {
        type: "image-group",
        src: ["https://example.org/a.jpg", "javascript:alert(1)"],
        alt: "X",
      },
      { type: "image-group", src: "https://example.org/a.jpg", alt: "X" },
    ])
      expect(() => parseRichSpec(spec(node))).toThrow();
  });
  it("counts nested popover children toward document and node budgets", () => {
    let node: unknown = { type: "tooltip", label: "Help", text: "Tip" };
    for (let i = 0; i < 60; i++)
      node = { type: "popover", label: "More", children: [node] };
    expect(() => parseRichSpec(spec(node))).toThrow(/budget/);
    expect(() =>
      parseRichSpec(
        spec({
          type: "popover",
          label: "More",
          children: Array.from({ length: 1000 }, () => ({ type: "divider" })),
        }),
      ),
    ).toThrow(/budget/);
  });
  it("parses the declarative contract into detached null-prototype records", () => {
    const input = { version: 1, nodes: [{ type: "text", content: "hello" }] };
    const result = parseRichSpec(input);
    expect(result.nodes[0]).toEqual(input.nodes[0]);
    expect(result).not.toBe(input);
    expect(Object.getPrototypeOf(result)).toBe(null);
  });
  it.each(["script", "iframe", "html"])("rejects unknown node %s", (type) =>
    expect(() => parseRichSpec(spec({ type }))).toThrow(),
  );
  it("rejects arbitrary properties, scripts, styles and action types", () => {
    for (const node of [
      { type: "text", content: "x", onClick: "alert(1)" },
      { type: "text", content: "x", style: {} },
      {
        type: "button",
        label: "x",
        action: { type: "eval", code: "alert(1)" },
      },
    ])
      expect(() => parseRichSpec(spec(node))).toThrow();
  });
  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,x",
    "file:///etc/passwd",
    "//example.org/x",
    "https://a:b@example.org",
    "https://example.org/\nx",
  ])("blocks URL %s", (src) => {
    expect(() =>
      parseRichSpec(spec({ type: "image", src, alt: "x" })),
    ).toThrow();
    expect(() =>
      parseRichSpec(
        spec({
          type: "button",
          label: "x",
          action: { type: "open-url", url: src },
        }),
      ),
    ).toThrow();
  });
  it("accepts safe URL and validates entity references", () => {
    expect(() =>
      parseRichSpec({
        version: 1,
        nodes: [{ type: "entity-ref", entityId: "x" }],
        entities: [
          {
            id: "x",
            kind: "product",
            title: "X",
            image: "https://example.org/a.png",
            sources: [{ title: "source", url: "http://example.org" }],
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      parseRichSpec(spec({ type: "entity-ref", entityId: "missing" })),
    ).toThrow(/Unknown entity/);
  });
  it("rejects duplicate entities, node IDs, tabs and columns", () => {
    expect(() =>
      parseRichSpec({
        version: 1,
        nodes: [
          { type: "divider", id: "a" },
          { type: "divider", id: "a" },
        ],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseRichSpec(
        spec({
          type: "tabs",
          stateKey: "tab",
          tabs: [
            { id: "x", label: "x", children: [] },
            { id: "x", label: "y", children: [] },
          ],
        }),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseRichSpec(
        spec({
          type: "table",
          columns: [
            { key: "a", label: "a" },
            { key: "a", label: "b" },
          ],
          rows: [],
        }),
      ),
    ).toThrow(/Duplicate/);
  });
  it("rejects pollution, secrets and property paths", () => {
    for (const key of [
      "__proto__",
      "constructor",
      "prototype",
      "password",
      "api_key",
      "token",
      "a.b",
    ]) {
      expect(() =>
        parseRichSpec({
          version: 1,
          nodes: [],
          initialState: JSON.parse(`{"${key}":1}`),
        }),
      ).toThrow();
      expect(() =>
        parseRichSpec(spec({ type: "input", stateKey: key })),
      ).toThrow();
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("never invokes getters", () => {
    let calls = 0;
    const hostile = {
      get version() {
        calls++;
        return 1;
      },
      nodes: [],
    };
    expect(() => parseRichSpec(hostile)).toThrow(/Accessors/);
    expect(calls).toBe(0);
    expect(() =>
      validateExpr({
        get op() {
          calls++;
          return "add";
        },
        args: [1, 2],
      }),
    ).toThrow();
    expect(calls).toBe(0);
  });
  it("rejects cycles, functions, exotic prototypes, sparse arrays and hidden fields", () => {
    const x: Record<string, unknown> = {};
    x.x = x;
    for (const input of [
      x,
      new Date(),
      () => 1,
      { version: 1, nodes: new Array(3) },
      Object.defineProperty({ version: 1, nodes: [] }, "hidden", { value: 1 }),
    ])
      expect(() => parseRichSpec(input)).toThrow();
  });
  it("enforces recursive and node budgets", () => {
    let node: unknown = { type: "text", content: "x" };
    for (let i = 0; i < 60; i++) node = { type: "stack", children: [node] };
    expect(() => parseRichSpec(spec(node))).toThrow(/budget/);
    expect(() =>
      parseRichSpec({
        version: 1,
        nodes: Array.from({ length: LIMITS.nodes }, () => ({
          type: "stack",
          children: [{ type: "divider" }],
        })),
      }),
    ).toThrow(/budget/);
  });
  it("validates numeric bounds and slider constraints", () => {
    for (const value of [NaN, Infinity, 1e20])
      expect(() =>
        parseRichSpec({ version: 1, nodes: [], initialState: { x: value } }),
      ).toThrow();
    for (const extra of [
      { min: 2, max: 1 },
      { min: 0, max: 1, step: 0 },
    ])
      expect(() =>
        parseRichSpec(spec({ type: "slider", stateKey: "x", ...extra })),
      ).toThrow();
  });
  it("checks expression operations, arity and depth", () => {
    for (const expr of [
      { op: "eval", args: ["x"] },
      { op: "add", args: [1] },
      { state: "constructor" },
      { op: "add", args: [1, 2], path: "a" },
    ])
      expect(() => parseRichSpec(spec({ type: "computed", expr }))).toThrow();
    let expr: unknown = 1;
    for (let i = 0; i < 30; i++) expr = { op: "abs", args: [expr] };
    expect(() => validateExpr(expr)).toThrow(/budget/);
  });
});

describe("semantic icon colour and entity rows", () => {
  it("accepts only token tones", () => {
    expect(
      parseRichSpec(spec({ type: "icon", name: "clock", tone: "warning" })),
    ).toBeTruthy();
    for (const tone of ["#ff0000", "red", "", null, 12])
      expect(() =>
        parseRichSpec(spec({ type: "icon", name: "clock", tone })),
      ).toThrow();
  });
  it("validates entity lists against declared entities", () => {
    const entities = [{ id: "a", kind: "Film", title: "A" }];
    expect(
      parseRichSpec({
        version: 1,
        entities,
        nodes: [{ type: "entity-list", entityIds: ["a"] }],
      }),
    ).toBeTruthy();
    expect(() =>
      parseRichSpec({
        version: 1,
        entities,
        nodes: [{ type: "entity-list", entityIds: ["missing"] }],
      }),
    ).toThrow(/Unknown entity/);
    expect(() =>
      parseRichSpec(spec({ type: "entity-list", entityIds: [] })),
    ).toThrow();
    expect(() =>
      parseRichSpec({
        version: 1,
        entities,
        nodes: [{ type: "entity-list", entityIds: "a" }],
      }),
    ).toThrow();
  });
  it("validates checkbox, radio and segmented controls", () => {
    expect(
      parseRichSpec(spec({ type: "checkbox", stateKey: "ok", label: "Agree" })),
    ).toBeTruthy();
    expect(
      parseRichSpec(
        spec({
          type: "radio",
          stateKey: "size",
          label: "Size",
          options: [{ label: "S", value: 1 }],
        }),
      ),
    ).toBeTruthy();
    expect(
      parseRichSpec(
        spec({
          type: "segmented",
          stateKey: "view",
          options: [{ label: "A", value: "a" }],
        }),
      ),
    ).toBeTruthy();
    expect(
      parseRichSpec(
        spec({ type: "input", stateKey: "when", inputType: "date" }),
      ),
    ).toBeTruthy();
    for (const bad of [
      { type: "checkbox", stateKey: "ok" },
      { type: "radio", stateKey: "x", options: [] },
      {
        type: "segmented",
        stateKey: "x",
        options: [{ label: "A", value: null }],
      },
      { type: "input", stateKey: "d", inputType: "datetime-local" },
    ])
      expect(() => parseRichSpec(spec(bad))).toThrow();
  });
});

describe("commerce presentation", () => {
  it("accepts entity cast members and rejects an unsafe portrait URL", () => {
    const base = {
      version: 1,
      entities: [
        {
          id: "a",
          kind: "Film",
          title: "A",
          cast: [
            {
              name: "Ada",
              role: "Pilot",
              image: "https://example.org/ada.jpg",
            },
          ],
        },
      ],
      nodes: [{ type: "entity-ref", entityId: "a" }],
    };
    expect(() => parseRichSpec(base)).not.toThrow();
    expect(() =>
      parseRichSpec({
        ...base,
        entities: [
          {
            id: "a",
            kind: "Film",
            title: "A",
            cast: [{ name: "Ada", image: "javascript:alert(1)" }],
          },
        ],
      }),
    ).toThrow(/URL/);
  });
  it("accepts a meta strip and entity badges, rejecting bad shapes", () => {
    const base = {
      version: 1,
      entities: [
        {
          id: "a",
          kind: "Kettle",
          title: "A",
          badge: { label: "Popular", tone: "success" },
        },
      ],
      nodes: [
        { type: "meta", items: [{ icon: "package", text: "4 models" }] },
        { type: "entity-list", entityIds: ["a"] },
      ],
    };
    expect(parseRichSpec(base)).toBeTruthy();
    for (const bad of [
      { ...base, nodes: [{ type: "meta", items: [] }] },
      {
        ...base,
        nodes: [{ type: "meta", items: [{ text: "x", icon: "#bad" }] }],
      },
      {
        ...base,
        entities: [
          { id: "a", kind: "k", title: "A", badge: { tone: "success" } },
        ],
      },
      {
        ...base,
        entities: [
          {
            id: "a",
            kind: "k",
            title: "A",
            badge: { label: "x", tone: "lime" },
          },
        ],
      },
    ])
      expect(() => parseRichSpec(bad)).toThrow();
  });
});

describe("callout heading", () => {
  it("accepts an optional title and still rejects unknown fields", () => {
    expect(
      parseRichSpec(spec({ type: "callout", content: "x", title: "Summary" })),
    ).toBeTruthy();
    expect(() =>
      parseRichSpec(spec({ type: "callout", content: "x", subtitle: "y" })),
    ).toThrow();
  });
});

describe("dashboard vocabulary", () => {
  it("accepts stats, progress, status, diagrams and multi-series charts", () => {
    const parsed = parseRichSpec({
      version: 1,
      nodes: [
        {
          type: "grid",
          columns: 3,
          children: [
            {
              type: "stat",
              label: "Uptime",
              value: "99,9%",
              delta: 0.2,
              icon: "shield-check",
            },
            { type: "progress", value: 65, label: "Progress", tone: "success" },
            { type: "status", label: "Ready", tone: "success" },
          ],
        },
        {
          type: "chart",
          kind: "area",
          unit: "₽",
          categories: ["Jan", "Feb"],
          series: [
            { label: "Revenue", values: [1, 2] },
            { label: "Cost", values: [1, 1] },
          ],
        },
        {
          type: "diagram",
          direction: "vertical",
          steps: [
            { id: "a", label: "Start" },
            { id: "b", label: "End", connector: "next", depth: 1 },
          ],
        },
        {
          type: "table",
          sortable: true,
          caption: "Plan",
          columns: [{ key: "task", label: "Task", align: "left" }],
          rows: [{ task: "Design" }],
        },
        {
          type: "code",
          code: "const x = 1;",
          language: "ts",
          title: "Example",
          lineNumbers: true,
        },
      ],
    });
    expect(parsed.nodes).toHaveLength(5);
  });

  it("rejects mismatched series, duplicate steps and malformed dashboard fields", () => {
    for (const node of [
      {
        type: "chart",
        kind: "line",
        categories: ["Jan", "Feb"],
        series: [{ label: "One", values: [1] }],
      },
      {
        type: "chart",
        kind: "donut",
        categories: ["A"],
        series: [{ label: "One", values: [1] }],
      },
      {
        type: "diagram",
        steps: [
          { id: "a", label: "A" },
          { id: "a", label: "B" },
        ],
      },
      { type: "diagram", steps: [] },
      { type: "diagram", steps: [{ id: "a", label: "A", depth: 3 }] },
      { type: "stat", label: "No value" },
      { type: "stat", label: "Tone", value: 1, tone: "muted" },
      { type: "progress", value: 1, max: 0 },
      { type: "status", label: "X", tone: "default" },
      { type: "table", columns: [], rows: [], sortable: "yes" },
      {
        type: "table",
        columns: [{ key: "a", label: "A", align: "top" }],
        rows: [],
      },
      { type: "code", code: "x", lineNumbers: "yes" },
    ])
      expect(() => parseRichSpec(spec(node))).toThrow();
  });
});

describe("table formats and filtering", () => {
  it("accepts status tones and a filter", () => {
    const parsed = parseRichSpec(
      spec({
        type: "table",
        filterable: true,
        filterPlaceholder: "Find a task",
        sortable: true,
        columns: [
          { key: "task", label: "Task" },
          {
            key: "state",
            label: "State",
            format: "status",
            tones: { Done: "success", Blocked: "danger" },
          },
          { key: "value", label: "Value", format: "number" },
        ],
        rows: [{ task: "A", state: "Done", value: 12000 }],
      }),
    );
    expect(parsed.nodes).toHaveLength(1);
  });

  it("rejects tone maps without a status column and malformed filters", () => {
    for (const node of [
      {
        type: "table",
        columns: [
          { key: "a", label: "A", format: "text", tones: { x: "success" } },
        ],
        rows: [],
      },
      {
        type: "table",
        columns: [
          { key: "a", label: "A", format: "status", tones: { x: "purple" } },
        ],
        rows: [],
      },
      {
        type: "table",
        columns: [{ key: "a", label: "A", format: "status", tones: {} }],
        rows: [],
      },
      {
        type: "table",
        columns: [{ key: "a", label: "A" }],
        rows: [],
        filterPlaceholder: "x",
      },
      {
        type: "table",
        columns: [{ key: "a", label: "A", format: "money" }],
        rows: [],
      },
    ])
      expect(() => parseRichSpec(spec(node))).toThrow();
  });
});

describe("progress columns and thumbnail shape", () => {
  it("accepts a progress column and a square product thumbnail", () => {
    const parsed = parseRichSpec({
      version: 1,
      entities: [
        {
          id: "kettle",
          kind: "Kettle",
          title: "Kettle",
          image: "https://example.org/k.jpg",
          thumbShape: "square",
        },
      ],
      nodes: [
        {
          type: "table",
          columns: [
            {
              key: "done",
              label: "Done",
              format: "progress",
              max: 50,
              tone: "success",
            },
          ],
          rows: [{ done: 25 }],
        },
        { type: "entity-list", entityIds: ["kettle"] },
      ],
    });
    expect(parsed.entities?.[0]?.thumbShape).toBe("square");
  });

  it("accepts scatter points and media, and rejects their impossible shapes", () => {
    const parsed = parseRichSpec({
      version: 1,
      nodes: [
        {
          type: "chart",
          kind: "scatter",
          points: [
            { x: 2, y: 8, label: "A" },
            { x: 5, y: 3 },
          ],
          unit: "$k",
          xUnit: "price",
        },
        {
          type: "video",
          src: "https://example.org/clip.mp4",
          poster: "https://example.org/p.jpg",
        },
        { type: "audio", src: "https://example.org/track.mp3", title: "Track" },
      ],
    });
    expect(parsed.nodes).toHaveLength(3);

    for (const node of [
      { type: "chart", kind: "scatter" },
      { type: "chart", kind: "scatter", data: [{ label: "a", value: 1 }] },
      { type: "chart", kind: "line", points: [{ x: 1, y: 1 }] },
      { type: "video", src: "javascript:alert(1)" },
      { type: "audio", src: "ftp://example.org/a.mp3" },
      { type: "video", src: "https://example.org/a.mp4", autoplay: true },
      {
        type: "chart",
        kind: "scatter",
        points: Array.from({ length: 201 }, (_, index) => ({
          x: index,
          y: index,
        })),
      },
    ])
      expect(() => parseRichSpec(spec(node))).toThrow();
  });

  it("accepts equal row columns, column radios and tab icons", () => {
    const parsed = parseRichSpec(
      spec({
        type: "card",
        title: "Concept",
        children: [
          {
            type: "tabs",
            stateKey: "ws",
            tabs: [
              { id: "all", label: "All", icon: "home", children: [] },
              { id: "one", label: "One", icon: "folder", children: [] },
            ],
          },
          {
            type: "row",
            columns: 2,
            children: [{ type: "text", content: "left" }],
          },
          {
            type: "radio",
            stateKey: "session",
            layout: "column",
            options: [
              { label: "A", value: "a" },
              { label: "B", value: "b" },
            ],
          },
        ],
      }),
    );
    expect(parsed.nodes).toHaveLength(1);

    for (const node of [
      { type: "stack", columns: 2, children: [] },
      {
        type: "segmented",
        stateKey: "x",
        layout: "column",
        options: [{ label: "A", value: "a" }],
      },
      {
        type: "tabs",
        stateKey: "ws",
        tabs: [{ id: "a", label: "A", icon: "bad icon!", children: [] }],
      },
    ])
      expect(() => parseRichSpec(spec(node))).toThrow();
  });

  it("accepts nested layers and rejects impossible layer shapes", () => {
    const parsed = parseRichSpec(
      spec({
        type: "layers",
        caption: "One pool, many connections",
        layers: [
          {
            title: "HTTP handlers",
            layers: [
              {
                title: "*sql.DB — pool",
                items: [{ label: "Conn 1", icon: "database", tone: "success" }],
              },
            ],
          },
          { title: "PostgreSQL" },
        ],
      }),
    );
    expect(parsed.nodes[0]).toMatchObject({ type: "layers" });

    for (const node of [
      { type: "layers", layers: [] },
      {
        type: "layers",
        layers: [
          {
            title: "mixed",
            items: [{ label: "a" }],
            layers: [{ title: "nested" }],
          },
        ],
      },
      {
        type: "layers",
        layers: [
          {
            title: "one",
            layers: [
              {
                title: "two",
                layers: [{ title: "three", layers: [{ title: "four" }] }],
              },
            ],
          },
        ],
      },
      {
        type: "layers",
        layers: [
          {
            title: "many",
            items: Array.from({ length: 7 }, (_, index) => ({
              label: `conn ${index}`,
            })),
          },
        ],
      },
    ])
      expect(() => parseRichSpec(spec(node))).toThrow();
  });

  it("rejects progress options on other formats and unknown shapes", () => {
    for (const node of [
      {
        type: "table",
        columns: [{ key: "a", label: "A", format: "number", max: 10 }],
        rows: [],
      },
      {
        type: "table",
        columns: [{ key: "a", label: "A", format: "text", tone: "success" }],
        rows: [],
      },
      {
        type: "table",
        columns: [{ key: "a", label: "A", format: "progress", tone: "purple" }],
        rows: [],
      },
    ])
      expect(() => parseRichSpec(spec(node))).toThrow();
    expect(() =>
      parseRichSpec({
        version: 1,
        entities: [{ id: "a", kind: "x", title: "A", thumbShape: "wide" }],
        nodes: [],
      }),
    ).toThrow();
  });
});

describe("state budget and control coherence", () => {
  it("counts inferred state keys across the whole document", () => {
    const nodes = Array.from({ length: 129 }, (_, index) => ({
      type: "switch",
      stateKey: `key_${index}`,
    }));
    expect(() => parseRichSpec({ version: 1, nodes })).toThrow(
      /Too many state keys/,
    );
  });

  it("rejects an initial value that does not fit its control", () => {
    for (const document of [
      {
        version: 1,
        initialState: { amount: 500 },
        nodes: [{ type: "slider", stateKey: "amount", min: 0, max: 10 }],
      },
      {
        version: 1,
        initialState: { amount: 3 },
        nodes: [
          { type: "slider", stateKey: "amount", min: 0, max: 10, step: 2 },
        ],
      },
      {
        version: 1,
        initialState: { tab: "missing" },
        nodes: [
          {
            type: "tabs",
            stateKey: "tab",
            tabs: [{ id: "a", label: "A", children: [] }],
          },
        ],
      },
      {
        version: 1,
        initialState: { checked: "yes" },
        nodes: [{ type: "checkbox", stateKey: "checked", label: "Check" }],
      },
      {
        version: 1,
        initialState: { choice: "other" },
        nodes: [
          {
            type: "select",
            stateKey: "choice",
            options: [{ label: "A", value: "a" }],
          },
        ],
      },
    ])
      expect(() => parseRichSpec(document)).toThrow(
        /Invalid initial value|conflicting control/,
      );
  });

  it("rejects same-key controls whose ranges or option sets disagree", () => {
    for (const document of [
      {
        version: 1,
        nodes: [
          { type: "slider", stateKey: "n", min: 0, max: 10 },
          { type: "slider", stateKey: "n", min: 20, max: 30 },
        ],
      },
      {
        version: 1,
        nodes: [
          { type: "slider", stateKey: "n", min: 0, max: 10, step: 1 },
          { type: "slider", stateKey: "n", min: 0, max: 10, step: 2 },
        ],
      },
      {
        version: 1,
        nodes: [
          {
            type: "select",
            stateKey: "choice",
            options: [{ label: "A", value: "a" }],
          },
          {
            type: "radio",
            stateKey: "choice",
            options: [{ label: "B", value: "b" }],
          },
        ],
      },
      {
        version: 1,
        nodes: [
          {
            type: "tabs",
            stateKey: "tab",
            tabs: [{ id: "a", label: "A", children: [] }],
          },
          {
            type: "tabs",
            stateKey: "tab",
            tabs: [{ id: "b", label: "B", children: [] }],
          },
        ],
      },
      {
        version: 1,
        nodes: [
          { type: "input", stateKey: "n", inputType: "number" },
          { type: "slider", stateKey: "n", min: 0, max: 10 },
        ],
      },
    ])
      expect(() => parseRichSpec(document)).toThrow(
        /conflicting control constraints/,
      );
  });

  it("allows same-key controls that declare the same domain", () => {
    expect(() =>
      parseRichSpec({
        version: 1,
        nodes: [
          { type: "slider", stateKey: "n", min: 0, max: 10, step: 2 },
          { type: "slider", stateKey: "n", min: 0, max: 10, step: 2 },
          {
            type: "select",
            stateKey: "choice",
            options: [
              { label: "A", value: "a" },
              { label: "B", value: "b" },
            ],
          },
          {
            type: "radio",
            stateKey: "choice",
            options: [
              { label: "B", value: "b" },
              { label: "A", value: "a" },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects empty tabs, conflicting state types and ambiguous charts", () => {
    for (const document of [
      {
        version: 1,
        nodes: [{ type: "tabs", stateKey: "tab", tabs: [] }],
      },
      {
        version: 1,
        nodes: [
          { type: "switch", stateKey: "shared" },
          { type: "slider", stateKey: "shared", min: 0, max: 1 },
        ],
      },
      {
        version: 1,
        nodes: [
          {
            type: "chart",
            kind: "scatter",
            categories: ["a"],
            points: [{ x: 1, y: 2 }],
          },
        ],
      },
      {
        version: 1,
        nodes: [
          {
            type: "chart",
            kind: "bar",
            data: [{ label: "A", value: 1 }],
            categories: ["A"],
            series: [{ label: "S", values: [1] }],
          },
        ],
      },
    ])
      expect(() => parseRichSpec(document)).toThrow();
  });
});

describe("control value domains", () => {
  const dateDoc = (initialState: Record<string, unknown>) => ({
    version: 1,
    initialState,
    nodes: [{ type: "input", stateKey: "day", inputType: "date" }],
  });

  it("accepts a real calendar date, a leap day and a cleared date", () => {
    for (const value of ["2026-10-31", "2028-02-29", ""])
      expect(parseRichSpec(dateDoc({ day: value })).initialState?.day).toBe(
        value,
      );
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });

  it("rejects an impossible or malformed date before rendering", () => {
    for (const value of [
      "not-a-date",
      "2026-02-29",
      "2026-13-01",
      "2026-04-31",
      "2026-1-05",
      20261031,
    ])
      expect(() => parseRichSpec(dateDoc({ day: value }))).toThrow();
  });

  it("separates a date field from a text field on the same key", () => {
    expect(() =>
      parseRichSpec({
        version: 1,
        initialState: { shared: "2026-10-31" },
        nodes: [
          { type: "input", stateKey: "shared", inputType: "date" },
          { type: "input", stateKey: "shared", inputType: "text" },
        ],
      }),
    ).toThrow(/conflicting control constraints/);
  });

  it("rejects an initial string beyond the evaluator budget", () => {
    expect(() =>
      parseRichSpec({
        version: 1,
        initialState: { note: "x".repeat(LIMITS.string + 1) },
        nodes: [{ type: "input", stateKey: "note" }],
      }),
    ).toThrow(/String budget exceeded/);
  });

  it("keeps typed values inside the same bounds as the evaluator", () => {
    expect(stateValueFits({ kind: "date" }, "2026-10-31")).toBe(true);
    expect(stateValueFits({ kind: "date" }, "2026-02-29")).toBe(false);
    expect(stateValueFits({ kind: "number" }, 1e12)).toBe(true);
    expect(stateValueFits({ kind: "number" }, 1e12 + 1)).toBe(false);
    expect(stateValueFits({ kind: "string" }, "x".repeat(LIMITS.string))).toBe(
      true,
    );
    expect(
      stateValueFits({ kind: "string" }, "x".repeat(LIMITS.string + 1)),
    ).toBe(false);
  });
});

describe("media layouts and captions", () => {
  const spec = (extra: Record<string, unknown>) => ({
    version: 1,
    entities: [
      {
        id: "app",
        kind: "App",
        title: "App",
        thumbShape: "landscape",
        galleryLayout: "single",
        images: [
          "https://example.org/shot.png",
          {
            src: "https://example.org/one.png",
            alt: "Window one",
            caption: "The main window.",
          },
        ],
      },
    ],
    nodes: [{ type: "entity-list", entityIds: ["app"], layout: "feature" }],
    ...extra,
  });

  it("accepts a feature list, landscape thumbnails and captioned images", () => {
    const parsed = parseRichSpec(spec({}));
    expect(parsed.nodes[0]).toMatchObject({ layout: "feature" });
    expect(parsed.entities?.[0]?.thumbShape).toBe("landscape");
    expect(parsed.entities?.[0]?.galleryLayout).toBe("single");
    expect(parsed.entities?.[0]?.images).toHaveLength(2);
  });

  it("keeps documents without the new fields valid", () => {
    const parsed = parseRichSpec({
      version: 1,
      entities: [{ id: "a", kind: "App", title: "App" }],
      nodes: [{ type: "entity-list", entityIds: ["a"] }],
    });
    expect(parsed.entities?.[0]?.thumbShape).toBeUndefined();
  });

  it("rejects unknown layouts, shapes and gallery modes", () => {
    for (const node of [
      { type: "entity-list", entityIds: ["app"], layout: "wide" },
      { type: "entity-list", entityIds: ["app"], layout: 3 },
    ])
      expect(() => parseRichSpec({ ...spec({}), nodes: [node] })).toThrow();
    for (const entity of [
      { id: "app", kind: "App", title: "App", thumbShape: "tall" },
      { id: "app", kind: "App", title: "App", galleryLayout: "grid" },
    ])
      expect(() =>
        parseRichSpec({ version: 1, entities: [entity], nodes: [] }),
      ).toThrow();
  });

  it("rejects a malformed captioned image", () => {
    for (const image of [
      { src: "https://example.org/a.png" },
      { alt: "No source" },
      { src: "javascript:alert(1)", alt: "Unsafe" },
      { src: "https://example.org/a.png", alt: "A", caption: 4 },
      { src: "https://example.org/a.png", alt: "A", label: "Unknown" },
    ])
      expect(() =>
        parseRichSpec({
          version: 1,
          entities: [{ id: "a", kind: "App", title: "App", images: [image] }],
          nodes: [],
        }),
      ).toThrow();
  });

  it("accepts captioned image groups and rejects ambiguous forms", () => {
    const parsed = parseRichSpec({
      version: 1,
      nodes: [
        {
          type: "image-group",
          presentation: "gallery",
          alt: "Screens",
          label: "App screens",
          items: [
            {
              src: "https://example.org/a.png",
              alt: "First window",
              caption: "Main view.",
            },
          ],
        },
        {
          type: "image-group",
          src: ["https://example.org/b.png"],
          alt: "Legacy",
        },
      ],
    });
    expect(parsed.nodes).toHaveLength(2);
    for (const node of [
      {
        type: "image-group",
        src: ["https://example.org/a.png"],
        items: [{ src: "https://example.org/b.png", alt: "B" }],
        alt: "Both",
      },
      { type: "image-group", alt: "Neither" },
      { type: "image-group", items: [], alt: "Empty" },
      {
        type: "image-group",
        items: [{ src: "https://example.org/a.png" }],
        alt: "No alt",
      },
      {
        type: "image-group",
        src: ["https://example.org/a.png"],
        alt: "Unsafe mode",
        presentation: "carousel",
      },
    ])
      expect(() => parseRichSpec({ version: 1, nodes: [node] })).toThrow();
  });
});
