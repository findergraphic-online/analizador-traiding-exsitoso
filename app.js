// =================== STATE ===================
let DB = {
  strategies: [],
  trades: [],
  settings: { capital: 56000, riskPerTrade: 560, currency: 'USD' }
};
let editingTradeId = null;
let filters = { strategy: '', month: '' };

const COLORS = ['#00e676','#2979ff','#ffd600','#e040fb','#ff6d00','#00e5ff','#76ff03','#ff4081'];
const SESSIONS = ['Asia', 'London', 'New York'];
const TENDENCIAS = ['Alcista', 'Bajista', 'Lateral'];
const RESULTADOS = ['Positivo', 'Negativo', 'Sin Entrada'];

// =================== STORAGE ===================
function load() {
  try { const d = localStorage.getItem('bt_db'); if (d) DB = JSON.parse(d); } catch(e) {}
}
function save() { localStorage.setItem('bt_db', JSON.stringify(DB)); }

// =================== UTILS ===================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function fmtUSD(v) { return (v >= 0 ? '+' : '') + parseFloat(v).toLocaleString('en-US', {style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2}); }
function fmtPct(v) { return (v >= 0 ? '+' : '') + parseFloat(v).toFixed(2) + '%'; }
function fmtDate(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {day:'2-digit', month:'short', year:'numeric'}) : '—'; }
function getWeek(d) { const dt = new Date(d + 'T12:00:00'); const jan1 = new Date(dt.getFullYear(), 0, 1); return Math.ceil(((dt - jan1) / 86400000 + jan1.getDay() + 1) / 7); }
function getMonth(d) { return d ? d.slice(0, 7) : ''; }
function stratColor(id) { const s = DB.strategies.find(x => x.id === id); return s ? s.color : COLORS[0]; }
function stratName(id) { const s = DB.strategies.find(x => x.id === id); return s ? s.name : '—'; }

function filteredTrades() {
  return DB.trades.filter(t => {
    if (filters.strategy && t.strategyId !== filters.strategy) return false;
    if (filters.month && getMonth(t.date) !== filters.month) return false;
    return true;
  }).sort((a, b) => a.date > b.date ? -1 : 1);
}

function calcMetrics(trades) {
  const executed = trades.filter(t => t.resultado !== 'Sin Entrada');
  const wins = executed.filter(t => t.resultado === 'Positivo');
  const total = executed.reduce((s, t) => s + (parseFloat(t.pnlUSD) || 0), 0);
  const winRate = executed.length ? wins.length / executed.length * 100 : 0;
  const gross_profit = wins.reduce((s, t) => s + (parseFloat(t.pnlUSD) || 0), 0);
  const losses = executed.filter(t => t.resultado === 'Negativo');
  const gross_loss = Math.abs(losses.reduce((s, t) => s + (parseFloat(t.pnlUSD) || 0), 0));
  const pf = gross_loss > 0 ? gross_profit / gross_loss : gross_profit > 0 ? 999 : 0;
  let peak = DB.settings.capital, eq = DB.settings.capital, dd = 0;
  [...trades].sort((a, b) => a.date > b.date ? 1 : -1).forEach(t => {
    if (t.resultado === 'Sin Entrada') return;
    eq += parseFloat(t.pnlUSD) || 0;
    if (eq > peak) peak = eq;
    const d = peak > 0 ? (peak - eq) / peak * 100 : 0;
    if (d > dd) dd = d;
  });
  const avgWin = wins.length ? gross_profit / wins.length : 0;
  const avgLoss = losses.length ? gross_loss / losses.length : 0;
  const wr = winRate / 100;
  const expectancy = (wins.length && losses.length) ? (wr * avgWin) - ((1 - wr) * avgLoss) : 0;
  return { total, winRate, trades: executed.length, wins: wins.length, pf, dd, expectancy, gross_profit, gross_loss };
}

// =================== FILTERS ===================
function applyFilters() {
  filters.strategy = document.getElementById('filter-strategy').value;
  filters.month = document.getElementById('filter-month').value;
  renderCurrentPage();
}

function populateFilters() {
  const fs = document.getElementById('filter-strategy');
  const fm = document.getElementById('filter-month');
  const curS = fs.value, curM = fm.value;
  fs.innerHTML = '<option value="">Todas las estrategias</option>' + DB.strategies.map(s => `<option value="${s.id}" ${curS === s.id ? 'selected' : ''}>${s.name}</option>`).join('');
  const months = [...new Set(DB.trades.map(t => getMonth(t.date)).filter(Boolean))].sort().reverse();
  fm.innerHTML = '<option value="">Todos los meses</option>' + months.map(m => `<option value="${m}" ${curM === m ? 'selected' : ''}>${m}</option>`).join('');
}

// =================== NAVIGATION ===================
let currentPage = 'dashboard';

function showPage(p) {
  currentPage = p;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${p}'`));
  });
  const titles = {
    dashboard: 'Dashboard', trades: 'Operaciones', 'add-trade': 'Nueva Operación',
    weekly: 'Análisis Semanal', monthly: 'Análisis Mensual',
    compare: 'Comparar Estrategias', strategies: 'Estrategias', settings: 'Ajustes'
  };
  document.getElementById('page-title').textContent = titles[p] || p;
  populateFilters();
  renderCurrentPage();
}

