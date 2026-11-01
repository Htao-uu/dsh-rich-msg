# How our rendering compares to the chat UIs we studied

Measured against the two shared conversations and the product screenshots we collected. This is a design notebook, not a claim that the plugin is a clone. Status is **evidence-based**: "covered" means a scenario is reproduced by the renderer and guarded by a test, not that it looks identical.

## How parity is measured

No single percentage. Three independent measures:

1. **Scenario coverage** — how many reference scenarios we can reproduce end to end, each with a test or a recorded manual check.
2. **Visual deviation list** — concrete, itemised differences (spacing, typography, panel geometry) with severity.
3. **Interaction coverage** — keyboard, focus, mobile behaviour, local state, failure states.

Reference screenshots and our captures are compared at the same viewport width; goldens in tests are regression baselines only and never proof of fidelity.

## Scenario matrix

| Reference scenario                                                    | Status  | Evidence / gap                                                                    |
| --------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| Technical explanation with icon rows, inline code, divider            | Covered | `technical`; light+dark screenshots; axe clean                                    |
| Movie collection with rows, posters, detail panel, gallery, related   | Covered | `films`; browser test opens the panel, checks two photos share a row, follows related, restores focus |
| Software shortlist with wide previews, full text and source links     | Covered | `apps`; compact rows stay the default, `layout:"feature"` adds the wide preview, whole description and sources, and narrow containers stack it above the text |
| Screenshot gallery with a caption per frame                          | Covered | `apps`; `galleryLayout:"single"` and `image-group presentation:"gallery"`, arrows, counter and per-frame caption; the lightbox keeps its caption too |
| Marketplace listing: meta strip, price, highlight badge               | Covered | `listing`; meta + badge nodes, schema tests                                       |
| Local calculator with instant recompute                               | Covered | `calculator`; browser test asserts value and reset                                |
| Reactive configurator: input, switch, tabs, conditional sections      | Covered | `configurator`; browser test                                                      |
| Segmented control, radio, checkbox, date input                        | Covered | schema + renderer tests                                                           |
| Popover, tooltip, image lightbox                                      | Covered | primitives; 8 browser checks desktop+mobile                                       |
| Streaming: completed components appear while the model writes         | Covered | prefix scanner; inert preview until the block settles                             |
| Sortable tables                                                       | Covered | `dashboard`; header click reorders rows and sets `aria-sort`                      |
| KPI cards with a change indicator                                     | Covered | `stat`; bold number, signed delta, semantic tone                                  |
| Charts with axes, units, series legend and hover readout              | Covered | `dashboard`; multi-series line, tooltip, hidden data table for screen readers     |
| Process / architecture flow                                           | Covered | `diagram`; ordered steps, connector labels, mobile reflow                         |
| Syntax highlighting with copy                                         | Covered | `technical`; tokenizer for js/ts, Go, Python, shell, SQL, JSON, CSS                |
| Support-matrix style table                                            | Covered | `table` inside `card`                                                             |
| Same-turn repair: invalid fence returns diagnostics to the model      | Partial | the host `rich_ui_validate` tool catches errors before sending and returns `{valid,error}` as a tool result; a bad fence still has no automatic same-turn repair, and the diagnostic card only copies the error |
| Panel that reflows the conversation column                            | Covered | native right-column tab in Harness; isolated host showed a 647px column, related navigation and axe clean; drawer fallback |
| Citations attached to prose                                           | Partial | sources live in the entity panel, not inline                                      |
| Inline entity chip inside a sentence                                  | Covered | `[[entityId]]` in text resolves a declared entity and opens the same host surface; unknown ids stay text |
| Filterable tables                                                     | Covered | `dashboard`; local substring filter, visible count and a no-results row           |
| Scatter plot                                                          | Covered | `chart kind:"scatter"` with 1–200 numeric points, axis units, hidden data table   |
| Mermaid / ER / sequence diagrams                                      | Missing | `diagram` is an ordered flow, not a graph layout engine                           |
| Math (KaTeX)                                                          | Missing | not implemented                                                                    |
| Writing artifact / editable document                                  | Missing | not implemented                                                                    |
| Maps                                                                  | Missing | no provider                                                                        |
| Video / audio playback                                                | Covered | `video` / `audio` nodes, native controls, poster and caption, no autoplay          |
| Persistent panel / canvas across turns                                 | Missing | not implemented                                                                    |
| Mini-apps with isolated runtime                                       | Missing | deliberately out of scope                                                          |

Coverage: **19 / 27** scenarios covered, **2 partial**, **6 missing**.

## Visual deviations (known, not yet fixed)

| #   | Deviation                                                                                   | Severity |
| --- | ------------------------------------------------------------------------------------------- | -------- |
| 1   | Typography follows the host font but uses our own scale and rhythm                          | S2       |
| 2   | Wide tables scroll horizontally on a phone; the demo four-column table now fits             | S3       |
| 3   | Chart series colours are fixed; no per-series palette override                              | S3       |
| 4   | Entity detail is a modal sheet on a phone; the observed reference keeps a right-edge panel | S2       |

## What we are not measuring

- No claim of pixel parity: we have no access to the reference's fonts, tokens or component internals.
- Automated diffs compare our build to our own goldens; they cannot say "closer to ChatGPT".
- Perceived quality needs a human look at side-by-side captures; that is a review step, not a test.

## Backlog derived from this matrix

Ordered by effect on daily use:

1. Keep the validation tool ahead of the fence; do not reintroduce a repair message.
2. Inline citations inside prose.
3. Entity detail on a phone: keep the title above the fold, verify the panel height and close/focus order.
4. Richer chart options: per-series palette override and more chart kinds.
5. Math, artifacts and maps.
6. Provider-backed entity data with provenance and empty/error states.
