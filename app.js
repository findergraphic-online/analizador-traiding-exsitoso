// =============================================
// TRADING JOURNAL PRO v3.0
// Backtest + Real Mode | Leverage | Review Mental | Filtros avanzados
// =============================================

// =================== STATE ===================
let DB = {
  strategies: [],
  trades: [],
  realTrades: [],
  settings: {
    capital: 56000,
    riskPerTrade: 560,
    currency: 'USD',
    broker: '',
    accountNumber: '',
    accountType: 'Demo',
    leverage: 1,
    marginCapital: 0  // capital real en cuenta (sin apalancamiento)
  }
};

let currentMode = 'backtest';
let currentPage = 'dashboard';
let editingTradeId = null;
let editStratId = null;
let filters = { strategy: '', month: '', period: '' };
let perfPeriod = 'month'; // for performance page
let reviewFilters = { result: '', strategy: '' };

const COLORS    = ['#00e676','#2979ff','#ffd600','#e040fb','#ff6d00','#00e5ff','#76ff03','#ff4081'];
const SESSIONS  = ['Asia', 'London', 'New York'];
const TENDENCIAS = ['Alcista', 'Bajista', 'Lateral'];
const RESULTADOS = ['Positivo', 'Negativo', 'Sin Entrada'];
const ACCOUNT_TYPES = ['Demo', 'Prop Firm', 'Real Personal', 'Paper Trading'];
const TIMEFRAMES = ['1M','3M','5M','15M','30M','1H','2H','4H','6H','12H','D1','W1'];
const EMOTIONS = [
  {val:'muy_bien', label:'😊 Muy bien', color:'var(--green)'},
  {val:'bien',     label:'🙂 Bien',     color:'var(--teal)'},
  {val:'neutral',  label:'😐 Neutral',  color:'var(--text2)'},
  {val:'mal',      label:'😟 Mal',      color:'var(--orange)'},
  {val:'muy_mal',  label:'😰 Muy mal',  color:'var(--red)'}
];
const ENTRY_QUALITY = ['⭐','⭐⭐','⭐⭐⭐','⭐⭐⭐⭐','⭐⭐⭐⭐⭐'];

// =================== STORAGE ===================
function loadDB() {
  try { const d = localStorage.getItem('tj_pro_db_v3'); if (d) DB = JSON.parse(d); } catch(e) {}
}
function saveDB() { localStorage.setItem('tj_pro_db_v3', JSON.stringify(DB)); }

// =================== UTILS ===================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function fmtUSD(v) { return (v >= 0 ? '+' : '') + parseFloat(v).toLocaleString('en-US', {style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtPct(v) { return (v >= 0 ? '+' : '') + parseFloat(v).toFixed(2) + '%'; }
function fmtDate(d) { return d ? new Date(d+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}) : '—'; }
function fmtDateShort(d) { return d ? new Date(d+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short'}) : '—'; }
function getWeek(d) { const dt=new Date(d+'T12:00:00'); const j=new Date(dt.getFullYear(),0,1); return Math.ceil(((dt-j)/86400000+j.getDay()+1)/7); }
function getMonth(d) { return d ? d.slice(0,7) : ''; }
function getYear(d)  { return d ? d.slice(0,4) : ''; }
function stratColor(id) { const s=DB.strategies.find(x=>x.id===id); return s ? s.color : COLORS[0]; }
function stratName(id)  { const s=DB.strategies.find(x=>x.id===id); return s ? s.name : '—'; }
function activeTrades() { return currentMode === 'backtest' ? DB.trades : DB.realTrades; }
function emotionLabel(val) { const e=EMOTIONS.find(x=>x.val===val); return e?e.label:''; }
function emotionColor(val) { const e=EMOTIONS.find(x=>x.val===val); return e?e.color:'var(--text2)'; }

// =================== PERIOD FILTER ===================
function getDateRange(period) {
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  if (!period) return null;
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') {
    const d = new Date(now); d.setDate(now.getDate() - now.getDay() + 1);
    return { from: d.toISOString().slice(0,10), to: today };
  }
  if (period === 'month') {
    return { from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, to: today };
  }
  if (period === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: today };
  }
  return null;
}

function filteredTrades() {
  const range = getDateRange(filters.period);
  return activeTrades().filter(t => {
    if (filters.strategy && t.strategyId !== filters.strategy) return false;
    if (filters.month && getMonth(t.date) !== filters.month) return false;
    if (range && (t.date < range.from || t.date > range.to)) return false;
    return true;
  }).sort((a,b) => a.date > b.date ? -1 : 1);
}

function tradesForPeriod(period) {
  const range = getDateRange(period);
  if (!range) return activeTrades();
  return activeTrades().filter(t => t.date >= range.from && t.date <= range.to);
}

function calcMetrics(trades) {
  const exec  = trades.filter(t => t.resultado !== 'Sin Entrada');
  const wins  = exec.filter(t => t.resultado === 'Positivo');
  const loses = exec.filter(t => t.resultado === 'Negativo');
  const total = exec.reduce((s,t) => s + (parseFloat(t.pnlUSD)||0), 0);
  const wr    = exec.length ? wins.length / exec.length * 100 : 0;
  const gp    = wins.reduce((s,t) => s + (parseFloat(t.pnlUSD)||0), 0);
  const gl    = Math.abs(loses.reduce((s,t) => s + (parseFloat(t.pnlUSD)||0), 0));
  const pf    = gl > 0 ? gp / gl : gp > 0 ? 999 : 0;
  let peak=DB.settings.capital, eq=DB.settings.capital, dd=0;
  [...trades].sort((a,b)=>a.date>b.date?1:-1).forEach(t=>{
    if(t.resultado==='Sin Entrada') return;
    eq += parseFloat(t.pnlUSD)||0;
    if(eq>peak) peak=eq;
    const d = peak>0 ? (peak-eq)/peak*100 : 0;
    if(d>dd) dd=d;
  });
  const avgW = wins.length  ? gp / wins.length  : 0;
  const avgL = loses.length ? gl / loses.length : 0;
  const w = wr/100;
  const exp = (wins.length && loses.length) ? (w*avgW)-((1-w)*avgL) : 0;
  const commissions = exec.reduce((s,t)=>s+(parseFloat(t.commission)||0),0);
  const rr = avgL > 0 ? avgW / avgL : 0;
  // Best/worst streak
  let streak=0,maxStreak=0,lStreak=0,maxLStreak=0;
  [...exec].sort((a,b)=>a.date>b.date?1:-1).forEach(t=>{
    if(t.resultado==='Positivo'){streak++;lStreak=0;if(streak>maxStreak)maxStreak=streak;}
    else{lStreak++;streak=0;if(lStreak>maxLStreak)maxLStreak=lStreak;}
  });
  return { total, winRate:wr, trades:exec.length, wins:wins.length, pf, dd, expectancy:exp, gross_profit:gp, gross_loss:gl, commissions, avgWin:avgW, avgLoss:avgL, rr, bestStreak:maxStreak, worstStreak:maxLStreak };
}

// =================== LEVERAGE ===================
function getLeverage() { return Math.max(1, parseFloat(DB.settings.leverage)||1); }
function getMarginCapital() { return parseFloat(DB.settings.marginCapital)||0; }
function getOperatingCapital() {
  const mc = getMarginCapital();
  if (mc > 0) return mc * getLeverage();
  return DB.settings.capital;
}

// =================== MODE ===================
function switchMode(mode) {
  currentMode = mode;
  document.body.classList.toggle('mode-real', mode === 'real');
  document.getElementById('sidebar').classList.toggle('mode-real', mode === 'real');
  document.getElementById('logo-mode-badge').textContent = mode === 'real' ? '● REAL' : '● BACKTEST';
  const badge = document.getElementById('topbar-mode-badge');
  badge.textContent = mode === 'real' ? 'REAL' : 'BACKTEST';
  badge.classList.toggle('real', mode === 'real');
  document.getElementById('btn-backtest').classList.toggle('active', mode==='backtest');
  document.getElementById('btn-backtest').classList.toggle('backtest-active', mode==='backtest');
  document.getElementById('btn-real').classList.toggle('active', mode==='real');
  document.getElementById('btn-real').classList.toggle('real-active', mode==='real');
  filters = { strategy:'', month:'', period:'' };
  populateFilters();
  showPage('dashboard');
}

// =================== FILTERS ===================
function applyFilters() {
  filters.strategy = document.getElementById('filter-strategy').value;
  filters.month    = document.getElementById('filter-month').value;
  filters.period   = document.getElementById('filter-period').value;
  // Si selecciona periodo, quitar mes concreto y viceversa
  if (filters.period && filters.month) {
    filters.month = '';
    document.getElementById('filter-month').value = '';
  }
  renderCurrentPage();
}

function populateFilters() {
  const fs=document.getElementById('filter-strategy');
  const fm=document.getElementById('filter-month');
  const fp=document.getElementById('filter-period');
  const cs=fs.value, cm=fm.value, cp=fp?fp.value:'';
  fs.innerHTML = '<option value="">Todas las estrategias</option>' +
    DB.strategies.map(s=>`<option value="${s.id}" ${cs===s.id?'selected':''}>${s.name}</option>`).join('');
  const months = [...new Set(activeTrades().map(t=>getMonth(t.date)).filter(Boolean))].sort().reverse();
  fm.innerHTML = '<option value="">Todos los meses</option>' +
    months.map(m=>`<option value="${m}" ${cm===m?'selected':''}>${m}</option>`).join('');
  if (fp) fp.value = cp;
}

// =================== NAVIGATION ===================
function showPage(p) {
  currentPage = p;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active','real-mode'));
  const active = document.querySelector(`.nav-btn[data-page="${p}"]`);
  if (active) { active.classList.add('active'); if(currentMode==='real') active.classList.add('real-mode'); }
  const titles = {
    dashboard:'Dashboard', trades:'Operaciones', 'add-trade':'Nueva Operación',
    'trade-review':'Revisión Mental', 'charts-library':'Biblioteca de Charts',
    performance:'Rendimiento', weekly:'Análisis Semanal',
    monthly:'Análisis Mensual', compare:'Comparar Estrategias',
    strategies:'Estrategias', settings:'Ajustes'
  };
  document.getElementById('page-title').textContent = (titles[p]||p) + (currentMode==='real' ? ' — Cuenta Real' : ' — Backtest');
  populateFilters();
  renderCurrentPage();
}

function renderCurrentPage() {
  const c = document.getElementById('content');
  if      (currentPage==='dashboard')      { c.innerHTML=renderDashboard();    initDashboardCharts(); }
  else if (currentPage==='trades')           c.innerHTML=renderTrades();
  else if (currentPage==='add-trade')        c.innerHTML=renderAddTrade();
  else if (currentPage==='trade-review')     c.innerHTML=renderTradeReview();
  else if (currentPage==='charts-library')   c.innerHTML=renderChartsLibrary();
  else if (currentPage==='performance')    { c.innerHTML=renderPerformance();  initPerformanceCharts(); }
  else if (currentPage==='weekly')         { c.innerHTML=renderWeekly();       initWeeklyCharts(); }
  else if (currentPage==='monthly')        { c.innerHTML=renderMonthly();      initMonthlyCharts(); }
  else if (currentPage==='compare')        { c.innerHTML=renderCompare();      initCompareCharts(); }
  else if (currentPage==='strategies')       c.innerHTML=renderStrategies();
  else if (currentPage==='settings')         c.innerHTML=renderSettings();
}

