# borders/rendering

> Model: 1.0.0 · Status: draft

## Purpose

How borders are actually drawn on the canvas and how clicks resolve to a kingdom: stroke styling, draw order, and polygon hit-testing.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

Owner-colored or contested border styles = **minor**; a draw-order/z-order redesign = **minor** (visual only).

## Ideas

- Two-pass render: paint all fills first, then all borders on top — fixes overlap overdraw
- Owner-colored strokes (and a legend) so empires are identifiable
- Hover highlight + cursor feedback; selection ring distinct from ownership
- Draw contested/fortified border segments distinctly (future `expansion` states)
- Offscreen-canvas caching if the kingdom count grows (grid/hex cells)

## Concerns

- Hit-testing order is the server's array order (`frontend/js/game.js` L103-109) — in overlap zones the "selected" kingdom can change if the DB returns rows differently; there is no documented z-order rule (small-on-top would be the natural one).
- Single full-canvas redraw per interaction is fine for 16 polygons but will not scale to thousands of expansion cells.
- Border semantics are binary (claimed/unclaimed) — no notion of owner identity, contest, or fortification in the draw path.

## Issues

- **Border overdraw in overlaps**: each polygon strokes immediately after its own fill (`game.js` L73-80) — later polygons (e.g. CAS/ARA over ESP in Iberia) paint over neighbors' borders, leaving inconsistent/one-sided boundary lines.
- **Owner identity invisible**: stroke is white 3px vs. translucent 1px purely by presence of `owner_id` (`game.js` L78-79) — and since `owner_id` is never written (see `borders`), every border renders in the unclaimed style forever.
- **Overlap hit-testing**: ray-casting `pointInPolygon` (L113-123) is correct, but with overlapping POR/ESP and CAS/ARA/ESP polygons the first match wins regardless of which shape visually appears on top.
- Shares the hit-test/scale mismatch and DPI issues catalogued in `world-map/projection`.

## Result

Working primitives: ownership stroke logic (`game.js` L77-80); ray-casting point-in-polygon (L113-123); canvas click handler populating the `kingdom-info` overlay — name, population, resources, owned/unclaimed (L328-338); border repaints on every WS tick and window resize. Unclaimed borders draw as `rgba(255,255,255,0.3)` 1px; claimed style (white 3px) is unreachable today because `owner_id` stays null.
