// ══════════════════════════════════════════════════════════════════════
//  SIM EOS Analytics — analytics.js  (expanded edition)
// ══════════════════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────────────────
let ALL      = [];
let FILTERED = [];
let sortCol  = 'eosHours', sortDir = -1;
let page     = 1;
const PAGE_SIZE = 50;

// Leaflet map instances (created once, reused on filter changes)
var _mapHeat=null, _mapCoverage=null, _heatLayers=[], _covLayers=[];

let chartBar, chartSevPie, chartSevBar, chartBreachSev,
    chartRootcause, chartClosure, chartTimeline,
    chartCumulative, chartWorkloadRisk, chartResolutionSpeed,
    chartHistogram, chartScatter, chartBounce, chartRepeatReq;

// ── Palette ────────────────────────────────────────────────────────────
const SEV_COLOR = {
  1:'#d93025', 2:'#e8710a', 3:'#f9ab00', 4:'#1e8e3e', 5:'#80868b',
};
const PALETTE = [
  '#1a73e8','#1e8e3e','#f9ab00','#d93025','#8430ce',
  '#00acc1','#e8710a','#0d9488','#d01884','#4285f4',
  '#12b5cb','#a142f4','#f9ab00','#669df6','#7cb342',
];
const BADGE_BASE = 'https://badgephotos.corp.amazon.com/?login=';

// ── Nominatim geocoding: cache + 1 req/s throttle ──────────────────────
const _geoCache = {};
const _GEO_LS   = 'nominatim_cache_v1';
const _GEO_TTL  = 30 * 24 * 60 * 60 * 1000; // 30 days

function _geoLoadLS() {
  try {
    const raw = localStorage.getItem(_GEO_LS);
    if (!raw) return;
    const store = JSON.parse(raw);
    const now   = Date.now();
    for (const [k, v] of Object.entries(store)) {
      if (v.ts && now - v.ts < _GEO_TTL) _geoCache[k] = v;
    }
  } catch (_) {}
}
function _geoSaveLS() {
  try { localStorage.setItem(_GEO_LS, JSON.stringify(_geoCache)); } catch (_) {}
}
_geoLoadLS();

const _geoQueue = [];
let   _geoRunning = false;

function geocode(address) {
  const key = address.trim().toLowerCase();
  if (_geoCache[key]) return Promise.resolve(_geoCache[key].data);
  return new Promise((resolve) => {
    _geoQueue.push({ key, address, resolve });
    if (!_geoRunning) _geoFlush();
  });
}

function _geoFlush() {
  if (!_geoQueue.length) { _geoRunning = false; return; }
  _geoRunning = true;
  const { key, address, resolve } = _geoQueue.shift();
  fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
    { headers: { 'Accept-Language': 'en', 'User-Agent': 'SIM-EOS-Analytics/1.0' } }
  )
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
      const result = data?.[0] ? { lat: +data[0].lat, lon: +data[0].lon } : null;
      _geoCache[key] = { data: result, ts: Date.now() };
      _geoSaveLS();
      resolve(result);
    })
    .catch(() => resolve(null))
    .finally(() => setTimeout(_geoFlush, 1100));
}

// ── Chart.js global defaults ──────────────────────────────────────────
function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;
  const D = Chart.defaults;
  D.font = { family: "'DM Sans', -apple-system, sans-serif", size: 12 };
  D.color = '#3c4043';
  const T = D.plugins.tooltip;
  T.backgroundColor = 'rgba(32,33,36,0.95)';
  T.titleColor      = '#ffffff';
  T.bodyColor       = '#e8eaed';
  T.borderColor     = 'rgba(26,115,232,0.5)';
  T.borderWidth     = 1;
  T.titleFont       = { size: 12.5, weight: '700' };
  T.bodyFont        = { size: 12 };
  T.padding         = { x:14, y:10 };
  T.cornerRadius    = 9;
  T.boxPadding      = 4;
  T.displayColors   = true;
  const L = D.plugins.legend.labels;
  L.font = { size: 12 }; L.padding = 14;
  L.usePointStyle = true; L.pointStyleWidth = 10;
  L.boxWidth = 10; L.color = '#3c4043';
  ['linear','category','logarithmic'].forEach(type => {
    try {
      const s = Chart.defaults.scales[type];
      if (!s) return;
      s.grid  = s.grid  || {};
      s.ticks = s.ticks || {};
      s.grid.color      = 'rgba(60,64,67,0.10)';
      s.grid.drawBorder = false;
      s.ticks.color     = '#5f6368';
      s.ticks.font      = { size: 11.5 };
      s.ticks.padding   = 6;
    } catch(e) {}
  });
}
applyChartDefaults();

