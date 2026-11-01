// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RichResponse } from "../../src/ui/RichResponse";
import { LIMITS, type RichNode, type RichSpec } from "../../src/core/schema";

let host: HTMLDivElement;
let root: Root;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  )!;
const division = { op: "div" as const, args: [1, 0] };
describe("RichResponse regressions", () => {
  it("keeps the chart data table hidden inside a clipped wrapper", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "chart",
          kind: "line",
          categories: ["Jan", "Feb"],
          series: [{ label: "Revenue", values: [1, 2] }],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelector("table.ru-sr-only")).toBeNull();
    const wrapper = host.querySelector(".ru-chart .ru-sr-only");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector("table")).not.toBeNull();
    expect(wrapper!.querySelector("caption")?.textContent).toBe(
      "Line chart: 2 categories",
    );
  });

  it("draws stack layers with member chips and a caption", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "layers",
          caption: "One shared pool",
          layers: [
            {
              title: "HTTP handlers",
              detail: "call the database at once",
              icon: "server",
              layers: [
                {
                  title: "*sql.DB — pool",
                  icon: "database",
                  items: [
                    { label: "Conn 1", icon: "database" },
                    { label: "Conn 2", icon: "database" },
                  ],
                },
              ],
            },
            { title: "PostgreSQL", tone: "success" },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const figure = host.querySelector("figure.ru-layers")!;
    expect(figure).not.toBeNull();
    expect(figure.querySelectorAll(".ru-layer").length).toBe(3);
    expect(figure.querySelector(".ru-layer[data-depth='1']")).not.toBeNull();
    expect(
      Array.from(figure.querySelectorAll(".ru-layer-items li")).map((li) =>
        li.textContent?.trim(),
      ),
    ).toEqual(["Conn 1", "Conn 2"]);
    expect(figure.querySelector("figcaption")?.textContent).toBe(
      "One shared pool",
    );
  });

  it("isolates failed expressions and charts without losing healthy content", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        { type: "computed", expr: division },
        {
          type: "chart",
          kind: "bar",
          data: [{ label: "bad", value: { op: "div", args: [1, 0] } }],
        },
        { type: "text", content: "Healthy sibling" },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.textContent).toContain("Healthy sibling");
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(2);
  });
  it("survives a chart that becomes invalid after a successful render", () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { divisor: 1 },
      nodes: [
        {
          type: "slider",
          stateKey: "divisor",
          min: 0,
          max: 10,
          label: "Divisor",
        },
        {
          type: "chart",
          kind: "bar",
          data: [
            {
              label: "Ratio",
              value: { op: "div", args: [1, { state: "divisor" }] },
            },
          ],
        },
        { type: "text", content: "Healthy sibling" },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelector(".ru-chart")).not.toBeNull();
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(slider, "0");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("Healthy sibling");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not render the chart",
    );
  });

  it("renders scatter points with huge coordinates without hanging", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "chart",
          kind: "scatter",
          points: [
            { x: 999999999999.9999, y: 1 },
            { x: 1000000000000, y: 2 },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelectorAll("circle.ru-scatter-point")).toHaveLength(2);
  });

  it("keeps significant digits for small numbers", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "stat", label: "Rate", value: 0.001 }],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelector(".ru-stat-value")?.textContent).toBe("0.001");
  });

  it("keeps numeric calculations valid when a number input is cleared", () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { count: 5 },
      nodes: [
        {
          type: "input",
          stateKey: "count",
          inputType: "number",
          label: "Count",
        },
        {
          type: "computed",
          expr: { op: "mul", args: [{ state: "count" }, 2] },
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector("output")?.textContent).toBe("0");
  });

  it("reports failed actions without unhandled rejection or state corruption", async () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { x: 4 },
      nodes: [
        {
          type: "button",
          label: "Bad set",
          action: { type: "set", key: "x", value: division },
        },
        { type: "computed", expr: { state: "x" } },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    await act(async () => {
      button("Bad set").click();
    });
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Action failed",
    );
    expect(host.querySelector("output")?.textContent).toBe("4");
  });
  it("rejects a set action that would leave the tabs without a valid selection", async () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { tab: "a" },
      nodes: [
        {
          type: "tabs",
          stateKey: "tab",
          tabs: [
            { id: "a", label: "A", children: [] },
            { id: "b", label: "B", children: [] },
          ],
        },
        {
          type: "button",
          label: "Break tabs",
          action: { type: "set", key: "tab", value: "missing" },
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    await act(async () => button("Break tabs").click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Action failed",
    );
    expect(
      host.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toBe("A");
    expect(host.querySelectorAll('[role="tab"][tabindex="0"]').length).toBe(1);
  });

  it("keeps truthiness semantics for a toggle on an unbound key", async () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { details: "yes" },
      nodes: [
        { type: "computed", expr: { state: "details" } },
        {
          type: "button",
          label: "Toggle details",
          action: { type: "toggle", key: "details" },
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelector("output")?.textContent).toBe("yes");
    await act(async () => button("Toggle details").click());
    expect(host.querySelector("output")?.textContent).toBe("false");
    await act(async () => button("Toggle details").click());
    expect(host.querySelector("output")?.textContent).toBe("true");
  });

  it("rejects a set action outside the slider range", async () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        { type: "slider", stateKey: "n", min: 0, max: 10 },
        { type: "computed", expr: { state: "n" } },
        {
          type: "button",
          label: "Out of range",
          action: { type: "set", key: "n", value: 99 },
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.value).toBe("0");
    await act(async () => button("Out of range").click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Action failed",
    );
    expect(slider.value).toBe("0");
    expect(host.querySelector("output")?.textContent).toBe("0");
  });

  it("gives separate tab and radio nodes unique ids even with one state key", () => {
    const tabs = {
      type: "tabs" as const,
      stateKey: "tab",
      tabs: [{ id: "a", label: "A", children: [] }],
    };
    const spec: RichSpec = {
      version: 1,
      initialState: { tab: "a", choice: "x" },
      nodes: [
        tabs,
        { ...tabs, tabs: [{ ...tabs.tabs[0]!, children: [] }] },
        {
          type: "radio",
          stateKey: "choice",
          options: [
            { label: "X", value: "x" },
            { label: "Y", value: "y" },
          ],
        },
        {
          type: "radio",
          stateKey: "choice",
          options: [
            { label: "X", value: "x" },
            { label: "Y", value: "y" },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const ids = Array.from(host.querySelectorAll('[role="tab"]')).map(
      (tab) => tab.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    const panelIds = Array.from(host.querySelectorAll('[role="tabpanel"]')).map(
      (panel) => panel.id,
    );
    expect(new Set(panelIds).size).toBe(panelIds.length);
    const names = Array.from(host.querySelectorAll('input[type="radio"]')).map(
      (input) => input.getAttribute("name"),
    );
    expect(new Set(names).size).toBe(2);
  });

  it("derives streaming preview state from a late-arriving initialState", () => {
    const without = {
      version: 1 as const,
      nodes: [{ type: "computed" as const, expr: { state: "n" } }],
    };
    act(() =>
      root.render(
        <RichResponse spec={without} preview persistenceKey="late" />,
      ),
    );
    expect(host.querySelector("output")?.textContent).toBe("");
    act(() =>
      root.render(
        <RichResponse
          spec={{ ...without, initialState: { n: 2 } }}
          preview
          persistenceKey="late"
        />,
      ),
    );
    expect(host.querySelector("output")?.textContent).toBe("2");
  });

  it("keeps scalar select options distinct despite equal string representations", () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { value: 1 },
      nodes: [
        {
          type: "select",
          stateKey: "value",
          options: [
            { label: "Number", value: 1 },
            { label: "String", value: "1" },
          ],
        },
        {
          type: "computed",
          expr: { op: "eq", args: [{ state: "value" }, "1"] },
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const select = host.querySelector("select")!;
    act(() => {
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector("output")?.textContent).toBe("true");
  });
  it("preserves panel focus on parent state changes and restores opener on Escape", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        { type: "entity-ref", entityId: "one" },
        {
          type: "button",
          label: "Update background",
          action: { type: "toggle", key: "x" },
        },
      ],
      entities: [
        { id: "one", kind: "test", title: "One", related: ["two"] },
        { id: "two", kind: "test", title: "Two" },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} detailMode="modal" />));
    const opener = button("One");
    opener.focus();
    click(opener);
    const related = button("Two");
    related.focus();
    click(button("Update background"));
    expect(document.activeElement).toBe(related);
    expect(document.body.style.overflow).toBe("hidden");
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });
  it("renders entity cast members with roles in the detail panel", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "one" }],
      entities: [
        {
          id: "one",
          kind: "Film",
          title: "One",
          cast: [
            { name: "Ada", role: "Pilot" },
            { name: "Bo", role: "Engineer" },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} detailMode="modal" />));
    click(button("One"));
    expect(document.querySelectorAll(".ru-cast > li")).toHaveLength(2);
    expect(document.querySelector(".ru-cast-initial")?.textContent).toBe("A");
    expect(document.querySelector(".ru-cast")?.textContent).toContain("Pilot");
  });
  it("recaptures escaped keyboard focus and wraps backward in the modal", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "one" }],
      entities: [
        {
          id: "one",
          kind: "test",
          title: "One",
          sources: [{ title: "Source", url: "https://example.org" }],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} detailMode="modal" />));
    const opener = button("One");
    click(opener);
    opener.focus();
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    const close = document.querySelector('[aria-label="Close details"]');
    expect(document.activeElement).toBe(close);
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(document.querySelector(".ru-source"));
  });
  it("inerts the page behind a modal and restores it on close", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "one" }],
      entities: [{ id: "one", kind: "test", title: "One" }],
    };
    act(() => root.render(<RichResponse spec={spec} detailMode="modal" />));
    click(button("One"));
    expect(host.hasAttribute("inert")).toBe(true);
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(host.hasAttribute("inert")).toBe(false);
  });
  it("defaults desktop to a non-modal drawer: no lock, no trap, Escape closes", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "one" }],
      entities: [{ id: "one", kind: "test", title: "One" }],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const opener = button("One");
    opener.focus();
    click(opener);
    const panel = document.querySelector('[role="complementary"]')!;
    expect(panel).not.toBeNull();
    expect(panel.hasAttribute("aria-modal")).toBe(false);
    expect(document.body.style.overflow).toBe("");
    // A drawer that never takes focus leaves Escape dead, so the caret moves
    // into the panel without locking the page or trapping Tab.
    expect(panel.contains(document.activeElement)).toBe(true);
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    act(() => document.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(false);
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="complementary"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it("keeps Escape operational after related entity navigation removes the focused button", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "one" }],
      entities: [
        { id: "one", kind: "test", title: "One", related: ["two"] },
        { id: "two", kind: "test", title: "Two" },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const opener = button("One");
    opener.focus();
    click(opener);
    const related = button("Two");
    related.focus();
    click(related);
    expect(document.activeElement).toBe(
      document.querySelector('[aria-label="Close details"]'),
    );
    expect(document.querySelector(".ru-detail h2")?.textContent).toBe("Two");
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector(".ru-detail")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it("uses a modal sheet on mobile even in default drawer mode", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    try {
      const spec: RichSpec = {
        version: 1,
        nodes: [{ type: "entity-ref", entityId: "one" }],
        entities: [{ id: "one", kind: "test", title: "One" }],
      };
      act(() => root.render(<RichResponse spec={spec} />));
      click(button("One"));
      expect(
        document.querySelector('[role="dialog"]')?.getAttribute("aria-modal"),
      ).toBe("true");
      expect(document.body.style.overflow).toBe("hidden");
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: original,
      });
    }
  });
  it("preserves poster layout classes on failed entity images", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "one" }],
      entities: [
        {
          id: "one",
          kind: "test",
          title: "One",
          image: "https://example.org/poster.jpg",
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(
      host.querySelector(".ru-image-fallback")?.classList.contains("ru-poster"),
    ).toBe(true);
  });
  it("carries local dark/auto theme into body portal and tracks changes", async () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "one" }],
      entities: [{ id: "one", kind: "test", title: "One" }],
    };
    host.dataset.theme = "dark";
    act(() => root.render(<RichResponse spec={spec} />));
    click(button("One"));
    expect(
      document.querySelector(".ru-overlay")?.getAttribute("data-theme"),
    ).toBe("dark");
    await act(async () => {
      host.dataset.theme = "auto";
      await Promise.resolve();
    });
    expect(
      document.querySelector(".ru-overlay")?.getAttribute("data-theme"),
    ).toBe("auto");
  });

  it("detects the host dark attribute even without a data-theme element", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "one" }],
      entities: [{ id: "one", kind: "test", title: "One" }],
    };
    document.body.dataset.dsDarkTheme = "";
    act(() => root.render(<RichResponse spec={spec} />));
    click(button("One"));
    const overlay = document.querySelector(".ru-overlay");
    expect(overlay?.getAttribute("data-theme")).toBe("dark");
    expect(overlay?.hasAttribute("data-rich-ui-root")).toBe(true);
    delete document.body.dataset.dsDarkTheme;
  });
});