// =================== LEVERAGE BANNER ===================
function renderLeverageBanner() {
  const lev = getLeverage();
  const mc  = getMarginCapital();
  if (lev <= 1 && mc === 0) return '';
  const opCap = getOperatingCapital();
  return `<div class="account-banner lev-banner">
  <span style="color:var(--orange);font-weight:700">🔢 APALANCAMIENTO ${lev}x</span>
  ${mc > 0 ? `<span style="color:var(--text2)">Capital en cuenta: <b style="color:var(--text)">$${mc.toLocaleString()}</b></span>` : ''}
  <span style="color:var(--text2)">Capital operado: <b style="color:var(--orange)">$${Math.round(opCap).toLocaleString()}</b></span>
  <span style="color:var(--text3);font-size:11px">El P&L se calcula sobre el capital operado</span>
</div>`;
}

// =================== DASHBOARD ===================
function renderDashboard() {
  const trades = filteredTrades();
  const m = calcMetrics(trades);
  const cap = DB.settings.capital;
  const equity = cap + m.total;
  const isReal = currentMode === 'real';
  return `
${isReal ? `<div class="account-banner real-banner">
  <span style="color:var(--blue);font-weight:600">💹 CUENTA REAL</span>
  ${DB.settings.broker ? `<span style="color:var(--text2)">Broker: <b style="color:var(--text)">${DB.settings.broker}</b></span>` : ''}
  ${DB.settings.accountNumber ? `<span style="color:var(--text2)">Cuenta: <b style="color:var(--text)">${DB.settings.accountNumber}</b></span>` : ''}
  ${DB.settings.accountType ? `<span class="tag tag-blue">${DB.settings.accountType}</span>` : ''}
</div>` : ''}
${renderLeverageBanner()}
<div class="kpi-grid">
  <div class="kpi ${m.total>=0?'green':'red'}">
    <div class="kpi-label">P&L Total</div>
    <div class="kpi-value">${fmtUSD(m.total)}</div>
    <div class="kpi-sub">${fmtPct(cap>0?m.total/cap*100:0)}</div>
  </div>
  <div class="kpi blue">
    <div class="kpi-label">Capital Actual</div>
    <div class="kpi-value">$${Math.round(equity).toLocaleString()}</div>
    <div class="kpi-sub">Base: $${cap.toLocaleString()}</div>
  </div>
  <div class="kpi ${m.winRate>=50?'green':'red'}">
    <div class="kpi-label">Win Rate</div>
    <div class="kpi-value">${m.winRate.toFixed(1)}%</div>
    <div class="kpi-sub">${m.wins}W / ${m.trades-m.wins}L</div>
  </div>
  <div class="kpi yellow">
    <div class="kpi-label">Total Trades</div>
    <div class="kpi-value">${m.trades}</div>
    <div class="kpi-sub">${trades.filter(t=>t.resultado==='Sin Entrada').length} sin entrada</div>
  </div>
  <div class="kpi ${m.pf>=1?'green':'red'}">
    <div class="kpi-label">Profit Factor</div>
    <div class="kpi-value">${m.pf===999?'∞':m.pf.toFixed(2)}</div>
    <div class="kpi-sub">PF > 1 = rentable</div>
  </div>
  <div class="kpi red">
    <div class="kpi-label">Max Drawdown</div>
    <div class="kpi-value">-${m.dd.toFixed(2)}%</div>
    <div class="kpi-sub">Desde el máximo</div>
  </div>
  <div class="kpi ${m.expectancy>=0?'green':'red'}">
    <div class="kpi-label">Expectancy</div>
    <div class="kpi-value">${fmtUSD(m.expectancy)}</div>
    <div class="kpi-sub">Por trade</div>
  </div>
  <div class="kpi teal">
    <div class="kpi-label">R:R Promedio</div>
    <div class="kpi-value">${m.rr.toFixed(2)}</div>
    <div class="kpi-sub">Ratio riesgo/beneficio</div>
  </div>
  ${isReal ? `<div class="kpi purple">
    <div class="kpi-label">Comisiones</div>
    <div class="kpi-value" style="font-size:18px">-${fmtUSD(m.commissions).replace('+','')}</div>
    <div class="kpi-sub">Total pagado</div>
  </div>` : `<div class="kpi blue">
    <div class="kpi-label">Gross P / L</div>
    <div class="kpi-value" style="font-size:16px;color:var(--green)">+$${Math.round(m.gross_profit).toLocaleString()}</div>
    <div class="kpi-sub" style="color:var(--red)">-$${Math.round(m.gross_loss).toLocaleString()}</div>
  </div>`}
  <div class="kpi green">
    <div class="kpi-label">Mejor Racha</div>
    <div class="kpi-value">${m.bestStreak}</div>
    <div class="kpi-sub">Consecutivos ganados</div>
  </div>
  <div class="kpi red">
    <div class="kpi-label">Peor Racha</div>
    <div class="kpi-value">${m.worstStreak}</div>
    <div class="kpi-sub">Consecutivos perdidos</div>
  </div>
</div>
<div class="chart-grid">
  <div class="card"><h3>Equity Curve</h3><div class="chart-wrap-tall"><canvas id="ch-equity"></canvas></div></div>
  <div class="card"><h3>P&L por Estrategia</h3><div class="chart-wrap-tall"><canvas id="ch-strat"></canvas></div></div>
</div>
<div class="chart-grid-3">
  <div class="card"><h3>Resultados Diarios</h3><div class="chart-wrap"><canvas id="ch-daily"></canvas></div></div>
  <div class="card"><h3>Distribución</h3><div class="chart-wrap"><canvas id="ch-dist"></canvas></div></div>
  <div class="card"><h3>Sesiones</h3><div class="chart-wrap"><canvas id="ch-sessions"></canvas></div></div>
</div>
<div class="card">
  <h3>Últimas Operaciones</h3>
  <div class="table-wrap">${renderTradesTable(trades.slice(0,8), true)}</div>
</div>`;
}

function initDashboardCharts() {
  const trades = filteredTrades();
  const sorted = [...trades].sort((a,b)=>a.date>b.date?1:-1);
  let eq=DB.settings.capital; const eL=[],eD=[];
  sorted.forEach(t=>{ if(t.resultado!=='Sin Entrada'){ eq+=parseFloat(t.pnlUSD)||0; eL.push(fmtDateShort(t.date)); eD.push(parseFloat(eq.toFixed(2))); }});
  newLineChart('ch-equity',eL,eD,'Capital','rgba(0,230,118,0.12)','#00e676');
  const sm={};
  DB.strategies.forEach(s=>{ sm[s.id]={name:s.name,total:0,color:s.color}; });
  trades.forEach(t=>{ if(t.resultado!=='Sin Entrada'&&sm[t.strategyId]) sm[t.strategyId].total+=parseFloat(t.pnlUSD)||0; });
  const sk=Object.keys(sm);
  newBarChart('ch-strat',sk.map(k=>sm[k].name),sk.map(k=>parseFloat(sm[k].total.toFixed(2))),sk.map(k=>sm[k].total>=0?'#00e676':'#ff1744'));
  const dm={};
  sorted.forEach(t=>{ if(t.resultado!=='Sin Entrada'){ if(!dm[t.date])dm[t.date]=0; dm[t.date]+=parseFloat(t.pnlUSD)||0; }});
  const dk=Object.keys(dm).sort();
  newBarChart('ch-daily',dk.map(d=>fmtDateShort(d)),dk.map(k=>parseFloat(dm[k].toFixed(2))),dk.map(k=>dm[k]>=0?'#00e676':'#ff1744'));
  newDoughnutChart('ch-dist',
    ['Positivo','Negativo','Sin Entrada'],
    [trades.filter(t=>t.resultado==='Positivo').length, trades.filter(t=>t.resultado==='Negativo').length, trades.filter(t=>t.resultado==='Sin Entrada').length],
    ['#00e676','#ff1744','#9090b0']);
  const ses={};SESSIONS.forEach(s=>{ses[s]=0;});
  trades.forEach(t=>{ if(t.session&&ses[t.session]!==undefined) ses[t.session]++; });
  newDoughnutChart('ch-sessions',Object.keys(ses),Object.values(ses),['#2979ff','#ffd600','#e040fb']);
}

// =================== TRADES LIST ===================
function renderTrades() {
  const trades = filteredTrades();
  return `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
  <span style="color:var(--text2)">${trades.length} operaciones · ${currentMode==='real'?'Cuenta Real':'Backtest'}</span>
  <button class="btn btn-primary" onclick="openTradeModal()">+ Nueva Operación</button>
</div>
<div class="card"><div class="table-wrap">${renderTradesTable(trades, false)}</div></div>`;
}

function renderTradesTable(trades, mini) {
  if (!trades.length) return `<p style="color:var(--text2);padding:20px;text-align:center">Sin operaciones. <a href="#" onclick="showPage('add-trade');return false" style="color:var(--green)">Agregar →</a></p>`;
  const isReal = currentMode === 'real';
  return `<table>
<thead><tr>
  <th>Fecha</th><th>Estrategia</th><th>Activo</th><th>TF</th><th>Sesión</th>
  <th>Resultado</th><th>P&L USD</th><th>%</th>
  ${isReal && !mini ? '<th>Comisión</th>' : ''}
  <th>Cal.</th><th>Estado</th>
  ${mini ? '' : '<th>Acciones</th>'}
</tr></thead>
<tbody>${trades.map(t=>`<tr onclick="openReviewModal('${t.id}')" title="Click para ver análisis completo">
  <td>${fmtDate(t.date)}</td>
  <td><span class="tag" style="background:${stratColor(t.strategyId)}22;color:${stratColor(t.strategyId)}">${stratName(t.strategyId)}</span></td>
  <td><b>${t.asset||'—'}</b></td>
  <td><span class="tag tag-gray">${t.tf||'—'}</span></td>
  <td><span class="tag tag-gray">${t.session||'—'}</span></td>
  <td><span class="tag ${t.resultado==='Positivo'?'tag-green':t.resultado==='Negativo'?'tag-red':'tag-gray'}">${t.resultado}</span></td>
  <td class="${(parseFloat(t.pnlUSD)||0)>=0?'positive':'negative'}">${t.resultado==='Sin Entrada'?'—':fmtUSD(t.pnlUSD||0)}</td>
  <td class="${(parseFloat(t.pnlPct)||0)>=0?'positive':'negative'}">${t.resultado==='Sin Entrada'?'—':fmtPct(t.pnlPct||0)}</td>
  ${isReal && !mini ? `<td class="negative">${t.commission?'-$'+parseFloat(t.commission).toFixed(2):'—'}</td>` : ''}
  <td>${t.entryQuality ? '⭐'.repeat(t.entryQuality) : '<span style="color:var(--text3)">—</span>'}</td>
  <td>${(t.img1||t.img2)?`<span class="tag tag-blue">📷 ${[t.img1,t.img2].filter(Boolean).length} img</span>`:'<span style="color:var(--text3)">sin img</span>'}</td>
  ${mini ? '' : `<td style="white-space:nowrap" onclick="event.stopPropagation()"><button class="btn btn-secondary btn-sm" onclick="openTradeModal('${t.id}')">✏️</button> <button class="btn btn-danger btn-sm" onclick="deleteTrade('${t.id}')">🗑</button></td>`}
</tr>`).join('')}</tbody></table>`;
}

