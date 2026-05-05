const fmt = (n) => '£' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtHours = (h) => h % 1 === 0 ? h + 'h' : h.toFixed(1) + 'h';
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TAX_ALERT_KEY = 'taxAlertDismissed';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const fmtDate = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
};

// ─── Count-up animation ─────────────────────────────────
function countUp(el, value, { pre = '', suf = '', duration = 600 } = {}) {
  if (!el) return;
  if (reducedMotion()) { el.textContent = pre + fmt(value) + suf; return; }
  const t0 = performance.now();
  function frame(now) {
    const p = Math.min((now - t0) / duration, 1);
    const eased = 1 - (1 - p) ** 3; // ease-out cubic
    el.textContent = pre + fmt(value * eased) + suf;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

let config    = {};
let appConfig = { sfePayments: [], wageAllocation: {}, sfeAllocation: {} };

// ─── Tab switching ─────────────────────────────────────
const TAB_LABELS = { dashboard: 'Dashboard', shifts: 'Shifts', settings: 'Settings' };

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));

  const tabEl    = document.getElementById('tab-' + name);
  const sideEl   = document.querySelector(`.sidebar-btn[data-tab="${name}"]`);
  const bottomEl = document.querySelector(`.bottom-nav-btn[data-tab="${name}"]`);
  tabEl.classList.add('active');
  if (sideEl)   sideEl.classList.add('active');
  if (bottomEl) bottomEl.classList.add('active');

  const labelEl = document.getElementById('header-tab-name');
  if (labelEl) labelEl.textContent = TAB_LABELS[name] || '';

  const fab = document.getElementById('fab-add-shift');
  if (fab) fab.classList.toggle('fab-visible', name === 'shifts');

  tabEl.querySelectorAll('.card, .settings-section, .table-wrap, .shift-list-wrap, .empty-state, .page-header').forEach(el => {
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
  });

  if (name === 'dashboard') loadDashboard();
  if (name === 'shifts')    loadShifts();
  if (name === 'settings')  loadSettings();
}

// ─── Sidebar ───────────────────────────────────────────
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const hamburger      = document.getElementById('hamburger');

function openSidebar()  {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
  hamburger.classList.add('open');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
  hamburger.classList.remove('open');
}

hamburger.addEventListener('click', openSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSidebar(); closeModal(); }
});

document.querySelectorAll('.sidebar-btn').forEach(btn => {
  btn.addEventListener('click', () => { switchTab(btn.dataset.tab); closeSidebar(); });
});

document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('fab-add-shift')?.addEventListener('click', () => openModal());

document.querySelectorAll('.alert-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(link.dataset.goto);
  });
});

// ─── Dashboard ─────────────────────────────────────────
async function loadDashboard() {
  const [data, months] = await Promise.all([
    fetch('/api/dashboard').then(r => r.json()),
    fetch('/api/months').then(r => r.json()).catch(() => [])
  ]);

  toggle('alert-no-rates', !data.ratesConfigured);
  const taxAlertDismissed = localStorage.getItem(TAX_ALERT_KEY) === '1';
  toggle('alert-no-tax', data.ratesConfigured && !data.taxEnabled && !taxAlertDismissed);

  renderPeriod('month', data.thisMonth, data.taxEnabled);
  renderPeriod('week',  data.thisWeek,  data.taxEnabled);
  renderPeriod('ytd',   data.ytd,       data.taxEnabled);

  countUp(document.getElementById('dash-holiday-total'), data.totalHolidayAccrued);

  const ann = data.projectedAnnual;
  if (data.taxEnabled && ann.taxes) {
    show('tax-breakdown');
    hide('tax-disabled-note');
    countUp(document.getElementById('dash-annual-total'),  ann.net,                  { suf: ' net' });
    countUp(document.getElementById('annual-gross-total'), ann.total);
    countUp(document.getElementById('annual-income-tax'),  ann.taxes.incomeTax,      { pre: '−' });
    countUp(document.getElementById('annual-ni'),          ann.taxes.ni,             { pre: '−' });
    countUp(document.getElementById('annual-net'),         ann.net);
    if (ann.taxes.studentLoan > 0) {
      show('student-loan-row');
      countUp(document.getElementById('annual-student-loan'), ann.taxes.studentLoan, { pre: '−' });
    } else {
      hide('student-loan-row');
    }
  } else {
    hide('tax-breakdown');
    show('tax-disabled-note');
    countUp(document.getElementById('dash-annual-total'), ann.total);
  }

  animateRing();
  renderMonthBars(months);
  renderWageAllocation(data.thisMonth.total);
  renderSFECard();
}

