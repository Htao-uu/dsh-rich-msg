import type { RichSpec, Expr, RichNode } from "../core/schema";
const state = (key: string): Expr => ({ state: key });
const op = (op: string, ...args: Expr[]): Expr => ({ op, args }) as Expr;
export const technical: RichSpec = {
  version: 1,
  title: "Why the task hangs",
  nodes: [
    {
      type: "text",
      content:
        "The context is cancelled, but the worker still tries to send its result. The receiver has already finished.",
    },
    {
      type: "card",
      title: "What happens in the task",
      children: [
        {
          type: "row",
          children: [
            { type: "icon", name: "clock", tone: "muted" },
            {
              type: "text",
              content: "0 ms — worker receives `7` and starts `Sleep(100ms)`",
            },
          ],
        },
        {
          type: "row",
          children: [
            { type: "icon", name: "error", tone: "danger" },
            {
              type: "text",
              content: "~10 ms — the context is cancelled, the consumer exits",
            },
          ],
        },
        {
          type: "row",
          children: [
            { type: "icon", name: "clock", tone: "muted" },
            {
              type: "text",
              content: "~100 ms — the worker wakes up and sends `14`",
            },
          ],
        },
        { type: "divider" },
        {
          type: "row",
          children: [
            { type: "icon", name: "lock", tone: "warning" },
            {
              type: "text",
              content: "**Worker:** blocked on `results <- value`",
            },
          ],
        },
        {
          type: "row",
          children: [
            { type: "icon", name: "lock", tone: "warning" },
            { type: "text", content: "**Coordinator:** waits on `wg.Wait()`" },
          ],
        },
        {
          type: "row",
          children: [
            { type: "icon", name: "x", tone: "danger" },
            {
              type: "text",
              content: "`close(results)` never runs",
            },
          ],
        },
      ],
    },
    {
      type: "text",
      variant: "subtitle",
      content: "Sending must respect cancellation too",
    },
    {
      type: "diagram",
      direction: "horizontal",
      caption: "Event order in the task: cancellation arrives before the send.",
      steps: [
        {
          id: "worker",
          label: "Worker",
          detail: "Sleep(100ms)",
          connector: "0 ms",
        },
        {
          id: "cancel",
          label: "Context cancelled",
          detail: "the consumer exits",
          tone: "warning",
          connector: "10 ms",
        },
        {
          id: "send",
          label: "Send 14",
          detail: "blocks forever",
          tone: "danger",
          connector: "100 ms",
        },
        {
          id: "wait",
          label: "Coordinator",
          detail: "waiting on wg.Wait()",
          tone: "warning",
        },
      ],
    },
    {
      type: "code",
      language: "go",
      title: "Sending with cancellation",
      lineNumbers: true,
      code: "select {\ncase results <- value:\ncase <-ctx.Done():\n    return\n}",
    },
  ],
};
export const films: RichSpec = {
  version: 1,
  title: "When you feel like some good science fiction",
  entities: [
    {
      id: "interstellar",
      kind: "Film",
      title: "Interstellar",
      subtitle: "2014 · Science fiction · 169 min",
      description:
        "An expedition beyond the Solar System, time, and the bond between people. For an evening when you want a grand journey and to feel something.",
      image: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
      images: [
        "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
        "https://image.tmdb.org/t/p/w780/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
      ],
      facts: [
        { label: "Director", value: "Christopher Nolan" },
        { label: "Year", value: 2014 },
        { label: "Runtime", value: "169 min" },
      ],
      cast: [
        { name: "Matthew McConaughey", role: "Cooper" },
        { name: "Anne Hathaway", role: "Brand" },
        { name: "Jessica Chastain", role: "Murph" },
      ],
      sources: [
        {
          title: "Movie page · TMDB",
          url: "https://www.themoviedb.org/movie/157336-interstellar",
        },
      ],
      related: ["arrival"],
    },
    {
      id: "arrival",
      kind: "Film",
      title: "Arrival",
      subtitle: "2016 · Science fiction · 116 min",
      description:
        "A linguist tries to understand the language of the visitors who came to Earth. A quiet, focused story about perception and choice.",
      image: "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
      facts: [
        { label: "Director", value: "Denis Villeneuve" },
        { label: "Year", value: 2016 },
      ],
      sources: [
        {
          title: "Movie page · TMDB",
          url: "https://www.themoviedb.org/movie/329865-arrival",
        },
      ],
      related: ["interstellar"],
    },
    {
      id: "martian",
      kind: "Film",
      title: "The Martian",
      subtitle: "2015 · Adventure · 144 min",
      description:
        "One man on Mars, engineering ingenuity, and a lot of stubbornness. A lighter story about solving impossible problems.",
      image: "https://image.tmdb.org/t/p/w500/3ndAx3weG6KDkJIRMCi5vXX6Dyb.jpg",
      sources: [
        {
          title: "Movie page · TMDB",
          url: "https://www.themoviedb.org/movie/286217-the-martian",
        },
      ],
    },
    {
      id: "dune",
      kind: "Film",
      title: "Dune: Part Two",
      subtitle: "2024 · Science fiction · 167 min",
      description:
        "Desert, power, and the price of a foretold path. A sweeping story with a striking visual world.",
      image: "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
      sources: [
        {
          title: "Movie page · TMDB",
          url: "https://www.themoviedb.org/movie/693134-dune-part-two",
        },
      ],
    },
  ],
  nodes: [
    {
      type: "text",
      content:
        "Four different moods: a big journey, contact with the unknown, engineering survival, and a space epic. Start with [[interstellar]] — details open alongside.",
    },
    {
      type: "entity-list",
      entityIds: ["interstellar", "arrival"],
    },
    {
      type: "carousel",
      children: ["interstellar", "arrival", "martian", "dune"].map(
        (entityId) => ({ type: "entity-ref", entityId }),
      ),
    },
    {
      type: "callout",
      content:
        "A demo selection. Metadata and posters are included to exercise the interface; streaming availability was not checked.",
      tone: "info",
    },
  ],
};
export const calculator: RichSpec = {
  version: 1,
  title: "How capital grows over time",
  initialState: { principal: 50000, rate: 12, years: 3 },
  nodes: [
    {
      type: "text",
      content:
        "Change the inputs. The result recomputes locally — no model request.",
    },
    {
      type: "card",
      title: "Capital growth calculator",
      children: [
        {
          type: "slider",
          stateKey: "principal",
          label: "Initial amount, $",
          min: 10000,
          max: 200000,
          step: 5000,
        },
        {
          type: "slider",
          stateKey: "rate",
          label: "Annual return, %",
          min: 0,
          max: 25,
          step: 1,
        },
        {
          type: "slider",
          stateKey: "years",
          label: "Term, years",
          min: 1,
          max: 10,
          step: 1,
        },
        { type: "divider" },
        {
          type: "computed",
          label: "Final amount with annual compounding, $",
          expr: op(
            "round",
            op(
              "mul",
              state("principal"),
              op(
                "pow",
                op("add", 1, op("div", state("rate"), 100)),
                state("years"),
              ),
            ),
          ),
        },
        {
          type: "callout",
          tone: "info",
          content:
            "A mathematical model, not a return forecast. Taxes, fees, and inflation are not included.",
        },
        {
          type: "button",
          label: "Reset parameters",
          variant: "ghost",
          action: { type: "reset" },
        },
      ],
    },
  ],
};
const mini: RichNode[] = [
  {
    type: "grid",
    columns: 2,
    children: [
      { type: "computed", label: "Tasks", expr: 24 },
      { type: "computed", label: "Done", expr: 18 },
    ],
  },
];
export const configurator: RichSpec = {
  version: 1,
  title: "An interface that responds to you",
  initialState: {
    project: "My Dashboard",
    analytics: true,
    notifications: false,
    layout: "cards",
  },
  nodes: [
    {
      type: "card",
      title: "Interface configurator",
      children: [
        {
          type: "input",
          stateKey: "project",
          label: "Project name",
          placeholder: "My project",
        },
        { type: "switch", stateKey: "analytics", label: "Enable analytics" },
        {
          type: "switch",
          stateKey: "notifications",
          label: "Show notifications",
        },
        { type: "divider" },
        {
          type: "text",
          variant: "caption",
          content: "Preview",
        },
        { type: "text", variant: "title", content: state("project") },
        {
          type: "tabs",
          stateKey: "layout",
          tabs: [
            { id: "cards", label: "Cards", children: mini },
            {
              id: "table",
              label: "Table",
              children: [
                {
                  type: "table",
                  columns: [
                    { key: "task", label: "Task" },
                    { key: "status", label: "Status" },
                  ],
                  rows: [
                    { task: "Design", status: "Done" },
                    { task: "Development", status: "In progress" },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "conditional",
          when: state("analytics"),
          children: [
            {
              type: "chart",
              kind: "line",
              data: [
                { label: "Jan", value: 42 },
                { label: "Feb", value: 55 },
                { label: "Mar", value: 49 },
                { label: "Apr", value: 73 },
                { label: "May", value: 65 },
                { label: "Jun", value: 91 },
              ],
            },
          ],
        },
        {
          type: "conditional",
          when: state("notifications"),
          children: [
            {
              type: "callout",
              tone: "success",
              content: "Notifications are on in the preview.",
            },
          ],
        },
        {
          type: "button",
          label: "Copy project name",
          action: { type: "copy", text: state("project") },
        },
      ],
    },
  ],
};

export const listing: RichSpec = {
  version: 1,
  title: "Electric kettles",
  nodes: [
    {
      type: "text",
      content:
        "Three electric kettles — from a simple glass model to touch-controlled ones.",
    },
    {
      type: "meta",
      items: [
        { icon: "package", text: "3 models" },
        { icon: "wallet", text: "From $15" },
        { icon: "truck", text: "Delivery Nov 7–18" },
      ],
    },
    { type: "entity-list", entityIds: ["wk1760", "wk1500", "tuvio"] },
    {
      type: "callout",
      tone: "info",
      title: "Demo",
      content:
        "Prices are illustrative. Photos are from Wikimedia Commons under a free licence — they are not photos of these exact listings.",
    },
  ],
  entities: [
    {
      id: "wk1760",
      kind: "Kettle",
      thumbShape: "square",
      title: "Bosch TWK 3A011",
      subtitle: "$15 · 1.7 L · glass",
      description: "LED illumination, 1850–2200 W",
      badge: { label: "Most affordable", tone: "success" },
      image:
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3e/2023_Czajnik_elektryczny_Bosch_%281%29.jpg/500px-2023_Czajnik_elektryczny_Bosch_%281%29.jpg",
      facts: [{ label: "Capacity", value: "1.7 L" }],
      sources: [
        {
          title: "Photo · Wikimedia Commons",
          url: "https://commons.wikimedia.org/wiki/File:2023_Czajnik_elektryczny_Bosch_%281%29.jpg",
        },
      ],
    },
    {
      id: "wk1500",
      kind: "Kettle",
      thumbShape: "square",
      title: "N'OVEEN Kettle 1.7",
      subtitle: "$27 · 1.5 L · touch control",
      description: "Display and temperature control",
      image:
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/2023_Czajnik_elektryczny_N%27OVEEN.jpg/500px-2023_Czajnik_elektryczny_N%27OVEEN.jpg",
      facts: [{ label: "Capacity", value: "1.5 L" }],
      sources: [{ title: "Ozon", url: "https://www.ozon.ru/" }],
    },
    {
      id: "tuvio",
      kind: "Kettle",
      thumbShape: "square",
      title: "Electric kettle, 1.7 L",
      subtitle: "$48 · 1.7 L",
      description: "Works with Alice",
      badge: { label: "Smart home", tone: "info" },
      image:
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/Electric_kettle_-_%D0%AD%D0%BB%D0%B5%D0%BA%D1%82%D1%80%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9_%D1%87%D0%B0%D0%B9%D0%BD%D0%B8%D0%BA.JPG/500px-Electric_kettle_-_%D0%AD%D0%BB%D0%B5%D0%BA%D1%82%D1%80%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9_%D1%87%D0%B0%D0%B9%D0%BD%D0%B8%D0%BA.JPG",
      facts: [{ label: "Capacity", value: "1.7 L" }],
      sources: [{ title: "Ozon", url: "https://www.ozon.ru/" }],
    },
  ],
};

export const dashboard: RichSpec = {
  version: 1,
  title: "Launch status",
  nodes: [
    {
      type: "text",
      content:
        "Three metrics, revenue trends, and a launch plan. Some data changes locally: the controls and the table do not call the model.",
    },
    {
      type: "grid",
      columns: 3,
      children: [
        {
          type: "stat",
          label: "Availability",
          value: "98.7%",
          delta: 0.4,
          deltaLabel: "vs last week",
          icon: "shield-check",
        },
        {
          type: "stat",
          label: "Active users",
          value: 12480,
          delta: 12.5,
          deltaLabel: "this month",
          icon: "users",
        },
        {
          type: "stat",
          label: "Incidents",
          value: 4,
          delta: -18.2,
          deltaLabel: "fewer than in September",
          tone: "success",
          icon: "alert-triangle",
        },
      ],
    },
    {
      type: "chart",
      kind: "line",
      unit: "$k",
      categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
      series: [
        { label: "Revenue", values: [62, 74, 68, 91, 86, 104] },
        { label: "Costs", values: [41, 44, 47, 52, 50, 58] },
      ],
      caption: "Illustrative data, not a financial report.",
    },
    {
      type: "card",
      title: "Launch plan",
      children: [
        {
          type: "table",
          sortable: true,
          filterable: true,
          filterPlaceholder: "Find a task…",
          caption: "Click a column header to sort.",
          columns: [
            { key: "task", label: "Task" },
            { key: "owner", label: "Owner" },
            {
              key: "status",
              label: "Status",
              format: "status",
              tones: {
                Done: "success",
                "In progress": "warning",
                Waiting: "muted",
              },
            },
            {
              key: "progress",
              label: "Progress",
              format: "progress",
              tone: "success",
            },
          ],
          rows: [
            {
              task: "Design",
              owner: "Anna",
              status: "Done",
              progress: 100,
            },
            {
              task: "Development",
              owner: "Mark",
              status: "In progress",
              progress: 65,
            },
            {
              task: "Testing",
              owner: "Iris",
              status: "Waiting",
              progress: 0,
            },
            {
              task: "Documentation",
              owner: "Leo",
              status: "In progress",
              progress: 40,
            },
          ],
        },
        {
          type: "row",
          children: [
            { type: "status", label: "Build green", tone: "success" },
            { type: "status", label: "In review", tone: "warning" },
            { type: "status", label: "No blockers", tone: "muted" },
          ],
        },
      ],
    },
    {
      type: "diagram",
      direction: "vertical",
      caption: "The path from request to a finished answer.",
      steps: [
        {
          id: "ask",
          label: "Request",
          detail: '"Build a dashboard"',
        },
        {
          id: "model",
          label: "Model",
          detail: "picks the structure and data",
          connector: "interface description",
        },
        {
          id: "render",
          label: "Renderer",
          detail: "checks the contract and renders components",
          connector: "RichSpec",
        },
        {
          id: "user",
          label: "Reader",
          detail: "changes values without sending a request",
          tone: "success",
        },
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "Limits",
      content:
        "This is not arbitrary HTML or a mini app. Components, state, and calculations are limited by the schema.",
    },
  ],
};

export const pool: RichSpec = {
  version: 1,
  title: "Why sql.DB is a pool, not a connection",
  nodes: [
    {
      type: "text",
      content:
        "One value for the whole process. Every handler borrows a connection for the length of a query and gives it back.",
    },
    {
      type: "layers",
      caption:
        "A single shared handle fans out into physical sessions that open on demand.",
      layers: [
        {
          title: "HTTP handlers / goroutines",
          detail: "Hit the database at the same time",
          icon: "server",
          layers: [
            {
              title: "*sql.DB — connection pool",
              detail: "One thread-safe value, created once at start-up",
              icon: "database",
              tone: "accent",
              items: [
                { label: "Conn 1", icon: "database" },
                { label: "Conn 2", icon: "database" },
                { label: "Conn 3", icon: "database" },
              ],
            },
          ],
        },
        {
          title: "PostgreSQL / MySQL",
          detail: "Physical sessions, opened and reused on demand",
          icon: "server",
        },
      ],
    },
    {
      type: "text",
      content:
        "Set the limits once. The pool queues the rest instead of opening a session per request.",
    },
    {
      type: "code",
      language: "go",
      title: "Tuning the pool",
      code: "db.SetMaxOpenConns(10)\ndb.SetMaxIdleConns(5)\ndb.SetConnMaxLifetime(30 * time.Minute)",
    },
  ],
};

/** Spacious rows for a software shortlist: wide preview, full description,
 * visible sources. Captioned galleries show one screenshot at a time. */
export const apps: RichSpec = {
  version: 1,
  title: "Linux image editors",
  nodes: [
    {
      type: "text",
      content:
        "Three editors worth installing. The previews are real screenshots from Wikimedia Commons, not marketing renders.",
    },
    {
      type: "entity-list",
      layout: "feature",
      entityIds: ["krita", "inkscape", "gimp"],
    },
    {
      type: "text",
      variant: "title",
      content: "Krita, screen by screen",
    },
    {
      type: "image-group",
      presentation: "gallery",
      alt: "Krita interface screenshots",
      label: "Krita screenshots",
      items: [
        {
          src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Krita_5.0.0_screenshot.png/960px-Krita_5.0.0_screenshot.png",
          alt: "Krita 5 workspace with a canvas and docked panels",
          caption: "The default workspace: canvas, tool options and dockers.",
        },
        {
          src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f7/Krita_screenshot.png/960px-Krita_screenshot.png",
          alt: "Krita with a drawing open and the brush preset panel",
          caption: "Brush presets stay visible while painting.",
        },
        {
          src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/12/Krita_4.0_pre-alpha_interface_screenshot_with_kiki.png/960px-Krita_4.0_pre-alpha_interface_screenshot_with_kiki.png",
          alt: "Krita 4 pre-alpha interface",
          caption: "An older layout, shown for comparison.",
        },
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "Demo",
      content:
        "Screenshots are from Wikimedia Commons under free licences and show the real applications.",
    },
  ],
  entities: [
    {
      id: "krita",
      kind: "Painting",
      title: "Krita",
      subtitle: "Digital painting and 2D animation",
      thumbShape: "landscape",
      galleryLayout: "single",
      description:
        "Built for painting rather than photo retouching: brush engines, wrap-around mode, a frame-by-frame animation timeline and a comic-panel workflow. Large documents stay responsive because the brush engine is multithreaded.",
      badge: { label: "Best for drawing", tone: "success" },
      image:
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Krita_5.0.0_screenshot.png/960px-Krita_5.0.0_screenshot.png",
      images: [
        {
          src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Krita_5.0.0_screenshot.png/960px-Krita_5.0.0_screenshot.png",
          alt: "Krita 5 workspace",
          caption: "Workspace with the canvas, tool options and dockers.",
        },
        {
          src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f7/Krita_screenshot.png/960px-Krita_screenshot.png",
          alt: "Krita canvas with brush presets",
          caption: "Brush presets docked next to the canvas.",
        },
        {
          src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/12/Krita_4.0_pre-alpha_interface_screenshot_with_kiki.png/960px-Krita_4.0_pre-alpha_interface_screenshot_with_kiki.png",
          alt: "Krita 4 pre-alpha",
          caption: "An older interface, kept for comparison.",
        },
      ],
      facts: [
        { label: "Licence", value: "GPL-3.0" },
        { label: "Formats", value: "KRA, PSD, PNG, EXR" },
      ],
      sources: [
        {
          title: "krita.org",
          url: "https://krita.org/",
        },
        {
          title: "Screenshots · Wikimedia Commons",
          url: "https://commons.wikimedia.org/wiki/Category:Screenshots_of_Krita",
        },
      ],
    },
    {
      id: "inkscape",
      kind: "Vector",
      title: "Inkscape",
      subtitle: "SVG editing with a real node editor",
      thumbShape: "landscape",
      description:
        "The reference open-source SVG editor. Path effects, live booleans and a capable text tool cover diagrams and print work; the interface is dense, but every panel is dockable.",
      image:
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dd/Screenshot_of_Inkscape_01.png/960px-Screenshot_of_Inkscape_01.png",
      sources: [{ title: "inkscape.org", url: "https://inkscape.org/" }],
    },
    {
      id: "gimp",
      kind: "Raster",
      title: "GIMP",
      subtitle: "Photo retouching and compositing",
      thumbShape: "landscape",
      description:
        "Single-window mode finally keeps every dialog in one frame. Non-destructive editing is still limited compared with Photoshop, but scripting and plugin coverage are wide.",
      image:
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/Screenshot_of_GIMP_in_single_window_mode.png/960px-Screenshot_of_GIMP_in_single_window_mode.png",
      sources: [{ title: "gimp.org", url: "https://www.gimp.org/" }],
    },
  ],
};

export type DemoName = keyof typeof demos;

export const demos = {
  dashboard,
  apps,
  technical,
  films,
  listing,
  calculator,
  configurator,
  pool,
};
