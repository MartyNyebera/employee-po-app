import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from './db.js';

// Never fall back to a publicly-known secret in production. If JWT_SECRET is unset
// there, use a random per-process secret so tokens cannot be forged (they won't
// survive a restart until JWT_SECRET is configured). Dev keeps a stable fallback.
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    console.error('⚠️  JWT_SECRET is not set in production — using a random per-process secret. ' +
      'Set JWT_SECRET in the environment to keep sessions stable across restarts.');
    return crypto.randomBytes(48).toString('hex');
  }
  return 'fleet-manager-dev-secret-not-for-production';
}
const JWT_SECRET = resolveJwtSecret();
const SALT_ROUNDS = 10;

// Log JWT_SECRET presence on startup (safe - no value logged)
console.log(`🔐 JWT_SECRET present: ${!!process.env.JWT_SECRET}`);

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  
  
  if (!payload) {
    // Mock auth for local testing only when there is no database — NEVER in
    // production, where this would grant super-admin to every anonymous request.
    if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
      req.user = {
        userId: 'mock-user-id',
        id: 'mock-user-id', // carries both, like a real token does after normalisation below
        role: 'admin', // Default to admin for testing
        email: 'mock@admin.com',
        name: 'Mock Admin',
        isSuperAdmin: true
      };
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Normalise the id claim. The admin/staff login signs `userId`; all six portal logins sign
  // `id` — and every shared route reads `req.user.id`. So for an admin it was `undefined`,
  // which node-postgres turns into NULL: `WHERE id = NULL` matches nothing and every
  // `*_by_id` write stored NULL, all without raising a single error. That is why the admin's
  // signature silently refused to save, and why the admin's signature could never resolve on
  // a printed document. Fixing it here rather than at each of the 19 call sites also means
  // tokens already issued keep working — no forced re-login.
  req.user = { ...payload, id: payload.id ?? payload.userId };
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin only' });
  }
  next();
}

// Effective role for the role-based dashboards: a super admin is treated as "owner",
// otherwise the stored role ('admin' | 'bookkeeper' | 'purchasing' | 'employee').
export function effectiveRole(user) {
  if (!user) return null;
  if (user.isSuperAdmin) return 'owner';
  return user.role || null;
}

// Gate a route to a set of effective roles, e.g. requireRole(['owner','admin','purchasing']).
// 'admin' in the allow-list always also admits the owner (super admin).
export function requireRole(allowed) {
  const allow = new Set(allowed);
  if (allow.has('admin')) allow.add('owner'); // owner can do anything an admin can
  return function (req, res, next) {
    const role = effectiveRole(req.user);
    if (role && allow.has(role)) return next();
    return res.status(403).json({ error: 'Forbidden', requiredRole: allowed });
  };
}