function renderCurrentPage() {
  const c = document.getElementById('content');
  if (currentPage === 'dashboard')   { c.innerHTML = renderDashboard();   initDashboardCharts(); }
  else if (currentPage === 'trades')      c.innerHTML = renderTrades();
  else if (currentPage === 'add-trade')   c.innerHTML = renderAddTrade();
  else if (currentPage === 'weekly')  { c.innerHTML = renderWeekly();     initWeeklyCharts(); }
  else if (currentPage === 'monthly') { c.innerHTML = renderMonthly();    initMonthlyCharts(); }
  else if (currentPage === 'compare') { c.innerHTML = renderCompare();    initCompareCharts(); }
  else if (currentPage === 'strategies')  c.innerHTML = renderStrategies();
  else if (currentPage === 'settings')    c.innerHTML = renderSettings();
}

// =================== DASHBOARD ===================
function renderDashboard() {
  const trades = filteredTrades();
  const m = calcMetrics(trades);
  const cap = DB.settings.capital;
  const equity = cap + m.total;
  return `
<div class="kpi-grid">
  <div class="kpi ${m.total >= 0 ? 'green' : 'red'}">
    <div class="kpi-label">P&L Total</div>
    <div class="kpi-value">${fmtUSD(m.total)}</div>
    <div class="kpi-sub">${fmtPct(cap > 0 ? m.total / cap * 100 : 0)}</div>
  </div>
  <div class="kpi blue">
    <div class="kpi-label">Capital Actual</div>
    <div class="kpi-value">$${Math.round(equity).toLocaleString()}</div>
    <div class="kpi-sub">Base: $${cap.toLocaleString()}</div>
  </div>
  <div class="kpi ${m.winRate >= 50 ? 'green' : 'red'}">
    <div class="kpi-label">Win Rate</div>
    <div class="kpi-value">${m.winRate.toFixed(1)}%</div>
    <div class="kpi-sub">${m.wins}W / ${m.trades - m.wins}L</div>
  </div>
  <div class="kpi yellow">
    <div class="kpi-label">Total Trades</div>
    <div class="kpi-value">${m.trades}</div>
    <div class="kpi-sub">${trades.filter(t => t.resultado === 'Sin Entrada').length} sin entrada</div>
  </div>
  <div class="kpi ${m.pf >= 1 ? 'green' : 'red'}">
    <div class="kpi-label">Profit Factor</div>
    <div class="kpi-value">${m.pf === 999 ? '∞' : m.pf.toFixed(2)}</div>
    <div class="kpi-sub">PF > 1 = rentable</div>
  </div>
  <div class="kpi red">
    <div class="kpi-label">Max Drawdown</div>
    <div class="kpi-value">-${m.dd.toFixed(2)}%</div>
    <div class="kpi-sub">Desde el máximo</div>
  </div>
  <div class="kpi ${m.expectancy >= 0 ? 'green' : 'red'}">
    <div class="kpi-label">Expectancy</div>
    <div class="kpi-value">${fmtUSD(m.expectancy)}</div>
    <div class="kpi-sub">Por trade ejecutado</div>
  </div>
  <div class="kpi blue">
    <div class="kpi-label">Gross Profit / Loss</div>
    <div class="kpi-value" style="color:var(--green)">+$${Math.round(m.gross_profit).toLocaleString()}</div>
    <div class="kpi-sub" style="color:var(--red)">-$${Math.round(m.gross_loss).toLocaleString()}</div>
  </div>
</div>
<div class="chart-grid">
  <div class="card"><h3>Equity Curve</h3><div class="chart-wrap-tall"><canvas id="ch-equity"></canvas></div></div>
  <div class="card"><h3>P&L por Estrategia</h3><div class="chart-wrap-tall"><canvas id="ch-strat"></canvas></div></div>
</div>
<div class="chart-grid-3">
  <div class="card"><h3>Resultados Diarios (USD)</h3><div class="chart-wrap"><canvas id="ch-daily"></canvas></div></div>
  <div class="card"><h3>Distribución</h3><div class="chart-wrap"><canvas id="ch-dist"></canvas></div></div>
  <div class="card"><h3>Sesiones</h3><div class="chart-wrap"><canvas id="ch-sessions"></canvas></div></div>
</div>
<div class="card">
  <h3>Últimas Operaciones</h3>
  <div class="table-wrap">${renderTradesTable(trades.slice(0, 10), true)}</div>
</div>`;
}

