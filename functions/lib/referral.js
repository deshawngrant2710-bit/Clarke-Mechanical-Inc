// Deterministic referral code from a user, e.g. "JANE-3F9A". Stable for a given
// user id, so a shared link/code always resolves back to the same referrer.
function referralCode(user) {
  const first = (user?.name || '').trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'FRIEND';
  const suffix = String(user?.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || '0000';
  return `${first}-${suffix}`;
}

module.exports = { referralCode };