describe("dashboard vocabulary", () => {
  it("draws scatter points with an accessible table and media controls", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "chart",
          kind: "scatter",
          points: [
            { x: 1, y: 2, label: "A" },
            { x: 3, y: 4 },
          ],
          unit: "$k",
          xUnit: "price",
        },
        { type: "video", src: "https://example.org/clip.mp4", title: "Clip" },
        { type: "audio", src: "https://example.org/track.mp3" },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const points = host.querySelectorAll(".ru-scatter-point");
    expect(points.length).toBe(2);
    expect(points[0]!.getAttribute("tabindex")).toBe("0");
    expect(points[0]!.getAttribute("aria-label")).toContain("2 $k");
    act(() =>
      points[0]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
    );
    expect(host.querySelector(".ru-chart-tip")?.textContent).toContain("A");
    expect(
      host.querySelector(".ru-chart-scatter .ru-sr-only table"),
    ).not.toBeNull();
    const video = host.querySelector("video");
    expect(video?.getAttribute("src")).toBe("https://example.org/clip.mp4");
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.hasAttribute("autoplay")).toBe(false);
    expect(video?.getAttribute("aria-label")).toBe("Clip");
    expect(host.querySelector("audio")?.hasAttribute("controls")).toBe(true);
    act(() => video!.dispatchEvent(new Event("error", { bubbles: false })));
    expect(host.querySelector(".ru-media-fallback")?.textContent).toContain(
      "Video unavailable.",
    );
    expect(
      host.querySelector(".ru-media-fallback a")?.getAttribute("href"),
    ).toBe("https://example.org/clip.mp4");
    act(() =>
      root.render(
        <RichResponse
          spec={{
            ...spec,
            nodes: [
              spec.nodes[0]!,
              {
                type: "video",
                src: "https://example.org/fixed.mp4",
                title: "Fixed",
              },
              { type: "audio", src: "https://example.org/track.mp3" },
            ],
          }}
        />,
      ),
    );
    expect(host.querySelector("video")?.getAttribute("src")).toBe(
      "https://example.org/fixed.mp4",
    );
    expect(host.querySelector(".ru-media-fallback")).toBeNull();
  });

  it("keeps sub-micro line chart ticks distinct", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "chart",
          kind: "line",
          categories: ["A", "B"],
          series: [{ label: "Rate", values: [0, 1e-7] }],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const labels = [...host.querySelectorAll("text.ru-axis")].map(
      (node) => node.textContent,
    );
    expect(labels.some((label) => label?.includes("e-7"))).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("rejects negative donut values instead of drawing a contradictory ring", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "chart",
          kind: "donut",
          data: [
            { label: "Loss", value: -5 },
            { label: "Gain", value: 10 },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelector(".ru-chart")).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "cannot be negative",
    );
  });

  it("rejects a negative donut value produced by state", () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { change: -3 },
      nodes: [
        {
          type: "chart",
          kind: "donut",
          data: [
            { label: "Before", value: 10 },
            { label: "Change", value: { state: "change" } },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "cannot be negative",
    );
  });

  it("keeps diagram connector text in the accessibility tree", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "diagram",
          steps: [
            { id: "a", label: "Start" },
            { id: "b", label: "Fallback", connector: "on failure" },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const connector = host.querySelector(".ru-diagram-link")!;
    expect(connector.getAttribute("aria-hidden")).toBeNull();
    expect(connector.textContent).toContain("on failure");
    expect(connector.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("does not submit an enclosing form from local controls", () => {
    let submits = 0;
    const spec: RichSpec = {
      version: 1,
      entities: [{ id: "one", kind: "test", title: "One" }],
      nodes: [
        {
          type: "tabs",
          stateKey: "tab",
          tabs: [
            { id: "a", label: "A", children: [] },
            { id: "b", label: "B", children: [] },
          ],
        },
        {
          type: "button",
          label: "Act",
          action: { type: "toggle", key: "flag" },
        },
        { type: "entity-ref", entityId: "one" },
      ],
    };
    act(() =>
      root.render(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submits += 1;
          }}
        >
          <RichResponse spec={spec} />
        </form>,
      ),
    );
    click(button("B"));
    click(button("Act"));
    click(button("One"));
    expect(submits).toBe(0);
  });

  it("labels small scatter ticks with significant digits", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "chart",
          kind: "scatter",
          points: [
            { x: 0.001, y: 0.001 },
            { x: 0.002, y: 0.002 },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const labels = [...host.querySelectorAll("text.ru-axis")].map(
      (node) => node.textContent,
    );
    expect(labels).toContain("0.001");
  });

  it("sorts a table locally and reports the sort direction", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "table",
          sortable: true,
          columns: [
            { key: "name", label: "Name" },
            { key: "value", label: "Value", align: "right" },
          ],
          rows: [
            { name: "Beta", value: 20 },
            { name: "Alpha", value: 10 },
            { name: "Gamma", value: 15 },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const first = () => host.querySelector("tbody tr td")?.textContent;
    expect(first()).toBe("Beta");
    const header = Array.from(host.querySelectorAll("th")).find((cell) =>
      cell.textContent?.includes("Value"),
    )!;
    click(header.querySelector("button")!);
    expect(first()).toBe("Alpha");
    expect(header.getAttribute("aria-sort")).toBe("ascending");
    click(header.querySelector("button")!);
    expect(first()).toBe("Beta");
    expect(header.getAttribute("aria-sort")).toBe("descending");
    click(header.querySelector("button")!);
    expect(
      Array.from(host.querySelectorAll("tbody tr td:first-child")).map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(header.getAttribute("aria-sort")).toBe("none");
  });

  it("renders charts, diagrams, stats and highlighted code without throwing", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "chart",
          kind: "line",
          categories: ["Jan", "Feb"],
          series: [
            { label: "Revenue", values: [10, 20] },
            { label: "Cost", values: [5, 8] },
          ],
        },
        {
          type: "diagram",
          steps: [
            { id: "a", label: "Start" },
            { id: "b", label: "End", connector: "next" },
          ],
        },
        { type: "stat", label: "Users", value: 12480, delta: 4.2 },
        { type: "progress", value: 65, label: "Done" },
        { type: "code", code: "const value = 1;", language: "ts" },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.textContent).toContain("Revenue");
    expect(host.textContent).toContain("Cost");
    expect(host.querySelectorAll(".ru-diagram-card")).toHaveLength(2);
    expect(
      host
        .querySelector(".ru-stat-value")
        ?.textContent?.replace(/\u00a0/g, " "),
    ).toBe("12,480");
    expect(
      host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).toBe("65");
    expect(host.querySelectorAll(".ru-tok-keyword").length).toBeGreaterThan(0);
  });

  it("keeps a non-http inline link as literal text", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "text",
          content:
            "See [x](javascript:alert(1)) and [site](https://example.org).",
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const links = host.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("https://example.org");
    expect(host.textContent).toContain("javascript:alert(1)");
  });
});

