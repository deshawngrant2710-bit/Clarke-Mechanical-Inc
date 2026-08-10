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

| Jobs mobile cards — clear chips (Status, Priority, Job type, Appointment date/time, Payment status, Technician) and **tap-to-assign** technician via a bottom sheet instead of an inline dropdown in every row. | Mobile only (desktop table unchanged). Payment chip derived from the job's linked invoice (`/billing/invoices`). `src/pages/Jobs.jsx`. Frontend-only. |

| Schedule redesign — **Agenda / Day / Week / Month** views (defaults to Agenda on phones, Month on desktop), technician filter (+ Unassigned), unassigned-jobs banner, **job-count badges** on month dates, **time-block** rows, **emergency color-coding** (red), and tap-a-date-shows-jobs-beneath in Month view. | `src/pages/Schedule.jsx`. Frontend-only. Loads `/employees` for the tech filter. |

| Route page — numbered stops (existing) + **optimize order** (nearest-neighbour), **ETAs** per stop, **technician location** (device GPS) with a "you are here" marker + route start, **Start navigation** per stop, **On my way** (en-route notify), **delay alerts** (past-ETA + not done), **unassigned stops** in amber, a connecting route line, and a **collapsible stop list** on mobile. | `src/pages/RouteMap.jsx` (reuses `src/lib/dispatch.js` travel logic). Added `NSLocationWhenInUseUsageDescription` to `ios/App/App/Info.plist` for GPS. Frontend + Info.plist — **rebuild in Xcode** (no Render deploy). |

| Inspections — 9 HVAC templates (Air Conditioner, Heat Pump, Furnace, Boiler, Mini-Split, Preventive Maintenance, Installation Startup, Refrigeration, Water Heater), each with its own pass/fail checklist + structured **readings** (with units) that flow into the PDF report. Photos, serial (info fields), notes, and customer signature already existed. | Frontend-only. `src/lib/inspectionForms.js` (equipment types, checklist sections, `READINGS_SECTIONS`/`readingsFor`), `src/pages/InspectionDetail.jsx` (readings card + PDF box). New-inspection modal picks up the templates automatically. |

| Time Clock — **break tracking** (start/end, netted out of hours), **overtime** (>40h/wk), **shift-vs-billable** summary (breaks + OT shown), **missed clock-out warning**, **correction requests** (tech) with **manager approval/deny**, and **entry approval**. Clock-in/out GPS and offline clock-in (via the sync queue) already existed. | Shared. Backend: `functions/routes/time.js` (break/approve/correction endpoints + net hours). **Deploy to Render.** Frontend: `src/pages/TimeClock.jsx`. |

| Quotes & Invoices — **discount** ($ off, tax applied after discount) and **deposit** (amount requested up front) controls, on the create modals, totals, and the customer PDF. | Shared. Backend: `functions/routes/billing.js` (`calcTotals` + handlers). **Deploy to Render.** Frontend: `Quotes.jsx`, `Invoices.jsx`, `src/lib/printDoc.js`. Other list items (partial payments, invoice PDF/email, receipt, reminders, approve/reject, quote→job, job→invoice) already existed; e-signature-on-quote, Good/Better/Best, quote reminders, and SMS remain (SMS needs Twilio). |

| iOS safe-area fix (v2) — switched the app to a **fixed app shell**: `html/body/#root/WKWebView` no longer scroll; only `.app-content` scrolls. The shell (`.app-shell`) owns the top & bottom safe-area insets, the header (`.app-header`) and bottom nav are fixed flex children, so the header/content can never slide under the Dynamic Island. | Native-app-only (scoped `html.native-app` in `src/index.css`); `App.jsx` shell structure; `BottomNav.jsx` is now a flex child (not `fixed`). Public pages scroll via `.native-safe-y`. **Desktop unchanged.** Supersedes the earlier sticky-header approach. |

| Stale-while-revalidate page cache — pages seed their initial state from an in-memory cache so switching bottom tabs / returning from More shows the last data **instantly** (no full-screen spinner), then refreshes in the background. Cleared on logout. | Shared. `src/lib/queryCache.js`; applied to `Dashboard`, `Jobs`, `Schedule`, `Invoices`, `Customers`, `Inspections`; `clearCache()` in `AuthContext.logout`. Frontend-only. |

| Bottom-sheet pickers + hide nav in modals — `SheetSelect` renders a native dropdown on desktop but an app-styled **bottom sheet** on mobile (title, optional search, checkmark, Cancel/Done). Applied to Create Job (customer/technician/type/priority), Schedule technician filter, Create Invoice (customer/status). The **bottom nav hides while any modal is open**. | `src/components/SheetSelect.jsx`; `UI.jsx` Modal toggles `html.modal-open`; `BottomNav.jsx` + `index.css` hide `.bottom-nav-bar` when `modal-open`. Frontend-only. Desktop unchanged. |

