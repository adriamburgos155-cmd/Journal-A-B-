/* ============================================
   APEX JOURNAL — app.js
   Logic: trade log, risk engine, Apex rules
============================================ */

// ── STATE ──────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  balance: 50000,
  maxDD: 2000,
  dailyLimit: 1000,
  consistency: 50,
  contracts: 4,
  target: 3000,
};

let config = loadConfig();
let trades = loadTrades();
let editingId = null;

// ── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyConfigToForm();
  renderAll();
  bindEvents();
  setDefaultDate();
});

// ── STORAGE ───────────────────────────────────────────────────────────────
function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem('apex_config') || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}
function saveConfig() { localStorage.setItem('apex_config', JSON.stringify(config)); }
function loadTrades() {
  try { return JSON.parse(localStorage.getItem('apex_trades') || '[]'); }
  catch { return []; }
}
function saveTrades() { localStorage.setItem('apex_trades', JSON.stringify(trades)); }

// ── EVENTS ────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('btnAddTrade').addEventListener('click', openModal);
  document.getElementById('btnCancel').addEventListener('click', closeModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('btnSaveTrade').addEventListener('click', saveTrade);
  document.getElementById('btnSaveConfig').addEventListener('click', saveConfigHandler);
  document.getElementById('btnExport').addEventListener('click', exportCSV);

  // Live risk check while typing modal
  ['fContracts','fEntry','fExit','fPnl','fSL','fTP'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateModalRiskCheck);
  });
  document.getElementById('fPnl').addEventListener('input', () => {});

  // Filters
  document.getElementById('filterDate').addEventListener('change', renderTable);
  document.getElementById('filterResult').addEventListener('change', renderTable);
}

// ── CONFIG ────────────────────────────────────────────────────────────────
function applyConfigToForm() {
  document.getElementById('cfgBalance').value = config.balance;
  document.getElementById('cfgDD').value = config.maxDD;
  document.getElementById('cfgDaily').value = config.dailyLimit;
  document.getElementById('cfgConsistency').value = config.consistency;
  document.getElementById('cfgContracts').value = config.contracts;
  document.getElementById('cfgTarget').value = config.target;
}

function saveConfigHandler() {
  config.balance = parseFloat(document.getElementById('cfgBalance').value) || 50000;
  config.maxDD = parseFloat(document.getElementById('cfgDD').value) || 2000;
  config.dailyLimit = parseFloat(document.getElementById('cfgDaily').value) || 1000;
  config.consistency = parseFloat(document.getElementById('cfgConsistency').value) || 50;
  config.contracts = parseInt(document.getElementById('cfgContracts').value) || 4;
  config.target = parseFloat(document.getElementById('cfgTarget').value) || 3000;
  saveConfig();
  renderAll();
  showToast('Configuración guardada ✓', 'success');
}

// ── MODAL ─────────────────────────────────────────────────────────────────
function openModal(tradeId = null) {
  editingId = tradeId;
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalTitle').textContent = tradeId ? 'Editar Trade' : 'Nuevo Trade';
  if (tradeId) {
    const t = trades.find(x => x.id === tradeId);
    if (t) fillForm(t);
  } else {
    clearForm();
    setDefaultDate();
  }
  overlay.classList.add('open');
  updateModalRiskCheck();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

function setDefaultDate() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0,5);
  document.getElementById('fDate').value = dateStr;
  document.getElementById('fTime').value = timeStr;
}

function fillForm(t) {
  document.getElementById('fDate').value = t.date || '';
  document.getElementById('fTime').value = t.time || '';
  document.getElementById('fInstrument').value = t.instrument || 'NQ';
  document.getElementById('fDir').value = t.dir || 'LONG';
  document.getElementById('fContracts').value = t.contracts || 1;
  document.getElementById('fEntry').value = t.entry || '';
  document.getElementById('fExit').value = t.exit || '';
  document.getElementById('fPnl').value = t.pnl || '';
  document.getElementById('fSL').value = t.sl || '';
  document.getElementById('fTP').value = t.tp || '';
  document.getElementById('fSetup').value = t.setup || 'Breakout';
  document.getElementById('fEmotion').value = t.emotion || 'Neutral';
  document.getElementById('fNotes').value = t.notes || '';
}