// ── Tech-grid animated background ──────────────────────────────────────
(function techGridBG(){
  const cv = document.getElementById('bg-fx');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W=0, H=0, dpr=Math.min(window.devicePixelRatio||1, 2);
  const SPACING = 34;          // grid cell size
  let t = 0;
  function isDark(){ return document.documentElement.getAttribute('data-theme')==='dark'; }
  function resize(){
    W = cv.clientWidth = window.innerWidth;
    H = cv.clientHeight = window.innerHeight;
    cv.width = W*dpr; cv.height = H*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize', resize);
  resize();
  function frame(){
    t += 0.012;
    ctx.clearRect(0,0,W,H);
    const dark = isDark();
    const cols = Math.ceil(W/SPACING)+1;
    const rows = Math.ceil(H/SPACING)+1;
    // faint grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = dark ? 'rgba(138,180,248,0.05)' : 'rgba(26,115,232,0.045)';
    ctx.beginPath();
    for (let i=0;i<cols;i++){ const x=i*SPACING; ctx.moveTo(x,0); ctx.lineTo(x,H); }
    for (let j=0;j<rows;j++){ const y=j*SPACING; ctx.moveTo(0,y); ctx.lineTo(W,y); }
    ctx.stroke();
    // wave-modulated dots
    for (let i=0;i<cols;i++){
      for (let j=0;j<rows;j++){
        const x=i*SPACING, y=j*SPACING;
        // travelling diagonal wave
        const wave = Math.sin((x*0.012)+(y*0.012)+t) + Math.sin((x*0.018)-(y*0.006)+t*0.7);
        const m = (wave+2)/4;                       // 0..1
        const r = 0.6 + m*1.8;                      // dot radius
        const a = dark ? 0.10 + m*0.30 : 0.06 + m*0.22;
        // hue shifts subtly across the wave: blue → purple
        const blue   = dark ? [138,180,248] : [26,115,232];
        const purple = dark ? [197,138,249] : [132,48,206];
        const cr = Math.round(blue[0]+(purple[0]-blue[0])*m);
        const cg = Math.round(blue[1]+(purple[1]-blue[1])*m);
        const cb = Math.round(blue[2]+(purple[2]-blue[2])*m);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${a.toFixed(3)})`;
        ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// Re-evaluate side showcase on resize (debounced)
let _sideRz;
window.addEventListener('resize', () => {
  clearTimeout(_sideRz);
  _sideRz = setTimeout(() => { if (FILTERED && FILTERED.length) try { renderSideShow(); } catch(e){} }, 250);
});

// ── Helpers ────────────────────────────────────────────────────────────
function fmtH(h) {
  if (h == null || isNaN(h)) return '—';
  if (h === 0) return '0h';
  if (h < 1)  return Math.round(h * 60) + 'm';
  return h.toFixed(1) + 'h';
}
function fmtDate(iso) {
  if (!iso) return '—';
  return iso.slice(0,10);
}
function calcBizHours(eosIntervals, region) {
  try {
    if (!eosIntervals?.length) return 0;
    // Use region settings if available, otherwise fall back to Mon-Fri 09-17
    const tz      = region?.timezone  || null;
    const wdSet   = new Set(region?.workDays   || [1,2,3,4,5]);
    const [sh,sm] = (region?.workStart || '09:00').split(':').map(Number);
    const [eh,em] = (region?.workEnd   || '17:00').split(':').map(Number);
    const WS = sh + sm/60, WE = eh + em/60;
  
    function _parts(d) {
      if (!tz) return null;
      try {
        const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',weekday:'short',hour12:false});
        const p = Object.fromEntries(fmt.formatToParts(d).map(x=>[x.type,x.value]));
        const DOW={sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
        return{day:DOW[p.weekday.toLowerCase()]??d.getDay(),hour:parseInt(p.hour)%24,min:parseInt(p.minute),sec:parseInt(p.second),year:parseInt(p.year),month:parseInt(p.month)-1,date:parseInt(p.day)};
      } catch(_){return null;}
    }
    function tzDay(d){const p=_parts(d);return p?p.day:d.getDay();}
    function tzH(d){const p=_parts(d);return p?p.hour+p.min/60+p.sec/3600:d.getHours()+d.getMinutes()/60+d.getSeconds()/3600;}
    function tzSetH(d,h,m){
      if(!tz){d.setHours(Math.floor(h),m||0,0,0);return;}
      try{const p=_parts(d);if(!p){d.setHours(Math.floor(h),m||0,0,0);return;}
        const approx=Date.UTC(p.year,p.month,p.date,Math.floor(h),m||0,0);
        const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
        const q=Object.fromEntries(fmt.formatToParts(new Date(approx)).map(x=>[x.type,x.value]));
        const wall=Date.UTC(+q.year,+q.month-1,+q.day,(+q.hour)%24,+q.minute,+q.second);
        d.setTime(approx+(approx-wall));
      }catch(_){d.setHours(Math.floor(h),m||0,0,0);}
    }
    function tzNextDay(d,h,m){d.setTime(d.getTime()+86400000);tzSetH(d,h,m);}
  
    let total = 0;
    for (const iv of eosIntervals) {
      const start = new Date(iv.start), end = new Date(iv.end);
      if (end <= start) continue;
      const cur = new Date(start);
      // snap to first working moment
      (function snap(d){
        while(!wdSet.has(tzDay(d))){d.setTime(d.getTime()+86400000);tzSetH(d,WS,(WS%1)*60);}
        const h=tzH(d);
        if(h>=WE){tzNextDay(d,WS,(WS%1)*60);snap(d);}
        else if(h<WS) tzSetH(d,WS,(WS%1)*60);
      })(cur);
      while(cur<end){
        if(!wdSet.has(tzDay(cur))){tzNextDay(cur,WS,(WS%1)*60);continue;}
        const dayEnd=new Date(cur); tzSetH(dayEnd,WE,(WE%1)*60);
        const sliceEnd=end<dayEnd?end:dayEnd;
        const ms=Math.max(0,sliceEnd-cur);
        total+=ms;
        tzNextDay(cur,WS,(WS%1)*60);
      }
    }
    return total / 3_600_000;
  } catch(_) { return 0; }
}
function enrichTicket(t) {
  const _region    = t.slaAnalysis?.region || null;
  let hours;
  try {
    hours = t.slaAnalysis?.eosBusinessHours ?? calcBizHours(t.eosIntervals, _region) ?? 0;
  } catch(_) { hours = 0; }
  const slaCap     = t.slaAnalysis?.slaCap ?? ((t.sev === 4 ? 2 : t.sev === 5 ? 5 : 2) * 9);  // Sev4=2×9h=18h, Sev5=5×9h=45h
  const isBreached = t.slaAnalysis?.isBreached ?? (hours > slaCap);
  const hasBounce       = (t.slaAnalysis?.hasBounce) || (t.eosIntervals?.length > 1)
                          || (t.totalBounceCount > 0) || (t.slaAnalysis?.totalBounceCount > 0) || false;
  const stints          = t.slaAnalysis?.eosStints?.length || t.eosIntervals?.length || 1;
  const totalBounces    = t.totalBounceCount ?? t.slaAnalysis?.totalBounceCount ?? 0;
  const totalResolves   = t.totalResolveCount ?? t.slaAnalysis?.totalResolveCount ?? 1;
  const wasReopened     = totalResolves > 1 || (t.reopenCycles?.length > 0) || (t.slaAnalysis?.reopenCycles?.length > 0);
  const reopenCycles    = t.reopenCycles || t.slaAnalysis?.reopenCycles || [];
  const ticketCreatedAt = t.ticketCreatedAt || t.slaAnalysis?.ticketCreatedAt || null;
  const firstResolvedAt = t.firstResolvedAt || t.slaAnalysis?.firstResolvedAt || null;
  // ── Ticket lifespan: created → resolved, computed directly from JSON fields ──
  // Uses the same region/timezone as the EOS SLA calculation so hours are consistent.
  // ticketCreatedAt and resolvedDate are always present in the JSON; if resolvedDate
  // is missing the ticket is still open and we measure up to now (estimate).
  const _lsStart    = ticketCreatedAt ? new Date(ticketCreatedAt) : null;
  const _lsEnd      = t.resolvedDate  ? new Date(t.resolvedDate)
                    : t.slaAnalysis?.endMoment ? new Date(t.slaAnalysis.endMoment)
                    : null;
  const _lsIsEst    = !t.resolvedDate && !t.slaAnalysis?.endMoment;
  const _lsEndEff   = _lsEnd || new Date();  // fall back to now for open tickets
  const lifespanBizHours = (_lsStart && _lsStart < _lsEndEff)
    ? calcBizHours([{ start: _lsStart.toISOString(), end: _lsEndEff.toISOString() }], _region)
    : 0;
  const lifespanCalMs    = (_lsStart && _lsStart < _lsEndEff) ? (_lsEndEff - _lsStart) : 0;
  const lifespanCalDays  = Math.floor(lifespanCalMs / 86400000);
  const lifespanWorkDays = lifespanBizHours > 0 && _region
    ? Math.ceil(lifespanBizHours / (_region.workDayHours || 8))
    : 0;
  const lifespanIsEstimate     = _lsIsEst;
  // Lifespan vs SLA cap — same cap as EOS (Sev4=2d, Sev5=5d × region workDayHours)
  // lifespanBizHours > slaCap means the ticket took longer end-to-end than allowed
  const lifespanIsBreached     = lifespanBizHours > 0 ? lifespanBizHours > slaCap : false;
  const lifespanSlaConsumedPct = lifespanBizHours > 0 && slaCap > 0
    ? Math.min(100, (lifespanBizHours / slaCap) * 100) : 0;
  return {
    ...t,
    eosHours: hours,
    slaCap,
    isBreached,
    hasBounce,
    stints,
    totalBounces,
    totalResolves,
    wasReopened,
    reopenCycles,
    ticketCreatedAt,
    firstResolvedAt,
    lifespanBizHours,
    lifespanCalDays,
    lifespanWorkDays,
    lifespanIsEstimate,
    lifespanIsBreached,
    lifespanSlaConsumedPct,
    status: t.isResolved ? 'resolved' : 'open',
    city: t.city || t.siteCode || null,
    checkedDate:  t.resolvedDate ? t.resolvedDate.slice(0,10) : (t.slaAnalysis?.endMoment ? t.slaAnalysis.endMoment.slice(0,10) : null),
    checkedHour:  t.resolvedDate ? new Date(t.resolvedDate).getHours() : null,
    checkedDow:   t.resolvedDate ? new Date(t.resolvedDate).getDay()   : null,
    firstEosHour: t.eosIntervals?.[0]?.start ? new Date(t.eosIntervals[0].start).getHours() : null,
    firstEosDow:  t.eosIntervals?.[0]?.start ? new Date(t.eosIntervals[0].start).getDay()   : null,
    slaConsumedPct: slaCap > 0 ? Math.min(100, (hours / slaCap) * 100) : 0,
    firstEosDate:  t.eosIntervals?.[0]?.start ? t.eosIntervals[0].start.slice(0,10) : null,
    resolvedDate:  t.resolvedDate ? t.resolvedDate.slice(0,10) : (t.slaAnalysis?.endMoment ? t.slaAnalysis.endMoment.slice(0,10) : null),
    // Full resolved timestamp (ISO) + region timezone — for export with date, time and TZ
    resolvedAtFull: t.resolvedDate || t.slaAnalysis?.endMoment || null,
    regionTimezone: _region?.timezone || t.slaAnalysis?.region?.timezone || null,
  };
}
function unique(arr, key) {
  const s = new Set();
  arr.forEach(r => { const v = r[key]; if (v) s.add(v); });
  return [...s].sort();
}
function groupBy(arr, key, valFn) {
  const m = {};
  arr.forEach(r => {
    const k = r[key] || '—';
    if (!m[k]) m[k] = { count:0, total:0 };
    m[k].count++;
    m[k].total += valFn ? (valFn(r) || 0) : 1;
  });
  return Object.entries(m).sort((a,b) => b[1].count - a[1].count);
}
function initials(login) {
  if (!login) return '?';
  const p = login.split('.');
  return p.length >= 2 ? (p[0][0]+p[1][0]).toUpperCase() : login.slice(0,2).toUpperCase();
}
function badgeImg(login, size=22) {
  if (!login || login === '—') return '';
  const uid = 'fb-'+login.replace(/[^a-z0-9]/gi,'')+'-'+size;
  return `<img class="bav" width="${size}" height="${size}"
               src="${BADGE_BASE}${encodeURIComponent(login)}"
               alt="${login}" title="${login}"
               onerror="this.style.display='none';var f=document.getElementById('${uid}');if(f)f.style.display='inline-flex';"
          ><span class="bav-fb" id="${uid}" style="display:none;width:${size}px;height:${size}px;">${initials(login)}</span>`;
}
function destroyChart(ref) { if (ref) { try { ref.destroy(); } catch(e){} } }

// ── Explain modal ───────────────────────────────────────────────────────
const EXPLAIN_DATA = {
  'top-tickets': {
    tag:'BAR CHART', title:'EOS Business Hours — Top Tickets',
    body:'Shows the top 20 tickets ranked by time spent with ITVendor-EOS, in business hours. Bars are colored by severity. The red dashed line marks the SLA cap for each ticket.',
    tips:['Taller bars = more time consumed from the SLA budget.','Red dashed line = the SLA deadline (cap). Bars touching or exceeding it are breached.','Color reflects severity: green=Sev4, grey=Sev5, etc.','Hover a bar for ticket ID, time, severity, and breach status.']
  },
  'sev-dist': {
    tag:'DOUGHNUT', title:'Severity Distribution',
    body:'Shows how many tickets fall into each SIM severity level. Hover each slice to see count and percentage.',
    tips:['Sev 4 = 2-working-day SLA. Sev 5 = 5-working-day SLA.','A large Sev 4 share means tighter SLA pressure.','The centre shows total tickets in view.']
  },
  'avg-sev': {
    tag:'BAR CHART', title:'Avg EOS Hours by Severity',
    body:'Average time each severity band spends with EOS, in business hours. Useful for comparing handling efficiency between Sev4 and Sev5.',
    tips:['Lower is better — less time consumed from the SLA budget.','Compare Sev4 avg against its 18h cap and Sev5 against its 45h cap.']
  },
  'breach-sev': {
    tag:'STACKED BAR', title:'SLA Breach by Severity',
    body:'Stacked bars showing how many tickets within each severity level were breached (red) vs on track (green). Immediately identifies which severity is struggling.',
    tips:['A mostly red Sev4 bar means Sev4 tickets are routinely breaching.','Total bar height = total ticket count for that severity.','Hover for exact numbers and percentages.']
  },
  'sla-gauges': {
    tag:'GAUGES', title:'SLA Consumption Gauges',
    body:'Per-assignee gauge showing average SLA consumption as a percentage (EOS hours ÷ SLA cap). Helps spot who is close to or over the limit on average.',
    tips:['Green < 50%, Amber 50\u201380%, Red > 80% consumed.','A gauge near 100% means that assignee\'s tickets are typically close to breach.','Only assignees with at least 1 ticket are shown.']
  },
  'timeline': {
    tag:'LINE CHART', title:'EOS Activity Over Time',
    body:'Dual-axis line chart showing daily ticket volume (blue, left axis) and daily average EOS business hours (green, right axis). Reveals busy periods and whether handling time worsens under load.',
    tips:['A rising green line while blue rises = handling time is growing with volume.','Spikes in blue = high-volume days; spikes in green = complex tickets that day.','Dates are grouped by resolved date — only resolved tickets appear on this timeline.']
  },
  'heatmap': {
    tag:'HEATMAP', title:'Activity Heatmap',
    body:'Shows when tickets were resolved during working days (Mon-Fri), plotted by hour of day (columns). Uses the resolved date/time so patterns reflect actual closure activity, not ticket entry. Weekends are excluded.',
    tips:['Darker cells = more tickets resolved at that day+hour combination.','A dark mid-day peak means most resolutions happen during core hours.','Uses resolvedDate — the moment the ticket was actually closed with EOS.','Sat/Sun are hidden since they are non-working days.']
  },
  'cumulative': {
    tag:'AREA CHART', title:'Cumulative Ticket Intake',
    body:'Running total of tickets over time. The slope shows intake rate — steeper = faster intake. Useful for capacity planning.',
    tips:['A sudden steep section = a surge in ticket volume.','Flattening at the end could mean fewer tickets or a data gap.']
  },
  'assignee': {
    tag:'BAR LIST', title:'By Assignee',
    body:'Ranked list of assignees by ticket count. The blue number on the right is average EOS hours per ticket for that person.',
    tips:['A high ticket count AND high avg hours = most loaded person.','Badge photos are loaded from Amazon Phone Tool.']
  },
  'requester': {
    tag:'BAR LIST', title:'By Requester',
    body:'Ranked list of requesters (people who opened tickets) by how many tickets they have submitted.',
    tips:['Top requesters may indicate a desk or team with recurring IT issues.','No avg hours shown since requesters don\'t affect handling time.']
  },
  'workload-risk': {
    tag:'SCATTER', title:'Assignee Workload vs SLA Risk',
    body:'Each bubble is an assignee. X-axis = number of tickets (workload), Y-axis = average SLA consumption % (risk). Bigger bubbles = more total EOS hours.',
    tips:['Top-right = high workload AND high breach risk. These people need support.','Bottom-left = low workload and on-track. Capacity available.','Hover a bubble for name, ticket count, avg consumption, and total hours.']
  },
  'resolution-speed': {
    tag:'HORIZONTAL BAR', title:'Resolution Speed Ranking',
    body:'Assignees ranked by average EOS business hours, ascending (fastest first). Green = fastest, red = slowest.',
    tips:['Fastest resolvers (shortest bars) are handling tickets most efficiently.','Combine with workload chart to identify who is both fast and handling many tickets.']
  },
  'country': {
    tag:'BAR LIST', title:'Tickets by Country',
    body:'Breakdown of tickets by country. Bar length = share of total count. Right number = average EOS hours.',
    tips:['Countries with high avg hours may need additional staffing or training.']
  },
  'city': {
    tag:'BAR LIST', title:'Tickets by City',
    body:'Breakdown of tickets by city/site. Helps identify which locations generate the most IT support demand.',
    tips:['Filter to a specific country first to drill into city-level detail.']
  },
  'treemap': {
    tag:'TREEMAP', title:'Volume Treemap by Building',
    body:'Each rectangle represents a building ID. The area is proportional to ticket count. Each cell shows the top resolver\'s photo, name, and stats. Click any cell for a full breakdown of every person who resolved tickets in that building.',
    tips:['Largest cells = highest-demand buildings.','The photo and name shown is the top resolver for that building.','Click a cell → see all resolvers, their ticket counts, breach rates, and avg EOS time.','🥇 badge marks the #1 resolver for that building.']
  },
  'rootcause': {
    tag:'DOUGHNUT', title:'Root Cause Breakdown',
    body:'Distribution of root cause codes across all filtered tickets. Shows what issues are driving ticket volume.',
    tips:['Dominant root causes indicate recurring problems worth fixing at the source.','Hover slices for exact counts and percentages.']
  },
  'closure': {
    tag:'DOUGHNUT', title:'Closure Code Breakdown',
    body:'Shows how tickets are being closed — Successful, No Fix Needed, etc. Reflects resolution quality.',
    tips:['A high "Unsuccessful" rate may indicate a training or escalation gap.','Filter by severity to see if closure quality differs across Sev levels.']
  },
  'funnel': {
    tag:'FUNNEL', title:'Resolution Funnel',
    body:'A pipeline view: Total → Checked → Has EOS Entry → Resolved → No Breach. Shows where tickets drop off in the ideal resolution path.',
    tips:['A big drop between "Checked" and "Has EOS Entry" means many tickets have no audit trail.','Large drop at "Resolved" = backlog of open tickets.','Aim for "No Breach" close to 100% of "Resolved".']
  },
  'histogram': {
    tag:'HISTOGRAM', title:'EOS Hours Distribution',
    body:'Groups tickets into time buckets (0-1h, 1-2h, etc.) and shows how many tickets fall into each. Reveals whether most tickets are resolved quickly or drag on.',
    tips:['A left-skewed histogram (most bars on the left) = tickets are mostly resolved quickly.','A long tail to the right = a few tickets are consuming disproportionate time.','Hover a bar to see the exact count in that time range.']
  },
  'scatter': {
    tag:'SCATTER', title:'Hours vs SLA Cap',
    body:'Each dot is a ticket. X = SLA cap (hours), Y = actual EOS hours. Dots above the diagonal line are breached.',
    tips:['Dots above the 45° diagonal = SLA breached.','Clustering near zero = most tickets resolved well within cap.','Color indicates severity.','Hover for ticket ID, time, cap, and breach status.']
  },
  'bounce': {
    tag:'BAR CHART', title:'Bounced Tickets',
    body:'Shows tickets that were assigned to EOS more than once (bounced between Triage and EOS). Bars = number of stints per ticket.',
    tips:['1 stint = clean resolution. 2+ = ticket bounced back to Triage at least once.','High bounce count = miscommunication or wrong initial triage.','Hover for ticket ID and total EOS business hours.']
  },
  'repeat-req': {
    tag:'BAR CHART', title:'Repeat Requesters',
    body:'Top requesters ranked by number of tickets submitted. High repeat submitters may have an unresolved root cause.',
    tips:['Follow up with top submitters — their issue may not have been fully fixed.','Filter by root cause to see what type of problems they keep raising.']
  },
  'city-heat': {
    tag:'HEAT MAP', title:'City Heat Signature',
    body:'Leaflet map with a circle per city from your ticket data. Circle size and color scale with ticket count — small/blue=low, large/red=high. Click any circle to open a popup, then "View Full Details" for the full city breakdown.',
    tips:['Coordinates are embedded — no internet call needed for the map data itself.','Tile images come from OpenStreetMap (same as the Leaflet quick-start).','Click a circle → popup shows ticket count, breach count, avg EOS, and assignee photos.','Use the filters above to narrow by country or date — the map re-renders automatically.']
  },
  'coverage-map': {
    tag:'COVERAGE MAP', title:'Assignee Coverage Map',
    body:'Each city shows stacked badge photos of every assignee who worked a ticket there. Dashed polylines connect cities worked by the same assignee, following the Leaflet polyline API.',
    tips:['Polylines are drawn using L.polyline() per assignee — each person gets their own color.','Badge photos load from Amazon Phone Tool; fallback initials appear if the photo fails.','Hover a city marker tooltip to see all assignee names and ticket count.','An assignee with lines spanning many cities may be covering sites remotely.']
  },
  'table': {
    tag:'DATA TABLE', title:'All Tickets',
    body:'Sortable, paginated table showing all filtered tickets with full detail. Click any column header to sort.',
    tips:['Click a ticket ID to open it directly in SIM.','Sort by EOS hrs to find the heaviest tickets.','Export CSV to analyse in Excel or share with the team.']
  },
  'rootclosure': {
    tag:'MATRIX', title:'Root Cause × Closure Code',
    body:'A cross-tabulation heatmap. Each row is a root cause, each column a closure code. The cell value is ticket count — darker = more tickets. Reveals which root causes end in clean resolutions vs workarounds or failures.',
    tips:['Dark cells on the diagonal of "Successful" = well-matched diagnosis and fix.','Any root cause with many tickets landing in "Unsuccessful" deserves immediate attention.','The breach % overlay shows which combinations are SLA-risky.','Filter by severity to see if Sev3 tickets have a different closure pattern.']
  },
  'worklog': {
    tag:'BAR CHART', title:'Worklog Compliance',
    body:'For each assignee, shows what % of their tickets have a worklog entry. worklogFound=false means no time was logged — EOS hours may be zero or auto-estimated, making SLA data unreliable for those tickets.',
    tips:['Below 80% compliance = EOS hours for that person are suspect.','Combine with breach rate: a person with high breach + low worklog may simply not be logging, not actually breaching.','Compliance is shown as a horizontal bar with the raw counts annotated.']
  },
  'weekend': {
    tag:'BAR CHART', title:'Weekend Skip Impact',
    body:'Groups tickets by how many weekend days they bridged (0, 1, 2+). For each group shows breach rate % and avg SLA % consumed. Crossing a weekend adds calendar days without adding EOS hours, but can push tickets closer to their deadline.',
    tips:['Tickets bridging 2 weekend days have significantly higher breach rates in most environments.','Use this to justify priority handling for tickets opened on Fridays.','Regional work calendars (from slaAnalysis.region) are respected — Middle East weekends differ from EU/US.']
  },
  'lifespan': {
    tag:'LIFESPAN', title:'Total Ticket Lifespan',
    body:'Measures the full business-hours duration from ticket creation to resolution — not just EOS time. Weekends, holidays, and non-working hours are excluded using the same region/timezone rules as SLA calculations. The EOS share shows what fraction of a ticket\'s total life was spent actively with EOS.',
    tips:['A high lifespan with low EOS hours = the ticket spent most of its life in Triage or waiting — investigate queue delays.','EOS Share % close to 100% means EOS received the ticket and resolved it quickly with minimal back-and-forth.','Tickets still open show lifespan "up to now" — marked with ⚠ in the lightbox.','Use lifespan data alongside SLA breach to tell the full story: a breached ticket may have had a long pre-EOS wait.']
  },
  'calvsbiz': {
    tag:'SCATTER', title:'Calendar Time vs Business Hours',
    body:'Each dot is a ticket. X-axis = calendar span in hours (wall-clock life of the ticket). Y-axis = EOS business hours (actual work done). Dots far to the right but low on Y = tickets that sat idle for a long time. The efficiency ratio = EOS/calendar.',
    tips:['Dots hugging the diagonal line = almost all calendar time was active work time.','Dots far right / low Y = large queue or holding time in triage — ticket sat untouched.','Color = breach status. Red dots far right = late resolution, not overwork.','Hover for ticket ID, both time measures, and efficiency %.']
  },
};

function openExplain(key) {
  const d = EXPLAIN_DATA[key];
  if (!d) return;
  document.getElementById('em-tag').textContent   = d.tag;
  document.getElementById('em-title').textContent = d.title;
  document.getElementById('em-body').textContent  = d.body;
  const ul = document.getElementById('em-tips');
  ul.innerHTML = (d.tips || []).map(t => `<li>${t}</li>`).join('');
  document.getElementById('explain-backdrop').style.display = 'flex';
}
function closeExplain() {
  document.getElementById('explain-backdrop').style.display = 'none';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeCityModal();
    closeTicketModal();
    closeExplain();
  }
});
// Close button and backdrop click — use addEventListener (inline onclick blocked by extension CSP)
document.addEventListener('DOMContentLoaded', () => {
  // Explain modal close
  const closeBtn = document.getElementById('em-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeExplain);
  const backdrop = document.getElementById('explain-backdrop');
  if (backdrop) backdrop.addEventListener('click', e => { if (e.target === backdrop) closeExplain(); });
  // Ticket detail modal close
  const tmClose = document.getElementById('tm-close-btn');
  if (tmClose) tmClose.addEventListener('click', closeTicketModal);
  const tmBackdrop = document.getElementById('ticket-modal-backdrop');
  if (tmBackdrop) tmBackdrop.addEventListener('click', e => { if (e.target === tmBackdrop) closeTicketModal(); });
  const cmClose = document.getElementById('cm-close-btn');
  if (cmClose) cmClose.addEventListener('click', closeCityModal);
  const cmBackdrop = document.getElementById('city-modal-backdrop');
  if (cmBackdrop) cmBackdrop.addEventListener('click', e => { if (e.target === cmBackdrop) closeCityModal(); });
});
document.querySelectorAll('.btn-explain').forEach(btn => {
  btn.addEventListener('click', () => openExplain(btn.dataset.explain));
});

// ── File loading ──────────────────────────────────────────────────────
let _fileHandle = null;
async function loadFromHandle(handle) {
  const file = await handle.getFile();
  return JSON.parse(await file.text());
}
function openFilePicker() {
  // Single picker that accepts both JSON and Excel together
  const inp = document.createElement('input');
  inp.type     = 'file';
  inp.multiple = true;
  inp.accept   = '.json,.xlsx,.xls';
  inp.onchange = e => processFileList(Array.from(e.target.files));
  inp.click();
}
// ── Unified file processor — handles any mix of .json and .xlsx ────────
async function processFileList(files) {
  let jsonFile  = files.find(f => f.name.toLowerCase().endsWith('.json'));
  let xlsxFile  = files.find(f => /\.(xlsx|xls)$/i.test(f.name));

  // Track what we actually processed this call so the status bar is additive
  let didJson  = false;
  let didXlsx  = false;

  if (jsonFile) {
    try {
      const raw = JSON.parse(await jsonFile.text());
      initData(Array.isArray(raw) ? raw : []);
      didJson = true;
    } catch(e) {
      alert('Could not parse JSON file: ' + e.message);
    }
  }

  if (xlsxFile) {
    try {
      const buf = await xlsxFile.arrayBuffer();
      auditLoadBuffer(buf);   // sets AUDIT and renders
      didXlsx = true;
    } catch(e) {
      alert('Could not read Excel file: ' + e.message);
    }
  }

  if (!jsonFile && !xlsxFile) {
    alert('No recognised files selected.\nPlease choose a .json and/or .xlsx file.');
    return;
  }

  updateFileStatusBar(didJson, didXlsx);
}

// ── Status bar pills in topbar ─────────────────────────────────────────
function updateFileStatusBar(jsonLoaded, xlsxLoaded) {
  const bar   = document.getElementById('file-status-bar');
  const jsonP = document.getElementById('fsb-json');
  const xlsxP = document.getElementById('fsb-xlsx');
  if (!bar) return;

  bar.style.display = 'flex';

  if (jsonLoaded && jsonP) {
    jsonP.className   = 'fsb-item loaded';
    jsonP.textContent = '✅ JSON';
  }
  if (xlsxLoaded && xlsxP) {
    xlsxP.className   = 'fsb-item loaded';
    xlsxP.textContent = '✅ Audit';
  }
}

// Show status bar as soon as the app div becomes visible
(function() {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  const obs = new MutationObserver(() => {
    if (appEl.style.display !== 'none') {
      const bar = document.getElementById('file-status-bar');
      if (bar) {
        bar.style.display = 'flex';
        // Mark JSON as loaded if ALL already has data (loaded via extension)
        if (ALL.length) updateFileStatusBar(true, false);
      }
      obs.disconnect();
    }
  });
  obs.observe(appEl, { attributes:true, attributeFilter:['style'] });
})();

// Building address map — populated from settings at boot
// { 'TLV14': { id:'TLV14', address:'1 Amazon Way, Tel Aviv' }, ... }
let BUILDING_MAP = {};

async function tryLoadFromExtension() {
  return new Promise(resolve => {
    if (!chrome?.runtime?.sendMessage) return resolve(null);
    chrome.runtime.sendMessage({ action:'analytics_get_sla_data' }, res => {
      if (chrome.runtime.lastError || !res?.data) return resolve(null);
      resolve(res.data);
    });
  });
}

// Load buildings list from extension settings
function tryLoadBuildingsFromExtension() {
  if (!chrome?.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ action:'get_settings' }, res => {
    if (chrome.runtime.lastError) return;
    const buildings = res?.buildings || res?.data?.buildings || [];
    BUILDING_MAP = {};
    buildings.forEach(b => { if (b.id) BUILDING_MAP[b.id.trim()] = b; });
  });
}
async function boot() {
  tryLoadBuildingsFromExtension(); // load building addresses in background
  try {
    const data = await tryLoadFromExtension();
    if (data?.length) { initData(data); return; }
  } catch(e) {}
  document.getElementById('load-screen').style.display = 'flex';
}

// ── Data init ─────────────────────────────────────────────────────────
function initData(raw) {
  ALL = raw.map(enrichTicket).filter(t => Number.isFinite(t.eosHours) || t.eosHours === 0); // all tickets with valid eosHours, including 0
  document.getElementById('load-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  populateFilters();
  setDateInputBounds();
  applyFilters();
}

// ── Filters ───────────────────────────────────────────────────────────
function populateFilters() {
  const populate = (id, values) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  };
  populate('f-sev',       unique(ALL, 'sev').map(String));
  populate('f-assignee',  unique(ALL, 'assigneeName'));
  populate('f-requester', unique(ALL, 'requester'));
  populate('f-country',   unique(ALL, 'country'));
  populateCityOptions();
  populateBuildingOptions();
  populate('f-rootcause', unique(ALL, 'rootCause'));
  populate('f-closure',   unique(ALL, 'closureCode'));
}
// Populate the City dropdown based on the currently-selected Country.
// When no country is selected, all cities are shown.
function populateCityOptions() {
  const sel = document.getElementById('f-city');
  if (!sel) return;
  const country = document.getElementById('f-country')?.value || '';
  const scope = country ? ALL.filter(t => t.country === country) : ALL;
  const values = unique(scope, 'city');
  const cur = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  // Keep current city if still valid for the chosen country; otherwise reset to "All".
  sel.value = values.includes(cur) ? cur : '';
}
// Populate the Building dropdown based on the currently-selected City
// (and Country, if set). When no city is selected, buildings are scoped
// to the country; with neither selected, all buildings are shown.
function populateBuildingOptions() {
  const sel = document.getElementById('f-building');
  if (!sel) return;
  const country = document.getElementById('f-country')?.value || '';
  const city    = document.getElementById('f-city')?.value || '';
  let scope = ALL;
  if (country) scope = scope.filter(t => t.country === country);
  if (city)    scope = scope.filter(t => t.city === city);
  const values = unique(scope, 'buildingId');
  const cur = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  // Keep current building if still valid for the chosen city; otherwise reset to "All".
  sel.value = values.includes(cur) ? cur : '';
}
function getFilters() {
  const g = id => document.getElementById(id)?.value ?? '';
  return {
    sev:g('f-sev'), assignee:g('f-assignee'), requester:g('f-requester'),
    city:g('f-city'), country:g('f-country'), building:g('f-building'),
    rootcause:g('f-rootcause'), closure:g('f-closure'), breach:g('f-breach'),
    search:g('f-search').toLowerCase().trim(),
    dateFrom: g('f-date-from'),
    dateTo:   g('f-date-to'),
  };
}
function applyFilters() {
  const f = getFilters();
  const dateActive = !!(f.dateFrom || f.dateTo);
  FILTERED = ALL.filter(t => {
    if (f.sev       && String(t.sev)  !== f.sev)       return false;
    if (f.assignee  && t.assigneeName !== f.assignee)   return false;
    if (f.requester && t.requester    !== f.requester)  return false;
    if (f.city      && t.city         !== f.city)       return false;
    if (f.country   && t.country      !== f.country)    return false;
    if (f.building  && t.buildingId   !== f.building)   return false;
    if (f.rootcause && t.rootCause    !== f.rootcause)  return false;
    if (f.closure   && t.closureCode  !== f.closure)    return false;
    if (f.breach === 'breached'    && !t.isBreached)         return false;
    if (f.breach === 'ok'          &&  t.isBreached)         return false;
    if (f.breach === 'ls-breached' && !t.lifespanIsBreached) return false;
    if (f.breach === 'ls-ok'       &&  t.lifespanIsBreached) return false;
    // Date range filter — based on resolved date.
    // When a date range is active, tickets with no resolvedDate (open/unresolved)
    // are excluded — they have no timestamp to place in the window.
    if (dateActive) {
      if (!t.resolvedDate) return false;
      if (f.dateFrom && t.resolvedDate < f.dateFrom) return false;
      if (f.dateTo   && t.resolvedDate > f.dateTo)   return false;
    }
    if (f.search) {
      const hay = (t.shortId+' '+(t.titleText||'')+ ' '+(t.pageTitle||'')).toLowerCase();
      if (!hay.includes(f.search)) return false;
    }
    return true;
  });
  page = 1;
  // Highlight date inputs when active
  ['f-date-from','f-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = dateActive ? 'var(--accent)' : '';
  });
  render();
}

// ── Side avatar showcase — rising techs on both margins ────────────────
let _riseTimer = null;
function renderSideShow() {
  const left  = document.getElementById('side-rise-left');
  const right = document.getElementById('side-rise-right');
  if (!left || !right) return;

  const stop = () => {
    if (_riseTimer) { clearInterval(_riseTimer); _riseTimer = null; }
  };

  if (!FILTERED.length) { left.classList.remove('on'); right.classList.remove('on'); stop(); return; }

  // Show each side only when there's real empty margin there
  const main = document.getElementById('main-content');
  const rect = main ? main.getBoundingClientRect() : null;
  const leftGap  = rect ? rect.left : 0;
  const rightGap = rect ? (window.innerWidth - rect.right) : 0;
  const NEED = 250;
  const showL = leftGap  >= NEED;
  const showR = rightGap >= NEED;
  left.classList.toggle('on', showL);
  right.classList.toggle('on', showR);
  if (!showL && !showR) { stop(); return; }

  // ── Aggregate per-tech stats (cities, resolved, requests, hours, today) ──
  const cityByTech = {};
  const stat = {};   // name -> { resolved, requested, totalH, hCount, todayCount, weekH, weekCount }
  const ensure = (n) => (stat[n] = stat[n] || { resolved:0, requested:0, totalH:0, hCount:0, todayCount:0, weekH:0, weekCount:0 });

  // "Today" = the most recent resolved day present in the data
  let latestDay = '';
  FILTERED.forEach(t => { if (t.resolvedDate && t.resolvedDate > latestDay) latestDay = t.resolvedDate; });
  // "Last week" = the 7-day window ending on the latest resolved day
  let weekStart = '';
  if (latestDay) {
    const d = new Date(latestDay + 'T00:00:00');
    d.setDate(d.getDate() - 6);
    weekStart = d.toISOString().slice(0, 10);
  }

  FILTERED.forEach(t => {
    const a = t.assigneeName;
    if (a && a !== '—') {
      ensure(a);
      if (t.isResolved || (t.status && /resolv|closed|complete/i.test(t.status))) stat[a].resolved++;
      if (typeof t.eosHours === 'number' && t.eosHours > 0) {
        stat[a].totalH += t.eosHours; stat[a].hCount++;
        // last-week scoped hours (by resolved date)
        if (weekStart && t.resolvedDate && t.resolvedDate >= weekStart && t.resolvedDate <= latestDay) {
          stat[a].weekH += t.eosHours; stat[a].weekCount++;
        }
      }
      if (latestDay && t.resolvedDate === latestDay) stat[a].todayCount++;
      const city = (t.city || '').trim();
      const country = (t.country || '').trim();
      if (city) {
        if (!cityByTech[a]) cityByTech[a] = {};
        cityByTech[a][city] = { city, country };
      }
    }
    const rq = t.requester;
    if (rq && rq !== '—') { ensure(rq); stat[rq].requested++; }
  });

  // ── Determine record-holders (one winner per category) ──
  const arr = Object.entries(stat);
  const top = (sel, min=1) => {
    let best=null, bv=-Infinity;
    arr.forEach(([n,s]) => { const v=sel(s); if (v>=min && v>bv) { bv=v; best=[n,v]; } });
    return best;
  };
  const low = (sel, min=3) => {  // lowest avg hours among those with enough volume
    let best=null, bv=Infinity;
    arr.forEach(([n,s]) => { if (s.hCount>=min) { const v=sel(s); if (v<bv) { bv=v; best=[n,v]; } } });
    return best;
  };
  const mostResolved = top(s => s.resolved, 1);
  const mostRequest  = top(s => s.requested, 1);
  const mostToday    = latestDay ? top(s => s.todayCount, 1) : null;
  // Fastest avg in the last week (min 2 resolved that week); fall back to all-time
  const lowWeek = (min=2) => {
    let best=null, bv=Infinity;
    arr.forEach(([n,s]) => { if (s.weekCount>=min) { const v=s.weekH/s.weekCount; if (v<bv) { bv=v; best=[n,v]; } } });
    return best;
  };
  const fastestWeek = lowWeek(2);
  const fastestAll  = low(s => s.totalH / s.hCount, 3);
  const busiest      = top(s => s.hCount, 1);   // most tickets handled overall

  // achievements: flat list of record-holder cards
  const achList = [];
  const addAch = (rec, icon, mk, c1, c2) => {
    if (!rec) return;
    achList.push({ name: rec[0], icon, text: mk(rec[1]), c1, c2 });
  };
  addAch(mostResolved, '🏅', v => `Most resolved · ${v}`, '#1e8e3e', '#0d9488');
  addAch(mostRequest,  '📨', v => `Top requester · ${v}`, '#e8710a', '#f9ab00');
  addAch(mostToday,    '🔥', v => `Most ${latestDay?'on '+latestDay.slice(5):'today'} · ${v}`, '#d93025', '#e8710a');
  if (fastestWeek) addAch(fastestWeek, '⚡', v => `Fastest this week · ${fmtH(v)}`, '#1a73e8', '#00acc1');
  else             addAch(fastestAll,  '⚡', v => `Fastest avg · ${fmtH(v)}`, '#1a73e8', '#00acc1');
  addAch(busiest,      '💪', v => `Busiest · ${v} tickets`, '#8430ce', '#d01884');

  // Pool of techs (every assignee, with their distinct cities)
  const pool = Object.entries(cityByTech).map(([name, cm]) => ({
    name, cityList: Object.values(cm)
  }));
  // Also include techs with no city (plain avatars)
  const seen = new Set(pool.map(p => p.name));
  FILTERED.forEach(t => {
    const a = t.assigneeName;
    if (a && a !== '—' && !seen.has(a)) { seen.add(a); pool.push({ name:a, cityList:[] }); }
  });

  stop();
  left.innerHTML = ''; right.innerHTML = '';
  if (!pool.length) return;

  let _achTurn = 0;   // rotate through achievements so each one shows

  function spawn() {
    if (document.hidden) return;
    const sides = [];
    if (showL && left.childElementCount  < 4) sides.push(left);
    if (showR && right.childElementCount < 4) sides.push(right);
    if (!sides.length) return;
    const col = sides[Math.floor(Math.random()*sides.length)];

    const uid = 'rise-'+Math.random().toString(36).slice(2,8);
    const dur = 17 + Math.random()*9;                  // 17-26s slow drift
    const leftPct = 26 + Math.random()*48;             // horizontal jitter
    const node = document.createElement('div');
    node.className = 'rise-av';
    node.style.left = leftPct + '%';
    node.style.animation = `riseUp ${dur}s linear forwards`;

    // ── Decide mode FIRST. ~45% achievement (drawn straight from record-holders) ──
    const doAch = achList.length > 0 && Math.random() < 0.45;

    if (doAch) {
      // rotate through the achievement list so every category appears
      const a = achList[_achTurn % achList.length];
      _achTurn++;
      const name = a.name;
      const fbImg = (cls='') =>
        `<img class="${cls}" src="${BADGE_BASE}${encodeURIComponent(name)}" alt="${name}"
              onerror="this.style.display='none';var f=document.getElementById('${uid}');if(f)f.style.display='flex';">
         <span class="rfb ${cls}" id="${uid}" style="display:none;">${initials(name)}</span>`;
      node.style.setProperty('--ac1', a.c1);
      node.style.setProperty('--ac2', a.c2);
      node.innerHTML =
        `<div class="rise-ach">
           ${fbImg('ach')}
           <span class="rise-ach-badge">${a.icon}</span>
         </div>
         <span class="rise-lbl rise-lbl-ach" title="${name}">${a.icon} ${name}</span>
         <span class="rise-sub">${a.text}</span>`;
      col.appendChild(node);
      setTimeout(() => node.remove(), dur*1000 + 250);
      return;
    }

    // ── Otherwise a random tech: city tile or plain avatar ──
    const p = pool[Math.floor(Math.random()*pool.length)];
    const fbImg = (cls='') =>
      `<img class="${cls}" src="${BADGE_BASE}${encodeURIComponent(p.name)}" alt="${p.name}"
            onerror="this.style.display='none';var f=document.getElementById('${uid}');if(f)f.style.display='flex';">
       <span class="rfb ${cls}" id="${uid}" style="display:none;">${initials(p.name)}</span>`;

    if (p.cityList.length > 0) {
      const pick = p.cityList[Math.floor(Math.random()*p.cityList.length)];
      const nCities = p.cityList.length;
      const lbl = nCities > 1
        ? `${p.name} · ${pick.city} +${nCities-1}`
        : `${p.name} · ${pick.city}`;
      const tileId = 'tile-'+uid;
      node.innerHTML =
        `<div class="rise-map" id="${tileId}">
           <div class="rise-av-inner">${fbImg()}</div>
         </div>
         <span class="rise-lbl" title="${p.name} — ${nCities} ${nCities===1?'city':'cities'}">${lbl}</span>`;
      col.appendChild(node);
      try {
        _citySnap(pick.city, pick.country, (url) => {
          const tile = document.getElementById(tileId);
          if (tile && url) tile.style.backgroundImage = `url('${url}')`;
        });
      } catch(e) {}
    } else {
      node.innerHTML =
        `${fbImg()}
         <span class="rise-lbl">${p.name}</span>`;
      col.appendChild(node);
    }
    setTimeout(() => node.remove(), dur*1000 + 250);
  }

  spawn();
  setTimeout(spawn, 1500);                              // stagger the two columns
  _riseTimer = setInterval(spawn, 3800);                // a new one every ~4s
}

function render() {
  renderTopbar();
  renderStats();
  renderBarChart();
  renderSevCharts();
  renderBreachBySev();
  renderSlaGauges();
  renderTimeline();
  renderHeatmap();
  renderCumulative();
  renderGroupBars('city-bars',      FILTERED, 'city',         t => t.eosHours, PALETTE[0]);
  renderGroupBars('country-bars',   FILTERED, 'country',      t => t.eosHours, PALETTE[5]);
  renderGroupBars('assignee-bars',  FILTERED, 'assigneeName', t => t.eosHours, PALETTE[0], true);
  renderGroupBars('requester-bars', FILTERED, 'requester',    null,             PALETTE[1], true);
  updateBadge('assignee-count-badge',  groupBy(FILTERED,'assigneeName').length  + ' people');
  updateBadge('requester-count-badge', groupBy(FILTERED,'requester').length     + ' people');
  renderDoughnut('chart-rootcause', groupBy(FILTERED,'rootCause'),    'Root Cause');
  renderDoughnut('chart-closure',   groupBy(FILTERED,'closureCode'), 'Closure');
  renderTreemap();
  renderFunnel();
  renderHistogram();
  renderScatter();
  renderWorkloadRisk();
  renderResolutionSpeed();
  renderBounce();
  renderRepeatReq();
  renderLeafletMaps();
  renderRootClosureMatrix();
  renderWeekendImpact();
  renderLifespan();
  renderTable();
  renderSideShow();
}
function updateBadge(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

// ── Topbar ────────────────────────────────────────────────────────────
function renderTopbar() {
  const f = getFilters();
  const dateActive = !!(f.dateFrom || f.dateTo);
  document.getElementById('tb-total').textContent    = ALL.length;
  document.getElementById('tb-filtered').textContent = FILTERED.length;
  document.getElementById('tb-breached').textContent = FILTERED.filter(t => t.isBreached).length;
  const _tbLsBrch = document.getElementById('tb-ls-breached');
  if (_tbLsBrch) _tbLsBrch.textContent = FILTERED.filter(t => t.lifespanIsBreached).length;
  // Show/hide date-active notice in topbar if element exists
  let notice = document.getElementById('tb-date-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'tb-date-notice';
    notice.style.cssText = 'font-size:9px;color:var(--accent);font-family:var(--mono);font-weight:700;letter-spacing:.04em;white-space:nowrap;background:var(--accent-lt);border:1px solid rgba(26,115,232,.25);border-radius:5px;padding:2px 8px;';
    const tStats = document.querySelector('.t-stats');
    if (tStats) tStats.appendChild(notice);
  }
  if (dateActive) {
    const from = f.dateFrom || '…';
    const to   = f.dateTo   || '…';
    notice.textContent = `📅 ${from} → ${to} · open tickets excluded`;
    notice.style.display = 'inline-block';
  } else {
    notice.style.display = 'none';
  }
}

// ── Stats strip ───────────────────────────────────────────────────────
function renderStats() {
  const strip   = document.getElementById('stat-strip');
  const hrs     = FILTERED.map(t => t.eosHours).filter(h => h > 0);
  const avg     = hrs.length ? hrs.reduce((a,b)=>a+b,0)/hrs.length : 0;
  const max     = hrs.length ? Math.max(...hrs) : 0;
  const median  = (() => { if (!hrs.length) return 0; const s=[...hrs].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; })();
  const resolved = FILTERED.filter(t => t.status === 'resolved').length;
  const breached = FILTERED.filter(t => t.isBreached).length;
  const bounced  = FILTERED.filter(t => t.hasBounce).length;
  const cities   = new Set(FILTERED.map(t => t.city).filter(Boolean)).size;
  const pct = n  => FILTERED.length ? Math.round(n/FILTERED.length*100) : 0;
  // Lifespan stats (tickets with lifespan data only)
  const lsHrs    = FILTERED.map(t => t.lifespanBizHours).filter(h => h > 0);
  const lsAvg    = lsHrs.length ? lsHrs.reduce((a,b)=>a+b,0)/lsHrs.length : 0;
  const lsMedian = (() => { if (!lsHrs.length) return 0; const s=[...lsHrs].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; })();

  const f2 = getFilters();
  const dateActive2 = !!(f2.dateFrom || f2.dateTo);
  const totalSub = dateActive2
    ? `resolved only · ${ALL.length} total loaded`
    : `of ${ALL.length} loaded`;
  const cards = [
    { val:FILTERED.length, lbl:'Total Tickets',   sub:totalSub,                        ca:'#1a73e8', cb:'#4285f4', icon:'🎟' },
    { val:fmtH(avg),       lbl:'Avg EOS Time',    sub:'per ticket (biz hrs)',           ca:'#1e8e3e', cb:'#34a853', icon:'⏱' },
    { val:fmtH(median),    lbl:'Median EOS Time', sub:'middle value (biz hrs)',         ca:'#00acc1', cb:'#26c6da', icon:'📐' },
    { val:fmtH(max),       lbl:'Max EOS Time',    sub:'single ticket',                  ca:'#f9ab00', cb:'#fbbc04', icon:'🏆' },
    { val:resolved,        lbl:'Resolved',         sub:`${pct(resolved)}% resolution`,  ca:'#0d9488', cb:'#1e8e3e', icon:'✅' },
    { val:breached,        lbl:'EOS Breached',     sub:`${pct(breached)}% of tickets`, ca:'#d93025', cb:'#ea4335', icon:'🚨' },
    { val:FILTERED.filter(t=>t.lifespanIsBreached).length, lbl:'Lifespan Breached', sub:`${pct(FILTERED.filter(t=>t.lifespanIsBreached).length)}% by full lifetime`, ca:'#e8710a', cb:'#fa903e', icon:'🕐' },
    { val:bounced,         lbl:'Bounced',          sub:`${pct(bounced)}% had re-entry`, ca:'#8430ce', cb:'#a142f4', icon:'🏓' },
    { val:FILTERED.filter(t=>t.wasReopened).length, lbl:'Re-opened', sub:`${pct(FILTERED.filter(t=>t.wasReopened).length)}% resolved 2+ times`, ca:'#e8710a', cb:'#f9ab00', icon:'🔄' },
    { val:fmtH(lsAvg),    lbl:'Avg Lifespan',    sub:'created→resolved (biz hrs)',     ca:'#4285f4', cb:'#669df6', icon:'📅' },
    { val:fmtH(lsMedian), lbl:'Median Lifespan', sub:'total ticket life (biz hrs)',     ca:'#8430ce', cb:'#b260f0', icon:'⌛' },
  ];
  strip.innerHTML = cards.map(c => `
    <div class="sc" style="--ca:${c.ca};--cb:${c.cb};">
      <div class="sc-icon">${c.icon}</div>
      <div class="sc-val">${c.val}</div>
      <div class="sc-lbl">${c.lbl}</div>
      <div class="sc-sub">${c.sub}</div>
    </div>`).join('');
}

// ── Bar chart: top tickets ─────────────────────────────────────────────
function renderBarChart() {
  const top = [...FILTERED].sort((a,b)=>b.eosHours-a.eosHours).slice(0,20);
  const sub = document.getElementById('bar-sub');
  if (sub) sub.textContent = `top ${top.length} tickets`;
  const labels = top.map(t => t.shortId);
  const data   = top.map(t => +t.eosHours.toFixed(2));
  const colors = top.map(t => SEV_COLOR[t.sev] || '#94a3b8');
  const caps   = top.map(t => t.slaCap);
  destroyChart(chartBar);
  chartBar = new Chart(document.getElementById('chart-bar').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[
      { label:'EOS hrs', data, backgroundColor:colors.map(c=>c+'33'), borderColor:colors, borderWidth:2, borderRadius:5, borderSkipped:false },
      { label:'SLA Cap', data:caps, type:'line', borderColor:'#d93025', borderWidth:1.8, borderDash:[5,4], pointRadius:0, fill:false, tension:0, yAxisID:'y' },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:true, labels:{ color:'#3c4043', font:{ size:11 } } },
        tooltip:{ callbacks:{
          title:ctx=>ctx[0]?.label,
          label:ctx=>{
            if (ctx.dataset.label==='SLA Cap') return `  SLA Cap: ${fmtH(ctx.raw)}`;
            const t=top[ctx.dataIndex];
            const pct = t?.slaCap>0 ? Math.round(t.eosHours/t.slaCap*100) : 0;
            return [`  EOS Time: ${fmtH(ctx.raw)}`,`  SLA Cap: ${fmtH(t?.slaCap)} (${pct}% used)`,`  Sev: ${t?.sev??'?'}`,`  ${t?.isBreached?'🚨 BREACHED':'✅ On Track'}`,`  Assignee: ${t?.assigneeName||'—'}`,`  City: ${t?.city||'—'}`];
          },
        }},
      },
      scales:{
        x:{ grid:{ color:'rgba(0,0,0,0.05)' }, ticks:{ color:'#5f6368', font:{ size:10, family:"'DM Mono',monospace" }, maxRotation:45 } },
        y:{ grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 }, callback:v=>fmtH(v) } },
      },
    },
  });
}

// ── Sev doughnut + avg bar ─────────────────────────────────────────────
function renderSevCharts() {
  const sevs   = [1,2,3,4,5];
  const counts = sevs.map(s=>FILTERED.filter(t=>t.sev===s).length);
  const avgs   = sevs.map(s=>{ const g=FILTERED.filter(t=>t.sev===s&&t.eosHours>0); return g.length?g.reduce((a,b)=>a+b.eosHours,0)/g.length:0; });
  const colors = sevs.map(s=>SEV_COLOR[s]);
  const bgs    = colors.map(c=>c+'28');
  destroyChart(chartSevPie);
  chartSevPie = new Chart(document.getElementById('chart-sev-pie').getContext('2d'), {
    type:'doughnut',
    data:{ labels:sevs.map(s=>`Sev ${s}`), datasets:[{ data:counts, backgroundColor:colors.map(c=>c+'cc'), borderColor:colors, borderWidth:2, hoverOffset:6 }] },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{
        legend:{ position:'right', labels:{ color:'#3c4043', font:{ size:12 }, padding:12 } },
        tooltip:{ callbacks:{ label:ctx=>{ const total=ctx.dataset.data.reduce((a,b)=>a+b,0); const pct=total>0?((ctx.parsed/total)*100).toFixed(1):'0.0'; return `  ${ctx.label}: ${ctx.parsed} tickets (${pct}%)`; } } },
      },
    },
  });
  destroyChart(chartSevBar);
  chartSevBar = new Chart(document.getElementById('chart-sev-bar').getContext('2d'), {
    type:'bar',
    data:{ labels:sevs.map(s=>`Sev ${s}`), datasets:[{ label:'Avg EOS hrs', data:avgs.map(v=>+v.toFixed(2)), backgroundColor:bgs, borderColor:colors, borderWidth:2, borderRadius:6, borderSkipped:false }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label:ctx=>{ const sev=sevs[ctx.dataIndex]; const cap=(sev===4?18:sev===5?45:18); return [`  Avg EOS: ${fmtH(ctx.raw)}`,`  SLA Cap: ${fmtH(cap)}`,`  Consumed: ${cap>0?Math.round(ctx.raw/cap*100):0}% on avg`]; } } },
      },
      scales:{
        x:{ grid:{ color:'rgba(0,0,0,0.05)' }, ticks:{ color:'#5f6368', font:{ size:11 } } },
        y:{ grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 }, callback:v=>fmtH(v) } },
      },
    },
  });
}

// ── Breach stacked bar ─────────────────────────────────────────────────
function renderBreachBySev() {
  const sevs    = [1,2,3,4,5];
  const breached = sevs.map(s=>FILTERED.filter(t=>t.sev===s&&t.isBreached).length);
  const ok       = sevs.map(s=>FILTERED.filter(t=>t.sev===s&&!t.isBreached).length);
  destroyChart(chartBreachSev);
  chartBreachSev = new Chart(document.getElementById('chart-breach-sev').getContext('2d'), {
    type:'bar',
    data:{ labels:sevs.map(s=>`Sev ${s}`), datasets:[
      { label:'On Track', data:ok,       backgroundColor:'#1e8e3e33', borderColor:'#1e8e3e', borderWidth:2, borderRadius:{topLeft:0,topRight:0,bottomLeft:5,bottomRight:5}, borderSkipped:false },
      { label:'Breached', data:breached, backgroundColor:'#d9302533', borderColor:'#d93025', borderWidth:2, borderRadius:{topLeft:5,topRight:5,bottomLeft:0,bottomRight:0}, borderSkipped:false },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:true, labels:{ color:'#3c4043', font:{ size:11 } } },
        tooltip:{ callbacks:{
          title:ctx=>ctx[0]?.label,
          label:ctx=>{ const i=sevs.indexOf(+ctx.label.replace('Sev ','')); const total=(ok[i]||0)+(breached[i]||0); const pct=total>0?((ctx.parsed.y/total)*100).toFixed(0):0; return `  ${ctx.dataset.label}: ${ctx.parsed.y} (${pct}%)`; },
        }},
      },
      scales:{
        x:{ stacked:true, grid:{ color:'rgba(0,0,0,0.05)' }, ticks:{ color:'#5f6368', font:{ size:11 } } },
        y:{ stacked:true, grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 } } },
      },
    },
  });
}

// ── SLA Consumption Gauges (per assignee) ──────────────────────────────
function renderSlaGauges() {
  const el = document.getElementById('sla-gauges');
  if (!el) return;
  const byAssignee = groupBy(FILTERED, 'assigneeName', null);
  const rows = byAssignee.slice(0, 12).map(([k]) => {
    const tickets = FILTERED.filter(t => (t.assigneeName||'—') === k);
    const avgPct  = tickets.length ? tickets.reduce((a,t)=>a+t.slaConsumedPct,0)/tickets.length : 0;
    const color   = avgPct >= 80 ? '#d93025' : avgPct >= 50 ? '#f9ab00' : '#1e8e3e';
    return { k, tickets:tickets.length, avgPct, color };
  });
  if (!rows.length) { el.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px 0;">No data</div>'; return; }
  el.innerHTML = '<div class="gauge-row">' + rows.map(r => `
    <div class="gauge-item">
      <div class="gauge-top">
        <span class="gauge-lbl" title="${r.k}">${r.k === '—' ? 'Unassigned' : r.k}</span>
        <span class="gauge-val" style="color:${r.color};">${Math.round(r.avgPct)}%</span>
      </div>
      <div class="gauge-track"><div class="gauge-fill" style="width:${Math.min(100,r.avgPct)}%;background:${r.color};"></div></div>
      <div class="gauge-sub">${r.tickets} ticket${r.tickets!==1?'s':''} · avg SLA consumed</div>
    </div>`).join('') + '</div>';
}

// ── Timeline ───────────────────────────────────────────────────────────
function renderTimeline() {
  const byDate = {};
  FILTERED.forEach(t => {
    const d = t.resolvedDate; if (!d) return;  // resolved date only
    if (!byDate[d]) byDate[d] = { count:0, totalH:0 };
    byDate[d].count++; byDate[d].totalH += t.eosHours;
  });
  const dates  = Object.keys(byDate).sort();
  const counts = dates.map(d=>byDate[d].count);
  const avgs   = dates.map(d=>byDate[d].count ? +(byDate[d].totalH/byDate[d].count).toFixed(2) : 0);
  destroyChart(chartTimeline);
  chartTimeline = new Chart(document.getElementById('chart-timeline').getContext('2d'), {
    type:'line',
    data:{ labels:dates, datasets:[
      { label:'Tickets Resolved', data:counts, yAxisID:'y1', borderColor:'#1a73e8', backgroundColor:'rgba(26,115,232,0.08)', fill:true, tension:0.4, pointRadius:4, pointHoverRadius:7, pointBackgroundColor:'#1a73e8', borderWidth:2.5 },
      { label:'Avg EOS hrs',     data:avgs,   yAxisID:'y2', borderColor:'#1e8e3e', backgroundColor:'transparent', tension:0.4, pointRadius:4, pointHoverRadius:7, pointBackgroundColor:'#1e8e3e', borderWidth:2.5 },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ labels:{ color:'#3c4043', font:{ size:12 } } },
        tooltip:{ callbacks:{ label:ctx=>ctx.dataset.yAxisID==='y2'?`  Avg EOS: ${fmtH(ctx.raw)}`:`  Tickets: ${ctx.raw}` } },
      },
      scales:{
        x:{ grid:{ color:'rgba(0,0,0,0.05)', drawBorder:false }, ticks:{ color:'#5f6368', font:{ size:10 }, maxRotation:30 } },
        y1:{ position:'left',  grid:{ color:'rgba(0,0,0,0.06)', drawBorder:false }, ticks:{ color:'#1a73e8', font:{ size:11 } }, title:{ display:true, text:'Tickets', color:'#1a73e8', font:{ size:11 } } },
        y2:{ position:'right', grid:{ display:false },            ticks:{ color:'#1e8e3e', font:{ size:11 }, callback:v=>fmtH(v) }, title:{ display:true, text:'Avg EOS hrs', color:'#1e8e3e', font:{ size:11 } } },
      },
    },
  });
}

// ── Heatmap: day × hour  (uses RESOLVED date, rich tooltip) ──────────
function renderHeatmap() {
  const el = document.getElementById('heatmap-container');
  if (!el) return;
  const WORK_DAYS = [
    { label:'Mon', dow:1 },
    { label:'Tue', dow:2 },
    { label:'Wed', dow:3 },
    { label:'Thu', dow:4 },
    { label:'Fri', dow:5 },
  ];

  // Build grid[row][hour] and store which tickets are in each cell
  const grid     = Array.from({length:5}, ()=>new Array(24).fill(0));
  const gridData = Array.from({length:5}, ()=>Array.from({length:24}, ()=>[]));

  FILTERED.forEach(t => {
    const iso = t.resolvedDate;
    if (!iso) return;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return;
    const dow  = d.getDay();
    const hour = d.getHours();
    const rowIdx = WORK_DAYS.findIndex(wd => wd.dow === dow);
    if (rowIdx === -1) return;
    grid[rowIdx][hour]++;
    gridData[rowIdx][hour].push(t);
  });

  const maxVal  = Math.max(1, ...grid.flat());
  const totalR  = FILTERED.filter(t=>t.resolvedDate).length;

  // Find peak cell
  let peakRow=0, peakHour=0, peakV=0;
  grid.forEach((row, ri) => row.forEach((v,h) => { if(v>peakV){peakV=v;peakRow=ri;peakHour=h;} }));

  // Per-hour totals
  const hourTotals = new Array(24).fill(0);
  grid.forEach(row => row.forEach((v,h)=>{ hourTotals[h]+=v; }));
  const peakHourIdx = hourTotals.indexOf(Math.max(...hourTotals));

  // Per-day totals
  const dayTotals = grid.map(row=>row.reduce((a,b)=>a+b,0));
  const peakDayIdx = dayTotals.indexOf(Math.max(...dayTotals));

  const cellSize = 18, gap = 3;
  const labelW   = 32, topPad = 22;
  const W = labelW + 24*(cellSize+gap);
  const H = topPad + 5*(cellSize+gap);

  // Tooltip element (shared, positioned absolutely)
  const tooltipId = 'hm-tooltip';

  let html = `
  <div style="overflow-x:auto;padding:8px 4px 6px;">
    <div id="hm-wrap" style="position:relative;width:${W}px;height:${H}px;font-family:var(--mono);">`;

  // Hour labels
  [0,3,6,9,12,15,18,21,23].forEach(h => {
    html += `<span style="position:absolute;top:4px;left:${labelW+h*(cellSize+gap)}px;font-size:8px;color:var(--text3);pointer-events:none;">${String(h).padStart(2,'0')}</span>`;
  });

  WORK_DAYS.forEach(({label}, rowIdx) => {
    const y = topPad + rowIdx*(cellSize+gap);
    html += `<span style="position:absolute;top:${y+3}px;left:0;font-size:9px;color:var(--text3);width:${labelW-4}px;text-align:right;font-weight:600;pointer-events:none;">${label}</span>`;
    for (let h=0; h<24; h++) {
      const v     = grid[rowIdx][h];
      const pct   = v / maxVal;
      const alpha = v === 0 ? 0.06 : 0.12 + pct * 0.82;
      const x     = labelW + h*(cellSize+gap);
      const isPeak = (rowIdx===peakRow && h===peakHour);
      const cellTickets = gridData[rowIdx][h];
      const breachCount = cellTickets.filter(t=>t.isBreached).length;
      const breachPct   = v > 0 ? Math.round(breachCount/v*100) : 0;
      const ofTotal     = totalR > 0 ? ((v/totalR)*100).toFixed(1) : '0';
      // data attrs for tooltip
      html += `<div class="hm-cell"
        data-v="${v}" data-day="${label}" data-hour="${h}"
        data-breach="${breachCount}" data-bpct="${breachPct}" data-pct="${ofTotal}" data-ri="${rowIdx}"
        data-peakv="${peakV}" data-total="${totalR}"
        style="position:absolute;left:${x}px;top:${y}px;width:${cellSize}px;height:${cellSize}px;
          border-radius:3px;background:rgba(26,115,232,${alpha.toFixed(2)});cursor:pointer;
          transition:filter .1s,transform .1s;
          ${isPeak ? 'box-shadow:0 0 0 2px #1a73e8,0 0 8px rgba(26,115,232,.5);' : ''}">
      </div>`;
    }
  });

  html += `</div>
  </div>
  <!-- Analysis summary -->
  <div style="margin-top:6px;padding:0 4px;">
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      <div style="background:var(--accent-lt);border:1px solid rgba(26,115,232,.2);border-radius:8px;padding:7px 10px;flex:1;min-width:100px;">
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono);margin-bottom:2px;">PEAK DAY</div>
        <div style="font-size:12px;font-weight:800;color:var(--accent);">${WORK_DAYS[peakDayIdx]?.label}</div>
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono);">${dayTotals[peakDayIdx]} resolved</div>
      </div>
      <div style="background:var(--accent-lt);border:1px solid rgba(26,115,232,.2);border-radius:8px;padding:7px 10px;flex:1;min-width:100px;">
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono);margin-bottom:2px;">PEAK HOUR</div>
        <div style="font-size:12px;font-weight:800;color:var(--accent);">${String(peakHourIdx).padStart(2,'0')}:00</div>
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono);">${hourTotals[peakHourIdx]} resolved</div>
      </div>
      <div style="background:var(--warn-lt);border:1px solid rgba(249,171,0,.2);border-radius:8px;padding:7px 10px;flex:1;min-width:100px;">
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono);margin-bottom:2px;">PEAK CELL</div>
        <div style="font-size:12px;font-weight:800;color:var(--warn);">${WORK_DAYS[peakRow]?.label} ${String(peakHour).padStart(2,'0')}h</div>
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono);">${peakV} tickets</div>
      </div>
    </div>
  </div>`;

  el.innerHTML = html;

  // Floating tooltip lives on <body> (NOT inside the .card) — a .card:hover
  // transform creates a stacking context that would trap the tooltip's z-index
  // inside the card, putting it behind sibling content.
  if (!document.getElementById(tooltipId)) {
    const tEl = document.createElement('div');
    tEl.id = tooltipId;
    tEl.style.cssText = 'display:none;position:fixed;z-index:99999;pointer-events:none;'
      + 'background:rgba(15,22,41,.95);color:#fff;border-radius:10px;padding:10px 13px;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,.35);border:1px solid rgba(26,115,232,.35);'
      + "font-family:'DM Sans',-apple-system,sans-serif;min-width:170px;max-width:220px;";
    document.body.appendChild(tEl);
  }

  // Wire tooltip on cells. Bind ONCE on the persistent container (#heatmap-container),
  // and read all state from the cell's data attributes so the handler never closes
  // over render-scoped variables (which would go stale on the next re-render).
  if (!el._hmTipWired) {
    el._hmTipWired = true;

    const hideTip = () => { const t = document.getElementById(tooltipId); if (t) t.style.display = 'none'; };

    el.addEventListener('mousemove', function(e) {
      const tip = document.getElementById(tooltipId);
      if (!tip) return;
      const cell = e.target.closest('.hm-cell');
      if (!cell) { tip.style.display = 'none'; return; }

      const v      = +cell.dataset.v;
      const day    = cell.dataset.day;
      const hour   = +cell.dataset.hour;
      const breach = +cell.dataset.breach;
      const bpct   = +cell.dataset.bpct;
      const ofTot  = cell.dataset.pct;
      const peak   = +cell.dataset.peakv || 1;
      const tot    = +cell.dataset.total || 0;
      const bColor = bpct >= 50 ? '#f87171' : bpct >= 20 ? '#fbbf24' : '#34d399';
      const intensity = v === 0 ? 'No activity' : v >= peak * 0.8 ? '🔥 Peak activity' : v >= peak * 0.5 ? '⬆ High activity' : v >= peak * 0.25 ? '◾ Moderate' : '◽ Light activity';
      const hourLabel = `${String(hour).padStart(2,'0')}:00-${String(hour+1).padStart(2,'0')}:00`;

      tip.innerHTML =
        `<div style="font-size:12px;font-weight:800;margin-bottom:6px;color:#fff;">${day} · ${hourLabel}</div>`
        + `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">`
        +   `<span style="font-size:11px;color:#c8cde0;">Resolved</span>`
        +   `<span style="font-size:13px;font-weight:800;color:#5b7fff;">${v}</span>`
        + `</div>`
        + (tot > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">`
        +   `<span style="font-size:11px;color:#c8cde0;">% of total</span>`
        +   `<span style="font-size:11px;font-weight:700;color:#c8cde0;">${ofTot}%</span>`
        + `</div>` : '')
        + (v > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;">`
        +   `<span style="font-size:11px;color:#c8cde0;">Breached</span>`
        +   `<span style="font-size:11px;font-weight:700;color:${bColor};">${breach} (${bpct}%)</span>`
        + `</div>` : '')
        + `<div style="height:4px;background:rgba(255,255,255,.12);border-radius:3px;margin-bottom:6px;">`
        +   `<div style="height:100%;width:${tot>0?Math.round(v/tot*100*4):0}%;max-width:100%;background:#5b7fff;border-radius:3px;"></div>`
        + `</div>`
        + `<div style="font-size:10px;color:#7a86a6;font-style:italic;">${intensity}</div>`;

      const tx = Math.min(e.clientX + 14, window.innerWidth - 240);
      const ty = Math.min(e.clientY - 10, window.innerHeight - 160);
      tip.style.left  = tx + 'px';
      tip.style.top   = ty + 'px';
      tip.style.display = 'block';
    });

    el.addEventListener('mouseleave', hideTip);
    document.addEventListener('scroll', hideTip, { passive:true });
  }
}


