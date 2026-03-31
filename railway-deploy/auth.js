import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production';
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
    // If no database, allow mock authentication for testing
    if (!process.env.DATABASE_URL) {
      req.user = {
        userId: 'mock-user-id',
        role: 'admin', // Default to admin for testing
        email: 'mock@admin.com',
        name: 'Mock Admin',
        isSuperAdmin: true
      };
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = payload;
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