// =================== TRADE REVIEW PAGE ===================
function renderTradeReview() {
  const allTrades = activeTrades().filter(t => t.img1 || t.img2 || t.notes);
  let filtered = allTrades;
  if (reviewFilters.result) filtered = filtered.filter(t => t.resultado === reviewFilters.result);
  if (reviewFilters.strategy) filtered = filtered.filter(t => t.strategyId === reviewFilters.strategy);
  filtered = filtered.sort((a,b) => a.date > b.date ? -1 : 1);

  const hasImg = filtered.filter(t => t.img1 || t.img2).length;
  const hasNotes = filtered.filter(t => t.notes && t.notes.trim()).length;

  return `
<div class="review-filter-bar">
  <label>Filtrar por:</label>
  <select onchange="reviewFilters.result=this.value;renderCurrentPage()">
    <option value="" ${reviewFilters.result===''?'selected':''}>Todos los resultados</option>
    ${RESULTADOS.map(r=>`<option value="${r}" ${reviewFilters.result===r?'selected':''}>${r}</option>`).join('')}
  </select>
  <select onchange="reviewFilters.strategy=this.value;renderCurrentPage()">
    <option value="" ${reviewFilters.strategy===''?'selected':''}>Todas las estrategias</option>
    ${DB.strategies.map(s=>`<option value="${s.id}" ${reviewFilters.strategy===s.id?'selected':''}>${s.name}</option>`).join('')}
  </select>
  <span style="color:var(--text3);font-size:12px;margin-left:auto">${filtered.length} operaciones · ${hasImg} con capturas · ${hasNotes} con análisis escrito</span>
</div>

${!filtered.length ? `<div class="card" style="text-align:center;padding:40px">
  <div style="font-size:48px;margin-bottom:12px">🧠</div>
  <div style="font-size:16px;font-weight:600;margin-bottom:8px">Sin operaciones para revisar</div>
  <div style="color:var(--text2);font-size:13px">Las operaciones con capturas o notas aparecerán aquí para estudiar tus entradas.</div>
</div>` : `
<div class="review-grid">
${filtered.map(t => `
<div class="review-card">
  <div class="review-card-header">
    <div>
      <div style="font-size:14px;font-weight:700">${fmtDate(t.date)} · <b>${t.asset||'—'}</b> <span class="tag tag-gray" style="font-size:11px">${t.tf||'—'}</span></div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap">
        <span class="tag" style="background:${stratColor(t.strategyId)}22;color:${stratColor(t.strategyId)}">${stratName(t.strategyId)}</span>
        <span class="tag ${t.resultado==='Positivo'?'tag-green':t.resultado==='Negativo'?'tag-red':'tag-gray'}">${t.resultado}</span>
        ${t.session?`<span class="tag tag-gray">${t.session}</span>`:''}
        ${t.tendencia?`<span class="tag tag-gray">${t.tendencia}</span>`:''}
        ${t.resultado!=='Sin Entrada'?`<span class="${(parseFloat(t.pnlUSD)||0)>=0?'positive':'negative'}" style="font-weight:700;font-size:13px">${fmtUSD(t.pnlUSD||0)}</span>`:''}
      </div>
    </div>
    <div style="margin-left:auto;text-align:right;flex-shrink:0">
      ${t.entryQuality ? `<div style="color:var(--yellow);font-size:16px">${'⭐'.repeat(t.entryQuality)}</div>` : ''}
      ${t.emotion ? `<div style="font-size:13px;margin-top:4px">${emotionLabel(t.emotion)}</div>` : ''}
      <button class="btn btn-info btn-sm" style="margin-top:6px" onclick="openReviewModal('${t.id}')">🔍 Ver análisis</button>
    </div>
  </div>
  ${(t.img1||t.img2) ? `<div class="review-card-imgs" style="grid-template-columns:${t.img1&&t.img2?'1fr 1fr':'1fr'}">
    ${t.img1?`<div class="review-card-img-wrap"><img src="${t.img1}" onclick="openImgModalFull('${t.id}','img1')" loading="lazy"><div class="review-card-img-label">📸 ANTES</div></div>`:''}
    ${t.img2?`<div class="review-card-img-wrap"><img src="${t.img2}" onclick="openImgModalFull('${t.id}','img2')" loading="lazy"><div class="review-card-img-label">📊 DESPUÉS</div></div>`:''}
  </div>` : ''}
  ${t.notes && t.notes.trim() ? `<div class="review-card-body">
    <div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📝 Análisis / Notas</div>
    <div class="review-notes">${escapeHtml(t.notes)}</div>
  </div>` : ''}
</div>`).join('')}
</div>`}`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// =================== MODAL REVIEW ===================
function openReviewModal(tradeId) {
  const t = activeTrades().find(x=>x.id===tradeId);
  if (!t) return;
  document.getElementById('modal-review-title').textContent = `📋 ${fmtDate(t.date)} · ${t.asset||'—'} ${t.tf||''}`;
  document.getElementById('modal-review-content').innerHTML = `
<div class="modal-review-meta">
  <span class="tag" style="background:${stratColor(t.strategyId)}22;color:${stratColor(t.strategyId)}">${stratName(t.strategyId)}</span>
  <span class="tag ${t.resultado==='Positivo'?'tag-green':t.resultado==='Negativo'?'tag-red':'tag-gray'}">${t.resultado}</span>
  ${t.session?`<span class="tag tag-gray">🕐 ${t.session}</span>`:''}
  ${t.tendencia?`<span class="tag tag-gray">📈 ${t.tendencia}</span>`:''}
  ${t.resultado!=='Sin Entrada'?`<span class="${(parseFloat(t.pnlUSD)||0)>=0?'positive':'negative'}" style="font-weight:700;font-size:15px">${fmtUSD(t.pnlUSD||0)}</span>`:''}
  ${t.resultado!=='Sin Entrada'?`<span class="${(parseFloat(t.pnlPct)||0)>=0?'positive':'negative'}" style="font-size:13px">${fmtPct(t.pnlPct||0)}</span>`:''}
  ${t.entryQuality?`<span style="color:var(--yellow)">${'⭐'.repeat(t.entryQuality)}</span>`:''}
  ${t.emotion?`<span style="font-size:14px">${emotionLabel(t.emotion)}</span>`:''}
</div>
${(t.img1||t.img2)?`<div class="modal-review-img-grid" style="grid-template-columns:${t.img1&&t.img2?'1fr 1fr':'1fr'}">
  ${t.img1?`<div class="modal-review-img-wrap">
    <img src="${t.img1}" onclick="openImgModalFull('${t.id}','img1')" title="Click para ampliar">
    <div class="modal-review-img-label">📸 Captura Antes / Setup</div>
  </div>`:''}
  ${t.img2?`<div class="modal-review-img-wrap">
    <img src="${t.img2}" onclick="openImgModalFull('${t.id}','img2')" title="Click para ampliar">
    <div class="modal-review-img-label">📊 Captura Después / Resultado</div>
  </div>`:''}
</div>`:'<div style="color:var(--text3);font-size:13px;font-style:italic;margin-bottom:14px">Sin capturas de pantalla registradas.</div>'}
${t.notes && t.notes.trim() ? `
<div style="margin-bottom:8px">
  <div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📝 Análisis / Sensaciones / Decisiones</div>
  <div class="modal-review-notes">${escapeHtml(t.notes)}</div>
</div>` : '<div style="color:var(--text3);font-size:13px;font-style:italic;margin-bottom:14px">Sin notas de análisis.</div>'}
<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
  <button class="btn btn-secondary" onclick="closeReviewModal()">Cerrar</button>
  <button class="btn btn-secondary" onclick="closeReviewModal();openTradeModal('${t.id}')">✏️ Editar operación</button>
</div>`;
  document.getElementById('modal-review-bg').classList.remove('hidden');
}

function closeReviewModal() { document.getElementById('modal-review-bg').classList.add('hidden'); }

function openImgModalFull(tradeId, which) {
  const t = activeTrades().find(x=>x.id===tradeId);
  if (!t) return;
  const src = which==='img1' ? t.img1 : t.img2;
  const label = which==='img1' ? 'Captura Antes / Setup' : 'Captura Después / Resultado';
  document.getElementById('modal-img-src').src = src;
  document.getElementById('modal-img-caption').innerHTML =
    `<span style="font-weight:600">${fmtDate(t.date)} · ${t.asset||''} ${t.tf||''} · ${label}</span>` +
    `<span class="tag ${t.resultado==='Positivo'?'tag-green':t.resultado==='Negativo'?'tag-red':'tag-gray'}" style="margin-left:8px">${t.resultado}</span>`;
  const notesEl = document.getElementById('modal-img-notes');
  if (t.notes && t.notes.trim()) {
    notesEl.style.display = 'block';
    notesEl.innerHTML = `<div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📝 Análisis</div><div style="line-height:1.7;white-space:pre-wrap">${escapeHtml(t.notes)}</div>`;
  } else {
    notesEl.style.display = 'none';
  }
  document.getElementById('modal-img-bg').classList.remove('hidden');
}

// =================== ADD TRADE INLINE ===================
function renderAddTrade() {
  const strats = DB.strategies;
  const isReal = currentMode === 'real';
  return `
<div class="card" style="max-width:960px">
  <h3 style="margin-bottom:20px">${isReal?'💹 Registrar Operación Real':'📊 Registrar Operación Backtest'}</h3>
  <div class="form-grid">
    <div class="form-group"><label>Fecha *</label><input type="date" id="f-date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-group"><label>Estrategia *</label>
      <select id="f-strategy">${strats.length?strats.map(s=>`<option value="${s.id}">${s.name}</option>`).join(''):'<option value="">— Crea una estrategia primero —</option>'}</select>
    </div>
    <div class="form-group"><label>Activo (símbolo)</label><input type="text" id="f-asset" placeholder="EURUSD, BTC, SPX, NQ..."></div>
    <div class="form-group"><label>Temporalidad</label>
      <select id="f-tf"><option value="">—</option>${TIMEFRAMES.map(tf=>`<option>${tf}</option>`).join('')}<option value="otro">Otro</option></select>
    </div>
    <div class="form-group"><label>Sesión</label>
      <select id="f-session"><option value="">—</option>${SESSIONS.map(s=>`<option>${s}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Tendencia</label>
      <select id="f-tendencia"><option value="">—</option>${TENDENCIAS.map(s=>`<option>${s}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Resultado *</label>
      <select id="f-resultado">${RESULTADOS.map(s=>`<option>${s}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>P&L USD</label><input type="number" id="f-pnl" placeholder="672 o -560" step="0.01"></div>
    <div class="form-group"><label>P&L %</label><input type="number" id="f-pct" placeholder="1.2 o -1" step="0.01"></div>
    <div class="form-group"><label>Capital Base (USD)</label><input type="number" id="f-capital" value="${DB.settings.capital}"></div>
    <div class="form-group"><label>Riesgo (USD)</label><input type="number" id="f-risk" value="${DB.settings.riskPerTrade}" step="0.01"></div>
    ${isReal ? `<div class="form-group"><label>Comisión / Spread (USD)</label><input type="number" id="f-commission" value="0" step="0.01" placeholder="Ej: 7.50"></div>` : ''}
    ${getLeverage() > 1 ? `<div class="form-group"><label>Capital Operado (con apalancamiento)</label>
      <input type="number" id="f-oplevel" value="${getOperatingCapital()}" step="0.01">
      <span style="font-size:11px;color:var(--orange)">⚡ ${getLeverage()}x apalancamiento</span>
    </div>` : ''}
  </div>
  
  <div class="divider"></div>
  
  <div class="form-grid">
    <div class="form-group form-full"><label>📝 Análisis / Sensaciones / Por qué tomé esta operación</label>
      <textarea id="f-notes" rows="5" placeholder="Describe detalladamente: ¿Qué vi en el gráfico? ¿Cuál era mi tesis? ¿Cómo me sentía? ¿Dudé? ¿Había noticias? ¿Qué salió bien o mal? Cuanto más detalle, más aprenderás al revisar..."></textarea>
    </div>

    <div class="form-group">
      <label>🎯 Calidad de la entrada (1-5 ⭐)</label>
      <div class="star-group" id="star-group">
        ${[1,2,3,4,5].map(i=>`<button class="star-btn" data-val="${i}" onclick="selectStars(${i})" title="${i} estrella${i>1?'s':''}">⭐</button>`).join('')}
      </div>
      <input type="hidden" id="f-quality" value="">
      <span style="font-size:11px;color:var(--text3)">1=muy mala entrada · 5=setup perfecto</span>
    </div>

    <div class="form-group">
      <label>😊 Estado emocional</label>
      <div class="emotion-group" id="emotion-group">
        ${EMOTIONS.map(e=>`<button class="emotion-btn" data-val="${e.val}" onclick="selectEmotion('${e.val}')">${e.label}</button>`).join('')}
      </div>
      <input type="hidden" id="f-emotion" value="">
    </div>

    <div class="form-group">
      <label>📷 Captura Antes (setup / pre-entrada)</label>
      <div class="img-upload-area" onclick="document.getElementById('f-img1').click()">
        <input type="file" id="f-img1" accept="image/*" style="display:none" onchange="previewImg(this,'prev1','prev1-wrap')">
        <span style="font-size:20px">📸</span><span>Click para subir imagen</span>
        <span style="font-size:11px;color:var(--text3)">Setup, pre-entrada, análisis</span>
      </div>
      <div id="prev1-wrap" class="hidden"><img id="prev1" class="img-preview-thumb" onclick="openImgModal(this.src,'Captura Inicial')"></div>
    </div>
    <div class="form-group">
      <label>📷 Captura Después (resultado / cierre)</label>
      <div class="img-upload-area" onclick="document.getElementById('f-img2').click()">
        <input type="file" id="f-img2" accept="image/*" style="display:none" onchange="previewImg(this,'prev2','prev2-wrap')">
        <span style="font-size:20px">📊</span><span>Click para subir imagen</span>
        <span style="font-size:11px;color:var(--text3)">Resultado, cierre, post-análisis</span>
      </div>
      <div id="prev2-wrap" class="hidden"><img id="prev2" class="img-preview-thumb" onclick="openImgModal(this.src,'Captura Final')"></div>
    </div>
  </div>

  <div class="btn-bar">
    <button class="btn btn-primary" id="save-inline-btn" onclick="saveTradeInline()">💾 Guardar Operación</button>
    <button class="btn btn-secondary" onclick="renderCurrentPage()">🧹 Limpiar</button>
  </div>
</div>`;
}

let selectedStars = 0;
let selectedEmotion = '';

function selectStars(val) {
  selectedStars = val;
  document.querySelectorAll('.star-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.val) <= val);
  });
  const el = document.getElementById('f-quality');
  if (el) el.value = val;
}

function selectEmotion(val) {
  selectedEmotion = val;
  document.querySelectorAll('.emotion-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.val === val);
  });
  const el = document.getElementById('f-emotion');
  if (el) el.value = val;
}

function previewImg(input, imgId, wrapId) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    const img = document.getElementById(imgId);
    const wrap = document.getElementById(wrapId);
    img.src = e.target.result;
    wrap.classList.remove('hidden');
  };
  r.readAsDataURL(f);
}

function saveTradeInline() {
  const date = document.getElementById('f-date').value;
  const strategyId = document.getElementById('f-strategy').value;
  if (!date || !strategyId) { alert('Fecha y estrategia son requeridos'); return; }
  const btn = document.getElementById('save-inline-btn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  const trade = {
    id: uid(), date, strategyId,
    asset:        document.getElementById('f-asset').value,
    tf:           document.getElementById('f-tf').value,
    session:      document.getElementById('f-session').value,
    tendencia:    document.getElementById('f-tendencia').value,
    resultado:    document.getElementById('f-resultado').value,
    pnlUSD:       parseFloat(document.getElementById('f-pnl').value) || 0,
    pnlPct:       parseFloat(document.getElementById('f-pct').value) || 0,
    capital:      parseFloat(document.getElementById('f-capital').value) || DB.settings.capital,
    risk:         parseFloat(document.getElementById('f-risk').value) || DB.settings.riskPerTrade,
    commission:   currentMode==='real' ? (parseFloat(document.getElementById('f-commission')?.value)||0) : 0,
    notes:        document.getElementById('f-notes').value,
    entryQuality: parseInt(document.getElementById('f-quality')?.value) || 0,
    emotion:      document.getElementById('f-emotion')?.value || '',
    week:         getWeek(date), month: getMonth(date),
    mode:         currentMode,
    img1: '', img2: ''
  };
  const f1 = document.getElementById('f-img1');
  const f2 = document.getElementById('f-img2');
  const readImg = (inp, cb) => {
    if (inp && inp.files[0]) { const r=new FileReader(); r.onload=e=>cb(e.target.result); r.readAsDataURL(inp.files[0]); }
    else cb('');
  };
  readImg(f1, img1 => {
    trade.img1 = img1;
    readImg(f2, img2 => {
      trade.img2 = img2;
      if (currentMode === 'real') DB.realTrades.push(trade);
      else DB.trades.push(trade);
      saveDB();
      selectedStars = 0; selectedEmotion = '';
      showPage('trade-review');
    });
  });
}

// =================== MODAL EDIT ===================
function openTradeModal(id) {
  editingTradeId = id || null;
  const t = id ? activeTrades().find(x=>x.id===id) : null;
  const isReal = currentMode === 'real';
  document.getElementById('modal-trade-title').textContent = id ? 'Editar Operación' : 'Nueva Operación';
  document.getElementById('modal-trade-form').innerHTML = `
<div class="form-grid">
<div class="form-group"><label>Fecha *</label><input type="date" id="m-date" value="${t?t.date:new Date().toISOString().slice(0,10)}"></div>
<div class="form-group"><label>Estrategia *</label>
  <select id="m-strategy">${DB.strategies.map(s=>`<option value="${s.id}" ${t&&t.strategyId===s.id?'selected':''}>${s.name}</option>`).join('')}</select>
</div>
<div class="form-group"><label>Activo</label><input type="text" id="m-asset" value="${t?t.asset||'':''}" placeholder="EURUSD, BTC..."></div>
<div class="form-group"><label>Temporalidad</label>
  <select id="m-tf"><option value="">—</option>${TIMEFRAMES.map(tf=>`<option ${t&&t.tf===tf?'selected':''}>${tf}</option>`).join('')}</select>
</div>
<div class="form-group"><label>Sesión</label>
  <select id="m-session"><option value="">—</option>${SESSIONS.map(s=>`<option ${t&&t.session===s?'selected':''}>${s}</option>`).join('')}</select>
</div>
<div class="form-group"><label>Tendencia</label>
  <select id="m-tendencia"><option value="">—</option>${TENDENCIAS.map(s=>`<option ${t&&t.tendencia===s?'selected':''}>${s}</option>`).join('')}</select>
</div>
<div class="form-group"><label>Resultado</label>
  <select id="m-resultado">${RESULTADOS.map(s=>`<option ${t&&t.resultado===s?'selected':''}>${s}</option>`).join('')}</select>
</div>
<div class="form-group"><label>P&L USD</label><input type="number" id="m-pnl" value="${t?t.pnlUSD:''}" step="0.01"></div>
<div class="form-group"><label>P&L %</label><input type="number" id="m-pct" value="${t?t.pnlPct:''}" step="0.01"></div>
${isReal?`<div class="form-group"><label>Comisión (USD)</label><input type="number" id="m-commission" value="${t?t.commission||0:0}" step="0.01"></div>`:''}
<div class="form-group">
  <label>🎯 Calidad entrada</label>
  <div class="star-group" id="m-star-group">
    ${[1,2,3,4,5].map(i=>`<button class="star-btn ${t&&t.entryQuality>=i?'active':''}" data-val="${i}" onclick="selectStarsModal(${i})" >⭐</button>`).join('')}
  </div>
  <input type="hidden" id="m-quality" value="${t?t.entryQuality||0:0}">
</div>
<div class="form-group">
  <label>😊 Estado emocional</label>
  <div class="emotion-group" id="m-emotion-group">
    ${EMOTIONS.map(e=>`<button class="emotion-btn ${t&&t.emotion===e.val?'selected':''}" data-val="${e.val}" onclick="selectEmotionModal('${e.val}')">${e.label}</button>`).join('')}
  </div>
  <input type="hidden" id="m-emotion" value="${t?t.emotion||'':''}">
</div>
<div class="form-group form-full"><label>📝 Notas / Análisis / Sensaciones</label>
  <textarea id="m-notes" rows="4" placeholder="Describe tu análisis, por qué entraste, tus sensaciones, qué salió bien o mal...">${t?t.notes||'':''}</textarea>
</div>
${t&&t.img1?`<div class="form-group"><label>Captura Antes (guardada)</label><img src="${t.img1}" class="img-preview-thumb" onclick="openImgModal(this.src,'Captura Antes')"></div>`:''}
${t&&t.img2?`<div class="form-group"><label>Captura Después (guardada)</label><img src="${t.img2}" class="img-preview-thumb" onclick="openImgModal(this.src,'Captura Después')"></div>`:''}
</div>`;
  document.getElementById('modal-trade-bg').classList.remove('hidden');
}

function selectStarsModal(val) {
  document.querySelectorAll('#m-star-group .star-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.val) <= val);
  });
  const el = document.getElementById('m-quality');
  if (el) el.value = val;
}

function selectEmotionModal(val) {
  document.querySelectorAll('#m-emotion-group .emotion-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.val === val);
  });
  const el = document.getElementById('m-emotion');
  if (el) el.value = val;
}

function closeTradeModal() { document.getElementById('modal-trade-bg').classList.add('hidden'); editingTradeId=null; }

function saveTradeFromModal() {
  const date = document.getElementById('m-date').value;
  const strategyId = document.getElementById('m-strategy').value;
  if (!date || !strategyId) { alert('Fecha y estrategia son requeridos'); return; }
  const isReal = currentMode === 'real';
  const commEl = document.getElementById('m-commission');
  const data = {
    date, strategyId,
    asset:        document.getElementById('m-asset').value,
    tf:           document.getElementById('m-tf').value,
    session:      document.getElementById('m-session').value,
    tendencia:    document.getElementById('m-tendencia').value,
    resultado:    document.getElementById('m-resultado').value,
    pnlUSD:       parseFloat(document.getElementById('m-pnl').value)||0,
    pnlPct:       parseFloat(document.getElementById('m-pct').value)||0,
    commission:   isReal && commEl ? parseFloat(commEl.value)||0 : 0,
    notes:        document.getElementById('m-notes').value,
    entryQuality: parseInt(document.getElementById('m-quality')?.value)||0,
    emotion:      document.getElementById('m-emotion')?.value||'',
    week:         getWeek(date), month: getMonth(date), mode: currentMode
  };
  const list = isReal ? DB.realTrades : DB.trades;
  if (editingTradeId) {
    const i = list.findIndex(t=>t.id===editingTradeId);
    if (i>=0) list[i] = { ...list[i], ...data };
  } else {
    list.push({ id:uid(), ...data, img1:'', img2:'', capital:DB.settings.capital, risk:DB.settings.riskPerTrade });
  }
  saveDB(); closeTradeModal(); renderCurrentPage();
}

function deleteTrade(id) {
  if (!confirm('¿Eliminar esta operación?')) return;
  if (currentMode==='real') DB.realTrades = DB.realTrades.filter(t=>t.id!==id);
  else DB.trades = DB.trades.filter(t=>t.id!==id);
  saveDB(); renderCurrentPage();
}

// =================== CHARTS LIBRARY ===================
function renderChartsLibrary() {
  const trades = activeTrades().filter(t => t.img1 || t.img2);
  const filterStrat = filters.strategy;
  const filtered = filterStrat ? trades.filter(t=>t.strategyId===filterStrat) : trades;
  const imgs = [];
  filtered.forEach(t => {
    if (t.img1) imgs.push({ src:t.img1, trade:t, label:'Antes', which:'img1', caption:`${fmtDate(t.date)} · ${stratName(t.strategyId)} · ${t.asset||''} ${t.tf||''} · ${t.resultado}` });
    if (t.img2) imgs.push({ src:t.img2, trade:t, label:'Después', which:'img2', caption:`${fmtDate(t.date)} · ${stratName(t.strategyId)} · ${t.asset||''} ${t.tf||''} · Resultado` });
  });
  if (!imgs.length) return `
<div class="card" style="text-align:center;padding:40px">
  <div style="font-size:48px;margin-bottom:12px">🖼️</div>
  <div style="font-size:16px;font-weight:600;margin-bottom:8px">Biblioteca de Charts vacía</div>
  <div style="color:var(--text2);font-size:13px">Las capturas que subas al registrar operaciones aparecerán aquí.</div>
  <div style="margin-top:16px"><button class="btn btn-primary" onclick="showPage('add-trade')">➕ Registrar operación con captura</button></div>
</div>`;
  return `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
  <span style="color:var(--text2)">${imgs.length} capturas · ${filtered.length} operaciones con imágenes</span>
</div>
<div class="charts-lib-grid">
${imgs.map((img,i)=>`
<div class="chart-card">
  <img src="${img.src}" class="chart-card-img" alt="${img.caption}"
    onclick="openImgModalFull('${img.trade.id}','${img.which}')"
    onerror="this.style.display='none'" loading="lazy">
  <div class="chart-card-body">
    <div style="font-size:13px;font-weight:600">${fmtDate(img.trade.date)} · ${img.trade.asset||'—'} <span class="tag tag-gray" style="font-size:10px">${img.label}</span></div>
    <div class="chart-card-meta">
      <span class="tag" style="background:${stratColor(img.trade.strategyId)}22;color:${stratColor(img.trade.strategyId)}">${stratName(img.trade.strategyId)}</span>
      <span class="tag tag-gray">${img.trade.tf||'—'}</span>
      <span class="tag ${img.trade.resultado==='Positivo'?'tag-green':img.trade.resultado==='Negativo'?'tag-red':'tag-gray'}">${img.trade.resultado}</span>
      ${img.trade.resultado!=='Sin Entrada'?`<span class="${(parseFloat(img.trade.pnlUSD)||0)>=0?'positive':'negative'}" style="font-size:12px;font-weight:600">${fmtUSD(img.trade.pnlUSD||0)}</span>`:''}
    </div>
    ${img.trade.entryQuality?`<div style="color:var(--yellow);font-size:13px;margin-top:4px">${'⭐'.repeat(img.trade.entryQuality)}</div>`:''}
    ${img.trade.notes?`<div class="notes-preview">${escapeHtml(img.trade.notes.slice(0,100))}${img.trade.notes.length>100?'…':''}</div>`:''}
  </div>
</div>`).join('')}
</div>`;
}

// =================== IMAGE MODAL ===================
function openImgModal(src, caption, notes) {
  document.getElementById('modal-img-src').src = src;
  document.getElementById('modal-img-caption').innerHTML = `<span>${caption||''}</span>`;
  const notesEl = document.getElementById('modal-img-notes');
  if (notes && notes.trim()) {
    notesEl.style.display = 'block';
    notesEl.textContent = notes;
  } else {
    notesEl.style.display = 'none';
  }
  document.getElementById('modal-img-bg').classList.remove('hidden');
}
function closeImgModal() { document.getElementById('modal-img-bg').classList.add('hidden'); }

// =================== PERFORMANCE PAGE ===================
function renderPerformance() {
  const periods = [
    {val:'today',label:'Hoy'},
    {val:'week',label:'Esta semana'},
    {val:'month',label:'Este mes'},
    {val:'year',label:'Este año'},
    {val:'',label:'Todo'}
  ];
  const trades = tradesForPeriod(perfPeriod);
  const m = calcMetrics(trades);
  const cap = DB.settings.capital;

  return `
<div class="perf-period-bar">
  ${periods.map(p=>`<button class="perf-period-btn ${perfPeriod===p.val?'active':''}" onclick="perfPeriod='${p.val}';renderCurrentPage()">${p.label}</button>`).join('')}
</div>
${renderLeverageBanner()}
<div class="kpi-grid">
  <div class="kpi ${m.total>=0?'green':'red'}"><div class="kpi-label">P&L Periodo</div><div class="kpi-value">${fmtUSD(m.total)}</div><div class="kpi-sub">${fmtPct(cap>0?m.total/cap*100:0)}</div></div>
  <div class="kpi ${m.winRate>=50?'green':'red'}"><div class="kpi-label">Win Rate</div><div class="kpi-value">${m.winRate.toFixed(1)}%</div><div class="kpi-sub">${m.wins}W / ${m.trades-m.wins}L</div></div>
  <div class="kpi yellow"><div class="kpi-label">Trades Ejecutados</div><div class="kpi-value">${m.trades}</div><div class="kpi-sub">${trades.filter(t=>t.resultado==='Sin Entrada').length} sin entrada</div></div>
  <div class="kpi ${m.pf>=1?'green':'red'}"><div class="kpi-label">Profit Factor</div><div class="kpi-value">${m.pf===999?'∞':m.pf.toFixed(2)}</div></div>
  <div class="kpi red"><div class="kpi-label">Max Drawdown</div><div class="kpi-value">-${m.dd.toFixed(2)}%</div></div>
  <div class="kpi ${m.expectancy>=0?'green':'red'}"><div class="kpi-label">Expectancy</div><div class="kpi-value">${fmtUSD(m.expectancy)}</div><div class="kpi-sub">Por trade</div></div>
  <div class="kpi teal"><div class="kpi-label">R:R Promedio</div><div class="kpi-value">${m.rr.toFixed(2)}</div></div>
  <div class="kpi green"><div class="kpi-label">Avg Win</div><div class="kpi-value" style="font-size:16px">${fmtUSD(m.avgWin)}</div></div>
  <div class="kpi red"><div class="kpi-label">Avg Loss</div><div class="kpi-value" style="font-size:16px">${fmtUSD(-m.avgLoss)}</div></div>
  <div class="kpi green"><div class="kpi-label">Mejor Racha</div><div class="kpi-value">${m.bestStreak}</div></div>
  <div class="kpi red"><div class="kpi-label">Peor Racha</div><div class="kpi-value">${m.worstStreak}</div></div>
  ${currentMode==='real'?`<div class="kpi purple"><div class="kpi-label">Comisiones</div><div class="kpi-value" style="font-size:18px">-${fmtUSD(m.commissions).replace('+','')}</div></div>`:''}
</div>
<div class="chart-grid">
  <div class="card"><h3>Equity Curve — Periodo</h3><div class="chart-wrap-tall"><canvas id="ch-perf-equity"></canvas></div></div>
  <div class="card"><h3>P&L Acumulado por Día</h3><div class="chart-wrap-tall"><canvas id="ch-perf-daily"></canvas></div></div>
</div>
<div class="chart-grid-3">
  <div class="card"><h3>P&L por Estrategia</h3><div class="chart-wrap"><canvas id="ch-perf-strat"></canvas></div></div>
  <div class="card"><h3>Distribución Resultados</h3><div class="chart-wrap"><canvas id="ch-perf-dist"></canvas></div></div>
  <div class="card"><h3>Por Sesión</h3><div class="chart-wrap"><canvas id="ch-perf-sess"></canvas></div></div>
</div>
<div class="chart-grid-2">
  <div class="card"><h3>Calidad de Entradas (⭐)</h3><div class="chart-wrap"><canvas id="ch-perf-quality"></canvas></div></div>
  <div class="card"><h3>Estado Emocional vs Resultado</h3><div class="chart-wrap"><canvas id="ch-perf-emotion"></canvas></div></div>
</div>`;
}

function initPerformanceCharts() {
  const trades = tradesForPeriod(perfPeriod);
  const sorted = [...trades].sort((a,b)=>a.date>b.date?1:-1);
  // equity
  let eq=DB.settings.capital; const eL=[],eD=[];
  sorted.forEach(t=>{ if(t.resultado!=='Sin Entrada'){ eq+=parseFloat(t.pnlUSD)||0; eL.push(fmtDateShort(t.date)); eD.push(parseFloat(eq.toFixed(2))); }});
  newLineChart('ch-perf-equity',eL,eD,'Capital','rgba(0,230,118,0.12)','#00e676');
  // daily cumulative
  const dm={};
  sorted.forEach(t=>{ if(t.resultado!=='Sin Entrada'){ if(!dm[t.date])dm[t.date]=0; dm[t.date]+=parseFloat(t.pnlUSD)||0; }});
  const dk=Object.keys(dm).sort();
  newBarChart('ch-perf-daily',dk.map(d=>fmtDateShort(d)),dk.map(k=>parseFloat(dm[k].toFixed(2))),dk.map(k=>dm[k]>=0?'#00e676':'#ff1744'));
  // by strat
  const sm={};
  DB.strategies.forEach(s=>{ sm[s.id]={name:s.name,total:0,color:s.color}; });
  trades.forEach(t=>{ if(t.resultado!=='Sin Entrada'&&sm[t.strategyId]) sm[t.strategyId].total+=parseFloat(t.pnlUSD)||0; });
  const sk=Object.keys(sm);
  newBarChart('ch-perf-strat',sk.map(k=>sm[k].name),sk.map(k=>parseFloat(sm[k].total.toFixed(2))),sk.map(k=>sm[k].total>=0?'#00e676':'#ff1744'));
  // dist
  newDoughnutChart('ch-perf-dist',
    ['Positivo','Negativo','Sin Entrada'],
    [trades.filter(t=>t.resultado==='Positivo').length,trades.filter(t=>t.resultado==='Negativo').length,trades.filter(t=>t.resultado==='Sin Entrada').length],
    ['#00e676','#ff1744','#9090b0']);
  // sessions
  const ses={};SESSIONS.forEach(s=>{ses[s]=0;});
  trades.forEach(t=>{ if(t.session&&ses[t.session]!==undefined) ses[t.session]++; });
  newDoughnutChart('ch-perf-sess',Object.keys(ses),Object.values(ses),['#2979ff','#ffd600','#e040fb']);
  // quality
  const qm={1:0,2:0,3:0,4:0,5:0};
  trades.forEach(t=>{ if(t.entryQuality&&qm[t.entryQuality]!==undefined) qm[t.entryQuality]++; });
  newBarChart('ch-perf-quality',['⭐','⭐⭐','⭐⭐⭐','⭐⭐⭐⭐','⭐⭐⭐⭐⭐'],Object.values(qm),['#5a5a7a','#9090b0','#ffd600','#00bcd4','#00e676']);
  // emotion vs result
  const em={};
  EMOTIONS.forEach(e=>{ em[e.val]={wins:0,losses:0,total:0}; });
  trades.forEach(t=>{ if(t.emotion&&em[t.emotion]){em[t.emotion].total++;if(t.resultado==='Positivo')em[t.emotion].wins++;else if(t.resultado==='Negativo')em[t.emotion].losses++;} });
  const eKeys=EMOTIONS.map(e=>e.val).filter(k=>em[k].total>0);
  destroyChart('ch-perf-emotion'); const ctx=document.getElementById('ch-perf-emotion'); if(!ctx)return;
  charts['ch-perf-emotion']=new Chart(ctx,{type:'bar',data:{
    labels:eKeys.map(k=>EMOTIONS.find(e=>e.val===k)?.label||k),
    datasets:[
      {label:'Positivos',data:eKeys.map(k=>em[k].wins),backgroundColor:'#00e676',borderRadius:4},
      {label:'Negativos',data:eKeys.map(k=>em[k].losses),backgroundColor:'#ff1744',borderRadius:4}
    ]
  },options:{...BASE,plugins:{...BASE.plugins,legend:{display:true,labels:{color:'#9090b0',font:{size:11}}}}}});
}

// =================== WEEKLY ===================
function renderWeekly() {
  const trades = filteredTrades();
  const wm = {};
  trades.forEach(t => {
    const k = `${t.date.slice(0,4)}-W${String(t.week).padStart(2,'0')}`;
    if (!wm[k]) wm[k]={k,total:0,wins:0,executed:0};
    if (t.resultado!=='Sin Entrada'){wm[k].total+=parseFloat(t.pnlUSD)||0;wm[k].executed++;if(t.resultado==='Positivo')wm[k].wins++;}
  });
  const weeks = Object.values(wm).sort((a,b)=>a.k>b.k?-1:1);
  return `
<div class="card" style="margin-bottom:16px"><h3>P&L Semanal</h3><div class="chart-wrap-tall"><canvas id="ch-weekly"></canvas></div></div>
<div class="summary-grid">
${weeks.map(w=>`<div class="summary-card">
  <h4>${w.k}</h4>
  <div class="summary-row"><span>P&L</span><span class="${w.total>=0?'positive':'negative'}">${fmtUSD(w.total)}</span></div>
  <div class="summary-row"><span>% Cuenta</span><span class="${w.total>=0?'positive':'negative'}">${fmtPct(DB.settings.capital>0?w.total/DB.settings.capital*100:0)}</span></div>
  <div class="summary-row"><span>Trades</span><span>${w.executed}</span></div>
  <div class="summary-row"><span>Win Rate</span><span class="${w.executed?w.wins/w.executed>=.5?'positive':'negative':'neutral'}">${w.executed?(w.wins/w.executed*100).toFixed(1)+'%':'—'}</span></div>
  <div class="summary-row"><span>W / L</span><span>${w.wins} / ${w.executed-w.wins}</span></div>
</div>`).join('')}
${!weeks.length?`<p style="color:var(--text2);padding:20px">Sin datos para este periodo.</p>`:''}
</div>`;
}
function initWeeklyCharts() {
  const trades=filteredTrades(); const wm={};
  trades.forEach(t=>{const k=`${t.date.slice(0,4)}-W${String(t.week).padStart(2,'0')}`;if(!wm[k])wm[k]=0;if(t.resultado!=='Sin Entrada')wm[k]+=parseFloat(t.pnlUSD)||0;});
  const ks=Object.keys(wm).sort();
  newBarChart('ch-weekly',ks,ks.map(k=>parseFloat(wm[k].toFixed(2))),ks.map(k=>wm[k]>=0?'#00e676':'#ff1744'));
}

// =================== MONTHLY ===================
function renderMonthly() {
  const trades=filteredTrades(); const mm={};
  trades.forEach(t=>{
    const k=t.month||getMonth(t.date);
    if(!mm[k])mm[k]={k,total:0,wins:0,executed:0};
    if(t.resultado!=='Sin Entrada'){mm[k].total+=parseFloat(t.pnlUSD)||0;mm[k].executed++;if(t.resultado==='Positivo')mm[k].wins++;}
  });
  const months=Object.values(mm).sort((a,b)=>a.k>b.k?-1:1);
  return `
<div class="card" style="margin-bottom:16px"><h3>P&L Mensual</h3><div class="chart-wrap-tall"><canvas id="ch-monthly"></canvas></div></div>
<div class="summary-grid">
${months.map(m=>`<div class="summary-card">
  <h4>${m.k}</h4>
  <div class="summary-row"><span>P&L</span><span class="${m.total>=0?'positive':'negative'}">${fmtUSD(m.total)}</span></div>
  <div class="summary-row"><span>% Cuenta</span><span class="${m.total>=0?'positive':'negative'}">${fmtPct(DB.settings.capital>0?m.total/DB.settings.capital*100:0)}</span></div>
  <div class="summary-row"><span>Trades</span><span>${m.executed}</span></div>
  <div class="summary-row"><span>Win Rate</span><span class="${m.executed?m.wins/m.executed>=.5?'positive':'negative':'neutral'}">${m.executed?(m.wins/m.executed*100).toFixed(1)+'%':'—'}</span></div>
  <div class="summary-row"><span>W / L</span><span>${m.wins} / ${m.executed-m.wins}</span></div>
</div>`).join('')}
${!months.length?`<p style="color:var(--text2);padding:20px">Sin datos.</p>`:''}
</div>`;
}
function initMonthlyCharts() {
  const trades=filteredTrades();const mm={};
  trades.forEach(t=>{const k=t.month||getMonth(t.date);if(!mm[k])mm[k]=0;if(t.resultado!=='Sin Entrada')mm[k]+=parseFloat(t.pnlUSD)||0;});
  const ks=Object.keys(mm).sort();
  newBarChart('ch-monthly',ks,ks.map(k=>parseFloat(mm[k].toFixed(2))),ks.map(k=>mm[k]>=0?'#00e676':'#ff1744'));
}

// =================== COMPARE ===================
function renderCompare() {
  return `
<div style="margin-bottom:12px;display:flex;gap:10px;align-items:center">
  <span style="color:var(--text2);font-size:13px">Comparando estrategias en modo <b style="color:var(--text)">${currentMode==='real'?'Real':'Backtest'}</b></span>
</div>
<div class="compare-grid" id="compare-cards"></div>
<div class="card"><h3>P&L Comparativo</h3><div class="chart-wrap-tall"><canvas id="ch-compare"></canvas></div></div>`;
}
function initCompareCharts() {
  const trades=filteredTrades(); const grid=document.getElementById('compare-cards');
  if(!DB.strategies.length){grid.innerHTML=`<p style="color:var(--text2)">Sin estrategias creadas.</p>`;return;}
  grid.innerHTML=DB.strategies.map(s=>{
    const st=trades.filter(t=>t.strategyId===s.id); const m=calcMetrics(st);
    return`<div class="compare-card">
<div class="compare-label"><span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block"></span>${s.name}</div>
<div class="metric-row"><span>P&L Total</span><span class="metric-val ${m.total>=0?'positive':'negative'}">${fmtUSD(m.total)}</span></div>
<div class="metric-row"><span>Win Rate</span><span class="metric-val ${m.winRate>=50?'positive':'negative'}">${m.winRate.toFixed(1)}%</span></div>
<div class="metric-row"><span>Trades</span><span class="metric-val">${m.trades}</span></div>
<div class="metric-row"><span>Profit Factor</span><span class="metric-val ${m.pf>=1?'positive':'negative'}">${m.pf===999?'∞':m.pf.toFixed(2)}</span></div>
<div class="metric-row"><span>Max DD</span><span class="metric-val negative">-${m.dd.toFixed(2)}%</span></div>
<div class="metric-row"><span>Expectancy</span><span class="metric-val ${m.expectancy>=0?'positive':'negative'}">${fmtUSD(m.expectancy)}</span></div>
<div class="metric-row"><span>R:R Prom.</span><span class="metric-val">${m.rr.toFixed(2)}</span></div>
</div>`;
  }).join('');
  const labels=DB.strategies.map(s=>s.name);
  const data=DB.strategies.map(s=>{const st=trades.filter(t=>t.strategyId===s.id);return parseFloat(calcMetrics(st).total.toFixed(2));});
  newBarChart('ch-compare',labels,data,DB.strategies.map(s=>s.color));
}

// =================== STRATEGIES ===================
function renderStrategies() {
  return `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
  <span style="color:var(--text2)">${DB.strategies.length} estrategias (compartidas en ambos modos)</span>
  <button class="btn btn-primary" onclick="openStratForm()">+ Nueva Estrategia</button>
</div>
<div class="strategy-list">
${DB.strategies.map(s=>{
  const bt=DB.trades.filter(t=>t.strategyId===s.id&&t.resultado!=='Sin Entrada');
  const rl=DB.realTrades.filter(t=>t.strategyId===s.id&&t.resultado!=='Sin Entrada');
  const btTotal=bt.reduce((a,t)=>a+(parseFloat(t.pnlUSD)||0),0);
  const rlTotal=rl.reduce((a,t)=>a+(parseFloat(t.pnlUSD)||0),0);
  const btWins=bt.filter(t=>t.resultado==='Positivo').length;
  const rlWins=rl.filter(t=>t.resultado==='Positivo').length;
  return`<div class="strategy-item">
<div class="strategy-dot" style="background:${s.color}"></div>
<div class="strategy-info">
  <div class="strategy-name">${s.name}</div>
  ${s.description?`<div style="font-size:12px;color:var(--text3);margin-top:2px">${s.description}</div>`:''}
  <div class="strategy-stats" style="margin-top:4px">
    <span class="tag tag-gray" style="margin-right:6px">BT: ${bt.length} trades · ${bt.length?(btWins/bt.length*100).toFixed(0)+'% wr':'—'} · <span class="${btTotal>=0?'positive':'negative'}">${fmtUSD(btTotal)}</span></span>
    <span class="tag tag-blue">Real: ${rl.length} trades · ${rl.length?(rlWins/rl.length*100).toFixed(0)+'% wr':'—'} · <span class="${rlTotal>=0?'positive':'negative'}">${fmtUSD(rlTotal)}</span></span>
  </div>
</div>
<div style="display:flex;gap:8px">
  <button class="btn btn-secondary btn-sm" onclick="openStratForm('${s.id}')">✏️</button>
  <button class="btn btn-danger btn-sm" onclick="deleteStrat('${s.id}')">🗑</button>
</div>
</div>`;
}).join('')}
${!DB.strategies.length?`<div class="card"><p style="color:var(--text2);text-align:center;padding:24px">Sin estrategias. Crea una para empezar.</p></div>`:''}
</div>
<div class="divider"></div>
<div id="strat-form" class="hidden">
  <div class="card">
    <h3 id="strat-form-title" style="margin-bottom:16px">Nueva Estrategia</h3>
    <div class="form-grid">
      <div class="form-group"><label>Nombre *</label><input type="text" id="sf-name" placeholder="Ej: ICT, SMC, RSI Divergence..."></div>
      <div class="form-group"><label>Color</label><input type="color" id="sf-color" value="#00e676"></div>
      <div class="form-group form-full"><label>Descripción / Reglas</label><textarea id="sf-desc" placeholder="Describe las reglas de la estrategia, timeframes, condiciones de entrada y salida..."></textarea></div>
    </div>
    <div class="btn-bar">
      <button class="btn btn-primary" onclick="saveStrat()">Guardar</button>
      <button class="btn btn-secondary" onclick="document.getElementById('strat-form').classList.add('hidden')">Cancelar</button>
    </div>
  </div>
</div>`;
}

function openStratForm(id) {
  editStratId = id || null;
  const s = id ? DB.strategies.find(x=>x.id===id) : null;
  document.getElementById('strat-form').classList.remove('hidden');
  document.getElementById('strat-form-title').textContent = id ? 'Editar Estrategia' : 'Nueva Estrategia';
  document.getElementById('sf-name').value = s ? s.name : '';
  document.getElementById('sf-color').value = s ? s.color : COLORS[DB.strategies.length % COLORS.length];
  document.getElementById('sf-desc').value = s ? s.description||'' : '';
  document.getElementById('sf-name').focus();
}

function saveStrat() {
  const name = document.getElementById('sf-name').value.trim();
  if (!name) { alert('El nombre es requerido'); return; }
  const data = { name, color: document.getElementById('sf-color').value, description: document.getElementById('sf-desc').value };
  if (editStratId) {
    const i = DB.strategies.findIndex(s=>s.id===editStratId);
    if (i>=0) DB.strategies[i] = { ...DB.strategies[i], ...data };
  } else {
    DB.strategies.push({ id:uid(), ...data });
  }
  saveDB(); populateFilters(); renderCurrentPage();
}

function deleteStrat(id) {
  const hasTrades = DB.trades.some(t=>t.strategyId===id) || DB.realTrades.some(t=>t.strategyId===id);
  if (hasTrades && !confirm('Esta estrategia tiene operaciones asociadas. ¿Eliminar de todos modos?')) return;
  if (!hasTrades && !confirm('¿Eliminar estrategia?')) return;
  DB.strategies = DB.strategies.filter(s=>s.id!==id);
  saveDB(); renderCurrentPage();
}

// =================== SETTINGS ===================
function renderSettings() {
  const riskPct = DB.settings.capital > 0 ? (DB.settings.riskPerTrade / DB.settings.capital * 100).toFixed(2) : 0;
  const lev = getLeverage();
  const mc  = getMarginCapital();
  return `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:900px">
  <div class="card">
    <h3 style="margin-bottom:16px">Cuenta & Capital</h3>
    <div class="form-grid">
      <div class="form-group form-full"><label>Capital Base / Referencia (USD)</label><input type="number" id="s-capital" value="${DB.settings.capital}" oninput="updateRiskPct()"></div>
      <div class="form-group"><label>Riesgo por Operación (USD)</label><input type="number" id="s-risk" value="${DB.settings.riskPerTrade}" step="0.01" oninput="updateRiskPct()"></div>
      <div class="form-group"><label>Riesgo %</label>
        <div style="font-size:20px;font-weight:700;color:var(--yellow);padding:6px 0" id="s-risk-pct">${riskPct}%</div>
      </div>
    </div>
    <div class="btn-bar"><button class="btn btn-primary" onclick="saveSettings()">Guardar</button></div>
  </div>

  <div class="card">
    <h3 style="margin-bottom:16px">⚡ Apalancamiento</h3>
    <div class="form-grid">
      <div class="form-group form-full">
        <label>Capital Real en Cuenta (margen) USD</label>
        <input type="number" id="s-margin" value="${mc||''}" placeholder="Ej: 1000 (lo que tienes en cuenta)" step="0.01">
        <span style="font-size:11px;color:var(--text3)">El dinero que tienes depositado realmente</span>
      </div>
      <div class="form-group form-full">
        <label>Apalancamiento: <b id="lev-display" style="color:var(--orange)">${lev}x</b></label>
        <input type="range" id="s-leverage" min="1" max="500" step="1" value="${lev}" oninput="updateLevDisplay()">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)"><span>1x</span><span>500x</span></div>
      </div>
      <div class="form-group form-full">
        <label>Capital Operado (margen × apalancamiento)</label>
        <div style="font-size:18px;font-weight:700;color:var(--orange);padding:6px 0" id="s-opcap-display">
          ${mc>0 ? '$'+Math.round(mc*lev).toLocaleString() : '—'}
        </div>
      </div>
    </div>
    <div class="btn-bar"><button class="btn btn-primary" onclick="saveSettings()">Guardar</button></div>
  </div>

  <div class="card">
    <h3 style="margin-bottom:16px">Datos Cuenta Real</h3>
    <div class="form-grid">
      <div class="form-group form-full"><label>Broker</label><input type="text" id="s-broker" value="${DB.settings.broker||''}" placeholder="FTMO, IC Markets, Binance..."></div>
      <div class="form-group form-full"><label>Número de Cuenta</label><input type="text" id="s-account" value="${DB.settings.accountNumber||''}" placeholder="Ej: 1234567"></div>
      <div class="form-group form-full"><label>Tipo de Cuenta</label>
        <select id="s-actype">${ACCOUNT_TYPES.map(t=>`<option ${DB.settings.accountType===t?'selected':''}>${t}</option>`).join('')}</select>
      </div>
    </div>
    <div class="btn-bar"><button class="btn btn-primary" onclick="saveSettings()">Guardar</button></div>
  </div>

  <div class="card">
    <h3 style="margin-bottom:16px">Importar / Exportar</h3>
    <div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px;font-weight:500">EXPORTAR</div>
      <div class="btn-bar" style="margin-top:0">
        <button class="btn btn-secondary" onclick="exportCSV()">⬇ CSV (filtrado)</button>
        <button class="btn btn-secondary" onclick="exportJSON()">⬇ JSON (todo)</button>
      </div>
    </div>
    <div style="margin-top:14px">
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px;font-weight:500">IMPORTAR</div>
      <div class="btn-bar" style="margin-top:0">
        <button class="btn btn-secondary" onclick="document.getElementById('import-json-input').click()">⬆ JSON backup</button>
        <button class="btn btn-secondary" onclick="document.getElementById('import-csv-input').click()">⬆ CSV / MT4-MT5</button>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;gap:10px;align-items:center">
      <button class="btn btn-danger" onclick="clearAll()">⚠️ Borrar TODOS los datos</button>
      <span style="font-size:12px;color:var(--text3)">Esta acción no se puede deshacer</span>
    </div>
  </div>
</div>`;
}

function updateRiskPct() {
  const cap = parseFloat(document.getElementById('s-capital').value)||0;
  const risk = parseFloat(document.getElementById('s-risk').value)||0;
  const el = document.getElementById('s-risk-pct');
  if (el) el.textContent = cap > 0 ? (risk/cap*100).toFixed(2)+'%' : '—';
}

function updateLevDisplay() {
  const lev = parseInt(document.getElementById('s-leverage')?.value)||1;
  const mc  = parseFloat(document.getElementById('s-margin')?.value)||0;
  const d = document.getElementById('lev-display');
  const c = document.getElementById('s-opcap-display');
  if (d) d.textContent = lev+'x';
  if (c) c.textContent = mc>0 ? '$'+Math.round(mc*lev).toLocaleString() : '—';
}

function saveSettings() {
  DB.settings.capital       = parseFloat(document.getElementById('s-capital')?.value)||56000;
  DB.settings.riskPerTrade  = parseFloat(document.getElementById('s-risk')?.value)||560;
  DB.settings.broker        = document.getElementById('s-broker')?.value||'';
  DB.settings.accountNumber = document.getElementById('s-account')?.value||'';
  DB.settings.accountType   = document.getElementById('s-actype')?.value||'Demo';
  DB.settings.leverage      = parseInt(document.getElementById('s-leverage')?.value)||1;
  DB.settings.marginCapital = parseFloat(document.getElementById('s-margin')?.value)||0;
  saveDB(); alert('✅ Configuración guardada');
}

function clearAll() {
  if (!confirm('¿Eliminar TODOS los datos? Esta acción no se puede deshacer.')) return;
  DB = { strategies:[], trades:[], realTrades:[], settings:{capital:56000,riskPerTrade:560,currency:'USD',broker:'',accountNumber:'',accountType:'Demo',leverage:1,marginCapital:0} };
  saveDB(); renderCurrentPage();
}

// =================== EXPORT / IMPORT ===================
function exportCSV() {
  const trades = filteredTrades();
  const isReal = currentMode === 'real';
  const headers = ['Modo','Fecha','Estrategia','Activo','TF','Semana','Mes','Sesión','Tendencia','Resultado','P&L USD','P&L %','Capital','Riesgo','Calidad Entrada','Estado Emocional', isReal?'Comisión':'', 'Notas'];
  const rows = trades.map(t => [
    t.mode||currentMode, t.date, stratName(t.strategyId), t.asset||'', t.tf||'',
    t.week, t.month, t.session||'', t.tendencia||'', t.resultado,
    t.pnlUSD||0, t.pnlPct||0, t.capital||'', t.risk||'',
    t.entryQuality||'', t.emotion||'',
    isReal ? (t.commission||0) : '',
    `"${(t.notes||'').replace(/"/g,'""')}"`
  ]);
  const csv = [headers.filter(Boolean).join(','), ...rows.map(r=>r.filter((_,i)=>isReal||i!==16).join(','))].join('\n');
  dl('journal_export.csv', 'text/csv', csv);
}