| Full-screen form sheets on phones — the shared `Modal` now opens **full-screen on phone widths** with a **sticky header + Close**, a **scrollable body**, and an optional **sticky footer** (safe-area/keyboard aware). Create Job & Create Invoice actions moved into that sticky footer. Bottom nav already hidden while a modal is open. | `src/components/UI.jsx` (Modal `footer` prop + responsive layout), `Jobs.jsx`, `Invoices.jsx`. **Desktop stays a centered card.** All other modals also go full-screen on mobile (their inline buttons still work). |

| Customer account settings consolidated — one clear home each: **My Profile** (`/account`: name/phone/email + Delete Account at bottom, customer-only), **Service Addresses** (`/addresses`), **Notification Settings** (`/notifications`: email/SMS prefs), **Security** (`/security`: change password). More has a single Log Out; the Home "My Info" button now opens **My Profile**. Removed duplicate password/sign-out from `/account` for customers (kept password there for staff). | New pages `ServiceAddresses.jsx`, `NotificationSettings.jsx`, `Security.jsx`; `Account.jsx`, `MoreCustomer.jsx`, `Portal.jsx`, routes + `OPEN_ROUTES`. Uses `/portal/me` + `/portal/profile` (full-object save preserves fields). Frontend-only. |

| Customer portal tabs decluttered — the dashboard now shows only **Services · Invoices · Estimates**. Help & Support, FAQ, and Assistant moved into a dedicated **Support** view (title "Support", its own sub-tabs, account sections hidden) reached from More → Help & Support. | `src/pages/Portal.jsx` (split `accountTabs`/`supportTabs`, `inSupport` view). More already links to `/portal?tab=help`. Frontend-only. |

## Add new entries here as we go

- _(new app-only or shared changes will be logged here)_

## Refer & Earn (referral program)
- **Backend** (`functions/`): new `lib/referral.js` generates a stable per-user code (e.g. `JANE-3F9A`). `GET /portal/referrals` returns `{ code, link, reward, referrals[] }`. Signup (`POST /auth/register`) records a `pending` referral in the `referrals` collection when a `?ref=CODE` is present. Reward text is configurable via the `referral_reward` setting; share link uses the `business_website` setting.
- **Frontend** (`client/`): `ReferEarn.jsx` now shows the customer's name ("Referred by …"), their unique code + shareable link (both with copy buttons), a prewritten share message, the clearly-defined reward, and a live list of their referrals with Pending/Completed badges. `Login.jsx` passes `?ref=` through on signup.
- Applies to app and website (same portal). No SMS/push involved.

## Dedicated Appointments page (customer)
- Problem: the bottom-nav "Appointments" tab pointed at `/portal?tab=jobs`, but the Portal home already defaulted to that Services tab — so tapping it just highlighted, nothing changed.
- New `/appointments` route/page with **Upcoming** and **Service History** sections, plus Reschedule / Cancel / Sign-off / Review / photos.
- Extracted the job list + its Reschedule/Sign-off/Review modals out of `Portal.jsx` into a shared `components/CustomerJobs.jsx` (no duplication — one implementation).
- Portal home trimmed: removed the "Services" tab (keeps Invoices + Estimates); the "Next appointment" card is now tappable and links to `/appointments`; added `?request=1` deep-link so the new page's Request Service button opens the booking modal.
- Bottom-nav Appointments tab now points to `/appointments` (app only; website unchanged).

### Appointments page — follow-ups
- Fixed: tapping Appointments landed on My Account. The role guard (`canAccess`) didn't allow `/appointments`, so customers were bounced to their role home (which resolved to `/account`). Added `/appointments` to the open-routes list.
- Booking now opens directly on the Appointments page (its own `ServiceRequestModal`) instead of routing to the Portal. Extracted `ServiceRequestModal` into `components/ServiceRequestModal.jsx`, shared by Portal and Appointments.

## Text messaging via Quo (formerly OpenPhone)
- New `functions/lib/sms.js` — `sendSms`/`notifyCustomerBySms` using the Quo REST API (`POST https://api.quo.com/v1/messages`, `Authorization: <API_KEY>`, body `{content, from, to:[E.164]}`). Includes E.164 normalization and opt-out respect (`sms_opt_in === false` is skipped). Replaces the old Twilio stub.
- Wired texts into: phone-number verification (portal), appointment confirmation (job → scheduled), "on my way" en-route (jobs), estimate ready (billing), and invoice reminders — single + bulk overdue (billing). Each is best-effort and sends alongside the existing email; failures never block the request.
- New `functions/routes/cron.js` (`POST /api/cron/appointment-reminders`) guarded by an `x-cron-key` header (env `CRON_KEY`). Texts + emails day-before reminders for jobs scheduled the target day (defaults to tomorrow), idempotent via `reminder_sent_at`. Point a daily external cron at it.
- **Env vars to set on Render:** `QUO_API_KEY`, `QUO_FROM` (your Quo number, E.164 like `+1XXXXXXXXXX`), optional `QUO_USER_ID`, and `CRON_KEY` (any random string) for reminders. Texting US numbers also requires completing Quo US carrier (10DLC) registration.