function initDashboardCharts() {
  const trades = filteredTrades();
  const sorted = [...trades].sort((a, b) => a.date > b.date ? 1 : -1);

  // Equity curve
  let eq = DB.settings.capital;
  const eqLabels = [], eqData = [];
  sorted.forEach(t => {
    if (t.resultado !== 'Sin Entrada') {
      eq += parseFloat(t.pnlUSD) || 0;
      eqLabels.push(t.date);
      eqData.push(parseFloat(eq.toFixed(2)));
    }
  });
  newLineChart('ch-equity', eqLabels, eqData, 'Capital', 'rgba(0,230,118,0.15)', '#00e676');

  // By strategy
  const stratMap = {};
  DB.strategies.forEach(s => { stratMap[s.id] = { name: s.name, total: 0, color: s.color }; });
  trades.forEach(t => { if (t.resultado !== 'Sin Entrada' && stratMap[t.strategyId]) stratMap[t.strategyId].total += parseFloat(t.pnlUSD) || 0; });
  const sKeys = Object.keys(stratMap);
  newBarChart('ch-strat', sKeys.map(k => stratMap[k].name), sKeys.map(k => parseFloat(stratMap[k].total.toFixed(2))), sKeys.map(k => stratMap[k].total >= 0 ? '#00e676' : '#ff1744'));

  // Daily
  const dayMap = {};
  sorted.forEach(t => { if (t.resultado !== 'Sin Entrada') { if (!dayMap[t.date]) dayMap[t.date] = 0; dayMap[t.date] += parseFloat(t.pnlUSD) || 0; } });
  const dKeys = Object.keys(dayMap).sort();
  newBarChart('ch-daily', dKeys, dKeys.map(k => parseFloat(dayMap[k].toFixed(2))), dKeys.map(k => dayMap[k] >= 0 ? '#00e676' : '#ff1744'));

  // Distribution
  const wins = trades.filter(t => t.resultado === 'Positivo').length;
  const losses = trades.filter(t => t.resultado === 'Negativo').length;
  const noEntry = trades.filter(t => t.resultado === 'Sin Entrada').length;
  newDoughnutChart('ch-dist', ['Positivo', 'Negativo', 'Sin Entrada'], [wins, losses, noEntry], ['#00e676', '#ff1744', '#9090b0']);

  // Sessions
  const sesMap = {};
  SESSIONS.forEach(s => { sesMap[s] = 0; });
  trades.forEach(t => { if (t.session && sesMap[t.session] !== undefined) sesMap[t.session]++; });
  newDoughnutChart('ch-sessions', Object.keys(sesMap), Object.values(sesMap), ['#2979ff', '#ffd600', '#e040fb']);
}

// =================== TRADES LIST ===================
function renderTrades() {
  const trades = filteredTrades();
  return `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
  <span style="color:var(--text2)">${trades.length} operaciones registradas</span>
  <button class="btn btn-primary" onclick="openModal()">+ Nueva Operación</button>
</div>
<div class="card"><div class="table-wrap">${renderTradesTable(trades, false)}</div></div>`;
}

function renderTradesTable(trades, mini) {
  if (!trades.length) return `<p style="color:var(--text2);padding:20px;text-align:center">Sin operaciones. <a href="#" onclick="showPage('add-trade');return false" style="color:var(--green)">Agregar primera operación →</a></p>`;
  return `<table>
<thead><tr>
  <th>Fecha</th><th>Estrategia</th><th>Activo</th><th>TF</th><th>Sesión</th>
  <th>Tendencia</th><th>Resultado</th><th>P&L USD</th><th>%</th>
  ${mini ? '' : '<th>Acciones</th>'}
</tr></thead>
<tbody>${trades.map(t => `<tr>
  <td>${fmtDate(t.date)}</td>
  <td><span class="tag" style="background:${stratColor(t.strategyId)}22;color:${stratColor(t.strategyId)}">${stratName(t.strategyId)}</span></td>
  <td>${t.asset || '—'}</td>
  <td><span class="tag tag-gray">${t.tf || '—'}</span></td>
  <td><span class="tag tag-gray">${t.session || '—'}</span></td>
  <td>${t.tendencia || '—'}</td>
  <td><span class="tag ${t.resultado === 'Positivo' ? 'tag-green' : t.resultado === 'Negativo' ? 'tag-red' : 'tag-gray'}">${t.resultado}</span></td>
  <td class="${(parseFloat(t.pnlUSD) || 0) >= 0 ? 'positive' : 'negative'}">${t.resultado === 'Sin Entrada' ? '—' : fmtUSD(t.pnlUSD || 0)}</td>
  <td class="${(parseFloat(t.pnlPct) || 0) >= 0 ? 'positive' : 'negative'}">${t.resultado === 'Sin Entrada' ? '—' : fmtPct(t.pnlPct || 0)}</td>
  ${mini ? '' : `<td><button class="btn btn-secondary btn-sm" onclick="openModal('${t.id}')">✏️</button> <button class="btn btn-danger btn-sm" onclick="deleteTrade('${t.id}')">🗑</button></td>`}
</tr>`).join('')}</tbody></table>`;
}