function clearForm() {
  ['fEntry','fExit','fPnl','fSL','fTP','fNotes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('fContracts').value = 1;
  document.getElementById('fInstrument').value = 'NQ';
  document.getElementById('fDir').value = 'LONG';
  document.getElementById('fSetup').value = 'Breakout';
  document.getElementById('fEmotion').value = 'Neutral';
}

function saveTrade() {
  const date = document.getElementById('fDate').value;
  const time = document.getElementById('fTime').value;
  const instrument = document.getElementById('fInstrument').value;
  const dir = document.getElementById('fDir').value;
  const contracts = parseInt(document.getElementById('fContracts').value) || 1;
  const entry = parseFloat(document.getElementById('fEntry').value) || null;
  const exitP = parseFloat(document.getElementById('fExit').value) || null;
  let pnl = parseFloat(document.getElementById('fPnl').value);
  const sl = parseFloat(document.getElementById('fSL').value) || null;
  const tp = parseFloat(document.getElementById('fTP').value) || null;
  const setup = document.getElementById('fSetup').value;
  const emotion = document.getElementById('fEmotion').value;
  const notes = document.getElementById('fNotes').value;

  if (!date) { showToast('La fecha es requerida.', 'danger'); return; }
  if (isNaN(pnl) && entry && exitP) {
    pnl = calcPnl(instrument, dir, contracts, entry, exitP);
  }
  if (isNaN(pnl)) { showToast('Ingresa el P&L o los precios de entrada/salida.', 'danger'); return; }

  // Apex daily check
  const todayPnl = getTodayPnl(editingId);
  if ((todayPnl + pnl) < -config.dailyLimit) {
    showToast(`⛔ Este trade llevaría tu P&L de hoy a -$${Math.abs(todayPnl + pnl).toFixed(2)}, excediendo el Daily Loss Limit de $${config.dailyLimit}.`, 'danger');
  }

  const rr = sl && tp ? (tp / sl).toFixed(2) : null;

  const trade = {
    id: editingId || Date.now().toString(),
    date, time, instrument, dir, contracts,
    entry, exit: exitP, pnl, sl, tp, rr,
    setup, emotion, notes,
  };

  if (editingId) {
    trades = trades.map(t => t.id === editingId ? trade : t);
  } else {
    trades.unshift(trade);
  }

  saveTrades();
  closeModal();
  renderAll();
  showToast('Trade guardado ✓', 'success');
}

// ── PnL CALC ──────────────────────────────────────────────────────────────
// NQ: $20/point per contract | MNQ: $2/point | ES: $50/point | MES: $5
const TICK_VALUE = { NQ: 20, MNQ: 2, ES: 50, MES: 5, CL: 1000, GC: 100 };
function calcPnl(instrument, dir, contracts, entry, exitP) {
  const tv = TICK_VALUE[instrument] || 20;
  const diff = dir === 'LONG' ? (exitP - entry) : (entry - exitP);
  return parseFloat((diff * tv * contracts).toFixed(2));
}

// ── RISK ENGINE ───────────────────────────────────────────────────────────
function computeRisk() {
  const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const currentBalance = config.balance + totalPnl;

  // Apex trailing drawdown: floor rises with balance up to initial + profit
  // The floor = highest balance reached - maxDD
  let highWater = config.balance;
  let runBal = config.balance;
  for (let i = trades.length - 1; i >= 0; i--) {
    runBal += (trades[i].pnl || 0);
    if (runBal > highWater) highWater = runBal;
  }
  const ddFloor = highWater - config.maxDD;
  const safeMargin = currentBalance - ddFloor;
  const ddUsed = ((config.maxDD - safeMargin) / config.maxDD * 100).toFixed(1);

  // Today
  const todayPnl = getTodayPnl();
  const dailyRemaining = config.dailyLimit + todayPnl; // todayPnl negative = less remaining

  // Cushion progress toward target
  const cushionGained = Math.max(0, totalPnl);
  const cushionPct = Math.min(100, (cushionGained / config.target) * 100).toFixed(1);

  // Recommended contracts: conservative, max 2 if margin < 50% of maxDD
  let recContracts = config.contracts;
  if (safeMargin < config.maxDD * 0.25) recContracts = 1;
  else if (safeMargin < config.maxDD * 0.5) recContracts = Math.max(1, Math.floor(recContracts / 2));
  const recMaxRisk = (safeMargin * 0.1).toFixed(2); // never risk more than 10% of safe margin per trade

  // Status
  let status = 'ok', statusText = '✓ CUENTA SEGURA — Opera con disciplina';
  if (safeMargin <= 0) {
    status = 'stop';
    statusText = '⛔ STOP — DRAWDOWN ALCANZADO';
  } else if (safeMargin < config.maxDD * 0.3) {
    status = 'stop';
    statusText = '⛔ PARA YA — Margen crítico (<30%)';
  } else if (safeMargin < config.maxDD * 0.6) {
    status = 'warn';
    statusText = '⚠ REDUCIR TAMAÑO — Margen ajustado';
  } else if (dailyRemaining < config.dailyLimit * 0.3) {
    status = 'warn';
    statusText = '⚠ CUIDADO — Cerca del límite diario';
  }

  // Trades left before daily limit
  const avgLoss = getAvgLoss();
  const tradesLeft = avgLoss > 0 ? Math.floor(dailyRemaining / avgLoss) : '∞';

  return {
    totalPnl, currentBalance, ddFloor, safeMargin, ddUsed,
    todayPnl, dailyRemaining, cushionGained, cushionPct,
    recContracts, recMaxRisk, tradesLeft, status, statusText,
  };
}

function getTodayPnl(excludeId = null) {
  const today = new Date().toISOString().split('T')[0];
  return trades
    .filter(t => t.date === today && t.id !== excludeId)
    .reduce((s, t) => s + (t.pnl || 0), 0);
}

function getAvgLoss() {
  const losses = trades.filter(t => t.pnl < 0).map(t => Math.abs(t.pnl));
  return losses.length ? losses.reduce((a,b) => a+b, 0) / losses.length : 100;
}

// ── RENDER ALL ─────────────────────────────────────────────────────────────
function renderAll() {
  const risk = computeRisk();
  renderHealthBanner(risk);
  renderRiskEngine(risk);
  renderConsistency();
  renderStats();
  renderTable();
  renderAlerts(risk);
}

function renderHealthBanner(r) {
  const fmt = (n) => (n >= 0 ? '+' : '') + '$' + Math.abs(n).toFixed(2);
  document.getElementById('balanceActual').textContent = '$' + r.currentBalance.toFixed(2);
  document.getElementById('pnlTotal').textContent = fmt(r.totalPnl);
  document.getElementById('pnlTotal').className = 'health-value ' + (r.totalPnl >= 0 ? 'green' : 'red');
  document.getElementById('ddFloor').textContent = '$' + r.ddFloor.toFixed(2);
  document.getElementById('safeMargin').textContent = '$' + r.safeMargin.toFixed(2);
  document.getElementById('safeMargin').className = 'health-value ' + (r.safeMargin < config.maxDD * 0.4 ? 'red' : r.safeMargin < config.maxDD * 0.7 ? 'amber' : 'green');
  document.getElementById('pnlHoy').textContent = fmt(r.todayPnl);
  document.getElementById('pnlHoy').className = 'health-value ' + (r.todayPnl >= 0 ? 'green' : 'red');
  document.getElementById('dailyLimit').textContent = '-$' + config.dailyLimit.toFixed(2);
}

function renderRiskEngine(r) {
  document.getElementById('recContracts').textContent = r.recContracts + ' contrato(s)';
  document.getElementById('recMaxRisk').textContent = '$' + r.recMaxRisk;
  document.getElementById('recDailyLeft').textContent = typeof r.tradesLeft === 'number' ? r.tradesLeft + ' aprox.' : r.tradesLeft;
  document.getElementById('recDDUsed').textContent = r.ddUsed + '%';
  document.getElementById('recCushion').textContent = r.cushionPct + '% ($' + r.cushionGained.toFixed(0) + ' / $' + config.target + ')';
  document.getElementById('cushionBar').style.width = r.cushionPct + '%';
  document.getElementById('cushionBar').style.background = r.cushionPct >= 100 ? 'var(--green)' : r.cushionPct > 50 ? 'var(--blue)' : 'var(--amber)';
  const rs = document.getElementById('riskStatus');
  rs.textContent = r.statusText;
  rs.className = 'risk-status ' + r.status;
}

function renderConsistency() {
  // Group pnl by day
  const byDay = {};
  trades.forEach(t => {
    if (!byDay[t.date]) byDay[t.date] = 0;
    byDay[t.date] += (t.pnl || 0);
  });
  const days = Object.entries(byDay).sort((a,b) => b[0].localeCompare(a[0]));
  const best = days.reduce((m, d) => d[1] > m ? d[1] : m, 0);
  const limit = best * (config.consistency / 100);
  const last5 = days.slice(0, 5).reduce((s,d) => s + d[1], 0);

  document.getElementById('bestDay').textContent = best > 0 ? '$' + best.toFixed(2) : '—';
  document.getElementById('consistencyLimit').textContent = best > 0 ? '$' + limit.toFixed(2) : '—';
  document.getElementById('last5days').textContent = last5 !== 0 ? (last5 >= 0 ? '+' : '') + '$' + last5.toFixed(2) : '—';

  let note = 'Sin datos suficientes aún.';
  if (best > 0) {
    note = `Tu mejor día fue $${best.toFixed(2)}. Para cumplir la Consistency Rule (${config.consistency}%), ningún día puede representar más del ${config.consistency}% del profit total. Límite recomendado por día: $${limit.toFixed(2)}.`;
  }
  document.getElementById('consistencyNote').textContent = note;
}

function renderStats() {
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const total = trades.length;
  const wr = total > 0 ? ((wins.length / total) * 100).toFixed(1) : 0;
  const avgW = wins.length ? (wins.reduce((s,t) => s + t.pnl, 0) / wins.length) : 0;
  const avgL = losses.length ? (losses.reduce((s,t) => s + t.pnl, 0) / losses.length) : 0;
  const grossW = wins.reduce((s,t) => s + t.pnl, 0);
  const grossL = Math.abs(losses.reduce((s,t) => s + t.pnl, 0));
  const pf = grossL > 0 ? (grossW / grossL).toFixed(2) : '∞';
  const expectancy = total > 0 ? ((wins.length/total)*avgW + (losses.length/total)*avgL).toFixed(2) : 0;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statWins').textContent = wins.length;
  document.getElementById('statLosses').textContent = losses.length;
  document.getElementById('statWR').textContent = wr + '%';
  document.getElementById('statAvgW').textContent = '$' + avgW.toFixed(0);
  document.getElementById('statAvgL').textContent = '$' + avgL.toFixed(0);
  document.getElementById('statPF').textContent = pf;
  document.getElementById('statExpect').textContent = '$' + expectancy;
}

function renderTable() {
  const filterDate = document.getElementById('filterDate').value;
  const filterResult = document.getElementById('filterResult').value;
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7*24*3600*1000).toISOString().split('T')[0];

  let filtered = [...trades];
  if (filterDate === 'today') filtered = filtered.filter(t => t.date === today);
  else if (filterDate === 'week') filtered = filtered.filter(t => t.date >= weekAgo);

  if (filterResult === 'win') filtered = filtered.filter(t => t.pnl > 0);
  else if (filterResult === 'loss') filtered = filtered.filter(t => t.pnl < 0);
  else if (filterResult === 'be') filtered = filtered.filter(t => t.pnl === 0);

  const tbody = document.getElementById('tradeBody');
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    document.getElementById('emptyState').classList.add('visible');
    return;
  }
  document.getElementById('emptyState').classList.remove('visible');

  filtered.forEach((t, i) => {
    const pnlClass = t.pnl > 0 ? 'pnl-pos' : t.pnl < 0 ? 'pnl-neg' : 'pnl-be';
    const pnlText = (t.pnl >= 0 ? '+' : '') + '$' + (t.pnl || 0).toFixed(2);
    const dirClass = t.dir === 'LONG' ? 'dir-long' : 'dir-short';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="row-num">${filtered.length - i}</td>
      <td>${t.date || '—'}</td>
      <td>${t.time || '—'}</td>
      <td><strong>${t.instrument || '—'}</strong></td>
      <td><span class="dir-badge ${dirClass}">${t.dir}</span></td>
      <td>${t.contracts || 1}</td>
      <td>${t.entry ? t.entry.toFixed(2) : '—'}</td>
      <td>${t.exit ? t.exit.toFixed(2) : '—'}</td>
      <td class="${pnlClass}">${pnlText}</td>
      <td>${t.rr ? t.rr + 'R' : '—'}</td>
      <td><span class="setup-tag">${t.setup || '—'}</span></td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;color:var(--text3)">${t.notes || ''}</td>
      <td><button class="btn-delete" onclick="deleteTrade('${t.id}')">✕</button></td>
    `;
    tr.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete')) return;
      openModal(t.id);
    });
    tbody.appendChild(tr);
  });
}

function renderAlerts(r) {
  const zone = document.getElementById('alertZone');
  zone.innerHTML = '';

  const alerts = [];

  if (r.safeMargin <= 0) {
    alerts.push({ type: 'danger', msg: '⛔ DRAWDOWN ALCANZADO — No operes hoy. El balance tocó el floor de drawdown. Reporta a Apex si es necesario.' });
  } else if (r.safeMargin < config.maxDD * 0.3) {
    alerts.push({ type: 'danger', msg: `⛔ Margen crítico: solo $${r.safeMargin.toFixed(2)} de buffer. PARA de operar hoy.` });
  } else if (r.safeMargin < config.maxDD * 0.6) {
    alerts.push({ type: 'warning', msg: `⚠ Margen reducido ($${r.safeMargin.toFixed(2)}). Opera con 1 contrato máximo y stop estricto.` });
  }

  if (r.dailyRemaining <= 0) {
    alerts.push({ type: 'danger', msg: `⛔ Daily Loss Limit alcanzado. No puedes abrir más trades hoy.` });
  } else if (r.dailyRemaining < config.dailyLimit * 0.3) {
    alerts.push({ type: 'warning', msg: `⚠ Solo quedan $${r.dailyRemaining.toFixed(2)} de tu límite diario. Sé muy selectivo.` });
  }

  if (r.cushionPct >= 100) {
    alerts.push({ type: 'success', msg: `🎯 ¡Colchón objetivo alcanzado! ($${r.cushionGained.toFixed(2)}). Puedes hacer tu primera solicitud de pago.` });
  }

  alerts.forEach(a => {
    const div = document.createElement('div');
    div.className = `alert alert-${a.type}`;
    div.textContent = a.msg;
    zone.appendChild(div);
  });
}

// ── MODAL RISK CHECK ────────────────────────────────────────────────────────
function updateModalRiskCheck() {
  const contracts = parseInt(document.getElementById('fContracts').value) || 1;
  const sl = parseFloat(document.getElementById('fSL').value);
  const tp = parseFloat(document.getElementById('fTP').value);
  const pnl = parseFloat(document.getElementById('fPnl').value);
  const risk = computeRisk();
  const el = document.getElementById('riskCheckContent');
  let lines = [];

  // Contracts check
  if (contracts > risk.recContracts) {
    lines.push(`<span class="check-fail">✗ Estás usando ${contracts} contratos. Recomendado: ${risk.recContracts}.</span>`);
  } else {
    lines.push(`<span class="check-ok">✓ Contratos OK (${contracts} ≤ ${risk.recContracts} recomendados)</span>`);
  }

  // Max contracts Apex
  if (contracts > config.contracts) {
    lines.push(`<span class="check-fail">✗ APEX RULE: Máximo ${config.contracts} contratos permitidos.</span>`);
  }

  // Daily limit check
  const slAmount = isNaN(sl) ? (contracts * 100) : sl;
  const todayPnl = getTodayPnl();
  if ((todayPnl - slAmount) < -config.dailyLimit) {
    lines.push(`<span class="check-fail">✗ Si pierdes el SL ($${slAmount}), tu P&L diario sería -$${Math.abs(todayPnl - slAmount).toFixed(2)}, superando el límite de $${config.dailyLimit}.</span>`);
  } else {
    lines.push(`<span class="check-ok">✓ Daily limit OK. Riesgo trade: $${slAmount.toFixed(2)}</span>`);
  }

  // Max risk per trade
  const maxR = parseFloat(risk.recMaxRisk);
  if (slAmount > maxR) {
    lines.push(`<span class="check-warn">⚠ Riesgo $${slAmount.toFixed(2)} > máximo recomendado $${maxR.toFixed(2)} (10% del margen)</span>`);
  }

  // RR check
  if (!isNaN(sl) && !isNaN(tp) && sl > 0) {
    const rr = (tp / sl).toFixed(2);
    const cls = parseFloat(rr) >= 1.5 ? 'check-ok' : parseFloat(rr) >= 1 ? 'check-warn' : 'check-fail';
    lines.push(`<span class="${cls}">${parseFloat(rr) >= 1.5 ? '✓' : '⚠'} R:R = ${rr} (mínimo recomendado 1.5R)</span>`);
  }

  // Margin check
  if (risk.safeMargin < config.maxDD * 0.3) {
    lines.push(`<span class="check-fail">✗ Margen crítico: $${risk.safeMargin.toFixed(2)}. Considera no operar.</span>`);
  }

  el.innerHTML = lines.join('<br>');
}

// ── DELETE ─────────────────────────────────────────────────────────────────
function deleteTrade(id) {
  if (!confirm('¿Eliminar este trade?')) return;
  trades = trades.filter(t => t.id !== id);
  saveTrades();
  renderAll();
}
window.deleteTrade = deleteTrade;

// ── EXPORT CSV ─────────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['#','Fecha','Hora','Instrumento','Dir','Contratos','Entrada','Salida','PnL','RR','Setup','Emoción','Notas'];
  const rows = trades.map((t, i) => [
    i+1, t.date, t.time, t.instrument, t.dir, t.contracts,
    t.entry, t.exit, t.pnl, t.rr, t.setup, t.emotion,
    `"${(t.notes||'').replace(/"/g,'""')}"`
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apex-journal-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

// ── TOAST ──────────────────────────────────────────────────────────────────
function showToast(msg, type='success') {
  const zone = document.getElementById('alertZone');
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = msg;
  zone.prepend(div);
  setTimeout(() => div.remove(), 4500);
}