describe("table formats and filtering", () => {
  const spec: RichSpec = {
    version: 1,
    nodes: [
      {
        type: "table",
        filterable: true,
        sortable: true,
        columns: [
          { key: "task", label: "Task" },
          {
            key: "state",
            label: "State",
            format: "status",
            tones: { Done: "success", Blocked: "danger" },
          },
        ],
        rows: [
          { task: "Design", state: "Done" },
          { task: "Build", state: "Blocked" },
          { task: "Test", state: "Waiting" },
        ],
      },
    ],
  };

  it("renders semantic status pills and filters rows locally", () => {
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelectorAll(".ru-status-pill")).toHaveLength(3);
    expect(
      host.querySelector('.ru-status-pill[data-tone="success"]')?.textContent,
    ).toBe("Done");
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Filter the table"]',
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "Build");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(host.querySelector("tbody tr td")?.textContent).toBe("Build");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "1 of 3",
    );
  });

  it("shows a no-results row instead of an empty table", () => {
    act(() => root.render(<RichResponse spec={spec} />));
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Filter the table"]',
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "nothing");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector(".ru-table-none")?.textContent).toBe(
      "Nothing found",
    );
  });
});

describe("progress columns and thumbnails", () => {
  it("renders a progress bar with its numeric state", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "table",
          columns: [
            {
              key: "done",
              label: "Done",
              format: "progress",
              tone: "success",
            },
          ],
          rows: [{ done: 65 }, { done: 120 }],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const bars = host.querySelectorAll('[role="progressbar"]');
    expect(bars).toHaveLength(2);
    expect(bars[0]?.getAttribute("aria-valuenow")).toBe("65");
    expect(bars[1]?.getAttribute("aria-valuenow")).toBe("100");
    expect(host.querySelector("output")?.textContent).toBe("65%");
  });

  it("uses a square row thumbnail when the entity asks for it", () => {
    const spec: RichSpec = {
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
      nodes: [{ type: "entity-list", entityIds: ["kettle"] }],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelector(".ru-poster-thumb")?.className).toContain(
      "ru-poster-square",
    );
  });
});

