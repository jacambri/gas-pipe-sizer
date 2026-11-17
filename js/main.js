/* The app: holds the open job, reacts to taps and buttons, saves after every change. */
(function () {
  'use strict';
  const E = window.GasEngine, S = window.GasStore, U = window.GasUI, L = window.GasList;
  const $ = s => document.querySelector(s);
  const esc = U.esc, fmt = U.fmt;
  const whole = v => Math.round(v).toLocaleString();
  const perpendicular = d => (d === 'E' || d === 'W' ? 'S' : 'E');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  const INSTALL_TIP = 'To use it with no internet: tap the Share button, then "Add to Home Screen", ' +
    'and open it from that icon from now on.';

  const App = {
    jobs: [], job: null, r: null, sel: { k: 'node', id: 'n0' }, hist: new S.History(150), listOpen: false,

    init() {
      U.trackViewport();
      this.drawing = new window.GasDraw.Drawing($('#canvas'), (k, id) => this.select(k, id));
      this.jobs = S.loadAll();
      this.bind();
      const cur = this.jobs.find(j => j.id === S.currentId()) ||
        this.jobs.slice().sort((a, b) => b.updated - a.updated)[0];
      if (cur) this.open(cur.id);
      else { this.job = S.newJob({ name: 'New job' }); this.refresh(); this.firstRun(); }
      this.registerSW();
    },

    bind() {
      $('#btnJobs').onclick = () => this.jobsMenu();
      $('#jobTitle').onclick = () => this.settings();
      $('#btnSettings').onclick = () => this.settings();
      $('#btnPipe').onclick = () => this.addPipe();
      $('#btnHeater').onclick = () => this.addHeater();
      $('#btnEdit').onclick = () => this.edit();
      $('#btnDelete').onclick = () => this.remove();
      $('#btnUndo').onclick = () => this.undo();
      $('#btnRedo').onclick = () => this.redo();
      $('#btnFit').onclick = () => this.drawing.fit();
      $('#btnList').onclick = () => this.toggleList(true);
      $('#status').onclick = () => this.toggleList(true);
      document.addEventListener('keydown', e => {
        if (U.isOpen() || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
        e.preventDefault();
        if (e.shiftKey) this.redo(); else this.undo();
      });
    },

    // ---------- state ----------
    node(id) { return this.job.nodes.find(n => n.id === id); },
    anchor() { return this.sel.id; }, // the point new pipes and heaters attach to
    open(id) {
      const job = this.jobs.find(j => j.id === id);
      if (!job) return;
      this.job = job;
      S.setCurrentId(id);
      this.hist.clear();
      this.sel = { k: 'node', id: job.nodes[0].id };
      this.drawing.autoFit = true;
      if (this.listOpen) this.toggleList(false);
      this.refresh();
    },
    save() {
      const i = this.jobs.findIndex(j => j.id === this.job.id);
      if (i >= 0) this.jobs[i] = this.job; else this.jobs.push(this.job);
      S.setCurrentId(this.job.id);
      if (!S.saveAll(this.jobs)) U.toast('Could not save on this device (storage full or private browsing).');
    },
    commit(change, sel) {
      this.hist.record(JSON.stringify(this.job));
      change(this.job);
      this.job.updated = Date.now();
      if (sel) this.sel = sel;
      this.save();
      this.refresh();
    },
    undo() { this.travel(this.hist.undo(JSON.stringify(this.job)), 'Undone'); },
    redo() { this.travel(this.hist.redo(JSON.stringify(this.job)), 'Redone'); },
    travel(snapshot, msg) {
      if (!snapshot) return;
      this.job = JSON.parse(snapshot);
      this.save();
      this.refresh();
      U.toast(msg);
    },
    fixSel() {
      const n = this.node(this.sel.id);
      if (!n || (this.sel.k === 'heater' && !n.heater) || (this.sel.k === 'pipe' && n.parent == null)) {
        this.sel = { k: 'node', id: this.job.nodes[0].id };
      }
    },
    select(k, id) {
      this.sel = { k, id };
      this.drawing.sel = this.sel;
      this.drawing.render();
      this.renderSel();
    },

    // ---------- screen ----------
    refresh() {
      this.fixSel();
      this.r = E.compute(this.job);
      const j = this.job;
      $('#jobTitle').textContent = j.name || 'Untitled job';
      $('#btnSettings').textContent = `${fmt(j.startP, 1)}" WC · ${fmt(j.allowDrop, 1)}" drop · ` +
        (j.gas === 'LP' ? 'Propane' : 'Nat. gas');
      this.drawing.setData(j, this.r, this.sel);
      this.renderSel();
      this.renderStatus();
      if (this.listOpen) {
        L.render($('#listView'), j, this.r, (k, id) => { this.toggleList(false); this.select(k, id); },
          () => this.toggleList(false));
      }
    },
    renderSel() {
      const s = this.sel, r = this.r, a = this.anchor(), isRoot = a === r.rootId;
      let html;
      if (s.k === 'heater') {
        const h = r.heaters.find(x => x.id === s.id);
        html = `<b>${esc(h.name || 'Heater')}</b> · ${fmt(h.mbh, h.mbh % 1 ? 1 : 0)} MBH = ${fmt(h.cfh, 1)} CFH · ` +
          `${fmt(h.pressure, 2)}" WC ` + (h.ok ? '<span class="ok">✓ OK</span>'
            : `<span class="bad">⚠ below ${fmt(r.minP, 2)}"</span>`);
      } else if (isRoot) {
        html = `<b>Regulator</b> · ${fmt(this.job.startP, 1)}" WC · feeds ${whole(r.totals.cfh)} CFH` +
          (r.pipes.length ? '' : ' · tap <b>+ Pipe</b> for the feet to the first heater or branch');
      } else {
        const p = r.pipeOf[a];
        html = (s.k === 'pipe' ? `<b>S${p.sec}</b> · ${fmt(p.feet, p.feet % 1 ? 1 : 0)} ft · ${whole(p.cfh)} CFH · ` +
          `drop ${fmt(p.drop, 3)}"${p.custom ? '' : ' auto'} · <b>${p.size ? esc(p.size.label) : 'no size'}</b>`
          : `<b>End of S${p.sec}</b> · ${whole(r.at[a].run)} ft from the regulator`) +
          ` · ${fmt(p.pOut, 2)}" WC here`;
      }
      $('#selInfo').innerHTML = html;
      $('#btnHeater').disabled = isRoot;
      $('#btnDelete').disabled = isRoot && s.k !== 'heater';
      $('#btnEdit').textContent = s.k === 'heater' ? 'Edit heater' : isRoot ? 'Edit job' : 'Edit pipe';
      $('#btnDelete').textContent = s.k === 'heater' ? 'Delete heater' : 'Delete pipe';
      $('#btnUndo').disabled = !this.hist.past.length;
      $('#btnRedo').disabled = !this.hist.future.length;
    },
    renderStatus() {
      const r = this.r, t = r.totals;
      const bits = [`${whole(t.cfh)} CFH`, `${t.heaters} heater${t.heaters === 1 ? '' : 's'}`];
      if (t.lowest) bits.push(`lowest ${fmt(t.lowest.pressure, 2)}" at ${esc(t.lowest.name || 'a heater')}`);
      let cls = 'ok', msg = '✓ All OK';
      if (r.warnings.length) { cls = 'bad'; msg = '⚠ ' + esc(r.warnings[0]); }
      else if (t.lowHeaters || t.lowPipes) {
        cls = 'bad';
        msg = t.lowHeaters ? `⚠ ${t.lowHeaters} heater${t.lowHeaters === 1 ? '' : 's'} below ${fmt(r.minP, 2)}" WC`
          : `⚠ pressure below ${fmt(r.minP, 2)}" WC`;
      } else if (t.emptyPipes) {
        cls = 'warn';
        msg = `⚠ ${t.emptyPipes} pipe${t.emptyPipes === 1 ? '' : 's'} with nothing past ${t.emptyPipes === 1 ? 'it' : 'them'}`;
      } else if (t.biggerPipes) {
        cls = 'warn';
        msg = `Note: ${t.biggerPipes} pipe${t.biggerPipes === 1 ? ' is' : 's are'} bigger than the pipe feeding ${t.biggerPipes === 1 ? 'it' : 'them'}`;
      } else if (!t.heaters) { cls = ''; msg = 'Add heaters to size the pipes'; }
      const st = $('#status');
      st.className = 'status ' + cls;
      st.innerHTML = `<b>${msg}</b> · ${bits.join(' · ')} <span class="more">List ›</span>`;
    },
    toggleList(show) {
      this.listOpen = show;
      $('#listView').hidden = !show;
      $('#stage').hidden = show;
      if (show) $('#listView').scrollTop = 0;
      this.refresh();
    },

    // ---------- drawing ----------
    async addPipe() {
      const from = this.anchor(), fn = this.node(from), last = this.job.last, r = this.r;
      const isRoot = fn.parent == null;
      const p = r.pipeOf[from];
      const res = await U.pipeDialog({
        title: isRoot ? 'Pipe from the regulator' : 'Add pipe',
        sub: isRoot ? 'Feet to the first heater or branch.'
          : `From the end of S${p.sec}. Feet to the next heater or branch.`,
        dir: fn.dir || last.pipeDir || 'E', back: fn.dir ? E.OPPOSITE[fn.dir] : null,
        heaterOn: !!last.pipeHeater, name: this.nextName(), mbh: last.mbh, btu: E.btuPerCfOf(this.job),
      });
      if (!res) return;
      const id = 'n' + this.job.seq;
      this.commit(j => {
        j.seq += 1;
        j.nodes.push({ id, parent: from, dir: res.dir, feet: res.feet, drop: null, heater: res.heater });
        j.last.pipeDir = res.dir;
        j.last.pipeHeater = !!res.heater;
        if (res.heater) Object.assign(j.last, { mbh: res.heater.mbh, name: res.heater.name });
      }, { k: 'node', id });
      this.drawing.ensureVisible(id);
    },

    async addHeater() {
      const at = this.anchor(), n = this.node(at), last = this.job.last;
      if (n.parent == null) return U.toast('Draw a pipe from the regulator first.');
      const back = E.OPPOSITE[n.dir];
      const dropDir = last.dropDir && last.dropDir !== back && last.dropDir !== n.dir ? last.dropDir : perpendicular(n.dir);
      const res = await U.heaterDialog({
        title: 'Add heater', sub: `At the end of S${this.r.pipeOf[at].sec}.`, name: this.nextName(), mbh: last.mbh,
        dropFt: n.heater && !last.dropFt ? 10 : last.dropFt, dropDir, back, btu: E.btuPerCfOf(this.job), here: !!n.heater,
      });
      if (!res) return;
      const heater = { name: res.name, mbh: res.mbh };
      const remember = j => Object.assign(j.last, { mbh: res.mbh, name: res.name, dropFt: res.dropFt,
        dropDir: res.dropFt > 0 ? res.dropDir : j.last.dropDir });
      if (res.dropFt > 0) {
        const id = 'n' + this.job.seq;
        this.commit(j => {
          j.seq += 1;
          j.nodes.push({ id, parent: at, dir: res.dropDir, feet: res.dropFt, drop: null, heater });
          remember(j);
        }, { k: 'node', id: at });
      } else {
        this.commit(j => { j.nodes.find(m => m.id === at).heater = heater; remember(j); }, { k: 'node', id: at });
      }
    },

    // Next heater name: "GIRH 1-3" -> "GIRH 1-4", "H7" -> "H8", never a name already used.
    nextName() {
      const used = new Set(this.job.nodes.filter(n => n.heater).map(n => n.heater.name));
      const m = /^(.*?)(\d+)(\D*)$/.exec(this.job.last.name || '');
      let k = m ? parseInt(m[2], 10) + 1 : used.size + 1;
      const make = i => (m ? m[1] + i + m[3] : 'H' + i);
      while (used.has(make(k))) k += 1;
      return make(k);
    },

    edit() {
      const s = this.sel;
      if (s.k === 'heater') return this.editHeater(s.id);
      if (s.id === this.r.rootId) return this.settings();
      return this.editPipe(s.id);
    },

    async editPipe(id) {
      const n = this.node(id), p = this.r.pipeOf[id], parent = this.node(n.parent);
      const facts = `<b>${whole(p.cfh)} CFH</b> flows through this pipe` +
        (p.size ? ` · needs ${fmt(p.d, 3)}" inside → <b>${esc(p.size.label)}</b>` : ' · nothing is connected past it') +
        `<br>Pressure ${fmt(p.pIn, 2)}" → ${fmt(p.pOut, 2)}" WC · ${whole(this.r.at[id].run)} ft from the regulator` +
        (p.status === 'bigger' ? `<br>Note: bigger than S${p.parentSec}, the pipe feeding it.` : '');
      const res = await U.editPipeDialog({ sec: p.sec, dir: n.dir, back: parent.dir ? E.OPPOSITE[parent.dir] : null,
        feet: n.feet, drop: n.drop, rate: this.r.rate, facts });
      if (!res) return;
      if (res.action === 'delete') return this.removePipe(id);
      if (res.action === 'split') return this.split(id, res.at);
      this.commit(j => {
        const m = j.nodes.find(x => x.id === id);
        Object.assign(m, { dir: res.dir, feet: res.feet, drop: res.drop });
      }, { k: 'pipe', id });
    },

    async editHeater(id) {
      const n = this.node(id), h = this.r.heaters.find(x => x.id === id);
      const facts = `${fmt(h.cfh, 1)} CFH · ${fmt(h.pressure, 2)}" WC at this heater · ` +
        (h.ok ? 'OK' : `below the ${fmt(this.r.minP, 2)}" minimum`);
      const res = await U.editHeaterDialog({ name: n.heater.name, mbh: n.heater.mbh, btu: E.btuPerCfOf(this.job), facts });
      if (!res) return;
      if (res.action === 'delete') return this.removeHeater(id);
      this.commit(j => { j.nodes.find(x => x.id === id).heater = { name: res.name, mbh: res.mbh }; }, { k: 'heater', id });
    },

    remove() {
      if (this.sel.k === 'heater') return this.removeHeater(this.sel.id);
      if (this.sel.id !== this.r.rootId) return this.removePipe(this.sel.id);
      return null;
    },

    descendants(id) {
      const kids = {};
      for (const n of this.job.nodes) if (n.parent) (kids[n.parent] = kids[n.parent] || []).push(n.id);
      const out = [], stack = [id];
      while (stack.length) { const x = stack.pop(); out.push(x); (kids[x] || []).forEach(c => stack.push(c)); }
      return out;
    },

    async removePipe(id) {
      const ids = this.descendants(id), p = this.r.pipeOf[id];
      const heaters = ids.filter(x => this.node(x).heater).length, more = ids.length - 1;
      if (more > 0 || heaters > 1) {
        const ok = await U.choose(`Delete S${p.sec}?`, `This also removes ${more} pipe${more === 1 ? '' : 's'} and ` +
          `${heaters} heater${heaters === 1 ? '' : 's'} past it. Undo brings them back.`,
        [{ label: `Delete S${p.sec} and everything past it`, value: true, cls: 'danger' }]);
        if (!ok) return;
      }
      const parent = this.node(id).parent, gone = new Set(ids);
      this.commit(j => { j.nodes = j.nodes.filter(n => !gone.has(n.id)); }, { k: 'node', id: parent });
      U.toast(`Deleted S${p.sec}. Undo brings it back.`);
    },

    async removeHeater(id) {
      const n = this.node(id), p = this.r.pipeOf[id];
      const leaf = !this.job.nodes.some(m => m.parent === id);
      let what = 'heater';
      if (leaf) {
        what = await U.choose(`Delete ${n.heater.name || 'this heater'}?`, `It is at the end of S${p.sec} (${p.feet} ft).`, [
          { label: 'Delete the heater and its pipe', value: 'both', cls: 'danger' },
          { label: 'Delete the heater, keep the pipe', value: 'heater' }]);
        if (!what) return;
      }
      if (what === 'both') this.commit(j => { j.nodes = j.nodes.filter(m => m.id !== id); }, { k: 'node', id: n.parent });
      else this.commit(j => { j.nodes.find(m => m.id === id).heater = null; }, { k: 'node', id });
      U.toast('Heater deleted. Undo brings it back.');
    },

    split(id, at) {
      const mid = 'n' + this.job.seq;
      this.commit(j => {
        j.seq += 1;
        const i = j.nodes.findIndex(n => n.id === id), n = j.nodes[i], part = at / n.feet;
        j.nodes.splice(i, 0, { id: mid, parent: n.parent, dir: n.dir, feet: at,
          drop: n.drop != null ? n.drop * part : null, heater: null });
        n.parent = mid;
        n.feet = Math.round((n.feet - at) * 10000) / 10000;
        if (n.drop != null) n.drop *= 1 - part;
      }, { k: 'node', id: mid });
      U.toast('Pipe split. Add a heater or a branch at the new point.');
    },

    // ---------- jobs ----------
    async settings() {
      const j = this.job;
      const res = await U.jobDialog({ title: 'Job', okText: 'Save', name: j.name, startP: j.startP,
        allowDrop: j.allowDrop, gas: j.gas, btuPerCf: j.btuPerCf });
      if (res) this.commit(x => Object.assign(x, res));
    },

    async newJob() {
      const prev = this.jobs.find(j => j.id === this.job.id) ? this.job : null;
      const res = await U.jobDialog({ title: 'New job', okText: 'Start',
        sub: 'Start at the main regulator. Next you draw the feet to the first heater or branch.',
        name: '', startP: prev ? prev.startP : 13, allowDrop: prev ? prev.allowDrop : 7, gas: prev ? prev.gas : 'NG' });
      if (!res) return false;
      const job = S.newJob(res);
      job.btuPerCf = res.btuPerCf;
      if (prev) Object.assign(job.last, { mbh: prev.last.mbh, dropFt: prev.last.dropFt, dropDir: prev.last.dropDir });
      this.jobs.push(job);
      this.open(job.id);
      this.save();
      this.addPipe();
      return true;
    },

    async firstRun() {
      const a = await U.welcome({ installTip: isIOS && !standalone ? INSTALL_TIP : '' });
      if (a === 'example') this.loadExample();
      else if (a === 'new' && !(await this.newJob())) this.firstRun();
    },

    loadExample() {
      const job = S.example();
      this.jobs.push(job);
      this.open(job.id);
      this.save();
      U.toast('Example loaded. Tap any pipe or heater to see it.');
    },

    async jobsMenu() {
      const saved = this.jobs.some(j => j.id === this.job.id);
      const rows = this.jobs.slice().sort((a, b) => b.updated - a.updated).map(j => ({ id: j.id, name: j.name,
        heaters: j.nodes.filter(n => n.heater).length, when: new Date(j.updated).toLocaleDateString() }));
      const res = await U.jobsSheet({ jobs: rows, currentId: saved ? this.job.id : null, offlineText: this.offlineText() });
      if (!res) return;
      if (res.action === 'open') this.open(res.id);
      else if (res.action === 'new') this.newJob();
      else if (res.action === 'example') this.loadExample();
      else if (res.action === 'import') this.importText(res.text);
      else if (res.action === 'export') this.exportJob();
      else if (res.action === 'print') L.print(this.job, this.r, this.drawing);
      else if (res.action === 'dup') this.duplicate();
      else if (res.action === 'delete') this.deleteJob();
    },

    offlineText() {
      if (location.protocol === 'file:') return 'Opened as a plain file: install it from its web address to use offline.';
      if (isIOS && !standalone) return INSTALL_TIP;
      return navigator.serviceWorker && navigator.serviceWorker.controller
        ? '✓ Jobs are saved on this device, and the app works with no internet.'
        : 'Jobs are saved on this device. Getting ready to work offline…';
    },

    importText(text) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { return U.toast('That file is not a job file.'); }
      if (!S.isValid(obj)) return U.toast('That file is not a gas pipe job.');
      const job = S.normalize(obj);
      job.id = S.uid('j');
      job.updated = Date.now();
      if (this.jobs.some(j => j.name === job.name)) job.name += ' (opened)';
      this.jobs.push(job);
      this.open(job.id);
      this.save();
      return U.toast('Opened ' + job.name);
    },

    async exportJob() {
      const data = JSON.stringify(this.job, null, 1);
      const name = (this.job.name || 'job').replace(/[\\/:*?"<>|]+/g, '-') + '.gaspipe.json';
      try {
        const file = new File([data], name, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: this.job.name });
          return;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    },

    duplicate() {
      const job = JSON.parse(JSON.stringify(this.job));
      Object.assign(job, { id: S.uid('j'), name: job.name + ' copy', created: Date.now(), updated: Date.now() });
      this.jobs.push(job);
      this.open(job.id);
      this.save();
      U.toast('Copied. You are now in ' + job.name);
    },

    async deleteJob() {
      const ok = await U.choose(`Delete "${this.job.name}"?`, 'The job is removed from this device. This cannot be undone.',
        [{ label: 'Delete the job', value: true, cls: 'danger' }]);
      if (!ok) return;
      this.jobs = this.jobs.filter(j => j.id !== this.job.id);
      S.saveAll(this.jobs);
      const next = this.jobs.slice().sort((a, b) => b.updated - a.updated)[0];
      if (next) this.open(next.id);
      else { this.job = S.newJob({ name: 'New job' }); this.hist.clear(); this.refresh(); this.firstRun(); }
    },

    registerSW() {
      if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline install not available here */ });
    },
  };

  window.GasApp = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
  else App.init();
})();
