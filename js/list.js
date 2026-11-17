/* The List view (every pipe and heater in a table) and the printable page. */
(function () {
  'use strict';
  const U = window.GasUI;
  const esc = s => U.esc(s);
  const f = (v, d) => U.fmt(v, d);
  const whole = v => Math.round(v).toLocaleString();

  function checkText(p, r) {
    if (p.status === 'low') return `Below ${f(r.minP, 2)}"`;
    if (p.status === 'empty') return 'Nothing connected';
    if (p.status === 'bigger') return `Bigger than S${p.parentSec}`;
    return 'OK';
  }

  function summary(job, r) {
    const t = r.totals;
    const cards = [
      ['Regulator', `${f(job.startP, 1)}" WC`],
      ['Allowable drop', `${f(job.allowDrop, 1)}" WC`],
      ['Lowest allowed', `${f(r.minP, 2)}" WC`],
      ['Total load', `${whole(t.cfh)} CFH`],
      ['Heaters', `${t.heaters} · ${whole(t.mbh)} MBH`],
      ['Lowest at a heater', t.lowest ? `${f(t.lowest.pressure, 2)}" · ${esc(t.lowest.name)}` : '—'],
      ['Longest run', `${whole(r.longest)} ft`],
      ['Gas', esc(r.gas.name)],
    ];
    return `<div class="cards">${cards.map(([k, v]) => `<div class="card"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  }

  function tables(r, live) {
    const pipeRows = r.pipes.map(p => `<tr class="st-${p.status}"${live ? ` data-id="${p.id}"` : ''}>` +
      `<td><b>S${p.sec}</b> <small>${p.parentSec ? 'from S' + p.parentSec : 'from regulator'}</small></td>` +
      `<td>${f(p.feet, p.feet % 1 ? 1 : 0)}</td><td>${whole(p.cfh)}</td>` +
      `<td${p.custom ? '' : ' class="auto"'}>${f(p.drop, 3)}</td><td>${p.d == null ? '—' : f(p.d, 3)}</td>` +
      `<td class="size">${p.size ? esc(p.size.label) : '—'}</td><td>${f(p.pOut, 2)}</td>` +
      `<td class="chk">${checkText(p, r)}</td></tr>`).join('');
    const heaterRows = r.heaters.map(h => `<tr class="${h.ok ? '' : 'st-low'}"${live ? ` data-h="${h.id}"` : ''}>` +
      `<td><b>${esc(h.name || 'Heater')}</b></td><td>${f(h.mbh, h.mbh % 1 ? 1 : 0)}</td><td>${f(h.cfh, 1)}</td>` +
      `<td>${f(h.pressure, 2)}</td><td class="chk">${h.ok ? 'OK' : `Below ${f(r.minP, 2)}"`}</td></tr>`).join('');
    const sizeRows = r.totals.bySize.filter(s => s.count).map(s =>
      `<tr><td class="size">${esc(s.label)}</td><td>${whole(s.feet)}</td><td>${s.count}</td></tr>`).join('');
    return `<h3>Pipes</h3><div class="tbl"><table><thead><tr><th>Section</th><th>Feet</th><th>CFH</th>` +
      `<th>Drop (in WC)</th><th>Req'd ID (in)</th><th>Size</th><th>Pressure at end</th><th>Check</th></tr></thead>` +
      `<tbody>${pipeRows || '<tr><td colspan="8">No pipes yet.</td></tr>'}</tbody></table></div>` +
      `<p class="note">Gray drops are automatic: the allowable drop split by length along the longest run. ` +
      `Edit a pipe to type your own.</p>` +
      `<h3>Heaters</h3><div class="tbl"><table><thead><tr><th>Heater</th><th>MBH</th><th>CFH</th>` +
      `<th>Pressure (in WC)</th><th>Check</th></tr></thead>` +
      `<tbody>${heaterRows || '<tr><td colspan="5">No heaters yet.</td></tr>'}</tbody></table></div>` +
      `<h3>Pipe by size</h3><div class="tbl narrow"><table><thead><tr><th>Size</th><th>Feet</th><th>Pipes</th></tr></thead>` +
      `<tbody>${sizeRows || '<tr><td colspan="3">—</td></tr>'}</tbody></table></div>`;
  }

  function method(r) {
    return `<p class="note">Sized with D = Q<sup>0.381</sup> ÷ [19.17 × (ΔH ÷ (Cr × L))<sup>0.206</sup>] ` +
      `(IFGC 402.4, under 1.5 psi), Cr ${r.gas.cr}, ${whole(r.btu)} BTU per cu ft. ` +
      `The pipe is the next size up from the required inside diameter.</p>`;
  }

  function render(el, job, r, onPick, onBack) {
    const warn = r.warnings.map(w => `<p class="warn-line">⚠ ${esc(w)}</p>`).join('');
    el.innerHTML = `<button type="button" class="btn back" id="backDraw">← Back to the drawing</button>` +
      summary(job, r) + warn + tables(r, true) + method(r);
    el.querySelector('#backDraw').onclick = onBack;
    el.querySelectorAll('tr[data-id]').forEach(tr => { tr.onclick = () => onPick('pipe', tr.dataset.id); });
    el.querySelectorAll('tr[data-h]').forEach(tr => { tr.onclick = () => onPick('heater', tr.dataset.h); });
  }

  function print(job, r, drawing) {
    const el = document.getElementById('printView');
    el.innerHTML = `<h1>${esc(job.name)}</h1><p class="note">Gas pipe sizing · ${esc(r.gas.name)} · ` +
      `printed ${new Date().toLocaleDateString()}</p>` + drawing.staticSvg(1000, 600) + summary(job, r) +
      tables(r, false) + method(r);
    setTimeout(() => window.print(), 60);
  }

  window.GasList = { render, print, checkText };
})();
