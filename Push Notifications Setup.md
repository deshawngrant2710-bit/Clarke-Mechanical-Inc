# Push Notifications — Setup Checklist

The code is done. Push works for **admin + office** accounts on the iOS app: when a
customer accepts a quote, books, pays, etc., staff get a real banner even when the
app is closed, and tapping it opens the right page.

You need to do three one-time setup things: (A) create an Apple push key, (B) turn on
the Push capability in Xcode, (C) set the keys on Render. Then rebuild the app.

---

## A. Create an APNs Auth Key (Apple Developer)

1. Go to https://developer.apple.com/account → **Certificates, IDs & Profiles → Keys**.
2. Click **＋**, name it "Clarke Mechanical Push", check **Apple Push Notifications service (APNs)**, Continue → Register.
3. **Download** the file — it's named `AuthKey_XXXXXXXXXX.p8`. You can only download it once; keep it safe.
4. Note two values:
   - **Key ID** — the 10-character code in the key's name / on its page.
   - **Team ID** — top-right of the developer portal (10 characters), also under Membership.

## B. Turn on Push in Xcode

1. Open `ios/App/App.xcworkspace`.
2. Select the **App** target → **Signing & Capabilities**.
3. Click **＋ Capability** → add **Push Notifications**.
4. (Optional but recommended) **＋ Capability** → **Background Modes** → check **Remote notifications**.
   This lets notifications arrive while the app is backgrounded.
5. Make sure signing still shows no red errors.

## C. Set the keys on Render (backend)

In the Render dashboard → your service → **Environment**, add:

| Key | Value |
|-----|-------|
| `APNS_KEY` | paste the **entire contents** of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |
| `APNS_KEY_ID` | the 10-char Key ID from step A |
| `APNS_TEAM_ID` | your 10-char Team ID |
| `APNS_BUNDLE_ID` | `org.clarkemechanicalinc.app` |
| `APNS_PRODUCTION` | `true` for TestFlight/App Store builds. Use `false` while testing a build you run directly from Xcode. |

> Tip: if you paste the `.p8` as one line, replace real line breaks — the code also accepts `\n` escapes. Easiest is to paste it exactly as multi-line in Render's value box.

**Important — the `APNS_PRODUCTION` gotcha:** a build you **Run** from Xcode onto your phone uses Apple's **sandbox** → set `APNS_PRODUCTION=false` to test. A build installed via **TestFlight or the App Store** uses **production** → set `APNS_PRODUCTION=true`. If pushes "send" but never arrive, this flag is almost always the reason.

---

## D. Build & deploy

```bash
# backend (installs the APNs library, then deploys to Render)
cd "/Users/apple/Desktop/Clarke Mechanical" && git add -A && git commit -m "Real push notifications (APNs)" && git push

# app (installs the push plugin, builds, syncs to iOS)
cd client && npm install && \
VITE_API_URL=https://clarke-mechanical-inc.onrender.com/api \
VITE_GOOGLE_MAPS_API_KEY=AIzaSyC2ahZmRv0GLvYJ8WkZ0FRd5KvGih6Ie0c \
npm run build && npx cap sync ios

# website (optional — push is app-only, but keeps the site current)
cd .. && firebase deploy --only hosting
```

Then open the app in Xcode and Run it on your phone. On first launch as an admin/office
user, iOS asks permission to send notifications — tap **Allow**. That registers the
device. Have a test customer accept a quote (or use the demo account) and you should get
a banner.

## How to test quickly

1. Sign in on the app as `appletest@clarkemechanicalinc.org` (admin), allow notifications.
2. On another device/browser, sign in as the customer `deshawng@clarkemechanicalinc.org`.
3. As the customer, request a service or accept an estimate.
4. The admin device should get a push within a few seconds.

If nothing arrives: check Render logs for `[push]` errors, and double-check the
`APNS_PRODUCTION` flag matches how the app was installed (Xcode run = false, TestFlight = true).