// ── Cumulative intake ──────────────────────────────────────────────────
function renderCumulative() {
  const byDate = {};
  FILTERED.forEach(t => { const d=t.resolvedDate; if (!d) return; byDate[d]=(byDate[d]||0)+1; });  // resolved date only
  const dates  = Object.keys(byDate).sort();
  let running  = 0;
  const cumul  = dates.map(d=>{ running+=byDate[d]; return running; });
  destroyChart(chartCumulative);
  chartCumulative = new Chart(document.getElementById('chart-cumulative').getContext('2d'), {
    type:'line',
    data:{ labels:dates, datasets:[{
      label:'Cumulative Tickets', data:cumul,
      borderColor:'#00acc1', backgroundColor:'rgba(8,145,178,0.1)', fill:true,
      tension:0.3, pointRadius:3, pointHoverRadius:6, borderWidth:2.5,
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label:ctx=>`  Total so far: ${ctx.raw} tickets` } },
      },
      scales:{
        x:{ grid:{ color:'rgba(0,0,0,0.05)' }, ticks:{ color:'#5f6368', font:{ size:10 }, maxRotation:30 } },
        y:{ grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#00acc1', font:{ size:11 } } },
      },
    },
  });
}

// ── Workload vs SLA Risk (bubble/scatter per assignee) ─────────────────
function renderWorkloadRisk() {
  const ag = groupBy(FILTERED, 'assigneeName', null);
  const points = ag.slice(0, 15).map(([k]) => {
    const tickets = FILTERED.filter(t=>(t.assigneeName||'—')===k);
    const avgPct  = tickets.reduce((a,t)=>a+t.slaConsumedPct,0)/tickets.length;
    const totalH  = tickets.reduce((a,t)=>a+t.eosHours,0);
    return { x:tickets.length, y:+avgPct.toFixed(1), r:Math.max(5, Math.min(28, totalH/2)), label:k, count:tickets.length, totalH };
  });
  const colors = points.map(p => p.y>=80?'#d93025':p.y>=50?'#f9ab00':'#1e8e3e');
  destroyChart(chartWorkloadRisk);
  chartWorkloadRisk = new Chart(document.getElementById('chart-workload-risk').getContext('2d'), {
    type:'bubble',
    data:{ datasets:[{ label:'Assignees', data:points, backgroundColor:colors.map(c=>c+'55'), borderColor:colors, borderWidth:2 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label:ctx=>{ const p=points[ctx.dataIndex]; return [`  ${p.label===('—')?'Unassigned':p.label}`,`  Tickets: ${p.count}`,`  Avg SLA consumed: ${Math.round(p.y)}%`,`  Total EOS hrs: ${fmtH(p.totalH)}`]; } } },
      },
      scales:{
        x:{ title:{ display:true, text:'Ticket Count (Workload)', color:'#3c4043', font:{ size:11 } }, grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 } } },
        y:{ title:{ display:true, text:'Avg SLA Consumed %', color:'#3c4043', font:{ size:11 } }, min:0, max:100, grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 }, callback:v=>v+'%' } },
      },
    },
  });
}

// ── Resolution Speed (horizontal bar, fastest first) ───────────────────
function renderResolutionSpeed() {
  const ag = groupBy(FILTERED, 'assigneeName', null);
  const rows = ag.map(([k]) => {
    const tickets = FILTERED.filter(t=>(t.assigneeName||'—')===k&&t.eosHours>0);
    const avg = tickets.length ? tickets.reduce((a,t)=>a+t.eosHours,0)/tickets.length : 0;
    return { k, avg, count:tickets.length };
  }).filter(r=>r.count>0).sort((a,b)=>a.avg-b.avg).slice(0,10);
  const maxH = Math.max(...rows.map(r=>r.avg), 1);
  const colors = rows.map((_,i)=>{
    const t = i/(rows.length-1||1);
    const r = Math.round(34  + t*(239-34));
    const g = Math.round(197 + t*(68-197));
    const b = Math.round(94  + t*(68-94));
    return `rgb(${r},${g},${b})`;
  });
  destroyChart(chartResolutionSpeed);
  chartResolutionSpeed = new Chart(document.getElementById('chart-resolution-speed').getContext('2d'), {
    type:'bar',
    data:{
      labels:rows.map(r=>r.k==='—'?'Unassigned':r.k),
      datasets:[{ label:'Avg EOS hrs', data:rows.map(r=>+r.avg.toFixed(2)), backgroundColor:colors.map(c=>c.replace(')',',0.2)').replace('rgb','rgba')), borderColor:colors, borderWidth:2, borderRadius:5, borderSkipped:false }],
    },
    options:{
      indexAxis:'y',
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label:ctx=>{ const r=rows[ctx.dataIndex]; return [`  Avg EOS: ${fmtH(ctx.raw)}`,`  Tickets: ${r.count}`]; } } },
      },
      scales:{
        x:{ grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 }, callback:v=>fmtH(v) } },
        y:{ grid:{ display:false }, ticks:{ color:'#3c4043', font:{ size:11, family:"'DM Mono',monospace" } } },
      },
    },
  });
}

// ── Group bar lists ────────────────────────────────────────────────────
function renderGroupBars(containerId, data, groupKey, valFn, color, showBadge=false) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const groups = groupBy(data, groupKey, valFn);
  if (!groups.length) { el.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px 0;">No data</div>'; return; }
  const maxCount = Math.max(...groups.map(([,v])=>v.count));
  const top = groups.slice(0,14);
  el.innerHTML = '<div class="bar-list">'+top.map(([k,v])=>{
    const pct = Math.round(v.count/maxCount*100);
    const avg = valFn&&v.count>0 ? fmtH(v.total/v.count) : null;
    const avatarHtml = showBadge&&k!=='—' ? badgeImg(k,22) : '';
    return `<div class="bar-row">
      <div class="bl-label">${avatarHtml}<span class="bl-text" title="${k}">${k}</span></div>
      <div class="bl-track"><div class="bl-fill" style="width:${pct}%;background:${color};opacity:0.85;"></div></div>
      <div class="bl-count">${v.count}</div>
      ${avg?`<div class="bl-avg">${avg}</div>`:''}
    </div>`;
  }).join('')+'</div>';
}

// ── Doughnut (root cause / closure) ───────────────────────────────────
function renderDoughnut(canvasId, groups, label) {
  const top    = groups.slice(0,10);
  const labels = top.map(([k])=>k||'—');
  const data   = top.map(([,v])=>v.count);
  const colors = top.map((_,i)=>PALETTE[i%PALETTE.length]);
  const key    = '_chart_'+canvasId;
  if (window[key]) window[key].destroy();
  window[key] = new Chart(document.getElementById(canvasId).getContext('2d'), {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:colors.map(c=>c+'33'), borderColor:colors, borderWidth:2, hoverOffset:6 }] },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'60%',
      plugins:{
        legend:{ position:'right', labels:{ color:'#3c4043', font:{ size:11 }, padding:10 } },
        tooltip:{ callbacks:{ label:ctx=>{ const total=ctx.dataset.data.reduce((a,b)=>a+b,0); const pct=total>0?((ctx.parsed/total)*100).toFixed(1):'0.0'; return `  ${ctx.label}: ${ctx.parsed} (${pct}%)`; } } },
      },
    },
  });
}

// ── Treemap (building) — city photo BG + all resolver avatars ─────────

// ── City map snapshot — direct OSM static tile image ──────────────────
// Uses staticmap.net (free, no API key) to get a real map image URL.
// Falls back to geoapify if needed. Both support CORS-free <img src> loading.

const _citySnapCache = {};

function _citySnap(city, country, callback) {
  if (!city && !country) { callback(null); return; }
  const key = (city||'').toLowerCase().trim() + '|' + (country||'').toLowerCase().trim();
  if (_citySnapCache.hasOwnProperty(key)) { callback(_citySnapCache[key]); return; }

  const coords = getCoords(city, country);
  if (!coords) {
    _citySnapCache[key] = null;
    callback(null);
    return;
  }

  const [lat, lng] = coords;
  const zoom = 13;
  const w = 300, h = 200;

  // Use staticmap.net — free, no key, returns PNG directly, CORS-friendly as <img src>
  // CartoDB Voyager tiles: colorful, readable, city-feel
  const tileUrl = encodeURIComponent('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png');
  const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&maptype=mapnik`;

  // Pre-warm the image to confirm it loads, then store URL
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload  = () => { _citySnapCache[key] = url; callback(url); };
  img.onerror = () => {
    // Fallback: geoapify static maps (also free, no auth for basic)
    const fallback = `https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=${w}&height=${h}&center=lonlat:${lng},${lat}&zoom=${zoom}&apiKey=YOUR_KEY`;
    // Since geoapify needs a key, just use a plain tile URL approach:
    // Compute the tile x,y,z for this lat/lng and link to a single OSM tile image
    const tileZ = zoom;
    const tileX = Math.floor((lng + 180) / 360 * Math.pow(2, tileZ));
    const tileY = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, tileZ));
    const singleTile = `https://tile.openstreetmap.org/${tileZ}/${tileX}/${tileY}.png`;
    _citySnapCache[key] = singleTile;
    callback(singleTile);
  };
  img.src = url;
}

// Derive city + country for a buildingId from FILTERED ticket data
function _cityForBuilding(bid) {
  const t = FILTERED.find(x => x.buildingId === bid && (x.city || x.siteCode));
  if (!t) return { city: null, country: null };
  return { city: t.city || t.siteCode || null, country: t.country || null };
}

function renderTreemap() {
  const el = document.getElementById('treemap-container');
  if (!el) return;

  // ── Group by CITY ─────────────────────────────────────────────────────
  const cityMap = {};
  FILTERED.forEach(t => {
    const city    = (t.city || t.siteCode || '').trim();
    const country = t.country || '';
    if (!city) return;
    if (!cityMap[city]) cityMap[city] = { city, country, tickets:[], aMap:{} };
    cityMap[city].tickets.push(t);
    const a = t.assigneeName || '—';
    if (!cityMap[city].aMap[a]) cityMap[city].aMap[a] = { count:0, totalH:0, breached:0 };
    cityMap[city].aMap[a].count++;
    cityMap[city].aMap[a].totalH += t.eosHours || 0;
    if (t.isBreached) cityMap[city].aMap[a].breached++;
  });

  const cityList = Object.values(cityMap).map(c => {
    const ranked   = Object.entries(c.aMap).sort((a,b) => b[1].count - a[1].count);
    const breached = c.tickets.filter(t => t.isBreached).length;
    const avgH     = c.tickets.length ? c.tickets.reduce((s,t) => s+t.eosHours,0)/c.tickets.length : 0;
    const buildings = [...new Set(c.tickets.map(t=>t.buildingId).filter(Boolean))];
    return { city:c.city, country:c.country, count:c.tickets.length, ranked, breached, avgH, buildings, tickets:c.tickets };
  }).sort((a,b) => b.count - a.count);

  const total = cityList.reduce((s,c)=>s+c.count,0);
  if (!total) { el.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px;">No data</div>'; return; }

  // ── Uniform grid layout ───────────────────────────────────────────────
  const cardBody = el.closest('.cb') || el;
  const W = Math.max(300, cardBody.offsetWidth || el.offsetWidth || el.parentElement?.offsetWidth || 700);
  const n    = cityList.length;
  const GAP  = 8;
  const TARGET_W = 185;
  const cols = Math.max(2, Math.min(7, Math.round(W / TARGET_W)));
  const tileW = Math.floor((W - GAP * (cols + 1)) / cols);
  const tileH = Math.max(150, Math.min(200, Math.round(tileW * 0.88)));
  // Hover (expanded) dimensions
  const hoverW = Math.round(tileW * 1.32);
  const hoverH = Math.round(tileH * 1.55);

  el.innerHTML = '';
  el.style.cssText += `;min-height:${Math.ceil(n/cols)*(tileH+GAP)+GAP}px;overflow:visible;`;

  const wrap = document.createElement('div');
  wrap.style.cssText = `display:flex;flex-wrap:wrap;gap:${GAP}px;padding:${GAP}px;box-sizing:border-box;width:100%;overflow:visible;`;
  el.appendChild(wrap);

  function applySnap(bgEl, snapUrl) {
    if (!snapUrl || !bgEl) return;
    const img = new Image();
    img.onload = () => {
      bgEl.style.backgroundImage    = `url('${snapUrl}')`;
      bgEl.style.backgroundSize     = 'cover';
      bgEl.style.backgroundPosition = 'center';
      bgEl.style.opacity = '0';
      bgEl.style.transition = 'opacity .7s ease, transform .35s cubic-bezier(.25,.46,.45,.94)';
      requestAnimationFrame(() => requestAnimationFrame(() => { bgEl.style.opacity = '0.6'; }));
    };
    img.onerror = () => {};
    img.src = snapUrl;
  }

  cityList.forEach((cd, idx) => {
    const col  = PALETTE[idx % PALETTE.length];
    const pct  = cd.count / total;
    const bPct = cd.count > 0 ? Math.round(cd.breached / cd.count * 100) : 0;
    const bClr = bPct >= 50 ? '#d93025' : bPct >= 20 ? '#f9ab00' : '#1e8e3e';

    // Placeholder holds layout space; card expands absolutely inside it
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `position:relative;width:${tileW}px;height:${tileH}px;flex-shrink:0;`;

    const cell = document.createElement('div');
    cell.className = 'tm-cell';
    cell.style.cssText = `position:absolute;top:0;left:0;width:${tileW}px;height:${tileH}px;background:${col}18;border:1.5px solid ${col}55;border-radius:12px;overflow:hidden;cursor:pointer;transition:width .28s cubic-bezier(.34,1.1,.64,1),height .28s cubic-bezier(.34,1.1,.64,1),left .28s cubic-bezier(.34,1.1,.64,1),box-shadow .22s ease,border-color .18s ease;will-change:width,height;`;
    cell.title = `${cd.city}: ${cd.count} tickets (${(pct*100).toFixed(1)}%) | ${bPct}% breach | avg ${fmtH(cd.avgH)}`;

    // Last column cards expand leftward to avoid clipping
    const colPos = idx % cols;
    const isLastCol = colPos === cols - 1;

    cell.addEventListener('mouseenter', () => {
      cell.style.width  = hoverW + 'px';
      cell.style.height = hoverH + 'px';
      cell.style.left   = isLastCol ? (tileW - hoverW) + 'px' : '0';
      cell.style.boxShadow = `0 18px 44px ${col}66, 0 4px 12px rgba(0,0,0,.28)`;
      cell.style.zIndex    = '10';
      cell.style.borderColor = col + 'cc';
      const bg = cell.querySelector('.tm-map-bg');
      if (bg) bg.style.transform = 'scale(1.18)';
      const peek = cell.querySelector('.tm-peek');
      if (peek) peek.style.transform = 'translateY(0)';
    });
    cell.addEventListener('mouseleave', () => {
      cell.style.width  = tileW + 'px';
      cell.style.height = tileH + 'px';
      cell.style.left   = '0';
      cell.style.boxShadow   = '';
      cell.style.zIndex      = '';
      cell.style.borderColor = col + '55';
      const bg = cell.querySelector('.tm-map-bg');
      if (bg) bg.style.transform = 'scale(1)';
      const peek = cell.querySelector('.tm-peek');
      if (peek) peek.style.transform = 'translateY(100%)';
    });

    const avatarSz  = 28, topAvatSz = 38;
    const maxAvatars = Math.max(1, Math.floor((tileW - 20) / (avatarSz + 4)));
    const people   = cd.ranked.filter(([n]) => n !== '—');
    const visible  = people.slice(0, maxAvatars);
    const overflow = Math.max(0, people.length - maxAvatars);

    let avatarHtml = '<div style="display:flex;align-items:center;justify-content:center;flex-wrap:nowrap;gap:3px;margin-top:6px;">';
    visible.forEach(([name, vv], ri) => {
      const ac  = PALETTE[ri % PALETTE.length];
      const uid = 'ctyav' + cd.city.replace(/\W/g,'') + ri;
      const sz  = ri === 0 ? topAvatSz : avatarSz;
      const border = ri === 0 ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,.7)';
      const shadow = ri === 0 ? 'filter:drop-shadow(0 2px 6px rgba(0,0,0,.6));' : 'filter:drop-shadow(0 1px 3px rgba(0,0,0,.4));';
      avatarHtml += `<div style="position:relative;flex-shrink:0;" title="${name} · ${vv.count} tix">
        <img width="${sz}" height="${sz}" style="border-radius:50%;object-fit:cover;border:${border};${shadow}display:block;"
          src="${BADGE_BASE}${encodeURIComponent(name)}" alt="${name}"
          onerror="this.style.display='none';document.getElementById('${uid}').style.cssText='display:inline-flex;width:${sz}px;height:${sz}px;border-radius:50%;background:${ac};color:#fff;font-size:${Math.max(7,Math.round(sz*.32))}px;font-weight:700;align-items:center;justify-content:center;border:2px solid #fff;';">
        <span id="${uid}" style="display:none;">${initials(name)}</span>
        ${ri===0?'<span style="position:absolute;bottom:-2px;right:-2px;font-size:11px;line-height:1;">🥇</span>':''}
      </div>`;
    });
    if (overflow > 0) {
      avatarHtml += `<div style="width:${avatarSz}px;height:${avatarSz}px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:${Math.max(8,avatarSz*0.34)}px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1.5px solid rgba(255,255,255,.4);">+${overflow}</div>`;
    }
    avatarHtml += '</div>';

    // Peek panel: top resolver bar + breach track + buildings badge
    const topPerson = people.length ? people[0] : null;
    const topName   = topPerson ? topPerson[0] : null;
    const topTix    = topPerson ? topPerson[1].count : 0;
    const topAvg    = topPerson ? fmtH(topPerson[1].count > 0 ? topPerson[1].totalH / topPerson[1].count : 0) : '—';
    const topBPct   = topPerson && topTix > 0 ? Math.round(topPerson[1].breached / topTix * 100) : 0;

    const buildingPills = cd.buildings.slice(0,6).map(b =>
      `<span style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:1px 6px;font-size:8.5px;font-weight:700;color:rgba(255,255,255,.9);white-space:nowrap;">${b}</span>`
    ).join('') + (cd.buildings.length > 6 ? `<span style="font-size:8px;color:rgba(255,255,255,.5);">+${cd.buildings.length-6}</span>` : '');

    cell.innerHTML = `
      <div class="tm-map-bg" style="position:absolute;inset:-8px;pointer-events:none;border-radius:11px;transition:transform .35s cubic-bezier(.25,.46,.45,.94);transform:scale(1);transform-origin:center;"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(170deg,${col}22 0%,rgba(0,0,0,.42) 100%);pointer-events:none;border-radius:11px;"></div>
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;gap:1px;overflow:hidden;padding:10px 8px 56px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;justify-content:center;gap:5px;max-width:100%;overflow:hidden;">
          <span style="font-size:14px;line-height:1;flex-shrink:0;filter:drop-shadow(0 1px 4px rgba(0,0,0,.7));">📍</span>
          <span style="font-size:16px;font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.85);line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cd.city}</span>
        </div>
        ${cd.country?`<div style="font-size:9px;color:rgba(255,255,255,.75);font-weight:600;text-transform:uppercase;letter-spacing:.12em;text-shadow:0 1px 4px rgba(0,0,0,.7);">${cd.country}</div>`:''}
        ${avatarHtml}
        <div style="font-size:12px;color:rgba(255,255,255,.95);font-family:var(--mono);font-weight:700;margin-top:5px;text-shadow:0 1px 4px rgba(0,0,0,.7);">${cd.count} tickets</div>
        <div style="font-size:10px;font-weight:700;color:${bClr};text-shadow:0 1px 5px rgba(0,0,0,.8);font-family:var(--mono);">${bPct}% breach · ${fmtH(cd.avgH)} avg</div>
        <!-- Buildings badge — always visible, shows IDs -->
        <div style="margin-top:7px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:center;max-width:100%;padding:0 6px;">
          ${cd.buildings.slice(0,4).map(b=>`<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.22);border-radius:6px;padding:2px 7px;"><span style="font-size:9px;line-height:1;">📍</span><span style="font-size:9px;font-weight:800;color:#fff;font-family:var(--mono);">${b}</span></span>`).join('')}${cd.buildings.length>4?`<span style="font-size:9px;color:rgba(255,255,255,.5);font-weight:600;">+${cd.buildings.length-4}</span>`:''}
        </div>
      </div>
      <!-- PEEK PANEL — slides up on hover -->
      <div class="tm-peek" style="
        position:absolute;bottom:0;left:0;right:0;z-index:5;
        background:linear-gradient(to top, rgba(0,0,0,.88) 0%, rgba(0,0,0,.76) 70%, rgba(0,0,0,0) 100%);
        backdrop-filter:blur(6px);
        padding:10px 10px 10px;
        transform:translateY(100%);
        transition:transform .26s cubic-bezier(.34,1.2,.64,1);
        border-bottom-left-radius:10px;border-bottom-right-radius:10px;
      ">
        ${topName ? `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <div style="font-size:8.5px;color:rgba(255,255,255,.55);font-weight:600;text-transform:uppercase;letter-spacing:.09em;">Top resolver</div>
          <div style="font-size:9.5px;font-weight:700;color:#fff;font-family:var(--mono);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${topName}</div>
          <div style="font-size:8.5px;color:rgba(255,255,255,.6);white-space:nowrap;">${topTix} tix · ${topAvg}</div>
        </div>
        ` : ''}
        <div style="margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="font-size:8px;color:rgba(255,255,255,.5);">SLA breach</span>
            <span style="font-size:8px;font-weight:700;color:${bClr};font-family:var(--mono);">${bPct}%</span>
          </div>
          <div style="height:4px;background:rgba(255,255,255,.12);border-radius:3px;overflow:hidden;">
            <div style="width:${bPct}%;height:100%;background:${bClr};border-radius:3px;transition:width .4s ease;"></div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center;">
          <span style="font-size:9px;color:rgba(255,255,255,.5);font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-right:2px;">${cd.buildings.length} building${cd.buildings.length!==1?'s':''}:</span>
          ${buildingPills}
        </div>
        <div style="margin-top:6px;font-size:8px;color:rgba(255,255,255,.38);text-align:center;letter-spacing:.06em;">click for full detail</div>
      </div>`;

    const bgEl = cell.querySelector('.tm-map-bg');
    _citySnap(cd.city, cd.country, url => applySnap(bgEl, url));
    cell.addEventListener('click', () => openCityTileModal(cd, col));
    placeholder.appendChild(cell);
    wrap.appendChild(placeholder);
  });
}

// ── City tile click modal ──────────────────────────────────────────────
function openCityTileModal(cd, col) {
  // ── Pin icon colour
  const pinIcon = document.querySelector('.cm-pin-icon');
  if (pinIcon) pinIcon.style.background = `linear-gradient(135deg,${col},${col}bb)`;

  // ── City name + subtitle pill
  document.getElementById('cm-city-name').textContent = cd.city;
  document.getElementById('cm-city-sub').textContent =
    cd.count + ' ticket' + (cd.count!==1?'s':'') + (cd.country?' · '+cd.country:'');

  // ── Interactive Leaflet map ─────────────────────────────────────────────
  const coords = getCoords(cd.city, cd.country);
  const lat = coords ? coords[0] : 48.8566;
  const lng = coords ? coords[1] : 2.3522;

  // Destroy previous map instance
  if (window._cmLeafletMap) {
    try { window._cmLeafletMap.remove(); } catch(e) {}
    window._cmLeafletMap = null;
  }

  // Show modal first so the container has dimensions
  document.getElementById('city-modal-backdrop').style.display = 'flex';

  requestAnimationFrame(() => {
    const mapEl = document.getElementById('cm-leaflet-map');
    if (!mapEl || typeof L === 'undefined') return;

    const map = L.map(mapEl, { zoomControl:false, attributionControl:true }).setView([lat, lng], 13);
    window._cmLeafletMap = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains:'abcd', maxZoom:19
    }).addTo(map);

    // Zoom control — bottom right
    L.control.zoom({ position:'bottomright' }).addTo(map);

    // ── City marker ───────────────────────────────────────────────────
    const markerIcon = L.divIcon({
      html:`<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
        <svg width="36" height="48" viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 8px rgba(0,0,0,.5));">
          <path d="M18 0C8.059 0 0 8.059 0 18c0 12 18 30 18 30S36 30 36 18C36 8.059 27.941 0 18 0z" fill="${col}"/>
          <circle cx="18" cy="18" r="8" fill="#fff"/>
          <circle cx="18" cy="18" r="4" fill="${col}"/>
        </svg>
        <span style="margin-top:2px;background:${col};color:#fff;font-size:10px;font-weight:800;font-family:var(--sans);border-radius:5px;padding:2px 7px;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.35);border:2px solid #fff;max-width:110px;overflow:hidden;text-overflow:ellipsis;">${cd.city}</span>
      </div>`,
      className:'', iconSize:[36, 62], iconAnchor:[18, 48]
    });
    const marker = L.marker([lat, lng], { icon:markerIcon }).addTo(map);

    // City popup — rich stats card
    const cityBreachPct = cd.count > 0 ? Math.round(cd.breached / cd.count * 100) : 0;
    const cityBClr = cityBreachPct >= 50 ? '#d93025' : cityBreachPct >= 20 ? '#f9ab00' : '#1e8e3e';
    const topResolver = cd.ranked?.filter(([n]) => n !== '—')[0];
    const cityPopupHtml = `
      <div class="lp lp-city-card">
        <div class="lp-city-header" style="background:${col}18;border-bottom:2px solid ${col}33;padding:14px 20px 12px;margin:-16px -20px 16px;border-radius:12px 12px 0 0;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:44px;height:44px;border-radius:12px;background:${col};display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 2px 10px ${col}66;">🏙️</div>
            <div>
              <div style="font-size:17px;font-weight:800;color:var(--text);letter-spacing:-.02em;line-height:1.1;">${cd.city}</div>
              ${cd.country ? `<div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-top:2px;">${cd.country}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="lp-stats" style="grid-template-columns:repeat(3,1fr);">
          <div class="lp-stat">
            <div class="lp-stat-v" style="color:${col};">${cd.count}</div>
            <div class="lp-stat-l">Tickets</div>
          </div>
          <div class="lp-stat">
            <div class="lp-stat-v" style="color:${cityBClr};">${cityBreachPct}%</div>
            <div class="lp-stat-l">Breach</div>
          </div>
          <div class="lp-stat">
            <div class="lp-stat-v" style="color:#1e8e3e;">${fmtH(cd.avgH)}</div>
            <div class="lp-stat-l">Avg EOS</div>
          </div>
        </div>
        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);">SLA breach rate</span>
            <span style="font-size:10px;font-weight:700;color:${cityBClr};">${cityBreachPct}%</span>
          </div>
          <div style="height:7px;background:var(--surface3);border-radius:4px;overflow:hidden;">
            <div style="width:${cityBreachPct}%;height:100%;background:${cityBClr};border-radius:4px;"></div>
          </div>
        </div>
        ${topResolver ? `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;">
          <img width="38" height="38" style="border-radius:50%;object-fit:cover;border:2.5px solid ${col};flex-shrink:0;"
            src="${BADGE_BASE}${encodeURIComponent(topResolver[0])}" alt="${topResolver[0]}"
            onerror="this.style.display='none'">
          <div style="flex:1;min-width:0;">
            <div style="font-size:10px;color:var(--text3);font-weight:600;">Top resolver</div>
            <div style="font-size:13px;font-weight:700;color:var(--text);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${topResolver[0]}</div>
          </div>
          <div style="font-size:13px;font-weight:800;color:${col};font-family:var(--mono);">${topResolver[1].count} tix</div>
        </div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
          ${cd.buildings.slice(0,6).map(b => `<span style="background:${col}18;border:1px solid ${col}44;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;color:var(--text);font-family:var(--mono);">${b}</span>`).join('')}
          ${cd.buildings.length > 6 ? `<span style="font-size:11px;color:var(--text3);">+${cd.buildings.length-6}</span>` : ''}
        </div>
        <button class="lp-btn" onclick="openCityTileModal(window._cmCurrentCd,window._cmCurrentCol);this.closest('.leaflet-popup').querySelector('.leaflet-popup-close-button')?.click();">
          View Full Detail →
        </button>
      </div>`;
    // Store cd/col so the button can access them
    window._cmCurrentCd  = cd;
    window._cmCurrentCol = col;
    marker.bindPopup(cityPopupHtml, { maxWidth:420, minWidth:360 });

    // ── Building markers from settings ────────────────────────────────
    const cityBuildings = cd.buildings;
    const buildingMarkers = [];

    cityBuildings.forEach((bid, bi) => {
      const info    = BUILDING_MAP[bid];
      const address = info?.address;
      if (!address) return;

      const bTix      = cd.tickets.filter(t => t.buildingId === bid);
      const bCount    = bTix.length;
      const bBreached = bTix.filter(t => t.isBreached).length;
      const bBPct     = bCount > 0 ? Math.round(bBreached / bCount * 100) : 0;
      const bAvgH     = bCount > 0 ? bTix.reduce((s,t) => s + (t.eosHours||0), 0) / bCount : 0;
      const bBClr     = bBPct >= 50 ? '#d93025' : bBPct >= 20 ? '#f9ab00' : '#1e8e3e';
      const bColor    = PALETTE[(bi + 1) % PALETTE.length];

      // Top resolver for this building
      const bResolvers = {};
      bTix.forEach(t => {
        const a = t.assigneeName || '—';
        if (!bResolvers[a]) bResolvers[a] = 0;
        bResolvers[a]++;
      });
      const bTopResolver = Object.entries(bResolvers).filter(([n])=>n!=='—').sort((a,b)=>b[1]-a[1])[0];

      // Geocode
      geocode(address)
        .then(geo => {
          if (!geo) return;
          const bLat = geo.lat, bLng = geo.lon;

          // Marker icon — red pin with building ID label below
          const bIcon = L.divIcon({
            html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
              <svg width="28" height="38" viewBox="0 0 28 38" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,.45));">
                <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 24 14 24S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#d93025"/>
                <circle cx="14" cy="14" r="6" fill="#fff"/>
              </svg>
              <span style="margin-top:2px;background:#d93025;color:#fff;font-size:9px;font-weight:800;font-family:monospace;border-radius:4px;padding:1px 5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3);border:1.5px solid #fff;">${bid}</span>
            </div>`,
            className:'', iconSize:[28, 52], iconAnchor:[14, 38]
          });

          const bMarker = L.marker([bLat, bLng], { icon:bIcon }).addTo(map);

          // Rich building popup
          const bPopupHtml = `
            <div class="lp lp-building-card">
              <div class="lp-city-header" style="background:${bColor}18;border-bottom:2px solid ${bColor}33;padding:14px 20px 12px;margin:-16px -20px 16px;border-radius:12px 12px 0 0;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="width:44px;height:44px;border-radius:12px;background:${bColor};display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 2px 10px ${bColor}55;">🏢</div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:17px;font-weight:800;color:var(--text);font-family:var(--mono);line-height:1.1;">${bid}</div>
                    <div style="font-size:11px;color:var(--text3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${address}">${address}</div>
                  </div>
                </div>
              </div>
              <div class="lp-stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px;">
                <div class="lp-stat">
                  <div class="lp-stat-v" style="color:${bColor};">${bCount}</div>
                  <div class="lp-stat-l">Tickets</div>
                </div>
                <div class="lp-stat">
                  <div class="lp-stat-v" style="color:${bBClr};">${bBPct}%</div>
                  <div class="lp-stat-l">Breach</div>
                </div>
                <div class="lp-stat">
                  <div class="lp-stat-v" style="color:#1e8e3e;">${fmtH(bAvgH)}</div>
                  <div class="lp-stat-l">Avg EOS</div>
                </div>
              </div>
              <div style="margin-bottom:${bTopResolver ? '14px' : '0'};">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                  <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);">SLA breach rate</span>
                  <span style="font-size:10px;font-weight:700;color:${bBClr};">${bBPct}%</span>
                </div>
                <div style="height:7px;background:var(--surface3);border-radius:4px;overflow:hidden;">
                  <div style="width:${bBPct}%;height:100%;background:${bBClr};border-radius:4px;"></div>
                </div>
              </div>
              ${bTopResolver ? `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;">
                <img width="38" height="38" style="border-radius:50%;object-fit:cover;border:2.5px solid ${bColor};flex-shrink:0;"
                  src="${BADGE_BASE}${encodeURIComponent(bTopResolver[0])}" alt="${bTopResolver[0]}"
                  onerror="this.style.display='none'">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:10px;color:var(--text3);font-weight:600;">Top resolver</div>
                  <div style="font-size:13px;font-weight:700;color:var(--text);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${bTopResolver[0]}</div>
                </div>
                <div style="font-size:13px;font-weight:800;color:${bColor};font-family:var(--mono);">${bTopResolver[1]} tix</div>
              </div>` : ''}
            </div>`;

          bMarker.bindPopup(bPopupHtml, { maxWidth:420, minWidth:380 });
          buildingMarkers.push(bMarker);

          // Fit bounds once all geocoded
          if (buildingMarkers.length === cityBuildings.filter(b => BUILDING_MAP[b]?.address).length && buildingMarkers.length > 0) {
            const group = L.featureGroup([marker, ...buildingMarkers]);
            map.fitBounds(group.getBounds().pad(0.3), { maxZoom:15 });
          }
        })
        .catch(() => {});
    });

    // ── Search functionality
    const searchInput = document.getElementById('cm-search-input');
    const searchBtn   = document.getElementById('cm-search-btn');
    if (searchInput) searchInput.value = cd.city + (cd.country ? ', '+cd.country : '');

    let searchMarker = null;
    async function doSearch() {
      const q = (searchInput?.value || '').trim();
      if (!q) return;
      searchBtn.textContent = '⏳';
      try {
        const geo = await geocode(q);
        if (geo) {
          map.flyTo([geo.lat, geo.lon], 13, { duration:1.2 });
          if (searchMarker) searchMarker.remove();
          searchMarker = L.marker([geo.lat, geo.lon]).addTo(map)
            .bindPopup(q)
            .openPopup();
        } else {
          searchBtn.textContent = '❌';
          setTimeout(()=>{ searchBtn.textContent='🔍 Go'; }, 1500);
          return;
        }
      } catch(e) { console.warn('Geocode search failed', e); }
      searchBtn.textContent = '🔍 Go';
    }
    if (searchBtn)   searchBtn.addEventListener('click', doSearch);
    if (searchInput) searchInput.addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });
  });

  // ── White body content ─────────────────────────────────────────────────
  let html = '';

  // KPI cards
  html += `<div class="cm-kpi-grid">`;
  [[cd.count,'Total Tickets',col],[cd.breached,'SLA Breached','#d93025'],[fmtH(cd.avgH),'Avg EOS Time','#1e8e3e'],[cd.buildings.length,'Buildings','#8430ce']].forEach(([v,l,c]) => {
    html += `<div class="cm-kpi-card"><div class="cm-kpi-val" style="color:${c};">${v}</div><div class="cm-kpi-lbl">${l}</div></div>`;
  });
  html += `</div>`;

  // Buildings
  html += `<div><div class="cm-sec-lbl">Buildings in ${cd.city}</div><div style="display:flex;flex-wrap:wrap;gap:8px;">`;
  cd.buildings.forEach(b => {
    const bt = cd.tickets.filter(t => t.buildingId === b);
    html += `<span class="cm-building-pill">${b}<span class="pill-count" style="background:${col};">${bt.length} tix</span></span>`;
  });
  html += `</div></div>`;

  // People
  html += `<div><div class="cm-sec-lbl">People who resolved tickets here</div><div style="display:flex;flex-direction:column;gap:8px;">`;
  const maxC = cd.ranked.length ? cd.ranked[0][1].count : 1;
  cd.ranked.filter(([n])=>n!=='—').slice(0,10).forEach(([name,v],i) => {
    const ac  = PALETTE[i%PALETTE.length];
    const uid = 'ctmav'+cd.city.replace(/\W/g,'')+i;
    const bP2 = v.count>0?Math.round(v.breached/v.count*100):0;
    const bc2 = bP2>=50?'#d93025':bP2>=20?'#f9ab00':'#1e8e3e';
    const bar = Math.round(v.count/maxC*100);
    html += `<div class="cm-person-row">
      <div style="flex-shrink:0;position:relative;">
        <img width="42" height="42" style="border-radius:50%;object-fit:cover;border:2.5px solid ${ac};display:block;"
          src="${BADGE_BASE}${encodeURIComponent(name)}" alt="${name}"
          onerror="this.style.display='none';document.getElementById('${uid}').style.cssText='display:inline-flex;width:42px;height:42px;border-radius:50%;background:${ac};color:#fff;font-size:13px;font-weight:700;align-items:center;justify-content:center;';">
        <span id="${uid}" style="display:none;">${initials(name)}</span>
        ${i===0?'<span style="position:absolute;bottom:-2px;right:-2px;font-size:12px;">🥇</span>':''}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <span class="cm-person-name">${name}</span>
          <span class="cm-badge" style="background:${ac}18;color:${ac};border-color:${ac}44;">${v.count} tix</span>
          <span class="cm-badge" style="background:${bc2}12;color:${bc2};border-color:${bc2}44;">${bP2}% breach</span>
          <span style="font-size:11px;color:var(--text2);font-weight:500;margin-left:2px;">${fmtH(v.count>0?v.totalH/v.count:0)} avg</span>
        </div>
        <div class="cm-progress-track"><div class="cm-progress-fill" style="width:${bar}%;background:${ac};"></div></div>
      </div>
    </div>`;
  });
  html += `</div></div>`;

  document.getElementById('cm-body').innerHTML = html;
}

