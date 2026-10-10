# Clarke Mechanical — Deploy Commands

Copy/paste these. **Never** run `npm run build` without the two `VITE_` lines —
a build missing them produces a website that loads but cannot reach the backend
(blank dashboard, login fails with a correct password).

---

## 1. Website (and the iPhone app's web layer)

```bash
cd "/Users/apple/Desktop/Clarke Mechanical/client" && \
VITE_API_URL=https://clarke-mechanical-inc.onrender.com/api \
VITE_GOOGLE_MAPS_API_KEY=AIzaSyC2ahZmRv0GLvYJ8WkZ0FRd5KvGih6Ie0c \
npm run build && cd .. && firebase deploy --only hosting
```

Look for `✓ built in …` then `Deploy complete!`. If either is missing, it did not ship.

Then hard-refresh the site: **Cmd + Shift + R**.

---

## 2. Backend (API on Render)

Render redeploys automatically when you push to GitHub.

```bash
cd "/Users/apple/Desktop/Clarke Mechanical" && \
git add -A && git commit -m "describe the change" && git push
```

Confirm in Render → Logs that the new deploy started, and that it prints:
`[db] Using Postgres (DATABASE_URL set)`

---

## 3. iPhone app (only when app code changes)

```bash
cd "/Users/apple/Desktop/Clarke Mechanical/client" && \
VITE_API_URL=https://clarke-mechanical-inc.onrender.com/api \
VITE_GOOGLE_MAPS_API_KEY=AIzaSyC2ahZmRv0GLvYJ8WkZ0FRd5KvGih6Ie0c \
npm run build && npx cap sync ios && npx cap open ios
```

Then in Xcode: bump the build number → Product → Archive → Distribute.

---

## Which do I need?

| Changed | Run |
|---|---|
| Anything in `client/` (screens, buttons, layout) | **1** |
| Anything in `functions/` (API, database, email) | **2** |
| Both | **2 then 1** |
| Shipping a new App Store version | **1 then 3** |

---

## If something breaks after a deploy

1. **Hard-refresh** (Cmd + Shift + R), or test in a **Private window** to rule out caching.
2. Check the browser **Console** (Cmd + Option + C) for red errors.
3. Check **Render → Logs** (set range to Last hour, search `Error`).
4. Sanity-check the build actually contains the backend URL:
   ```bash
   grep -c "onrender.com/api" "/Users/apple/Desktop/Clarke Mechanical/client/dist/assets/"index-*.js
   ```
   `0` means it was built without the `VITE_` lines — rebuild using command **1**.

---

## Banking (Stripe Financial Connections) setup

The **Banking** page (admin/office) connects the business bank account via Stripe
Financial Connections to show balance + transactions. (Viewing only — paying
vendors is a separate rail, not wired to this provider; the "Pay a vendor" button
stays hidden.)

**Step 1 — get Stripe keys:** at https://dashboard.stripe.com → **Developers →
API keys**, copy the **Publishable key** (`pk_test_…`) and **Secret key**
(`sk_test_…`). Test keys are available immediately, no approval needed.

**Step 2 — add these env vars in Render** (API service → Environment), then deploy:

```
STRIPE_SECRET_KEY      = sk_test_...   (use sk_live_... when going live)
STRIPE_PUBLISHABLE_KEY = pk_test_...   (use pk_live_... when going live)
```

The publishable key is safe to expose; the backend hands it to the Banking page so
no website rebuild is needed when it changes. Both are backend-only env vars —
section 1's `VITE_` lines don't change.

**Step 3 — test:** open Banking → Connect bank account → pick a test bank and use
Stripe's test sign-in. Fake balances/transactions appear. No real account touched.

**Step 4 — go live:** activate the Stripe account (business details), switch both
env vars to the `..._live_...` keys in Render, redeploy, then connect the real
Bank of America account. Financial Connections may charge per linked account /
refresh — see Stripe's pricing.

**Paying vendors:** not available through Stripe Financial Connections (it reads
accounts, it doesn't move money). When that's prioritized, it's a separate build
(e.g. a bill-pay product like Melio/Bill.com, or an ACH rail like Dwolla).

---

## Stripe payments (invoice card payments)

Customers can pay invoices by card through Stripe (alongside Helcim, which stays as
a backup). Uses the SAME Stripe keys as Financial Connections, plus a webhook secret.

**Step 1 — same keys as above** already cover it: `STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY`. Nothing extra for the keys.

**Step 2 — create the webhook** so paid invoices are marked paid automatically:
in Stripe → **Developers → Webhooks → Add endpoint**:

```
Endpoint URL:  https://clarke-mechanical-inc.onrender.com/api/stripe/webhook
Events:        checkout.session.completed
```

Copy the endpoint's **Signing secret** (`whsec_…`) and add it in Render:

```
STRIPE_WEBHOOK_SECRET = whsec_...
BUSINESS_URL          = https://clarkemechanicalinc.org   (for pay success/cancel redirects)
```

**Step 3 — test (sandbox):** open an unpaid invoice → "Pay / charge with Stripe"
(or the customer pay link → "Pay by card"). Use test card `4242 4242 4242 4242`,
any future expiry, any CVC. The webhook marks the invoice paid and issues a receipt,
same as Helcim.

**Step 4 — go live:** switch to live keys (`sk_live_…`, `pk_live_…`), create a live
webhook endpoint, set its `whsec_…` in Render. Helcim stays available as the
backup payment method throughout.

---

## Environment reference

- Website: https://clarkemechanicalinc.org (Firebase Hosting, site `clarke-mechanical-inc`)
- API: https://clarke-mechanical-inc.onrender.com/api (Render)
- Database: Render Postgres `clarke-db` — the API needs `DATABASE_URL` set to the
  **Internal** Database URL. Removing that variable rolls back to Firestore.
- Never commit: service-account `.json` keys, database URLs, or the temporary
  `_chk.js` / `_reset-my-password.js` diagnostic scripts.