// =================== ADD TRADE FORM ===================
function renderAddTrade() {
  const strats = DB.strategies;
  return `
<div class="card" style="max-width:900px">
  <h3 style="margin-bottom:20px">Registrar Nueva Operación</h3>
  <div class="form-grid">
    <div class="form-group"><label>Fecha *</label><input type="date" id="f-date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-group"><label>Estrategia *</label>
      <select id="f-strategy">${strats.length ? strats.map(s => `<option value="${s.id}">${s.name}</option>`).join('') : '<option value="">— Crea una estrategia primero —</option>'}</select>
    </div>
    <div class="form-group"><label>Activo (símbolo)</label><input type="text" id="f-asset" placeholder="EURUSD, BTC, SPX, NQ..."></div>
    <div class="form-group"><label>Temporalidad</label><input type="text" id="f-tf" placeholder="1H, 4H, D1, W1..."></div>
    <div class="form-group"><label>Sesión</label>
      <select id="f-session"><option value="">—</option>${SESSIONS.map(s => `<option>${s}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Tendencia</label>
      <select id="f-tendencia"><option value="">—</option>${TENDENCIAS.map(s => `<option>${s}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Resultado *</label>
      <select id="f-resultado">${RESULTADOS.map(s => `<option>${s}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>P&L USD</label><input type="number" id="f-pnl" placeholder="Ej: 672 o -560" step="0.01"></div>
    <div class="form-group"><label>P&L %</label><input type="number" id="f-pct" placeholder="Ej: 1.2 o -1" step="0.01"></div>
    <div class="form-group"><label>Capital Base (USD)</label><input type="number" id="f-capital" value="${DB.settings.capital}"></div>
    <div class="form-group"><label>Riesgo (USD)</label><input type="number" id="f-risk" value="${DB.settings.riskPerTrade}" step="0.01"></div>
    <div class="form-group form-full"><label>Notas</label><textarea id="f-notes" placeholder="Describe la operación, motivo de entrada, gestión de la posición..."></textarea></div>
    <div class="form-group">
      <label>Captura Inicial</label>
      <div class="img-upload" onclick="document.getElementById('f-img1').click()">
        <input type="file" id="f-img1" accept="image/*" style="display:none" onchange="previewImg(this,'prev1')">
        <span>📷 Click para subir imagen</span>
        <img id="prev1" class="img-preview hidden">
      </div>
    </div>
    <div class="form-group">
      <label>Captura Final</label>
      <div class="img-upload" onclick="document.getElementById('f-img2').click()">
        <input type="file" id="f-img2" accept="image/*" style="display:none" onchange="previewImg(this,'prev2')">
        <span>📷 Click para subir imagen</span>
        <img id="prev2" class="img-preview hidden">
      </div>
    </div>
  </div>
  <div class="btn-bar">
    <button class="btn btn-primary" onclick="saveTradeInline()">💾 Guardar Operación</button>
    <button class="btn btn-secondary" onclick="renderCurrentPage()">Limpiar</button>
  </div>
</div>`;
}

function previewImg(input, prevId) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => { const img = document.getElementById(prevId); img.src = e.target.result; img.classList.remove('hidden'); };
  r.readAsDataURL(f);
}

function saveTradeInline() {
  const date = document.getElementById('f-date').value;
  const strategyId = document.getElementById('f-strategy').value;
  if (!date || !strategyId) { alert('Fecha y estrategia son requeridos'); return; }
  const trade = {
    id: uid(), date, strategyId,
    asset: document.getElementById('f-asset').value,
    tf: document.getElementById('f-tf').value,
    session: document.getElementById('f-session').value,
    tendencia: document.getElementById('f-tendencia').value,
    resultado: document.getElementById('f-resultado').value,
    pnlUSD: parseFloat(document.getElementById('f-pnl').value) || 0,
    pnlPct: parseFloat(document.getElementById('f-pct').value) || 0,
    capital: parseFloat(document.getElementById('f-capital').value) || DB.settings.capital,
    risk: parseFloat(document.getElementById('f-risk').value) || DB.settings.riskPerTrade,
    notes: document.getElementById('f-notes').value,
    week: getWeek(date), month: getMonth(date),
    img1: '', img2: ''
  };
  const f1 = document.getElementById('f-img1');
  const f2 = document.getElementById('f-img2');
  const readImg = (inp, cb) => {
    if (inp && inp.files[0]) { const r = new FileReader(); r.onload = e => cb(e.target.result); r.readAsDataURL(inp.files[0]); }
    else cb('');
  };
  readImg(f1, img1 => { trade.img1 = img1; readImg(f2, img2 => { trade.img2 = img2; DB.trades.push(trade); save(); showPage('trades'); }); });
}

// =================== MODAL (edit) ===================
function openModal(id) {
  editingTradeId = id || null;
  const t = id ? DB.trades.find(x => x.id === id) : null;
  const strats = DB.strategies;
  document.getElementById('modal-title').textContent = id ? 'Editar Operación' : 'Nueva Operación';
  document.getElementById('modal-form').innerHTML = `
<div class="form-group"><label>Fecha *</label><input type="date" id="m-date" value="${t ? t.date : new Date().toISOString().slice(0,10)}"></div>
<div class="form-group"><label>Estrategia *</label>
  <select id="m-strategy">${strats.map(s => `<option value="${s.id}" ${t && t.strategyId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
</div>
<div class="form-group"><label>Activo</label><input type="text" id="m-asset" value="${t ? t.asset || '' : ''}" placeholder="EURUSD, BTC..."></div>
<div class="form-group"><label>Temporalidad</label><input type="text" id="m-tf" value="${t ? t.tf || '' : ''}" placeholder="1H, 4H, D1..."></div>
<div class="form-group"><label>Sesión</label>
  <select id="m-session"><option value="">—</option>${SESSIONS.map(s => `<option ${t && t.session === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
</div>
<div class="form-group"><label>Tendencia</label>
  <select id="m-tendencia"><option value="">—</option>${TENDENCIAS.map(s => `<option ${t && t.tendencia === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
</div>
<div class="form-group"><label>Resultado</label>
  <select id="m-resultado">${RESULTADOS.map(s => `<option ${t && t.resultado === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
</div>
<div class="form-group"><label>P&L USD</label><input type="number" id="m-pnl" value="${t ? t.pnlUSD : ''}" step="0.01"></div>
<div class="form-group"><label>P&L %</label><input type="number" id="m-pct" value="${t ? t.pnlPct : ''}" step="0.01"></div>
<div class="form-group form-full"><label>Notas</label><textarea id="m-notes">${t ? t.notes || '' : ''}</textarea></div>`;
  document.getElementById('modal-bg').classList.remove('hidden');
}

function closeModal() { document.getElementById('modal-bg').classList.add('hidden'); editingTradeId = null; }

function saveTradeFromModal() {
  const date = document.getElementById('m-date').value;
  const strategyId = document.getElementById('m-strategy').value;
  if (!date || !strategyId) { alert('Fecha y estrategia son requeridos'); return; }
  const data = {
    date, strategyId,
    asset: document.getElementById('m-asset').value,
    tf: document.getElementById('m-tf').value,
    session: document.getElementById('m-session').value,
    tendencia: document.getElementById('m-tendencia').value,
    resultado: document.getElementById('m-resultado').value,
    pnlUSD: parseFloat(document.getElementById('m-pnl').value) || 0,
    pnlPct: parseFloat(document.getElementById('m-pct').value) || 0,
    notes: document.getElementById('m-notes').value,
    week: getWeek(date), month: getMonth(date)
  };
  if (editingTradeId) {
    const i = DB.trades.findIndex(t => t.id === editingTradeId);
    if (i >= 0) DB.trades[i] = { ...DB.trades[i], ...data };
  } else {
    DB.trades.push({ id: uid(), ...data, img1: '', img2: '', capital: DB.settings.capital, risk: DB.settings.riskPerTrade });
  }
  save(); closeModal(); renderCurrentPage();
}

function deleteTrade(id) {
  if (confirm('¿Eliminar esta operación?')) { DB.trades = DB.trades.filter(t => t.id !== id); save(); renderCurrentPage(); }
}

// =================== WEEKLY ===================
function renderWeekly() {
  const trades = filteredTrades();
  const weekMap = {};
  trades.forEach(t => {
    const key = `${t.date.slice(0,4)}-W${String(t.week).padStart(2,'0')}`;
    if (!weekMap[key]) weekMap[key] = { key, total: 0, wins: 0, executed: 0 };
    if (t.resultado !== 'Sin Entrada') { weekMap[key].total += parseFloat(t.pnlUSD) || 0; weekMap[key].executed++; if (t.resultado === 'Positivo') weekMap[key].wins++; }
  });
  const weeks = Object.values(weekMap).sort((a, b) => a.key > b.key ? -1 : 1);
  return `
<div class="card" style="margin-bottom:16px"><h3>P&L Semanal</h3><div class="chart-wrap-tall"><canvas id="ch-weekly"></canvas></div></div>
<div class="summary-grid">
${weeks.map(w => `<div class="summary-card">
  <h4>${w.key}</h4>
  <div class="summary-row"><span>Total P&L</span><span class="${w.total >= 0 ? 'positive' : 'negative'}">${fmtUSD(w.total)}</span></div>
  <div class="summary-row"><span>% Cuenta</span><span class="${w.total >= 0 ? 'positive' : 'negative'}">${fmtPct(DB.settings.capital > 0 ? w.total / DB.settings.capital * 100 : 0)}</span></div>
  <div class="summary-row"><span>Trades</span><span>${w.executed}</span></div>
  <div class="summary-row"><span>Win Rate</span><span class="${w.executed ? w.wins / w.executed >= .5 ? 'positive' : 'negative' : 'neutral'}">${w.executed ? (w.wins / w.executed * 100).toFixed(1) + '%' : '—'}</span></div>
  <div class="summary-row"><span>Wins / Losses</span><span>${w.wins} / ${w.executed - w.wins}</span></div>
</div>`).join('')}
${!weeks.length ? '<p style="color:var(--text2);padding:20px">Sin datos</p>' : ''}
</div>`;
}

function initWeeklyCharts() {
  const trades = filteredTrades();
  const weekMap = {};
  trades.forEach(t => {
    const key = `${t.date.slice(0,4)}-W${String(t.week).padStart(2,'0')}`;
    if (!weekMap[key]) weekMap[key] = 0;
    if (t.resultado !== 'Sin Entrada') weekMap[key] += parseFloat(t.pnlUSD) || 0;
  });
  const keys = Object.keys(weekMap).sort();
  newBarChart('ch-weekly', keys, keys.map(k => parseFloat(weekMap[k].toFixed(2))), keys.map(k => weekMap[k] >= 0 ? '#00e676' : '#ff1744'));
}

// =================== MONTHLY ===================
function renderMonthly() {
  const trades = filteredTrades();
  const monthMap = {};
  trades.forEach(t => {
    const key = t.month || getMonth(t.date);
    if (!monthMap[key]) monthMap[key] = { key, total: 0, wins: 0, executed: 0 };
    if (t.resultado !== 'Sin Entrada') { monthMap[key].total += parseFloat(t.pnlUSD) || 0; monthMap[key].executed++; if (t.resultado === 'Positivo') monthMap[key].wins++; }
  });
  const months = Object.values(monthMap).sort((a, b) => a.key > b.key ? -1 : 1);
  return `
<div class="card" style="margin-bottom:16px"><h3>P&L Mensual</h3><div class="chart-wrap-tall"><canvas id="ch-monthly"></canvas></div></div>
<div class="summary-grid">
${months.map(m => `<div class="summary-card">
  <h4>${m.key}</h4>
  <div class="summary-row"><span>Total P&L</span><span class="${m.total >= 0 ? 'positive' : 'negative'}">${fmtUSD(m.total)}</span></div>
  <div class="summary-row"><span>% Cuenta</span><span class="${m.total >= 0 ? 'positive' : 'negative'}">${fmtPct(DB.settings.capital > 0 ? m.total / DB.settings.capital * 100 : 0)}</span></div>
  <div class="summary-row"><span>Trades</span><span>${m.executed}</span></div>
  <div class="summary-row"><span>Win Rate</span><span class="${m.executed ? m.wins / m.executed >= .5 ? 'positive' : 'negative' : 'neutral'}">${m.executed ? (m.wins / m.executed * 100).toFixed(1) + '%' : '—'}</span></div>
  <div class="summary-row"><span>Wins / Losses</span><span>${m.wins} / ${m.executed - m.wins}</span></div>
</div>`).join('')}
${!months.length ? '<p style="color:var(--text2);padding:20px">Sin datos</p>' : ''}
</div>`;
}

function initMonthlyCharts() {
  const trades = filteredTrades();
  const monthMap = {};
  trades.forEach(t => { const k = t.month || getMonth(t.date); if (!monthMap[k]) monthMap[k] = 0; if (t.resultado !== 'Sin Entrada') monthMap[k] += parseFloat(t.pnlUSD) || 0; });
  const keys = Object.keys(monthMap).sort();
  newBarChart('ch-monthly', keys, keys.map(k => parseFloat(monthMap[k].toFixed(2))), keys.map(k => monthMap[k] >= 0 ? '#00e676' : '#ff1744'));
}

// =================== COMPARE ===================
function renderCompare() {
  return `
<div class="compare-grid" id="compare-cards"></div>
<div class="card"><h3>P&L Comparativo por Estrategia</h3><div class="chart-wrap-tall"><canvas id="ch-compare"></canvas></div></div>`;
}

function initCompareCharts() {
  const trades = filteredTrades();
  const grid = document.getElementById('compare-cards');
  if (!DB.strategies.length) { grid.innerHTML = '<p style="color:var(--text2)">No hay estrategias creadas.</p>'; return; }
  grid.innerHTML = DB.strategies.map(s => {
    const st = trades.filter(t => t.strategyId === s.id);
    const m = calcMetrics(st);
    return `<div class="compare-card">
<div class="strategy-label"><span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block"></span>${s.name}</div>
<div class="metric-row"><span>P&L Total</span><span class="metric-val ${m.total >= 0 ? 'positive' : 'negative'}">${fmtUSD(m.total)}</span></div>
<div class="metric-row"><span>Win Rate</span><span class="metric-val ${m.winRate >= 50 ? 'positive' : 'negative'}">${m.winRate.toFixed(1)}%</span></div>
<div class="metric-row"><span>Trades</span><span class="metric-val">${m.trades}</span></div>
<div class="metric-row"><span>Profit Factor</span><span class="metric-val ${m.pf >= 1 ? 'positive' : 'negative'}">${m.pf === 999 ? '∞' : m.pf.toFixed(2)}</span></div>
<div class="metric-row"><span>Max Drawdown</span><span class="metric-val negative">-${m.dd.toFixed(2)}%</span></div>
<div class="metric-row"><span>Expectancy</span><span class="metric-val ${m.expectancy >= 0 ? 'positive' : 'negative'}">${fmtUSD(m.expectancy)}</span></div>
</div>`;
  }).join('');
  const labels = DB.strategies.map(s => s.name);
  const data = DB.strategies.map(s => { const st = trades.filter(t => t.strategyId === s.id); return parseFloat(calcMetrics(st).total.toFixed(2)); });
  newBarChart('ch-compare', labels, data, DB.strategies.map(s => s.color));
}

// =================== STRATEGIES ===================
function renderStrategies() {
  return `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
  <span style="color:var(--text2)">${DB.strategies.length} estrategias</span>
  <button class="btn btn-primary" onclick="openStratForm()">+ Nueva Estrategia</button>
</div>
<div class="strategy-list">
${DB.strategies.map(s => {
  const st = DB.trades.filter(t => t.strategyId === s.id && t.resultado !== 'Sin Entrada');
  const total = st.reduce((a, t) => a + (parseFloat(t.pnlUSD) || 0), 0);
  const wins = st.filter(t => t.resultado === 'Positivo').length;
  return `<div class="strategy-item">
<div class="strategy-color" style="background:${s.color}"></div>
<div class="strategy-info">
  <div class="strategy-name">${s.name}</div>
  <div class="strategy-stats">${st.length} trades · Win Rate: ${st.length ? (wins / st.length * 100).toFixed(1) + '%' : '—'} · P&L: <span class="${total >= 0 ? 'positive' : 'negative'}">${fmtUSD(total)}</span></div>
</div>
<div style="display:flex;gap:8px">
  <button class="btn btn-secondary btn-sm" onclick="openStratForm('${s.id}')">✏️ Editar</button>
  <button class="btn btn-danger btn-sm" onclick="deleteStrat('${s.id}')">🗑</button>
</div>
</div>`;
}).join('')}
${!DB.strategies.length ? '<div class="card"><p style="color:var(--text2);text-align:center;padding:20px">Sin estrategias. Crea una para empezar.</p></div>' : ''}
</div>
<div class="divider"></div>
<div id="strat-form" class="hidden">
  <div class="card">
    <h3 id="strat-form-title" style="margin-bottom:16px">Nueva Estrategia</h3>
    <div class="form-grid">
      <div class="form-group"><label>Nombre *</label><input type="text" id="sf-name" placeholder="Ej: ICT, SMC, RSI Divergence..."></div>
      <div class="form-group"><label>Color</label><input type="color" id="sf-color" value="#00e676" style="height:38px;padding:2px"></div>
      <div class="form-group form-full"><label>Descripción</label><textarea id="sf-desc" placeholder="Describe la estrategia, reglas, timeframes usados..."></textarea></div>
    </div>
    <div class="btn-bar">
      <button class="btn btn-primary" onclick="saveStrat()">Guardar Estrategia</button>
      <button class="btn btn-secondary" onclick="document.getElementById('strat-form').classList.add('hidden')">Cancelar</button>
    </div>
  </div>
</div>`;
}

let editStratId = null;

function openStratForm(id) {
  editStratId = id || null;
  const s = id ? DB.strategies.find(x => x.id === id) : null;
  document.getElementById('strat-form').classList.remove('hidden');
  document.getElementById('strat-form-title').textContent = id ? 'Editar Estrategia' : 'Nueva Estrategia';
  document.getElementById('sf-name').value = s ? s.name : '';
  document.getElementById('sf-color').value = s ? s.color : COLORS[DB.strategies.length % COLORS.length];
  document.getElementById('sf-desc').value = s ? s.description || '' : '';
  document.getElementById('sf-name').focus();
}

function saveStrat() {
  const name = document.getElementById('sf-name').value.trim();
  if (!name) { alert('El nombre es requerido'); return; }
  const data = { name, color: document.getElementById('sf-color').value, description: document.getElementById('sf-desc').value };
  if (editStratId) {
    const i = DB.strategies.findIndex(s => s.id === editStratId);
    if (i >= 0) DB.strategies[i] = { ...DB.strategies[i], ...data };
  } else {
    DB.strategies.push({ id: uid(), ...data });
  }
  save(); populateFilters(); renderCurrentPage();
}

function deleteStrat(id) {
  if (DB.trades.some(t => t.strategyId === id)) {
    if (!confirm('Esta estrategia tiene operaciones asociadas. ¿Eliminar de todos modos?')) return;
  } else if (!confirm('¿Eliminar estrategia?')) return;
  DB.strategies = DB.strategies.filter(s => s.id !== id);
  save(); renderCurrentPage();
}

// =================== SETTINGS ===================
function renderSettings() {
  const riskPct = DB.settings.capital > 0 ? (DB.settings.riskPerTrade / DB.settings.capital * 100).toFixed(2) : 0;
  return `
<div class="card" style="max-width:500px;margin-bottom:20px">
  <h3 style="margin-bottom:20px">Configuración de Cuenta</h3>
  <div class="form-grid">
    <div class="form-group"><label>Capital Base (USD)</label><input type="number" id="s-capital" value="${DB.settings.capital}" oninput="updateRiskPct()"></div>
    <div class="form-group"><label>Riesgo por Operación (USD)</label><input type="number" id="s-risk" value="${DB.settings.riskPerTrade}" step="0.01" oninput="updateRiskPct()"></div>
    <div class="form-group form-full">
      <label>Riesgo % por operación</label>
      <div style="font-size:18px;font-weight:700;color:var(--yellow);margin-top:4px" id="s-risk-pct">${riskPct}%</div>
    </div>
  </div>
  <div class="btn-bar"><button class="btn btn-primary" onclick="saveSettings()">Guardar Configuración</button></div>
</div>
<div class="card" style="max-width:500px">
  <h3 style="margin-bottom:16px">Gestión de Datos</h3>
  <div class="btn-bar">
    <button class="btn btn-secondary" onclick="exportCSV()">⬇ Exportar CSV</button>
    <button class="btn btn-secondary" onclick="exportJSON()">⬇ Exportar JSON</button>
    <button class="btn btn-secondary" onclick="document.getElementById('import-input').click()">⬆ Importar JSON</button>
  </div>
  <div style="margin-top:16px">
    <button class="btn btn-danger" onclick="clearAll()">⚠️ Borrar todos los datos</button>
  </div>
</div>`;
}

function updateRiskPct() {
  const cap = parseFloat(document.getElementById('s-capital').value) || 0;
  const risk = parseFloat(document.getElementById('s-risk').value) || 0;
  const el = document.getElementById('s-risk-pct');
  if (el) el.textContent = cap > 0 ? (risk / cap * 100).toFixed(2) + '%' : '—';
}

function saveSettings() {
  DB.settings.capital = parseFloat(document.getElementById('s-capital').value) || 56000;
  DB.settings.riskPerTrade = parseFloat(document.getElementById('s-risk').value) || 560;
  save(); alert('Configuración guardada correctamente');
}

function clearAll() {
  if (confirm('¿Eliminar TODOS los datos? Esta acción no se puede deshacer.')) {
    DB = { strategies: [], trades: [], settings: { capital: 56000, riskPerTrade: 560, currency: 'USD' } };
    save(); renderCurrentPage();
  }
}

// =================== EXPORT / IMPORT ===================
function exportCSV() {
  const trades = filteredTrades();
  const headers = ['Fecha','Estrategia','Activo','TF','Semana','Mes','Sesión','Tendencia','Resultado','P&L USD','P&L %','Capital','Riesgo','Notas'];
  const rows = trades.map(t => [
    t.date, stratName(t.strategyId), t.asset || '', t.tf || '',
    t.week, t.month, t.session || '', t.tendencia || '',
    t.resultado, t.pnlUSD || 0, t.pnlPct || 0,
    t.capital || '', t.risk || '',
    `"${(t.notes || '').replace(/"/g, '""')}"`
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  download('backtest_export.csv', 'text/csv', csv);
}

function exportJSON() { download('backtest_data.json', 'application/json', JSON.stringify(DB, null, 2)); }

function download(name, type, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
}

function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (d.trades && d.strategies) { DB = d; save(); populateFilters(); renderCurrentPage(); alert('Datos importados correctamente'); }
      else alert('Formato de archivo inválido');
    } catch { alert('Error al leer el archivo JSON'); }
  };
  r.readAsText(f);
  e.target.value = '';
}

// =================== CHARTS ===================
const chartInstances = {};
const BASE_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: '#1a1a26', titleColor: '#e8eaf6', bodyColor: '#9090b0', borderColor: '#2a2a3f', borderWidth: 1 }
  },
  scales: {
    x: { grid: { color: '#2a2a3f' }, ticks: { color: '#9090b0', font: { size: 10 }, maxRotation: 45 } },
    y: { grid: { color: '#2a2a3f' }, ticks: { color: '#9090b0', font: { size: 11 } } }
  }
};