// ── Funnel ────────────────────────────────────────────────────────────
function renderFunnel() {
  const el = document.getElementById('funnel-container');
  if (!el) return;
  const f3 = getFilters();
  const dateActive3 = !!(f3.dateFrom || f3.dateTo);
  const total      = FILTERED.length;
  const hasEos     = FILTERED.filter(t => (t.eosIntervals?.length > 0) || t.eosHours > 0).length;
  const resolved   = FILTERED.filter(t => t.status === 'resolved').length;
  const breached   = FILTERED.filter(t => t.isBreached).length;
  const onTrack    = resolved - FILTERED.filter(t => t.status === 'resolved' && t.isBreached).length;
  const openTix    = total - resolved;
  const totalLabel = dateActive3 ? 'Resolved in Window' : 'Total Tickets';
  const totalSub2  = dateActive3
    ? `date-filtered · open tickets excluded`
    : `${openTix} open · ${resolved} resolved`;

  const steps = [
    { label:totalLabel,            count:total,    color:'#1a73e8', icon:'🎟',  sub: totalSub2 },
    { label:'Has EOS Activity',    count:hasEos,   color:'#00acc1', icon:'📋',  sub: total>0 ? `${Math.round(hasEos/total*100)}% have EOS time logged` : '—' },
    { label:'Resolved',            count:resolved, color:'#1e8e3e', icon:'✅',  sub: total>0 ? `${Math.round(resolved/total*100)}% resolution rate` : '—' },
    { label:'EOS SLA Breached',    count:breached, color:'#d93025', icon:'🚨',  sub: total>0 ? `${Math.round(breached/total*100)}% of all tickets` : '—' },
    { label:'Lifespan Breached',   count:FILTERED.filter(t=>t.lifespanIsBreached).length, color:'#e8710a', icon:'🕐', sub: total>0 ? `${Math.round(FILTERED.filter(t=>t.lifespanIsBreached).length/total*100)}% full-lifetime breach` : '—' },
    { label:'Resolved, On Track',  count:onTrack,  color:'#1e8e3e', icon:'🏆',  sub: resolved>0 ? `${Math.round(onTrack/Math.max(resolved,1)*100)}% of resolved` : '—' },
  ];

  const maxW = el.offsetWidth ? Math.min(el.offsetWidth - 220, 240) : 200;
  el.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;padding:6px 4px;">' + steps.map((s, i) => {
    const ofTotal = total > 0 ? (s.count / total) : 0;
    const bw      = Math.max(24, Math.round(ofTotal * maxW));
    // drop from previous step
    const prev    = i > 0 ? steps[i-1].count : total;
    const drop    = i > 0 && prev > 0 && s.label !== 'SLA Breached'
                    ? ` ↓ ${Math.round((1 - s.count/prev)*100)}% drop`
                    : '';
    return `<div style="display:flex;align-items:center;gap:8px;">
      <div style="width:130px;flex-shrink:0;text-align:right;">
        <div style="font-size:10px;font-weight:700;color:var(--text2);font-family:var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.icon} ${s.label}</div>
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono);margin-top:1px;">${s.sub}</div>
      </div>
      <div style="flex:1;display:flex;align-items:center;gap:6px;">
        <div style="height:26px;background:${s.color}18;border:1.5px solid ${s.color}55;border-radius:5px;display:flex;align-items:center;justify-content:flex-start;overflow:hidden;min-width:24px;width:${bw}px;transition:width .5s;">
          <span style="font-size:11px;font-weight:800;color:${s.color};font-family:var(--mono);padding:0 8px;white-space:nowrap;">${s.count}</span>
        </div>
        ${drop ? `<span style="font-size:9px;color:var(--text3);font-family:var(--mono);white-space:nowrap;">${drop}</span>` : ''}
      </div>
    </div>`;
  }).join('') + '</div>';
}

// ── Histogram: EOS hours distribution ─────────────────────────────────
function renderHistogram() {
  const buckets = [0,0.5,1,2,3,5,8,12,18,24,999];
  const labels  = ['<30m','30m-1h','1-2h','2-3h','3-5h','5-8h','8-12h','12-18h','18-24h','24h+'];
  const counts  = new Array(labels.length).fill(0);
  FILTERED.forEach(t => {
    const h = t.eosHours;
    for (let i=0; i<buckets.length-1; i++) {
      if (h >= buckets[i] && h < buckets[i+1]) { counts[i]++; break; }
    }
  });
  const maxC = Math.max(...counts, 1);
  const colors = counts.map(c => {
    const t = c/maxC;
    return `rgba(26,115,232,${(0.2+t*0.7).toFixed(2)})`;
  });
  destroyChart(chartHistogram);
  chartHistogram = new Chart(document.getElementById('chart-histogram').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[{ label:'Tickets', data:counts, backgroundColor:colors, borderColor:'#1a73e8', borderWidth:1.5, borderRadius:5, borderSkipped:false }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{
          title:ctx=>`EOS Time: ${ctx[0].label}`,
          label:ctx=>{ const pct=FILTERED.length>0?((ctx.raw/FILTERED.length)*100).toFixed(1):0; return [`  Tickets: ${ctx.raw}`,`  Share: ${pct}% of total`]; },
        }},
      },
      scales:{
        x:{ grid:{ color:'rgba(0,0,0,0.05)' }, ticks:{ color:'#5f6368', font:{ size:10 }, maxRotation:30 } },
        y:{ grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 } } },
      },
    },
  });
}

// ── Scatter: EOS hours vs SLA cap ─────────────────────────────────────
function renderScatter() {
  const pts = FILTERED.map(t=>({ x:+t.slaCap.toFixed(1), y:+t.eosHours.toFixed(2), id:t.shortId, sev:t.sev, breached:t.isBreached, assignee:t.assigneeName }));
  const okPts   = pts.filter(p=>!p.breached);
  const badPts  = pts.filter(p=>p.breached);
  const maxCap  = Math.max(...pts.map(p=>p.x), 10);
  const diagX   = [0, maxCap];
  const diagY   = [0, maxCap];
  destroyChart(chartScatter);
  chartScatter = new Chart(document.getElementById('chart-scatter').getContext('2d'), {
    type:'scatter',
    data:{ datasets:[
      { label:'On Track',     data:okPts,  backgroundColor:'rgba(34,197,94,.35)',  borderColor:'#1e8e3e', borderWidth:1.5, pointRadius:5, pointHoverRadius:8 },
      { label:'Breached',     data:badPts, backgroundColor:'rgba(217,48,37,.35)', borderColor:'#d93025', borderWidth:1.5, pointRadius:5, pointHoverRadius:8 },
      { label:'SLA Cap Line', data:diagX.map((x,i)=>({x,y:diagY[i]})), type:'line', borderColor:'rgba(217,48,37,0.5)', borderDash:[5,4], borderWidth:1.5, pointRadius:0, fill:false },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color:'#3c4043', font:{ size:11 } } },
        tooltip:{ filter:ctx=>ctx.dataset.label!=='SLA Cap Line', callbacks:{
          label:ctx=>{ const p=ctx.raw; return [`  ${p.id}`,`  EOS: ${fmtH(p.y)}  Cap: ${fmtH(p.x)}`,`  Assignee: ${p.assignee||'—'}`,`  Sev ${p.sev}  ${p.breached?'🚨 Breached':'✅ OK'}`]; },
        }},
      },
      scales:{
        x:{ title:{ display:true, text:'SLA Cap (hrs)', color:'#3c4043', font:{ size:11 } }, grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 } } },
        y:{ title:{ display:true, text:'Actual EOS hrs', color:'#3c4043', font:{ size:11 } }, grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 } } },
      },
    },
  });
}

// ── Bounce chart ──────────────────────────────────────────────────────
function renderBounce() {
  const bounced = [...FILTERED].filter(t=>t.stints>1).sort((a,b)=>b.stints-a.stints).slice(0,15);
  const labels  = bounced.map(t=>t.shortId);
  const stintData = bounced.map(t=>t.stints);
  const hoursData = bounced.map(t=>+t.eosHours.toFixed(2));
  destroyChart(chartBounce);
  if (!bounced.length) {
    document.getElementById('chart-bounce').getContext('2d').clearRect(0,0,9999,9999);
    const c = document.getElementById('chart-bounce');
    c.getContext('2d').fillStyle='#5f6368';
    c.getContext('2d').font='13px DM Sans';
    c.getContext('2d').textAlign='center';
    c.getContext('2d').fillText('No bounced tickets in this filter set',c.width/2,c.height/2);
    return;
  }
  chartBounce = new Chart(document.getElementById('chart-bounce').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[
      { label:'EOS Stints', data:stintData, backgroundColor:'rgba(236,72,153,0.2)', borderColor:'#d01884', borderWidth:2, borderRadius:5, borderSkipped:false, yAxisID:'y1' },
      { label:'Total EOS hrs', data:hoursData, type:'line', borderColor:'#f9ab00', backgroundColor:'transparent', tension:0.3, pointRadius:4, pointHoverRadius:7, borderWidth:2, yAxisID:'y2' },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ display:true, labels:{ color:'#3c4043', font:{ size:11 } } },
        tooltip:{ callbacks:{
          title:ctx=>ctx[0]?.label,
          label:ctx=>ctx.dataset.label==='EOS Stints'?`  Stints: ${ctx.raw}`:`  Total EOS hrs: ${fmtH(ctx.raw)}`,
        }},
      },
      scales:{
        x:{ grid:{ color:'rgba(0,0,0,0.05)' }, ticks:{ color:'#5f6368', font:{ size:10, family:"'DM Mono',monospace" }, maxRotation:45 } },
        y1:{ grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#d01884', font:{ size:11 } }, title:{ display:true, text:'Stints', color:'#d01884', font:{ size:11 } } },
        y2:{ position:'right', grid:{ display:false }, ticks:{ color:'#f9ab00', font:{ size:11 }, callback:v=>fmtH(v) }, title:{ display:true, text:'EOS hrs', color:'#f9ab00', font:{ size:11 } } },
      },
    },
  });
}

// ── Repeat requester bar ───────────────────────────────────────────────
function renderRepeatReq() {
  const groups = groupBy(FILTERED,'requester',null);
  const top = groups.slice(0,12);
  const labels = top.map(([k])=>k==='—'?'Unknown':k);
  const counts = top.map(([,v])=>v.count);
  const colors = counts.map((_,i)=>PALETTE[i%PALETTE.length]);
  destroyChart(chartRepeatReq);
  chartRepeatReq = new Chart(document.getElementById('chart-repeat-req').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[{ label:'Tickets Submitted', data:counts, backgroundColor:colors.map(c=>c+'33'), borderColor:colors, borderWidth:2, borderRadius:5, borderSkipped:false }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label:ctx=>{ const pct=FILTERED.length>0?((ctx.raw/FILTERED.length)*100).toFixed(1):0; return [`  Tickets: ${ctx.raw}`,`  ${pct}% of total volume`]; } } },
      },
      scales:{
        x:{ grid:{ color:'rgba(0,0,0,0.05)' }, ticks:{ color:'#5f6368', font:{ size:10, family:"'DM Mono',monospace" }, maxRotation:45 } },
        y:{ grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ color:'#5f6368', font:{ size:11 } } },
      },
    },
  });
}

// ── Root Cause × Closure Code Matrix ──────────────────────────────────
function renderRootClosureMatrix() {
  const el = document.getElementById('rootclosure-container');
  if (!el) return;

  // Build cross-tab
  const rootSet = new Set(), closureSet = new Set();
  FILTERED.forEach(t => {
    if (t.rootCause)   rootSet.add(t.rootCause);
    if (t.closureCode) closureSet.add(t.closureCode);
  });
  let roots    = [...rootSet];
  let closures = [...closureSet];
  if (!roots.length || !closures.length) {
    el.innerHTML = '<div style="padding:40px 12px;text-align:center;font-size:12px;color:var(--text3);">No root-cause / closure data in the current selection.</div>';
    return;
  }

  // cell[root][closure] = { count, breached }
  const cell = {};
  roots.forEach(r => { cell[r] = {}; closures.forEach(c => { cell[r][c] = { count:0, breached:0 }; }); });
  FILTERED.forEach(t => {
    if (t.rootCause && t.closureCode) {
      cell[t.rootCause][t.closureCode].count++;
      if (t.isBreached) cell[t.rootCause][t.closureCode].breached++;
    }
  });

  // Totals
  const rowTotals = {}, rowBreach = {};
  roots.forEach(r => {
    rowTotals[r] = closures.reduce((s,c) => s + cell[r][c].count, 0);
    rowBreach[r] = closures.reduce((s,c) => s + cell[r][c].breached, 0);
  });
  const colTotals = {}, colBreach = {};
  closures.forEach(c => {
    colTotals[c] = roots.reduce((s,r) => s + cell[r][c].count, 0);
    colBreach[c] = roots.reduce((s,r) => s + cell[r][c].breached, 0);
  });
  const grandTotal  = roots.reduce((s,r) => s + rowTotals[r], 0);
  const grandBreach = roots.reduce((s,r) => s + rowBreach[r], 0);

  // Sort rows/cols by volume desc, drop empties
  roots    = roots.filter(r => rowTotals[r] > 0).sort((a,b) => rowTotals[b] - rowTotals[a]);
  closures = closures.filter(c => colTotals[c] > 0).sort((a,b) => colTotals[b] - colTotals[a]);

  const maxCell = Math.max(1, ...roots.flatMap(r => closures.map(c => cell[r][c].count)));

  // Closure column accent color
  const closureColor = c => {
    const l = c.toLowerCase();
    if (l.includes('unsuccess') || l.includes('fail') || l.includes('cancel')) return '217,48,37';
    if (l.includes('success') || l.includes('resolved') || l.includes('complete')) return '30,142,62';
    if (l.includes('dupli') || l.includes('no action') || l.includes('not repro')) return '132,48,206';
    return '26,115,232';
  };

  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const COL_W = Math.max(104, Math.min(150, Math.floor((el.offsetWidth - 340) / closures.length)));

  // ── Header band: title + breach legend ──
  let html = `
  <div style="padding:2px 6px 16px;">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;color:var(--text3);font-weight:600;">Volume</span>
        <span style="display:flex;align-items:center;gap:0;border-radius:6px;overflow:hidden;border:1px solid var(--border);">
          ${[0.12,0.28,0.46,0.66,0.88].map(a=>`<span style="width:26px;height:14px;background:rgba(26,115,232,${a});"></span>`).join('')}
        </span>
        <span style="font-size:10px;color:var(--text3);">low → high</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--danger);"></span>
        <span style="font-size:11px;color:var(--text3);">corner dot &amp; % = breached share of the cell</span>
      </div>
      <div style="margin-left:auto;font-size:11px;color:var(--text3);">
        <b style="color:var(--text);font-family:var(--mono);font-size:13px;">${grandTotal}</b> tickets ·
        <b style="color:var(--danger);font-family:var(--mono);font-size:13px;">${grandTotal?Math.round(grandBreach/grandTotal*100):0}%</b> breached
      </div>
    </div>

    <div style="overflow:auto;max-height:560px;border:1px solid var(--border);border-radius:12px;background:var(--surface);">
    <table style="border-collapse:separate;border-spacing:0;font-size:11px;min-width:100%;table-layout:fixed;">
      <colgroup>
        <col style="width:260px;">
        ${closures.map(() => `<col style="width:${COL_W}px;">`).join('')}
        <col style="width:84px;">
      </colgroup>
      <thead>
        <tr>
          <th style="position:sticky;left:0;top:0;z-index:5;background:var(--surface2);text-align:left;padding:12px 14px;font-weight:700;color:var(--text2);font-size:11px;letter-spacing:.04em;text-transform:uppercase;border-bottom:2px solid var(--border2);border-right:1px solid var(--border);">Root Cause ╲ Closure</th>
          ${closures.map(c => {
            const cc = closureColor(c);
            return `<th title="${esc(c)}" style="position:sticky;top:0;z-index:4;vertical-align:bottom;text-align:center;padding:10px 6px;font-weight:700;color:var(--text2);font-size:10px;line-height:1.25;border-bottom:2px solid var(--border2);border-top:3px solid rgb(${cc});background-color:var(--surface);background-image:linear-gradient(rgba(${cc},.08),rgba(${cc},.08));">
              <div style="white-space:normal;word-break:break-word;overflow-wrap:anywhere;">${esc(c)}</div>
              <div style="font-family:var(--mono);font-size:9px;color:var(--text3);font-weight:600;margin-top:3px;">${colTotals[c]}</div>
            </th>`;
          }).join('')}
          <th style="position:sticky;top:0;z-index:4;text-align:center;padding:10px 8px;font-weight:700;color:var(--text2);font-size:10px;letter-spacing:.04em;text-transform:uppercase;border-bottom:2px solid var(--border2);border-left:1px solid var(--border);background:var(--surface2);">Total</th>
        </tr>
      </thead>
      <tbody>`;

  roots.forEach((r, ri) => {
    const rowTotal = rowTotals[r];
    const rbPct = rowTotal ? Math.round(rowBreach[r] / rowTotal * 100) : 0;
    const zebra = ri % 2 ? 'var(--surface)' : 'var(--surface2)';
    html += `<tr>
      <td style="position:sticky;left:0;z-index:2;background:${zebra};padding:9px 14px;font-size:11.5px;font-weight:600;color:var(--text);border-bottom:1px solid var(--border);border-right:1px solid var(--border);white-space:normal;word-break:break-word;line-height:1.3;" title="${esc(r)}">${esc(r)}</td>`;
    closures.forEach(c => {
      const d = cell[r][c];
      const intensity = d.count / maxCell;
      const bPct = d.count > 0 ? Math.round(d.breached / d.count * 100) : 0;
      const cc = closureColor(c);
      const a  = 0.10 + intensity * 0.80;
      const textColor = intensity > 0.55 ? '#fff' : 'var(--text)';
      html += `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:center;">`;
      if (d.count === 0) {
        html += `<span style="color:var(--text3);opacity:.4;font-size:13px;">·</span>`;
      } else {
        html += `<div title="${esc(r)} → ${esc(c)}&#10;${d.count} ticket${d.count!==1?'s':''} · ${d.breached} breached (${bPct}%)"
            style="position:relative;background:rgba(${cc},${a.toFixed(3)});border:1px solid rgba(${cc},${Math.min(1,a+0.18).toFixed(3)});border-radius:9px;padding:8px 4px;min-height:42px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:default;transition:transform .1s;">
            <div style="font-size:16px;font-weight:800;font-family:var(--mono);color:${textColor};line-height:1;">${d.count}</div>
            ${bPct > 0 ? `<div style="font-size:9px;font-weight:700;font-family:var(--mono);margin-top:3px;color:${intensity>0.55?'rgba(255,255,255,.92)':'var(--danger)'};">⚠ ${bPct}%</div>` : ''}
            ${d.breached > 0 ? `<span style="position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:var(--danger);box-shadow:0 0 0 2px rgba(${cc},${a.toFixed(3)});"></span>` : ''}
          </div>`;
      }
      html += `</td>`;
    });
    // Row total
    html += `<td style="padding:6px 8px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);background:${zebra};text-align:center;">
      <div style="font-size:15px;font-weight:800;font-family:var(--mono);color:var(--text);line-height:1;">${rowTotal}</div>
      ${rbPct>0?`<div style="font-size:9px;font-weight:700;color:var(--danger);margin-top:2px;">${rbPct}%</div>`:''}
    </td></tr>`;
  });

  // Footer: column totals
  html += `<tr>
    <td style="position:sticky;left:0;z-index:2;background:var(--surface3);padding:10px 14px;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text2);border-top:2px solid var(--border2);border-right:1px solid var(--border);">Total</td>
    ${closures.map(c => {
      const cbPct = colTotals[c] ? Math.round(colBreach[c]/colTotals[c]*100) : 0;
      return `<td style="padding:8px 4px;text-align:center;background:var(--surface3);border-top:2px solid var(--border2);">
        <div style="font-size:15px;font-weight:800;font-family:var(--mono);color:var(--text);line-height:1;">${colTotals[c]}</div>
        ${cbPct>0?`<div style="font-size:9px;font-weight:700;color:var(--danger);margin-top:2px;">${cbPct}%</div>`:''}
      </td>`;
    }).join('')}
    <td style="padding:8px;text-align:center;background:var(--accent);border-top:2px solid var(--border2);border-left:1px solid var(--border);">
      <div style="font-size:16px;font-weight:800;font-family:var(--mono);color:#fff;line-height:1;">${grandTotal}</div>
      <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.85);margin-top:2px;">${grandTotal?Math.round(grandBreach/grandTotal*100):0}% br</div>
    </td>
  </tr>`;

  html += `</tbody></table></div></div>`;
  el.innerHTML = html;
}

