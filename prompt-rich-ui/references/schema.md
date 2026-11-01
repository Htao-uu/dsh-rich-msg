# RichSpec v1 field reference

Read before using an unfamiliar node. These are exact current parser fields; fields not listed are forbidden. `?` below denotes an optional field, not literal JSON syntax. `Scalar` means string, bounded finite number, boolean or null. `Expr` means Scalar, `{state: KEY}`, or `{op: OP, args: Expr[]}`. All node records may also contain a unique safe `id`.

## Root and entities

Root: `{version: 1, nodes: Node[], title?: string, entities?: Entity[], initialState?: Record<KEY, Scalar>}`.

Entity: `{id: KEY, kind: string, title: string, subtitle?: string, description?: string, image?: URL, images?: (URL | Image)[], facts?: {label: string, value: Scalar}[], cast?: {name: string, role?: string, image?: URL}[], sources?: {title: string, url: URL}[], related?: KEY[], badge?: {label: string, tone?: TONE}, thumbShape?:"poster"|"square"|"landscape", galleryLayout?:"paired"|"single"}`. `Image` is `{src: URL, alt: string, caption?: string}`.
`thumbShape` shapes the row preview: `poster` is 2:3 for film covers, `square` suits product photos, `landscape` suits application screenshots. The default follows the row layout — `poster` in a compact list, `landscape` in a `layout:"feature"` row — and an explicit value always wins. `images` is the detail gallery and replaces `image`; it accepts any number of photos and, without `galleryLayout`, shows two per page — dots for a short gallery, arrows and a counter for a long one. `galleryLayout:"single"` shows one captioned screenshot at a time, which is what wide screenshots need; captions are drawn under the frame and are ignored in the paired layout. Repeat the cover in `images` if it should lead the gallery. `cast` is a short photo row in the detail panel for actors, characters or key people; omit it when the panel does not need that section. IDs must be unique; every entity-ref, related target and open-entity action target must exist. Entity titles/descriptions are literal strings, not Expr.

## Nodes

