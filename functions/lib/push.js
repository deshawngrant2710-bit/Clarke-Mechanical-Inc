// Apple Push Notifications (APNs) sender using token-based auth (.p8 key).
// No-ops safely if the APNS_* env vars aren't set, so nothing breaks pre-setup.
//
// Required env vars (set on Render):
//   APNS_KEY         contents of your AuthKey_XXXX.p8 (keep the -----BEGIN...----- lines)
//   APNS_KEY_ID      the Key ID from Apple Developer → Keys
//   APNS_TEAM_ID     your Apple Developer Team ID
//   APNS_BUNDLE_ID   org.clarkemechanicalinc.app
//   APNS_PRODUCTION  "true" for App Store/TestFlight builds, "false" for dev builds run from Xcode

let apn = null;
let provider = null;

function getProvider() {
  if (provider) return provider;
  const key = process.env.APNS_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) return null;
  try {
    if (!apn) apn = require('@parse/node-apn');
    provider = new apn.Provider({
      token: { key: key.replace(/\\n/g, '\n'), keyId, teamId },
      production: process.env.APNS_PRODUCTION !== 'false',
    });
    return provider;
  } catch (e) {
    console.error('[push] provider init failed:', e.message);
    return null;
  }
}

function pushConfigured() {
  return !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

// tokens: array of APNs device-token strings. payload: { title, body, link, badge }
async function sendPush(tokens, { title, body, link, badge } = {}) {
  const p = getProvider();
  if (!p || !Array.isArray(tokens) || !tokens.length) return { sent: 0 };
  const note = new apn.Notification();
  note.alert = body ? { title, body } : title;
  note.topic = process.env.APNS_BUNDLE_ID || 'org.clarkemechanicalinc.app';
  note.sound = 'default';
  if (badge != null) note.badge = badge;
  note.payload = { link: link || null };
  note.pushType = 'alert';
  try {
    const res = await p.send(note, tokens);
    if (res.failed && res.failed.length) {
      console.error('[push] failures:', res.failed.map(f => `${(f.device || '').slice(0, 8)}:${f.status || f.error}`).join(', '));
    }
    return { sent: (res.sent || []).length, failed: res.failed || [] };
  } catch (e) {
    console.error('[push] send error:', e.message);
    return { sent: 0 };
  }
}

module.exports = { sendPush, pushConfigured };
