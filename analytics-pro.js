/* ═══════════════════════════════════════════════════════════════════════
   EOS ANALYTICS · PRO ENHANCEMENT LAYER  (analytics-pro.js)
   Loaded AFTER analytics.js. Purely additive:
     • Wraps the existing global render() — never edits it.
     • Reads the same FILTERED / ALL / SEV_COLOR / PALETTE / fmtH globals.
     • Injects new advanced-chart cards into #main-content at runtime,
       so analytics.html is untouched too.
   If any single feature throws, it is isolated in try/catch and the
   original dashboard keeps working.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const has = (n) => typeof window[n] !== 'undefined';

  // Wait until analytics.js has defined its globals.
  function whenReady(cb, tries = 0) {
    if (has('render') && has('FILTERED') && typeof Chart !== 'undefined') return cb();
    if (tries > 200) return;                       // ~10s ceiling
    setTimeout(() => whenReady(cb, tries + 1), 50);
  }

  /* ─── shared helpers (mirror analytics.js conventions) ───────────────── */
  const SEVC = () => (has('SEV_COLOR') ? SEV_COLOR : {1:'#d93025',2:'#e8710a',3:'#f9ab00',4:'#1e8e3e',5:'#80868b'});
  const PAL  = () => (has('PALETTE') ? PALETTE : ['#1a73e8','#1e8e3e','#f9ab00','#d93025','#8430ce','#00acc1']);
  const fmth = (h) => (has('fmtH') ? fmtH(h) : (h == null || isNaN(h) ? '—' : h.toFixed(1) + 'h'));
  const cssv = (n, fb) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb);
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const median = (a) => { if (!a.length) return 0; const s=[...a].sort((x,y)=>x-y); const m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  /* Rich shared tooltip styling for all new charts. */
  function tip(extra = {}) {
    return Object.assign({
      backgroundColor: 'rgba(20,24,33,0.96)',
      titleColor: '#fff', bodyColor: '#e8eaed',
      borderColor: cssv('--accent', '#1a73e8'), borderWidth: 1,
      padding: { x: 14, y: 11 }, cornerRadius: 11, boxPadding: 5,
      titleFont: { size: 12.5, weight: '700' }, bodyFont: { size: 11.5 },
      usePointStyle: true,
    }, extra);
  }

  /* ─── new chart registry so we can destroy/rebuild cleanly ───────────── */
  const PRO = { charts: {} };
  function kill(id) { try { PRO.charts[id]?.destroy(); } catch (_) {} PRO.charts[id] = null; }
  function mk(id, ctx, cfg) { kill(id); PRO.charts[id] = new Chart(ctx, cfg); return PRO.charts[id]; }

  /* ════════════════════════════════════════════════════════════════════
     1 · INJECT NEW DASHBOARD SECTION (advanced charts)
     We append one new <section> of cards to #main-content, before the
     ticket-list section if present.
     ════════════════════════════════════════════════════════════════════ */
  function injectShell() {
    const main = $('#main-content');
    if (!main || $('#pro-section')) return;

    const sec = document.createElement('div');
    sec.id = 'pro-section';
    sec.className = 'pro-section';
    sec.innerHTML = `
      <div class="section-hd" data-pro-nav="Advanced Intelligence">
        <div class="section-hd-line"></div>
        <div class="section-hd-lbl">🧠 Advanced Intelligence</div>
        <div class="section-hd-line"></div>
      </div>

      <!-- Narrative auto-callout -->
      <div class="cg">
        <div class="card" style="grid-column:span 12;">
          <div class="ch">
            <div class="ch-icon" style="background:var(--accent-lt);">📌</div>
            <div class="ch-title">Auto Narrative <span class="pro-tag">AI Summary</span></div>
          </div>
          <div id="pro-callout-host"></div>
          <div id="pro-chips" class="pro-chip-row"></div>
        </div>
      </div>

      <div class="cg">
        <div class="card c6">
          <div class="ch"><div class="ch-icon" style="background:var(--danger-lt);">🎯</div>
            <div class="ch-title">SLA Risk Matrix <span class="pro-tag">bubble</span></div>
            <button class="btn-explain" data-pro-explain="risk-matrix">? Explain</button></div>
          <div class="cb cch" style="height:300px;"><canvas id="pro-risk"></canvas></div>
        </div>
        <div class="card c6">
          <div class="ch"><div class="ch-icon" style="background:var(--purple-lt);">📡</div>
            <div class="ch-title">Severity Performance Radar <span class="pro-tag">radar</span></div>
            <button class="btn-explain" data-pro-explain="radar">? Explain</button></div>
          <div class="cb cch" style="height:300px;"><canvas id="pro-radar"></canvas></div>
        </div>
      </div>

      <div class="cg">
        <div class="card c12">
          <div class="ch"><div class="ch-icon" style="background:var(--accent2-lt);">📈</div>
            <div class="ch-title">Breach-Rate Trend &amp; Volume <span class="pro-tag">combo</span></div>
            <button class="btn-explain" data-pro-explain="breach-trend">? Explain</button></div>
          <div class="cb cch" style="height:260px;"><canvas id="pro-trend"></canvas></div>
        </div>
      </div>

      <div class="cg">
        <div class="card c5">
          <div class="ch"><div class="ch-icon" style="background:var(--warn-lt);">⏳</div>
            <div class="ch-title">SLA Budget Aging Buckets <span class="pro-tag">stacked</span></div>
            <button class="btn-explain" data-pro-explain="aging">? Explain</button></div>
          <div class="cb cch" style="height:280px;"><canvas id="pro-aging"></canvas></div>
        </div>
        <div class="card c7">
          <div class="ch"><div class="ch-icon" style="background:var(--teal-lt);">⚖️</div>
            <div class="ch-title">EOS Active-Work vs Lifespan Gap <span class="pro-tag">grouped</span></div>
            <button class="btn-explain" data-pro-explain="gap">? Explain</button></div>
          <div class="cb cch" style="height:280px;"><canvas id="pro-gap"></canvas></div>
        </div>
      </div>

      <div class="cg">
        <div class="card c6">
          <div class="ch"><div class="ch-icon" style="background:var(--pink-lt);">🕸</div>
            <div class="ch-title">Assignee Efficiency Frontier <span class="pro-tag">scatter</span></div>
            <button class="btn-explain" data-pro-explain="frontier">? Explain</button></div>
          <div class="cb cch" style="height:300px;"><canvas id="pro-frontier"></canvas></div>
        </div>
        <div class="card c6">
          <div class="ch"><div class="ch-icon" style="background:var(--accent-lt);">📊</div>
            <div class="ch-title">Cumulative SLA Consumption <span class="pro-tag">area</span></div>
            <button class="btn-explain" data-pro-explain="cum-sla">? Explain</button></div>
          <div class="cb cch" style="height:300px;"><canvas id="pro-cumsla"></canvas></div>
        </div>
      </div>
    `;

    // Insert before the ticket-list section header if we can find it.
    const tableHd = $$('.section-hd').find(h => /Ticket List/i.test(h.textContent));
    if (tableHd) main.insertBefore(sec, tableHd);
    else main.appendChild(sec);

    // Wire explain buttons to reuse the existing modal if available.
    $$('#pro-section [data-pro-explain]').forEach(b => {
      b.addEventListener('click', () => proExplain(b.dataset.proExplain));
    });
  }

  /* ─── explain modal reuse (falls back to toast) ─────────────────────── */
  const PRO_EXPLAIN = {
    'risk-matrix': ['BUBBLE', 'SLA Risk Matrix',
      'Every ticket plotted by SLA budget consumed (X) vs EOS hours (Y). Bubble size = lifespan, color = severity. The red zone (right) is where tickets are at or over budget.',
      ['Top-right bubbles are your danger cluster — high consumption AND high hours.','Big bubbles took a long calendar life even if active work was short.','Hover any bubble for the full ticket fingerprint.']],
    'radar': ['RADAR', 'Severity Performance Radar',
      'Compares each severity across four normalized axes: volume, avg EOS hours, breach rate, and bounce rate. A balanced shape is healthy; spikes flag a problem dimension.',
      ['A spike toward "Breach %" means that severity is missing SLA disproportionately.','Compare the shape of Sev4 vs Sev5 to see where effort concentrates.']],
    'breach-trend': ['COMBO', 'Breach-Rate Trend & Volume',
      'Daily ticket volume (bars) overlaid with the % of tickets breached that day (line). Reveals whether breaches track with workload spikes.',
      ['A rising line with flat bars = a process problem, not a volume problem.','Spikes in both usually mean capacity was overwhelmed that day.']],
    'aging': ['STACKED', 'SLA Budget Aging Buckets',
      'Tickets bucketed by how much of their SLA budget they consumed: Fresh (<25%), Warming (25–50%), Hot (50–75%), Critical (75–100%), Breached (>100%), split by severity.',
      ['Watch the Critical + Breached stack — that is where escalation should focus.','If Fresh dominates, your queue is healthy.']],
    'gap': ['GROUPED', 'Active-Work vs Lifespan Gap',
      'For the top tickets by lifespan: blue = EOS active business hours, grey = total lifespan business hours. The gap is time the ticket sat waiting outside EOS.',
      ['A huge grey-vs-blue gap means the delay was NOT EOS active work — it waited elsewhere.','Small gap = EOS was the bottleneck.']],
    'frontier': ['SCATTER', 'Assignee Efficiency Frontier',
      'Each assignee plotted by tickets handled (X) vs avg EOS hours per ticket (Y). Bubble size = breach count. Bottom-right = high volume, fast — your frontier performers.',
      ['Bottom-right is best: many tickets, low avg time.','Large bubbles high up are volume + slow + breaching — coaching targets.']],
    'cum-sla': ['AREA', 'Cumulative SLA Consumption',
      'Tickets sorted worst-first; the area shows how SLA budget consumption accumulates. A steep early curve means a few tickets dominate your risk.',
      ['If the curve front-loads, fixing the top 10 tickets fixes most risk (Pareto).','A straight diagonal means risk is evenly spread.']],
  };
  function proExplain(key) {
    const d = PRO_EXPLAIN[key];
    if (!d) return;
    // Reuse existing modal nodes if present
    const tag = $('#em-tag'), ttl = $('#em-title'), body = $('#em-body'), tips = $('#em-tips'), back = $('#explain-backdrop');
    if (tag && ttl && body && tips && back) {
      tag.textContent = d[0]; ttl.textContent = d[1]; body.textContent = d[2];
      tips.innerHTML = d[3].map(t => `<li>${t}</li>`).join('');
      back.style.display = 'flex';
    } else { toast(d[1] + ' — ' + d[2]); }
  }

  /* ════════════════════════════════════════════════════════════════════
     2 · ADVANCED CHART RENDERERS
     ════════════════════════════════════════════════════════════════════ */
  function gridColor() { return isDark() ? 'rgba(255,255,255,.07)' : 'rgba(60,64,67,.10)'; }
  function tickColor() { return cssv('--text3', '#5f6368'); }

  function renderRisk() {
    const el = $('#pro-risk'); if (!el) return;
    const data = FILTERED.filter(t => t.eosHours >= 0).map(t => ({
      x: +(t.slaConsumedPct || 0).toFixed(1),
      y: +(t.eosHours || 0).toFixed(2),
      r: Math.max(4, Math.min(22, Math.sqrt((t.lifespanBizHours || 1)) * 2)),
      t,
    }));
    const colorOf = (t) => (SEVC()[t.sev] || '#80868b');
    mk('risk', el.getContext('2d'), {
      type: 'bubble',
      data: { datasets: [{
        data,
        backgroundColor: data.map(d => colorOf(d.t) + '55'),
        borderColor: data.map(d => colorOf(d.t)),
        borderWidth: 1.4, hoverBorderWidth: 2.5,
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: tip({ callbacks: {
            title: c => '#' + (c[0]?.raw?.t?.shortId ?? '—'),
            label: c => { const t = c.raw.t; return [
              `EOS: ${fmth(t.eosHours)}  ·  Cap: ${fmth(t.slaCap)}`,
              `SLA used: ${Math.round(t.slaConsumedPct || 0)}%`,
              `Lifespan: ${fmth(t.lifespanBizHours)}`,
              `Sev ${t.sev}  ·  ${t.isBreached ? '🚨 Breached' : '✅ On track'}`,
              `${t.assigneeName || '—'} · ${t.city || '—'}`,
            ]; },
          }}),
        },
        scales: {
          x: { title: { display: true, text: 'SLA budget consumed (%)', color: tickColor() },
               grid: { color: gridColor() }, ticks: { color: tickColor(), callback: v => v + '%' } },
          y: { title: { display: true, text: 'EOS business hours', color: tickColor() },
               grid: { color: gridColor() }, ticks: { color: tickColor(), callback: v => fmth(v) } },
        },
      },
    });
  }

  function renderRadar() {
    const el = $('#pro-radar'); if (!el) return;
    const sevs = [1, 2, 3, 4, 5].filter(s => FILTERED.some(t => t.sev === s));
    const axes = ['Volume', 'Avg EOS', 'Breach %', 'Bounce %', 'Avg Lifespan'];
    const norm = [];
    const raw = sevs.map(s => {
      const g = FILTERED.filter(t => t.sev === s);
      const eos = g.filter(t => t.eosHours > 0).map(t => t.eosHours);
      const ls = g.filter(t => t.lifespanBizHours > 0).map(t => t.lifespanBizHours);
      return {
        s, vol: g.length,
        avgEos: eos.length ? eos.reduce((a, b) => a + b, 0) / eos.length : 0,
        breach: pct(g.filter(t => t.isBreached).length, g.length),
        bounce: pct(g.filter(t => t.hasBounce).length, g.length),
        avgLs: ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : 0,
      };
    });
    const maxV = Math.max(1, ...raw.map(r => r.vol));
    const maxE = Math.max(1, ...raw.map(r => r.avgEos));
    const maxL = Math.max(1, ...raw.map(r => r.avgLs));
    mk('radar', el.getContext('2d'), {
      type: 'radar',
      data: { labels: axes, datasets: raw.map(r => ({
        label: 'Sev ' + r.s,
        data: [r.vol / maxV * 100, r.avgEos / maxE * 100, r.breach, r.bounce, r.avgLs / maxL * 100],
        backgroundColor: (SEVC()[r.s] || '#80868b') + '22',
        borderColor: SEVC()[r.s] || '#80868b', borderWidth: 2,
        pointBackgroundColor: SEVC()[r.s] || '#80868b', pointRadius: 3,
        _raw: r,
      }))},
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 750 },
        plugins: {
          legend: { labels: { color: tickColor(), usePointStyle: true } },
          tooltip: tip({ callbacks: {
            label: c => {
              const r = c.dataset._raw; const ax = c.label;
              const real = { 'Volume': r.vol, 'Avg EOS': fmth(r.avgEos), 'Breach %': r.breach + '%', 'Bounce %': r.bounce + '%', 'Avg Lifespan': fmth(r.avgLs) }[ax];
              return `Sev ${r.s} · ${ax}: ${real}`;
            },
          }}),
        },
        scales: { r: {
          angleLines: { color: gridColor() }, grid: { color: gridColor() },
          pointLabels: { color: tickColor(), font: { size: 11, weight: '600' } },
          ticks: { display: false, backdropColor: 'transparent' },
          suggestedMin: 0, suggestedMax: 100,
        }},
      },
    });
  }

  function dayKey(t) { return t.resolvedDate || t.firstEosDate || null; }

  function renderTrend() {
    const el = $('#pro-trend'); if (!el) return;
    const byDay = {};
    FILTERED.forEach(t => {
      const d = dayKey(t); if (!d) return;
      (byDay[d] = byDay[d] || { n: 0, br: 0 }).n++;
      if (t.isBreached) byDay[d].br++;
    });
    const days = Object.keys(byDay).sort();
    const vol = days.map(d => byDay[d].n);
    const rate = days.map(d => pct(byDay[d].br, byDay[d].n));
    mk('trend', el.getContext('2d'), {
      data: {
        labels: days,
        datasets: [
          { type: 'bar', label: 'Tickets', data: vol, yAxisID: 'y',
            backgroundColor: cssv('--accent', '#1a73e8') + '33',
            borderColor: cssv('--accent', '#1a73e8'), borderWidth: 1.5, borderRadius: 4, order: 2 },
          { type: 'line', label: 'Breach %', data: rate, yAxisID: 'y1',
            borderColor: cssv('--danger', '#d93025'), borderWidth: 2.4,
            backgroundColor: cssv('--danger', '#d93025') + '18', fill: true,
            tension: .35, pointRadius: 0, pointHoverRadius: 5, order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: tickColor(), usePointStyle: true } },
          tooltip: tip({ callbacks: {
            label: c => c.dataset.label === 'Breach %' ? `  Breach: ${c.raw}%` : `  Tickets: ${c.raw}`,
          }}),
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor(), maxRotation: 45, font: { size: 10 } } },
          y: { position: 'left', grid: { color: gridColor() }, ticks: { color: tickColor() }, title: { display: true, text: 'Volume', color: tickColor() } },
          y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { color: tickColor(), callback: v => v + '%' }, title: { display: true, text: 'Breach %', color: tickColor() } },
        },
      },
    });
  }

  function renderAging() {
    const el = $('#pro-aging'); if (!el) return;
    const sevs = [1, 2, 3, 4, 5].filter(s => FILTERED.some(t => t.sev === s));
    const buckets = ['Fresh <25%', 'Warming 25-50%', 'Hot 50-75%', 'Critical 75-100%', 'Breached >100%'];
    const bColor = ['#1e8e3e', '#f9ab00', '#e8710a', '#d93025', '#7b1d12'];
    const bk = (p) => p > 100 ? 4 : p >= 75 ? 3 : p >= 50 ? 2 : p >= 25 ? 1 : 0;
    const ds = sevs.map(s => {
      const row = [0, 0, 0, 0, 0];
      FILTERED.filter(t => t.sev === s).forEach(t => row[bk(t.slaConsumedPct || 0)]++);
      return { sev: s, row };
    });
    mk('aging', el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: buckets,
        datasets: ds.map(d => ({
          label: 'Sev ' + d.sev, data: d.row,
          backgroundColor: (SEVC()[d.sev] || '#80868b') + 'cc',
          borderColor: SEVC()[d.sev] || '#80868b', borderWidth: 1, borderRadius: 4,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700 },
        plugins: {
          legend: { labels: { color: tickColor(), usePointStyle: true } },
          tooltip: tip({ callbacks: { footer: items => {
            const tot = items.reduce((a, b) => a + b.raw, 0); return `Total: ${tot}`;
          }}}),
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: tickColor(), font: { size: 10 } } },
          y: { stacked: true, grid: { color: gridColor() }, ticks: { color: tickColor(), precision: 0 } },
        },
      },
    });
  }

  function renderGap() {
    const el = $('#pro-gap'); if (!el) return;
    const top = [...FILTERED].filter(t => t.lifespanBizHours > 0)
      .sort((a, b) => b.lifespanBizHours - a.lifespanBizHours).slice(0, 14);
    mk('gap', el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: top.map(t => t.shortId),
        datasets: [
          { label: 'EOS active hrs', data: top.map(t => +(t.eosHours || 0).toFixed(1)),
            backgroundColor: cssv('--accent', '#1a73e8') + 'cc', borderRadius: 4 },
          { label: 'Total lifespan hrs', data: top.map(t => +(t.lifespanBizHours || 0).toFixed(1)),
            backgroundColor: cssv('--text3', '#9aa0a6') + '66', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700 }, indexAxis: 'y',
        plugins: {
          legend: { labels: { color: tickColor(), usePointStyle: true } },
          tooltip: tip({ callbacks: {
            title: c => '#' + c[0].label,
            afterBody: c => { const t = top[c[0].dataIndex]; const gap = (t.lifespanBizHours - t.eosHours); return `Wait outside EOS: ${fmth(gap > 0 ? gap : 0)}`; },
          }}),
        },
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: tickColor(), callback: v => fmth(v) } },
          y: { grid: { display: false }, ticks: { color: tickColor(), font: { family: cssv('--mono', 'monospace'), size: 10 } } },
        },
      },
    });
  }

  function renderFrontier() {
    const el = $('#pro-frontier'); if (!el) return;
    const m = {};
    FILTERED.forEach(t => {
      const k = t.assigneeName || '—';
      (m[k] = m[k] || { n: 0, eos: [], br: 0 });
      m[k].n++; if (t.eosHours > 0) m[k].eos.push(t.eosHours);
      if (t.isBreached) m[k].br++;
    });
    const data = Object.entries(m).filter(([, v]) => v.n >= 1).map(([k, v]) => ({
      x: v.n,
      y: +(v.eos.length ? v.eos.reduce((a, b) => a + b, 0) / v.eos.length : 0).toFixed(2),
      r: Math.max(4, Math.min(20, 4 + v.br * 2)),
      name: k, br: v.br,
    }));
    const accent = cssv('--accent', '#1a73e8');
    mk('frontier', el.getContext('2d'), {
      type: 'bubble',
      data: { datasets: [{
        data,
        backgroundColor: data.map(d => (d.br > 0 ? cssv('--danger', '#d93025') : accent) + '55'),
        borderColor: data.map(d => d.br > 0 ? cssv('--danger', '#d93025') : accent),
        borderWidth: 1.4,
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700 },
        plugins: {
          legend: { display: false },
          tooltip: tip({ callbacks: {
            title: c => c[0].raw.name,
            label: c => [`Tickets: ${c.raw.x}`, `Avg EOS: ${fmth(c.raw.y)}`, `Breaches: ${c.raw.br}`],
          }}),
        },
        scales: {
          x: { title: { display: true, text: 'Tickets handled', color: tickColor() }, grid: { color: gridColor() }, ticks: { color: tickColor(), precision: 0 } },
          y: { title: { display: true, text: 'Avg EOS hrs / ticket', color: tickColor() }, grid: { color: gridColor() }, ticks: { color: tickColor(), callback: v => fmth(v) } },
        },
      },
    });
  }

  function renderCumSla() {
    const el = $('#pro-cumsla'); if (!el) return;
    const sorted = [...FILTERED].filter(t => (t.slaConsumedPct || 0) > 0)
      .sort((a, b) => (b.slaConsumedPct || 0) - (a.slaConsumedPct || 0));
    const totalBudget = sorted.reduce((a, t) => a + (t.eosHours || 0), 0) || 1;
    let acc = 0;
    const pts = sorted.map((t, i) => { acc += (t.eosHours || 0); return { x: i + 1, y: +(acc / totalBudget * 100).toFixed(1), t }; });
    const accent = cssv('--accent', '#1a73e8');
    mk('cumsla', el.getContext('2d'), {
      type: 'line',
      data: { datasets: [{
        label: 'Cumulative EOS hours (%)',
        data: pts, parsing: false,
        borderColor: accent, borderWidth: 2.5,
        backgroundColor: (g => { const c = el.getContext('2d').createLinearGradient(0, 0, 0, 300); c.addColorStop(0, accent + '55'); c.addColorStop(1, accent + '03'); return c; })(),
        fill: true, tension: .25, pointRadius: 0, pointHoverRadius: 5,
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 800 },
        plugins: {
          legend: { display: false },
          tooltip: tip({ callbacks: {
            title: c => `Top ${c[0].raw.x} tickets`,
            label: c => [`Cumulative: ${c.raw.y}% of all EOS hours`, `#${c.raw.t.shortId} · ${fmth(c.raw.t.eosHours)}`],
          }}),
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Tickets (worst-first)', color: tickColor() }, grid: { color: gridColor() }, ticks: { color: tickColor() } },
          y: { min: 0, max: 100, title: { display: true, text: '% of total EOS hours', color: tickColor() }, grid: { color: gridColor() }, ticks: { color: tickColor(), callback: v => v + '%' } },
        },
      },
    });
  }

  /* ─── narrative callout + chips ──────────────────────────────────────── */
  function renderNarrative() {
    const host = $('#pro-callout-host'), chips = $('#pro-chips');
    if (!host) return;
    const n = FILTERED.length;
    if (!n) { host.innerHTML = `<div class="pro-callout">No tickets match the current filters.</div>`; if (chips) chips.innerHTML = ''; return; }
    const breached = FILTERED.filter(t => t.isBreached).length;
    const lsBreach = FILTERED.filter(t => t.lifespanIsBreached).length;
    const bounced = FILTERED.filter(t => t.hasBounce).length;
    const eos = FILTERED.filter(t => t.eosHours > 0).map(t => t.eosHours);
    const med = median(eos), avg = eos.length ? eos.reduce((a, b) => a + b, 0) / eos.length : 0;
    // top assignee + top city
    const grp = (key) => { const m = {}; FILTERED.forEach(t => { const k = t[key]; if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1])[0]; };
    const topA = grp('assigneeName'), topC = grp('city');
    // worst single ticket
    const worst = [...FILTERED].sort((a, b) => (b.slaConsumedPct || 0) - (a.slaConsumedPct || 0))[0];
    const brC = pct(breached, n);
    const brClass = brC >= 25 ? 'hl-danger' : brC >= 10 ? 'hl-warn' : 'hl-ok';

    host.innerHTML = `<div class="pro-callout">
      Across <b>${n.toLocaleString()}</b> tickets, EOS breached
      <span class="${brClass}">${breached} (${brC}%)</span> of SLAs and lifespan breached
      <b>${lsBreach}</b> (${pct(lsBreach, n)}%). Median active time is <b>${fmth(med)}</b>
      (avg <b>${fmth(avg)}</b>), with <b>${bounced}</b> bounced tickets (${pct(bounced, n)}%).
      ${topA ? `Heaviest load: <b>${topA[0]}</b> (${topA[1]} tickets)` : ''}${topC ? ` · busiest site <b>${topC[0]}</b> (${topC[1]})` : ''}.
      ${worst ? `Highest SLA pressure: <b>#${worst.shortId}</b> at <span class="hl-danger">${Math.round(worst.slaConsumedPct || 0)}%</span> of budget.` : ''}
    </div>`;

    if (chips) {
      const c = (dot, label, val) => `<span class="pro-chip"><span class="dot" style="background:${dot}"></span>${label}: <b>${val}</b></span>`;
      chips.innerHTML = [
        c(cssv('--accent', '#1a73e8'), 'Tickets', n.toLocaleString()),
        c(cssv('--danger', '#d93025'), 'EOS breach', brC + '%'),
        c('#e8710a', 'Lifespan breach', pct(lsBreach, n) + '%'),
        c(cssv('--purple', '#8430ce'), 'Bounced', pct(bounced, n) + '%'),
        c(cssv('--teal', '#00acc1'), 'Median EOS', fmth(med)),
        c(cssv('--accent2', '#1e8e3e'), 'Resolved', pct(FILTERED.filter(t => t.status === 'resolved').length, n) + '%'),
      ].join('');
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     1b · PERIOD COMPARISON KPI BOX  (latest period vs prior period)
     Pick Week / Month / Year. Compares the most recent complete-ish
     period present in the data against the one immediately before it.
     Metrics: total tickets, avg tickets/day, median EOS hrs, EOS breaches,
     lifespan breaches — each with an improved / worse indicator.
     Lower is better for every metric here EXCEPT total/avg volume, which
     are shown as neutral context (more volume isn't "worse" per se).
     ════════════════════════════════════════════════════════════════════ */
  const CMP = { gran: 'month', count: 2 };

  // YYYY-MM-DD -> period key + label for a given granularity
  function periodKey(iso, gran) {
    // iso is already sliced to 10 chars in analytics.js, but be defensive
    const s = (iso || '').slice(0, 10);
    const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    if (!y) return null;
    if (gran === 'year')  return { key: `${y}`, sort: y * 10000, label: `${y}` };
    if (gran === 'week') {
      const dt = new Date(Date.UTC(y, m - 1, d));
      // ISO week number
      const day = (dt.getUTCDay() + 6) % 7;            // Mon=0
      dt.setUTCDate(dt.getUTCDate() - day + 3);        // nearest Thursday
      const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
      const fday = (firstThu.getUTCDay() + 6) % 7;
      firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
      const wk = 1 + Math.round((dt - firstThu) / (7 * 864e5));
      const wy = dt.getUTCFullYear();
      return { key: `${wy}-W${String(wk).padStart(2, '0')}`, sort: wy * 100 + wk, label: `${wy} · W${String(wk).padStart(2, '0')}` };
    }
    // month (default)
    return { key: `${y}-${String(m).padStart(2, '0')}`, sort: y * 100 + m,
             label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en', { month: 'short', year: 'numeric' }) };
  }

  function periodDays(gran) { return gran === 'year' ? 365 : gran === 'week' ? 7 : 30; }

  function statsFor(tickets) {
    const hrs = tickets.map(t => t.eosHours).filter(h => h > 0);
    const avgH = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : 0;
    return {
      total:   tickets.length,
      medianH: median(hrs),
      avgH,
      eosBr:   tickets.filter(t => t.isBreached).length,
      lsBr:    tickets.filter(t => t.lifespanIsBreached).length,
    };
  }

  /* ─── 1) TOPBAR BUTTON — opens the comparison lightbox ──────────────── */
  function injectCompareButton() {
    const actions = $('.t-actions');
    if (!actions || $('#btn-kpi-compare')) return;
    if (!window.__proCmpLogged) { console.log('[pro] KPI Comparison button active ✓'); window.__proCmpLogged = true; }
    const btn = document.createElement('button');
    btn.id = 'btn-kpi-compare';
    btn.className = 'btn btn-ghost';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="13" y="6" width="3" height="11"/></svg> KPI Comparison`;
    // place it first in the action group so it's easy to spot
    actions.insertBefore(btn, actions.firstChild);
    btn.addEventListener('click', openCompareModal);
  }

  /* ─── 2) MODAL SHELL (built once) ───────────────────────────────────── */
  function buildCompareModal() {
    if ($('#cmp-modal-backdrop')) return;
    const back = document.createElement('div');
    back.id = 'cmp-modal-backdrop';
    back.style.cssText = 'display:none;position:fixed;inset:0;z-index:9500;background:rgba(8,14,30,.6);backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:24px 20px;';
    back.innerHTML = `
      <div id="cmp-modal" style="background:var(--surface);border-radius:20px;max-width:1180px;width:100%;max-height:92vh;margin:auto;box-shadow:0 40px 100px rgba(0,0,0,.45),0 0 0 1px var(--border);overflow:hidden;display:flex;flex-direction:column;animation:slideUp .24s cubic-bezier(.34,1.4,.64,1);">
        <div style="padding:18px 22px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px;background:var(--surface2);flex-shrink:0;">
          <div style="width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:18px;background:var(--accent2-lt);flex-shrink:0;">📊</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:16px;font-weight:800;letter-spacing:-.02em;color:var(--text);">KPI Comparison</div>
            <div style="font-size:11px;color:var(--text3);margin-top:1px;">Compare the most recent periods · respects current filters</div>
          </div>
          <div id="cmp-tabs" style="display:flex;gap:4px;background:var(--surface3);border-radius:10px;padding:3px;">
            <button class="cmp-tab" data-gran="week">Weeks</button>
            <button class="cmp-tab" data-gran="month">Months</button>
            <button class="cmp-tab" data-gran="year">Years</button>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);">How many</span>
            <select id="cmp-count" class="fg-sel" style="height:32px;min-width:70px;">
              <option value="1">1</option><option value="2" selected>2</option>
              <option value="3">3</option><option value="5">5</option>
              <option value="10">10</option><option value="12">12</option>
            </select>
          </div>
          <button id="cmp-close" style="background:var(--surface3);border:1px solid var(--border);border-radius:9px;width:34px;height:34px;cursor:pointer;font-size:19px;color:var(--text3);display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
        </div>
        <div id="cmp-modal-body" style="padding:20px 22px 26px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:20px;"></div>
      </div>`;
    document.body.appendChild(back);

    // styling for tabs (scoped, injected once)
    if (!$('#cmp-tab-style')) {
      const st = document.createElement('style');
      st.id = 'cmp-tab-style';
      st.textContent = `
        .cmp-tab{border:none;background:transparent;color:var(--text3);font-family:var(--sans);font-size:12px;font-weight:700;padding:6px 14px;border-radius:8px;cursor:pointer;transition:all .15s;}
        .cmp-tab:hover{color:var(--text);}
        .cmp-tab.active{background:var(--surface);color:var(--accent);box-shadow:var(--sh-xs);}
        #btn-kpi-compare svg{width:14px;height:14px;}`;
      document.head.appendChild(st);
    }

    // wire controls
    back.addEventListener('click', e => { if (e.target === back) closeCompareModal(); });
    $('#cmp-close', back).addEventListener('click', closeCompareModal);
    $$('.cmp-tab', back).forEach(tab => tab.addEventListener('click', () => {
      CMP.gran = tab.dataset.gran;
      $$('.cmp-tab', back).forEach(t => t.classList.toggle('active', t === tab));
      renderCompareModal();
    }));
    $('#cmp-count', back).addEventListener('change', e => { CMP.count = +e.target.value; renderCompareModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && back.style.display === 'flex') closeCompareModal(); });
  }

  function openCompareModal() {
    buildCompareModal();
    const back = $('#cmp-modal-backdrop');
    // sync tab + count UI to state
    $$('.cmp-tab', back).forEach(t => t.classList.toggle('active', t.dataset.gran === CMP.gran));
    const cs = $('#cmp-count', back); if (cs) cs.value = String(CMP.count);
    back.style.display = 'flex';
    renderCompareModal();
  }
  function closeCompareModal() {
    const back = $('#cmp-modal-backdrop');
    if (back) back.style.display = 'none';
    ['cmp-vol', 'cmp-breach', 'cmp-hrs'].forEach(kill);
  }

  /* ─── 3) BUCKET + RENDER the modal contents (cards + charts) ─────────── */
  function bucketPeriods(gran) {
    const src = (has('FILTERED') ? FILTERED : []).filter(t => t.resolvedDate);
    const buckets = new Map();
    src.forEach(t => {
      const p = periodKey(t.resolvedDate, gran);
      if (!p) return;
      if (!buckets.has(p.key)) buckets.set(p.key, { meta: p, list: [] });
      buckets.get(p.key).list.push(t);
    });
    return [...buckets.values()].sort((a, b) => a.meta.sort - b.meta.sort);
  }

  function renderCompareModal() {
    const body = $('#cmp-modal-body');
    if (!body) return;
    const gran = CMP.gran;
    const want = CMP.count;
    const ordered = bucketPeriods(gran);

    if (!ordered.length) {
      body.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">No resolved tickets in the current filter to compare.<br><span style="font-size:11px;">Load data and clear any date range that excludes everything.</span></div>`;
      ['cmp-vol', 'cmp-breach', 'cmp-hrs'].forEach(kill);
      return;
    }

    // Take the last (want+1) periods so the oldest acts as a baseline for deltas.
    const span = ordered.slice(-(want + 1));
    const days = periodDays(gran);
    const series = span.map(b => {
      const s = statsFor(b.list);
      s.avgPerDay = s.total / days;
      s.label = b.meta.label;
      return s;
    });

    // The "headline" comparison = latest vs immediately prior.
    const cur = series[series.length - 1];
    const pre = series.length >= 2 ? series[series.length - 2] : null;

    const metrics = [
      { lbl: 'Total Tickets',     key: 'total',     fmt: v => Math.round(v),  lowerBetter: null, icon: '🎟' },
      { lbl: 'Avg Tickets / Day', key: 'avgPerDay', fmt: v => v.toFixed(1),   lowerBetter: null, icon: '📅' },
      { lbl: 'Median EOS Hrs',    key: 'medianH',   fmt: v => fmth(v),        lowerBetter: true, icon: '📐' },
      { lbl: 'Avg EOS Hrs',       key: 'avgH',      fmt: v => fmth(v),        lowerBetter: true, icon: '⏱' },
      { lbl: 'EOS Breaches',      key: 'eosBr',     fmt: v => Math.round(v),  lowerBetter: true, icon: '🚨' },
      { lbl: 'Lifespan Breaches', key: 'lsBr',      fmt: v => Math.round(v),  lowerBetter: true, icon: '🕐' },
    ];

    const cards = metrics.map(m => {
      const cv = cur[m.key];
      const pv = pre ? pre[m.key] : null;
      let badge = '', delta = '';
      if (pv != null) {
        const diff = cv - pv;
        const rel = pv !== 0 ? (diff / pv) * 100 : (cv !== 0 ? 100 : 0);
        const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
        let tone = 'neutral';
        if (m.lowerBetter === true) tone = diff < 0 ? 'good' : diff > 0 ? 'bad' : 'neutral';
        const col = tone === 'good' ? 'var(--accent2)' : tone === 'bad' ? 'var(--danger)' : 'var(--text3)';
        const bg  = tone === 'good' ? 'var(--accent2-lt)' : tone === 'bad' ? 'var(--danger-lt)' : 'var(--surface3)';
        const word = m.lowerBetter == null ? '' : (tone === 'good' ? ' improved' : tone === 'bad' ? ' worse' : ' flat');
        const relTxt = isFinite(rel) ? `${rel > 0 ? '+' : ''}${rel.toFixed(0)}%` : '—';
        badge = `<span style="display:inline-flex;align-items:center;gap:4px;background:${bg};color:${col};border-radius:20px;padding:2px 9px;font-size:10px;font-weight:800;font-family:var(--mono);">${arrow} ${relTxt}</span>`;
        delta = `<div style="font-size:9.5px;color:${col};font-weight:700;margin-top:3px;">${m.fmt(pv)} → ${m.fmt(cv)}${word}</div>`;
      } else {
        delta = `<div style="font-size:9.5px;color:var(--text3);margin-top:3px;">no prior period</div>`;
      }
      return `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:13px 13px 11px;display:flex;flex-direction:column;gap:2px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text3);">${m.icon} ${m.lbl}</div>
            ${badge}
          </div>
          <div style="font-size:24px;font-weight:800;font-family:var(--mono);line-height:1.05;color:var(--text);letter-spacing:-.02em;">${m.fmt(cv)}</div>
          ${delta}
        </div>`;
    }).join('');

    // overall verdict
    let goodN = 0, badN = 0, verdict = '';
    if (pre) {
      metrics.filter(m => m.lowerBetter === true).forEach(m => {
        const d = cur[m.key] - pre[m.key]; if (d < 0) goodN++; else if (d > 0) badN++;
      });
      const tone = goodN > badN ? 'good' : badN > goodN ? 'bad' : 'neutral';
      const col = tone === 'good' ? 'var(--accent2)' : tone === 'bad' ? 'var(--danger)' : 'var(--text3)';
      const bg  = tone === 'good' ? 'var(--accent2-lt)' : tone === 'bad' ? 'var(--danger-lt)' : 'var(--surface3)';
      const txt = tone === 'good' ? '✅ Overall improved vs prior'
               : tone === 'bad'  ? '⚠️ Overall got worse vs prior'
               : '➖ Mixed / flat vs prior';
      verdict = `<span style="background:${bg};color:${col};border-radius:20px;padding:3px 12px;font-size:11px;font-weight:800;">${txt}</span>`;
    }
    const headLine = pre
      ? `<span style="color:var(--text2);font-weight:700;">${pre.label}</span> <span style="color:var(--text3);">vs</span> <span style="color:var(--accent);font-weight:800;">${cur.label}</span>`
      : `<span style="color:var(--accent);font-weight:800;">${cur.label}</span> <span style="color:var(--text3);">(no prior period)</span>`;

    const granWord = gran === 'week' ? 'week' : gran === 'year' ? 'year' : 'month';

    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-size:13px;">${headLine}</div>
        ${verdict}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px;">${cards}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:14px 14px 8px;">
          <div style="font-size:11px;font-weight:800;color:var(--text);margin-bottom:8px;">🎟 Ticket Volume by ${granWord}</div>
          <div style="height:230px;"><canvas id="cmp-vol"></canvas></div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:14px 14px 8px;">
          <div style="font-size:11px;font-weight:800;color:var(--text);margin-bottom:8px;">🚨 Breaches by ${granWord}</div>
          <div style="height:230px;"><canvas id="cmp-breach"></canvas></div>
        </div>
        <div style="grid-column:span 2;background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:14px 14px 8px;">
          <div style="font-size:11px;font-weight:800;color:var(--text);margin-bottom:8px;">⏱ Avg &amp; Median EOS Hours by ${granWord}</div>
          <div style="height:240px;"><canvas id="cmp-hrs"></canvas></div>
        </div>
      </div>
      <div style="font-size:9.5px;color:var(--text3);font-family:var(--mono);">
        Showing last ${series.length} ${granWord}(s) present in data · headline compares the two most recent · lower hrs/breaches = improved
      </div>`;

    // ── charts ──
    const labels = series.map(s => s.label);
    const grid = gridColor(), tick = tickColor();
    const baseOpts = (yTitle) => ({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: tick, font: { size: 11 }, usePointStyle: true } }, tooltip: tip() },
      scales: {
        x: { ticks: { color: tick, font: { size: 10 } }, grid: { color: grid } },
        y: { beginAtZero: true, ticks: { color: tick, font: { size: 10 } }, grid: { color: grid }, title: { display: !!yTitle, text: yTitle, color: tick, font: { size: 10 } } },
      },
    });

    if (typeof Chart !== 'undefined') {
      const vc = $('#cmp-vol'); if (vc) mk('cmp-vol', vc, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Tickets', data: series.map(s => s.total), backgroundColor: cssv('--accent', '#1a73e8'), borderRadius: 6, maxBarThickness: 46 }] },
        options: baseOpts('tickets'),
      });
      const bc = $('#cmp-breach'); if (bc) mk('cmp-breach', bc, {
        type: 'bar',
        data: { labels, datasets: [
          { label: 'EOS Breached', data: series.map(s => s.eosBr), backgroundColor: cssv('--danger', '#d93025'), borderRadius: 6, maxBarThickness: 30 },
          { label: 'Lifespan Breached', data: series.map(s => s.lsBr), backgroundColor: cssv('--warn', '#f9ab00'), borderRadius: 6, maxBarThickness: 30 },
        ] },
        options: baseOpts('breaches'),
      });
      const hc = $('#cmp-hrs'); if (hc) mk('cmp-hrs', hc, {
        type: 'line',
        data: { labels, datasets: [
          { label: 'Avg EOS hrs', data: series.map(s => +s.avgH.toFixed(1)), borderColor: cssv('--accent', '#1a73e8'), backgroundColor: 'transparent', tension: .3, pointRadius: 4, borderWidth: 2 },
          { label: 'Median EOS hrs', data: series.map(s => +s.medianH.toFixed(1)), borderColor: cssv('--purple', '#8430ce'), backgroundColor: 'transparent', tension: .3, pointRadius: 4, borderWidth: 2, borderDash: [5, 4] },
        ] },
        options: baseOpts('business hours'),
      });
    }
  }

  /* run all new renderers, isolated */
  function renderPro() {
    [injectShell, injectCompareButton, renderNarrative, renderRisk, renderRadar, renderTrend,
     renderAging, renderGap, renderFrontier, renderCumSla].forEach(fn => {
      try { fn(); } catch (e) { console.warn('[pro]', fn.name, e); }
    });
    // refresh modal live if it's open
    if ($('#cmp-modal-backdrop')?.style.display === 'flex') { try { renderCompareModal(); } catch (_) {} }
    buildRail();
  }

  /* ════════════════════════════════════════════════════════════════════
     3 · WRAP render() — keep original, append ours
     ════════════════════════════════════════════════════════════════════ */
  function wrapRender() {
    if (typeof window.render !== 'function' || window.render.__proWrapped) return;
    const orig = window.render;
    window.render = function () {
      const r = orig.apply(this, arguments);
      // defer so DOM the original wrote is settled
      requestAnimationFrame(() => { try { renderPro(); revealScan(); bumpTopbar(); } catch (e) { console.warn('[pro] wrap', e); } });
      return r;
    };
    window.render.__proWrapped = true;
  }

  /* ════════════════════════════════════════════════════════════════════
     4 · MOTION: scroll reveal, nav rail, top button, topbar glass
     ════════════════════════════════════════════════════════════════════ */
  let _io;
  function revealScan() {
    const targets = $$('#main-content > .cg, #main-content > .section-hd').filter(e => !e.__pro);
    if (!('IntersectionObserver' in window)) { targets.forEach(t => t.classList.add('pro-in')); return; }
    if (!_io) _io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('pro-in'); _io.unobserve(en.target); } });
    }, { threshold: .08, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(t => { t.__pro = 1; t.classList.add('pro-reveal'); _io.observe(t); });
  }

  function buildRail() {
    let rail = $('#pro-rail');
    if (!rail) { rail = document.createElement('div'); rail.id = 'pro-rail'; document.body.appendChild(rail); }
    const hds = $$('#main-content .section-hd');
    rail.innerHTML = hds.map((h, i) => {
      const lbl = (h.dataset.proNav || h.textContent.replace(/[^\w &]/g, '').trim()).slice(0, 22);
      h.id = h.id || 'pro-sec-' + i;
      return `<div class="pro-rail-dot" data-target="${h.id}" data-label="${lbl}"></div>`;
    }).join('');
    $$('.pro-rail-dot', rail).forEach(d => d.addEventListener('click', () => {
      $('#' + d.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    setTimeout(() => rail.classList.add('show'), 400);
    // active dot tracking
    if (!rail.__io && 'IntersectionObserver' in window) {
      rail.__io = new IntersectionObserver((es) => {
        es.forEach(e => { if (e.isIntersecting) {
          $$('.pro-rail-dot', rail).forEach(x => x.classList.toggle('active', x.dataset.target === e.target.id));
        }});
      }, { rootMargin: '-20% 0px -70% 0px' });
      hds.forEach(h => rail.__io.observe(h));
    }
  }

  function topButton() {
    if ($('#pro-toplink')) return;
    const b = document.createElement('button');
    b.id = 'pro-toplink'; b.title = 'Back to top (Home)';
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
    b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(b);
    const main = $('#main-content') || window;
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      b.classList.toggle('show', y > 600);
      $('.topbar')?.classList.toggle('pro-scrolled', y > 10);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* topbar number count-up + bump on data change */
  let _lastTop = {};
  function bumpTopbar() {
    ['tb-total', 'tb-filtered', 'tb-breached', 'tb-ls-breached'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      const target = parseInt((el.textContent || '0').replace(/[^\d]/g, ''), 10) || 0;
      if (_lastTop[id] === target) return;
      const from = _lastTop[id] ?? 0; _lastTop[id] = target;
      el.classList.remove('pro-bump'); void el.offsetWidth; el.classList.add('pro-bump');
      const dur = 480, t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(from + (target - from) * e).toLocaleString();
        if (k < 1) requestAnimationFrame(step); else el.textContent = target.toLocaleString();
      };
      requestAnimationFrame(step);
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     4b · DESK-AUDIT COMPOSITION + BUILDING CHARTS + BUILDING-FILTER SYNC
     • Wraps the global auditRender() and injects analysis after the KPI strip.
     • Keeps an untouched master copy (AUDIT_ALL) so filtering is reversible.
     • The EXISTING top #f-building dropdown also drives the audit section:
       choosing a building re-renders KPIs, native charts, composition and
       building charts for that building only. Pure read — no audit-code edits.
     ════════════════════════════════════════════════════════════════════ */
  const reDaisy    = /daisy/i;
  const reDual27   = /(dual|2x|double|two)[^0-9]*27|27[^0-9]*(dual|2x|double|two)|dual\s*27/i;
  const reSingle32 = /(single|1x|one)[^0-9]*32|32[^0-9]*(single|1x|one)|single\s*32/i;
  const dockPresent = (v) => /^(y|yes|present|true|1|✓)/i.test(String(v || '').trim());

  let AUDIT_ALL = null;            // master copy of every audit row
  let _auditSyncing = false;       // guard against re-entrancy

  // Capture/refresh the master copy whenever AUDIT grows beyond what we hold,
  // i.e. a fresh file load (auditLoadBuffer sets AUDIT then calls auditRender).
  function captureMaster() {
    if (!has('AUDIT') || !Array.isArray(AUDIT)) return;
    if (!AUDIT_ALL || AUDIT.length > AUDIT_ALL.length || _freshLoad) {
      AUDIT_ALL = AUDIT.slice();
      _freshLoad = false;
    }
  }
  let _freshLoad = false;

  function injectAuditComp() {
    const strip = $('#audit-kpi');
    if (!strip) return false;
    if ($('#pro-audit-comp-wrap')) return true;
    const wrap = document.createElement('div');
    wrap.id = 'pro-audit-comp-wrap';
    wrap.innerHTML = `
      <div class="cg">
        <div class="card" id="pro-audit-comp" style="grid-column:span 12;">
          <div class="ch">
            <div class="ch-icon" style="background:var(--teal-lt);">🧩</div>
            <div class="ch-title">Setup &amp; Dock Composition <span class="pro-tag">audit mix</span></div>
            <div id="pro-audit-scope" class="ch-sub" style="margin-left:auto;"></div>
          </div>
          <div id="pro-comp-stats" class="pro-comp-grid"></div>
          <div class="cm-sec-lbl" style="padding:6px 16px 0;">Docking Stations per Building</div>
          <div class="pro-bld-wrap"><table class="pro-bld-tbl" id="pro-bld-tbl"></table></div>
        </div>
      </div>
      <div class="cg">
        <div class="card c6">
          <div class="ch"><div class="ch-icon" style="background:var(--accent2-lt);">🏢</div>
            <div class="ch-title">Pass Rate by Building <span class="pro-tag">ranked</span></div></div>
          <div class="cb cch" style="height:300px;"><canvas id="pro-bld-pass"></canvas></div>
        </div>
        <div class="card c6">
          <div class="ch"><div class="ch-icon" style="background:var(--purple-lt);">🧱</div>
            <div class="ch-title">Setup Mix by Building <span class="pro-tag">stacked</span></div></div>
          <div class="cb cch" style="height:300px;"><canvas id="pro-bld-setup"></canvas></div>
        </div>
      </div>`;
    strip.parentNode.insertBefore(wrap, strip.nextSibling);
    return true;
  }

  function gridC() { return isDark() ? 'rgba(255,255,255,.07)' : 'rgba(60,64,67,.10)'; }
  function tickC() { return cssv('--text3', '#5f6368'); }

  function renderBuildingCharts(rows) {
    // group
    const byB = {};
    rows.forEach(r => {
      const b = r.buildingCode || '—';
      (byB[b] = byB[b] || { total: 0, pass: 0, dock: 0, daisy: 0, dual: 0, single: 0, other: 0 });
      const g = byB[b];
      g.total++;
      if (r.result === 'Pass') g.pass++;
      if (dockPresent(r.dockPresent)) g.dock++;
      if (reDaisy.test(r.setupType)) g.daisy++;
      else if (reDual27.test(r.setupType)) g.dual++;
      else if (reSingle32.test(r.setupType)) g.single++;
      else g.other++;
    });
    const entries = Object.entries(byB).filter(([b]) => b !== '—').sort((a, b) => b[1].total - a[1].total).slice(0, 14);
    const labels = entries.map(e => e[0]);

    // Pass Rate by Building — horizontal bar, colored by rate
    const passEl = $('#pro-bld-pass');
    if (passEl) {
      const rates = entries.map(([, v]) => pct(v.pass, v.total));
      const cols = rates.map(p => p >= 80 ? cssv('--accent2', '#1e8e3e') : p >= 50 ? cssv('--warn', '#f9ab00') : cssv('--danger', '#d93025'));
      mk('bldPass', passEl.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{
          label: 'Pass rate', data: rates,
          backgroundColor: cols.map(c => c + '33'), borderColor: cols,
          borderWidth: 2, borderRadius: 5, borderSkipped: false,
        }]},
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          animation: { duration: 700 },
          plugins: {
            legend: { display: false },
            tooltip: tip({ callbacks: {
              title: c => c[0].label,
              label: c => { const v = entries[c.dataIndex][1]; return [`Pass rate: ${c.raw}%`, `Passed ${v.pass} / ${v.total} desks`, `Failed ${v.total - v.pass}`]; },
            }}),
          },
          scales: {
            x: { min: 0, max: 100, grid: { color: gridC() }, ticks: { color: tickC(), callback: v => v + '%' } },
            y: { grid: { display: false }, ticks: { color: tickC(), font: { family: cssv('--mono', 'monospace'), size: 10 } } },
          },
        },
      });
    }

    // Setup Mix by Building — stacked horizontal
    const setupEl = $('#pro-bld-setup');
    if (setupEl) {
      const seg = (key, col) => ({
        label: key, data: entries.map(([, v]) => v[{ Daisy: 'daisy', 'Dual 27"': 'dual', 'Single 32"': 'single', Other: 'other' }[key]]),
        backgroundColor: col + 'cc', borderColor: col, borderWidth: 1, borderRadius: 3,
      });
      mk('bldSetup', setupEl.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [
          seg('Daisy', cssv('--purple', '#8430ce')),
          seg('Dual 27"', cssv('--teal', '#00acc1')),
          seg('Single 32"', cssv('--warn', '#f9ab00')),
          seg('Other', cssv('--text3', '#9aa0a6')),
        ]},
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          animation: { duration: 700 },
          plugins: {
            legend: { labels: { color: tickC(), usePointStyle: true, boxWidth: 9, font: { size: 11 } } },
            tooltip: tip({ callbacks: {
              footer: items => { const v = entries[items[0].dataIndex][1]; return `Total: ${v.total} desks`; },
            }}),
          },
          scales: {
            x: { stacked: true, grid: { color: gridC() }, ticks: { color: tickC(), precision: 0 } },
            y: { stacked: true, grid: { display: false }, ticks: { color: tickC(), font: { family: cssv('--mono', 'monospace'), size: 10 } } },
          },
        },
      });
    }
  }

  function renderAuditComp() {
    if (!has('AUDIT') || !Array.isArray(AUDIT) || !AUDIT.length) return;
    if (!injectAuditComp()) return;
    captureMaster();
    const rows = AUDIT, n = rows.length;

    // scope label reflects the active building filter
    const bSel = $('#f-building');
    const scope = $('#pro-audit-scope');
    if (scope) scope.textContent = (bSel && bSel.value) ? `🏢 ${bSel.value} · ${n} desks` : `all buildings · ${n} desks`;

    const daisy    = rows.filter(r => reDaisy.test(r.setupType)).length;
    const dual27   = rows.filter(r => reDual27.test(r.setupType)).length;
    const single32 = rows.filter(r => reSingle32.test(r.setupType)).length;
    const docks    = rows.filter(r => dockPresent(r.dockPresent)).length;

    const stats = [
      { ic: '🔌', lbl: 'Desks with Dock', val: docks,    sub: 'docking station present', cc: cssv('--accent', '#1a73e8') },
      { ic: '🔗', lbl: 'Daisy Chain',     val: daisy,    sub: 'chained monitor setups',  cc: cssv('--purple', '#8430ce') },
      { ic: '🖥', lbl: 'Dual 27"',        val: dual27,   sub: 'two 27-inch monitors',    cc: cssv('--teal', '#00acc1') },
      { ic: '🖵', lbl: 'Single 32"',      val: single32, sub: 'one 32-inch monitor',     cc: cssv('--warn', '#f9ab00') },
    ];
    const host = $('#pro-comp-stats');
    if (host) host.innerHTML = stats.map(s => {
      const p = pct(s.val, n);
      return `<div class="pro-comp-stat" style="--cc:${s.cc}">
        <div class="pc-top"><span class="pc-ic">${s.ic}</span><span class="pc-lbl">${s.lbl}</span></div>
        <div class="pc-val">${p}%</div>
        <div class="pc-sub">${s.val.toLocaleString()} of ${n.toLocaleString()} · ${s.sub}</div>
        <div class="pc-bar"><div class="pc-fill" style="width:${p}%"></div></div>
      </div>`;
    }).join('');

    const byB = {};
    rows.forEach(r => {
      const b = r.buildingCode || '—';
      (byB[b] = byB[b] || { total: 0, dock: 0, daisy: 0, dual: 0, single: 0 });
      byB[b].total++;
      if (dockPresent(r.dockPresent)) byB[b].dock++;
      if (reDaisy.test(r.setupType)) byB[b].daisy++;
      if (reDual27.test(r.setupType)) byB[b].dual++;
      if (reSingle32.test(r.setupType)) byB[b].single++;
    });
    const ordered = Object.entries(byB).filter(([b]) => b !== '—').sort((a, b) => b[1].total - a[1].total);
    const accent = cssv('--accent', '#1a73e8');
    const tbl = $('#pro-bld-tbl');
    if (tbl) tbl.innerHTML = `
      <thead><tr>
        <th>Building</th><th>Desks</th><th>Dock %</th>
        <th>Daisy %</th><th>Dual 27 %</th><th>Single 32 %</th>
      </tr></thead>
      <tbody>${ordered.map(([b, v]) => {
        const cell = (val, col) => `<td><div class="pro-pctcell"><div class="pro-mini-track"><div class="pro-mini-fill" style="width:${val}%;background:${col}"></div></div><b>${val}%</b></div></td>`;
        return `<tr>
          <td class="pro-bld-code">${b}</td>
          <td>${v.total}</td>
          ${cell(pct(v.dock, v.total), accent)}
          ${cell(pct(v.daisy, v.total), cssv('--purple', '#8430ce'))}
          ${cell(pct(v.dual, v.total), cssv('--teal', '#00acc1'))}
          ${cell(pct(v.single, v.total), cssv('--warn', '#f9ab00'))}
        </tr>`;
      }).join('')}</tbody>`;

    // Building charts always reflect the full master set so you can still see
    // every building even while a single building is selected — except when a
    // building is selected, where they naturally collapse to that one.
    try { renderBuildingCharts(rows); } catch (e) { console.warn('[pro] bldCharts', e); }
  }

  /* Re-render the WHOLE audit section for a row subset, without the scroll
     jump the native auditRender() performs. Calls the native sub-renderers
     directly (they all accept a rows argument). */
  function auditRenderSubset(rows) {
    _auditSyncing = true;
    const prev = has('AUDIT') ? AUDIT : null;
    try {
      window.AUDIT = rows;                       // native sub-renderers read params, but keep global consistent
      if (typeof auditRenderKpi      === 'function') auditRenderKpi(rows);
      if (typeof auditRenderCards    === 'function') auditRenderCards(rows);
      if (typeof auditRenderCharts   === 'function') auditRenderCharts(rows);
      if (typeof auditRenderFindings === 'function') auditRenderFindings(rows);
      if (typeof auditRenderTable    === 'function') auditRenderTable(rows);
      renderAuditComp();
    } catch (e) {
      console.warn('[pro] auditRenderSubset', e);
    } finally {
      _auditSyncing = false;
    }
  }

  /* Apply the top #f-building value to the audit section. */
  function syncAuditToBuilding() {
    if (!AUDIT_ALL || !AUDIT_ALL.length) return;
    const sel = $('#f-building');
    const b = (sel && sel.value || '').trim();
    const rows = b ? AUDIT_ALL.filter(r => (r.buildingCode || '') === b) : AUDIT_ALL;
    // If a building is selected that has no audit rows, fall back to all so the
    // section never goes blank — and note it in the scope label.
    auditRenderSubset(rows.length ? rows : AUDIT_ALL);
    if (!rows.length && b) {
      const scope = $('#pro-audit-scope');
      if (scope) scope.textContent = `🏢 ${b} · no audit rows — showing all`;
    }
  }

  function wrapAuditRender() {
    if (typeof window.auditRender !== 'function' || window.auditRender.__proWrapped) return;
    const orig = window.auditRender;
    window.auditRender = function () {
      _freshLoad = true;                          // a real load/render is happening
      const r = orig.apply(this, arguments);
      requestAnimationFrame(() => {
        try { captureMaster(); renderAuditComp(); wireBuildingFilter(); } catch (e) { console.warn('[pro] auditComp', e); }
      });
      return r;
    };
    window.auditRender.__proWrapped = true;
  }

  let _bldWired = false;
  function wireBuildingFilter() {
    if (_bldWired) return;
    const sel = $('#f-building');
    if (!sel) return;
    _bldWired = true;
    // Run after the native applyFilters handler (which also listens to change).
    sel.addEventListener('change', () => { setTimeout(syncAuditToBuilding, 0); });
    // Clear button resets it too.
    $('#btn-clear-filters')?.addEventListener('click', () => { setTimeout(syncAuditToBuilding, 0); });
  }


  /* ════════════════════════════════════════════════════════════════════
     5 · COMMAND PALETTE  (Ctrl/Cmd-K)  +  toast
     ════════════════════════════════════════════════════════════════════ */
  function toast(msg) {
    let t = $('#pro-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pro-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t.__h); t.__h = setTimeout(() => t.classList.remove('show'), 2200);
  }
  window.proToast = toast;

  function buildPalette() {
    if ($('#pro-cmd-backdrop')) return;
    const back = document.createElement('div'); back.id = 'pro-cmd-backdrop';
    back.innerHTML = `<div id="pro-cmd"><input id="pro-cmd-input" placeholder="Jump to a section, toggle theme, export…" autocomplete="off"/><div id="pro-cmd-list"></div></div>`;
    document.body.appendChild(back);
    const input = $('#pro-cmd-input'), list = $('#pro-cmd-list');

    const actions = () => {
      const secs = $$('#main-content .section-hd').map((h, i) => ({
        ico: '📍', label: h.textContent.replace(/[^\w &]/g, '').trim(), key: 'section',
        run: () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      }));
      return [
        { ico: '🌓', label: 'Toggle dark / light theme', key: 'theme', run: () => $('#theme-toggle-btn')?.click() },
        { ico: '⬇', label: 'Export CSV', key: 'export', run: () => $('#btn-export-csv')?.click() },
        { ico: '📂', label: 'Load files', key: 'load', run: () => ($('#btn-load-files-topbar') || $('#btn-load-files'))?.click() },
        { ico: '🔄', label: 'Reload', key: 'reload', run: () => $('#btn-reload')?.click() },
        { ico: '🧹', label: 'Clear filters', key: 'clear', run: () => $('#btn-clear-filters')?.click() },
        { ico: '⬆', label: 'Scroll to top', key: 'top', run: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
        ...secs,
      ];
    };
    let cur = [], sel = 0;
    const draw = (q = '') => {
      cur = actions().filter(a => a.label.toLowerCase().includes(q.toLowerCase()));
      sel = 0;
      list.innerHTML = cur.map((a, i) => `<div class="pro-cmd-item ${i === 0 ? 'sel' : ''}" data-i="${i}"><span class="ico">${a.ico}</span>${a.label}<span class="k">${a.key}</span></div>`).join('') || `<div class="pro-cmd-item">No matches</div>`;
      $$('.pro-cmd-item', list).forEach(el => {
        el.addEventListener('mouseenter', () => { sel = +el.dataset.i; mark(); });
        el.addEventListener('click', () => fire());
      });
    };
    const mark = () => $$('.pro-cmd-item', list).forEach((el, i) => el.classList.toggle('sel', i === sel));
    const fire = () => { const a = cur[sel]; close(); if (a) a.run(); };
    const open = () => { back.style.display = 'flex'; input.value = ''; draw(''); input.focus(); };
    const close = () => { back.style.display = 'none'; };
    window.proCmdOpen = open;

    input.addEventListener('input', () => draw(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(cur.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); fire(); }
      else if (e.key === 'Escape') close();
    });
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); back.style.display === 'flex' ? close() : open(); }
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     6 · BOOT
     ════════════════════════════════════════════════════════════════════ */
  whenReady(() => {
    wrapRender();
    topButton();
    buildPalette();
    // Inject the KPI Comparison button immediately (topbar exists at load).
    try { injectCompareButton(); } catch (e) { console.warn('[pro] cmpBtn', e); }
    // If data is already rendered (render ran before we wrapped), do a pass now.
    if (has('FILTERED') && FILTERED && FILTERED.length) {
      requestAnimationFrame(() => { try { renderPro(); revealScan(); bumpTopbar(); } catch (_) {} });
    }
    // Desk-audit composition: wrap auditRender, and run now if audit already loaded.
    wrapAuditRender();
    if (has('AUDIT') && Array.isArray(AUDIT) && AUDIT.length) {
      _freshLoad = true;
      requestAnimationFrame(() => { try { captureMaster(); renderAuditComp(); wireBuildingFilter(); } catch (_) {} });
    }
    // Always try to wire the building filter (it may appear after first render).
    wireBuildingFilter();
    // Re-theme charts when the toggle flips.
    $('#theme-toggle-btn')?.addEventListener('click', () => setTimeout(() => { renderPro(); renderAuditComp(); }, 60));
    console.log('%cEOS Analytics Pro layer active', 'color:#1a73e8;font-weight:700');
  });
})();
