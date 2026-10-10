// Stripe payment routes — status, staff-initiated invoice checkout, and the
// payment webhook (source of truth for marking invoices paid).
const express = require('express');
const { getById } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const stripe = require('../lib/stripe');

const router = express.Router();

// POST /api/stripe/webhook — Stripe calls this. Mounted with a RAW body parser
// in app.js (before express.json) so the signature can be verified.
router.post('/webhook', async (req, res) => {
  let event;
  try {
    event = stripe.verifyWebhook(req.body, req.headers['stripe-signature']);
  } catch (e) {
    console.error('[stripe] webhook verify failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const invoiceId = s.metadata?.invoice_id || s.client_reference_id;
      if (invoiceId && s.payment_status === 'paid') {
        await stripe.recordStripePayment(invoiceId, {
          amount: (s.amount_total || 0) / 100,
          reference: String(s.payment_intent || s.id),
          note: 'Paid online via Stripe',
        });
      }
    }
  } catch (e) {
    console.error('[stripe] webhook handler error:', e.message);
    // Still 200 so Stripe doesn't hammer retries for an app-side issue we've logged.
  }
  res.json({ received: true });
});

// Everything below requires a signed-in staff user.
router.use(authMiddleware, requireRole('admin', 'office'));

// GET /api/stripe/status — is Stripe configured? (for showing the pay option)
router.get('/status', (req, res) => {
  res.json({ configured: stripe.configured(), environment: stripe.isLive() ? 'live' : 'test', publishable_key: stripe.publishable() });
});

// POST /api/stripe/invoices/:id/checkout — staff creates a hosted-checkout link
// for an invoice balance (to charge now or send to the customer).
router.post('/invoices/:id/checkout', async (req, res) => {
  if (!stripe.configured()) return res.status(400).json({ error: 'Stripe is not set up yet. Add the Stripe keys in Render.' });
  const invoice = await getById('invoices', req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'paid') return res.status(400).json({ error: 'This invoice is already paid.' });
  try {
    const customer = invoice.customer_id ? await getById('customers', invoice.customer_id) : null;
    const { url, amount } = await stripe.createInvoiceCheckout(invoice, { customer });
    res.json({ url, amount });
  } catch (e) {
    if (e.code === 'NO_BALANCE') return res.status(400).json({ error: 'Nothing left to pay.' });
    console.error('[stripe] checkout:', e.message);
    res.status(502).json({ error: 'Could not start the Stripe payment.' });
  }
});

module.exports = router;
