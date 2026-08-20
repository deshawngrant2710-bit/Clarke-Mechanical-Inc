// Customer payment details shown on the "Pay" screen (Zelle + bank transfer).
// Card processing is not used. Fill in the blanks below when the details are ready —
// this is the ONLY place you need to edit. Leave a value as '' to show
// "contact our office" for that line, or set enabled:false to hide a whole method.

export const PAYMENT_INFO = {
  zelle: {
    enabled: true,
    name: 'Clarke Mechanical Inc.',
    email: 'clarkemechanical@gmail.com',
    phone: '',   // optional — add a Zelle phone if you use one
  },
  bank: {
    enabled: true,
    bankName: '',
    accountName: 'Clarke Mechanical Inc.',
    accountNumber: '',
    routingNumber: '',       // ACH routing number
    wireRoutingNumber: '',   // wire routing number (leave blank if same as ACH)
  },
  check: {
    enabled: true,
    payableTo: 'Clarke Mechanical Inc.',
    mailTo: '',  // mailing address for checks
  },
  cash: { enabled: true },
};