function exportJSON() { dl('journal_backup.json','application/json',JSON.stringify(DB,null,2)); }

function dl(name, type, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content],{type}));
  a.download = name; a.click();
}

function importJSON(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (d.trades && d.strategies) {
        DB = { ...DB, ...d };
        if (!DB.realTrades) DB.realTrades = [];
        if (!DB.settings.leverage) DB.settings.leverage = 1;
        if (!DB.settings.marginCapital) DB.settings.marginCapital = 0;
        saveDB(); populateFilters(); renderCurrentPage();
        alert('✅ Datos importados correctamente');
      } else alert('❌ Formato inválido');
    } catch { alert('❌ Error al leer el archivo JSON'); }
  };
  r.readAsText(f); e.target.value='';
}

function importCSV(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    const lines = ev.target.result.split('\n').filter(l=>l.trim());
    if (lines.length < 2) { alert('Archivo CSV vacío o inválido'); return; }
    const headers = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/"/g,''));
    let imported = 0;
    const strat = DB.strategies[0];
    if (!strat) { alert('Crea al menos una estrategia antes de importar'); return; }
    for (let i=1; i<lines.length; i++) {
      const cols = lines[i].split(',').map(c=>c.trim().replace(/"/g,''));
      const row = {};
      headers.forEach((h,idx)=>{ row[h]=cols[idx]||''; });
      const dateRaw = row['time']||row['fecha']||row['date']||row['open time']||'';
      const dateParsed = dateRaw ? new Date(dateRaw) : null;
      const dateStr = dateParsed && !isNaN(dateParsed) ? dateParsed.toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
      const pnl = parseFloat(row['profit']||row['p&l usd']||row['pnl']||0);
      const symbol = row['symbol']||row['activo']||row['asset']||'';
      const commission = parseFloat(row['commission']||row['comisión']||0);
      const trade = {
        id: uid(), date: dateStr,
        strategyId: strat.id,
        asset: symbol, tf: row['tf']||row['temporalidad']||'',
        session: '', tendencia: '',
        resultado: pnl > 0 ? 'Positivo' : pnl < 0 ? 'Negativo' : 'Sin Entrada',
        pnlUSD: pnl, pnlPct: 0,
        capital: DB.settings.capital, risk: DB.settings.riskPerTrade,
        commission, notes: `Importado de CSV${symbol?' · '+symbol:''}`,
        entryQuality: 0, emotion: '',
        week: getWeek(dateStr), month: getMonth(dateStr),
        mode: currentMode, img1:'', img2:''
      };
      if (currentMode==='real') DB.realTrades.push(trade);
      else DB.trades.push(trade);
      imported++;
    }
    saveDB(); populateFilters(); renderCurrentPage();
    alert(`✅ ${imported} operaciones importadas.\nAsigna estrategia y detalles en la lista de operaciones.`);
  };
  r.readAsText(f); e.target.value='';
}

// =================== CHARTS ===================
const charts = {};
function destroyChart(id) { if(charts[id]){charts[id].destroy();delete charts[id];} }
const BASE = {
  responsive:true, maintainAspectRatio:false,
  plugins:{
    legend:{display:false},
    tooltip:{backgroundColor:'#1a1a26',titleColor:'#e8eaf6',bodyColor:'#9090b0',borderColor:'#2a2a3f',borderWidth:1}
  },
  scales:{
    x:{grid:{color:'#2a2a3f'},ticks:{color:'#9090b0',font:{size:10},maxRotation:45}},
    y:{grid:{color:'#2a2a3f'},ticks:{color:'#9090b0',font:{size:11}}}
  }
};

function newLineChart(id,labels,data,label,bg,border) {
  destroyChart(id); const ctx=document.getElementById(id); if(!ctx)return;
  charts[id]=new Chart(ctx,{type:'line',data:{labels,datasets:[{label,data,backgroundColor:bg,borderColor:border,borderWidth:2,fill:true,tension:.3,pointRadius:2,pointHoverRadius:4}]},options:{...BASE}});
}
function newBarChart(id,labels,data,colors) {
  destroyChart(id); const ctx=document.getElementById(id); if(!ctx)return;
  charts[id]=new Chart(ctx,{type:'bar',data:{labels,datasets:[{data,backgroundColor:colors,borderRadius:4}]},options:{...BASE}});
}
function newDoughnutChart(id,labels,data,colors) {
  destroyChart(id); const ctx=document.getElementById(id); if(!ctx)return;
  charts[id]=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{display:true,position:'bottom',labels:{color:'#9090b0',font:{size:11},padding:10,boxWidth:12}},tooltip:{backgroundColor:'#1a1a26',titleColor:'#e8eaf6',bodyColor:'#9090b0'}}}});
}