describe("host entity surface", () => {
  const spec: RichSpec = {
    version: 1,
    nodes: [{ type: "entity-ref", entityId: "one" }],
    entities: [{ id: "one", kind: "test", title: "One" }],
  };

  it("hands the entity to the host and opens no local drawer", () => {
    const open = vi.fn(() => true);
    act(() => root.render(<RichResponse spec={spec} onOpenEntity={open} />));
    click(button("One"));
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ id: "one" }),
      expect.any(Array),
    );
    expect(document.querySelector('[role="complementary"]')).toBeNull();
  });

  it("keeps the local drawer when the host declines", () => {
    const open = vi.fn(() => false);
    act(() => root.render(<RichResponse spec={spec} onOpenEntity={open} />));
    click(button("One"));
    expect(open).toHaveBeenCalled();
    expect(document.querySelector('[role="complementary"]')).not.toBeNull();
  });
});

describe("entity detail gallery", () => {
  const spec: RichSpec = {
    version: 1,
    nodes: [{ type: "entity-ref", entityId: "three" }],
    entities: [
      {
        id: "three",
        kind: "Film",
        title: "Three",
        images: [
          "https://example.org/1.jpg",
          "https://example.org/2.jpg",
          "https://example.org/3.jpg",
        ],
      },
    ],
  };

  it("shows two photos per page and pages with the dots", () => {
    act(() => root.render(<RichResponse spec={spec} />));
    click(document.querySelector('[aria-label="Details: Three"]')!);
    const photos = () =>
      document.querySelectorAll(".ru-detail-page .ru-detail-photo");
    expect(photos()).toHaveLength(2);
    const dots = document.querySelectorAll(".ru-detail-dots button");
    expect(dots).toHaveLength(2);
    click(dots[1]!);
    expect(photos()).toHaveLength(1);
    expect(photos()[0]!.getAttribute("alt")).toBe("Three — image 3");
    expect(
      document.querySelector(".ru-detail-dots button[aria-pressed='true']"),
    ).toBe(dots[1]);
  });

  it("pages a long gallery with arrows and a counter, not endless dots", () => {
    const many: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "many" }],
      entities: [
        {
          id: "many",
          kind: "Film",
          title: "Many",
          images: Array.from(
            { length: 12 },
            (_, index) => `https://example.org/${index + 1}.jpg`,
          ),
        },
      ],
    };
    act(() => root.render(<RichResponse spec={many} />));
    click(document.querySelector('[aria-label="Details: Many"]')!);
    expect(document.querySelectorAll(".ru-detail-dots")).toHaveLength(0);
    const counter = () => document.querySelector(".ru-detail-pager output");
    const photos = () =>
      document.querySelectorAll(".ru-detail-page .ru-detail-photo");
    expect(counter()?.textContent).toBe("1 / 6");
    expect(photos()[0]!.getAttribute("alt")).toBe("Many — image 1");
    click(document.querySelector('[aria-label="Next photos"]')!);
    click(document.querySelector('[aria-label="Next photos"]')!);
    expect(counter()?.textContent).toBe("3 / 6");
    expect(photos()[0]!.getAttribute("alt")).toBe("Many — image 5");
    click(document.querySelector('[aria-label="Previous photos"]')!);
    expect(counter()?.textContent).toBe("2 / 6");
    for (let i = 0; i < 4; i++)
      click(document.querySelector('[aria-label="Next photos"]')!);
    expect(counter()?.textContent).toBe("6 / 6");
    expect(
      document
        .querySelector('[aria-label="Next photos"]')!
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("keeps the single hero when there is one photo", () => {
    const one: RichSpec = {
      version: 1,
      nodes: [{ type: "entity-ref", entityId: "one" }],
      entities: [
        {
          id: "one",
          kind: "Film",
          title: "One",
          image: "https://example.org/one.jpg",
        },
      ],
    };
    act(() => root.render(<RichResponse spec={one} />));
    click(document.querySelector('[aria-label="Details: One"]')!);
    expect(document.querySelector(".ru-detail-gallery-pair")).toBeNull();
    expect(document.querySelectorAll(".ru-detail-dots")).toHaveLength(0);
    expect(document.querySelectorAll(".ru-detail-photo")).toHaveLength(1);
  });
});

