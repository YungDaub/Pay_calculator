const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const appConfig = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const SHIFTS_FILE = path.join(DATA_DIR, 'shifts.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function initFile(file, def) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
}
initFile(SHIFTS_FILE, []);
initFile(CONFIG_FILE, appConfig.defaults);

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

function calcShift(shift, config) {
  const [sh, sm] = shift.startTime.split(':').map(Number);
  const [eh, em] = shift.endTime.split(':').map(Number);

  let totalMins = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMins <= 0) totalMins += 24 * 60;

  const workMins = Math.max(0, totalMins - (Number(shift.breakMinutes) || 0));
  const hoursWorked = workMins / 60;

  const rateChangeDate = new Date(config.rateChangeDate || appConfig.defaults.rateChangeDate);
  const shiftDate = new Date(shift.date + 'T12:00:00');
  const usePostRate = shiftDate >= rateChangeDate;
  const rate = usePostRate ? Number(config.postBirthdayRate) || 0 : Number(config.currentRate) || 0;

  const grossPay = hoursWorked * rate;
  const holidayPay = grossPay * 0.1207;
  const totalBeforeDeductions = grossPay + holidayPay;

  return { ...shift, hoursWorked, rate, usePostRate, grossPay, holidayPay, totalBeforeDeductions };
}

function sumShifts(shifts, config) {
  return shifts.reduce((acc, s) => {
    const c = calcShift(s, config);
    return {
      hoursWorked: acc.hoursWorked + c.hoursWorked,
      grossPay: acc.grossPay + c.grossPay,
      holidayPay: acc.holidayPay + c.holidayPay,
      total: acc.total + c.totalBeforeDeductions,
      count: acc.count + 1
    };
  }, { hoursWorked: 0, grossPay: 0, holidayPay: 0, total: 0, count: 0 });
}

function calcTaxes(annualTotal, config) {
  const incomeTax = Math.max(0, annualTotal - 12570) * 0.20;
  const weeklyPay = annualTotal / 52;
  const ni = Math.max(0, weeklyPay - 242) * 0.08 * 52;
  const studentLoan = config.studentLoanEnabled
    ? Math.max(0, annualTotal - 27295) * 0.09
    : 0;
  const totalDeductions = incomeTax + ni + studentLoan;
  return { incomeTax, ni, studentLoan, totalDeductions, net: annualTotal - totalDeductions };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => res.json(readJSON(CONFIG_FILE)));

app.post('/api/config', (req, res) => {
  const config = { ...readJSON(CONFIG_FILE), ...req.body };
  writeJSON(CONFIG_FILE, config);
  res.json(config);
});

app.get('/api/shifts', (req, res) => {
  const config = readJSON(CONFIG_FILE);
  const shifts = readJSON(SHIFTS_FILE)
    .map(s => calcShift(s, config))
    .sort((a, b) => {
      const dateDiff = new Date(b.date) - new Date(a.date);
      return dateDiff !== 0 ? dateDiff : b.startTime.localeCompare(a.startTime);
    });
  res.json(shifts);
});

app.post('/api/shifts', (req, res) => {
  const shifts = readJSON(SHIFTS_FILE);
  const config = readJSON(CONFIG_FILE);
  const shift = {
    id: crypto.randomUUID(),
    date: req.body.date,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    breakMinutes: Number(req.body.breakMinutes) || 0,
    notes: req.body.notes || ''
  };
  shifts.push(shift);
  writeJSON(SHIFTS_FILE, shifts);
  res.json(calcShift(shift, config));
});

app.put('/api/shifts/:id', (req, res) => {
  const shifts = readJSON(SHIFTS_FILE);
  const config = readJSON(CONFIG_FILE);
  const idx = shifts.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  shifts[idx] = {
    ...shifts[idx],
    date: req.body.date,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    breakMinutes: Number(req.body.breakMinutes) || 0,
    notes: req.body.notes || ''
  };
  writeJSON(SHIFTS_FILE, shifts);
  res.json(calcShift(shifts[idx], config));
});

app.delete('/api/shifts/:id', (req, res) => {
  const shifts = readJSON(SHIFTS_FILE);
  const idx = shifts.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  shifts.splice(idx, 1);
  writeJSON(SHIFTS_FILE, shifts);
  res.json({ success: true });
});

app.get('/api/dashboard', (req, res) => {
  const config = readJSON(CONFIG_FILE);
  const allShifts = readJSON(SHIFTS_FILE);
  const now = new Date();

  const dow = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const yearStart  = new Date(now.getFullYear(), 0, 1);
  const yearEnd    = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  const inRange = (dateStr, start, end) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d >= start && d <= end;
  };

  const weekShifts  = allShifts.filter(s => inRange(s.date, weekStart, weekEnd));
  const monthShifts = allShifts.filter(s => inRange(s.date, monthStart, monthEnd));
  const ytdShifts   = allShifts.filter(s => inRange(s.date, yearStart, yearEnd));
  const allShiftsValid = allShifts;

  const weekTotals  = sumShifts(weekShifts, config);
  const monthTotals = sumShifts(monthShifts, config);
  const ytdTotals   = sumShifts(ytdShifts, config);
  const allTotals   = sumShifts(allShiftsValid, config);

  // Project annual from full month × 12 (works well when shifts are pre-logged)
  const projectedAnnualTotal = monthTotals.total * 12;
  const projectedAnnualGross = monthTotals.grossPay * 12;

  let taxes = null;
  let effectiveRate = 0;
  if (config.taxEnabled && projectedAnnualTotal > 0) {
    taxes = calcTaxes(projectedAnnualTotal, config);
    effectiveRate = taxes.totalDeductions / projectedAnnualTotal;
  }

  const withNet = (totals) => ({
    ...totals,
    net: config.taxEnabled ? totals.total * (1 - effectiveRate) : null
  });

  res.json({
    thisWeek:  withNet(weekTotals),
    thisMonth: withNet(monthTotals),
    ytd:       withNet(ytdTotals),
    totalHolidayAccrued: allTotals.holidayPay,
    projectedAnnual: {
      gross: projectedAnnualGross,
      total: projectedAnnualTotal,
      net:   taxes ? taxes.net : null,
      taxes
    },
    taxEnabled: config.taxEnabled,
    ratesConfigured: Number(config.currentRate) > 0
  });
});

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

app.get('/api/months', (req, res) => {
  const config    = readJSON(CONFIG_FILE);
  const allShifts = readJSON(SHIFTS_FILE);
  const now = new Date();
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const monthShifts = allShifts.filter(s => {
      const sd = new Date(s.date + 'T12:00:00');
      return sd >= d && sd < next;
    });
    const totals = sumShifts(monthShifts, config);
    result.push({ short: MONTH_ABBR[d.getMonth()], total: totals.total, isCurrent: i === 0 });
  }
  res.json(result);
});

app.get('/api/app-config', (req, res) => {
  res.json({
    sfePayments:    appConfig.sfePayments,
    wageAllocation: appConfig.wageAllocation,
    sfeAllocation:  appConfig.sfeAllocation,
  });
});

app.listen(PORT, () => {
  console.log(`Pay Calculator → http://localhost:${PORT}`);
});
