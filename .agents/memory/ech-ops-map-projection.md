---
name: Ops Center world map projection
description: The Global Operations Map SVG is a true equirectangular plate carrée — lat/long maps linearly, so node/arc/land geometry is computable, not hand-tuned.
---

# Ops Center world map is an equirectangular plate carrée

The Global Operations Map in BOTH `artifacts/ops-center-prototype/index.html` and
`artifacts/ethical-cyberhackers-platform/index.html` uses `viewBox="0 0 1000 500"`,
which is an exact 2:1 equirectangular (plate carrée) frame.

**Rule:** any geometry on this map maps linearly from geographic coordinates:
- `screen_x = (lon + 180) / 360 * 1000`  →  `left% = (lon + 180) / 360 * 100`
- `screen_y = (90 - lat) / 180 * 500`   →  `top%  = (90 - lat) / 180 * 100`

So incident-node positions, network-arc endpoints, and the land path are all
derivable from lat/long — do NOT eyeball-place them.

**Land path** is a single `<path class="world-land">` (no CSS rule; styling is
inline: semi-transparent green fill + thin green stroke). It was generated from
Natural Earth **110m land** (`world-atlas/land-110m.json`) via d3-geo:
`geoEquirectangular().scale(1000/(2*Math.PI)).translate([500,250])`, then
`geoPath().digits(1)` to trim the d-string (~56KB). The generation deps
(`d3-geo`, `topojson-client`, `world-atlas`) are one-time tooling — install,
generate, embed, then remove them.

**Why:** earlier the map was ~12 crude hand-drawn blobs with arbitrary node
percentages; "make it realistic" required real coastlines AND nodes sitting on
the right continents. The plate-carrée math makes both exact and repeatable.

**How to apply:** to move/add a node or arc, compute its coords from lat/long
with the formulas above; to refresh/sharpen the land, re-run the d3-geo
generation (swap to `land-50m.json` for finer detail) and replace the single
`.world-land` path in both files. Arc ids (`#arc-*` / `#ocv2arc-*`) are
referenced by packet `mpath` animations — keep the ids stable when editing.