describe("inline entity chips", () => {
  const spec: RichSpec = {
    version: 1,
    entities: [{ id: "one", kind: "test", title: "One" }],
    nodes: [
      {
        type: "text",
        content: "Start with [[one]], compare [[missing]] and read later.",
      },
    ],
  };

  it("opens a declared entity from a sentence and keeps unknown ids literal", () => {
    const open = vi.fn(() => true);
    act(() => root.render(<RichResponse spec={spec} onOpenEntity={open} />));
    const chip = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open: One"]',
    )!;
    expect(chip.textContent).toContain("One");
    click(chip);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ id: "one" }),
      expect.any(Array),
    );
    expect(host.textContent).toContain("[[missing]]");
  });

  it("falls back to the local drawer when no host surface is provided", () => {
    act(() => root.render(<RichResponse spec={spec} />));
    click(host.querySelector("button.ru-inline-entity")!);
    expect(document.querySelector(".ru-detail h2")?.textContent).toBe("One");
  });
});

describe("typed input bounds", () => {
  const setValue = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  it("refuses a typed number the evaluator cannot use", () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { count: 5 },
      nodes: [
        {
          type: "input",
          stateKey: "count",
          inputType: "number",
          label: "Count",
        },
        {
          type: "computed",
          expr: { op: "mul", args: [{ state: "count" }, 2] },
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    setValue(input, "1000000000001");
    expect(host.querySelector("output")?.textContent).toBe("10");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector(".ru-field-error")?.textContent).toContain(
      "between",
    );
  });

  it("recovers when the reader corrects an out-of-range number", () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { count: 5 },
      nodes: [
        {
          type: "input",
          stateKey: "count",
          inputType: "number",
          label: "Count",
        },
        { type: "computed", expr: { state: "count" } },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    setValue(input, "1e13");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    setValue(input, "42");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(host.querySelector("output")?.textContent).toBe("42");
  });

  it("caps a long text value at the document string budget", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [{ type: "input", stateKey: "note", label: "Note" }],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    setValue(input, "x".repeat(LIMITS.string + 100));
    expect(input.value).toHaveLength(LIMITS.string);
  });

  it("rejects an impossible date written by a set action", async () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { day: "2026-10-31" },
      nodes: [
        { type: "input", stateKey: "day", inputType: "date", label: "Day" },
        {
          type: "button",
          label: "Bad date",
          action: { type: "set", key: "day", value: "2026-02-29" },
        },
        { type: "computed", expr: { state: "day" } },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    await act(async () => {
      button("Bad date").click();
    });
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Action failed",
    );
    expect(host.querySelector("output")?.textContent).toBe("2026-10-31");
  });

  it("shows a valid date and never invents a cleared one", () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { day: "2026-10-31" },
      nodes: [
        { type: "input", stateKey: "day", inputType: "date", label: "Day" },
        { type: "computed", expr: { state: "day" } },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(
      host.querySelector<HTMLInputElement>('input[type="date"]')!.value,
    ).toBe("2026-10-31");
    expect(host.querySelector("output")?.textContent).toBe("2026-10-31");
  });
});