// ── Weekend Skip Impact ────────────────────────────────────────────────
function renderWeekendImpact() {
  const el = document.getElementById('weekend-container');
  if (!el) return;

  // Group by weekendDaysSkipped (0, 1, 2+)
  const buckets = { '0 weekends':{ count:0, breached:0, pctSum:0 }, '1 weekend':{ count:0, breached:0, pctSum:0 }, '2+ weekends':{ count:0, breached:0, pctSum:0 } };
  FILTERED.forEach(t => {
    const skip = t.slaAnalysis?.weekendDaysSkipped ?? 0;
    const key  = skip === 0 ? '0 weekends' : skip === 1 ? '1 weekend' : '2+ weekends';
    buckets[key].count++;
    if (t.isBreached) buckets[key].breached++;
    buckets[key].pctSum += (t.slaConsumedPct || 0);
  });

  const labels    = Object.keys(buckets);
  const counts    = labels.map(l => buckets[l].count);
  const bRates    = labels.map(l => buckets[l].count > 0 ? Math.round(buckets[l].breached / buckets[l].count * 100) : 0);
  const avgSlaPct = labels.map(l => buckets[l].count > 0 ? Math.round(buckets[l].pctSum / buckets[l].count) : 0);
  const colBreach = ['#1e8e3e','#f9ab00','#d93025'];
  const colCount  = ['#1a73e833','#f9ab0033','#d9302533'];
  const colBorder = ['#1a73e8','#f9ab00','#d93025'];

  // Render as custom bars (no Chart.js dependency for this one — pure DOM)
  const maxCount = Math.max(1, ...counts);
  let html = '<div style="padding:10px 12px;">';

  // Summary KPI row
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">';
  labels.forEach((l, i) => {
    html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;border-top:3px solid ${colBorder[i]};">
      <div style="font-size:11px;color:var(--text3);margin-bottom:2px;">${l}</div>
      <div style="font-size:18px;font-weight:800;font-family:var(--mono);color:${colBorder[i]};line-height:1;">${bRates[i]}<span style="font-size:11px;font-weight:400;">%</span></div>
      <div style="font-size:9px;color:var(--text3);">breach rate</div>
      <div style="font-size:10px;color:var(--text2);margin-top:4px;">${counts[i]} tickets</div>
    </div>`;
  });
  html += '</div>';

  // Grouped bar: ticket count (left bars) + breach % (right bars)
  html += '<div style="font-size:10px;color:var(--text3);margin-bottom:8px;font-weight:600;">Ticket count vs breach rate by weekend days bridged</div>';
  labels.forEach((l, i) => {
    const barW = Math.round(counts[i] / maxCount * 100);
    html += `<div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
        <span style="color:var(--text2);font-weight:600;">${l}</span>
        <span style="color:var(--text3);">${counts[i]} tickets · avg SLA used: <strong style="color:${colBorder[i]};">${avgSlaPct[i]}%</strong></span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <div style="flex:1;height:10px;background:var(--surface3);border-radius:5px;overflow:hidden;">
          <div style="height:100%;width:${barW}%;background:${colBorder[i]}55;border-radius:5px;"></div>
        </div>
        <div style="width:44px;text-align:right;font-size:10px;font-weight:700;color:${colBorder[i]};font-family:var(--mono);">${counts[i]}</div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;margin-top:3px;">
        <div style="flex:1;height:6px;background:var(--surface3);border-radius:5px;overflow:hidden;">
          <div style="height:100%;width:${bRates[i]}%;background:${colBorder[i]};border-radius:5px;"></div>
        </div>
        <div style="width:44px;text-align:right;font-size:10px;font-weight:700;color:${colBorder[i]};font-family:var(--mono);">${bRates[i]}%</div>
      </div>
    </div>`;
  });

  // Insight callout
  if (bRates[2] > bRates[0] * 1.5 || bRates[1] > bRates[0] * 1.3) {
    html += `<div style="background:var(--warn-lt);border-left:3px solid var(--warn);border-radius:0 6px 6px 0;padding:8px 12px;margin-top:8px;font-size:11px;color:var(--text2);">
      ⚠ Tickets bridging weekends have <strong>${bRates[2] > 0 ? bRates[2] : bRates[1]}% breach rate</strong> vs <strong>${bRates[0]}%</strong> for same-week tickets. Consider priority handling for Friday-created tickets.
    </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

// ── Ticket Lifespan Analysis ───────────────────────────────────────────
function renderLifespan() {
  const el = document.getElementById('lifespan-section');
  if (!el) return;

  const withLS = FILTERED.filter(t => t.lifespanBizHours > 0);
  if (!withLS.length) {
    el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:32px;">No lifespan data yet — run SLA Bulk or SLA Single to populate.</p>';
    return;
  }

  // Summary stats
  const lsHrs  = withLS.map(t => t.lifespanBizHours);
  const avg    = lsHrs.reduce((a,b)=>a+b,0)/lsHrs.length;
  const sorted2 = [...lsHrs].sort((a,b)=>a-b);
  const median = sorted2.length%2 ? sorted2[Math.floor(sorted2.length/2)] : (sorted2[sorted2.length/2-1]+sorted2[sorted2.length/2])/2;
  const max    = Math.max(...lsHrs);
  const min    = Math.min(...lsHrs);
  // EOS time vs total lifespan ratio (how much of life was spent with EOS)
  const withBoth = withLS.filter(t => t.eosHours > 0 && t.lifespanBizHours > 0);
  const avgEosRatio = withBoth.length
    ? withBoth.reduce((a,t)=>a+(t.eosHours/t.lifespanBizHours),0)/withBoth.length * 100
    : 0;

  // Top 20 by lifespan for bar chart
  const top20 = [...withLS].sort((a,b)=>b.lifespanBizHours-a.lifespanBizHours).slice(0,20);

  // Lifespan breach context for the hero band
  const lsBreached = withLS.filter(t => t.lifespanIsBreached).length;
  const lsBreachPct = withLS.length ? Math.round(lsBreached / withLS.length * 100) : 0;
  const coverage = FILTERED.length ? Math.round(withLS.length / FILTERED.length * 100) : 0;

  // Reusable card header (icon chip + title + optional subtitle)
  const chHead = (icon, bg, title, sub) =>
    `<div class="ch" style="margin:-4px -4px 12px;">
       <div class="ch-icon" style="background:${bg};">${icon}</div>
       <div class="ch-title">${title}</div>
       ${sub ? `<div class="ch-sub">${sub}</div>` : ''}
     </div>`;

  el.innerHTML = `
    <!-- HERO BAND: headline lifespan + breach context -->
    <div style="display:grid;grid-template-columns:minmax(260px,1.1fr) 2fr;gap:14px;margin-bottom:18px;">
      <div style="position:relative;overflow:hidden;border-radius:16px;padding:20px 22px;color:#fff;
                  background:linear-gradient(135deg,#1a73e8 0%,#7c4dff 55%,#8430ce 100%);
                  box-shadow:0 10px 30px -8px rgba(26,115,232,.55);">
        <div style="position:absolute;inset:0;background:radial-gradient(circle at 85% 15%,rgba(255,255,255,.22),transparent 45%);"></div>
        <div style="position:relative;">
          <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.85;font-weight:700;">Average End-to-End Lifespan</div>
          <div style="font-size:48px;font-weight:800;font-family:var(--mono);line-height:1;margin:8px 0 2px;letter-spacing:-.02em;">${fmtH(avg)}</div>
          <div style="font-size:11px;opacity:.9;">business hours · created → resolved (excl. weekends &amp; off-hours)</div>
          <div style="display:flex;gap:18px;margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.25);">
            <div><div style="font-size:18px;font-weight:800;font-family:var(--mono);line-height:1;">${fmtH(median)}</div><div style="font-size:9px;opacity:.8;text-transform:uppercase;letter-spacing:.08em;margin-top:3px;">Median</div></div>
            <div><div style="font-size:18px;font-weight:800;font-family:var(--mono);line-height:1;">${Math.round(avgEosRatio)}%</div><div style="font-size:9px;opacity:.8;text-transform:uppercase;letter-spacing:.08em;margin-top:3px;">EOS Share</div></div>
            <div><div style="font-size:18px;font-weight:800;font-family:var(--mono);line-height:1;color:${lsBreachPct>0?'#ffd9d4':'#fff'};">${lsBreachPct}%</div><div style="font-size:9px;opacity:.8;text-transform:uppercase;letter-spacing:.08em;margin-top:3px;">LS Breached</div></div>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
        <div class="sc" style="--ca:#d93025;--cb:#ea4335;">
          <div class="sc-icon">🏆</div><div class="sc-val">${fmtH(max)}</div>
          <div class="sc-lbl">Longest Ticket</div><div class="sc-sub">single ticket</div>
        </div>
        <div class="sc" style="--ca:#1e8e3e;--cb:#34a853;">
          <div class="sc-icon">⚡</div><div class="sc-val">${fmtH(min)}</div>
          <div class="sc-lbl">Fastest Ticket</div><div class="sc-sub">single ticket</div>
        </div>
        <div class="sc" style="--ca:#e8710a;--cb:#fa903e;">
          <div class="sc-icon">🕐</div><div class="sc-val">${lsBreached}</div>
          <div class="sc-lbl">Lifespan Breached</div><div class="sc-sub">${lsBreachPct}% of tickets</div>
        </div>
        <div class="sc" style="--ca:#00acc1;--cb:#26c6da;">
          <div class="sc-icon">🎯</div><div class="sc-val">${Math.round(avgEosRatio)}%</div>
          <div class="sc-lbl">Avg EOS Share</div><div class="sc-sub">of total lifespan</div>
        </div>
        <div class="sc" style="--ca:#4285f4;--cb:#669df6;">
          <div class="sc-icon">📊</div><div class="sc-val">${withLS.length}</div>
          <div class="sc-lbl">Tickets With Data</div><div class="sc-sub">${coverage}% of ${FILTERED.length} filtered</div>
        </div>
        <div class="sc" style="--ca:#8430ce;--cb:#b260f0;">
          <div class="sc-icon">⌛</div><div class="sc-val">${fmtH(median)}</div>
          <div class="sc-lbl">Median Lifespan</div><div class="sc-sub">business hrs</div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="card" style="padding:16px;">
        ${chHead('📊','rgba(99,102,241,.14)','Top 20 Tickets by Lifespan','Lifespan vs EOS time')}
        <div style="height:260px;position:relative;"><canvas id="chart-lifespan-bar"></canvas></div>
      </div>
      <div class="card" style="padding:16px;">
        ${chHead('🎯','var(--teal-lt)','EOS Time vs Total Lifespan','each dot = one ticket')}
        <div style="height:260px;position:relative;"><canvas id="chart-lifespan-scatter"></canvas></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card" style="padding:16px;">
        ${chHead('📈','rgba(99,102,241,.14)','Lifespan Distribution','histogram of business hours')}
        <div style="height:220px;position:relative;"><canvas id="chart-lifespan-hist"></canvas></div>
      </div>
      <div class="card" style="padding:16px;">
        ${chHead('🪜','var(--accent-lt)','Lifespan by Severity','avg business hours')}
        <div style="height:220px;position:relative;"><canvas id="chart-lifespan-sev"></canvas></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
      <div class="card" style="padding:16px;">
        ${chHead('🕐','rgba(249,115,22,.14)','Lifespan SLA Breach by Severity','on-track vs breached')}
        <div style="height:220px;position:relative;"><canvas id="chart-lifespan-breach-sev"></canvas></div>
      </div>
      <div class="card" style="padding:16px;">
        ${chHead('⚖️','var(--danger-lt)','EOS vs Lifespan SLA','both breach perspectives')}
        <div style="height:220px;position:relative;"><canvas id="chart-lifespan-eos-compare"></canvas></div>
      </div>
    </div>`;

  // Bar chart: top 20
  new Chart(document.getElementById('chart-lifespan-bar').getContext('2d'), {
    type:'bar',
    data:{
      labels: top20.map(t=>t.shortId),
      datasets:[
        { label:'Total Lifespan (biz hrs)', data:top20.map(t=>+t.lifespanBizHours.toFixed(2)), backgroundColor:'rgba(99,102,241,.3)', borderColor:'#6366f1', borderWidth:2, borderRadius:4 },
        { label:'EOS Time (biz hrs)',        data:top20.map(t=>+t.eosHours.toFixed(2)),         backgroundColor:'rgba(79,220,154,.25)', borderColor:'#4fdc9a', borderWidth:2, borderRadius:4 },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#3c4043', font:{size:11} } },
        tooltip:{ callbacks:{ label:ctx=>{ const t=top20[ctx.dataIndex]; return ctx.dataset.label+': '+fmtH(ctx.raw)+` (Cal: ${t.lifespanCalDays}d)`; } } } },
      scales:{
        x:{ ticks:{ color:'#5f6368', font:{size:9,family:"'DM Mono',monospace"}, maxRotation:45 }, grid:{color:'rgba(0,0,0,0.04)'} },
        y:{ ticks:{ color:'#5f6368', callback:v=>fmtH(v) }, grid:{color:'rgba(0,0,0,0.06)'} },
      }
    }
  });

  // Scatter: EOS hours vs lifespan
  new Chart(document.getElementById('chart-lifespan-scatter').getContext('2d'), {
    type:'scatter',
    data:{
      datasets:[{
        label:'Ticket',
        data: withBoth.map(t=>({ x:+t.lifespanBizHours.toFixed(2), y:+t.eosHours.toFixed(2), shortId:t.shortId, sev:t.sev })),
        backgroundColor: withBoth.map(t=>SEV_COLOR[t.sev]||'#94a3b8'),
        pointRadius:5, pointHoverRadius:8,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label:ctx=>{ const d=ctx.raw; return [`${d.shortId}`, `Lifespan: ${fmtH(d.x)}`, `EOS: ${fmtH(d.y)}`, `EOS share: ${Math.round(d.y/d.x*100)}%`]; } } }
      },
      scales:{
        x:{ title:{display:true,text:'Total Lifespan (biz hrs)',color:'#5f6368',font:{size:10}}, ticks:{color:'#5f6368',callback:v=>fmtH(v)}, grid:{color:'rgba(0,0,0,0.06)'} },
        y:{ title:{display:true,text:'EOS Biz Hours',color:'#5f6368',font:{size:10}},            ticks:{color:'#5f6368',callback:v=>fmtH(v)}, grid:{color:'rgba(0,0,0,0.06)'} },
      }
    }
  });

  // Histogram: lifespan distribution
  const BUCKETS = 8;
  const bMin = 0, bMax = Math.max(...lsHrs);
  const step = bMax / BUCKETS;
  const buckets = Array.from({length:BUCKETS}, (_,i) => ({ label:`${fmtH(i*step)}–${fmtH((i+1)*step)}`, count:0 }));
  lsHrs.forEach(h => { const b = Math.min(BUCKETS-1, Math.floor(h/step)); buckets[b].count++; });
  new Chart(document.getElementById('chart-lifespan-hist').getContext('2d'), {
    type:'bar',
    data:{ labels:buckets.map(b=>b.label), datasets:[{ label:'Tickets', data:buckets.map(b=>b.count), backgroundColor:'rgba(99,102,241,.4)', borderColor:'#6366f1', borderWidth:1.5, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ticks:{color:'#5f6368',font:{size:9},maxRotation:30},grid:{display:false}}, y:{ticks:{color:'#5f6368'},grid:{color:'rgba(0,0,0,0.06)'}} } }
  });

  // Bar: avg lifespan by severity
  const sevs = [3,4,5];
  const sevAvg = sevs.map(s => { const ts = withLS.filter(t=>t.sev===s); return ts.length ? ts.reduce((a,t)=>a+t.lifespanBizHours,0)/ts.length : 0; });
  new Chart(document.getElementById('chart-lifespan-sev').getContext('2d'), {
    type:'bar',
    data:{ labels:sevs.map(s=>'Sev '+s), datasets:[ { label:'Avg Lifespan (biz hrs)', data:sevAvg.map(h=>+h.toFixed(2)), backgroundColor:sevs.map(s=>SEV_COLOR[s]||'#94a3b8'), borderWidth:0, borderRadius:6 } ] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>fmtH(ctx.raw)}} }, scales:{ x:{ticks:{color:'#5f6368'},grid:{display:false}}, y:{ticks:{color:'#5f6368',callback:v=>fmtH(v)},grid:{color:'rgba(0,0,0,0.06)'}} } }
  });
  // ── Lifespan SLA Breach by Severity ──────────────────────────────────
  const lsBreachBySev = sevs.map(s => {
    const ts   = withLS.filter(t=>t.sev===s);
    const brch = ts.filter(t=>t.lifespanIsBreached).length;
    const ok   = ts.length - brch;
    return { eosBrch: FILTERED.filter(t=>t.sev===s&&t.isBreached).length, lsBrch: brch, ok, total: ts.length };
  });
  new Chart(document.getElementById('chart-lifespan-breach-sev').getContext('2d'), {
    type:'bar',
    data:{ labels:sevs.map(s=>'Sev '+s), datasets:[
      { label:'On Track',          data:lsBreachBySev.map(d=>d.ok),      backgroundColor:'rgba(99,102,241,.3)',  borderColor:'#6366f1', borderWidth:2, borderRadius:{topLeft:0,topRight:0,bottomLeft:5,bottomRight:5}, borderSkipped:false },
      { label:'Lifespan Breached', data:lsBreachBySev.map(d=>d.lsBrch),  backgroundColor:'rgba(249,115,22,.3)', borderColor:'#e8710a', borderWidth:2, borderRadius:{topLeft:5,topRight:5,bottomLeft:0,bottomRight:0}, borderSkipped:false },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, labels:{ color:'#3c4043', font:{size:11} } },
        tooltip:{ callbacks:{ label:ctx=>{ const d=lsBreachBySev[ctx.dataIndex]; return `  ${ctx.dataset.label}: ${ctx.parsed.y}${d.total>0?' ('+Math.round(ctx.parsed.y/d.total*100)+'%)':''}`; } } } },
      scales:{ x:{stacked:true,ticks:{color:'#5f6368'},grid:{display:false}}, y:{stacked:true,ticks:{color:'#5f6368'},grid:{color:'rgba(0,0,0,0.06)'}} }
    }
  });

  // ── EOS vs Lifespan SLA comparison — grouped bar by severity ─────────
  new Chart(document.getElementById('chart-lifespan-eos-compare').getContext('2d'), {
    type:'bar',
    data:{ labels:sevs.map(s=>'Sev '+s), datasets:[
      { label:'EOS Breached',      data:lsBreachBySev.map(d=>d.eosBrch), backgroundColor:'rgba(217,48,37,.35)',  borderColor:'#d93025', borderWidth:2, borderRadius:5, borderSkipped:false },
      { label:'Lifespan Breached', data:lsBreachBySev.map(d=>d.lsBrch),  backgroundColor:'rgba(249,115,22,.35)', borderColor:'#e8710a', borderWidth:2, borderRadius:5, borderSkipped:false },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, labels:{ color:'#3c4043', font:{size:11} } },
        tooltip:{ callbacks:{ label:ctx=>{ const d=lsBreachBySev[ctx.dataIndex]; return `  ${ctx.dataset.label}: ${ctx.parsed.y}${d.total>0?' ('+Math.round(ctx.parsed.y/d.total*100)+'%)':''}`; } } } },
      scales:{ x:{ticks:{color:'#5f6368'},grid:{display:false}}, y:{ticks:{color:'#5f6368'},grid:{color:'rgba(0,0,0,0.06)'}} }
    }
  });

}

function renderTable() {
  const colFiltered = Object.keys(colSearchFilters).length ? FILTERED.filter(colSearchMatch) : FILTERED;
  const sorted = [...colFiltered].sort((a,b) => {
    let av=a[sortCol], bv=b[sortCol];
    if (av==null) av=sortDir<0?-Infinity:Infinity;
    if (bv==null) bv=sortDir<0?-Infinity:Infinity;
    if (typeof av==='string') return sortDir*av.localeCompare(bv);
    return sortDir*(av-bv);
  });
  const total     = sorted.length;
  const pageCount = Math.ceil(total/PAGE_SIZE);
  if (page>pageCount&&pageCount>0) page=pageCount;
  const start    = (page-1)*PAGE_SIZE;
  const end      = Math.min(start+PAGE_SIZE,total);
  const pageRows = sorted.slice(start,end);

  const colFilterActive = Object.keys(colSearchFilters).length > 0;
  document.getElementById('table-count').textContent = colFilterActive
    ? `${total} of ${FILTERED.length} tickets (column filter active)`
    : `${total} tickets`;
  document.getElementById('pg-info').textContent     = `${start+1}-${end} of ${total}`;
  document.getElementById('pg-prev').disabled        = page<=1;
  document.getElementById('pg-next').disabled        = page>=pageCount;

  document.querySelectorAll('#tickets-table thead th').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    if (th.dataset.col===sortCol) th.classList.add(sortDir>0?'sort-asc':'sort-desc');
  });

  const tbody = document.getElementById('tickets-tbody');
  tbody.innerHTML = pageRows.map(t => {
    const pct      = t.slaCap>0 ? Math.min(100,Math.round(t.eosHours/t.slaCap*100)) : 0;
    const pctColor = t.isBreached?'#d93025':pct>70?'#f9ab00':'#1e8e3e';
    const lsPct    = t.slaCap>0 ? Math.min(100,Math.round((t.lifespanBizHours||0)/t.slaCap*100)) : 0;
    const assigneeHtml  = `<span class="pcell">${badgeImg(t.assigneeName||'',22)}<span class="pcell-name">${t.assigneeName||'—'}</span></span>`;
    const requesterHtml = `<span class="pcell">${badgeImg(t.requester||'',22)}<span class="pcell-name">${t.requester||'—'}</span></span>`;
    return `<tr data-shortid="${t.shortId}" style="cursor:pointer;" title="Click to view ticket details">
      <td class="tid"><a href="https://t.corp.amazon.com/${t.shortId}" target="_blank">${t.shortId}</a></td>
      <td><span class="sev s${t.sev||5}">${t.sev||'?'}</span></td>
      <td><span class="sdot"><span class="dot dot-${t.status}"></span>${t.status}</span></td>
      <td>${assigneeHtml}</td>
      <td>${requesterHtml}</td>
      <td>${t.city||'—'}</td>
      <td>${t.country||'—'}</td>
      <td>${t.buildingId||'—'}</td>
      <td class="tc">${t.rootCause||'—'}</td>
      <td>${t.closureCode||'—'}</td>
      <td>
        <div class="pct-bar" title="EOS: ${fmtH(t.eosHours)} (${pct}%)${t.lifespanBizHours>0?' | Lifespan: '+fmtH(t.lifespanBizHours)+' ('+lsPct+'%)':''}">
          <span style="min-width:34px;text-align:right;font-family:var(--mono);">${fmtH(t.eosHours)}</span>
          <div style="display:flex;flex-direction:column;gap:2px;flex:1;">
            <div class="pct-track"><div class="pct-fill" style="width:${pct}%;background:${pctColor};"></div></div>
            ${t.lifespanBizHours>0?`<div class="pct-track" style="opacity:.7;"><div class="pct-fill" style="width:${lsPct}%;background:${t.lifespanIsBreached?'#e8710a':'#6366f1'};"></div></div>`:''}
          </div>
          <span style="font-size:9px;color:var(--text3);font-family:var(--mono);">${pct}%</span>
        </div>
      </td>
      <td style="font-family:var(--mono);font-size:11px;color:${t.lifespanBizHours>0?(t.lifespanIsBreached?'#d93025':t.lifespanCalDays>10?'#f9ab00':'#6366f1'):'var(--text3)'};" title="${t.lifespanIsBreached?'Lifespan BREACHED vs SLA cap':'Lifespan within cap'}">${t.lifespanBizHours > 0 ? fmtH(t.lifespanBizHours)+(t.lifespanIsBreached?' 🕐':'') : '—'}</td>
      <td style="font-size:11px;text-align:center;color:${t.lifespanCalDays>10?'#f9ab00':'var(--text2)'};">${t.lifespanCalDays > 0 ? t.lifespanCalDays+'d' : '—'}</td>
      <td>
        ${t.isBreached?'<span class="breach">EOS</span>':'<span class="ok">EOS ✓</span>'}
        ${t.lifespanIsBreached?'<span class="breach" style="margin-left:3px;background:rgba(249,115,22,.15);border-color:#e8710a;color:#e8710a;">🕐 LIFE</span>':''}
      </td>
      <td style="text-align:center;">${t.totalBounces > 0
        ? `<span style="font-size:11px;font-weight:700;color:#d93025;font-family:var(--mono);">${t.totalBounces}×</span>`
        : `<span style="font-size:10px;color:var(--text3);">—</span>`}</td>
      <td style="text-align:center;">${t.totalResolves > 1
        ? `<span style="font-size:11px;font-weight:700;color:#e8710a;font-family:var(--mono);" title="Resolved ${t.totalResolves} times">${t.totalResolves}×</span>`
        : `<span style="font-size:10px;color:var(--text3);">1×</span>`}</td>
      <td>${t.resolvedDate||'—'}</td>
    </tr>`;
  }).join('');

  // Wire each row to open the detail modal
  tbody.querySelectorAll('tr[data-shortid]').forEach(tr => {
    tr.addEventListener('click', e => {
      // Don't open modal if user clicked the ticket link itself
      if (e.target.closest('a')) return;
      const id = tr.dataset.shortid;
      const ticket = FILTERED.find(t => t.shortId === id) || ALL.find(t => t.shortId === id);
      if (ticket) openTicketModal(ticket);
    });
  });
}

// ── Ticket Detail Modal ────────────────────────────────────────────────
function closeTicketModal() {
  document.getElementById('ticket-modal-backdrop').style.display = 'none';
}

