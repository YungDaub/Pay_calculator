module.exports = {
  // Defaults written to data/config.json on first run (overridden via Settings tab)
  defaults: {
    currentRate:        0,
    postBirthdayRate:   0,
    rateChangeDate:     '',
    taxEnabled:         false,
    studentLoanEnabled: false,
  },

  // Add upcoming payment dates/amounts in data/app-config.json (see README)
  sfePayments: [],

  // Fixed monthly wage allocation (£). Remainder goes to current account.
  wageAllocation: {
    starlingLisa:  0,
    travel:        0,
    premiumBonds:  0,
  },

  // Fixed per-SFE-payment allocation (£). Remainder goes to current account.
  sfeAllocation: {
    savings:      0,
    travel:       0,
    premiumBonds: 0,
  },
};
