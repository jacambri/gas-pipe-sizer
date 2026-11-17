/* Jobs saved on this device (localStorage), undo history, and checks for imported job files. */
(function () {
  'use strict';
  const KEY = 'gaspipe.jobs.v1';
  const CUR = 'gaspipe.current.v1';
  const UNIT = 'gaspipe.unit.v1'; // pressure unit used last ('wc' or 'psi'), the default for new jobs
  const DIRS = ['E', 'S', 'W', 'N'];

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function num(v, fallback) {
    const x = parseFloat(v);
    return isFinite(x) ? x : fallback;
  }

  function newJob(o) {
    o = o || {};
    return {
      v: 1, id: uid('j'), name: o.name || 'New job', created: Date.now(), updated: Date.now(),
      gas: o.gas === 'LP' ? 'LP' : 'NG', startP: num(o.startP, 13), allowDrop: num(o.allowDrop, 7),
      btuPerCf: null, unit: o.unit === 'psi' ? 'psi' : 'wc', // pressures are stored in inches WC either way
      nodes: [{ id: 'n0', parent: null, dir: null, feet: 0, drop: null, heater: null }],
      seq: 1,
      last: { mbh: 135, name: '', dropFt: 0, dropDir: null, pipeDir: 'E', pipeHeater: false },
    };
  }

  function loadAll() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list.filter(isValid).map(normalize) : [];
    } catch (e) {
      return [];
    }
  }
  function saveAll(jobs) {
    try {
      localStorage.setItem(KEY, JSON.stringify(jobs));
      return true;
    } catch (e) {
      return false;
    }
  }
  function currentId() {
    try { return localStorage.getItem(CUR); } catch (e) { return null; }
  }
  function setCurrentId(id) {
    try { localStorage.setItem(CUR, id); } catch (e) { /* private browsing: nothing to keep */ }
  }
  function lastUnit() {
    try { return localStorage.getItem(UNIT) === 'psi' ? 'psi' : 'wc'; } catch (e) { return 'wc'; }
  }
  function setLastUnit(unit) {
    try { localStorage.setItem(UNIT, unit); } catch (e) { /* private browsing */ }
  }

  // A job is a tree: nodes[0] is the regulator, every other node names its parent.
  function isValid(j) {
    if (!j || typeof j !== 'object' || !Array.isArray(j.nodes) || !j.nodes.length) return false;
    const byId = {};
    for (const n of j.nodes) {
      if (!n || typeof n.id !== 'string' || byId[n.id]) return false;
      byId[n.id] = n;
    }
    if (j.nodes[0].parent != null) return false;
    for (let i = 1; i < j.nodes.length; i++) {
      const n = j.nodes[i];
      if (!byId[n.parent] || !(Number(n.feet) > 0) || DIRS.indexOf(n.dir) < 0) return false;
      let hops = 0;
      for (let p = n; p.parent != null; p = byId[p.parent]) if (++hops > j.nodes.length) return false;
    }
    return true;
  }

  function normalize(j) {
    const d = newJob();
    const job = Object.assign({}, d, j);
    job.last = Object.assign({}, d.last, j.last || {});
    job.gas = job.gas === 'LP' ? 'LP' : 'NG';
    job.unit = job.unit === 'psi' ? 'psi' : 'wc';
    job.startP = num(job.startP, 13);
    job.allowDrop = num(job.allowDrop, 7);
    let maxSeq = 0;
    for (const n of job.nodes) {
      const m = /^n(\d+)$/.exec(n.id);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      n.feet = num(n.feet, 0);
      n.drop = n.drop == null || n.drop === '' ? null : num(n.drop, null);
      n.size = n.size == null || n.size === '' ? null : num(n.size, null); // pipe size set by hand (nominal in)
      if (n.heater) n.heater = { name: String(n.heater.name || ''), mbh: num(n.heater.mbh, 0) };
      else n.heater = null;
    }
    job.seq = Math.max(num(job.seq, 1), maxSeq + 1);
    return job;
  }

  function History(limit) {
    this.limit = limit || 150;
    this.past = [];
    this.future = [];
  }
  History.prototype.record = function (snapshot) {
    this.past.push(snapshot);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  };
  History.prototype.undo = function (current) {
    if (!this.past.length) return null;
    this.future.push(current);
    return this.past.pop();
  };
  History.prototype.redo = function (current) {
    if (!this.future.length) return null;
    this.past.push(current);
    return this.future.pop();
  };
  History.prototype.clear = function () { this.past = []; this.future = []; };

  // A small made-up shop so a first-time user can see how a drawing looks.
  function example() {
    const job = newJob({ name: 'Example shop', startP: 13, allowDrop: 7 });
    const add = (parent, dir, feet, heater) => {
      const id = 'n' + job.seq++;
      job.nodes.push({ id, parent, dir, feet, drop: null, heater: heater || null });
      return id;
    };
    const a = add('n0', 'E', 40);
    let p = add(a, 'E', 30);
    add(p, 'S', 15, { name: 'H1', mbh: 150 });
    p = add(p, 'E', 50);
    add(p, 'S', 15, { name: 'H2', mbh: 150 });
    p = add(p, 'E', 50, { name: 'H3', mbh: 150 });
    let b = add(a, 'S', 80);
    b = add(b, 'E', 30);
    add(b, 'N', 15, { name: 'H4', mbh: 125 });
    b = add(b, 'E', 50);
    add(b, 'N', 15, { name: 'H5', mbh: 125 });
    add(b, 'E', 50, { name: 'H6', mbh: 125 });
    job.last = Object.assign(job.last, { mbh: 125, name: 'H6', dropFt: 15, dropDir: 'S' });
    return job;
  }

  window.GasStore = { newJob, loadAll, saveAll, currentId, setCurrentId, lastUnit, setLastUnit, isValid, normalize,
    History, example, uid };
})();
