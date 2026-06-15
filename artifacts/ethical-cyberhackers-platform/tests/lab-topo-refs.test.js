/**
 * Topology-reference guard for the Progressive Lab datasets.
 *
 * Runnable directly with node (runTest is disabled this session):
 *     node tests/lab-topo-refs.test.js
 *
 * The orientation/lab network map is built from a dataset's `topo` block. The
 * renderer (labRenderOrientMap) silently SKIPS any link whose endpoint node is
 * undefined (`if (!na || !nb) return`), and mapReact reveal/trust entries for
 * undefined nodes are simply ignored. So a dataset that references a node id in
 * `topo.links`, `seedNodes`, or `topo.mapReact` without DEFINING it in
 * `topo.nodes` does not crash — it just renders a broken, incomplete map (e.g.
 * the suspicious source never appears). This guard fails loudly on that mistake.
 *
 * It scans every dataset that has a `topo.nodes` block and asserts every node id
 * referenced by seedNodes / links / mapReact (reveal, mask, unmask, trust) is
 * actually defined in topo.nodes.
 */

import LAB_M0 from "../lab.missions/mission-000.js";
import LAB_M0B from "../lab.missions/mission-000b.js";
import LAB_M3 from "../lab.missions/mission-003.js";
import LAB_M4 from "../lab.missions/mission-004.js";
import LAB_M5 from "../lab.missions/mission-005.js";
import LAB_M6 from "../lab.missions/mission-006.js";

const DATASETS = [
  ["mission-000", LAB_M0],
  ["mission-000b", LAB_M0B],
  ["mission-003", LAB_M3],
  ["mission-004", LAB_M4],
  ["mission-005", LAB_M5],
  ["mission-006", LAB_M6],
];

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

function refsFor(topo) {
  // Map of node id -> list of where it was referenced (for clear failures).
  const refs = new Map();
  const add = (id, where) => {
    if (typeof id !== "string" || !id) return;
    if (!refs.has(id)) refs.set(id, []);
    refs.get(id).push(where);
  };
  (topo.links || []).forEach((l, i) => {
    add(l.a, `links[${i}].a`);
    add(l.b, `links[${i}].b`);
  });
  const mr = topo.mapReact || {};
  for (const [ev, spec] of Object.entries(mr)) {
    if (!spec || typeof spec !== "object") continue;
    ["reveal", "mask", "unmask"].forEach((k) => {
      if (Array.isArray(spec[k])) spec[k].forEach((id) => add(id, `mapReact.${ev}.${k}`));
    });
    if (spec.trust && typeof spec.trust === "object") {
      Object.keys(spec.trust).forEach((id) => add(id, `mapReact.${ev}.trust`));
    }
  }
  return refs;
}

for (const [name, ds] of DATASETS) {
  const topo = ds && ds.topo;
  if (!topo || !topo.nodes) {
    console.log(`  --   ${name}: no topo.nodes (skipped)`);
    continue;
  }
  const defined = new Set(Object.keys(topo.nodes));

  // seedNodes must all be defined.
  (ds.seedNodes || []).forEach((id) => {
    check(`${name} seedNodes "${id}" is defined in topo.nodes`, defined.has(id));
  });

  // Every referenced node id must be defined.
  const refs = refsFor(topo);
  for (const [id, where] of refs.entries()) {
    check(
      `${name} node "${id}" (ref by ${where[0]}${where.length > 1 ? ` +${where.length - 1} more` : ""}) is defined in topo.nodes`,
      defined.has(id),
    );
  }
}

if (failures) {
  console.error(`\n${failures} topology-reference check(s) FAILED.`);
  process.exit(1);
}
console.log("\nAll topology-reference checks passed.");
