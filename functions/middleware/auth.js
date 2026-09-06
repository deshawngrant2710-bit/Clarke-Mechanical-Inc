const jwt = require('jsonwebtoken');

// The key that signs every login token. It MUST come from the environment — there
// is deliberately no hardcoded fallback, because a fallback baked into the source
// (which lives in a public repo) would let anyone forge an admin token.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  // Crash on boot rather than run insecurely — a loud failure is far safer than a
  // silent hole. Set JWT_SECRET in the Render environment to a long random string.
  console.error('[FATAL] JWT_SECRET is not set (or is too short). Refusing to start. ' +
    'Set a long random JWT_SECRET in the environment.');
  process.exit(1);
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

const STAFF = ['admin', 'office', 'technician'];

// Allow only the given roles.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'You do not have access to this resource' });
    }
    next();
  };
}

// Any staff role (i.e., not a customer).
function requireStaff(req, res, next) {
  if (!STAFF.includes(req.user?.role)) {
    return res.status(403).json({ error: 'You do not have access to this resource' });
  }
  next();
}

module.exports = { authMiddleware, adminOnly, requireRole, requireStaff, STAFF, JWT_SECRET };