function renderPeriod(key, data, taxEnabled) {
  countUp(document.getElementById(`dash-${key}-total`), data.total);

  const subEl = document.getElementById(`dash-${key}-net`);
  subEl.className = 'card-sub';
  if (taxEnabled && data.net != null) {
    subEl.classList.add('net');
    countUp(subEl, data.net, { suf: ' est. net' });
  } else {
    subEl.textContent = 'gross + holiday pay';
  }

  countUp(document.getElementById(`dash-${key}-gross`),   data.grossPay,   { pre: 'Gross: ' });
  countUp(document.getElementById(`dash-${key}-holiday`), data.holidayPay, { pre: 'Holiday: ' });
  setText(`dash-${key}-hours`, 'Hours: ' + fmtHours(data.hoursWorked));
}

// ─── Progress ring ─────────────────────────────────────
function animateRing() {
  const fill = document.getElementById('ring-fill');
  if (!fill) return;

  const now       = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd   = new Date(now.getFullYear() + 1, 0, 1);
  const yearPct   = (now - yearStart) / (yearEnd - yearStart);
  const circ      = 2 * Math.PI * 58; // r=58 → ≈364.4

  fill.style.strokeDasharray  = circ;
  fill.style.strokeDashoffset = circ; // start empty

  const target = circ * (1 - yearPct);

  if (reducedMotion()) {
    fill.style.transition = 'none';
    fill.style.strokeDashoffset = target;
  } else {
    // Double RAF ensures the initial empty state is painted before animating
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.strokeDashoffset = target;
    }));
  }

  setText('ring-pct', Math.round(yearPct * 100) + '% of year');
}

// ─── Mini bar chart ────────────────────────────────────
function renderMonthBars(months) {
  const container = document.getElementById('month-bars');
  if (!container || !months.length) return;

  const BAR_W   = 30;
  const GAP     = 14;
  const CHART_H = 80;
  const MIN_H   = 5;
  const LABEL_Y = CHART_H + 14;
  const VIEW_H  = CHART_H + 22;
  const n       = months.length;
  const totalW  = n * BAR_W + (n - 1) * GAP;
  const maxVal  = Math.max(...months.map(m => m.total), 1);
  const NS      = 'http://www.w3.org/2000/svg';
  const reduced = reducedMotion();

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${totalW} ${VIEW_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMinYMax meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', totalW);
  svg.setAttribute('height', VIEW_H);
  svg.style.cssText = `max-width:100%;height:auto;display:block;overflow:visible`;

  months.forEach((m, i) => {
    const x       = i * (BAR_W + GAP);
    const rawH    = (m.total / maxVal) * CHART_H;
    const targetH = m.total > 0 ? Math.max(rawH, MIN_H) : 0;
    const fill    = m.isCurrent ? 'rgba(0,221,213,0.85)' : 'rgba(255,255,255,0.18)';

    if (m.total > 0) {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('width', BAR_W);
      rect.setAttribute('rx', 3);
      rect.setAttribute('fill', fill);

      if (reduced) {
        rect.setAttribute('y', CHART_H - targetH);
        rect.setAttribute('height', targetH);
      } else {
        rect.setAttribute('y', CHART_H);
        rect.setAttribute('height', 0);
        const startAt = performance.now() + i * 55;
        (function anim(now) {
          if (now < startAt) { requestAnimationFrame(anim); return; }
          const p     = Math.min((now - startAt) / 480, 1);
          const eased = 1 - (1 - p) ** 3;
          const h     = targetH * eased;
          rect.setAttribute('height', h);
          rect.setAttribute('y', CHART_H - h);
          if (p < 1) requestAnimationFrame(anim);
        })(performance.now());
      }

      svg.appendChild(rect);
    }

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', x + BAR_W / 2);
    label.setAttribute('y', LABEL_Y);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', m.isCurrent ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.32)');
    label.setAttribute('font-size', 8);
    label.setAttribute('font-family', 'Inter, sans-serif');
    label.setAttribute('font-weight', m.isCurrent ? '700' : '400');
    label.textContent = m.short;
    svg.appendChild(label);
  });

  container.innerHTML = '';
  container.appendChild(svg);
}

