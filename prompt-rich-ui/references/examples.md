# Complete validated examples

Replace demonstration content with sourced real findings. These JSON blocks are also parser test fixtures. Example URLs are placeholders and must not be presented as research evidence.

## Small result without unnecessary cards

```json
{
  "version": 1,
  "title": "Deployment check",
  "nodes": [
    {
      "type": "row",
      "gap": 8,
      "children": [
        { "type": "icon", "name": "Check", "size": 20 },
        { "type": "text", "content": "Ready for review", "variant": "title" }
      ]
    },
    {
      "type": "callout",
      "tone": "warning",
      "content": "Production activation has not been performed."
    }
  ]
}
```

## Browsable sourced entity collection

```json
{
  "version": 1,
  "title": "Two places to compare",
  "entities": [
    {
      "id": "garden",
      "kind": "place",
      "title": "Botanical garden",
      "subtitle": "Quiet morning option",
      "description": "Demonstration entity: replace with verified research.",
      "facts": [{ "label": "Example visit duration", "value": "90 minutes" }],
      "sources": [
        {
          "title": "Replace with official visitor information",
          "url": "https://example.com/garden"
        }
      ],
      "related": ["museum"]
    },
    {
      "id": "museum",
      "kind": "place",
      "title": "City museum",
      "description": "Indoor alternative; opening hours need verification.",
      "facts": [{ "label": "Example visit duration", "value": "2 hours" }],
      "sources": [
        {
          "title": "Replace with official collection information",
          "url": "https://example.com/museum"
        }
      ],
      "related": ["garden"]
    }
  ],
  "nodes": [
    {
      "type": "text",
      "content": "Open a place for facts and source links. Each card already carries its own poster and description — do not add them as separate nodes.",
      "variant": "subtitle"
    },
    {
      "type": "carousel",
      "children": [
        { "type": "entity-ref", "entityId": "garden" },
        { "type": "entity-ref", "entityId": "museum" }
      ]
    },
    {
      "type": "button",
      "label": "Open the indoor alternative",
      "variant": "secondary",
      "action": { "type": "open-entity", "entityId": "museum" }
    }
  ]
}
```

## Local quote calculator, no model calls

```json
{
  "version": 1,
  "title": "Illustrative quote",
  "initialState": { "quantity": 4, "rush": false },
  "nodes": [
    {
      "type": "slider",
      "stateKey": "quantity",
      "label": "Quantity",
      "min": 1,
      "max": 20,
      "step": 1
    },
    { "type": "switch", "stateKey": "rush", "label": "Show rush surcharge" },
    {
      "type": "computed",
      "label": "Base total",
      "expr": { "op": "mul", "args": [{ "state": "quantity" }, 25] }
    },
    {
      "type": "conditional",
      "when": { "state": "rush" },
      "children": [
        {
          "type": "computed",
          "label": "Total including surcharge",
          "expr": {
            "op": "add",
            "args": [{ "op": "mul", "args": [{ "state": "quantity" }, 25] }, 15]
          }
        }
      ],
      "elseChildren": [{ "type": "text", "content": "No surcharge selected." }]
    },
    {
      "type": "button",
      "label": "Reset estimate",
      "variant": "ghost",
      "action": { "type": "reset" }
    }
  ]
}
```

## Comparison with tabs and chart