describe("local state isolation", () => {
  const filtered = (rows: string[]): RichNode => ({
    type: "table",
    filterable: true,
    columns: [{ key: "k", label: "Name" }],
    rows: rows.map((k) => ({ k })),
  });
  const sorted = (name: string): RichNode => ({
    type: "table",
    sortable: true,
    columns: [{ key: "k", label: "Name" }],
    rows: [{ k: name }],
  });
  const rows = () =>
    Array.from(host.querySelectorAll("tbody tr td")).map(
      (cell) => cell.textContent,
    );

  it("does not carry a table filter into another tab", () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { view: "a" },
      nodes: [
        {
          type: "tabs",
          stateKey: "view",
          tabs: [
            {
              id: "a",
              label: "First",
              children: [filtered(["Alpha", "Beta"])],
            },
            {
              id: "b",
              label: "Second",
              children: [filtered(["Gamma", "Delta"])],
            },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const filter = () =>
      host.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(filter(), "Alpha");
      filter().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toEqual(["Alpha"]);
    click(
      Array.from(host.querySelectorAll('[role="tab"]')).find((tab) =>
        tab.textContent?.includes("Second"),
      )!,
    );
    expect(filter().value).toBe("");
    expect(rows()).toEqual(["Gamma", "Delta"]);
  });

  it("forgets a sort when a conditional switches branches", () => {
    const spec: RichSpec = {
      version: 1,
      initialState: { alt: false },
      nodes: [
        { type: "switch", stateKey: "alt", label: "Alternate" },
        {
          type: "conditional",
          when: { state: "alt" },
          children: [sorted("First")],
          elseChildren: [sorted("Second")],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const header = () => host.querySelector("th")!;
    expect(header().getAttribute("aria-sort")).toBe("none");
    click(header().querySelector("button")!);
    expect(header().getAttribute("aria-sort")).toBe("ascending");
    const toggle = host.querySelector<HTMLInputElement>(
      'input[role="switch"]',
    )!;
    click(toggle);
    expect(header().getAttribute("aria-sort")).toBe("none");
    expect(rows()).toEqual(["First"]);
  });
});

describe("wide table affordance", () => {
  const spec: RichSpec = {
    version: 1,
    nodes: [
      {
        type: "table",
        columns: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
        rows: [{ a: 1, b: 2 }],
      },
    ],
  };

  it("shows the hint only while content continues to the right", () => {
    const scrollWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );
    const clientWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );
    const scrollLeft = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollLeft",
    );
    let left = 0;
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get: () => 600,
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 300,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
      configurable: true,
      get: () => left,
      set: () => undefined,
    });
    try {
      act(() => root.render(<RichResponse spec={spec} />));
      expect(host.querySelector(".ru-table-more")).not.toBeNull();
      expect(host.querySelector<HTMLElement>(".ru-table-wrap")!.tabIndex).toBe(
        0,
      );
      left = 300;
      act(() => {
        host
          .querySelector(".ru-table-wrap")!
          .dispatchEvent(new Event("scroll"));
      });
      expect(host.querySelector(".ru-table-more")).toBeNull();
    } finally {
      for (const [name, original] of [
        ["scrollWidth", scrollWidth],
        ["clientWidth", clientWidth],
        ["scrollLeft", scrollLeft],
      ] as const) {
        if (original)
          Object.defineProperty(HTMLElement.prototype, name, original);
        else delete (HTMLElement.prototype as never)[name];
      }
    }
  });
});