function openTicketModal(t) {
  const a  = t.slaAnalysis || {};
  const pct = t.slaCap > 0 ? Math.min(100, (t.eosHours / t.slaCap) * 100) : 0;
  const isBreached = t.isBreached;
  const SEV_BG = { 1:'#d93025',2:'#e8710a',3:'#f9ab00',4:'#1e8e3e',5:'#94a3b8' };
  const color = isBreached ? '#d93025' : pct >= 75 ? '#f9ab00' : pct >= 50 ? '#ffd700' : '#1e8e3e';
  const label = isBreached ? 'BREACHED' : pct >= 75 ? 'AT RISK' : pct >= 50 ? 'WARNING' : 'ON TRACK';

  // Header
  const sevBadge = document.getElementById('tm-sev-badge');
  sevBadge.textContent = t.sev || '?';
  sevBadge.style.background = SEV_BG[t.sev] || '#94a3b8';

  const tmId = document.getElementById('tm-id');
  tmId.textContent = t.shortId;
  tmId.href = `https://t.corp.amazon.com/${t.shortId}`;

  const statusBadge = document.getElementById('tm-status-badge');
  statusBadge.textContent = t.status === 'resolved' ? '✓ Resolved' : '● Open';
  statusBadge.style.background = t.status === 'resolved' ? 'var(--accent2-lt)' : 'var(--warn-lt)';
  statusBadge.style.color = t.status === 'resolved' ? 'var(--accent2)' : 'var(--warn)';
  statusBadge.style.border = `1px solid ${t.status === 'resolved' ? 'rgba(30,142,62,.3)' : 'rgba(249,171,0,.3)'}`;

  const slaBadge = document.getElementById('tm-sla-badge');
  slaBadge.textContent = isBreached ? '🚨 EOS ' + label : '✅ EOS ' + label;
  slaBadge.style.background = isBreached ? 'var(--danger-lt)' : pct >= 75 ? 'var(--warn-lt)' : 'var(--accent2-lt)';
  slaBadge.style.color = color;
  slaBadge.style.border = `1px solid ${color}44`;
  // Lifespan breach badge
  const lsBadgeEl = document.getElementById('tm-lifespan-badge');
  if (lsBadgeEl) {
    const lsPctM = t.slaCap > 0 ? Math.min(100, Math.round(t.lifespanBizHours / t.slaCap * 100)) : 0;
    if (t.lifespanBizHours > 0) {
      lsBadgeEl.style.display = '';
      lsBadgeEl.textContent   = t.lifespanIsBreached ? `🕐 LIFESPAN BREACH (${lsPctM}%)` : `🕐 LIFESPAN OK (${lsPctM}%)`;
      lsBadgeEl.style.background = t.lifespanIsBreached ? 'rgba(249,115,22,.12)' : 'var(--accent2-lt)';
      lsBadgeEl.style.color      = t.lifespanIsBreached ? '#e8710a' : 'var(--accent2)';
      lsBadgeEl.style.border     = `1px solid ${t.lifespanIsBreached ? '#e8710a' : 'var(--accent2)'}44`;
    } else {
      lsBadgeEl.style.display = 'none';
    }
  }

  document.getElementById('tm-title').textContent = t.pageTitle || t.titleText || t.shortId;

  // Body
  const body = document.getElementById('tm-body');
  const _tzFmt = t.slaAnalysis?.region?.timezone || null;
  const fmtDt = iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    const opts = {weekday:'short',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'};
    if (_tzFmt) { try { return d.toLocaleString(undefined,{...opts,timeZone:_tzFmt}); } catch(_) {} }
    return d.toLocaleString(undefined, opts);
  };
  const fmtD  = iso => iso ? iso.slice(0,10) : '—';

  // Helper: section header
  const sec = txt => `<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);display:flex;align-items:center;gap:8px;"><span>${txt}</span><div style="flex:1;height:1px;background:var(--border);"></div></div>`;

  // Helper: info row
  const row = (label, val, mono=false, vc='var(--text2)') =>
    `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;border-bottom:1px solid var(--border);gap:12px;">
      <span style="font-size:11px;color:var(--text3);flex-shrink:0;">${label}</span>
      <span style="font-size:11px;font-weight:600;color:${vc};${mono?'font-family:var(--mono);':''}text-align:right;">${val}</span>
    </div>`;

  let html = '';

  // ── SLA Gauge ──
  const pctClamped = Math.min(100, Math.round(pct));
  const lsPctModal = t.slaCap > 0 ? Math.min(100, Math.round((t.lifespanBizHours || 0) / t.slaCap * 100)) : 0;
  const lsColor    = t.lifespanIsBreached ? '#e8710a' : lsPctModal >= 75 ? '#f9ab00' : '#6366f1';
  html += sec('SLA Consumption');
  html += `<div style="margin-top:4px;">
    <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:4px;">⏱ EOS Time</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <span style="font-size:13px;font-weight:700;color:${color};">${fmtH(t.eosHours)} <span style="font-size:10px;font-weight:500;color:var(--text3);">of ${fmtH(t.slaCap)} cap</span></span>
      <span style="font-size:22px;font-weight:800;font-family:var(--mono);color:${color};">${pctClamped}%</span>
    </div>
    <div style="height:12px;background:var(--surface3);border-radius:8px;overflow:hidden;margin-bottom:6px;">
      <div style="height:100%;width:${pctClamped}%;background:linear-gradient(90deg,${color}99,${color});border-radius:8px;transition:width .5s;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);font-family:var(--mono);">
      <span>0h</span><span style="color:${color};font-weight:600;">${isBreached ? '⛔ Exceeded by ' + fmtH(t.eosHours - t.slaCap) : fmtH(t.slaCap - t.eosHours) + ' remaining'}</span><span>${fmtH(t.slaCap)}</span>
    </div>
  </div>`;
  if (t.lifespanBizHours > 0) {
    html += `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:${t.lifespanIsBreached?'rgba(249,115,22,.07)':'rgba(99,102,241,.06)'};border:1px solid ${t.lifespanIsBreached?'rgba(249,115,22,.25)':'rgba(99,102,241,.2)'};">
      <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:4px;">🕐 Full Lifespan (created → resolved)</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:13px;font-weight:700;color:${lsColor};">${fmtH(t.lifespanBizHours)} <span style="font-size:10px;font-weight:500;color:var(--text3);">of ${fmtH(t.slaCap)} cap</span></span>
        <span style="font-size:22px;font-weight:800;font-family:var(--mono);color:${lsColor};">${lsPctModal}%</span>
      </div>
      <div style="height:12px;background:var(--surface3);border-radius:8px;overflow:hidden;margin-bottom:6px;">
        <div style="height:100%;width:${lsPctModal}%;background:linear-gradient(90deg,${lsColor}99,${lsColor});border-radius:8px;transition:width .5s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);font-family:var(--mono);">
        <span>0h</span>
        <span style="color:${lsColor};font-weight:600;">${t.lifespanIsBreached ? '⛔ Exceeded by ' + fmtH(t.lifespanBizHours - t.slaCap) : fmtH(t.slaCap - t.lifespanBizHours) + ' remaining'}</span>
        <span>${fmtH(t.slaCap)}</span>
      </div>
      ${t.lifespanIsBreached && !isBreached ? '<div style="font-size:10px;color:#e8710a;margin-top:6px;font-weight:600;">ℹ️ EOS worked within cap — delay was in Triage/pre-assignment time</div>' : ''}
    </div>`;
  }

  // ── Key info ──
  html += sec('Ticket Info');
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;">`;
  html += row('Severity', `Sev ${t.sev || '?'}`, true, SEV_BG[t.sev] || '#94a3b8');
  html += row('Assignee', t.assigneeName || '—', true);
  html += row('Requester', t.requester || '—', true);
  html += row('City', t.city || '—');
  html += row('Country', t.country || '—');
  html += row('Building', t.buildingId || '—', true);
  html += row('Category', t.category || '—');
  html += row('Root Cause', t.rootCause || '—');
  html += row('Closure', t.closureCode || '—');
  html += row('Region', a.region?.name || '—');
  html += `</div>`;

  // ── Timeline ──
  html += sec('Timeline');
  const firstEntry = a.firstEosEntry || t.eosIntervals?.[0]?.start;
  const endMoment  = a.endMoment || t.resolvedDate;
  const deadline   = a.slaDeadline;
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;">`;
  html += row('First EOS Entry', fmtDt(firstEntry), true);
  html += row(t.status==='resolved'?'Resolved At':'As of Now', fmtDt(endMoment), true);
  html += row('SLA Deadline', fmtDt(deadline), true, a.deadlinePassed ? '#d93025' : '#1e8e3e');
  html += row('Calendar Span', a.calendarSpanDays != null ? `${a.calendarSpanDays}d ${Math.round((a.calendarSpanHours||0)%24)}h` : '—');
  html += row('Cal. Time with EOS', a.calTimeWithEosDays != null ? `${a.calTimeWithEosDays}d ${Math.round((a.calTimeWithEosH||0)%24)}h` : '—');
  html += row('Cal. Time in Triage', a.calTimeInTriageDays != null ? `${a.calTimeInTriageDays}d ${Math.round((a.calTimeInTriageH||0)%24)}h` : (a.hasBounce ? '—' : 'No bounce'));
  html += row('Working Days w/ EOS', a.workDays != null ? `${a.workDays} days` : '—');
  html += row('Weekend Days Skipped', a.weekendDaysSkipped != null ? `${a.weekendDaysSkipped} days` : '—');
  html += `</div>`;

  // ── SLA cap breakdown — EOS + Lifespan side by side ──
  html += sec('SLA Cap Reference');
  const SLA_DAYS = { 4:2, 5:5 };
  const WORK_HRS = a.region?.workDayHours || 9;
  // Two metric rows: EOS hours, then Lifespan hours (if available)
  [
    { icon:'⏱', lbl:'EOS Time', hrs: t.eosHours,         note:'EOS business hours' },
    ...(t.lifespanBizHours > 0 ? [{ icon:'🕐', lbl:'Full Lifespan', hrs: t.lifespanBizHours, note:'Created→resolved' }] : []),
  ].forEach(capRow => {
    html += `<div style="margin-bottom:10px;"><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:5px;">${capRow.icon} ${capRow.lbl} — ${capRow.note}</div>`;
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;">`;
    [4,5].forEach(s => {
      const cap   = (SLA_DAYS[s] || 2) * WORK_HRS;
      const p2    = Math.min(100, (capRow.hrs / cap) * 100);
      const isCur = s === t.sev;
      const bc    = p2 >= 100 ? '#d93025' : p2 >= 75 ? '#f9ab00' : '#1e8e3e';
      html += `<div style="flex:1;min-width:130px;padding:9px 12px;border-radius:10px;background:${isCur?'var(--surface3)':'transparent'};border:1px solid ${isCur?'var(--border2)':'var(--border)'};${isCur?'':'opacity:.65;'}">
        <div style="font-size:10px;font-weight:700;color:${isCur?'var(--text)':'var(--text3)'};margin-bottom:4px;">Sev ${s} — ${SLA_DAYS[s]||2} days${isCur?' ← this':''}</div>
        <div style="font-size:11px;font-family:var(--mono);color:${bc};font-weight:700;margin-bottom:5px;">${Math.round(p2)}% · ${p2>=100?'⛔ +'+fmtH(capRow.hrs-cap):fmtH(cap-capRow.hrs)+' left'}</div>
        <div style="height:6px;background:var(--surface3);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${Math.min(100,Math.round(p2))}%;background:${bc};border-radius:4px;"></div></div>
      </div>`;
    });
    html += '</div></div>';
  });

  // ── Day breakdown ──
  const breakdown = a.dayBreakdown || [];
  if (breakdown.length) {
    html += sec('Business Hours Per Day');
    const maxH = Math.max(...breakdown.map(d => d.hours), WORK_HRS);
    html += `<div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;padding:4px 0;">`;
    breakdown.forEach(d => {
      const bh  = (d.hours / maxH) * 80;
      const isP = d.hours < WORK_HRS - 0.1;
      const bc  = isP ? '#f9ab00' : '#1e8e3e';
      html += `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:36px;" title="${d.date}: ${fmtH(d.hours)}">
        <span style="font-size:9px;font-weight:700;color:${bc};font-family:var(--mono);">${fmtH(d.hours)}</span>
        <div style="width:28px;height:${Math.max(4,Math.round(bh))}px;background:${bc}44;border:1px solid ${bc}88;border-radius:4px 4px 0 0;"></div>
        <span style="font-size:8px;color:var(--text3);font-family:var(--mono);text-align:center;line-height:1.2;">${d.date.split(',')[0]}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // ── EOS Stints ──
  const stints = a.eosStints || t.eosIntervals?.map((iv,i)=>({idx:i+1,start:iv.start,end:iv.end,hours:null})) || [];
  if (stints.length) {
    html += sec(`EOS Stints (${stints.length})`);
    stints.forEach(st => {
      const dur = st.hours != null ? fmtH(st.hours) : '';
      html += `<div style="background:var(--accent2-lt);border:1px solid rgba(30,142,62,.25);border-radius:8px;padding:9px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div>
          <span style="font-size:10px;font-weight:700;color:var(--accent2);">Stint #${st.idx}</span>
          <div style="font-size:10px;color:var(--text2);font-family:var(--mono);margin-top:2px;">${fmtDt(st.start)} → ${fmtDt(st.end)}</div>
        </div>
        ${dur ? `<span style="font-size:14px;font-weight:800;font-family:var(--mono);color:var(--accent2);">${dur}</span>` : ''}
      </div>`;
    });
  }

  // ── Lifetime History ──
  const lifetimeBounces  = t.totalBounces  ?? 0;
  const lifetimeResolves = t.totalResolves ?? 1;
  const reopens          = t.reopenCycles  || [];
  const createdAt        = t.ticketCreatedAt;
  const firstResolved    = t.firstResolvedAt;

  // ── Ticket Lifespan ──
  const _ls = t.slaAnalysis?.ticketLifespan || t.noEosAnalysis?.ticketLifespan || null;
  if (_ls && _ls.createdAt) {
    html += sec('Ticket Lifespan (Created → Resolved)');
    html += `<div style="background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:12px 16px;margin-bottom:4px;">`;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;">`;
    html += row('Ticket Created', fmtDt(_ls.createdAt), true, '#6366f1');
    html += row(_ls.isEstimate ? 'As of Now (open)' : 'Resolved', fmtDt(_ls.resolvedAt || new Date().toISOString()), true, _ls.isEstimate ? '#f9ab00' : '#1e8e3e');
    html += row('Calendar Span', _ls.calendarDays + 'd ' + Math.round(_ls.calendarHours % 24) + 'h', true);
    html += row('Business Hours (excl. weekends)', fmtH(_ls.businessHours), true, _ls.calendarDays > 10 ? '#f9ab00' : '#6366f1');
    html += row('Working Days Active', _ls.workDays + 'd', true, _ls.calendarDays > 10 ? '#f9ab00' : '#6366f1');
    if (_ls.weekendDaysSkipped > 0) html += row('Weekend/Off Days Skipped', _ls.weekendDaysSkipped + 'd', true, 'var(--text3)');
    if (t.eosHours > 0 && _ls.businessHours > 0) {
      const eosShare = Math.round(t.eosHours / _ls.businessHours * 100);
      html += row('EOS Share of Lifespan', eosShare + '%', true, eosShare > 80 ? '#1e8e3e' : eosShare > 50 ? '#f9ab00' : '#d93025');
    }
    html += `</div>`;
    if (_ls.isEstimate) html += `<div style="font-size:10px;color:#f9ab00;margin-top:6px;">⚠ Ticket is still open — lifespan measured up to now</div>`;
    html += `</div>`;
  }

  if (lifetimeResolves > 1 || lifetimeBounces > 0 || reopens.length > 0) {
    html += sec('Ticket Lifetime History');
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;">`;
    if (createdAt)     html += row('Ticket Created',    fmtDt(createdAt),    true);
    if (firstResolved) html += row('First Resolved',    fmtDt(firstResolved), true);
    html += row('Times Resolved', lifetimeResolves + '×', true, lifetimeResolves > 1 ? '#e8710a' : undefined);
    html += row('Total Bounces (lifetime)', lifetimeBounces > 0 ? lifetimeBounces + '×' : 'None', true, lifetimeBounces > 0 ? '#d93025' : '#1e8e3e');
    html += `</div>`;
    if (reopens.length > 0) {
      html += `<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin:10px 0 6px;">Re-open Cycles After First Resolve</div>`;
      reopens.forEach((cyc, ci) => {
        const hasEos = cyc.eosIntervals?.length > 0;
        const cycColor = hasEos ? 'var(--accent2)' : 'var(--text3)';
        const cycBg    = hasEos ? 'var(--accent2-lt)' : 'var(--surface3)';
        const cycBorder = hasEos ? 'rgba(30,142,62,.25)' : 'var(--border)';
        html += `<div style="background:${cycBg};border:1px solid ${cycBorder};border-radius:8px;padding:9px 12px;margin-bottom:6px;">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">`;
        html += `<span style="font-size:10px;font-weight:700;color:${cycColor};">Re-open ${ci+1}${hasEos ? '' : ' — no EOS time'}</span>`;
        html += `<span style="font-size:10px;color:var(--text3);">${cyc.resolvedAt ? 'Resolved ' + fmtDt(cyc.resolvedAt) : 'Still open'}</span>`;
        html += `</div>`;
        if (cyc.openedAt)    html += `<div style="font-size:10px;color:var(--text2);font-family:var(--mono);">Re-opened: ${fmtDt(cyc.openedAt)}</div>`;
        if (cyc.bounceCount) html += `<div style="font-size:10px;color:#d93025;margin-top:2px;">↩ ${cyc.bounceCount} bounce${cyc.bounceCount!==1?'s':''} to Triage in this cycle</div>`;
        (cyc.eosIntervals || []).forEach((iv, ii) => {
          html += `<div style="font-size:10px;color:var(--text2);font-family:var(--mono);margin-top:3px;padding-left:8px;border-left:2px solid rgba(30,142,62,.3);">EOS stint ${ii+1}: ${fmtDt(iv.start)} → ${fmtDt(iv.end)}</div>`;
        });
        html += `</div>`;
      });
    }
  }

  // ── Region ──
  const reg = a.region;
  if (reg) {
    html += sec('Working Schedule');
    const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const workSet = new Set(reg.workDays || []);
    html += `<div style="display:flex;flex-direction:column;gap:6px;">`;
    html += row('Region', reg.name || '—');
    html += row('Working Hours', `${reg.workStart || '08:00'} - ${reg.workEnd || '17:00'} (${reg.workDayHours || 9}h/day)`, true);
    html += `<div style="display:flex;gap:4px;flex-wrap:wrap;padding-top:4px;">`;
    [0,1,2,3,4,5,6].forEach(d => {
      const isWork = workSet.has(d);
      html += `<span style="padding:3px 9px;border-radius:5px;font-size:10px;font-weight:700;${isWork?'background:var(--accent2-lt);border:1px solid rgba(30,142,62,.3);color:var(--accent2);':'background:var(--danger-lt);border:1px solid rgba(217,48,37,.2);color:var(--danger);text-decoration:line-through;'}">${DOW[d]}</span>`;
    });
    html += `</div></div>`;
  }

  body.innerHTML = html;
  document.getElementById('ticket-modal-backdrop').style.display = 'block';
}

// ── CSV Export ─────────────────────────────────────────────────────────
// Mirrors the Excel "All Tickets" export (same columns/values), minus the
// embedded photo column, and including Case ID and Created Date.
function exportCSV() {
  const cols = EXP_COLS.filter(c => c.key !== '_assigneePhoto');
  const esc = v => {
    v = (v == null) ? '' : String(v);
    return (v.includes(',') || v.includes('"') || v.includes('\n'))
      ? '"' + v.replace(/"/g, '""') + '"'
      : v;
  };
  const data = expDataset('all');
  const rows = [cols.map(c => esc(c.header)).join(',')];
  data.forEach(t => {
    rows.push(cols.map(c => esc(expRowValue(t, c.key))).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sla-analytics-all-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ── Full-detail "Print table CSV" ──────────────────────────────────────
// Dumps EVERY row currently shown in the All Tickets table (respecting the
// active column-search filters AND the active sort order, across all pages —
// not just the visible page) with the maximum amount of information available.
const TABLE_CSV_COLS = [
  { key:'shortId',          header:'Ticket ID' },
  { key:'_ticketUrl',       header:'Ticket URL' },
  { key:'_caseId',          header:'Case ID' },
  { key:'pageTitle',        header:'Title' },
  { key:'sev',              header:'Severity' },
  { key:'status',           header:'Status' },
  { key:'_isResolved',      header:'Is Resolved' },
  { key:'assigneeName',     header:'Assignee' },
  { key:'requester',        header:'Requester' },
  { key:'city',             header:'City' },
  { key:'country',          header:'Country' },
  { key:'_region',          header:'Region' },
  { key:'buildingId',       header:'Building' },
  { key:'_siteCode',        header:'Site Code' },
  { key:'rootCause',        header:'Root Cause' },
  { key:'closureCode',      header:'Closure Code' },
  { key:'_slaCap',          header:'SLA Cap (h)' },
  { key:'_eosHours',        header:'EOS Biz Hours' },
  { key:'_eosPct',          header:'EOS % of SLA' },
  { key:'_eosBreach',       header:'EOS Breach?' },
  { key:'_lifeHours',       header:'Lifespan Biz Hours' },
  { key:'_lifePct',         header:'Lifespan % of SLA' },
  { key:'_lifeBreach',      header:'Lifespan Breach?' },
  { key:'_lifeDays',        header:'Lifespan Cal Days' },
  { key:'_lifeWorkDays',    header:'Lifespan Work Days' },
  { key:'_lifeEstimate',    header:'Lifespan Estimated?' },
  { key:'_stints',          header:'EOS Stints' },
  { key:'_hasBounce',       header:'Has Bounce?' },
  { key:'_bounces',         header:'Total Bounces' },
  { key:'_resolves',        header:'Resolve Count' },
  { key:'_wasReopened',     header:'Was Reopened?' },
  { key:'_reopenCount',     header:'Reopen Cycles' },
  { key:'_createdDate',     header:'Created (ISO)' },
  { key:'_firstResolved',   header:'First Resolved (ISO)' },
  { key:'_resolvedLocal',   header:'Resolved (region local)' },
  { key:'_resolvedFull',    header:'Resolved (ISO)' },
  { key:'_timezone',        header:'Region Timezone' },
  { key:'_firstEosDate',    header:'First EOS Date' },
  { key:'_firstEosHour',    header:'First EOS Hour' },
  { key:'_firstEosDow',     header:'First EOS DoW' },
  { key:'_checkedHour',     header:'Resolved Hour' },
  { key:'_checkedDow',      header:'Resolved DoW' },
];

function tableCsvValue(t, key) {
  const r2  = n => (n==null||isNaN(n)) ? '' : Math.round(n*10)/10;
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  switch (key) {
    case '_ticketUrl':    return t.shortId ? `https://t.corp.amazon.com/${t.shortId}` : '';
    case '_caseId':       return t.caseId ?? '';
    case '_isResolved':   return t.status === 'resolved' ? 'Yes' : 'No';
    case '_region':       return t.slaAnalysis?.region?.name || t.regionTimezone || '';
    case '_siteCode':     return t.siteCode ?? '';
    case '_slaCap':       return r2(t.slaCap);
    case '_eosHours':     return r2(t.eosHours);
    case '_eosPct':       return t.slaCap>0 ? Math.round(t.eosHours/t.slaCap*100) : '';
    case '_eosBreach':    return t.isBreached ? 'BREACH' : 'OK';
    case '_lifeHours':    return t.lifespanBizHours>0 ? r2(t.lifespanBizHours) : '';
    case '_lifePct':      return (t.slaCap>0 && t.lifespanBizHours>0) ? Math.round(t.lifespanBizHours/t.slaCap*100) : '';
    case '_lifeBreach':   return t.lifespanBizHours>0 ? (t.lifespanIsBreached?'BREACH':'OK') : '';
    case '_lifeDays':     return t.lifespanCalDays>0 ? t.lifespanCalDays : '';
    case '_lifeWorkDays': return t.lifespanWorkDays>0 ? t.lifespanWorkDays : '';
    case '_lifeEstimate': return t.lifespanBizHours>0 ? (t.lifespanIsEstimate?'Yes':'No') : '';
    case '_stints':       return t.stints ?? '';
    case '_hasBounce':    return t.hasBounce ? 'Yes' : 'No';
    case '_bounces':      return t.totalBounces||0;
    case '_resolves':     return t.totalResolves||1;
    case '_wasReopened':  return t.wasReopened ? 'Yes' : 'No';
    case '_reopenCount':  return Array.isArray(t.reopenCycles) ? t.reopenCycles.length : 0;
    case '_createdDate':  return t.ticketCreatedAt || t.createdDate || '';
    case '_firstResolved':return t.firstResolvedAt || '';
    case '_resolvedFull': return t.resolvedAtFull || '';
    case '_resolvedLocal': {
      const iso = t.resolvedAtFull;
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return '';
      try {
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: t.regionTimezone || undefined,
          year:'numeric', month:'2-digit', day:'2-digit',
          hour:'2-digit', minute:'2-digit', hour12:false
        });
        const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
        return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
      } catch(_) { return iso.replace('T',' ').slice(0,16); }
    }
    case '_timezone':     return t.regionTimezone || '';
    case '_firstEosDate': return t.firstEosDate || '';
    case '_firstEosHour': return t.firstEosHour==null ? '' : t.firstEosHour;
    case '_firstEosDow':  return t.firstEosDow==null  ? '' : dow[t.firstEosDow];
    case '_checkedHour':  return t.checkedHour==null  ? '' : t.checkedHour;
    case '_checkedDow':   return t.checkedDow==null   ? '' : dow[t.checkedDow];
    default:              return t[key] ?? '';
  }
}

function exportTableCSV() {
  // Mirror renderTable(): apply the active column-search filters, then the active sort.
  const colFiltered = Object.keys(colSearchFilters).length ? FILTERED.filter(colSearchMatch) : FILTERED;
  const rowsData = [...colFiltered].sort((a,b) => {
    let av=a[sortCol], bv=b[sortCol];
    if (av==null) av=sortDir<0?-Infinity:Infinity;
    if (bv==null) bv=sortDir<0?-Infinity:Infinity;
    if (typeof av==='string') return sortDir*av.localeCompare(bv);
    return sortDir*(av-bv);
  });
  const esc = v => {
    v = (v == null) ? '' : String(v);
    return (/[",\n\r]/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const lines = ['\uFEFF' + TABLE_CSV_COLS.map(c => esc(c.header)).join(',')];
  rowsData.forEach(t => {
    lines.push(TABLE_CSV_COLS.map(c => esc(tableCsvValue(t, c.key))).join(','));
  });
  const blob = new Blob([lines.join('\r\n')], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `all-tickets-table-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// Columns: full analysis. scope = 'all' | 'breach'. embedPhotos = bool.
const EXP_COLS = [
  { key:'shortId',          header:'Ticket ID',         width:14 },
  { key:'_caseId',          header:'Case ID',           width:38 },
  { key:'sev',              header:'Severity',          width:9  },
  { key:'status',           header:'Status',            width:11 },
  { key:'_assigneePhoto',   header:'Photo',             width:7  },
  { key:'assigneeName',     header:'Assignee',          width:20 },
  { key:'requester',        header:'Requester',         width:20 },
  { key:'city',             header:'City',              width:16 },
  { key:'country',          header:'Country',           width:14 },
  { key:'buildingId',       header:'Building',          width:12 },
  { key:'sev',              header:'Sev',               width:6  },
  { key:'_slaCap',          header:'SLA Cap (h)',       width:11 },
  { key:'_eosHours',        header:'EOS (h)',           width:10 },
  { key:'_eosPct',          header:'EOS % of SLA',      width:12 },
  { key:'_eosBreach',       header:'EOS Breach?',       width:11 },
  { key:'_lifeHours',       header:'Lifespan (biz h)',  width:14 },
  { key:'_lifePct',         header:'Lifespan % of SLA', width:15 },
  { key:'_lifeBreach',      header:'Lifespan Breach?',  width:14 },
  { key:'_lifeDays',        header:'Lifespan (cal d)',  width:14 },
  { key:'rootCause',        header:'Root Cause',        width:22 },
  { key:'closureCode',      header:'Closure Code',      width:18 },
  { key:'_bounces',         header:'Bounces',           width:9  },
  { key:'_resolves',        header:'Resolve Count',     width:12 },
  { key:'_createdDate',     header:'Created Date',      width:14 },
  { key:'_resolvedDate',    header:'Resolved Date',     width:20 },
  { key:'_timezone',        header:'Timezone',          width:18 },
  { key:'pageTitle',        header:'Title',             width:40 },
];

function expRowValue(t, key) {
  const r2 = n => (n==null||isNaN(n)) ? '' : Math.round(n*10)/10;
  switch (key) {
    case '_slaCap':     return r2(t.slaCap);
    case '_eosHours':   return r2(t.eosHours);
    case '_eosPct':     return t.slaCap>0 ? Math.round(t.eosHours/t.slaCap*100) : '';
    case '_eosBreach':  return t.isBreached ? 'BREACH' : 'OK';
    case '_lifeHours':  return t.lifespanBizHours>0 ? r2(t.lifespanBizHours) : '';
    case '_lifePct':    return (t.slaCap>0 && t.lifespanBizHours>0) ? Math.round(t.lifespanBizHours/t.slaCap*100) : '';
    case '_lifeBreach': return t.lifespanBizHours>0 ? (t.lifespanIsBreached?'BREACH':'OK') : '';
    case '_lifeDays':   return t.lifespanCalDays>0 ? t.lifespanCalDays : '';
    case '_bounces':    return t.totalBounces||0;
    case '_resolves':   return t.totalResolves||1;
    case '_assigneePhoto': return '';
    case '_caseId':        return t.caseId ?? '';
    case '_createdDate':   return t.ticketCreatedAt || t.createdDate || '';
    case '_resolvedDate': {
      const iso = t.resolvedAtFull;
      if (!iso) return '';
      const tz = t.regionTimezone || null;
      const d  = new Date(iso);
      if (isNaN(d)) return '';
      // YYYY-MM-DD HH:mm in the ticket's region timezone (TZ shown in its own column).
      try {
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz || undefined,
          year:'numeric', month:'2-digit', day:'2-digit',
          hour:'2-digit', minute:'2-digit', hour12:false
        });
        const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
      } catch(_) {
        return iso.replace('T', ' ').slice(0, 16);
      }
    }
    case '_timezone':      return t.resolvedAtFull ? (t.regionTimezone || '') : '';
    default:            return t[key] ?? '';
  }
}

function expDataset(scope) {
  const base = (Object.keys(colSearchFilters).length ? FILTERED.filter(colSearchMatch) : FILTERED);
  return scope==='breach' ? base.filter(t => t.isBreached || t.lifespanIsBreached) : base;
}

// Fetch a badge photo as base64; resolves null on any failure.
function fetchBadgeB64(login) {
  return new Promise(resolve => {
    if (!login || login==='—') return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 48; c.height = 48;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 48, 48);
        resolve(c.toDataURL('image/png').split(',')[1]);
      } catch(_) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = BADGE_BASE + encodeURIComponent(login);
  });
}

async function exportExcel(scope, embedPhotos) {
  const data = expDataset(scope);
  if (!data.length) { alert('No tickets to export for this scope.'); return; }

  // Fallback: ExcelJS missing → SheetJS sheet (no images, but full data).
  if (typeof ExcelJS === 'undefined') {
    const aoa = [EXP_COLS.filter(c=>c.key!=='_assigneePhoto').map(c=>c.header)];
    data.forEach(t => aoa.push(EXP_COLS.filter(c=>c.key!=='_assigneePhoto').map(c=>expRowValue(t,c.key))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, scope==='breach'?'Out of SLA':'All Tickets');
    XLSX.writeFile(wb, `sla-analytics-${scope}.xlsx`);
    return;
  }

  const btn = document.getElementById('btn-export-xlsx');
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Building…'; }

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EOS Analytics';
    const ws = wb.addWorksheet(scope==='breach' ? 'Out of SLA' : 'All Tickets', {
      views:[{ state:'frozen', ySplit:1 }]
    });

    ws.columns = EXP_COLS.map(c => ({ header:c.header, key:c.key+'__'+c.header, width:c.width }));

    // Header style
    const hdr = ws.getRow(1);
    hdr.height = 20;
    hdr.eachCell(cell => {
      cell.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:10 };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1E3A5F' } };
      cell.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
      cell.border = { bottom:{ style:'thin', color:{ argb:'FF34507A' } } };
    });

    // Pre-fetch photos (deduped by login) if requested.
    const photoMap = {};
    if (embedPhotos) {
      const logins = [...new Set(data.map(t => t.assigneeName).filter(Boolean))];
      const results = await Promise.all(logins.map(l => fetchBadgeB64(l)));
      logins.forEach((l,i) => { if (results[i]) photoMap[l] = wb.addImage({ base64:results[i], extension:'png' }); });
    }

    // Data rows
    data.forEach((t, idx) => {
      const rowObj = {};
      EXP_COLS.forEach(c => { rowObj[c.key+'__'+c.header] = c.key==='_assigneePhoto' ? '' : expRowValue(t, c.key); });
      const row = ws.addRow(rowObj);
      row.height = embedPhotos ? 36 : 16;
      const excelRow = idx + 2; // 1-based, +1 header

      row.eachCell({ includeEmpty:true }, (cell, colNum) => {
        const col = EXP_COLS[colNum-1];
        cell.alignment = { vertical:'middle', horizontal:'left', wrapText:false };
        cell.font = { size:10 };
        if (col && (col.key==='_eosBreach' || col.key==='_lifeBreach')) {
          if (cell.value==='BREACH') cell.font = { size:10, bold:true, color:{ argb:'FFD93025' } };
          else if (cell.value==='OK') cell.font = { size:10, color:{ argb:'FF1E8E3E' } };
          cell.alignment = { vertical:'middle', horizontal:'center' };
        }
      });
      // zebra
      if (idx % 2) row.eachCell({ includeEmpty:true }, c => {
        if (!c.fill) c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF5F7FA' } };
      });

      // Embed photo into the "Photo" column (col index = position of _assigneePhoto)
      if (embedPhotos && t.assigneeName && photoMap[t.assigneeName] != null) {
        const photoColIdx = EXP_COLS.findIndex(c => c.key==='_assigneePhoto'); // 0-based
        ws.addImage(photoMap[t.assigneeName], {
          tl: { col: photoColIdx + 0.15, row: (excelRow-1) + 0.12 },
          ext: { width: 30, height: 30 }
        });
      }
    });

    // Autofilter across full range
    ws.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:EXP_COLS.length } };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sla-analytics-${scope}-${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (err) {
    console.error('Excel export failed', err);
    alert('Excel export failed: ' + (err?.message || err));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

// ── Event wiring ───────────────────────────────────────────────────────
document.getElementById('btn-load-file').addEventListener('click', openFilePicker);
document.getElementById('btn-reload').addEventListener('click', openFilePicker);
document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
{ const _tcsv = document.getElementById('btn-table-csv'); if (_tcsv) _tcsv.addEventListener('click', exportTableCSV); }
// ── Excel export dropdown ──
(function(){
  const wrap = document.getElementById('exp-wrap');
  const btn  = document.getElementById('btn-export-xlsx');
  const menu = document.getElementById('exp-menu');
  if (!wrap || !btn || !menu) return;
  btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) menu.classList.remove('open'); });
  menu.querySelectorAll('.exp-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const scope = item.dataset.scope;
      const embed = document.getElementById('exp-photos')?.checked !== false;
      menu.classList.remove('open');
      exportExcel(scope, embed);
    });
  });
})();
['f-sev','f-assignee','f-requester','f-rootcause','f-closure','f-breach']
  .forEach(id=>document.getElementById(id)?.addEventListener('change',applyFilters));
// Building filter applies directly.
document.getElementById('f-building')?.addEventListener('change', applyFilters);
// City drives the Building dropdown: rebuild buildings for the chosen city, then filter.
document.getElementById('f-city')?.addEventListener('change', ()=>{ populateBuildingOptions(); applyFilters(); });
// Country drives City (which in turn drives Building): rebuild both, then filter.
document.getElementById('f-country')?.addEventListener('change', ()=>{ populateCityOptions(); populateBuildingOptions(); applyFilters(); });
['f-date-from','f-date-to']
  .forEach(id=>document.getElementById(id)?.addEventListener('change',applyFilters));
let searchTimer;
document.getElementById('f-search').addEventListener('input', ()=>{ clearTimeout(searchTimer); searchTimer=setTimeout(applyFilters,200); });

// ── Per-column table search ────────────────────────────────────────────
let colSearchFilters = {};
let colSearchTimer;
document.addEventListener('input', e => {
  const inp = e.target;
  if (!inp.classList.contains('dt-col-search')) return;
  const col = inp.dataset.col;
  const val = inp.value.trim().toLowerCase();
  if (val) colSearchFilters[col] = val;
  else delete colSearchFilters[col];
  clearTimeout(colSearchTimer);
  colSearchTimer = setTimeout(() => { page = 1; renderTable(); }, 200);
});
function colSearchMatch(t) {
  for (const [col, q] of Object.entries(colSearchFilters)) {
    let val = '';
    if (col === 'slaStatus') val = t.isBreached ? 'breach' : 'ok';
    else val = String(t[col] ?? '').toLowerCase();
    if (!val.includes(q)) return false;
  }
  return true;
}
document.getElementById('btn-clear-filters').addEventListener('click', ()=>{
  ['f-sev','f-assignee','f-requester','f-city','f-country','f-building','f-rootcause','f-closure','f-breach']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('f-search').value='';
  document.getElementById('f-date-from').value='';
  document.getElementById('f-date-to').value='';
  populateCityOptions();
  populateBuildingOptions();
  applyFilters();
});
document.querySelectorAll('#tickets-table thead th[data-col]').forEach(th=>{
  th.addEventListener('click',()=>{ const col=th.dataset.col; if(sortCol===col) sortDir*=-1; else { sortCol=col; sortDir=-1; } renderTable(); });
});
document.getElementById('pg-prev').addEventListener('click', ()=>{ page--; renderTable(); });
document.getElementById('pg-next').addEventListener('click', ()=>{ page++; renderTable(); });
document.addEventListener('dragover', e=>e.preventDefault());
document.addEventListener('drop', async e=>{
  e.preventDefault();
  processFileList(Array.from(e.dataTransfer.files));
});

// Re-wire explain buttons that may not have been in DOM at parse time
document.querySelectorAll('.btn-explain').forEach(btn=>{
  btn.addEventListener('click', ()=>openExplain(btn.dataset.explain));
});

// ── Auto-set date input min/max from loaded data ──────────────────────
function setDateInputBounds() {
  const dates = ALL.map(t => t.resolvedDate).filter(Boolean).sort();
  if (!dates.length) return;
  const minD = dates[0], maxD = dates[dates.length-1];
  ['f-date-from','f-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.min = minD; el.max = maxD; }
  });
}


// ── Dark / Light theme toggle ──────────────────────────────────────────
(function() {
  const btn  = document.getElementById('theme-toggle-btn');
  const lbl  = document.getElementById('theme-toggle-lbl');
  const root = document.documentElement;

  // Restore saved preference
  const saved = localStorage.getItem('eos-theme') || 'light';
  root.setAttribute('data-theme', saved);
  if (lbl) lbl.textContent = saved === 'dark' ? 'Dark' : 'Light';

  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') || 'light';
    const next    = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('eos-theme', next);
    if (lbl) lbl.textContent = next === 'dark' ? 'Dark' : 'Light';
  });
})();

// ── Boot ───────────────────────────────────────────────────────────────
boot();

// ══════════════════════════════════════════════════════════════════════
//  LEAFLET MAPS
//  Tile layer: OpenStreetMap (same approach as Leaflet quick-start guide)
//  Coordinates: embedded table — zero external API calls
// ══════════════════════════════════════════════════════════════════════

// ── Embedded coordinate table (city name lowercase → [lat, lon]) ───────
// Cities are matched case-insensitively. Country names are also stored
// as fallback when the city is not found.
var GEO = {
  // Germany
  'munich':[48.137,11.576],'münchen':[48.137,11.576],
  'berlin':[52.520,13.405],'hamburg':[53.551,9.994],
  'frankfurt':[50.110,8.682],'cologne':[50.938,6.960],
  'köln':[50.938,6.960],'stuttgart':[48.775,9.182],
  'düsseldorf':[51.227,6.773],'dusseldorf':[51.227,6.773],'duesseldorf':[51.227,6.773],
  'dortmund':[51.515,7.466],'dresden':[51.050,13.739],
  'leipzig':[51.340,12.374],'nuremberg':[49.452,11.077],'nürnberg':[49.452,11.077],
  'hannover':[52.375,9.732],'mannheim':[49.487,8.466],
  'augsburg':[48.370,10.897],'wiesbaden':[50.083,8.240],
  'mainz':[49.992,8.247],'bielefeld':[52.021,8.532],
  'bonn':[50.736,7.099],'münster':[51.962,7.626],'muenster':[51.962,7.626],
  'karlsruhe':[49.006,8.403],'freiburg':[47.998,7.843],
  'heidelberg':[49.399,8.673],'rostock':[54.092,12.100],
  'erfurt':[50.984,11.030],'kiel':[54.323,10.133],
  // UK
  'london':[51.507,-0.128],'manchester':[53.480,-2.244],
  'birmingham':[52.480,-1.898],'glasgow':[55.861,-4.251],
  'edinburgh':[55.953,-3.189],'bristol':[51.454,-2.588],
  'leeds':[53.800,-1.549],'liverpool':[53.408,-2.991],
  'sheffield':[53.381,-1.470],'newcastle':[54.978,-1.618],
  'cardiff':[51.481,-3.180],'belfast':[54.597,-5.930],
  'nottingham':[52.954,-1.158],'reading':[51.454,-0.973],
  // France
  'paris':[48.857,2.352],'lyon':[45.764,4.836],
  'marseille':[43.297,5.381],'toulouse':[43.605,1.444],
  'bordeaux':[44.837,-0.580],'lille':[50.629,3.057],
  'nice':[43.710,7.262],'nantes':[47.218,-1.554],
  'strasbourg':[48.573,7.752],'montpellier':[43.611,3.877],
  'rennes':[48.114,-1.680],'grenoble':[45.188,5.724],
  // Netherlands
  'amsterdam':[52.370,4.895],'rotterdam':[51.922,4.480],
  'utrecht':[52.091,5.121],'the hague':[52.070,4.300],
  'den haag':[52.070,4.300],'eindhoven':[51.440,5.478],
  'groningen':[53.219,6.568],'tilburg':[51.560,5.091],
  // Spain
  'madrid':[40.416,-3.704],'barcelona':[41.386,2.170],
  'valencia':[39.470,-0.376],'seville':[37.388,-5.982],
  'sevilla':[37.388,-5.982],'bilbao':[43.263,-2.935],
  'málaga':[36.721,-4.422],'malaga':[36.721,-4.422],
  'zaragoza':[41.649,-0.888],'palma':[39.569,2.650],
  // Italy
  'rome':[41.902,12.496],'roma':[41.902,12.496],
  'milan':[45.465,9.186],'milano':[45.465,9.186],
  'turin':[45.070,7.687],'torino':[45.070,7.687],
  'florence':[43.769,11.256],'firenze':[43.769,11.256],
  'naples':[40.852,14.268],'napoli':[40.852,14.268],
  'venice':[45.437,12.335],'venezia':[45.437,12.335],
  'bologna':[44.494,11.343],'genoa':[44.405,8.946],
  // Poland
  'warsaw':[52.230,21.012],'warszawa':[52.230,21.012],
  'krakow':[50.061,19.937],'kraków':[50.061,19.937],
  'wroclaw':[51.107,17.038],'wrocław':[51.107,17.038],
  'gdansk':[54.372,18.638],'gdańsk':[54.372,18.638],
  'poznan':[52.407,16.934],'łódź':[51.759,19.455],'lodz':[51.759,19.455],
  // Nordics
  'stockholm':[59.333,18.065],'gothenburg':[57.709,11.975],
  'göteborg':[57.709,11.975],'malmo':[55.605,13.000],'malmö':[55.605,13.000],
  'oslo':[59.913,10.752],'bergen':[60.391,5.322],
  'copenhagen':[55.676,12.568],'københavn':[55.676,12.568],
  'helsinki':[60.169,24.935],'espoo':[60.205,24.657],
  'tampere':[61.498,23.761],'reykjavik':[64.135,-21.895],
  // Other Europe
  'vienna':[48.208,16.373],'wien':[48.208,16.373],'graz':[47.070,15.438],
  'zurich':[47.378,8.540],'zürich':[47.378,8.540],
  'geneva':[46.205,6.143],'genève':[46.205,6.143],'basel':[47.560,7.590],
  'bern':[46.948,7.447],
  'brussels':[50.850,4.352],'bruxelles':[50.850,4.352],
  'antwerp':[51.221,4.400],'ghent':[51.054,3.717],
  'dublin':[53.333,-6.249],'cork':[51.897,-8.470],
  'lisbon':[38.716,-9.139],'lisboa':[38.716,-9.139],
  'porto':[41.158,-8.629],
  'prague':[50.076,14.418],'praha':[50.076,14.418],'brno':[49.195,16.608],
  'budapest':[47.498,19.040],
  'bucharest':[44.432,26.104],'bucurești':[44.432,26.104],
  'athens':[37.983,23.728],'thessaloniki':[40.629,22.947],
  'sofia':[42.698,23.322],'zagreb':[45.815,15.982],
  'bratislava':[48.149,17.107],'ljubljana':[46.056,14.505],
  'luxembourg':[49.612,6.130],'luxembourg city':[49.612,6.130],
  'riga':[56.946,24.106],'tallinn':[59.437,24.754],'vilnius':[54.687,25.280],
  'minsk':[53.904,27.561],'kyiv':[50.450,30.523],'kiev':[50.450,30.523],
  'warsaw':[52.230,21.012],
  // Middle East
  'dubai':[25.205,55.270],'abu dhabi':[24.453,54.377],
  'sharjah':[25.357,55.391],'ajman':[25.405,55.435],
  'riyadh':[24.688,46.722],'jeddah':[21.543,39.173],
  'dammam':[26.422,50.088],'mecca':[21.387,39.858],
  'doha':[25.286,51.533],'kuwait city':[29.370,47.978],
  'amman':[31.955,35.945],'beirut':[33.889,35.495],
  'muscat':[23.614,58.593],'manama':[26.215,50.586],
  'istanbul':[41.015,28.979],'ankara':[39.921,32.854],
  'izmir':[38.418,27.129],'cairo':[30.044,31.236],
  'tel aviv':[32.084,34.781],'jerusalem':[31.768,35.214],
  'tehran':[35.694,51.421],'baghdad':[33.325,44.422],
  // Africa
  'cape town':[-33.926,18.424],'johannesburg':[-26.204,28.047],
  'durban':[-29.858,31.021],'pretoria':[-25.746,28.188],
  'casablanca':[33.589,-7.614],'nairobi':[-1.286,36.820],
  'lagos':[6.524,3.379],'accra':[5.603,-0.187],
  // Americas (for completeness)
  'new york':[40.713,-74.006],'los angeles':[34.052,-118.244],
  'chicago':[41.878,-87.630],'houston':[29.760,-95.370],
  'toronto':[43.651,-79.347],'montreal':[45.501,-73.567],
  'vancouver':[49.247,-123.116],'mexico city':[19.432,-99.133],
  'são paulo':[-23.549,-46.633],'sao paulo':[-23.549,-46.633],'buenos aires':[-34.603,-58.362],
  // Asia-Pacific
  'tokyo':[35.689,139.692],'osaka':[34.694,135.502],
  'beijing':[39.905,116.391],'shanghai':[31.228,121.474],
  'hong kong':[22.319,114.169],'singapore':[1.352,103.820],
  'sydney':[-33.869,151.209],'melbourne':[-37.814,144.963],
  'seoul':[37.566,126.978],'taipei':[25.047,121.517],
  'bangalore':[12.972,77.594],'mumbai':[19.076,72.878],
  'delhi':[28.614,77.202],'hyderabad':[17.385,78.487],
  // Country centroids (fallback when city not found)
  'germany':[51.165,10.451],'united kingdom':[55.378,-3.436],
  'france':[46.228,2.214],'netherlands':[52.133,5.291],
  'spain':[40.463,-3.749],'italy':[41.872,12.568],
  'poland':[51.919,19.145],'sweden':[60.128,18.644],
  'austria':[47.516,14.550],'switzerland':[46.818,8.228],
  'belgium':[50.503,4.470],'denmark':[56.263,9.502],
  'norway':[60.472,8.469],'finland':[61.924,25.748],
  'ireland':[53.414,-8.244],'portugal':[39.400,-8.225],
  'czech republic':[49.817,15.473],'hungary':[47.162,19.503],
  'romania':[45.943,24.967],'greece':[39.074,21.824],
  'croatia':[45.100,15.200],'slovakia':[48.669,19.699],
  'slovenia':[46.151,14.995],'bulgaria':[42.734,25.486],
  'united arab emirates':[23.424,53.848],'saudi arabia':[23.886,45.079],
  'qatar':[25.355,51.184],'kuwait':[29.314,47.481],
  'jordan':[30.586,36.238],'lebanon':[33.854,35.862],
  'oman':[21.513,55.923],'bahrain':[26.067,50.558],
  'turkey':[38.964,35.243],'israel':[31.047,34.852],
  'south africa':[-30.560,22.938],'egypt':[26.820,30.802],
  'india':[20.594,78.963],'china':[35.862,104.195],
  'japan':[36.205,138.253],'australia':[-25.274,133.775],
};

// Look up coordinates for a city, falling back to country centroid
// Pre-normalize GEO keys so lookups work regardless of accent encoding
(function(){
  var normalized = {};
  Object.keys(GEO).forEach(function(k){
    var nk = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    normalized[nk] = GEO[k];
    normalized[k]  = GEO[k]; // keep original too
  });
  Object.assign(GEO, normalized);
})();

function _normalizeKey(s) {
  // Lowercase + strip diacritics so "São Paulo" matches "sao paulo", etc.
  return s.toLowerCase().trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
function getCoords(city, country) {
  if (city) {
    var key = _normalizeKey(city);
    // Try normalized key first, then raw lowercase (entries already in ASCII)
    var c = GEO[key] || GEO[city.toLowerCase().trim()];
    if (c) return c;
  }
  if (country) {
    var key2 = _normalizeKey(country);
    var c2 = GEO[key2] || GEO[country.toLowerCase().trim()];
    if (c2) return c2;
  }
  return null;
}

// ── Build city aggregation from FILTERED ────────────────────────────────
function buildCityData() {
  var map = {};
  FILTERED.forEach(function(t) {
    var city    = t.city || t.siteCode; if (!city) return;
    var country = t.country || '';
    if (!map[city]) map[city] = { city:city, country:country, count:0, breached:0, totalHours:0, tickets:[], assignees:{} };
    map[city].count++;
    map[city].totalHours += t.eosHours || 0;
    if (t.isBreached) map[city].breached++;
    map[city].tickets.push(t);
    var a = t.assigneeName || '—';
    if (!map[city].assignees[a]) map[city].assignees[a] = { count:0, totalHours:0 };
    map[city].assignees[a].count++;
    map[city].assignees[a].totalHours += t.eosHours || 0;
  });
  return Object.values(map).sort(function(a,b){ return b.count-a.count; });
}

// Color scale: blue→green→orange→red by share of max
function circleColor(count, max) {
  var t = count / Math.max(max,1);
  if (t >= 0.75) return { fill:'#d93025', border:'#dc2626' };
  if (t >= 0.50) return { fill:'#e8710a', border:'#ea6010' };
  if (t >= 0.25) return { fill:'#f9ab00', border:'#d97706' };
  if (t >= 0.10) return { fill:'#1e8e3e', border:'#16a34a' };
  return              { fill:'#1a73e8', border:'#3451d1' };
}

// ── Main: (re-)render both maps ────────────────────────────────────────
function renderLeafletMaps() {
  if (typeof L === 'undefined') return;
  var cities = buildCityData();
  renderHeatMap(cities);
  renderCoverageMap(cities);
}

// ── MAP 1: Heat signature ──────────────────────────────────────────────
// Uses L.circle (radius in metres) + L.circleMarker (radius in px)
// Popup built with bindPopup(), opened on click — exact Leaflet quick-start pattern
function renderHeatMap(cities) {
  // Initialise once, following the quick-start: L.map(id).setView([lat,lon], zoom)
  if (!_mapHeat) {
    _mapHeat = L.map('map-heat').setView([51.0, 10.0], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(_mapHeat);
  }

  // Clear previous markers
  _heatLayers.forEach(function(l){ _mapHeat.removeLayer(l); });
  _heatLayers = [];

  var maxCount = Math.max.apply(null, cities.map(function(c){ return c.count; }).concat([1]));
  var bounds   = [];
  var missing  = [];

  cities.forEach(function(cd) {
    var coords = getCoords(cd.city, cd.country);
    if (!coords) { missing.push(cd.city); return; }
    bounds.push(coords);

    var col    = circleColor(cd.count, maxCount);
    var pct    = cd.count / maxCount;
    var radius = 10 + pct * 30;           // px radius for circleMarker
    var glow   = 4000 + pct * 80000;      // metre radius for glow circle
    var avgH   = cd.count > 0 ? cd.totalHours / cd.count : 0;

    // Outer glow — L.circle uses metres (quick-start "Adding a circle" section)
    var glowCircle = L.circle(coords, {
      radius: glow,
      color: 'transparent',
      fillColor: col.fill,
      fillOpacity: 0.13 + pct * 0.1,
      interactive: false,
    }).addTo(_mapHeat);

    // Inner marker — L.circleMarker uses pixels
    var dot = L.circleMarker(coords, {
      radius: radius,
      color: col.border,
      weight: 2,
      fillColor: col.fill,
      fillOpacity: 0.75 + pct * 0.2,
    }).addTo(_mapHeat);

    // Assignee avatars for popup
    var aEntries = Object.entries(cd.assignees).sort(function(a,b){ return b[1].count-a[1].count; });
    var avatarHtml = aEntries.slice(0,5).map(function(entry, i) {
      var name = entry[0];
      var c    = PALETTE[i % PALETTE.length];
      var uid  = 'lpav' + name.replace(/[^a-z0-9]/gi,'') + i;
      return '<img class="lp-av" src="' + BADGE_BASE + encodeURIComponent(name) + '"'
           + ' alt="' + name + '" title="' + name + '"'
           + ' onerror="this.style.display=\'none\';var f=document.getElementById(\'' + uid + '\');if(f){f.style.display=\'inline-flex\';}">'
           + '<span id="' + uid + '" class="lp-av-fb" style="background:' + c + ';display:none;">' + initials(name) + '</span>';
    }).join('') + (aEntries.length > 5 ? '<span class="lp-av-fb" style="background:#9aa0a6;">+' + (aEntries.length-5) + '</span>' : '');

    // Build popup HTML — bindPopup() pattern from the quick-start
    var btnId = 'lp-btn-' + cd.city.replace(/\W/g,'_');
    var popupHtml = '<div class="lp">'
      + '<div class="lp-city">📍 ' + cd.city + '</div>'
      + '<div class="lp-country">' + cd.country + '</div>'
      + '<div class="lp-stats">'
      +   '<div class="lp-stat"><div class="lp-stat-v" style="color:' + col.fill + ';">' + cd.count + '</div><div class="lp-stat-l">tickets</div></div>'
      +   '<div class="lp-stat"><div class="lp-stat-v" style="color:#d93025;">' + cd.breached + '</div><div class="lp-stat-l">breached</div></div>'
      +   '<div class="lp-stat"><div class="lp-stat-v" style="color:#1e8e3e;font-size:14px;">' + fmtH(avgH) + '</div><div class="lp-stat-l">avg EOS</div></div>'
      + '</div>'
      + '<div class="lp-avatars">' + avatarHtml + '</div>'
      + '<button class="lp-btn" id="' + btnId + '">View Full Details →</button>'
      + '</div>';

    // bindPopup() — from the quick-start "Working with popups" section
    dot.bindPopup(popupHtml, { maxWidth:420, minWidth:400, autoPanPadding:L.point(40,40), offset:L.point(0,-4) });

    // Wire the detail button once the popup opens
    dot.on('popupopen', function() {
      var btn = document.getElementById(btnId);
      if (btn) btn.onclick = function() {
        dot.closePopup();
        openCityModal(cd);
      };
    });

    _heatLayers.push(glowCircle, dot);
  });

  // Update sub-title
  var sub = document.getElementById('heatmap-map-sub');
  if (sub) {
    sub.textContent = (bounds.length) + ' cities mapped'
      + (missing.length ? ' · ' + missing.length + ' unknown' : '');
  }

  // Fit the map to all plotted cities (or keep default view if none)
  if (bounds.length === 1) {
    _mapHeat.setView(bounds[0], 8);
  } else if (bounds.length > 1) {
    _mapHeat.fitBounds(bounds, { padding:[40,40], maxZoom:8 });
  }

  _mapHeat.invalidateSize();
}

// ── MAP 2: Assignee coverage ────────────────────────────────────────────
// Uses L.polyline (dashed, per assignee) + L.marker with DivIcon (badge photos)
function renderCoverageMap(cities) {
  if (!_mapCoverage) {
    _mapCoverage = L.map('map-coverage').setView([51.0, 10.0], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(_mapCoverage);
  }

  _covLayers.forEach(function(l){ _mapCoverage.removeLayer(l); });
  _covLayers = [];

  // Per-assignee city list and per-city assignee set
  var assigneeCities   = {};  // assignee → [city]
  var cityAssigneeInfo = {};  // city → { country, assignees:[] }

  FILTERED.forEach(function(t) {
    var city = t.city || t.siteCode; if (!city) return;
    var a    = t.assigneeName;       if (!a || a === '—') return;
    if (!assigneeCities[a]) assigneeCities[a] = [];
    if (!assigneeCities[a].includes(city)) assigneeCities[a].push(city);
    if (!cityAssigneeInfo[city]) cityAssigneeInfo[city] = { country:t.country||'', assignees:[] };
    if (!cityAssigneeInfo[city].assignees.includes(a)) cityAssigneeInfo[city].assignees.push(a);
  });

  var allAssignees = Object.keys(assigneeCities).sort();
  var bounds = [];

  // Draw coverage polylines — L.polyline([latlng, latlng, …]) from the quick-start
  allAssignees.forEach(function(a, ai) {
    var cityList = assigneeCities[a];
    if (cityList.length < 2) return;
    var col  = PALETTE[ai % PALETTE.length];
    var pts  = cityList.map(function(c) {
      var info = cityAssigneeInfo[c] || {};
      return getCoords(c, info.country);
    }).filter(Boolean);
    if (pts.length < 2) return;
    var line = L.polyline(pts, {
      color: col, weight: 2.5, opacity: 0.55, dashArray: '6, 5'
    }).addTo(_mapCoverage);
    line.bindTooltip(a, { sticky:true, opacity:0.85 });
    _covLayers.push(line);
  });

  // Place badge-photo markers per city using L.marker + L.divIcon
  Object.entries(cityAssigneeInfo).forEach(function(entry) {
    var city    = entry[0];
    var info    = entry[1];
    var aArr    = info.assignees;
    var country = info.country;
    var coords  = getCoords(city, country);
    if (!coords) return;
    bounds.push(coords);

    var cityTickets0 = FILTERED.filter(function(t){ return (t.city||t.siteCode)===city; });
    // Only keep assignees who actually have tickets in the current filter window
    aArr = aArr.filter(function(name) {
      return cityTickets0.some(function(t){ return t.assigneeName === name; });
    });
    if (!aArr.length) return; // city has no qualifying assignees — skip marker

    var ticketCount = cityTickets0.length;
    var SHOW  = 4;
    var shown = aArr.slice(0, SHOW);
    var extra = aArr.length - SHOW;
    var SZ    = 28;   // badge size px
    var OV    = 8;    // overlap px

    // Build stacked badge HTML
    var badgeHtml = shown.map(function(name, bi) {
      var col = PALETTE[allAssignees.indexOf(name) % PALETTE.length];
      var uid = 'cvav' + city.replace(/\W/g,'') + bi;
      return '<img class="cv-badge" src="' + BADGE_BASE + encodeURIComponent(name) + '"'
           + ' alt="' + name + '" title="' + name + '"'
           + ' onerror="this.style.display=\'none\';var f=document.getElementById(\'' + uid + '\');if(f){f.style.display=\'inline-flex\';}">'
           + '<span id="' + uid + '" class="cv-badge-fb" style="background:' + col + ';display:none;">' + initials(name) + '</span>';
    }).join('');

    if (extra > 0) {
      badgeHtml += '<span class="cv-badge-fb" style="background:#9aa0a6;">+' + extra + '</span>';
    }

    var iconW  = shown.length * (SZ - OV) + OV + (extra>0?SZ:0) + 4;
    var iconH  = SZ + 20;

    // L.divIcon — custom HTML marker (no default blue pin)
    var icon = L.divIcon({
      html: '<div class="cv-cluster">'
          + '<div class="cv-badges" style="margin-left:' + (OV/2) + 'px;">' + badgeHtml + '</div>'
          + '<div class="cv-label">' + city + '</div>'
          + '<div class="cv-pin"></div>'
          + '</div>',
      className: '',
      iconSize: [iconW, iconH],
      iconAnchor: [iconW/2, iconH],
    });

    var marker = L.marker(coords, { icon:icon }).addTo(_mapCoverage);

    // Rich popup with per-assignee profile cards
    var cityTickets = cityTickets0;
    var popupRows = aArr.map(function(name, ai) {
      var col     = PALETTE[allAssignees.indexOf(name) % PALETTE.length];
      var uid     = 'cvpop' + city.replace(/\W/g,'') + ai;
      var atix    = cityTickets.filter(function(t){ return t.assigneeName === name; });
      var cnt     = atix.length;
      var breached= atix.filter(function(t){ return t.isBreached; }).length;
      var avgH    = cnt > 0 ? atix.reduce(function(s,t){ return s + t.eosHours; }, 0) / cnt : 0;
      var s4cnt   = atix.filter(function(t){ return t.sev === 4; }).length;
      var s5cnt   = atix.filter(function(t){ return t.sev === 5; }).length;
      var breachPct = cnt > 0 ? Math.round(breached/cnt*100) : 0;
      var bColor  = breachPct >= 50 ? '#d93025' : breachPct >= 20 ? '#f9ab00' : '#1e8e3e';
      // encode data for click handler (avoid closure issues in a loop)
      var rowId   = 'covrow' + city.replace(/\W/g,'') + ai;
      return '<div id="' + rowId + '" style="display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-bottom:1px solid #e8ecf4;cursor:pointer;transition:background .12s;border-radius:6px;" '
           + 'onmouseenter="this.style.background=\'rgba(26,115,232,.07)\'" onmouseleave="this.style.background=\'transparent\'">'
           +   '<img width="36" height="36" style="border-radius:50%;object-fit:cover;border:2px solid ' + col + ';flex-shrink:0;"'
           +     ' src="' + BADGE_BASE + encodeURIComponent(name) + '"'
           +     ' alt="' + name + '"'
           +     ' onerror="this.style.display=\'none\';document.getElementById(\'' + uid + '\').style.display=\'inline-flex\';">'
           +   '<span id="' + uid + '" style="display:none;width:36px;height:36px;border-radius:50%;background:' + col + ';color:#fff;font-size:11px;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">' + initials(name) + '</span>'
           +   '<div style="flex:1;min-width:0;">'
           +     '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">'
           +       '<div style="font-size:11px;font-weight:700;color:#0f1629;font-family:\'DM Mono\',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + name + '">' + name + '</div>'
           +       '<div style="font-size:9px;color:#5f6368;flex-shrink:0;margin-left:6px;">tap for detail →</div>'
           +     '</div>'
           +     '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;">'
           +       '<span style="font-size:9px;font-weight:700;background:#1a73e818;color:#1a73e8;border:1px solid #1a73e844;border-radius:4px;padding:1px 6px;">' + cnt + ' ticket' + (cnt!==1?'s':'') + '</span>'
           +       (s4cnt ? '<span style="font-size:9px;font-weight:700;background:#1e8e3e18;color:#16a34a;border:1px solid #1e8e3e44;border-radius:4px;padding:1px 6px;">S4×' + s4cnt + '</span>' : '')
           +       (s5cnt ? '<span style="font-size:9px;font-weight:700;background:#94a3b818;color:#64748b;border:1px solid #94a3b844;border-radius:4px;padding:1px 6px;">S5×' + s5cnt + '</span>' : '')
           +       '<span style="font-size:9px;font-weight:700;background:' + bColor + '18;color:' + bColor + ';border:1px solid ' + bColor + '44;border-radius:4px;padding:1px 6px;">' + breachPct + '% breach</span>'
           +     '</div>'
           +     '<div style="display:flex;align-items:center;gap:6px;">'
           +       '<div style="flex:1;height:5px;background:#e8ecf4;border-radius:3px;overflow:hidden;">'
           +         '<div style="height:100%;width:' + Math.min(100,breachPct) + '%;background:' + bColor + ';border-radius:3px;"></div>'
           +       '</div>'
           +       '<span style="font-size:10px;font-weight:700;color:' + col + ';font-family:\'DM Mono\',monospace;white-space:nowrap;">' + fmtH(avgH) + ' avg</span>'
           +     '</div>'
           +   '</div>'
           + '</div>';
    }).join('');

    // Store per-assignee data on the marker for click handlers
    var cityAssigneeData = {};
    aArr.forEach(function(name) {
      var atix      = cityTickets.filter(function(t){ return t.assigneeName === name; });
      var breached  = atix.filter(function(t){ return t.isBreached; }).length;
      var totalH    = atix.reduce(function(s,t){ return s + t.eosHours; }, 0);
      var s4cnt     = atix.filter(function(t){ return t.sev === 4; }).length;
      var s5cnt     = atix.filter(function(t){ return t.sev === 5; }).length;
      var cities    = assigneeCities[name] || [city];
      cityAssigneeData[name] = { name:name, tickets:atix, count:atix.length, breached:breached, totalH:totalH, s4:s4cnt, s5:s5cnt, avgH: atix.length ? totalH/atix.length : 0, citiesWorked:cities };
    });

    var popupHtml = '<div style="padding:12px 14px;font-family:\'DM Sans\',-apple-system,sans-serif;min-width:240px;max-width:300px;">'
      + '<div style="font-size:13px;font-weight:800;color:#0f1629;margin-bottom:1px;">📍 ' + city + '</div>'
      + '<div style="font-size:10px;color:#5f6368;margin-bottom:10px;font-family:\'DM Mono\',monospace;">' + info.country + ' · ' + ticketCount + ' ticket' + (ticketCount!==1?'s':'') + ' · ' + aArr.length + ' assignee' + (aArr.length!==1?'s':'') + '</div>'
      + '<div style="max-height:260px;overflow-y:auto;">' + popupRows + '</div>'
      + '</div>';

    marker.bindPopup(popupHtml, { maxWidth:320, minWidth:260, offset:L.point(0,-iconH) });

    // Wire per-assignee row clicks after popup opens
    marker.on('popupopen', function() {
      aArr.forEach(function(name, ai) {
        var rowId = 'covrow' + city.replace(/\W/g,'') + ai;
        var row   = document.getElementById(rowId);
        if (!row) return;
        var data  = cityAssigneeData[name];
        var col2  = PALETTE[allAssignees.indexOf(name) % PALETTE.length];
        row.addEventListener('click', function() {
          marker.closePopup();
          openAssigneeDetailModal(data, city, info.country, col2);
        });
      });
    });
    _covLayers.push(marker);
  });

  var sub = document.getElementById('coverage-map-sub');
  if (sub) sub.textContent = allAssignees.length + ' assignees · ' + bounds.length + ' cities';

  if (bounds.length === 1) {
    _mapCoverage.setView(bounds[0], 8);
  } else if (bounds.length > 1) {
    _mapCoverage.fitBounds(bounds, { padding:[50,50], maxZoom:8 });
  }

  _mapCoverage.invalidateSize();
}

// ── Assignee Detail Modal (from coverage map click) ──────────────────
function openAssigneeDetailModal(data, city, country, col) {
  var SEV_BG = {1:'#d93025',2:'#e8710a',3:'#f9ab00',4:'#1e8e3e',5:'#94a3b8'};
  var bPct   = data.count > 0 ? Math.round(data.breached/data.count*100) : 0;
  var bColor = bPct >= 50 ? '#d93025' : bPct >= 20 ? '#f9ab00' : '#1e8e3e';
  var uid    = 'amd' + data.name.replace(/[^a-z0-9]/gi,'');

  // Header
  document.getElementById('cm-city-name').innerHTML =
    '<span style="display:flex;align-items:center;gap:8px;">'
    + '<img id="' + uid + 'ph" width="34" height="34" style="border-radius:50%;object-fit:cover;border:2.5px solid ' + col + ';" src="' + BADGE_BASE + encodeURIComponent(data.name) + '" onerror="this.style.display=\'none\';document.getElementById(\'' + uid + 'fb\').style.display=\'flex\';">'
    + '<span id="' + uid + 'fb" style="display:none;width:34px;height:34px;border-radius:50%;background:' + col + ';color:#fff;font-size:12px;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">' + initials(data.name) + '</span>'
    + '🧑‍✈️ ' + data.name
    + '</span>';
  document.getElementById('cm-city-sub').textContent =
    '📍 ' + city + (country ? ' · ' + country : '') + ' · ' + data.count + ' ticket' + (data.count!==1?'s':'');

  var sev5cnt = data.tickets.filter(function(t){ return t.sev===5; }).length;
  var sev4cnt = data.tickets.filter(function(t){ return t.sev===4; }).length;

  var html = '';

  // Stats row
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
  [
    [data.count,    'Tickets at site', col],
    [data.breached, 'SLA Breached',    '#d93025'],
    [fmtH(data.avgH),'Avg EOS Time',  '#1e8e3e'],
    [data.citiesWorked.length, 'Cities Covered', '#8430ce'],
  ].forEach(function(r) {
    html += '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;">'
          + '<div style="font-size:18px;font-weight:800;font-family:var(--mono);color:' + r[2] + ';line-height:1;">' + r[0] + '</div>'
          + '<div style="font-size:9px;color:var(--text3);margin-top:3px;">' + r[1] + '</div>'
          + '</div>';
  });
  html += '</div>';

  // SLA bar
  html += '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;">';
  html += '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">';
  html +=   '<span style="font-size:11px;font-weight:700;color:var(--text2);">SLA Breach Rate</span>';
  html +=   '<span style="font-size:14px;font-weight:800;font-family:var(--mono);color:' + bColor + ';">' + bPct + '%</span>';
  html += '</div>';
  html += '<div style="height:8px;background:var(--surface3);border-radius:5px;overflow:hidden;">';
  html +=   '<div style="height:100%;width:' + Math.min(100,bPct) + '%;background:' + bColor + ';border-radius:5px;transition:width .5s;"></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">';
  html +=   '<span style="font-size:9px;font-weight:700;background:#1e8e3e18;color:#16a34a;border:1px solid #1e8e3e44;border-radius:4px;padding:2px 8px;">S4×' + sev4cnt + '</span>';
  html +=   '<span style="font-size:9px;font-weight:700;background:#94a3b818;color:#64748b;border:1px solid #94a3b844;border-radius:4px;padding:2px 8px;">S5×' + sev5cnt + '</span>';
  html +=   '<span style="font-size:9px;font-weight:700;background:' + bColor + '18;color:' + bColor + ';border:1px solid ' + bColor + '44;border-radius:4px;padding:2px 8px;">' + data.breached + ' breached</span>';
  html +=   '<span style="font-size:9px;font-weight:700;background:#1a73e818;color:#1a73e8;border:1px solid #1a73e844;border-radius:4px;padding:2px 8px;">Total EOS: ' + fmtH(data.totalH) + '</span>';
  html += '</div>';
  html += '</div>';

  // Cities worked
  if (data.citiesWorked.length > 1) {
    html += '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:6px;">Cities Covered by ' + data.name.split('.')[0] + '</div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    data.citiesWorked.forEach(function(c) {
      var isCurrent = c === city;
      html += '<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:6px;' + (isCurrent ? 'background:' + col + ';color:#fff;' : 'background:var(--surface2);border:1px solid var(--border);color:var(--text2);') + '">' + (isCurrent?'📍 ':'') + c + '</span>';
    });
    html += '</div>';
  }

  // Recent tickets at this site
  html += '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">Tickets at ' + city + '</div>';
  html += '<div style="display:flex;flex-direction:column;gap:5px;">';
  data.tickets.slice(0, 8).forEach(function(t) {
    var tc = SEV_BG[t.sev] || '#94a3b8';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;cursor:pointer;"'
          + ' onclick="openTicketModal(ALL.find(function(x){return x.shortId===\'' + t.shortId + '\';})||FILTERED.find(function(x){return x.shortId===\'' + t.shortId + '\';}))">'
          + '<span style="background:' + tc + ';color:#fff;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;flex-shrink:0;">S' + (t.sev||'?') + '</span>'
          + '<a href="https://t.corp.amazon.com/' + t.shortId + '" target="_blank" onclick="event.stopPropagation();" style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--accent);text-decoration:none;flex-shrink:0;">' + t.shortId + '</a>'
          + '<span style="flex:1;font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + ((t.pageTitle||t.titleText||'').replace(/^Preview/,'')) + '</span>'
          + '<span style="font-size:10px;font-weight:700;font-family:var(--mono);color:' + (t.isBreached?'#d93025':'#1e8e3e') + ';flex-shrink:0;">' + fmtH(t.eosHours) + '</span>'
          + '</div>';
  });
  html += '</div>';

  document.getElementById('cm-body').innerHTML = html;
  document.getElementById('city-modal-backdrop').style.display = 'flex';
}

// ── City detail modal ───────────────────────────────────────────────────
function openCityModal(cd) {
  document.getElementById('cm-city-name').textContent = '📍 ' + cd.city;
  document.getElementById('cm-city-sub').textContent  =
    cd.count + ' ticket' + (cd.count!==1?'s':'') + (cd.country ? ' · ' + cd.country : '');

  var body     = document.getElementById('cm-body');
  var aEntries = Object.entries(cd.assignees).sort(function(a,b){ return b[1].count-a[1].count; });
  var maxA     = Math.max.apply(null, aEntries.map(function(e){ return e[1].count; }).concat([1]));
  var avgH     = cd.count > 0 ? cd.totalHours / cd.count : 0;
  var SEV_BG   = {1:'#d93025',2:'#e8710a',3:'#f9ab00',4:'#1e8e3e',5:'#94a3b8'};

  // Sev counts
  var sevC = {};
  cd.tickets.forEach(function(t){ sevC[t.sev] = (sevC[t.sev]||0)+1; });

  var html = '';

  // Quick stats grid
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">';
  [[cd.count,'Total Tickets','#1a73e8'],[cd.breached,'SLA Breached','#d93025'],[fmtH(avgH),'Avg EOS Time','#1e8e3e']].forEach(function(r) {
    html += '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">'
          + '<div style="font-size:22px;font-weight:800;font-family:var(--mono);color:' + r[2] + ';line-height:1;">' + r[0] + '</div>'
          + '<div style="font-size:10px;color:var(--text3);margin-top:4px;">' + r[1] + '</div>'
          + '</div>';
  });
  html += '</div>';

  // Severity pills
  html += '<div style="display:flex;gap:7px;flex-wrap:wrap;">';
  [1,2,3,4,5].forEach(function(s) {
    var n = sevC[s]||0; if (!n) return;
    html += '<span style="background:' + SEV_BG[s] + '22;border:1px solid ' + SEV_BG[s] + '66;border-radius:8px;padding:4px 12px;font-size:11px;font-weight:700;color:' + SEV_BG[s] + ';">Sev ' + s + ': ' + n + '</span>';
  });
  html += '</div>';

  // Assignee bar chart
  html += '<div><div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:10px;">Assignees in ' + cd.city + '</div>';
  html += '<div style="display:flex;flex-direction:column;gap:9px;">';
  aEntries.slice(0,10).forEach(function(entry, i) {
    var name = entry[0], v = entry[1];
    var pct  = Math.round(v.count/maxA*100);
    var avg  = v.count > 0 ? fmtH(v.totalHours/v.count) : '—';
    var col  = PALETTE[i%PALETTE.length];
    var uid  = 'cmav' + name.replace(/[^a-z0-9]/gi,'');
    html += '<div style="display:flex;align-items:center;gap:10px;">'
          + '<img width="32" height="32" style="border-radius:50%;object-fit:cover;border:2px solid var(--border);flex-shrink:0;"'
          + '  src="' + BADGE_BASE + encodeURIComponent(name) + '" alt="' + name + '"'
          + '  onerror="this.style.display=\'none\';var f=document.getElementById(\'' + uid + '\');if(f){f.style.display=\'inline-flex\';}">'
          + '<span id="' + uid + '" style="display:none;width:32px;height:32px;border-radius:50%;background:' + col + ';color:#fff;font-size:10px;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">' + initials(name) + '</span>'
          + '<div style="flex:1;min-width:0;">'
          +   '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">'
          +     '<span style="font-size:11px;font-weight:600;color:var(--text2);font-family:var(--mono);">' + (name==='—'?'Unassigned':name) + '</span>'
          +     '<span style="font-size:11px;font-family:var(--mono);font-weight:700;color:' + col + ';">' + avg + '</span>'
          +   '</div>'
          +   '<div style="height:7px;background:var(--surface3);border-radius:4px;overflow:hidden;">'
          +     '<div style="height:100%;width:' + pct + '%;background:' + col + ';border-radius:4px;"></div>'
          +   '</div>'
          +   '<div style="font-size:9px;color:var(--text3);margin-top:2px;">' + v.count + ' ticket' + (v.count!==1?'s':'') + '</div>'
          + '</div></div>';
  });
  html += '</div></div>';

  // Recent tickets
  html += '<div><div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">Recent Tickets</div>';
  html += '<div style="display:flex;flex-direction:column;gap:5px;">';
  cd.tickets.slice(0,6).forEach(function(t) {
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;cursor:pointer;"'
          + ' onclick="openTicketModal(ALL.find(function(x){return x.shortId===\'' + t.shortId + '\';})||FILTERED.find(function(x){return x.shortId===\'' + t.shortId + '\';}))">'
          + '<span style="background:' + (SEV_BG[t.sev]||'#94a3b8') + ';color:#fff;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;flex-shrink:0;">Sev ' + (t.sev||'?') + '</span>'
          + '<a href="https://t.corp.amazon.com/' + t.shortId + '" target="_blank" onclick="event.stopPropagation();"'
          + '   style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--accent);text-decoration:none;flex-shrink:0;">' + t.shortId + '</a>'
          + '<span style="flex:1;font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + ((t.pageTitle||t.titleText||'').replace(/^Preview/,'')) + '</span>'
          + '<span style="font-size:11px;font-weight:700;font-family:var(--mono);color:' + (t.isBreached?'#d93025':'#1e8e3e') + ';flex-shrink:0;">' + fmtH(t.eosHours) + '</span>'
          + '</div>';
  });
  html += '</div></div>';

  body.innerHTML = html;
  document.getElementById('city-modal-backdrop').style.display = 'flex';
}

function closeCityModal() {
  document.getElementById('city-modal-backdrop').style.display = 'none';
  if (window._cmLeafletMap) {
    try { window._cmLeafletMap.remove(); } catch(e) {}
    window._cmLeafletMap = null;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  AUDIT ANALYSIS — additive block, zero changes to code above
// ══════════════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────────────
let AUDIT = [];   // parsed audit rows
let _auditAreaChart, _auditSetupChart, _auditBuildingChart,
    _auditMonitorChart, _auditDockChart;

// ── Helpers ────────────────────────────────────────────────────────────
function auditInitials(alias) {
  if (!alias || alias === '—') return '?';
  const p = alias.split('.');
  return p.length >= 2
    ? (p[0][0] + p[1][0]).toUpperCase()
    : alias.slice(0,2).toUpperCase();
}

// Amazon phonetool badge URL — same base as existing BADGE_BASE
function auditBadgeHtml(alias, sz) {
  sz = sz || 22;
  if (!alias || alias === '—') return `<span class="bav-fb" style="width:${sz}px;height:${sz}px;">?</span>`;
  const uid = 'afb-' + alias.replace(/[^a-z0-9]/gi,'') + sz;
  return `<img class="bav" width="${sz}" height="${sz}"
    src="${BADGE_BASE}${encodeURIComponent(alias)}"
    alt="${alias}" title="${alias}"
    onerror="this.style.display='none';var f=document.getElementById('${uid}');if(f)f.style.display='inline-flex';"
  ><span class="bav-fb" id="${uid}" style="display:none;width:${sz}px;height:${sz}px;">${auditInitials(alias)}</span>`;
}

// Tokenise multiline text fields (stickers, accessories)
function auditTokenise(str) {
  if (!str) return [];
  return str.split(/\n|;|,(?!\s*\()/)
    .map(s => s.trim()).filter(Boolean);
}

// Generic counter → sorted entries
function auditCount(rows, fn) {
  const m = {};
  rows.forEach(r => {
    const k = fn(r) || '—';
    m[k] = (m[k] || 0) + 1;
  });
  return Object.entries(m).sort((a,b) => b[1]-a[1]);
}

// Destroy a Chart.js instance safely
function auditKill(ref) { if (ref) { try { ref.destroy(); } catch(e){} } }

// ── Parse Excel (SheetJS) ──────────────────────────────────────────────
function auditParseBuffer(buf) {
  const wb   = XLSX.read(buf, { type:'array', cellDates:true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval:null, raw:false });
  return rows.map(r => ({
    result:       r['Result']                    || null,
    auditDate:    r['Audit Date']                || null,
    alias:        (r['Alias'] || '').trim().toLowerCase() || '—',
    area:         r['Area']                      || '—',
    deskLocation: r['Desk Location']             || '—',
    buildingCode: r['Building Code']             || '—',
    deskStickers: r['Desk Stickers']             || null,
    setupType:    r['Setup Type']                || '—',
    monitorQty:   parseInt(r['Monitor Quantity']) || 0,
    monitorState: r['Monitor State']             || '—',
    dockPresent:  r['Docking Station Present']   || '—',
    dockBrand:    r['Docking Station Brand']     || null,
    accessories:  r['Other Accessories Present'] || null,
    comments:     r['Comments']                  || null,
  }));
}

// ── Render KPI strip ──────────────────────────────────────────────────
function auditRenderKpi(rows) {
  const el = document.getElementById('audit-kpi');
  if (!el) return;
  const total    = rows.length;
  const passed   = rows.filter(r => r.result === 'Pass').length;
  const failed   = total - passed;
  const passRate = total ? Math.round(passed / total * 100) : 0;
  const buildings= new Set(rows.map(r => r.buildingCode).filter(b => b !== '—')).size;
  const stickerIssues = rows.filter(r => r.deskStickers).length;
  const rateColor = passRate >= 80 ? '#1e8e3e' : passRate >= 50 ? '#f9ab00' : '#d93025';

  const cards = [
    { val:total,      lbl:'Total Desks',     icon:'🖥', ca:'var(--accent)',   ci:'var(--accent-lt)'  },
    { val:passed,     lbl:'Passed',          icon:'✅', ca:'var(--accent2)',  ci:'var(--accent2-lt)' },
    { val:failed,     lbl:'Failed',          icon:'❌', ca:'var(--danger)',   ci:'var(--danger-lt)'  },
    { val:passRate+'%', lbl:'Pass Rate',     icon:'🎯', ca:rateColor,         ci:'var(--surface2)'   },
    { val:buildings,  lbl:'Buildings',       icon:'🏢', ca:'var(--teal)',     ci:'var(--teal-lt)'    },
    { val:stickerIssues, lbl:'Sticker Issues', icon:'🏷', ca:'var(--warn)',  ci:'var(--warn-lt)'    },
  ];
  el.innerHTML = cards.map(c => `
    <div class="sc" style="--ca:${c.ca};--ci:${c.ci};">
      <div class="sc-icon">${c.icon}</div>
      <div class="sc-val">${c.val}</div>
      <div class="sc-lbl">${c.lbl}</div>
    </div>`).join('');
}

// ── Render auditor profile cards ───────────────────────────────────────
function auditRenderCards(rows) {
  const grid = document.getElementById('audit-auditor-grid');
  if (!grid) return;

  // Group by alias
  const byAlias = {};
  rows.forEach(r => {
    const a = r.alias || '—';
    if (!byAlias[a]) byAlias[a] = [];
    byAlias[a].push(r);
  });

  const GRAD_COLORS = [
    '135deg,#c7d2ff,#1a73e8',
    '135deg,#bbf7d0,#1e8e3e',
    '135deg,#fde68a,#f9ab00',
    '135deg,#fecaca,#d93025',
    '135deg,#e9d5ff,#8430ce',
    '135deg,#cffafe,#00acc1',
  ];

  grid.innerHTML = '';
  Object.entries(byAlias)
    .sort((a,b) => b[1].length - a[1].length)
    .forEach(([alias, arows], idx) => {
      const total     = arows.length;
      const passed    = arows.filter(r => r.result === 'Pass').length;
      const failed    = total - passed;
      const passRate  = total ? Math.round(passed / total * 100) : 0;
      const rateColor = passRate >= 80 ? '#1e8e3e' : passRate >= 50 ? '#f9ab00' : '#d93025';
      const buildings = [...new Set(arows.map(r => r.buildingCode).filter(b => b !== '—'))];
      const stickerPct= total ? Math.round(arows.filter(r => r.deskStickers).length / total * 100) : 0;
      const grad      = GRAD_COLORS[idx % GRAD_COLORS.length];
      const accentCol = PALETTE[idx % PALETTE.length];

      // Avatar — phonetool photo with fallback
      const uid = 'aud-' + alias.replace(/[^a-z0-9]/gi,'');
      const avatarHtml = alias !== '—'
        ? `<img class="auditor-avatar" id="${uid}-img"
             src="${BADGE_BASE}${encodeURIComponent(alias)}"
             alt="${alias}"
             onerror="this.style.display='none';document.getElementById('${uid}-fb').style.display='flex';">
           <div class="auditor-avatar-fb" id="${uid}-fb"
             style="display:none;background:linear-gradient(${grad});">${auditInitials(alias)}</div>`
        : `<div class="auditor-avatar-fb" style="background:linear-gradient(${grad});">?</div>`;

      // Setup type breakdown (mini bars inside card)
      const setupCounts = auditCount(arows, r => r.setupType).slice(0,3);
      const maxSetup    = setupCounts[0] ? setupCounts[0][1] : 1;
      const setupHtml   = setupCounts.map(([label, cnt]) => `
        <div class="audit-bar-row">
          <div class="abl-label" title="${label}">${label}</div>
          <div class="abl-track"><div class="abl-fill" style="width:${Math.round(cnt/maxSetup*100)}%;background:${accentCol};"></div></div>
          <div class="abl-val">${cnt}</div>
        </div>`).join('');

      const card = document.createElement('div');
      card.className = 'auditor-card';
      card.style.setProperty('--aca', accentCol);
      card.innerHTML = `
        <div class="auditor-head">
          <div style="position:relative;flex-shrink:0;">${avatarHtml}</div>
          <div style="min-width:0;flex:1;">
            <div class="auditor-name">${alias}</div>
            <div class="auditor-meta">${buildings.slice(0,2).join(', ') || '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div class="auditor-rate" style="color:${rateColor};">${passRate}%</div>
            <div class="auditor-rate-lbl">Pass Rate</div>
          </div>
        </div>
        <div class="auditor-stats">
          <div class="auditor-stat">
            <div class="auditor-stat-val" style="color:var(--accent);">${total}</div>
            <div class="auditor-stat-lbl">Total</div>
          </div>
          <div class="auditor-stat">
            <div class="auditor-stat-val" style="color:var(--accent2);">${passed}</div>
            <div class="auditor-stat-lbl">Pass</div>
          </div>
          <div class="auditor-stat">
            <div class="auditor-stat-val" style="color:var(--danger);">${failed}</div>
            <div class="auditor-stat-lbl">Fail</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <div class="audit-bar-row">
            <div class="abl-label">Pass Rate</div>
            <div class="abl-track"><div class="abl-fill" style="width:${passRate}%;background:${rateColor};"></div></div>
            <div class="abl-val" style="color:${rateColor};">${passRate}%</div>
          </div>
          <div class="audit-bar-row">
            <div class="abl-label">Sticker Issues</div>
            <div class="abl-track"><div class="abl-fill" style="width:${stickerPct}%;background:var(--warn);"></div></div>
            <div class="abl-val">${stickerPct}%</div>
          </div>
          ${setupHtml}
        </div>
      `;
      grid.appendChild(card);
    });
}

// ── Render charts ──────────────────────────────────────────────────────
function auditRenderCharts(rows) {
  // Helper: bar chart
  function aBar(canvasId, labels, data, colors, horizontal) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    return new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{
        data, backgroundColor: colors.map(c=>c+'33'),
        borderColor:colors, borderWidth:2, borderRadius:5, borderSkipped:false,
      }]},
      options:{
        indexAxis: horizontal ? 'y' : 'x',
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{
          x:{ grid:{ color:'rgba(0,0,0,0.05)' }, ticks:{ font:{size:10}, color:'#5f6368' } },
          y:{ grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ font:{size:10}, color:'#5f6368' } },
        },
      },
    });
  }
  // Helper: doughnut
  function aDoughnut(canvasId, labels, data, colors) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    return new Chart(ctx, {
      type:'doughnut',
      data:{ labels, datasets:[{
        data, backgroundColor:colors.map(c=>c+'44'),
        borderColor:colors, borderWidth:2, hoverOffset:6,
      }]},
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'60%',
        plugins:{
          legend:{ position:'right', labels:{ font:{size:11}, color:'#3c4043', padding:10 } },
          tooltip:{ callbacks:{ label:ctx=>{
            const t = ctx.dataset.data.reduce((a,b)=>a+b,0);
            const p = t > 0 ? ((ctx.parsed/t)*100).toFixed(1) : '0.0';
            return `  ${ctx.label}: ${ctx.parsed} (${p}%)`;
          }}},
        },
      },
    });
  }

  auditKill(_auditAreaChart);
  auditKill(_auditSetupChart);
  auditKill(_auditBuildingChart);
  auditKill(_auditMonitorChart);
  auditKill(_auditDockChart);

  // Pass/Fail stacked by Area
  {
    const areas  = [...new Set(rows.map(r=>r.area).filter(a=>a!=='—'))];
    const passed = areas.map(a => rows.filter(r=>r.area===a && r.result==='Pass').length);
    const failed = areas.map(a => rows.filter(r=>r.area===a && r.result!=='Pass').length);
    const ctx    = document.getElementById('audit-chart-area');
    auditKill(_auditAreaChart);
    if (ctx) _auditAreaChart = new Chart(ctx, {
      type:'bar',
      data:{ labels:areas, datasets:[
        { label:'Pass', data:passed, backgroundColor:'rgba(30,142,62,0.25)', borderColor:'#1e8e3e', borderWidth:2, borderRadius:{topLeft:0,topRight:0,bottomLeft:5,bottomRight:5}, borderSkipped:false },
        { label:'Fail', data:failed, backgroundColor:'rgba(217,48,37,0.25)', borderColor:'#d93025', borderWidth:2, borderRadius:{topLeft:5,topRight:5,bottomLeft:0,bottomRight:0}, borderSkipped:false },
      ]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:true, labels:{ font:{size:11}, color:'#3c4043' } } },
        scales:{
          x:{ stacked:true, grid:{color:'rgba(0,0,0,0.05)'}, ticks:{font:{size:10},color:'#5f6368'} },
          y:{ stacked:true, grid:{color:'rgba(0,0,0,0.06)'}, ticks:{font:{size:10},color:'#5f6368'} },
        },
      },
    });
  }

  // Setup type — horizontal bar
  {
    const entries = auditCount(rows, r=>r.setupType).filter(([k])=>k!=='—').slice(0,8);
    _auditSetupChart = aBar('audit-chart-setup',
      entries.map(e=>e[0]), entries.map(e=>e[1]),
      entries.map((_,i)=>PALETTE[i%PALETTE.length]), true);
  }

  // Building — vertical bar
  {
    const entries = auditCount(rows, r=>r.buildingCode).filter(([k])=>k!=='—').slice(0,10);
    _auditBuildingChart = aBar('audit-chart-building',
      entries.map(e=>e[0]), entries.map(e=>e[1]),
      entries.map((_,i)=>PALETTE[i%PALETTE.length]), false);
  }

  // Monitor state — doughnut
  {
    const entries = auditCount(rows, r=>r.monitorState).filter(([k])=>k!=='—').slice(0,6);
    _auditMonitorChart = aDoughnut('audit-chart-monitor',
      entries.map(e=>e[0]), entries.map(e=>e[1]),
      ['#1e8e3e','#f9ab00','#d93025','#8430ce','#0ea5e9','#fb923c']);
  }

  // Docking station — doughnut
  {
    const entries = auditCount(rows, r=>r.dockPresent).filter(([k])=>k!=='—').slice(0,6);
    _auditDockChart = aDoughnut('audit-chart-dock',
      entries.map(e=>e[0]), entries.map(e=>e[1]),
      ['#1a73e8','#f9ab00','#1e8e3e','#d93025','#8430ce','#00acc1']);
  }
}

// ── Render findings bar lists (stickers, accessories) ──────────────────
function auditRenderFindings(rows) {
  function renderList(elId, entries, color) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:11px;">No data</div>';
      return;
    }
    const maxV = entries[0][1];
    el.innerHTML = '<div class="findings-list">'
      + entries.slice(0,15).map(([label, cnt]) => `
          <div class="findings-row">
            <div class="fl-label" title="${label}">${label}</div>
            <div class="fl-track"><div class="fl-fill" style="width:${Math.round(cnt/maxV*100)}%;background:${color};"></div></div>
            <div class="fl-count">${cnt}</div>
          </div>`).join('')
      + '</div>';
  }

  // Stickers
  const stickerMap = {};
  rows.forEach(r => auditTokenise(r.deskStickers).forEach(s => { stickerMap[s]=(stickerMap[s]||0)+1; }));
  renderList('audit-sticker-bars', Object.entries(stickerMap).sort((a,b)=>b[1]-a[1]), 'var(--warn)');

  // Accessories
  const accMap = {};
  rows.forEach(r => auditTokenise(r.accessories).forEach(s => { accMap[s]=(accMap[s]||0)+1; }));
  renderList('audit-acc-bars', Object.entries(accMap).sort((a,b)=>b[1]-a[1]), 'var(--accent)');
}

// ── Render audit data table ────────────────────────────────────────────
function auditRenderTable(rows) {
  const tbody = document.getElementById('audit-tbody');
  const count = document.getElementById('audit-table-count');
  if (count) count.textContent = rows.length + ' records';
  if (!tbody) return;

  tbody.innerHTML = rows.map(r => {
    const isPassed = r.result === 'Pass';
    const alias    = r.alias || '—';
    const uid      = 'at-' + Math.random().toString(36).slice(2,8);
    const dateStr  = r.auditDate
      ? String(r.auditDate).replace('T',' ').slice(0,16)
      : '—';

    return `<tr>
      <td>
        <span class="pcell">
          ${auditBadgeHtml(alias, 22)}
          <span class="pcell-name">${alias}</span>
        </span>
      </td>
      <td>${dateStr}</td>
      <td style="color:var(--accent);font-weight:600;">${r.deskLocation}</td>
      <td>${r.buildingCode}</td>
      <td>${r.area}</td>
      <td><span class="${isPassed ? 'adt-pass' : 'adt-fail'}">${r.result || '—'}</span></td>
      <td>${r.setupType}</td>
      <td style="text-align:center;">${r.monitorQty || '—'}</td>
      <td>${r.monitorState}</td>
      <td class="adt-wrap-cell">${r.dockPresent}</td>
      <td class="adt-wrap-cell">${r.deskStickers || '—'}</td>
      <td class="adt-wrap-cell">${r.accessories   || '—'}</td>
    </tr>`;
  }).join('');
}

// ── Main render orchestrator ───────────────────────────────────────────
function auditRender() {
  const rows = AUDIT;
  auditRenderKpi(rows);
  auditRenderCards(rows);
  auditRenderCharts(rows);
  auditRenderFindings(rows);
  auditRenderTable(rows);

  // Show section + reload pill
  const sec = document.getElementById('audit-section');
  if (sec) sec.classList.add('visible');
  const pill = document.getElementById('audit-reload-pill');
  if (pill) pill.style.display = 'flex';

  // Smooth scroll to section
  if (sec) sec.scrollIntoView({ behavior:'smooth', block:'start' });
}

// ── Load from ArrayBuffer ──────────────────────────────────────────────
function auditLoadBuffer(buf) {
  try {
    const rows = auditParseBuffer(buf);
    if (!rows.length) { alert('No data rows found in the Excel file.'); return; }
    AUDIT = rows;
    auditRender();
  } catch(e) {
    console.error('[Audit]', e);
    alert('Could not parse the Excel file: ' + e.message);
  }
}

// auditOpenPicker → now just openFilePicker (unified)
function auditOpenPicker() { openFilePicker(); }

// ── Wire buttons ───────────────────────────────────────────────────────
// Audit reload pill — reuse unified picker
document.getElementById('btn-audit-reload')?.addEventListener('click', openFilePicker);

// Topbar "Load Files" button always visible after app shown — wire it
document.getElementById('btn-load-files-topbar')?.addEventListener('click', openFilePicker);

// (drag-drop now handled by unified processFileList)


// ══════════════════════════════════════════════════════════════════════
//  Period Comparison modal — compare tickets / SLA breaches / avg time
//  across weeks, months and years.  Additive; reads FILTERED (active
//  filters) and groups by resolvedDate. Falls back to ALL if needed.
// ══════════════════════════════════════════════════════════════════════
let CP_GRAN = 'month';
const CP_DEFAULT_LIMIT = { week: 12, month: 12, year: 5 };
let CP_LIMIT = CP_DEFAULT_LIMIT[CP_GRAN];
let _cpChartVol = null, _cpChartSla = null;

// ISO week key: returns {key, label} for a YYYY-MM-DD date string
function _cpBucket(dateStr, gran) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  if (gran === 'year') {
    return { key: String(d.getFullYear()), label: String(d.getFullYear()) };
  }
  if (gran === 'month') {
    const m = d.getMonth();
    const key = d.getFullYear() + '-' + String(m + 1).padStart(2, '0');
    const label = d.toLocaleString('en', { month: 'short' }) + ' ' + d.getFullYear();
    return { key, label };
  }
  // ISO week
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;           // Mon=0..Sun=6
  t.setUTCDate(t.getUTCDate() - dayNum + 3);        // nearest Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  const key = t.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  return { key, label: 'W' + week + ' ' + t.getUTCFullYear() };
}

function _cpComputePeriods(gran) {
  const src = (FILTERED && FILTERED.length) ? FILTERED : ALL;
  const map = new Map();
  src.forEach(t => {
    const b = _cpBucket(t.resolvedDate, gran);
    if (!b) return;
    let row = map.get(b.key);
    if (!row) { row = { key: b.key, label: b.label, count: 0, breaches: 0, eosSum: 0, eosN: 0, lifeSum: 0, lifeN: 0 }; map.set(b.key, row); }
    row.count++;
    if (t.isBreached) row.breaches++;
    if (Number.isFinite(t.eosHours)) { row.eosSum += t.eosHours; row.eosN++; }
    if (Number.isFinite(t.lifespanBizHours) && t.lifespanBizHours > 0) { row.lifeSum += t.lifespanBizHours; row.lifeN++; }
  });
  const rows = [...map.values()].sort((a, b) => a.key < b.key ? -1 : 1);
  rows.forEach(r => {
    r.breachRate = r.count ? (r.breaches / r.count) * 100 : 0;
    r.avgEos     = r.eosN ? r.eosSum / r.eosN : 0;
    r.avgLife    = r.lifeN ? r.lifeSum / r.lifeN : 0;
  });
  return rows;
}

function _cpDelta(cur, prev, lowerIsBetter) {
  if (prev == null || prev === 0) return { txt: '—', cls: 'flat' };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.05) return { txt: '0%', cls: 'flat' };
  const dir = pct > 0 ? 'up' : 'down';
  const good = lowerIsBetter ? (pct < 0) : (pct > 0);
  const arrow = pct > 0 ? '▲' : '▼';
  return { txt: arrow + ' ' + Math.abs(pct).toFixed(1) + '%', cls: dir + (good ? ' good' : ' bad') };
}

function _cpRenderKpis(rows) {
  const strip = document.getElementById('cp-kpi-strip');
  if (!rows.length) { strip.innerHTML = ''; return; }
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const granLbl = CP_GRAN === 'week' ? 'week' : CP_GRAN === 'year' ? 'year' : 'month';
  const cards = [
    { lbl: 'Tickets', val: last.count.toLocaleString(), d: _cpDelta(last.count, prev?.count, false) },
    { lbl: 'SLA Breaches', val: last.breaches.toLocaleString(), sub: last.breachRate.toFixed(1) + '% rate', d: _cpDelta(last.breaches, prev?.breaches, true) },
    { lbl: 'Avg EOS Hours', val: last.avgEos.toFixed(1) + 'h', d: _cpDelta(last.avgEos, prev?.avgEos, true) },
    { lbl: 'Avg Lifespan', val: last.avgLife.toFixed(1) + 'h', d: _cpDelta(last.avgLife, prev?.avgLife, true) },
  ];
  strip.innerHTML = cards.map(c => `
    <div class="cp-kpi">
      <span class="cp-kpi-lbl">${c.lbl}</span>
      <span class="cp-kpi-val">${c.val}</span>
      <span class="cp-kpi-sub">${c.sub || (last.label)} ${prev ? `<span class="cp-delta ${c.d.cls}">${c.d.txt}</span>` : ''}</span>
    </div>`).join('');
}

function _cpRenderTable(rows) {
  const tbl = document.getElementById('cp-table');
  const head = `<thead><tr>
    <th>Period</th><th>Tickets</th><th>Breaches</th><th>Breach %</th><th>Avg EOS (h)</th><th>Avg Lifespan (h)</th>
  </tr></thead>`;
  const body = '<tbody>' + rows.slice().reverse().map(r => `
    <tr>
      <td>${r.label}</td>
      <td>${r.count.toLocaleString()}</td>
      <td>${r.breaches.toLocaleString()}</td>
      <td class="${r.breachRate >= 50 ? 'cp-breach-hi' : ''}">${r.breachRate.toFixed(1)}%</td>
      <td>${r.avgEos.toFixed(1)}</td>
      <td>${r.avgLife.toFixed(1)}</td>
    </tr>`).join('') + '</tbody>';
  tbl.innerHTML = head + body;
}

function _cpRenderCharts(rows) {
  const labels = rows.map(r => r.label);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#1a73e8';
  const danger = css.getPropertyValue('--danger').trim() || '#d93025';
  const green  = css.getPropertyValue('--accent2').trim() || '#1e8e3e';
  destroyChart(_cpChartVol); destroyChart(_cpChartSla);

  _cpChartVol = new Chart(document.getElementById('cp-chart-volume'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Tickets', data: rows.map(r => r.count), backgroundColor: accent + 'cc', borderRadius: 5, order: 2 },
      { label: 'Breaches', data: rows.map(r => r.breaches), backgroundColor: danger + 'dd', borderRadius: 5, order: 1 },
    ]},
    options: { maintainAspectRatio: false, plugins: { title: { display: true, text: 'Ticket Volume vs Breaches' } },
      scales: { x: { stacked: false }, y: { beginAtZero: true } } }
  });

  _cpChartSla = new Chart(document.getElementById('cp-chart-sla'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Breach %', data: rows.map(r => r.breachRate), borderColor: danger, backgroundColor: danger + '22', tension: .3, fill: true, yAxisID: 'y' },
      { label: 'Avg EOS (h)', data: rows.map(r => r.avgEos), borderColor: green, backgroundColor: 'transparent', tension: .3, yAxisID: 'y1' },
    ]},
    options: { maintainAspectRatio: false, plugins: { title: { display: true, text: 'Breach Rate & Avg EOS Hours' } },
      scales: {
        y:  { position: 'left',  beginAtZero: true, title: { display: true, text: '%' } },
        y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'hours' } },
      } }
  });
}

function renderComparePeriods() {
  const all = _cpComputePeriods(CP_GRAN);
  const n = Math.max(1, Math.min(CP_LIMIT || 1, all.length || 1));
  const rows = all.slice(-n);
  const empty = document.getElementById('cp-empty');
  const content = document.getElementById('cp-content');
  if (!rows.length) { empty.style.display = 'block'; content.style.display = 'none'; return; }
  empty.style.display = 'none'; content.style.display = 'block';
  _cpRenderKpis(rows);
  _cpRenderTable(rows);
  _cpRenderCharts(rows);
}

function _cpSyncCountUI() {
  const inp = document.getElementById('cp-count');
  const unit = document.getElementById('cp-count-unit');
  if (inp) inp.value = CP_LIMIT;
  if (unit) unit.textContent = CP_GRAN === 'week' ? 'weeks' : CP_GRAN === 'year' ? 'years' : 'months';
}

function openComparePeriods() {
  document.querySelectorAll('.cp-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.gran === CP_GRAN));
  _cpSyncCountUI();
  document.getElementById('compare-backdrop').style.display = 'block';
  renderComparePeriods();
}
function closeComparePeriods() {
  document.getElementById('compare-backdrop').style.display = 'none';
  destroyChart(_cpChartVol); destroyChart(_cpChartSla);
  _cpChartVol = _cpChartSla = null;
}

document.getElementById('btn-compare-periods')?.addEventListener('click', () => {
  if (!ALL || !ALL.length) return;
  openComparePeriods();
});
document.getElementById('cp-close-btn')?.addEventListener('click', closeComparePeriods);
document.getElementById('compare-backdrop')?.addEventListener('click', e => {
  if (e.target === document.getElementById('compare-backdrop')) closeComparePeriods();
});
document.querySelectorAll('.cp-seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    CP_GRAN = btn.dataset.gran;
    CP_LIMIT = CP_DEFAULT_LIMIT[CP_GRAN];
    document.querySelectorAll('.cp-seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    _cpSyncCountUI();
    renderComparePeriods();
  });
});
document.getElementById('cp-count')?.addEventListener('input', e => {
  const v = parseInt(e.target.value, 10);
  if (Number.isFinite(v) && v >= 1) { CP_LIMIT = v; renderComparePeriods(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('compare-backdrop')?.style.display === 'block') closeComparePeriods();
});