- `text`: `{type:"text",content:Expr,variant?:"body"|"title"|"subtitle"|"caption"}`. Only `` `code` ``, `**bold**`, `[label](https://…)` and `[[entityId]]` are interpreted. A link must be an absolute http(s) URL; `[[entityId]]` opens a declared entity and unknown ids stay literal. Any other markup stays literal text.
- Layout: `{type:"stack"|"row"|"grid"|"card",children:Node[],gap?:number,columns?:integer,title?:string}`. Gap 0–128. `columns` is allowed on `grid` (number of grid tracks) and on `row` (equal-width panes, one per child, up to 12); `stack` and `card` reject it. The field is `children`, never `items`.
- `carousel`: `{type:"carousel",children:Node[]}`.
- `meta`: `{type:"meta",items:[{text:string,icon?:string}]}` — one inline summary strip ("4 models · From $15 · Delivery Nov 7–18"). Not for paragraphs.
- entity `badge`: `{label:string,tone?:"success"|"info"|"warning"|"danger"|"accent"}` — one short highlight under a row, e.g. cheapest or smart-home support. Enum values only.
- `icon`: `{type:"icon",name:string,size?:number,tone?:"default"|"muted"|"success"|"warning"|"danger"|"info"|"accent"}`. Size 8–128; name starts with a letter and contains only letters/digits/hyphen, up to 64 characters. Use Lucide PascalCase names. No inline SVG, no arbitrary colours: `tone` is a semantic token so both themes stay legible. Use `danger` for failures, `warning` for blocked/at-risk state, `muted` for neutral timeline marks.
- `stat`: `{type:"stat",label:string,value:Expr,delta?:Expr,deltaLabel?:string,hint?:string,tone?:"success"|"warning"|"danger"|"accent",icon?:string}` — one KPI card: label, large value, optional change. A numeric `delta` is read as a percentage and gets a sign; a string is shown verbatim. Use it for the few numbers the reader should remember, not for every metric in a paragraph.
- `progress`: `{type:"progress",value:Expr,max?:number,label?:string,tone?:"success"|"warning"|"danger"|"info"|"accent",showValue?:boolean}` — horizontal 0–max bar, default max 100. The renderer clamps values and exposes `aria-valuenow`.
- `status`: `{type:"status",label:string,tone?:"muted"|"success"|"warning"|"danger"|"info"|"accent"}` — compact state pill ("Done", "In progress", "No blockers"). Not a replacement for a sentence that explains the state.
- `diagram`: `{type:"diagram",steps:[{id:KEY,label:string,detail?:string,tone?:"muted"|"success"|"warning"|"danger"|"info"|"accent",connector?:string,depth?:0|1|2}],direction?:"horizontal"|"vertical",caption?:string}` — ordered process or architecture flow, 1–12 steps with unique ids. `connector` labels the arrow that leads into that step; `depth` indents a branch. This is a flow, not a free-form graph editor: do not pretend it is Mermaid or accept arbitrary node coordinates.
- `layers`: `{type:"layers",layers:[{title:string,detail?:string,icon?:string,tone?:"muted"|"success"|"warning"|"danger"|"info"|"accent",items?:[{label:string,detail?:string,icon?:string,tone?:Tone}],layers?:[Layer]}],caption?:string}` — stacked architecture, top to bottom: a box may contain member chips or nested boxes, three levels at most and six entries per level. Use it when the point is containment ("a pool holds connections"), and `diagram` when the point is order. A layer cannot hold `items` and nested `layers` together.
- `entity-list`: `{type:"entity-list",entityIds:string[],layout?:"compact"|"feature"}` — full-width rows. `layout:"feature"` gives a wide preview, the whole description and the entity's `sources` as links; the default compact row shows a small poster, a two-line description and nothing else. Use feature when the reader must judge the previews or read everything without opening a panel. Every id must be declared in `entities`. Rows suit 2–5 comparable objects well, and a longer ranked list is valid; use `carousel` for browsing many posters, with `entity-ref` children only — the cards already draw the posters, so extra `image` nodes duplicate them.
- `checkbox`: `{type:"checkbox",stateKey:string,label:string}` — boolean consent/selection, distinct from the `switch` toggle.
- `radio`: `{type:"radio",stateKey:string,label?:string,layout?:"row"|"column",options:[{label,value}]}` — one choice from a short visible list. `layout:"column"` renders one option per row, like a navigable list; the default `row` keeps a compact inline strip.
- `segmented`: `{type:"segmented",stateKey:string,label?:string,options:[{label,value}]}` — same contract as `radio`, rendered as a segmented control for 2–4 short options.
- `input` with `inputType:"date"` accepts a real calendar date as `YYYY-MM-DD` (or `""` when cleared); an impossible date is rejected before rendering. Date and text values are never persisted.
- `image`: `{type:"image",src:URL,alt:string,caption?:string}`.
- `video`: `{type:"video",src:URL,poster?:URL,title?:string,caption?:string}` — a direct video file with native controls; no autoplay, no third-party embed frames.
- `audio`: `{type:"audio",src:URL,title?:string,caption?:string}` — a direct audio file with native controls.
- `image-group`: `{type:"image-group",alt:string,label?:string,presentation?:"button"|"gallery",src?:URL[],items?:Image[]}`. Exactly one of `src` or `items`. `src` is the legacy captionless array; `items` adds `alt` and an optional `caption` per frame. The default `button` presentation opens the shared lightbox (captions appear under the photo); `presentation:"gallery"` renders one captioned frame inline with arrows and a counter. No `children`.
- `popover`: `{type:"popover",label:string,children:Node[]}`. Local disclosure for supplemental content; no action or stateKey required.
- `tooltip`: `{type:"tooltip",label:string,text:string}`. Short plain-string explanation; no children, content, HTML or expression-valued text.
- `entity-ref`: `{type:"entity-ref",entityId:KEY}` — a card that already renders the entity's poster, `kind`, title, subtitle, description and a Details affordance. Do not wrap it in a `card`, and never place an `image` or a description `text` beside it: that data comes from the entity object.
- `button`: `{type:"button",label:string,action:Action,variant?:"primary"|"secondary"|"ghost",disabled?:Expr}`.
- `input`: `{type:"input",stateKey:KEY,label?:string,placeholder?:string,inputType?:"text"|"number"|"date"}`.
- `select`: `{type:"select",stateKey:KEY,options:{label:string,value:Scalar}[],label?:string}`.
- `slider`: `{type:"slider",stateKey:KEY,min:number,max:number,label?:string,step?:number}`. Min must be less than max; step positive.
- `switch`: `{type:"switch",stateKey:KEY,label?:string}`.
- `computed`: `{type:"computed",expr:Expr,label?:string}`.
- `conditional`: `{type:"conditional",when:Expr,children:Node[],elseChildren?:Node[]}`.
- `tabs`: `{type:"tabs",stateKey:KEY,tabs:{id:KEY,label:string,icon?:string,children:Node[]}[]}`. Tab IDs unique; `icon` takes a Lucide name and renders before the label. Panels are real content, so keep them empty only when the tabs act as a visual switcher.
- `table`: `{type:"table",columns:{key:KEY,label:string,align?:"left"|"right"|"center",format?:"text"|"number"|"status"|"progress",tones?:Record<string,"muted"|"success"|"warning"|"danger"|"info"|"accent">,max?:number,tone?:"accent"|"success"|"warning"|"danger"|"info"}[],rows:Record<KEY,Expr>[],sortable?:boolean,filterable?:boolean,filterPlaceholder?:string,caption?:string,empty?:string}`. Column keys unique; row fields must refer to listed column keys. A missing cell shows as "—". Rows are objects, not positional arrays. `sortable` adds local header sorting; `filterable` adds a local substring search across cells; `filterPlaceholder` requires `filterable`. `format:"number"` groups digits and right-aligns; `format:"status"` renders a pill whose tone comes from `tones` keyed by the cell's display string (unknown values use `muted`). `format:"progress"` renders a 0–`max` bar (default 100) plus a percentage; `tone` sets its colour. `tones` is allowed only on a status column; `max` and `tone` only on a progress column. Use a table for comparison, not as a layout grid.
- `chart`: `{type:"chart",kind:"bar"|"line"|"area"|"donut"|"scatter",data?:{label:string,value:Expr}[],categories?:string[],series?:{label:string,values:Expr[]}[],points?:{x:number,y:number,label?:string}[],unit?:string,xUnit?:string,caption?:string}`. `kind:"scatter"` takes 1–200 `points` instead of `data`/`series`; `unit` labels the y axis and `xUnit` the x axis. Use `data` for one series or a donut. Donut values must be non-negative after evaluation; a negative value renders an error instead of a misleading ring. For 2–6 series use `categories` plus `series`; every `values` array must have exactly the same length as `categories`. Singular `bar`, not GenUI `bars`. `unit` (for example "$k") appears on the value axis and in tooltips. No options passthrough, no arbitrary axis math.
- `callout`: `{type:"callout",content:Expr,tone?:"info"|"success"|"warning"|"error"}`.
- `divider`: `{type:"divider",label?:string}`.
- `code`: `{type:"code",code:string,language?:string,title?:string,lineNumbers?:boolean}`. Displays code as text; never executes it. Common languages get lightweight highlighting; line numbers default on above 12 lines.

