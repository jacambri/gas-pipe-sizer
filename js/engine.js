/* Gas pipe sizing engine: pure math, no screen code. Used by the app and by tests/engine.test.js. */
(function () {
  'use strict';

  // Pipe size table (same rule as the spreadsheet): a size is used until the required
  // inside diameter reaches its nominal size, e.g. 0.75 in up to 1.00 in -> 1".
  const SIZES = [
    { min: 0, label: '½"', nom: 0.5 },
    { min: 0.5, label: '¾"', nom: 0.75 },
    { min: 0.75, label: '1"', nom: 1 },
    { min: 1, label: '1¼"', nom: 1.25 },
    { min: 1.25, label: '1½"', nom: 1.5 },
    { min: 1.5, label: '2"', nom: 2 },
    { min: 2, label: '2½"', nom: 2.5 },
    { min: 2.5, label: '3"', nom: 3 },
    { min: 3, label: '4"', nom: 4 },
    { min: 4, label: '5"', nom: 5 },
    { min: 5, label: '6"', nom: 6 },
    { min: 6, label: '8"', nom: 8 },
    { min: 8, label: '10"', nom: 10 },
    { min: 10, label: '12"', nom: 12 },
    { min: 12, label: '14"', nom: 14 },
  ];

  // Cr and Y from IFGC 402.4. btuPerCf turns heater input into CFH (the sheet used BTU/hr ÷ 1,000).
  const GASES = {
    NG: { name: 'Natural gas', cr: 0.6094, y: 0.9992, btuPerCf: 1000 },
    LP: { name: 'Propane (LP)', cr: 1.2462, y: 0.991, btuPerCf: 2500 },
  };

  const DIRS = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
  const OPPOSITE = { E: 'W', W: 'E', N: 'S', S: 'N' };
  const IN_WC_PER_PSI = 27.7; // the code's conversion: 27.7 in WC = 1 psi
  const ATM_PSI = 14.7; // psia = psig + 14.7
  const HIGH_PRESSURE = 1.5 * IN_WC_PER_PSI; // 1.5 psi and over: high-pressure formula (IFGC Eq. 4-2)
  const TOL = 1e-6; // a run that lands exactly on the minimum pressure is OK

  // IFGC Eq. 4-1 (under 1.5 psi): D = Q^0.381 / (19.17 * (dH / (Cr * L))^0.206), dH in inches WC
  function requiredId(cfh, feet, drop, cr) {
    if (!(cfh > 0 && feet > 0 && drop > 0 && cr > 0)) return null;
    return Math.pow(cfh, 0.381) / (19.17 * Math.pow(drop / (cr * feet), 0.206));
  }

  // IFGC Eq. 4-2 (1.5 psi and over): D = Q^0.381 / (18.93 * ((P1^2 - P2^2) * Y / (Cr * L))^0.206),
  // P1 and P2 = pressure at the start and end of the pipe in psia. Pressures come in as inches WC (gauge).
  function requiredIdHigh(cfh, feet, p1Wc, p2Wc, cr, y) {
    if (p1Wc == null || p2Wc == null) return null;
    const p1 = p1Wc / IN_WC_PER_PSI + ATM_PSI, p2 = p2Wc / IN_WC_PER_PSI + ATM_PSI;
    if (!(cfh > 0 && feet > 0 && p2 > 0 && p1 > p2 && cr > 0 && y > 0)) return null;
    return Math.pow(cfh, 0.381) / (18.93 * Math.pow(((p1 * p1 - p2 * p2) * y) / (cr * feet), 0.206));
  }

  // Pressures are stored in inches WC; this shows one in the job's unit ('wc' or 'psi').
  // opt.drop: a pressure drop (one more decimal). opt.suffix: 'long' (default), 'short' or 'none'.
  function pressureText(vWc, unit, opt) {
    if (vWc == null || !isFinite(vWc)) return '—';
    const o = opt || {};
    const psi = unit === 'psi';
    const text = (psi ? vWc / IN_WC_PER_PSI : vWc).toFixed(psi ? (o.drop ? 4 : 3) : (o.drop ? 3 : 2));
    if (o.suffix === 'none') return text;
    if (psi) return text + ' psi';
    return text + (o.suffix === 'short' ? '"' : '" WC');
  }
  function unitName(unit) { return unit === 'psi' ? 'psi' : 'in WC'; }
  function toUnit(vWc, unit) { return unit === 'psi' ? vWc / IN_WC_PER_PSI : vWc; }
  function fromUnit(v, unit) { return unit === 'psi' ? v * IN_WC_PER_PSI : v; }

  function sizeFor(d) {
    if (d == null || !isFinite(d)) return null;
    let pick = SIZES[0];
    for (const s of SIZES) if (d >= s.min) pick = s;
    return pick;
  }
  function sizeByNom(nom) {
    return nom == null || nom === '' ? null : SIZES.find(s => s.nom === Number(nom)) || null;
  }

  // Pressure left at the end of a pipe of a chosen size: the same formulas solved for the drop, with the
  // inside diameter taken as the nominal size (the size table's rule). null = the pipe cannot carry it.
  function pressureAfter(cfh, feet, nom, pInWc, gas, high) {
    if (pInWc == null) return null;
    if (!(cfh > 0 && feet > 0)) return pInWc;
    if (!high) return pInWc - gas.cr * feet * Math.pow(Math.pow(cfh, 0.381) / (19.17 * nom), 1 / 0.206);
    const p1 = pInWc / IN_WC_PER_PSI + ATM_PSI;
    const k = ((gas.cr * feet) / gas.y) * Math.pow(Math.pow(cfh, 0.381) / (18.93 * nom), 1 / 0.206);
    const p2sq = p1 * p1 - k;
    return p2sq > 0 ? (Math.sqrt(p2sq) - ATM_PSI) * IN_WC_PER_PSI : null;
  }

  // CFH a nominal size can carry at this length and drop (the same formula solved for Q).
  function capacity(nom, feet, drop, cr) {
    if (!(nom > 0 && feet > 0 && drop > 0 && cr > 0)) return null;
    return Math.pow(nom * 19.17 * Math.pow(drop / (cr * feet), 0.206), 1 / 0.381);
  }

  function gasOf(job) { return GASES[job.gas] || GASES.NG; }
  function btuPerCfOf(job) { return job.btuPerCf > 0 ? Number(job.btuPerCf) : gasOf(job).btuPerCf; }
  function heaterCfh(heater, btuPerCf) {
    return heater && Number(heater.mbh) > 0 ? (Number(heater.mbh) * 1000) / btuPerCf : 0;
  }

  // job.nodes[0] is the regulator. Every other node is the end of one pipe, drawn from its parent
  // in a direction (E, S, W, N) for `feet`. A node may carry a heater { name, mbh }.
  function compute(job) {
    const gas = gasOf(job);
    const btu = btuPerCfOf(job);
    const startP = Number(job.startP) || 0;
    const allow = Number(job.allowDrop) || 0;
    const minP = startP - allow;
    const high = startP >= HIGH_PRESSURE;
    const byId = {};
    const kids = {};
    for (const n of job.nodes) { byId[n.id] = n; kids[n.id] = []; }
    for (const n of job.nodes) if (n.parent != null && kids[n.parent]) kids[n.parent].push(n.id);
    const rootId = job.nodes[0].id;

    // Walk out from the regulator: position (to scale), feet from the regulator, depth.
    const at = {};
    const order = [];
    at[rootId] = { x: 0, y: 0, run: 0, depth: 0, cfh: 0, pressure: startP, kids: kids[rootId] };
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop();
      order.push(id);
      const p = at[id];
      const ch = kids[id];
      for (let i = ch.length - 1; i >= 0; i--) {
        const c = byId[ch[i]];
        const v = DIRS[c.dir] || DIRS.E;
        const f = Number(c.feet) || 0;
        at[c.id] = { x: p.x + v[0] * f, y: p.y + v[1] * f, run: p.run + f, depth: p.depth + 1,
          cfh: 0, pressure: null, kids: kids[c.id] };
        stack.push(c.id);
      }
    }

    // Flow in each pipe = every heater connected past it.
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      let q = heaterCfh(byId[id].heater, btu);
      for (const c of kids[id]) q += at[c].cfh;
      at[id].cfh = q;
    }

    // Where no drop is typed, the allowable drop is split by length along the longest run.
    let longest = 0;
    let longestTo = null;
    for (const id of order) if (at[id].run > longest) { longest = at[id].run; longestTo = id; }
    const rate = longest > 0 && allow > 0 ? allow / longest : 0;
    // After a pipe whose size you set, the pressure left over is split by length along the longest run
    // below it, so a bigger main lets the pipes after it shrink (and a smaller one makes them grow).
    const rest = {};
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      let m = 0;
      for (const c of kids[id]) m = Math.max(m, (Number(byId[c].feet) || 0) + rest[c]);
      rest[id] = m;
    }
    const rateAt = { [rootId]: rate }; // drop per foot for automatic pipes at and below each point

    const pipes = [];
    const pipeOf = {};
    let sec = 0;
    for (const id of order) {
      if (id === rootId) continue;
      const n = byId[id];
      const a = at[id];
      const parentPipe = pipeOf[n.parent] || null;
      const feet = Number(n.feet) || 0;
      const pIn = at[n.parent].pressure;
      const r = Math.max(rateAt[n.parent], 0);
      const set = sizeByNom(n.size);
      const custom = !set && n.drop != null && n.drop !== '' && Number(n.drop) > 0;
      let drop, pOut, d, size, autoSize = null;
      if (set) {
        pOut = pressureAfter(a.cfh, feet, set.nom, pIn, gas, high);
        drop = pOut == null ? null : pIn - pOut;
        d = high ? requiredIdHigh(a.cfh, feet, pIn, pIn - feet * r, gas.cr, gas.y) : requiredId(a.cfh, feet, feet * r, gas.cr);
        autoSize = sizeFor(d); // what the calculation would have picked here
        size = set;
        rateAt[id] = pOut != null && rest[id] > 0 ? (pOut - minP) / rest[id] : 0;
      } else {
        drop = custom ? Number(n.drop) : feet * r;
        pOut = pIn == null ? null : pIn - drop;
        d = high ? requiredIdHigh(a.cfh, feet, pIn, pOut, gas.cr, gas.y) : requiredId(a.cfh, feet, drop, gas.cr);
        size = sizeFor(d);
        rateAt[id] = rateAt[n.parent];
      }
      a.pressure = pOut;
      let status = 'ok';
      if (!(a.cfh > 0)) status = 'empty';
      else if (pOut == null || pOut < minP - TOL || !size) status = 'low'; // ran out of pressure
      else if (parentPipe && parentPipe.size && size.nom > parentPipe.size.nom) status = 'bigger';
      const pipe = { id, sec: ++sec, from: n.parent, feet, dir: n.dir, cfh: a.cfh, drop, custom, set: !!set,
        autoSize, d, size, pIn, pOut, status, parentSec: parentPipe ? parentPipe.sec : 0 };
      pipes.push(pipe);
      pipeOf[id] = pipe;
    }

    const heaters = [];
    for (const id of order) {
      const h = byId[id].heater;
      if (!h) continue;
      const p = at[id].pressure;
      heaters.push({ id, name: h.name || '', mbh: Number(h.mbh) || 0, cfh: heaterCfh(h, btu), pressure: p,
        ok: p != null && p >= minP - TOL });
    }

    let totalCfh = 0;
    let totalMbh = 0;
    let lowest = null;
    for (const h of heaters) {
      totalCfh += h.cfh;
      totalMbh += h.mbh;
      if (h.pressure != null && (!lowest || h.pressure < lowest.pressure)) lowest = h;
    }
    const bySize = SIZES.map(s => ({ label: s.label, nom: s.nom, feet: 0, count: 0 }));
    for (const p of pipes) {
      if (!p.size) continue;
      const row = bySize.find(r => r.nom === p.size.nom);
      row.feet += p.feet;
      row.count += 1;
    }
    const count = st => pipes.filter(p => p.status === st).length;
    const warnings = [];
    if (!(allow > 0) || allow >= startP) warnings.push('Check the regulator pressure and allowable drop');

    return {
      rootId, at, order, pipes, pipeOf, heaters, minP, rate, rateAt, longest, longestTo, gas, btu, warnings,
      formula: high ? 'high' : 'low',
      totals: {
        cfh: totalCfh, mbh: totalMbh, heaters: heaters.length, lowest, bySize,
        lowHeaters: heaters.filter(h => !h.ok).length, lowPipes: count('low'),
        emptyPipes: count('empty'), biggerPipes: count('bigger'),
      },
    };
  }

  const api = { SIZES, GASES, DIRS, OPPOSITE, IN_WC_PER_PSI, HIGH_PRESSURE, requiredId, requiredIdHigh, sizeFor,
    sizeByNom, pressureAfter, capacity, compute, gasOf, btuPerCfOf, heaterCfh, pressureText, unitName, toUnit,
    fromUnit };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.GasEngine = api;
})();
