#!/bin/bash
# One-command deploy for Clarke Mechanical.
#   Usage:  ~/Desktop/"Clarke Mechanical"/deploy.sh "what changed"
# Saves the code to GitHub (Render updates the server automatically), rebuilds
# and uploads the website to Firebase, and syncs the new build into the iOS app.
set -e
cd "$(dirname "$0")"
MSG="${1:-Update}"

echo "▶ 1/3  Saving code to GitHub (Render redeploys the server)…"
git add -A
git commit -m "$MSG" || echo "   (nothing new to commit)"
git push

echo "▶ 2/3  Building and uploading the website…"
cd client
npm run build
firebase deploy --only hosting

echo "▶ 3/3  Syncing the new build into the iOS app…"
npx cap sync ios

echo ""
echo "✅ Done. Website is live (Cmd+Shift+R in Safari to see it)."
echo "   Server updates on Render in ~2 minutes. For the App Store, archive in Xcode."