describe("spacious entity rows", () => {
  const base: RichSpec = {
    version: 1,
    entities: [
      {
        id: "krita",
        kind: "Painting",
        title: "Krita",
        subtitle: "Painting and animation",
        description:
          "Brush engines, wrap-around painting and a frame-by-frame timeline for animation work.",
        thumbShape: "landscape",
        galleryLayout: "single",
        image: "https://example.org/krita.png",
        images: [
          {
            src: "https://example.org/krita.png",
            alt: "Krita workspace",
            caption: "The main window.",
          },
          {
            src: "https://example.org/krita-brushes.png",
            alt: "Brush presets",
            caption: "Brush settings.",
          },
        ],
        badge: { label: "Best for drawing", tone: "success" },
        sources: [{ title: "krita.org", url: "https://krita.org/" }],
      },
    ],
    nodes: [{ type: "entity-list", entityIds: ["krita"], layout: "feature" }],
  };

  it("shows the wide preview, the whole description and its sources", () => {
    act(() => root.render(<RichResponse spec={base} />));
    expect(host.querySelector('[data-layout="feature"]')).not.toBeNull();
    expect(host.querySelector(".ru-feature-media")).not.toBeNull();
    expect(host.querySelector(".ru-poster-thumb")?.className).toContain(
      "ru-poster-landscape",
    );
    const description = host.querySelector(".ru-feature-description");
    expect(description?.textContent).toContain("frame-by-frame");
    expect(description?.className).not.toContain("clamp");
    const source = host.querySelector(".ru-entity-sources a");
    expect(source?.getAttribute("href")).toBe("https://krita.org/");
    // Links must not sit inside the row button.
    expect(source?.closest("button")).toBeNull();
  });

  it("opens the detail panel from the title without nesting the links", () => {
    act(() => root.render(<RichResponse spec={base} />));
    click(host.querySelector(".ru-feature-title button")!);
    expect(document.querySelector(".ru-detail h2")?.textContent).toBe("Krita");
    expect(
      document.querySelector(".ru-detail .ru-gallery-caption")?.textContent,
    ).toBe("The main window.");
    const next = document.querySelector<HTMLButtonElement>(
      '.ru-detail .ru-gallery-controls button[aria-label="Next image"]',
    );
    click(next!);
    expect(
      document.querySelector(".ru-detail .ru-gallery-caption")?.textContent,
    ).toBe("Brush settings.");
  });

  it("keeps the compact list when no layout is requested", () => {
    act(() =>
      root.render(
        <RichResponse
          spec={{
            ...base,
            nodes: [{ type: "entity-list", entityIds: ["krita"] }],
          }}
        />,
      ),
    );
    expect(host.querySelector('[data-layout="compact"]')).not.toBeNull();
    expect(host.querySelector(".ru-entity-row")).not.toBeNull();
    expect(host.querySelector(".ru-entity-feature")).toBeNull();
  });
});

