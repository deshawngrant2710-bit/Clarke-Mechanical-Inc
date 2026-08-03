# Clarke Mechanical — App-only vs. Shared Changes

Your website and mobile app are built from the **same code** (`client/` folder). By default any change shows up in **both**. This note tracks what we've deliberately made **app-only**, what's **shared**, and how to keep them separate going forward.

_Last updated: August 3, 2026_

---

## How "app-only" works

At launch, the app tags itself with a `native-app` flag (in `src/main.jsx`, via `Capacitor.isNativePlatform()`). The website never gets this flag. So:

- **CSS that should be app-only** → put it under `html.native-app { ... }` in `src/index.css`.
- **JavaScript that should be app-only** → wrap it in `if (Capacitor?.isNativePlatform?.()) { ... }`.

Anything not wrapped that way applies to **both** the app and the website.

---

## App-only changes (do NOT appear on the website)

| Change | Why | Where |
|---|---|---|
| No pinch-zoom / locked scale + safe-area viewport | App should feel native, not zoom like a web page | `src/main.jsx` (runtime viewport) |
| No horizontal side-slide | Off-screen menu drawer was letting the page slide sideways | `src/index.css` → `html.native-app` |
| No sideways rubber-band bounce | Native-feel scrolling | `src/index.css` → `html.native-app` |
| Stop iOS auto-enlarging text | Kept text sizes consistent | `src/index.css` → `html.native-app` |
| Extra padding under the "Sign out" button | Kept it above the iPhone home-swipe bar | `src/components/Sidebar.jsx` (`safe-bottom` class) + `src/index.css` |
| Bottom tab bar (most-used areas + More) | Native app-style quick navigation on phones | `src/components/BottomNav.jsx`, `src/lib/roles.js` (`bottomNavForRole`), wired in `src/App.jsx` |
| iOS edge-to-edge / scroll fix — no scroll indicator, no rubber-band bounce, no black strip, safe-area header + bottom nav, single scroll container | Native WKWebView settings in `ios/App/App/AppDelegate.swift` + `capacitor.config.json` (`contentInset: never`, background `#f8fafc`). CSS under `html.native-app` in `src/index.css`. Web-side `viewport-fit=cover` (harmless on web) and `min-h-screen`→`min-h-dvh` (renders identically on desktop). **Desktop unchanged.** |
| Hide sidebar name/sign-out block | Bottom bar covered it; sign-out now in My Account panel | `src/components/Sidebar.jsx` (`sidebar-user` class) + `src/index.css`. Website still shows it. |

---

## Shared changes (MUST stay on BOTH app and website)

| Change | Why it must stay on the website too |
|---|---|
| Privacy Policy page (`/privacy`) | Apple **requires** the privacy URL `clarkemechanicalinc.org/privacy` to be publicly reachable on the website. Removing it from the site can get the app rejected/pulled. |
| In-app account deletion (My Portal → My Info → Delete my account) | Apple **requires** account deletion. Harmless on the website; leave it on both. |
| Privacy Policy link on the login screen | Points users/reviewers to the policy. Fine on both. |
| All business features (jobs, invoices, estimates, scheduling, etc.) | This is the core product — shared by design. |
| My Account panel (`/account`) — view/edit name & phone, change password, sign out; delete account for customers | Useful for every role on web and app. Backend: `GET/PUT /api/auth/me` in `functions/routes/auth.js`. **Backend must be deployed to Render** for Save to work. |
| Customers & Jobs: card layout on phone-width screens (tables on desktop) | Fixes squeezed/cut-off email & technician fields on mobile. Responsive by breakpoint — **desktop website is unchanged** (still tables). `src/pages/Customers.jsx`, `src/pages/Jobs.jsx` |
| Workflow connection: Quote→Job one-click conversion + auto-prepared draft invoice when a job completes | Shared (web + app). Backend: `POST /billing/quotes/:id/convert-to-job` and `maybeAutoInvoice()` in `functions/routes/jobs.js`. **Backend must be deployed to Render.** UI: Convert-to-Job button on Quotes; "From estimate" link on the job. |
| Dispatch: mobile card list (grouped by status) with quick actions, Move/Reassign bottom sheets, swipe actions, estimated travel time + technician availability badges + conflict warnings | Drag-and-drop is hard on phones. **Desktop keeps drag-and-drop unchanged.** Travel time is estimated from job coordinates (no live GPS) via a swappable function so Apple Maps / Google / GPS can be added later. `src/pages/Dispatch.jsx`, `src/components/MobileDispatch.jsx`, `src/lib/dispatch.js` |

---

## Important reminder when you deploy the website

The website is currently running an **older version** than your phone. When you eventually deploy the site (push to GitHub → live), it will pick up **all** shared changes — which is fine — and **none** of the app-only ones (correct). Just don't remove the privacy page or account-deletion features, since Apple depends on them.

---

## Add new entries here as we go

- _(new app-only or shared changes will be logged here)_