// ─── Shifts (timeline) ─────────────────────────────────
async function loadShifts() {
  const shifts = await fetch('/api/shifts').then(r => r.json());
  const list   = document.getElementById('shifts-list');
  list.innerHTML = '';

  if (shifts.length === 0) {
    show('shifts-empty');
    hide('shifts-list-wrap');
    return;
  }
  hide('shifts-empty');
  show('shifts-list-wrap');

  let lastMonth = null;
  let rowIndex  = 0;

  shifts.forEach(s => {
    const d        = new Date(s.date + 'T12:00:00');
    const monthKey = MONTHS[d.getMonth()] + ' ' + d.getFullYear();

    if (monthKey !== lastMonth) {
      const hdr = document.createElement('div');
      hdr.className   = 'shift-month-header';
      hdr.textContent = monthKey;
      list.appendChild(hdr);
      lastMonth = monthKey;
      rowIndex  = 0; // reset alternation per month
    }

    const breakStr = s.breakMinutes > 0 ? ` · ${s.breakMinutes}m break` : '';
    const altClass = rowIndex % 2 === 1 ? ' shift-row-alt' : '';
    const row      = document.createElement('div');
    row.className  = 'shift-row' + altClass + (s.usePostRate ? ' post-rate' : '');
    row.innerHTML  = `
      <div class="shift-row-main">
        <div class="shift-row-date">${DAYS[d.getDay()]} ${fmtDate(s.date)}</div>
        <div class="shift-row-time">${s.startTime}–${s.endTime}${breakStr}</div>
      </div>
      <div class="shift-row-pay">
        <div class="shift-row-total">${fmt(s.totalBeforeDeductions)}</div>
        <div class="shift-row-meta">${fmtHours(s.hoursWorked)} · ${fmt(s.grossPay)} gross · ${fmt(s.holidayPay)} hol${s.usePostRate ? ' <span class="rate-up">new</span>' : ''}</div>
      </div>
      <div class="shift-row-actions">
        <button class="btn-icon" title="Edit" data-action="edit" data-id="${s.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon danger" title="Delete" data-action="delete" data-id="${s.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    `;
    list.appendChild(row);
    rowIndex++;
  });

  list.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.id, shifts));
  });
  list.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteShift(btn.dataset.id));
  });
}

async function deleteShift(id) {
  if (!confirm('Delete this shift? This cannot be undone.')) return;
  await fetch('/api/shifts/' + id, { method: 'DELETE' });
  loadShifts();
}

// ─── Settings ──────────────────────────────────────────
async function loadSettings() {
  config = await fetch('/api/config').then(r => r.json());
  document.getElementById('currentRate').value          = config.currentRate      || '';
  document.getElementById('postBirthdayRate').value     = config.postBirthdayRate || '';
  document.getElementById('rateChangeDate').value       = config.rateChangeDate   || '';
  document.getElementById('taxEnabled').checked         = !!config.taxEnabled;
  document.getElementById('studentLoanEnabled').checked = !!config.studentLoanEnabled;
  toggle('tax-options', !!config.taxEnabled);
}

document.getElementById('taxEnabled').addEventListener('change', function () {
  toggle('tax-options', this.checked);
});

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {
    currentRate:        parseFloat(form.currentRate.value)      || 0,
    postBirthdayRate:   parseFloat(form.postBirthdayRate.value) || 0,
    rateChangeDate:     form.rateChangeDate.value,
    taxEnabled:         form.taxEnabled.checked,
    studentLoanEnabled: form.studentLoanEnabled.checked
  };
  config = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());

  const saved = document.getElementById('settings-saved');
  saved.classList.remove('hidden');
  setTimeout(() => saved.classList.add('hidden'), 2500);
});

// ─── Modal ─────────────────────────────────────────────
const modalOverlay = document.getElementById('modal-overlay');