## Actions

Controls that share one `stateKey` must accept the same values: identical slider `min`/`max`/`step`, the same option value set, or the same tab IDs. A free number input and a slider cannot share a key. A `set` or `toggle` result outside the shared domain is rejected locally and leaves the state unchanged.

- `{type:"set",key:KEY,value:Expr}`: update one state scalar locally.
- `{type:"toggle",key:KEY}`: invert local truthiness.
- `{type:"reset"}`: restore document defaults and clear saved state.
- `{type:"open-entity",entityId:KEY}` / `{type:"close-entity"}`: local detail panel.
- `{type:"copy",text:Expr}`: browser clipboard after click.
- `{type:"open-url",url:URL}`: external HTTP(S) link after click.
- `{type:"send-message",text:Expr}`: explicit model callback through host conversation.

No arbitrary named actions, callbacks, scripts, submit fields, network requests or DOM selectors are accepted.

## Expression operations and exact arities

Binary: `sub`, `div`, `mod`, `pow`, `eq`, `ne`, `gt`, `gte`, `lt`, `lte` take exactly 2 arguments. `add`, `mul`, `and`, `or` take 2–32. `min`, `max`, `concat`, `format` take 1–32. `abs`, `floor`, `ceil`, `not` take exactly 1. `round` takes 1 or 2 (second is integer digits 0–12). Numeric inputs/results stay within ±1e12. Division/modulo by zero and excessive exponents fail. Equality is strict; no implicit numeric conversion. `and`/`or` short-circuit and return booleans. Missing state resolves to null; initialize numeric controls explicitly. `concat` converts scalars to strings, with null as empty. `format` uses a literal first-argument template with positional placeholders `{0}`, `{1}`, etc.; remaining arguments fill them. No property access/interpolation is evaluated.

Example: `{"op":"format","args":["Total: {0}",{"op":"mul","args":[{"state":"count"},25]}]}`.

## Defaults, limits and trust boundary

Explicit initialState wins. Missing control defaults: text input empty string; numeric input zero; select first option value or null; slider min; switch false; tabs first tab ID or null. State values are scalars, never arrays/objects.

KEY matches `[a-zA-Z_][a-zA-Z0-9_-]{0,63}`. `__proto__`, `prototype`, `constructor` and sensitive key names (password, passwd, secret, token, api-key and similar access-token/recovery-code spellings) are rejected. URLs must be absolute http/https, no embedded username/password, no whitespace/control characters, at most 2048 characters.

Current upper budgets: source 256,000 characters in host adapter; nesting 48; 20,000 JSON values; 1,000 nodes; arrays up to 1,000; 128 state keys; strings up to 16,384 characters and aggregate 1,000,000; expressions depth 24 and 256 expression nodes; evaluation 2048 steps. These are ceilings, not design targets. Unknown fields reject the full spec; no partial component dropping or JSON repair.
