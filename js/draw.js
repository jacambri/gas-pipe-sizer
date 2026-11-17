/* The drawing: pipes to scale with feet and size, heaters with input and pressure.
   One finger drags, two fingers pinch-zoom, a tap selects a point, a pipe or a heater. */
(function () {
  'use strict';
  const C = { pipe: '#1f3864', low: '#c62828', empty: '#9aa3ad', sel: '#ff8f00', heat: '#e65100', grid: '#edf1f6' };
  const GRID_STEPS = [5, 10, 25, 50, 100, 250, 500, 1000];
  const SCALE_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ft(f) { return String(Math.round(f * 10) / 10); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function strokeFor(p) {
    if (!p.size) return 3;
    const n = p.size.nom;
    return n <= 1 ? 3 : n <= 1.5 ? 4.5 : n <= 2 ? 6 : n <= 3 ? 7.5 : 9;
  }

  // Label spacing: measure text, keep a list of taken boxes, and skip a label that would overlap one.
  const widths = {};
  let ctx = null;
  function textWidth(text, px, bold) {
    const key = (bold ? 'b' : '') + px + '|' + text;
    if (widths[key] != null) return widths[key];
    if (ctx === null) {
      try { ctx = document.createElement('canvas').getContext('2d') || false; } catch (e) { ctx = false; }
    }
    let w = text.length * px * (bold ? 0.6 : 0.55);
    if (ctx) {
      ctx.font = `${bold ? '700 ' : ''}${px}px -apple-system, "Segoe UI", Arial, sans-serif`;
      w = ctx.measureText(text).width;
    }
    widths[key] = w;
    return w;
  }
  function textBox(x, y, w, px, anchor) {
    const x0 = anchor === 'start' ? x : anchor === 'middle' ? x - w / 2 : x - w;
    return { x0: x0 - 3, y0: y - px * 0.9 - 2, x1: x0 + w + 3, y1: y + px * 0.3 + 2 };
  }
  function Taken() { this.boxes = []; }
  Taken.prototype.free = function (b) {
    return this.boxes.every(o => b.x0 >= o.x1 || b.x1 <= o.x0 || b.y0 >= o.y1 || b.y1 <= o.y0);
  };
  Taken.prototype.take = function (b) { this.boxes.push(b); return b; };
  Taken.prototype.drop = function (b) { this.boxes = this.boxes.filter(o => o !== b); };

  function Drawing(svg, onTap) {
    this.svg = svg;
    this.onTap = onTap;
    this.view = { s: 3, tx: 0, ty: 0 };
    this.autoFit = true;
    this.ptrs = new Map();
    this.raf = 0;
    this.r = null;
    this._bind();
    window.addEventListener('resize', () => (this.autoFit ? this.fit() : this.render()));
  }

  Drawing.prototype.setData = function (job, r, sel) {
    this.job = job;
    this.r = r;
    this.sel = sel;
    this.byId = {};
    for (const n of job.nodes) this.byId[n.id] = n;
    if (this.autoFit) this.fit(); else this.render();
  };

  Drawing.prototype._size = function () {
    const b = this.svg.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height) };
  };

  Drawing.prototype.fitView = function (w, h) {
    const r = this.r;
    let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    for (const id of r.order) {
      const a = r.at[id];
      x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x); y1 = Math.max(y1, a.y);
    }
    const mx = 100, my = 64;
    const bw = x1 - x0, bh = y1 - y0;
    let s = Math.min(bw > 0 ? (w - 2 * mx) / bw : 6, bh > 0 ? (h - 2 * my) / bh : 6);
    s = clamp(s, 0.05, 6);
    return { s, tx: (w - s * (x0 + x1)) / 2, ty: (h - s * (y0 + y1)) / 2 };
  };

  Drawing.prototype.fit = function () {
    if (!this.r) return;
    const { w, h } = this._size();
    if (!w || !h) return;
    this.view = this.fitView(w, h);
    this.autoFit = true;
    this.render();
  };

  Drawing.prototype.render = function () {
    if (!this.r) return;
    const { w, h } = this._size();
    if (!w || !h) return;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.innerHTML = this.markup(w, h, this.view, this.sel || {}, true);
  };

  // Full <svg> for printing at a fixed size.
  Drawing.prototype.staticSvg = function (w, h) {
    const view = this.fitView(w, h);
    return `<svg class="print-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
      this.markup(w, h, view, {}, false) + '</svg>';
  };

  Drawing.prototype.markup = function (w, h, v, sel, live) {
    const r = this.r, job = this.job, byId = this.byId;
    const P = (x, y) => [r1(x * v.s + v.tx), r1(y * v.s + v.ty)];
    const out = [];

    // Background grid (feet) and a scale bar, so the drawing reads to scale.
    const g = GRID_STEPS.find(sp => sp * v.s >= 22) || 1000;
    const gx0 = Math.floor(-v.tx / v.s / g) * g, gx1 = (w - v.tx) / v.s;
    const gy0 = Math.floor(-v.ty / v.s / g) * g, gy1 = (h - v.ty) / v.s;
    const grid = [];
    for (let x = gx0; x <= gx1; x += g) { const sx = r1(x * v.s + v.tx); grid.push(`M${sx} 0V${h}`); }
    for (let y = gy0; y <= gy1; y += g) { const sy = r1(y * v.s + v.ty); grid.push(`M0 ${sy}H${w}`); }
    out.push(`<path d="${grid.join('')}" stroke="${C.grid}" stroke-width="1" fill="none"/>`);
    const L = SCALE_STEPS.find(sp => sp * v.s >= 70) || 2000;
    const lp = r1(L * v.s);
    out.push(`<g class="scale" transform="translate(14 ${h - 16})"><path d="M0 -6V0H${lp}V-6" stroke="#5f6b7a" stroke-width="1.5" fill="none"/>` +
      `<text x="${lp / 2}" y="-9" text-anchor="middle">${L} ft</text></g>`);

    // Pipes. Lines first; their labels are placed afterwards so they can be spaced out.
    const pipeLabels = [];
    for (const p of r.pipes) {
      const a = r.at[p.from], b = r.at[p.id];
      const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y);
      const sw = strokeFor(p);
      const color = p.status === 'low' ? C.low : p.status === 'empty' ? C.empty : C.pipe;
      const line = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
      const isSel = sel.k === 'pipe' && sel.id === p.id;
      if (isSel) out.push(`<line ${line} stroke="${C.sel}" stroke-width="${sw + 12}" stroke-linecap="round" opacity=".45"/>`);
      out.push(`<line ${line} stroke="${color}" stroke-width="${sw}" stroke-linecap="round"` +
        `${p.status === 'empty' ? ' stroke-dasharray="7 7"' : ''}/>`);
      if (live) out.push(`<line ${line} data-k="pipe" data-id="${p.id}" stroke="transparent" stroke-width="28"/>`);
      if (Math.hypot(x2 - x1, y2 - y1) >= 16) {
        pipeLabels.push({ p, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, sw, horiz: p.dir === 'E' || p.dir === 'W', sel: isSel });
      }
    }

    // Junctions, dead ends, and the regulator.
    const taken = new Taken();
    for (const id of r.order) {
      const n = byId[id], a = r.at[id];
      const [x, y] = P(a.x, a.y);
      if (id === r.rootId) {
        const first = a.kids.length ? byId[a.kids[0]].dir : 'E';
        const an = first !== 'W' ? 'end' : 'start', lx = an === 'end' ? x - 20 : x + 20;
        const press = `${job.startP}" WC`;
        out.push(`<circle cx="${x}" cy="${y}" r="13" fill="#fff" stroke="${C.pipe}" stroke-width="3"/>` +
          `<text class="reg" x="${x}" y="${y + 5}" text-anchor="middle">R</text>` +
          `<text class="hl" x="${lx}" y="${y - 2}" text-anchor="${an}">Regulator</text>` +
          `<text class="hl2" x="${lx}" y="${y + 14}" text-anchor="${an}">${esc(press)}</text>`);
        taken.take({ x0: x - 16, y0: y - 16, x1: x + 16, y1: y + 16 });
        taken.take(textBox(lx, y - 2, textWidth('Regulator', 13, true), 13, an));
        taken.take(textBox(lx, y + 14, textWidth(press, 12), 12, an));
        if (!a.kids.length && live) {
          out.push(`<text class="hint" x="${x}" y="${y + 48}" text-anchor="middle">Tap  + Pipe  to draw the first pipe</text>`);
        }
      } else if (!n.heater) {
        out.push(a.kids.length
          ? `<circle cx="${x}" cy="${y}" r="5" fill="${C.pipe}"/>`
          : `<circle cx="${x}" cy="${y}" r="5.5" fill="#fff" stroke="${C.empty}" stroke-width="2.5"/>`);
      }
      if (live) out.push(`<circle cx="${x}" cy="${y}" r="20" fill="transparent" data-k="node" data-id="${id}"/>`);
    }

    // Heater icons sit on the end of their pipe; their labels are placed with the rest.
    const heaterLabels = [];
    for (const ht of r.heaters) {
      const a = r.at[ht.id];
      const [x, y] = P(a.x, a.y);
      const isSel = sel.k === 'heater' && sel.id === ht.id;
      const tap = live ? ` data-k="heater" data-id="${ht.id}"` : '';
      out.push(`<g${tap}>` +
        (isSel ? `<rect x="${x - 21}" y="${y - 12}" width="42" height="24" rx="6" fill="none" stroke="${C.sel}" stroke-width="3"/>` : '') +
        `<rect x="${x - 16}" y="${y - 7}" width="32" height="14" rx="4" fill="${ht.ok ? C.heat : C.low}"/>` +
        `<path d="M${x - 11} ${y}h22" stroke="#fff" stroke-width="2" opacity=".7"/>` +
        (live ? `<circle cx="${x}" cy="${y}" r="22" fill="transparent"/>` : '') + '</g>');
      taken.take({ x0: x - 18, y0: y - 9, x1: x + 18, y1: y + 9 });
      heaterLabels.push({ ht, x, y, tap, sel: isSel, dir: byId[ht.id].dir || 'E' });
    }

    placeLabels(out, taken, pipeLabels, heaterLabels, live);

    if (sel.k === 'node' && r.at[sel.id]) {
      const a = r.at[sel.id];
      const [x, y] = P(a.x, a.y);
      out.push(`<circle cx="${x}" cy="${y}" r="17" fill="rgba(255,143,0,.14)" stroke="${C.sel}" stroke-width="3" pointer-events="none"/>`);
    }
    return out.join('');
  };

  // Pipe sizes and heater names go first (biggest pipes first), then feet, section, input and pressure
  // wherever they fit. A label that would overlap another is left off until you zoom in.
  const HEATER_SIDES = { E: ['right', 'below', 'above'], W: ['left', 'below', 'above'],
    S: ['below', 'right', 'left'], N: ['above', 'right', 'left'] };
  function heaterSpots(h, side) {
    const x = h.x, y = h.y;
    if (side === 'right') return [[x + 22, y - 3, 'start'], [x + 22, y + 12, 'start']];
    if (side === 'left') return [[x - 22, y - 3, 'end'], [x - 22, y + 12, 'end']];
    if (side === 'below') return [[x, y + 25, 'middle'], [x, y + 40, 'middle']];
    return [[x, y - 32, 'middle'], [x, y - 17, 'middle']];
  }
  function pipeSpots(c) {
    return c.horiz
      ? [[c.mx, c.my - c.sw / 2 - 7, 'middle'], [c.mx, c.my + c.sw / 2 + 16, 'middle']]
      : [[c.mx + c.sw / 2 + 7, c.my + 4, 'start'], [c.mx - c.sw / 2 - 7, c.my + 4, 'end']];
  }
  function pipeParts(p, full) {
    const size = [p.size ? p.size.label : '—', 13, true, 'sz'];
    return full ? [[`S${p.sec} `, 11, false, 'sec'], [`${ft(p.feet)}' `, 13, false, ''], size] : [size];
  }
  function partsWidth(parts) { return parts.reduce((s, q) => s + textWidth(q[0], q[1], q[2]), 0); }

  function placeLabels(out, taken, pipes, heaters, live) {
    const place = (spots, w, px, force) => {
      for (const [x, y, an] of spots) {
        const b = textBox(x, y, w, px, an);
        if (taken.free(b)) return { x, y, an, box: taken.take(b) };
      }
      if (!force) return null;
      const [x, y, an] = spots[0];
      return { x, y, an, box: taken.take(textBox(x, y, w, px, an)) };
    };
    pipes.sort((a, b) => (b.sel - a.sel) || (b.p.cfh - a.p.cfh));
    heaters.sort((a, b) => b.sel - a.sel);
    for (const c of pipes) {
      c.parts = pipeParts(c.p, c.sel);
      c.at = place(pipeSpots(c), partsWidth(c.parts), 13, c.sel);
    }
    for (const h of heaters) {
      h.name = h.ht.name || 'Heater';
      const w = textWidth(h.name, 13, true);
      const sides = HEATER_SIDES[h.dir] || HEATER_SIDES.E;
      for (const side of sides) {
        const [x, y, an] = heaterSpots(h, side)[0];
        const b = textBox(x, y, w, 13, an);
        if (taken.free(b)) { h.side = side; h.nameBox = taken.take(b); break; }
      }
      if (!h.side && h.sel) {
        h.side = sides[0];
        const [x, y, an] = heaterSpots(h, h.side)[0];
        h.nameBox = taken.take(textBox(x, y, w, 13, an));
      }
    }
    for (const c of pipes) { // a size-only label grows to "S3 45' 1"" where there is room
      if (!c.at || c.sel) continue;
      taken.drop(c.at.box);
      const full = pipeParts(c.p, true);
      const at = place(pipeSpots(c), partsWidth(full), 13, false);
      if (at) { c.parts = full; c.at = at; } else taken.take(c.at.box);
    }
    for (const h of heaters) {
      if (!h.side) continue;
      const ht = h.ht;
      h.info = `${ft(ht.mbh)} MBH · ${ht.pressure == null ? '—' : ht.pressure.toFixed(2) + '"'}${ht.ok ? '' : ' ⚠'}`;
      const [x, y, an] = heaterSpots(h, h.side)[1];
      const b = textBox(x, y, textWidth(h.info, 12, false), 12, an);
      taken.drop(h.nameBox); // the second line may touch its own name line
      const fits = taken.free(b);
      taken.take(h.nameBox);
      if (fits || h.sel) { taken.take(b); h.infoAt = [x, y, an]; }
    }
    for (const c of pipes) {
      if (!c.at) continue;
      const body = c.parts.map(([t, , , cls]) => (cls ? `<tspan class="${cls}">${esc(t)}</tspan>` : esc(t))).join('');
      out.push(`<text class="pl${c.p.status === 'low' ? ' bad' : ''}" x="${r1(c.at.x)}" y="${r1(c.at.y)}" ` +
        `text-anchor="${c.at.an}"${live ? ` data-k="pipe" data-id="${c.p.id}"` : ''}>${body}</text>`);
    }
    for (const h of heaters) {
      if (!h.side) continue;
      const [x, y, an] = heaterSpots(h, h.side)[0];
      out.push(`<text class="hl" x="${r1(x)}" y="${r1(y)}" text-anchor="${an}"${h.tap}>${esc(h.name)}</text>`);
      if (h.infoAt) {
        const [ix, iy, ian] = h.infoAt;
        out.push(`<text class="hl2${h.ht.ok ? '' : ' bad'}" x="${r1(ix)}" y="${r1(iy)}" text-anchor="${ian}"${h.tap}>` +
          `${esc(h.info)}</text>`);
      }
    }
  }

  Drawing.prototype.ensureVisible = function (id) {
    const a = this.r && this.r.at[id];
    if (!a || this.autoFit) return;
    const { w, h } = this._size();
    const x = a.x * this.view.s + this.view.tx, y = a.y * this.view.s + this.view.ty, m = 70;
    if (x < m || x > w - m || y < m || y > h - m) {
      this.view.tx += w / 2 - x;
      this.view.ty += h / 2 - y;
      this.render();
    }
  };

  Drawing.prototype.zoomAt = function (sx, sy, k) {
    const v = this.view;
    const s = clamp(v.s * k, 0.05, 40);
    const wx = (sx - v.tx) / v.s, wy = (sy - v.ty) / v.s;
    this.view = { s, tx: sx - wx * s, ty: sy - wy * s };
    this.autoFit = false;
    this._later();
  };

  Drawing.prototype._later = function () {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  };

  Drawing.prototype._bind = function () {
    const svg = this.svg;
    const local = (x, y) => { const b = svg.getBoundingClientRect(); return [x - b.left, y - b.top]; };
    svg.addEventListener('pointerdown', e => {
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older Safari */ }
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.ptrs.size === 1) {
        this.down = { x: e.clientX, y: e.clientY, target: e.target, moved: false, view: Object.assign({}, this.view) };
      } else if (this.ptrs.size === 2) {
        if (this.down) this.down.moved = true;
        const [a, b] = Array.from(this.ptrs.values());
        const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx, my, view: Object.assign({}, this.view) };
      }
    });
    svg.addEventListener('pointermove', e => {
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.ptrs.size >= 2 && this.pinch) {
        const [a, b] = Array.from(this.ptrs.values());
        const p = this.pinch;
        const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
        const s = clamp(p.view.s * (Math.hypot(a.x - b.x, a.y - b.y) || 1) / p.d, 0.05, 40);
        const wx = (p.mx - p.view.tx) / p.view.s, wy = (p.my - p.view.ty) / p.view.s;
        this.view = { s, tx: mx - wx * s, ty: my - wy * s };
        this.autoFit = false;
        this._later();
      } else if (this.ptrs.size === 1 && this.down) {
        const dx = e.clientX - this.down.x, dy = e.clientY - this.down.y;
        if (!this.down.moved && Math.hypot(dx, dy) > 8) this.down.moved = true;
        if (this.down.moved) {
          this.view.tx = this.down.view.tx + dx;
          this.view.ty = this.down.view.ty + dy;
          this.autoFit = false;
          this._later();
        }
      }
    });
    const end = e => {
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.delete(e.pointerId);
      if (this.ptrs.size < 2) this.pinch = null;
      if (this.ptrs.size === 1) {
        const p = Array.from(this.ptrs.values())[0];
        this.down = { x: p.x, y: p.y, target: null, moved: true, view: Object.assign({}, this.view) };
      } else if (this.ptrs.size === 0) {
        if (e.type === 'pointerup' && this.down && !this.down.moved) this._tap(this.down.target);
        this.down = null;
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = local(e.clientX, e.clientY);
      this.zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  };

  Drawing.prototype._tap = function (target) {
    const el = target && target.closest ? target.closest('[data-k]') : null;
    if (el) this.onTap(el.getAttribute('data-k'), el.getAttribute('data-id'));
  };

  window.GasDraw = { Drawing };
})();