describe("captioned galleries", () => {
  it("changes the caption with the frame and stops at the ends", () => {
    const spec: RichSpec = {
      version: 1,
      nodes: [
        {
          type: "image-group",
          presentation: "gallery",
          alt: "Screens",
          items: [
            {
              src: "https://example.org/a.png",
              alt: "First",
              caption: "Main window.",
            },
            {
              src: "https://example.org/b.png",
              alt: "Second",
              caption: "Brush settings.",
            },
          ],
        },
      ],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    expect(host.querySelector(".ru-gallery-caption")?.textContent).toBe(
      "Main window.",
    );
    const [prev, next] = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".ru-gallery-controls button"),
    );
    expect(prev?.disabled).toBe(true);
    click(next!);
    expect(host.querySelector(".ru-gallery-caption")?.textContent).toBe(
      "Brush settings.",
    );
    expect(host.querySelector(".ru-gallery-controls output")?.textContent).toBe(
      "2 / 2",
    );
    expect(next?.disabled).toBe(true);
  });

  it("renders an inline gallery from legacy URLs without captions", () => {
    act(() =>
      root.render(
        <RichResponse
          spec={{
            version: 1,
            nodes: [
              {
                type: "image-group",
                presentation: "gallery",
                alt: "Legacy screens",
                src: ["https://example.org/a.png"],
              },
            ],
          }}
        />,
      ),
    );
    expect(host.querySelector(".ru-gallery-caption")?.textContent).toBe(
      "Legacy screens — image 1",
    );
    expect(host.querySelector(".ru-gallery-controls")).toBeNull();
  });

  it("keeps the lightbox trigger for the default presentation", () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    act(() =>
      root.render(
        <RichResponse
          spec={{
            version: 1,
            nodes: [
              {
                type: "image-group",
                alt: "Screens",
                items: [
                  {
                    src: "https://example.org/a.png",
                    alt: "First",
                    caption: "Main window.",
                  },
                ],
              },
            ],
          }}
        />,
      ),
    );
    const trigger = host.querySelector(".ru-primitive-trigger");
    expect(trigger?.textContent).toContain("Open gallery");
    click(trigger!);
    expect(
      document.querySelector(".ru-primitive-lightbox-caption")?.textContent,
    ).toBe("Main window.");
  });
});

describe("feature rows without a preview", () => {
  it("keeps the text in the only column and still opens the panel", () => {
    const spec: RichSpec = {
      version: 1,
      entities: [
        {
          id: "plain",
          kind: "Tool",
          title: "Plain tool",
          description: "No screenshot is available for this one.",
        },
      ],
      nodes: [{ type: "entity-list", entityIds: ["plain"], layout: "feature" }],
    };
    act(() => root.render(<RichResponse spec={spec} />));
    const row = host.querySelector(".ru-entity-feature");
    expect(row?.getAttribute("data-media")).toBe("none");
    expect(host.querySelector(".ru-feature-media")).toBeNull();
    expect(
      host.querySelector(".ru-feature-description")?.textContent,
    ).toContain("No screenshot");
    click(host.querySelector(".ru-feature-title button")!);
    expect(document.querySelector(".ru-detail h2")?.textContent).toBe(
      "Plain tool",
    );
  });
});

describe("preview shape defaults", () => {
  const entity = (
    extra: Partial<
      RichSpec["entities"] extends (infer E)[] | undefined ? E : never
    >,
  ) => ({
    id: "app",
    kind: "App",
    title: "App",
    image: "https://example.org/app.png",
    ...extra,
  });

  it("defaults a feature row to the wide frame and a compact row to the poster", () => {
    act(() =>
      root.render(
        <RichResponse
          spec={{
            version: 1,
            entities: [entity({})],
            nodes: [
              { type: "entity-list", entityIds: ["app"], layout: "feature" },
            ],
          }}
        />,
      ),
    );
    expect(host.querySelector(".ru-poster-thumb")?.className).toContain(
      "ru-poster-landscape",
    );
    act(() =>
      root.render(
        <RichResponse
          spec={{
            version: 1,
            entities: [entity({})],
            nodes: [{ type: "entity-list", entityIds: ["app"] }],
          }}
        />,
      ),
    );
    expect(host.querySelector(".ru-poster-thumb")?.className).toContain(
      "ru-poster-poster",
    );
  });

  it("honours an explicit poster shape inside a feature row", () => {
    act(() =>
      root.render(
        <RichResponse
          spec={{
            version: 1,
            entities: [entity({ thumbShape: "poster" })],
            nodes: [
              { type: "entity-list", entityIds: ["app"], layout: "feature" },
            ],
          }}
        />,
      ),
    );
    expect(host.querySelector(".ru-poster-thumb")?.className).toContain(
      "ru-poster-poster",
    );
    expect(host.querySelector(".ru-feature-media")?.className).toContain(
      "ru-feature-media-poster",
    );
  });
});