// =================== DEMO DATA ===================
function seedDemo() {
  DB.strategies=[
    {id:'s1',name:'ICT Concepts',color:'#00e676',description:'Inner Circle Trader — OTE, FVG, Liquidity'},
    {id:'s2',name:'SMC Breakers',color:'#2979ff',description:'Smart Money Concepts — BOS, CHoCH'},
    {id:'s3',name:'RSI Divergence',color:'#ffd600',description:'RSI divergence entries en zonas clave'}
  ];
  DB.settings.leverage = 10;
  DB.settings.marginCapital = 5600;
  const now=new Date();
  const add=(d,sId,res,pnl,pct,sess,mode='backtest',comm=0,quality=3,emotion='neutral',notes='')=>{
    const dt=new Date(now); dt.setDate(now.getDate()-d);
    const ds=dt.toISOString().slice(0,10);
    const t={id:uid(),date:ds,strategyId:sId,asset:'EURUSD',tf:'1H',session:sess,tendencia:res==='Positivo'?'Alcista':res==='Negativo'?'Bajista':'Lateral',resultado:res,pnlUSD:pnl,pnlPct:pct,capital:56000,risk:560,commission:comm,entryQuality:quality,emotion,week:getWeek(ds),month:getMonth(ds),mode,notes,img1:'',img2:''};
    if(mode==='real') DB.realTrades.push(t); else DB.trades.push(t);
  };
  add(1,'s1','Positivo',672,1.2,'London','backtest',0,4,'bien','Vi un FVG claro en 1H con liquidez por encima. Entré en el retroceso al 0.5 de Fibonacci. Sensación de calma y confianza. Setup perfecto según mis reglas.');
  add(2,'s1','Negativo',-560,-1,'New York','backtest',0,2,'mal','Entré demasiado pronto, no esperé confirmación. Había un dato macroeconómico pendiente y debería haberme quedado fuera. Aprendizaje: respetar el calendario económico.');
  add(3,'s2','Positivo',896,1.6,'London','backtest',0,5,'muy_bien','Setup casi perfecto. BOS en H4 con CHoCH en H1. Entré exactamente en el breaker con SL ajustado. Paciente durante 2 horas esperando la entrada. Así se hace.');
  add(5,'s2','Sin Entrada',0,0,'Asia','backtest',0,0,'neutral','Analicé el par durante la sesión asiática pero no vi un setup claro. Preferí no forzar. La disciplina de no entrar también es parte del juego.');
  add(6,'s3','Positivo',1120,2,'New York','backtest',0,4,'bien','Divergencia RSI clara en zona de soporte. Entrada limpia.');
  add(7,'s1','Negativo',-280,-0.5,'London','backtest',0,3,'neutral','Trade mediocre. Entré sin convicción.');
  add(8,'s3','Positivo',448,0.8,'Asia','backtest',0,3,'neutral','');
  add(10,'s2','Positivo',784,1.4,'London','backtest',0,4,'bien','');
  add(12,'s1','Negativo',-560,-1,'New York','backtest',0,2,'mal','Overtrading. Llevaba varios días sin operar y quise recuperar. Error grave.');
  add(14,'s3','Positivo',1344,2.4,'London','backtest',0,5,'muy_bien','Mejor operación del mes. Setup impecable.');
  add(17,'s1','Positivo',560,1,'New York','backtest',0,4,'bien','');
  add(20,'s2','Negativo',-280,-0.5,'London','backtest',0,2,'mal','');
  add(22,'s3','Positivo',672,1.2,'Asia','backtest',0,3,'neutral','');
  add(25,'s1','Positivo',896,1.6,'New York','backtest',0,4,'bien','');
  add(3,'s1','Positivo',340,0.6,'London','real',7.5,4,'bien','Cuenta real. Más nervios que en backtest pero seguí el plan.');
  add(5,'s2','Negativo',-280,-0.5,'New York','real',7.5,2,'muy_mal','Muy nervioso por las noticias de la Fed. No debería haber operado.');
  add(7,'s1','Positivo',420,0.75,'London','real',7.5,4,'bien','');
  add(10,'s3','Sin Entrada',0,0,'Asia','real',0,0,'neutral','Sin setup válido.');
  add(12,'s2','Positivo',560,1,'New York','real',7.5,4,'bien','');
  add(15,'s1','Negativo',-280,-0.5,'London','real',7.5,3,'mal','');
  DB.settings.broker='FTMO'; DB.settings.accountNumber='1045892'; DB.settings.accountType='Prop Firm';
  saveDB();
}

// =================== INIT ===================
loadDB();
if (!DB.strategies.length) seedDemo();
if (!DB.realTrades) DB.realTrades = [];
if (!DB.settings.leverage) DB.settings.leverage = 1;
if (!DB.settings.marginCapital) DB.settings.marginCapital = 0;
populateFilters();
showPage('dashboard');
