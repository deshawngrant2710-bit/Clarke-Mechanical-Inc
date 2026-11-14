# Clarke Mechanical Bot — 2-Hour Health Check Setup

The bot now checks the whole app **every 2 hours** and alerts you every time it finds a problem.

## What it does every 2 hours

**In a real Chrome browser (GitHub Actions)**

1. Opens the live website as each role: customer, technician, leads agent, office manager and admin.
2. Checks about 68 screens, every run, at phone size (390), one rotating phone size (320, 375 or 430) and desktop.
3. Flags any of these:
   - crashes, blank screens or "This screen hit a snag";
   - server errors;
   - unexpected sign-outs;
   - pages that scroll sideways on a phone;
   - buttons that are cut off, covered or too small;
   - pages with no Back button, or a Back button that does nothing.
4. Taps the safe buttons on a third of the pages each run, so every page gets tapped every 6 hours. It flags any button that does nothing.
5. Runs the key flows:
   - invoice → View → Download PDF is visible on screen;
   - Pay shows only on an invoice that's actually payable;
   - drafts stay hidden;
   - an estimate shows Accept/Decline;
   - Request Service → Send Request is visible on screen;
   - the technician's job opens with its buttons.

**On the server (Render)**

1. Runs a job walkthrough through the real app:
   - the office books a job;
   - the technician sees it, clocks in and starts it;
   - the technician uploads a photo, and the bot checks the photo saved and is intact;
   - the technician finishes the job and clocks out with a proof photo;
   - the office closes the job;
   - the bot checks no invoice was created, the customer sees the job, and the photo is still there after closing.
2. Opens every portal's data as each role, and checks each role is blocked from pages it shouldn't reach.
3. Runs the security / hacker scan:
   - protected areas refuse logged-out visitors;
   - fake, expired and tampered logins are rejected;
   - failed sign-ins and password guessing (by IP and account), lockouts and wrong 2-step codes;
   - hacker probes such as `/.env`, `wp-admin` and SQL injection;
   - request bursts and server crashes;
   - new admin or office accounts, or role changes;
   - secret strength and website security headers.
4. Cleans up everything it made and proves nothing was left behind.

**Safety:** The bot uses its own test customer, jobs and logins. Your staff never see them. They never email, text or push anyone, and they never create invoices or points or touch inventory. The bot can't see or change any real customer, job, invoice, employee or message, even with its admin login. Its logins stop working the moment it cleans up. It never pays, sends or submits anything.

## Alerts

- If anything fails, every admin gets an **in-app alert and an email**: "Clarke Mechanical Bot: N problems need fixing". The email lists exactly what broke. You'll get it after every 2-hour check until the problem is fixed.
- If the whole app is down, the bot on the server can't run. In that case **GitHub emails you** that the "Clarke Mechanical Bot" workflow failed.
- See every result in the app under **Clarke Mechanical Bot**, the System Check page. You can also tap **Run sweep now** there at any time.

## One-time setup (about 3 minutes)

### 1. Deploy the code

```
~/Desktop/"Clarke Mechanical"/deploy.sh "2-hour health bot + security scan"
```

### 2. Make sure Render has a CRON_KEY

1. Go to Render → your **clarke-mechanical-inc** service → **Environment**.
2. If `CRON_KEY` is already there, copy its value.
3. If it isn't, add `CRON_KEY` with a long random value. You can generate one in Terminal with `openssl rand -hex 32`. Then save, and Render restarts automatically.

### 3. Give GitHub the same key

1. Go to GitHub → **Clarke-Mechanical-Inc** repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Set the name to `CRON_KEY` and paste the same value as on Render.

### 4. Run it once by hand

1. Go to GitHub → repo → **Actions** → **Clarke Mechanical Bot** → **Run workflow**.
2. Tick "all 5 screen sizes" for the first run.
3. It takes about 5 minutes. Then open the app → Clarke Mechanical Bot to see the full report. GitHub also shows a summary table on the run page.

After that it runs on its own every 2 hours.

## Good to know

- **GitHub minutes:** each run takes about 4–5 minutes, which is roughly 1,500–1,800 minutes a month.
  - Public repos: free.
  - Private repos on GitHub Free: the allowance is 2,000 minutes a month. Check **Settings → Billing** after the first week.
- **If `git push` is refused** with a message about "workflow scope", your GitHub login can't add workflow files yet. Run `gh auth refresh -s workflow`, or push once from GitHub Desktop.
- **Separate bot key (optional):** add `BOT_KEY` on Render *and* as a GitHub secret to use a different key for the browser checks than for the scheduler.
- **Backup timer:** if GitHub isn't set up yet, the server still runs its own sweep whenever none has run for about 2¼ hours (while it's awake).
- **Security headers:** the website now sends `nosniff`, frame and referrer protection headers. These come from `firebase.json` and go live with the next deploy.
