const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'clarke-mechanical-super-secret-key-2024';

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

const STAFF = ['admin', 'office', 'dispatcher', 'technician'];

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
