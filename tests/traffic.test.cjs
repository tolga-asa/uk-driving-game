// Runs the AI traffic for a few simulated minutes and checks it keeps moving, stays on the road
// and keeps to the left.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date };
vm.createContext(ctx);
for (const f of ['core.js', 'map.js', 'scenery.js', 'traffic.js', 'traffic2.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx);
const minutes = +(process.argv[2] || 4);
const r = vm.runInContext(`const process = { argv: ${JSON.stringify(process.argv)} };
  buildMap(); buildIndex(); buildScenery(); buildIndex(); buildObstructions();
  const R = rng(+(process.argv[3] || 5)); spawnTraffic(R, null); spawnPeds(R);
  let t = 0, samples = 0, off = 0, wrong = 0, stuck = 0, maxWait = 0, worst = null;
  const dt = 1 / 30;
  for (let k = 0; k < 30 * 60 * ${minutes}; k++) {
    t += dt; updateRail(dt, t); updateCars(dt, t, null); updatePeds(dt, null, t);
    if (k % 15) continue;
    for (const c of traffic.cars) {
      samples++;
      if (c.speed < 0.2) stuck++;
      if (c.wait > maxWait) { maxWait = c.wait; worst = c; }
      const s = surfaceAt(c.x, c.y);
      if (s !== 'road') off++;
      const q = roadAt(c.x, c.y);
      if (q && !nodeAt(c.x, c.y) && q.dist < q.e.W / 2 && c.speed > 1 && q.e.kind !== 'single') {
        const along = Math.cos(c.heading - q.ang);
        if (Math.abs(along) > 0.8) {
          const dir = along > 0 ? 1 : -1;
          const side = (q.lat - q.e.div) * dir;
          const bulging = (q.e.obst[dir] || []).some(([lo, hi]) => q.s > lo - 14 && q.s < hi + 14);
          if (side < -0.3 && !bulging) wrong++;
          if (lanesOf(q.e, dir) === 0) wrong++;
        }
      }
    }
  }
  const w = worst && { x: Math.round(worst.x), y: Math.round(worst.y), kind: worst.kind, gates: worst.gates.slice(0, 3).map(g => g.type + ':' + (g.s - worst.s).toFixed(1)).join(' ') };
  JSON.stringify({ cars: traffic.cars.length, samples, offRoadPct: (100 * off / samples).toFixed(2), wrongSidePct: (100 * wrong / samples).toFixed(2), stuckPct: (100 * stuck / samples).toFixed(1), maxWait: maxWait.toFixed(1), worst: w, lx: world.levelX.map(l => l.state) });
`, ctx);
console.log(r);