function openModal(editId = null, shifts = []) {
  const form = document.getElementById('shift-form');
  form.reset();
  hide('shift-preview');

  if (editId) {
    const s = shifts.find(x => x.id === editId);
    if (!s) return;
    document.getElementById('modal-title').textContent  = 'Edit Shift';
    document.getElementById('modal-submit').textContent = 'Save Changes';
    document.getElementById('shift-id').value    = s.id;
    document.getElementById('shift-date').value  = s.date;
    document.getElementById('shift-start').value = s.startTime;
    document.getElementById('shift-end').value   = s.endTime;
    document.getElementById('shift-break').value = s.breakMinutes || '';
    document.getElementById('shift-notes').value = s.notes || '';
    updatePreview();
  } else {
    document.getElementById('modal-title').textContent  = 'Log Shift';
    document.getElementById('modal-submit').textContent = 'Save Shift';
    document.getElementById('shift-id').value   = '';
    document.getElementById('shift-date').value = new Date().toISOString().slice(0, 10);
  }

  show('modal-overlay');
  document.getElementById('shift-date').focus();
}

function closeModal() { hide('modal-overlay'); }

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

document.getElementById('btn-add-shift').addEventListener('click', () => openModal());
document.getElementById('btn-add-shift-empty').addEventListener('click', () => {
  switchTab('shifts');
  setTimeout(() => openModal(), 80);
});

['shift-date','shift-start','shift-end','shift-break'].forEach(id => {
  document.getElementById(id).addEventListener('input', updatePreview);
});

function updatePreview() {
  const dateVal  = document.getElementById('shift-date').value;
  const startVal = document.getElementById('shift-start').value;
  const endVal   = document.getElementById('shift-end').value;
  const breakVal = parseInt(document.getElementById('shift-break').value) || 0;

  if (!dateVal || !startVal || !endVal) { hide('shift-preview'); return; }

  const [sh, sm] = startVal.split(':').map(Number);
  const [eh, em] = endVal.split(':').map(Number);
  let totalMins  = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMins <= 0) totalMins += 24 * 60;
  const hours = Math.max(0, totalMins - breakVal) / 60;

  const rateChangeDate = new Date((config.rateChangeDate || '2026-06-15') + 'T12:00:00');
  const shiftDate      = new Date(dateVal + 'T12:00:00');
  const rate = shiftDate >= rateChangeDate
    ? Number(config.postBirthdayRate) || 0
    : Number(config.currentRate)      || 0;

  const gross   = hours * rate;
  const holiday = gross * 0.1207;

  setText('prev-hours',   fmtHours(hours));
  setText('prev-gross',   fmt(gross));
  setText('prev-holiday', fmt(holiday));
  setText('prev-total',   fmt(gross + holiday));
  show('shift-preview');
}

document.getElementById('shift-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id   = document.getElementById('shift-id').value;
  const body = {
    date:         document.getElementById('shift-date').value,
    startTime:    document.getElementById('shift-start').value,
    endTime:      document.getElementById('shift-end').value,
    breakMinutes: parseInt(document.getElementById('shift-break').value) || 0,
    notes:        document.getElementById('shift-notes').value
  };

  await fetch(id ? '/api/shifts/' + id : '/api/shifts', {
    method:  id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });

  closeModal();
  loadShifts();
  if (document.getElementById('tab-dashboard').classList.contains('active')) loadDashboard();
});

// ─── Allocation bars ─────────────────────────────────────
function renderWageAllocation(monthTotal) {
  const { starlingLisa: sLisa, travel: trav, premiumBonds: bPB } = appConfig.wageAllocation;
  const wageFixed = sLisa + trav + bPB;
  const starling  = Math.min(sLisa, monthTotal);
  const travel    = Math.min(trav, Math.max(0, monthTotal - sLisa));
  const bonds     = Math.min(bPB,  Math.max(0, monthTotal - sLisa - trav));
  const remainder = Math.max(0, monthTotal - wageFixed);

  countUp(document.getElementById('wage-alloc-total'), monthTotal);
  renderAllocBar('wage-alloc-bar', [
    { label: 'Starling / LISA', amount: starling,  color: 'var(--teal)' },
    { label: 'Travel fund',     amount: travel,    color: '#ffc107' },
    { label: 'Prem. Bonds',     amount: bonds,     color: '#9b5de5' },
    { label: 'Remainder',       amount: remainder, color: 'rgba(255,255,255,0.15)' },
  ], monthTotal || 1);
}

