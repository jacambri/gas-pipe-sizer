/* The List view (every pipe and heater in a table) and the printable page. Pressures show in the job's unit. */
(function () {
  'use strict';
  const E = window.GasEngine, U = window.GasUI;
  const esc = s => U.esc(s);
  const f = (v, d) => U.fmt(v, d);
  const whole = v => Math.round(v).toLocaleString();

  function checkText(p, r, unit) {
    if (p.status === 'low') return `Too low (min ${E.pressureText(r.minP, unit, { suffix: 'short' })})`;
    if (p.status === 'empty') return 'Nothing connected';
    if (p.status === 'bigger') return `Bigger than S${p.parentSec}`;
    return 'OK';
  }

  function summary(job, r) {
    const t = r.totals, u = job.unit;
    const cards = [
      ['Regulator', E.pressureText(job.startP, u)],
      ['Allowable drop', E.pressureText(job.allowDrop, u)],
      ['Lowest allowed', E.pressureText(r.minP, u)],
      ['Total load', `${whole(t.cfh)} CFH`],
      ['Heaters', `${t.heaters} · ${whole(t.mbh)} MBH`],
      ['Lowest at a heater', t.lowest ? `${E.pressureText(t.lowest.pressure, u, { suffix: 'short' })} · ${esc(t.lowest.name)}` : '—'],
      ['Longest run', `${whole(r.longest)} ft`],
      ['Gas', esc(r.gas.name)],
    ];
    return `<div class="cards">${cards.map(([k, v]) => `<div class="card"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  }

  function tables(job, r, live) {
    const u = job.unit, un = E.unitName(u);
    const P = (v, drop) => E.pressureText(v, u, { drop, suffix: 'none' });
    const pipeRows = r.pipes.map(p => `<tr class="st-${p.status}"${live ? ` data-id="${p.id}"` : ''}>` +
      `<td><b>S${p.sec}</b> <small>${p.parentSec ? 'from S' + p.parentSec : 'from regulator'}</small></td>` +
      `<td>${f(p.feet, p.feet % 1 ? 1 : 0)}</td><td>${whole(p.cfh)}</td>` +
      `<td${p.set || p.custom ? '' : ' class="auto"'}>${P(p.drop, true)}</td><td>${p.d == null ? '—' : f(p.d, 3)}</td>` +
      `<td class="size${p.set ? ' set' : ''}">${p.size ? esc(p.size.label) : '—'}` +
      `${p.set ? `<small> set · calc ${p.autoSize ? esc(p.autoSize.label) : '—'}</small>` : ''}</td>` +
      `<td>${P(p.pOut)}</td><td class="chk">${checkText(p, r, u)}</td></tr>`).join('');
    const heaterRows = r.heaters.map(h => `<tr class="${h.ok ? '' : 'st-low'}"${live ? ` data-h="${h.id}"` : ''}>` +
      `<td><b>${esc(h.name || 'Heater')}</b></td><td>${f(h.mbh, h.mbh % 1 ? 1 : 0)}</td><td>${f(h.cfh, 1)}</td>` +
      `<td>${P(h.pressure)}</td><td class="chk">${h.ok ? 'OK' : `Too low (min ${E.pressureText(r.minP, u, { suffix: 'short' })})`}</td></tr>`)
      .join('');
    const sizeRows = r.totals.bySize.filter(s => s.count).map(s =>
      `<tr><td class="size">${esc(s.label)}</td><td>${whole(s.feet)}</td><td>${s.count}</td></tr>`).join('');
    return `<h3>Pipes</h3><div class="tbl"><table><thead><tr><th>Section</th><th>Feet</th><th>CFH</th>` +
      `<th>Drop (${un})</th><th>Req'd ID (in)</th><th>Size</th><th>Pressure at end (${un})</th><th>Check</th></tr></thead>` +
      `<tbody>${pipeRows || '<tr><td colspan="8">No pipes yet.</td></tr>'}</tbody></table></div>` +
      `<p class="note">Gray drops are automatic: the allowable drop split by length along the longest run, or what is ` +
      `left after a pipe whose size you set. Purple sizes are ones you set; "calc" is what the calculation picked.</p>` +
      `<h3>Heaters</h3><div class="tbl"><table><thead><tr><th>Heater</th><th>MBH</th><th>CFH</th>` +
      `<th>Pressure (${un})</th><th>Check</th></tr></thead>` +
      `<tbody>${heaterRows || '<tr><td colspan="5">No heaters yet.</td></tr>'}</tbody></table></div>` +
      `<h3>Pipe by size</h3><div class="tbl narrow"><table><thead><tr><th>Size</th><th>Feet</th><th>Pipes</th></tr></thead>` +
      `<tbody>${sizeRows || '<tr><td colspan="3">—</td></tr>'}</tbody></table></div>`;
  }

  function method(r) {
    const eq = r.formula === 'high'
      ? `D = Q<sup>0.381</sup> ÷ [18.93 × ((P1² − P2²) × Y ÷ (Cr × L))<sup>0.206</sup>] (IFGC 402.4 Eq. 4-2, 1.5 psi and over; ` +
        `P1, P2 in psia), Y ${r.gas.y}`
      : `D = Q<sup>0.381</sup> ÷ [19.17 × (ΔH ÷ (Cr × L))<sup>0.206</sup>] (IFGC 402.4 Eq. 4-1, under 1.5 psi)`;
    return `<p class="note">Sized with ${eq}, Cr ${r.gas.cr}, ${whole(r.btu)} BTU per cu ft, 27.7 in WC = 1 psi. ` +
      `The pipe is the next size up from the required inside diameter; a size you set uses its nominal size as the ` +
      `inside diameter.</p>`;
  }

  function render(el, job, r, onPick, onBack) {
    const warn = r.warnings.map(w => `<p class="warn-line">⚠ ${esc(w)}</p>`).join('');
    el.innerHTML = `<button type="button" class="btn back" id="backDraw">← Back to the drawing</button>` +
      summary(job, r) + warn + tables(job, r, true) + method(r);
    el.querySelector('#backDraw').onclick = onBack;
    el.querySelectorAll('tr[data-id]').forEach(tr => { tr.onclick = () => onPick('pipe', tr.dataset.id); });
    el.querySelectorAll('tr[data-h]').forEach(tr => { tr.onclick = () => onPick('heater', tr.dataset.h); });
  }

  function print(job, r, drawing) {
    const el = document.getElementById('printView');
    el.innerHTML = `<h1>${esc(job.name)}</h1><p class="note">Gas pipe sizing · ${esc(r.gas.name)} · ` +
      `printed ${new Date().toLocaleDateString()}</p>` + drawing.staticSvg(1000, 600) + summary(job, r) +
      tables(job, r, false) + method(r);
    setTimeout(() => window.print(), 60);
  }

  window.GasList = { render, print, checkText };
})();