```json
{
  "version": 1,
  "title": "Illustrative comparison",
  "initialState": { "view": "facts" },
  "nodes": [
    {
      "type": "tabs",
      "stateKey": "view",
      "tabs": [
        {
          "id": "facts",
          "label": "Facts",
          "children": [
            {
              "type": "table",
              "columns": [
                { "key": "option", "label": "Option" },
                { "key": "cost", "label": "Example cost" }
              ],
              "rows": [
                { "option": "A", "cost": 20 },
                { "option": "B", "cost": 35 }
              ]
            }
          ]
        },
        {
          "id": "visual",
          "label": "Chart",
          "children": [
            {
              "type": "chart",
              "kind": "bar",
              "data": [
                { "label": "A", "value": 20 },
                { "label": "B", "value": 35 }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Supplemental details and an image collection

The URLs here are syntax placeholders, not verified photos or research sources. `tooltip.text` is a plain string; `popover.children` is a node array; `image-group` takes either a legacy `src` URL array or captioned `items`.

```json
{
  "version": 1,
  "title": "Illustrative visual reference",
  "nodes": [
    {
      "type": "tooltip",
      "label": "About these images",
      "text": "Replace placeholder URLs with actual relevant images."
    },
    {
      "type": "popover",
      "label": "Read the context",
      "children": [
        {
          "type": "text",
          "content": "Use a popover for optional context, not essential warnings."
        }
      ]
    },
    {
      "type": "image-group",
      "src": [
        "https://example.com/front.jpg",
        "https://example.com/detail.jpg"
      ],
      "alt": "Example reference photographs",
      "label": "Reference views"
    }
  ]
}
```

## Explicit model follow-up, clearly labelled

```json
{
  "version": 1,
  "initialState": { "destination": "garden" },
  "nodes": [
    {
      "type": "select",
      "stateKey": "destination",
      "label": "Planning preference",
      "options": [
        { "label": "Garden visit", "value": "garden" },
        { "label": "Museum visit", "value": "museum" }
      ]
    },
    {
      "type": "button",
      "label": "Ask the assistant to plan this visit",
      "action": {
        "type": "send-message",
        "text": {
          "op": "format",
          "args": [
            "Please plan the selected visit: {0}. Verify current details before recommending it.",
            { "state": "destination" }
          ]
        }
      }
    },
    {
      "type": "text",
      "variant": "caption",
      "content": "The button sends a request to the assistant; it is not a booking."
    }
  ]
}
```

## Dashboard: metrics, a series chart, a sortable table and a flow

Use this shape when the answer is a status page or a comparison with several kinds of evidence. One chart may share a page with a table, but do not print the same numbers twice just to fill space.

```json
{
  "version": 1,
  "title": "Release status",
  "entities": [
    {
      "id": "interstellar",
      "kind": "Film",
      "title": "Interstellar",
      "description": "Replace with verified content."
    }
  ],
  "nodes": [
    {
      "type": "text",
      "content": "Three numbers, one trend and the work that is left. Start with [[interstellar]] or sort the table in the browser."
    },
    {
      "type": "grid",
      "columns": 3,
      "children": [
        {
          "type": "stat",
          "label": "Availability",
          "value": "99,9%",
          "delta": 0.2,
          "deltaLabel": "vs last week",
          "icon": "shield-check"
        },
        {
          "type": "stat",
          "label": "Active users",
          "value": 12480,
          "delta": 12.5,
          "deltaLabel": "this month",
          "icon": "users"
        },
        {
          "type": "stat",
          "label": "Open incidents",
          "value": 4,
          "delta": -18.2,
          "tone": "success",
          "icon": "alert-triangle"
        }
      ]
    },
    {
      "type": "chart",
      "kind": "line",
      "categories": ["Jan", "Feb", "Mar", "Apr"],
      "series": [
        { "label": "Revenue", "values": [62, 74, 68, 91] },
        { "label": "Cost", "values": [41, 44, 47, 52] }
      ],
      "unit": "k €",
      "caption": "Illustrative data, not a financial report."
    },
    {
      "type": "card",
      "title": "Plan",
      "children": [
        {
          "type": "table",
          "sortable": true,
          "filterable": true,
          "filterPlaceholder": "Find a task…",
          "caption": "Sort by any column.",
          "columns": [
            { "key": "task", "label": "Task" },
            {
              "key": "status",
              "label": "Status",
              "format": "status",
              "tones": { "Ready": "success", "In progress": "warning" }
            },
            {
              "key": "done",
              "label": "Done",
              "format": "progress",
              "tone": "success"
            }
          ],
          "rows": [
            { "task": "Design", "status": "Ready", "done": 100 },
            { "task": "Build", "status": "In progress", "done": 65 }
          ]
        },
        { "type": "progress", "value": 65, "label": "Overall", "tone": "success" },
        { "type": "status", "label": "Build green", "tone": "success" }
      ]
    },
    {
      "type": "diagram",
      "direction": "vertical",
      "caption": "Request path",
      "steps": [
        { "id": "ask", "label": "Request" },
        {
          "id": "model",
          "label": "Model",
          "detail": "picks structure",
          "connector": "spec"
        },
        {
          "id": "render",
          "label": "Renderer",
          "detail": "validates and mounts",
          "connector": "RichSpec"
        }
      ]
    }
  ]
}
```

## Stacked architecture with layers

Use `layers` when containment carries the answer: one shared handle, its members and the system below.

```rich-ui
{"version":1,"nodes":[
 {"type":"layers","caption":"One pool, many connections","layers":[
   {"title":"HTTP handlers","detail":"call the database at the same time","icon":"server",
    "layers":[
      {"title":"*sql.DB — pool","icon":"database","items":[
        {"label":"Conn 1","icon":"database"},
        {"label":"Conn 2","icon":"database"},
        {"label":"Conn 3","icon":"database"}]}]},
   {"title":"PostgreSQL","icon":"server","detail":"physical sessions, opened on demand"}]},
 {"type":"code","language":"go","title":"Tuning the pool","code":"db.SetMaxOpenConns(10)\ndb.SetMaxIdleConns(5)"}
]}
```

## Interface concept mock

When the answer is about a layout rather than data, compose a small schematic: a card with a tab strip, two equal panes and a column radio list. It reads as a mock, not as a product screenshot.

```rich-ui
{"version":1,"nodes":[
 {"type":"card","title":"Concept: workspaces on top, chats on the left","children":[
   {"type":"tabs","stateKey":"ws","tabs":[
     {"id":"all","label":"All","icon":"home","children":[]},
     {"id":"backend","label":"Backend","icon":"folder","children":[]},
     {"id":"site","label":"Website","icon":"folder","children":[]}]},
   {"type":"row","columns":2,"children":[
     {"type":"stack","children":[
       {"type":"text","variant":"subtitle","content":"Backend · Chats"},
       {"type":"input","stateKey":"q","label":"Search","placeholder":"Search this project"},
       {"type":"radio","stateKey":"session","layout":"column","options":[
         {"label":"Fix authentication","value":"fix"},
         {"label":"API refactoring","value":"api"},
         {"label":"DB migration","value":"db"}]}]},
     {"type":"stack","children":[
       {"type":"text","variant":"subtitle","content":"Fix authentication"},
       {"type":"callout","tone":"info","content":"Patch the refresh token flow"},
       {"type":"text","variant":"caption","content":"The agent checks the auth middleware…"},
       {"type":"input","stateKey":"msg","label":"Message","placeholder":"Write a message…"}]}]}]},
 {"type":"text","variant":"caption","content":"Layout sketch, not a screenshot of a shipped plugin."}
]}
```

## Scatter and a media clip

Use a scatter for two numeric dimensions, and `video` / `audio` for direct files with native controls.

```rich-ui
{"version":1,"nodes":[
 {"type":"chart","kind":"scatter","unit":"revenue, $k","xUnit":"price, $","points":[
   {"x":12,"y":40,"label":"Basic"},
   {"x":19,"y":55,"label":"Plus"},
   {"x":24,"y":62,"label":"Pro"},
   {"x":48,"y":96,"label":"Scale"}]},
 {"type":"video","src":"https://example.com/demo.mp4","title":"Renderer walkthrough","caption":"12 seconds, no sound."},
 {"type":"audio","src":"https://example.com/done.mp3","title":"Turn finished"}
]}
```

## Software shortlist with a wide preview and captioned screens

`layout:"feature"` is for rows the reader must judge visually; the compact list would shrink these screenshots into a strip. `thumbShape:"landscape"` matches the image shape, and `galleryLayout:"single"` gives each screenshot its own caption. The inline `image-group` repeats the same idea inside the answer.

```json
{
  "version": 1,
  "title": "Linux image editors",
  "entities": [
    {
      "id": "krita",
      "kind": "Painting",
      "title": "Krita",
      "subtitle": "Digital painting and 2D animation",
      "thumbShape": "landscape",
      "galleryLayout": "single",
      "image": "https://example.com/krita-workspace.png",
      "images": [
        {
          "src": "https://example.com/krita-workspace.png",
          "alt": "Krita workspace with docked panels",
          "caption": "Canvas, tool options and dockers."
        },
        {
          "src": "https://example.com/krita-brushes.png",
          "alt": "Brush preset panel",
          "caption": "Brush presets stay visible while painting."
        }
      ],
      "description": "Brush engines, wrap-around mode and a frame-by-frame animation timeline.",
      "badge": { "label": "Best for drawing", "tone": "success" },
      "sources": [
        { "title": "krita.org", "url": "https://krita.org/" }
      ]
    }
  ],
  "nodes": [
    {
      "type": "entity-list",
      "layout": "feature",
      "entityIds": ["krita"]
    },
    {
      "type": "image-group",
      "presentation": "gallery",
      "alt": "Krita interface screens",
      "items": [
        {
          "src": "https://example.com/krita-workspace.png",
          "alt": "Krita workspace",
          "caption": "The default workspace."
        }
      ]
    }
  ]
}
```
