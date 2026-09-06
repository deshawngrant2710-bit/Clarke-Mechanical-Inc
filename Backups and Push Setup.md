# Backups & Push Notifications — setup

Two pieces of housekeeping that protect what you've built and switch on something
that's already written but dormant.

---

## Part 1 — Backups (do this first)

Everything now lives in one Render Postgres database: customers, invoices,
estimates, receipts, 316 price-book items, 110 leads, job history. Losing it
would be far worse than any bug we've fixed. Two layers of protection:

### A. Turn on Render's automatic backups

1. Render dashboard → your **clarke-db** database → **Backups** (or **Recovery**).
2. Confirm daily backups are enabled and note the retention period.
   - The **free** Postgres plan has **no backups** and expires after 90 days. If
     you're on it, upgrade to the **$7/mo Starter** — this is the cheapest
     insurance you will ever buy for your business data.
3. Note the "point-in-time recovery" window if your plan offers one.

### B. Keep your own copy, off Render

Render backups protect you from Render failures. They do **not** protect you from
losing the account, a billing lapse, or someone deleting records by mistake. So
take your own copy too:

```bash
cd "/Users/apple/Desktop/Clarke Mechanical/functions" && \
DATABASE_URL='<your External Database URL>' node scripts/backup.js
```

This writes one timestamped JSON file to **Desktop → Clarke Mechanical Backups**
containing every record, and prints a summary of what it saved.

**Do this monthly**, and after anything big (a price-book update, a bulk import).
Then move a copy somewhere off this Mac — iCloud Drive, Dropbox, or a USB drive.
A backup that only exists on the same machine isn't a backup.

> Tip: keep the last 3–4 files and delete older ones. They're small.

---

## Part 2 — Push notifications

The app already contains everything: APNs sending, device registration, and
notification routing. It's simply switched off because Apple credentials were
never added. Once configured, you and the office get an instant alert on your
phones when a service request comes in, a customer sends a chat, or a payment
lands — instead of finding out when someone checks the site.

### Step A — Create the Apple key (once)

1. Go to <https://developer.apple.com/account/resources/authkeys/list>
2. **Keys → +** (add a key). Name it `Clarke Mechanical Push`.
3. Tick **Apple Push Notifications service (APNs)** → Continue → Register.
4. **Download** the file — it's named `AuthKey_XXXXXXXXXX.p8`.
   **You can only download it once.** Keep it safe (not in this project folder).
5. Note two values:
   - **Key ID** — the 10 characters in the filename / on the key's page.
   - **Team ID** — top right of the developer portal, also under Membership.

### Step B — Enable the capability in Xcode (once)

1. Open the project: `client/ios/App/App.xcworkspace`
2. Select the **App** target → **Signing & Capabilities**.
3. **+ Capability** → **Push Notifications**.
4. Rebuild and upload a new build (this is required — a build without the
   capability can never receive pushes).

### Step C — Add the variables on Render

Render → your **API service** → **Environment** → add these five:

| Key | Value |
|---|---|
| `APNS_KEY` | paste the **entire contents** of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |
| `APNS_KEY_ID` | the 10-character Key ID from Step A |
| `APNS_TEAM_ID` | your 10-character Team ID |
| `APNS_BUNDLE_ID` | `org.clarkemechanicalinc.app` |
| `APNS_PRODUCTION` | `true` for TestFlight/App Store builds · `false` while testing a build run directly from Xcode |

Save — Render redeploys automatically.

### Step D — Test

1. Open the app on your iPhone and **allow notifications** when prompted.
2. Trigger something that notifies — easiest is submitting a service request from
   a customer account.
3. Your phone should buzz within a few seconds.

### If pushes don't arrive

- **`APNS_PRODUCTION` mismatch is the usual cause.** A build you *Run* from Xcode
  uses Apple's sandbox → needs `false`. A build from TestFlight or the App Store
  uses production → needs `true`.
- Check Render logs for `[push]` lines — the sender logs why it failed.
- Confirm the Push Notifications capability is in the build that's actually on
  your phone (Step B), and that you tapped **Allow** on the permission prompt.
- The app registers its device token at login; sign out and back in if needed.

---

## Quick reference

| Task | How often |
|---|---|
| Run `scripts/backup.js` and move the file off this Mac | Monthly, and before/after big changes |
| Check Render's automatic backups are still enabled | Quarterly |
| Confirm push still works (submit a test service request) | After each App Store release |
