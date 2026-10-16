// Checks the road network: no roads crossing without a junction, room for every street,
// and every junction reachable from every other by legal driving (one-way streets included).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, CAR_COLORS: ['#fff'] };
vm.createContext(ctx);
for (const f of ['core.js', 'map.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx);
vm.runInContext('buildMap(); buildIndex();', ctx);
const world = vm.runInContext('world', ctx);
let fail = 0;
const bad = (m) => { fail++; console.log('FAIL', m); };
const name = (n) => `node ${n.id} (${Math.round(n.x)},${Math.round(n.y)} ${n.type})`;

// 1. Roads only meet at junctions.
const E = world.edges;
for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
  const a = E[i], b = E[j];
  const shared = [a.a, a.b].some(n => n === b.a || n === b.b);
  for (let k = 0; k < a.pts.length - 1; k++) for (let m = 0; m < b.pts.length - 1; m++) {
    const h = vm.runInContext(`segX(${JSON.stringify(a.pts[k])},${JSON.stringify(a.pts[k + 1])},${JSON.stringify(b.pts[m])},${JSON.stringify(b.pts[m + 1])})`, ctx);
    if (!h) continue;
    const sa = a.cum[k] + h.t * (a.cum[k + 1] - a.cum[k]);
    if (shared && (sa < 1 || sa > a.len - 1)) continue;
    bad(`roads ${a.name}#${a.id} and ${b.name}#${b.id} cross at s=${sa.toFixed(0)}`); k = 1e9; break;
  }
}
// 2. Every street is longer than its two junctions.
for (const e of E) if (e.len < e.a.r + e.b.r + 8) bad(`road ${e.name}#${e.id} too short: ${e.len.toFixed(0)} m for junction radii ${e.a.r.toFixed(1)}+${e.b.r.toFixed(1)}`);
// 3. Every node can be entered and left; whole network strongly connected for cars.
const canEnter = (arm) => (arm.end === 'a' ? arm.e.lanesB : arm.e.lanesF) > 0;
const canExit = (arm) => (arm.end === 'a' ? arm.e.lanesF : arm.e.lanesB) > 0;
for (const n of world.nodes) {
  if (!n.arms.some(canEnter)) bad(name(n) + ' cannot be entered');
  if (!n.arms.some(canExit)) bad(name(n) + ' has no exit');
}
const reach = (start, fwd) => {
  const seen = new Set([start]), q = [start];
  while (q.length) {
    const n = q.pop();
    for (const arm of n.arms) {
      const other = arm.end === 'a' ? arm.e.b : arm.e.a;
      if (fwd ? canExit(arm) : canEnter(arm)) if (!seen.has(other)) { seen.add(other); q.push(other); }
    }
  }
  return seen;
};
const f = reach(world.nodes[0], true), b = reach(world.nodes[0], false);
for (const n of world.nodes) if (!f.has(n) || !b.has(n)) bad(name(n) + ' not strongly connected');
console.log(`${world.nodes.length} junctions, ${E.length} roads, ${world.levelX.length} level crossings, ${world.crossings.length} crossings, ${world.parked.length} parked cars`);
console.log(fail ? `${fail} problems` : 'map OK');
process.exit(fail ? 1 : 0);
