/* Pop-up sheets (dialogs) and small helpers. Each dialog returns a Promise: the answer, or null if cancelled. */
(function () {
  'use strict';
  const E = window.GasEngine;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  let closeCurrent = null;
  let toastTimer = 0;

  // A stored pressure (inches WC) as the number to put in an input box in this unit.
  function inputVal(vWc, unit, drop) {
    if (vWc == null || !isFinite(vWc)) return '';
    const dec = unit === 'psi' ? (drop ? 5 : 4) : (drop ? 4 : 3);
    return String(parseFloat(E.toUnit(vWc, unit).toFixed(dec)));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function num(input) {
    const v = parseFloat(String(input.value).replace(',', '.'));
    return isFinite(v) ? v : NaN;
  }
  function fmt(v, d) { return v == null || !isFinite(v) ? '—' : Number(v).toFixed(d); }
  function mbhOf(v) { return v >= 1000 ? v / 1000 : v; } // 135000 typed as BTU/hr means 135 MBH

  // Keep sheets above the iPad keyboard by tracking the visible part of the screen.
  function trackViewport() {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const upd = () => {
      root.style.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px');
      root.style.setProperty('--vvt', (vv ? vv.offsetTop : 0) + 'px');
    };
    upd();
    if (vv) { vv.addEventListener('resize', upd); vv.addEventListener('scroll', upd); }
    window.addEventListener('resize', upd);
  }

  function open(html, wire) {
    return new Promise(resolve => {
      if (closeCurrent) closeCurrent(null);
      const sheet = $('#sheet'), back = $('#sheetBackdrop');
      sheet.innerHTML = html;
      sheet.hidden = false;
      back.hidden = false;
      sheet.scrollTop = 0;
      const close = val => {
        if (closeCurrent !== close) return;
        closeCurrent = null;
        sheet.hidden = true;
        back.hidden = true;
        sheet.innerHTML = '';
        resolve(val);
      };
      closeCurrent = close;
      back.onclick = () => close(null);
      $$('[data-close]', sheet).forEach(b => { b.onclick = () => close(null); });
      wire(sheet, close);
    });
  }
  function isOpen() { return !!closeCurrent; }

  function head(title, okText) {
    return `<div class="sh-head"><button type="button" class="btn ghost" data-close>Cancel</button>` +
      `<h2>${esc(title)}</h2>${okText ? `<button type="button" class="btn primary" id="ok">${esc(okText)}</button>` : '<span></span>'}</div>`;
  }
  function showErr(el, msg) {
    const e = $('#err', el);
    e.textContent = msg;
    e.hidden = false;
    return null;
  }
  function onEnter(el, fn) {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); fn(); }
    });
  }

  function dirPad(cur, back) {
    const b = (d, arrow, label) => `<button type="button" class="dir${d === cur ? ' on' : ''}" data-dir="${d}"` +
      `${d === back ? ' disabled' : ''} aria-label="${label}">${arrow}</button>`;
    return `<div class="dirpad"><i></i>${b('N', '↑', 'Up')}<i></i>${b('W', '←', 'Left')}<i class="c"></i>` +
      `${b('E', '→', 'Right')}<i></i>${b('S', '↓', 'Down')}<i></i></div>`;
  }
  function wirePad(el, scope, onPick) {
    const btns = $$(scope + ' .dir', el);
    btns.forEach(btn => {
      btn.onclick = () => { btns.forEach(x => x.classList.toggle('on', x === btn)); onPick(btn.dataset.dir); };
    });
  }
  function chips(values, attr) {
    return `<div class="chips">${values.map(v => `<button type="button" class="chip" data-${attr}="${v}">${v}</button>`).join('')}</div>`;
  }

  function heaterFields(o) {
    return `<div class="grid2">` +
      `<label class="fld"><span>Heater name</span><input id="hName" class="mid" value="${esc(o.name || '')}" ` +
      `autocomplete="off" autocapitalize="words" placeholder="H1"></label>` +
      `<label class="fld"><span>Input (MBH)</span><input id="hMbh" class="mid" inputmode="decimal" autocomplete="off" ` +
      `value="${o.mbh == null ? '' : o.mbh}" placeholder="135"></label></div>` +
      chips([60, 75, 100, 125, 135, 150, 175, 200], 'mbh') + `<p class="note" id="hNote"></p>`;
  }
  function wireHeater(el, btu) {
    const mbh = $('#hMbh', el), note = $('#hNote', el);
    const upd = () => {
      const v = mbhOf(num(mbh));
      note.textContent = v > 0
        ? `${fmt(v, v % 1 ? 1 : 0)} MBH = ${Math.round(v * 1000).toLocaleString()} BTU/hr = ${fmt((v * 1000) / btu, 1)} CFH`
        : 'MBH = thousand BTU/hr (135 = 135,000 BTU/hr)';
    };
    $$('[data-mbh]', el).forEach(c => { c.onclick = () => { mbh.value = c.dataset.mbh; upd(); }; });
    mbh.addEventListener('input', upd);
    upd();
    return () => ({ name: $('#hName', el).value.trim(), mbh: mbhOf(num(mbh)) });
  }

  // Add a pipe: which way, how many feet, and (optionally) the heater at its end.
  function pipeDialog(o) {
    const html = head(o.title, 'Add') + (o.sub ? `<p class="sub">${esc(o.sub)}</p>` : '') +
      `<div class="pipe-row"><div class="pad-wrap" id="pPad"><span class="cap">Which way</span>${dirPad(o.dir, o.back)}</div>` +
      `<div class="grow"><label class="fld"><span>Feet of pipe</span><input id="pFeet" class="big" inputmode="decimal" ` +
      `autocomplete="off" placeholder="0"></label>${chips([10, 20, 25, 40, 45, 50, 75, 100], 'ft')}</div></div>` +
      `<label class="toggle"><input type="checkbox" id="pHeat"${o.heaterOn ? ' checked' : ''}>` +
      `<span>Heater at the end of this pipe</span></label>` +
      `<div id="pHeatBox"${o.heaterOn ? '' : ' hidden'}>${heaterFields(o)}</div><p class="err" id="err" hidden></p>`;
    return open(html, (el, close) => {
      let dir = o.dir;
      wirePad(el, '#pPad', d => { dir = d; });
      const feet = $('#pFeet', el);
      $$('[data-ft]', el).forEach(c => { c.onclick = () => { feet.value = c.dataset.ft; }; });
      const heat = $('#pHeat', el), box = $('#pHeatBox', el);
      heat.onchange = () => { box.hidden = !heat.checked; };
      const getHeater = wireHeater(el, o.btu);
      const submit = () => {
        const f = num(feet);
        if (!(f > 0)) return showErr(el, 'Enter the feet of pipe.');
        let heater = null;
        if (heat.checked) {
          heater = getHeater();
          if (!(heater.mbh > 0)) return showErr(el, 'Enter the heater input (MBH), or turn off "Heater at the end".');
        }
        return close({ dir, feet: f, heater });
      };
      $('#ok', el).onclick = submit;
      onEnter(el, submit);
      feet.focus();
    });
  }

  // Add a heater at the selected point, either right there or at the end of a short pipe (drop).
  function heaterDialog(o) {
    const html = head(o.title, 'Add') + (o.sub ? `<p class="sub">${esc(o.sub)}</p>` : '') + heaterFields(o) +
      `<div class="pipe-row"><div class="grow"><label class="fld"><span>Pipe from here to the heater (ft)</span>` +
      `<input id="dFeet" class="mid" inputmode="decimal" autocomplete="off" value="${o.dropFt || 0}"></label>` +
      `<small class="note">0 = the heater sits right on this point</small></div>` +
      `<div class="pad-wrap" id="dPad"><span class="cap">Which way</span>${dirPad(o.dropDir, o.back)}</div></div>` +
      `<p class="err" id="err" hidden></p>`;
    return open(html, (el, close) => {
      let dir = o.dropDir;
      wirePad(el, '#dPad', d => { dir = d; });
      const dft = $('#dFeet', el), pad = $('#dPad', el);
      const sync = () => pad.classList.toggle('dim', !(num(dft) > 0));
      dft.addEventListener('input', sync);
      sync();
      const getHeater = wireHeater(el, o.btu);
      const submit = () => {
        const h = getHeater();
        if (!(h.mbh > 0)) return showErr(el, 'Enter the heater input (MBH).');
        let d = num(dft);
        if (!(d >= 0)) d = 0;
        if (d === 0 && o.here) return showErr(el, 'This point already has a heater. Enter the feet of pipe out to this one.');
        return close({ name: h.name, mbh: h.mbh, dropFt: d, dropDir: dir });
      };
      $('#ok', el).onclick = submit;
      onEnter(el, submit);
    });
  }

  // Edit a pipe: its size (calculated, or one you pick), direction, feet, pressure drop; split or delete it.
  // o.size = nominal size set by hand or null; o.autoLabel = the size the calculation picks;
  // o.cfh / o.pIn / o.gas / o.high / o.minP preview the drop through a size you pick.
  function editPipeDialog(o) {
    const auto = o.drop == null;
    let size = o.size == null ? null : Number(o.size);
    const html = head(`Pipe S${o.sec}`, 'Save') +
      `<div class="fld"><span>Pipe size</span><div class="chips sizes">` +
      `<button type="button" class="chip calc" data-size="">Calculated: ${esc(o.autoLabel || '—')}</button>` +
      E.SIZES.map(s => `<button type="button" class="chip" data-size="${s.nom}">${s.label}</button>`).join('') +
      `</div><p class="note" id="pSizeTxt"></p></div>` +
      `<div class="pipe-row"><div class="pad-wrap" id="pPad"><span class="cap">Which way</span>${dirPad(o.dir, o.back)}</div>` +
      `<div class="grow"><label class="fld"><span>Feet of pipe</span><input id="pFeet" class="big" inputmode="decimal" ` +
      `autocomplete="off" value="${o.feet}"></label></div></div>` +
      `<div class="fld" id="pDropBox"><span>Pressure drop in this pipe</span><div class="seg">` +
      `<button type="button" data-mode="auto"${auto ? ' class="on"' : ''}>Auto</button>` +
      `<button type="button" data-mode="custom"${auto ? '' : ' class="on"'}>Custom</button></div>` +
      `<div class="drop-row"><input id="pDrop" class="mid" inputmode="decimal" autocomplete="off" ` +
      `placeholder="${E.unitName(o.unit)}" value="${auto ? '' : inputVal(o.drop, o.unit, true)}"${auto ? ' hidden' : ''}>` +
      `<span id="pAutoTxt" class="note"></span></div></div>` +
      `<div class="facts">${o.facts}</div>` +
      `<div class="split"><span>Split at</span><input id="pSplit" class="sm" inputmode="decimal" placeholder="ft">` +
      `<span>ft from its start</span><button type="button" class="btn" id="doSplit">Split</button></div>` +
      `<p class="err" id="err" hidden></p>` +
      `<div class="sh-foot"><button type="button" class="btn danger" id="del">Delete this pipe…</button></div>`;
    return open(html, (el, close) => {
      let dir = o.dir;
      let mode = auto ? 'auto' : 'custom';
      wirePad(el, '#pPad', d => { dir = d; });
      const feet = $('#pFeet', el), drop = $('#pDrop', el), autoTxt = $('#pAutoTxt', el);
      const shownDrop = drop.value; // untouched box = keep the stored drop exactly
      const upd = () => {
        autoTxt.textContent = mode === 'auto'
          ? `${E.pressureText(num(feet) * o.rate, o.unit, { drop: true })} — the allowable drop split by length`
          : `${E.unitName(o.unit)} for this pipe`;
      };
      $$('.seg button', el).forEach(b => {
        b.onclick = () => {
          mode = b.dataset.mode;
          $$('.seg button', el).forEach(x => x.classList.toggle('on', x === b));
          drop.hidden = mode === 'auto';
          if (mode === 'custom') drop.focus();
          upd();
        };
      });
      // A size you pick sets this pipe's drop; the pipes after it are re-sized with the pressure left over.
      const sizeTxt = $('#pSizeTxt', el), dropBox = $('#pDropBox', el);
      const updSize = () => {
        $$('[data-size]', el).forEach(b => b.classList.toggle('on', (b.dataset.size ? Number(b.dataset.size) : null) === size));
        dropBox.hidden = size != null;
        if (size == null) { sizeTxt.textContent = 'Tap a size to run a different pipe than the calculation picked.'; return; }
        const label = E.sizeByNom(size).label;
        const pOut = E.pressureAfter(o.cfh, num(feet), size, o.pIn, o.gas, o.high);
        sizeTxt.textContent = pOut == null ? `${label} can't carry ${Math.round(o.cfh)} CFH this far.`
          : `${label} drops ${E.pressureText(o.pIn - pOut, o.unit, { drop: true })}, leaving ${E.pressureText(pOut, o.unit)}` +
            (pOut < o.minP - 1e-6 ? ' — below the minimum!' : '. The pipes after it get re-sized with what is left.');
      };
      $$('[data-size]', el).forEach(b => {
        b.onclick = () => { size = b.dataset.size ? Number(b.dataset.size) : null; updSize(); };
      });
      feet.addEventListener('input', () => { upd(); updSize(); });
      upd();
      updSize();
      const submit = () => {
        const f = num(feet);
        if (!(f > 0)) return showErr(el, 'Enter the feet of pipe.');
        let d = null;
        if (mode === 'custom' && size == null) {
          d = drop.value === shownDrop && o.drop != null ? o.drop : E.fromUnit(num(drop), o.unit);
          if (!(d > 0)) return showErr(el, `Enter the pressure drop in ${E.unitName(o.unit)}, or pick Auto.`);
        }
        return close({ action: 'save', dir, feet: f, drop: d, size });
      };
      $('#ok', el).onclick = submit;
      onEnter(el, submit);
      $('#doSplit', el).onclick = () => {
        const s = num($('#pSplit', el));
        if (!(s > 0 && s < o.feet)) return showErr(el, `Enter a split point between 0 and ${o.feet} ft.`);
        return close({ action: 'split', at: s });
      };
      $('#del', el).onclick = () => close({ action: 'delete' });
    });
  }

  function editHeaterDialog(o) {
    const html = head('Heater', 'Save') + heaterFields(o) + `<div class="facts">${o.facts}</div>` +
      `<p class="err" id="err" hidden></p>` +
      `<div class="sh-foot"><button type="button" class="btn danger" id="del">Delete this heater…</button></div>`;
    return open(html, (el, close) => {
      const getHeater = wireHeater(el, o.btu);
      const submit = () => {
        const h = getHeater();
        if (!(h.mbh > 0)) return showErr(el, 'Enter the heater input (MBH).');
        return close({ action: 'save', name: h.name, mbh: h.mbh });
      };
      $('#ok', el).onclick = submit;
      onEnter(el, submit);
      $('#del', el).onclick = () => close({ action: 'delete' });
    });
  }

  // A short question with one or more answers (stacked buttons).
  function choose(title, text, buttons) {
    const html = head(title, '') + `<p class="sub">${esc(text)}</p><div class="stack">` +
      buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('') +
      `</div>`;
    return open(html, (el, close) => {
      $$('[data-i]', el).forEach(b => { b.onclick = () => close(buttons[+b.dataset.i].value); });
    });
  }

  // New job / job settings: pressure unit, regulator pressure, allowable drop, gas.
  // Pressures go in and out in inches WC; the boxes show them in the chosen unit.
  function jobDialog(o) {
    let unit = o.unit === 'psi' ? 'psi' : 'wc';
    const val = { start: o.startP, allow: o.allowDrop }; // inches WC; changed only when a box is edited
    const gasBtn = (g, label) => `<button type="button" data-gas="${g}"${o.gas === g ? ' class="on"' : ''}>${label}</button>`;
    const unitBtn = (u, label) => `<button type="button" data-u="${u}"${unit === u ? ' class="on"' : ''}>${label}</button>`;
    const html = head(o.title, o.okText) + (o.sub ? `<p class="sub">${esc(o.sub)}</p>` : '') +
      `<label class="fld"><span>Job name</span><input id="jName" class="mid" value="${esc(o.name || '')}" ` +
      `autocomplete="off" autocapitalize="words" placeholder="e.g. Marshal CCRD"></label>` +
      `<div class="fld"><span>Pressures in</span><div class="seg">${unitBtn('wc', 'inches WC')}${unitBtn('psi', 'psi')}</div></div>` +
      `<div class="grid2"><label class="fld"><span id="jStartLbl"></span>` +
      `<input id="jStart" class="big" inputmode="decimal" autocomplete="off"></label>` +
      `<label class="fld"><span id="jAllowLbl"></span>` +
      `<input id="jAllow" class="big" inputmode="decimal" autocomplete="off"></label></div>` +
      `<p class="note" id="jMin"></p><div class="fld"><span>Gas</span><div class="seg">` +
      gasBtn('NG', 'Natural gas') + gasBtn('LP', 'Propane (LP)') + `</div></div>` +
      `<details class="more"${o.btuPerCf ? ' open' : ''}><summary>Heating value</summary><label class="fld">` +
      `<span>BTU per cubic foot (blank = 1,000 natural gas, 2,500 propane)</span><input id="jBtu" class="mid" ` +
      `inputmode="decimal" autocomplete="off" value="${o.btuPerCf || ''}"></label></details><p class="err" id="err" hidden></p>`;
    return open(html, (el, close) => {
      let gas = o.gas;
      const start = $('#jStart', el), allow = $('#jAllow', el), minTxt = $('#jMin', el);
      const upd = () => {
        const s = val.start, a = val.allow;
        minTxt.textContent = s > 0 && a > 0 ? `Lowest allowed at a heater: ${E.pressureText(s - a, unit)}` +
          (s >= E.HIGH_PRESSURE ? '  ·  1.5 psi or more: sized with the high-pressure formula (IFGC Eq. 4-2)' : '') : '';
      };
      const show = () => {
        $('#jStartLbl', el).textContent = `Pressure at the main regulator (${E.unitName(unit)})`;
        $('#jAllowLbl', el).textContent = `Total allowable pressure drop (${E.unitName(unit)})`;
        start.value = inputVal(val.start, unit);
        allow.value = inputVal(val.allow, unit, true);
        upd();
      };
      const read = (input, key) => {
        const v = num(input);
        val[key] = v > 0 ? E.fromUnit(v, unit) : NaN;
        upd();
      };
      start.addEventListener('input', () => read(start, 'start'));
      allow.addEventListener('input', () => read(allow, 'allow'));
      $$('[data-u]', el).forEach(b => {
        b.onclick = () => { unit = b.dataset.u; $$('[data-u]', el).forEach(x => x.classList.toggle('on', x === b)); show(); };
      });
      show();
      $$('[data-gas]', el).forEach(b => {
        b.onclick = () => { gas = b.dataset.gas; $$('[data-gas]', el).forEach(x => x.classList.toggle('on', x === b)); };
      });
      const submit = () => {
        const s = val.start, a = val.allow, btu = num($('#jBtu', el));
        if (!(s > 0)) return showErr(el, `Enter the pressure at the main regulator (${E.unitName(unit)}).`);
        if (!(a > 0 && a < s)) return showErr(el, 'The allowable drop must be more than 0 and less than the regulator pressure.');
        return close({ name: $('#jName', el).value.trim() || 'New job', startP: s, allowDrop: a, gas, unit,
          btuPerCf: btu > 0 ? btu : null });
      };
      $('#ok', el).onclick = submit;
      onEnter(el, submit);
    });
  }

  function jobsSheet(o) {
    const rows = o.jobs.map(j => `<button type="button" class="job${j.id === o.currentId ? ' cur' : ''}" data-id="${esc(j.id)}">` +
      `<b>${esc(j.name)}</b><span>${j.heaters} heater${j.heaters === 1 ? '' : 's'} · ${esc(j.when)}</span></button>`).join('');
    const html = `<div class="sh-head"><button type="button" class="btn ghost" data-close>Close</button><h2>Jobs</h2>` +
      `<button type="button" class="btn primary" id="new">+ New job</button></div>` +
      `<div class="jobs">${rows || '<p class="sub">No jobs yet.</p>'}</div>` +
      (o.currentId ? `<p class="cap">This job</p><div class="btn-row">` +
        `<button type="button" class="btn" data-act="export">Save as file</button>` +
        `<button type="button" class="btn" data-act="print">Print / PDF</button>` +
        `<button type="button" class="btn" data-act="dup">Duplicate</button>` +
        `<button type="button" class="btn danger" data-act="delete">Delete job</button></div>` : '') +
      `<div class="btn-row"><label class="btn file">Open a job file<input type="file" id="imp" ` +
      `accept=".json,application/json,text/plain" hidden></label>` +
      `<button type="button" class="btn" data-act="example">Load the example</button></div>` +
      `<p class="note offline">${esc(o.offlineText)}</p>`;
    return open(html, (el, close) => {
      $$('.job', el).forEach(b => { b.onclick = () => close({ action: 'open', id: b.dataset.id }); });
      $('#new', el).onclick = () => close({ action: 'new' });
      $$('[data-act]', el).forEach(b => { b.onclick = () => close({ action: b.dataset.act }); });
      $('#imp', el).onchange = e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => close({ action: 'import', text: String(rd.result), fileName: f.name });
        rd.readAsText(f);
      };
    });
  }

  function welcome(o) {
    const html = `<div class="welcome"><h1>Gas Pipe Sizer</h1>` +
      `<p>Draw the gas piping from the main regulator out: feet of pipe, heaters and their input. ` +
      `Every pipe is sized as you draw, with your formula and size table.</p>` +
      `<div class="stack"><button type="button" class="btn primary" data-a="new">Start a new job</button>` +
      `<button type="button" class="btn" data-a="example">Look at an example first</button></div>` +
      (o.installTip ? `<p class="note">${esc(o.installTip)}</p>` : '') + `</div>`;
    return open(html, (el, close) => {
      $$('[data-a]', el).forEach(b => { b.onclick = () => close(b.dataset.a); });
    });
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  window.GasUI = { trackViewport, isOpen, pipeDialog, heaterDialog, editPipeDialog, editHeaterDialog, choose,
    jobDialog, jobsSheet, welcome, toast, esc, fmt };
})();