function renderSFECard() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const next = (appConfig.sfePayments || []).find(p => {
    const d = new Date(p.date + 'T00:00:00');
    return d >= now;
  });
  if (!next) return;

  const payDate = new Date(next.date + 'T00:00:00');
  const days    = Math.round((payDate - now) / (1000 * 60 * 60 * 24));
  const d       = new Date(next.date + 'T12:00:00');
  setText('sfe-date', d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear());
  countUp(document.getElementById('sfe-amount'), next.amount);
  setText('sfe-days', days);

  const { savings, travel: sTrav, premiumBonds: sPB } = appConfig.sfeAllocation;
  const sfeFixed       = savings + sTrav + sPB;
  const currentAccount = Math.max(0, next.amount - sfeFixed);
  renderAllocBar('sfe-alloc-bar', [
    { label: 'Savings',         amount: savings,       color: 'var(--teal)' },
    { label: 'Travel',          amount: sTrav,         color: '#ffc107' },
    { label: 'Prem. Bonds',     amount: sPB,           color: '#9b5de5' },
    { label: 'Current account', amount: currentAccount, color: 'rgba(255,255,255,0.15)' },
  ], next.amount);
}

function renderAllocBar(containerId, segments, total) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const visible = segments.filter(s => s.amount > 0);
  const reduced = reducedMotion();

  visible.forEach((seg, i) => {
    const col = document.createElement('div');
    col.className       = 'alloc-col';
    col.style.flexGrow  = seg.amount;
    col.style.flexBasis = '0';

    const labelEl = document.createElement('div');
    labelEl.className   = 'alloc-col-label';
    labelEl.textContent = seg.label;

    const segEl = document.createElement('div');
    segEl.className           = 'alloc-col-seg';
    segEl.style.backgroundColor = seg.color;
    segEl.style.borderRadius  =
      visible.length === 1        ? '5px' :
      i === 0                     ? '5px 0 0 5px' :
      i === visible.length - 1   ? '0 5px 5px 0' : '0';

    const amountEl = document.createElement('div');
    amountEl.className   = 'alloc-col-amount';
    amountEl.textContent = fmt(seg.amount);

    col.appendChild(labelEl);
    col.appendChild(segEl);
    col.appendChild(amountEl);
    container.appendChild(col);

    if (!reduced) {
      segEl.style.transform  = 'scaleX(0)';
      segEl.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setTimeout(() => {
          segEl.style.transition = 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)';
          segEl.style.transform  = 'scaleX(1)';
        }, i * 120);
      }));
    }
  });
}

// ─── Helpers ───────────────────────────────────────────
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function show(id)   { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
function hide(id)   { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function toggle(id, cond) { cond ? show(id) : hide(id); }

// ─── Custom cursor ─────────────────────────────────────
(function initCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
    document.body.classList.add('cur-ready');
  }, { passive: true });

  (function loop() {
    rx += (mx - rx) * 0.13;
    ry += (my - ry) * 0.13;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(loop);
  })();

  const HOVER_SEL = 'button, a, label, .card, .sidebar-btn, .shifts-table tbody tr, .toggle, .btn-icon, .hamburger, .alert-dismiss';
  const TEXT_SEL  = 'input, textarea, [contenteditable]';

  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (t.closest(TEXT_SEL))       { document.body.classList.add('cur-text');  document.body.classList.remove('cur-hover'); }
    else if (t.closest(HOVER_SEL)) { document.body.classList.add('cur-hover'); document.body.classList.remove('cur-text'); }
  }, { passive: true });

  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
      document.body.classList.remove('cur-hover', 'cur-text');
    } else {
      const t = e.relatedTarget;
      if (!t.closest(HOVER_SEL) && !t.closest(TEXT_SEL)) document.body.classList.remove('cur-hover', 'cur-text');
    }
  }, { passive: true });

  document.addEventListener('mousedown', () => document.body.classList.add('cur-click'),    { passive: true });
  document.addEventListener('mouseup',   () => document.body.classList.remove('cur-click'), { passive: true });
  document.addEventListener('mouseleave', () => { document.body.classList.remove('cur-ready', 'cur-hover', 'cur-text', 'cur-click'); });
})();

// ─── Dismiss tax alert ─────────────────────────────────
document.getElementById('dismiss-tax-alert')?.addEventListener('click', () => {
  hide('alert-no-tax');
  localStorage.setItem(TAX_ALERT_KEY, '1');
});

// ─── Init ──────────────────────────────────────────────
(async () => {
  [config, appConfig] = await Promise.all([
    fetch('/api/config').then(r => r.json()),
    fetch('/api/app-config').then(r => r.json()),
  ]);
  loadDashboard();
})();
