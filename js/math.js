/* "The math" printout: the formulas, constants and steps behind a job's numbers, worked examples using the
   job's own figures, and every pipe and heater, so the calculation can be checked by hand. */
(function () {
  'use strict';
  const E = window.GasEngine, U = window.GasUI;
  const esc = s => U.esc(s);
  const ATM = 14.7, WC = E.IN_WC_PER_PSI, EXP = 1 / 0.206;
  const whole = v => Math.round(v).toLocaleString();

  // About five significant figures, no trailing zeros, thousands commas on big numbers.
  function sig(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    if (Math.abs(v) >= 1000) return whole(v);
    if (v === 0) return '0';
    const d = Math.max(0, Math.min(8, (digits || 5) - 1 - Math.floor(Math.log10(Math.abs(v)))));
    const s = Number(v).toFixed(d);
    return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }
  function covers(size) {
    const next = E.SIZES[E.SIZES.indexOf(size) + 1];
    return `${size.label} covers a required inside diameter from ${size.min.toFixed(2)}` +
      (next ? ` up to ${next.min.toFixed(2)} in` : ' in and up');
  }
  function heatersPast(r, job, id) {
    const node = job.nodes.find(n => n.id === id);
    return (node && node.heater ? 1 : 0) + r.at[id].kids.reduce((s, k) => s + heatersPast(r, job, k), 0);
  }

  // The steps for one pipe, with the numbers filled in.
  function steps(job, r, p) {
    const gas = r.gas, Q = p.cfh, L = p.feet, qq = Math.pow(Q, 0.381);
    const rate = Math.max(r.rateAt[p.from] || 0, 0);
    const s = [];
    if (r.formula === 'high') {
      const p1g = p.pIn / WC, p1 = p1g + ATM;
      s.push(`Pressure at the start: P<sub>1</sub> = ${sig(p1g, 4)} psi + 14.7 = ${sig(p1, 6)} psia, so P<sub>1</sub>² = ${sig(p1 * p1, 6)}`);
      s.push(`Q<sup>0.381</sup> = ${whole(Q)}<sup>0.381</sup> = ${sig(qq)}`);
      if (p.set) {
        const D = p.size.nom, b = Math.pow(qq / (18.93 * D), EXP), c = (gas.cr * L) / gas.y, k = c * b;
        const p2 = Math.sqrt(p1 * p1 - k), p2g = p2 - ATM;
        s.push(`D = the nominal size of the ${p.size.label} pipe = ${D} in, so 18.93 × D = ${sig(18.93 * D)}`);
        s.push(`(Q<sup>0.381</sup> ÷ (18.93 × D))<sup>1/0.206</sup> = (${sig(qq)} ÷ ${sig(18.93 * D)})<sup>4.8544</sup> = ${sig(b)}`);
        s.push(`Cr × L ÷ Y = ${gas.cr} × ${sig(L)} ÷ ${gas.y} = ${sig(c)}`);
        s.push(`P<sub>1</sub>² − P<sub>2</sub>² = ${sig(c)} × ${sig(b)} = ${sig(k)}`);
        s.push(`P<sub>2</sub> = √(${sig(p1 * p1, 6)} − ${sig(k)}) = ${sig(p2, 6)} psia = <b>${sig(p2g, 4)} psi</b> at the end of the pipe`);
        s.push(`Pressure drop = ${sig(p1g, 4)} − ${sig(p2g, 4)} = <b>${sig(p1g - p2g, 3)} psi</b>`);
      } else {
        const drop = p.drop / WC, p2 = p1 - drop, dd = p1 * p1 - p2 * p2;
        const x = (dd * gas.y) / (gas.cr * L), x2 = Math.pow(x, 0.206), den = 18.93 * x2;
        s.push(p.custom ? `Pressure drop typed for this pipe: ${sig(drop, 4)} psi`
          : `Its share of the allowable drop: ${sig(L)} ft × ${sig(rate / WC, 4)} psi per ft = ${sig(drop, 4)} psi`);
        s.push(`P<sub>2</sub> = ${sig(p1, 6)} − ${sig(drop, 4)} = ${sig(p2, 6)} psia, so P<sub>1</sub>² − P<sub>2</sub>² = ` +
          `${sig(p1 * p1, 6)} − ${sig(p2 * p2, 6)} = ${sig(dd)}`);
        s.push(`(P<sub>1</sub>² − P<sub>2</sub>²) × Y ÷ (Cr × L) = ${sig(dd)} × ${gas.y} ÷ (${gas.cr} × ${sig(L)}) = ${sig(x)}`);
        s.push(`(${sig(x)})<sup>0.206</sup> = ${sig(x2)}, and × 18.93 = ${sig(den)}`);
        s.push(`D = ${sig(qq)} ÷ ${sig(den)} = ${sig(qq / den, 4)} in → <b>${p.size.label}</b> (${covers(p.size)})`);
      }
      return s;
    }
    s.push(`Q<sup>0.381</sup> = ${whole(Q)}<sup>0.381</sup> = ${sig(qq)}`);
    if (p.set) {
      const D = p.size.nom, b = Math.pow(qq / (19.17 * D), EXP), dh = gas.cr * L * b;
      s.push(`D = the nominal size of the ${p.size.label} pipe = ${D} in, so 19.17 × D = ${sig(19.17 * D)}`);
      s.push(`(Q<sup>0.381</sup> ÷ (19.17 × D))<sup>1/0.206</sup> = (${sig(qq)} ÷ ${sig(19.17 * D)})<sup>4.8544</sup> = ${sig(b)}`);
      s.push(`ΔH = Cr × L × that = ${gas.cr} × ${sig(L)} × ${sig(b)} = <b>${sig(dh, 4)} in WC</b>`);
    } else {
      const dh = p.drop, x = dh / (gas.cr * L), x2 = Math.pow(x, 0.206), den = 19.17 * x2;
      s.push(p.custom ? `Pressure drop typed for this pipe: ΔH = ${sig(dh, 4)} in WC`
        : `Its share of the allowable drop: ΔH = ${sig(L)} ft × ${sig(rate, 4)} in WC per ft = ${sig(dh, 4)} in WC`);
      s.push(`ΔH ÷ (Cr × L) = ${sig(dh, 4)} ÷ (${gas.cr} × ${sig(L)}) = ${sig(x)}`);
      s.push(`(${sig(x)})<sup>0.206</sup> = ${sig(x2)}, and × 19.17 = ${sig(den)}`);
      s.push(`D = ${sig(qq)} ÷ ${sig(den)} = ${sig(qq / den, 4)} in → <b>${p.size.label}</b> (${covers(p.size)})`);
    }
    s.push(`Pressure at the end = ${sig(p.pIn, 4)} − ${sig(p.drop, 4)} = <b>${sig(p.pOut, 4)} in WC</b>`);
    return s;
  }

  // Worked examples: the pipe off the regulator, the set pipe and the calculated pipe that lose the most,
  // and the pipe feeding the heater with the least pressure.
  function examples(r) {
    const out = [];
    const add = p => { if (p && p.cfh > 0 && p.size && p.pOut != null && out.indexOf(p) < 0) out.push(p); };
    add(r.pipes[0]);
    add(r.pipes.filter(p => p.set).sort((a, b) => (b.drop || 0) - (a.drop || 0))[0]);
    add(r.pipes.filter(p => !p.set && p !== r.pipes[0]).sort((a, b) => (b.drop || 0) - (a.drop || 0))[0]);
    if (r.totals.lowest) {
      let p = r.pipeOf[r.totals.lowest.id];
      while (p && p.feet < 10 && r.pipeOf[p.from]) p = r.pipeOf[p.from];
      add(p);
    }
    return out.slice(0, 4);
  }

  function build(job, r) {
    const high = r.formula === 'high', gas = r.gas, t = r.totals;
    const P = v => E.pressureText(v, 'psi'), Pw = v => E.pressureText(v, 'wc');
    const Pj = v => (high ? P(v) : Pw(v));
    const mbh = Array.from(new Set(r.heaters.map(h => h.mbh)));
    const ex = examples(r);
    const flowEx = ex.find(p => p.set) || ex[1] || ex[0];
    const nPast = flowEx ? heatersPast(r, job, flowEx.id) : 0;
    const rateTxt = high ? `${P(job.allowDrop)} ÷ ${whole(r.longest)} ft = ${sig(r.rate / WC, 4)} psi per foot`
      : `${Pw(job.allowDrop)} ÷ ${whole(r.longest)} ft = ${sig(r.rate, 4)} in WC per foot`;
    const eq = high
      ? `D = Q<sup>0.381</sup> ÷ [ 18.93 × ( (P<sub>1</sub>² − P<sub>2</sub>²) × Y ÷ (Cr × L) )<sup>0.206</sup> ]`
      : `D = Q<sup>0.381</sup> ÷ [ 19.17 × ( ΔH ÷ (Cr × L) )<sup>0.206</sup> ]`;
    const solved = high
      ? `P<sub>1</sub>² − P<sub>2</sub>² = (Cr × L ÷ Y) × [ Q<sup>0.381</sup> ÷ (18.93 × D) ]<sup>1/0.206</sup>, so P<sub>2</sub> = √( P<sub>1</sub>² − that )`
      : `ΔH = Cr × L × [ Q<sup>0.381</sup> ÷ (19.17 × D) ]<sup>1/0.206</sup>`;
    let h = `<div class="mathdoc"><h1>${esc(job.name)} — the math behind the numbers</h1>` +
      `<p class="note">Gas pipe sizing · ${esc(gas.name)} · printed ${new Date().toLocaleDateString()}</p>`;
    h += `<h2>1. What goes in</h2><ul>` +
      `<li><b>Gas:</b> ${esc(gas.name)}. Cr = ${gas.cr} and Y = ${gas.y} (IFGC Table 402.4). Heating value ${whole(r.btu)} BTU per cubic foot.</li>` +
      `<li><b>Pressure:</b> ${Pj(job.startP)} at the regulator and ${Pj(job.allowDrop)} allowable drop, so every heater must get at least <b>${Pj(r.minP)}</b>.</li>` +
      `<li><b>Units:</b> 1 psi = 27.7 in WC. Absolute pressure (psia) = gauge pressure (psi) + 14.7.</li>` +
      `<li><b>Heaters:</b> ${mbh.length === 1 ? `${t.heaters} × ${whole(mbh[0])} MBH` : `${t.heaters}, ${whole(t.mbh)} MBH in all`}.</li></ul>`;
    h += `<h2>2. Gas flow in each pipe</h2><p>Each heater: CFH = BTU/hr ÷ heating value` +
      (mbh.length === 1 ? ` = ${whole(mbh[0] * 1000)} ÷ ${whole(r.btu)} = ${sig((mbh[0] * 1000) / r.btu)} CFH` : '') +
      `. A pipe carries the total of every heater past it` +
      (flowEx ? `: S${flowEx.sec} feeds ${nPast} heater${nPast === 1 ? '' : 's'}, ${whole(flowEx.cfh)} CFH` : '') +
      (r.pipes[0] ? `, and S${r.pipes[0].sec}, off the regulator, carries all ${whole(r.pipes[0].cfh)} CFH` : '') + `.</p>`;
    h += `<h2>3. The formula</h2><p>${high ? 'The supply is 1.5 psi or more, so the high-pressure formula applies (IFGC 402.4, Equation 4-2):'
      : 'The supply is under 1.5 psi, so the low-pressure formula applies (IFGC 402.4, Equation 4-1):'}</p>` +
      `<div class="formula">${eq}</div><p>D = inside diameter (in) · Q = gas flow (CFH) · L = length of the pipe (ft) · ` +
      (high ? 'P<sub>1</sub>, P<sub>2</sub> = pressure at the start and end of the pipe (psia)' : 'ΔH = pressure drop in the pipe (in WC)') +
      ` · Cr${high ? ', Y' : ''} = the gas factors above.</p>`;
    h += `<h2>4. How each pipe is worked out</h2><ul>` +
      `<li><b>A pipe size you set</b> (existing pipe): the same formula solved for the pressure at the end of the pipe, ` +
      `with D = the pipe's nominal size:<div class="formula">${solved}</div></li>` +
      `<li><b>A size the calculator picks:</b> the pipe gets a share of the allowable drop in proportion to its length, ` +
      `along the longest run: ${rateTxt}. After a pipe whose size you set, the pressure left over (pressure at its end ` +
      `minus the ${Pj(r.minP)} minimum) is spread the same way over the longest run below it. The formula then gives ` +
      `the required inside diameter, and the pipe is the next size up in the size table (section 6).</li>` +
      `<li>Each pipe starts at the pressure where the pipe feeding it ends, so drops add up along every run.</li>` +
      `<li>A heater has adequate pressure when it gets at least ${Pj(r.minP)} (supply minus the allowable drop).</li></ul>`;
    h += `<h2>5. Worked examples</h2>` + ex.map(p => `<div class="ex"><h4>S${p.sec}: ${p.feet} ft of ` +
      `${p.size.label} pipe${p.set ? ' (size you set)' : ' (size calculated)'}, ${whole(p.cfh)} CFH, fed from ` +
      `${p.parentSec ? 'S' + p.parentSec : 'the regulator'}</h4><ol>${steps(job, r, p).map(x => `<li>${x}</li>`).join('')}</ol></div>`).join('');
    h += `<h2>6. Size table</h2><div class="tbl narrow"><table><thead><tr><th>Required inside diameter at least (in)</th>` +
      `<th>Pipe size</th></tr></thead><tbody>${E.SIZES.map(s => `<tr><td>${s.min.toFixed(2)}</td><td class="size">${s.label}</td></tr>`).join('')}` +
      `</tbody></table></div>`;
    const pr = r.pipes.map(p => {
      const how = p.set ? 'set' : p.custom ? 'typed drop' : 'calc';
      const D = p.set ? p.size.nom : p.d;
      const head = `<td><b>S${p.sec}</b></td><td>${p.parentSec ? 'S' + p.parentSec : 'reg.'}</td><td>${whole(p.cfh)}</td>` +
        `<td>${sig(p.feet)}</td><td class="size">${p.size ? esc(p.size.label) : '—'}</td><td>${how}</td>`;
      if (high) {
        const p1 = p.pIn == null ? null : p.pIn / WC + ATM, p2 = p.pOut == null ? null : p.pOut / WC + ATM;
        return `<tr>${head}<td>${sig(p1, 6)}</td><td>${sig(p2, 6)}</td><td>${p1 != null && p2 != null ? sig(p1 * p1 - p2 * p2, 4) : '—'}</td>` +
          `<td>${E.pressureText(p.drop, 'psi', { drop: true, suffix: 'none' })}</td><td>${E.pressureText(p.pOut, 'psi', { suffix: 'none' })}</td>` +
          `<td>${D == null ? '—' : D.toFixed(3)}</td></tr>`;
      }
      return `<tr>${head}<td>${sig(p.pIn, 5)}</td><td>${sig(p.drop, 4)}</td><td>${sig(p.pOut, 5)}</td><td>${D == null ? '—' : D.toFixed(3)}</td></tr>`;
    }).join('');
    h += `<h2>7. Every pipe</h2><div class="tbl"><table><thead><tr><th>Section</th><th>Fed from</th><th>CFH</th><th>Feet</th>` +
      `<th>Size</th><th>How</th>` + (high ? `<th>P<sub>1</sub> (psia)</th><th>P<sub>2</sub> (psia)</th><th>P<sub>1</sub>² − P<sub>2</sub>²</th>` +
        `<th>Drop (psi)</th><th>Pressure at end (psi)</th>` : `<th>Start (in WC)</th><th>ΔH (in WC)</th><th>End (in WC)</th>`) +
      `<th>D (in)</th></tr></thead><tbody>${pr}</tbody></table></div><p class="note">D: for a size you set, the nominal size used ` +
      `in the formula; for a calculated pipe, the required inside diameter. "calc" = sized by the calculator.</p>`;
    h += `<h2>8. Every heater</h2><div class="tbl keep"><table><thead><tr><th>Heater</th><th>MBH</th><th>CFH</th>` +
      `<th>Pressure</th><th>Minimum</th><th>Margin</th><th class="chk">Check</th></tr></thead><tbody>` +
      r.heaters.map(x => `<tr class="${x.ok ? '' : 'st-low'}"><td><b>${esc(x.name || 'Heater')}</b></td><td>${sig(x.mbh)}</td>` +
        `<td>${sig(x.cfh)}</td><td>${Pj(x.pressure)}</td><td>${Pj(r.minP)}</td><td>${Pj(x.pressure - r.minP)}</td>` +
        `<td class="chk">${x.ok ? 'Adequate' : 'Too low'}</td></tr>`).join('') + `</tbody></table></div>`;
    h += `<p class="note">Source: International Fuel Gas Code, Section 402.4 (Equations 4-1 and 4-2; Table 402.4 for Cr and Y).</p></div>`;
    return h;
  }

  function print(job, r) {
    document.getElementById('printView').innerHTML = build(job, r);
    setTimeout(() => window.print(), 60);
  }

  window.GasMath = { build, print };
})();
