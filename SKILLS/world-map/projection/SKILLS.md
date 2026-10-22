# world-map/projection

> Model: 1.0.0 · Status: draft

## Purpose

The coordinate math between the map's normalized `[0,1]` space and device pixels: scaling, resizing, and the inverse mapping used for click hit-testing. Also defines how border segments and cardinal directions (N/S/E/W) are computed from normalized polygon geometry for troop deployment and border-push logic.

## Affects

Both

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.2.0

Introducing a fitted/letterboxed transform or a pan-zoom matrix is a **minor** (rendering + hit-test change on both sides — coordinate contract). Adding cardinal-direction computation from polygon geometry is **minor**.

## Ideas

- Lock aspect ratio (fit map with letterboxing) so geography never distorts
- devicePixelRatio-aware canvas sizing for crisp rendering on HiDPI
- A single shared transform (render + hit-test use the identical inverse) — see Issues
- Pan/zoom: translate/scale matrix applied before draw; invert it for pointer events
- `Path2D` caching per polygon to avoid rebuilding paths every frame

## Concerns

- Any transform change silently affects clicks: rendering and hit-testing must always share one math path.
- Canvas size is driven by `.map-container` layout (`frontend/js/game.js` L38-45) — the map has zero size until the game screen opens.
- Cardinal direction (N/S/E/W) from a border segment: computed from the centroid vector between two adjacent territories' normalized centroids — approximation only; exact side detection requires edge-normal analysis.
- Border segments stored in normalized `[0,1]` space; projected to canvas at render time via `project(x,y)`.

## Issues

- **Aspect distortion**: `project` scales x and y independently (`frontend/js/game.js` L47-49) — the map stretches to whatever shape the container is; a wide window fattens Europe.
- **Hit-test/scale mismatch**: clicks divide by `canvasWidth`/`canvasHeight` while offsets come from `getBoundingClientRect()` (`game.js` L99-101) — identical only while CSS size equals the canvas attribute size; CSS scaling (responsive layouts) misaligns selection.
- **No devicePixelRatio handling**: `canvas.width = clientWidth` (`game.js` L41-42) renders at 1x — blurry text/edges on Retina.
- **Label centroid is vertex-average** (`game.js` L92-96), not area centroid — for concave/irregular polygons the code label can fall outside the shape.

## Result

Working today: `resizeCanvas()` sizes the backing store from the container and repaints (`game.js` L38-45); `project(x,y)` = `[x*canvasWidth, y*canvasHeight]` used by all drawing (`L47-49`); `getCentroid` places code labels (L92-96); inverse mapping in `getKingdomAtPosition` (L98-111); window `resize` listener re-renders (L359).

Planned (not yet implemented): border segment storage in normalized space; cardinal-direction (N/S/E/W) computation for troop deployment adjacency; shared-edge detection between polygons for expansion validity.
