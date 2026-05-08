module.exports = {
  // Defaults written to data/config.json on first run (overridden via Settings tab)
  defaults: {
    currentRate:      10.85,
    postBirthdayRate: 12.71,
    rateChangeDate:   '2026-06-15',
    taxEnabled:       false,
    studentLoanEnabled: false,
  },

  // Upcoming SFE (Student Finance England) payment dates and amounts
  sfePayments: [
    { date: '2026-09-21', amount: 2826.45 },
    { date: '2027-01-04', amount: 2826.45 },
    { date: '2027-04-12', amount: 2912.10 },
  ],

  // Fixed monthly wage allocation (£). Remainder goes to current account.
  wageAllocation: {
    starlingLisa:  250,
    travel:        100,
    premiumBonds:  50,
  },

  // Fixed per-SFE-payment allocation (£). Remainder goes to current account.
  sfeAllocation: {
    savings:      1800,
    travel:        300,
    premiumBonds:  100,
  },
};
