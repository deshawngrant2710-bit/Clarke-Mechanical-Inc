# Deploy notes — Clarke Mechanical

## Deploy the website (frontend) to Firebase Hosting

Run from the project root on your Mac. The `VITE_API_URL=...` MUST be on the
same line as `npm run build` — without it the site builds but goes BLANK on
reload (it can't find the backend).

```
cd ~/Desktop/"Clarke Mechanical"/client
VITE_API_URL=https://clarke-mechanical-inc.onrender.com/api npm run build
cd ..
firebase deploy --only hosting
```

- Use `--only hosting`. Plain `firebase deploy` tries to deploy Cloud Functions,
  which demands the paid Blaze plan. We don't use Functions — the backend runs
  on Render. Hosting is free.

## Backend (API) lives on Render, not Firebase

- Service URL: https://clarke-mechanical-inc.onrender.com/api
  (render.yaml names it `clarke-mechanical-api`; confirm the real URL in the
  Render dashboard if data stops loading.)
- The Render backend redeploys when code is pushed to GitHub.

## If a git commit fails with "index.lock: File exists"

```
rm -f .git/index.lock
```

## Sanity check after deploying

- Reload the live site — it should not go blank.
- Log in as a technician: Inventory should NOT appear in the sidebar, and
  going to /inventory directly should bounce them away.
