# Apple Review — Guideline 2.1 Reply

Paste the text below into **Resolution Center** (and into App Review Information → Notes for future submissions). Attach the screen recording described at the bottom.

> Confirm the exact iOS version on your iPhone before sending: Settings → General → About → Software Version. Replace `[iOS 26.x]` below.

---

Thank you for reviewing Clarke Mechanical. Please find the requested information below.

**2. Devices and operating systems tested**
- iPhone 17 Pro Max — iOS [26.x] (physical device)
- iPhone 16 Pro Max Simulator — latest iOS

**3. App functions and target audience**
Clarke Mechanical is the official app of Clarke Mechanical Inc., a licensed HVAC (heating, ventilation, and air conditioning) service company. It lets our customers request service, book and track appointments, review and approve estimates, view and download invoices, see their service history, and pay their balance. Staff accounts can additionally manage jobs, scheduling, and invoices. Target audience: our residential and commercial HVAC customers, and our own field/office staff. Problem it solves: it replaces phone calls and paperwork with one place for customers to book service and handle billing, and for staff to run daily operations.

**4. Setup and access instructions**
No setup is required. The app has two account types; the role is determined by the login used. Please test with both:

Customer account (books service, views/pays invoices):
- Email: deshawng@clarkemechanicalinc.org
- Password: Earthstrong

Admin/staff account (manages jobs, scheduling, team, invoices):
- Email: appletest@clarkemechanicalinc.org
- Password: AppleReview2026

After logging in, the core features are:
- Home — account overview and quick actions
- Request Service — create a service request and optionally attach photos
- Appointments — upcoming visits and service history
- Billing & Invoices — view/download invoices and estimates, and pay a balance
- More — profile, notifications, security, and account deletion

New users can create an account from the login screen. Account deletion is available in-app at: More → My Profile → Delete my account.

**5. External services used**
- Authentication: our own backend (email/password with JWT), hosted on Render
- Backend/database: Node.js/Express API on Render and Google Firebase (Firestore)
- SMS notifications and phone verification: Quo (OpenPhone)
- Address autocomplete and maps: Google Places / Google Maps
- Optional in-app help assistant: Google Gemini
- Email notifications: SMTP
- Payments: none are processed in the app. Invoices are for physical HVAC services performed at the customer's location and are paid outside the app by Zelle, bank transfer, check, or cash. There are no in-app purchases, subscriptions, or digital goods, so Apple In-App Purchase does not apply.

**6. Regional differences**
None. The app functions consistently for all users. It is offered in the United States only.

**7. Regulated industry / third-party material**
Clarke Mechanical Inc. is a licensed HVAC service company, and this is our own first-party app for our own customers and staff. It contains no third-party protected material. Business license/registration documentation can be provided on request.

**User-generated content:** the only user content is photos and notes a customer optionally attaches to their own service request, plus one-to-one support messages to our office. This content is private between the customer and our business and is never shared publicly or with other users, so there is no public feed requiring content reporting or blocking.

**Device permissions:** the app requests camera and photo-library access only when a customer chooses to attach a photo to a service request. Clear purpose strings describing this are included in the app.

---

## 1. Screen recording — how to make it

Record on your physical iPhone (latest iOS). Keep it ~1–2 minutes.

Enable the recorder once: Settings → Control Center → add **Screen Recording**.

Then: open Control Center → tap the record circle → wait 3 seconds → do the flow below → stop from the status bar. The video saves to Photos.

Flow to capture (in this order):
1. Launch the app from the Home Screen.
2. Log in with the demo account above.
3. Home screen overview.
4. Request Service → fill a short request → **Add photos** (allow the camera/photos prompt) → submit. (Shows user content + the permission prompt.)
5. Appointments — show upcoming and history.
6. Billing & Invoices → open an invoice → tap **Pay** → show the Zelle/bank transfer options (demonstrates payments happen off-app, no in-app purchase).
7. More → My Profile → show **Delete my account** (open the confirmation, then Cancel so you don't actually delete it). Also show **Sign out**.

Attach the video in the Resolution Center reply. If it's too large to attach, upload it to iCloud Drive (or similar), get a share link, and paste the link in your reply.
