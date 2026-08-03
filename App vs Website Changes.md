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
| Hide the drawer hamburger in the app | Navigation is the bottom bar + role-aware More screen; the slide-out drawer is redundant on the app. | `app-hamburger` class on the header button (`src/App.jsx`) hidden via `html.native-app` in `src/index.css`. **Mobile web + desktop keep the drawer/sidebar.** |

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
| Technician Field Mode (`/field`) — tech's home screen: next job, address/problem, start travel, arrived, job timer, call/message/directions, service history, tiles to diagnosis/photos/parts/inspection/signature. | Shared but is the **technician role's home + bottom nav**. Online-first, structured for phased offline next. Backend adds `work_started_at`/`work_ended_at` to the job update whitelist (`functions/routes/jobs.js`) — **deploy to Render**. `src/pages/FieldMode.jsx`, `src/lib/roles.js`, `src/App.jsx`. |
| Phase-1 offline layer — caches the tech's day (jobs/customers/etc.) for offline reads; queues whitelisted mutations (status, notes, parts, photos, sign-off, inspections, time) with opId + device + tech + timestamp; auto-syncs on reconnect; global status banner (Saved offline / Waiting / Syncing / Synced / Failed—retry) + pending counter. **Excludes** payments, invoice finalization, deletions, scheduling. | Shared, but only affects behavior when a request fails/offline. Client-only. `src/lib/idb.js`, `src/lib/offlineSync.js`, `src/context/OfflineContext.jsx`, `src/components/OfflineBanner.jsx`, installed in `src/api/client.js`, wired in `src/App.jsx`. |
| Offline hardening — server-side idempotency (dedupe retries by opId), `updated_at` stamping, device-aware 409 conflict on job edits (with force override), optimistic display of queued parts/photos, and a **Sync review screen** (`/sync`) to retry/discard/resolve conflicts (keep mine / keep server). | **Backend must be deployed to Render**: `functions/middleware/idempotency.js` (mounted in `app.js`), `updated_at` in `functions/lib/db.js`, conflict guard in `functions/routes/jobs.js`. Client: `src/pages/SyncQueue.jsx` + offline engine updates. New "Sync" nav item (staff). |
| Offline Phase 2 — create **customers / jobs / estimates** while offline. Each gets a temp id and appears immediately (marked pending); on reconnect they're created in order, temp ids are remapped to the real server ids, and any dependent queued action (e.g. a job that referenced an offline customer) is rewritten and held until its dependency exists. | Client-only, in `src/lib/offlineSync.js` (temp-id map + remap + dependency hold). Reuses idempotency so no duplicate records. Offline **invoices/payments still excluded**. |
| Offline Phase 3 — proactive "Download for offline" (warms jobs, customers, employees, inspections, price book, quotes, settings + the tech's job details); broader offline reads (invoices, price book, settings, customer & inspection detail, dashboard); offline customer-contact edits; "Pending" badges on unsynced records; last-downloaded time on the Sync screen. | Client-only, `src/lib/offlineSync.js` + `src/pages/SyncQueue.jsx`; pending badges in `Jobs.jsx`/`Customers.jsx`. Auto-warms ~4s after load when online. Still excludes payments/invoice finalization/deletions/scheduling. |
| Dispatch: mobile card list (grouped by status) with quick actions, Move/Reassign bottom sheets, swipe actions, estimated travel time + technician availability badges + conflict warnings | Drag-and-drop is hard on phones. **Desktop keeps drag-and-drop unchanged.** Travel time is estimated from job coordinates (no live GPS) via a swappable function so Apple Maps / Google / GPS can be added later. `src/pages/Dispatch.jsx`, `src/components/MobileDispatch.jsx`, `src/lib/dispatch.js` |

---

## Important reminder when you deploy the website

The website is currently running an **older version** than your phone. When you eventually deploy the site (push to GitHub → live), it will pick up **all** shared changes — which is fine — and **none** of the app-only ones (correct). Just don't remove the privacy page or account-deletion features, since Apple depends on them.

---

| Dashboard redesign — priority cards first (Today's jobs, Emergency, Unassigned, Outstanding, Techs available), secondary financials + charts moved into a collapsible **Business Overview**, and a floating **Create** button (Customer/Job/Quote/Invoice). | Shared (web + app); FAB sits above the bottom nav on mobile. Frontend-only. `src/pages/Dashboard.jsx`; `?new=1` modal openers added to `Customers.jsx`, `Quotes.jsx`, `Invoices.jsx` (Jobs already had it). |

| Customer "More" screen (`/more`) — Option-4 style: purple gradient profile card (real name/email → My Profile), white menu list (My Profile, Service Addresses, Payment Methods, Notification Settings, Help & Support, Documents, Refer & Earn, About) with icons/chevrons/dividers, logout with confirm dialog. Customers get a 4-tab bottom nav (Home/Appointments/Invoices/More) with **purple** active accent. | Rows route to real destinations (no duplicate pages): `/account`, Portal deep-links (`?tab=…`, `?profile=1`), and two new small pages `AboutClarke.jsx` + `ReferEarn.jsx`. Customer-only (guarded). Bottom nav customer branch in `BottomNav.jsx`; deep-links in `Portal.jsx`; `canAccess` OPEN_ROUTES in `roles.js`. Desktop unchanged. |

| To-Do upgrades — job & invoice links (in addition to customer), **recurring tasks** (spawn next on complete: daily/weekly/biweekly/monthly), **reminder** datetime, **comments** thread, and overdue/due-today coloring. | Shared (web + app). Backend: `functions/routes/tasks.js` (fields + `/tasks/:id/comments` + recurrence spawn). **Deploy to Render.** Frontend: `src/pages/Tasks.jsx`, job prefill in `JobDetail.jsx`. **Push notification delivery is NOT included** — that needs the Capacitor Push Notifications plugin + Apple push key (separate task). |

## Add new entries here as we go

- _(new app-only or shared changes will be logged here)_