function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }

function newLineChart(id, labels, data, label, bg, border) {
  destroyChart(id);
  const ctx = document.getElementById(id); if (!ctx) return;
  chartInstances[id] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label, data, backgroundColor: bg, borderColor: border, borderWidth: 2, fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 4 }] },
    options: { ...BASE_OPTS }
  });
}

function newBarChart(id, labels, data, colors) {
  destroyChart(id);
  const ctx = document.getElementById(id); if (!ctx) return;
  chartInstances[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4 }] },
    options: { ...BASE_OPTS }
  });
}

function newDoughnutChart(id, labels, data, colors) {
  destroyChart(id);
  const ctx = document.getElementById(id); if (!ctx) return;
  chartInstances[id] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: '#9090b0', font: { size: 11 }, padding: 10, boxWidth: 12 } },
        tooltip: { backgroundColor: '#1a1a26', titleColor: '#e8eaf6', bodyColor: '#9090b0' }
      }
    }
  });
}

// =================== DEMO DATA ===================
function seedDemoData() {
  DB.strategies = [
    { id: 's1', name: 'ICT Concepts', color: '#00e676', description: 'Inner Circle Trader methodology' },
    { id: 's2', name: 'SMC Breakers', color: '#2979ff', description: 'Smart Money Concepts' },
    { id: 's3', name: 'RSI Divergence', color: '#ffd600', description: 'RSI divergence entries' }
  ];
  const now = new Date();
  const addT = (daysAgo, sId, res, pnl, pct, sess) => {
    const dt = new Date(now); dt.setDate(now.getDate() - daysAgo);
    const ds = dt.toISOString().slice(0, 10);
    DB.trades.push({ id: uid(), date: ds, strategyId: sId, asset: 'EURUSD', tf: '1H', session: sess, tendencia: res === 'Positivo' ? 'Alcista' : res === 'Negativo' ? 'Bajista' : 'Lateral', resultado: res, pnlUSD: pnl, pnlPct: pct, capital: 56000, risk: 560, week: getWeek(ds), month: getMonth(ds), notes: '', img1: '', img2: '' });
  };
  addT(1,'s1','Positivo',672,1.2,'London'); addT(2,'s1','Negativo',-560,-1,'New York');
  addT(3,'s2','Positivo',896,1.6,'London'); addT(5,'s2','Sin Entrada',0,0,'Asia');
  addT(6,'s3','Positivo',1120,2,'New York'); addT(7,'s1','Negativo',-280,-0.5,'London');
  addT(8,'s3','Positivo',448,0.8,'Asia'); addT(10,'s2','Positivo',784,1.4,'London');
  addT(12,'s1','Negativo',-560,-1,'New York'); addT(14,'s3','Positivo',1344,2.4,'London');
  addT(17,'s1','Positivo',560,1,'New York'); addT(20,'s2','Negativo',-280,-0.5,'London');
  addT(22,'s3','Positivo',672,1.2,'Asia'); addT(25,'s1','Positivo',896,1.6,'New York');
  addT(28,'s2','Positivo',1120,2,'London'); addT(30,'s3','Negativo',-560,-1,'Asia');
  addT(32,'s1','Positivo',448,0.8,'London'); addT(35,'s2','Positivo',784,1.4,'New York');
  save();
}

// =================== INIT ===================
load();
if (!DB.strategies.length) seedDemoData();
populateFilters();
showPage('dashboard');
