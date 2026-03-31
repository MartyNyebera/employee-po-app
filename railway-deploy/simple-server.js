// Super simple login server - no database required
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Simple in-memory users (restored from original)
const users = [
  {
    id: 'owner-1',
    email: 'owner@kimoel.local',
    password: 'ChangeMe123!',
    name: 'Owner',
    role: 'admin',
    isSuperAdmin: true
  },
  {
    id: 'developer-1',
    email: 'developer@kimoel.local',
    password: 'ChangeMe123!',
    name: 'Developer',
    role: 'admin',
    isSuperAdmin: true
  },
  {
    id: 'employee-1',
    email: 'employee@kimoel.local',
    password: 'password123',
    name: 'Employee',
    role: 'employee',
    isSuperAdmin: false
  },
  {
    id: 'admin-1',
    email: 'admin@kimoel.local',
    password: 'admin123',
    name: 'Admin User',
    role: 'admin',
    isSuperAdmin: true
  },
  {
    id: 'user-1',
    email: 'user@kimoel.local',
    password: 'user123',
    name: 'Regular User',
    role: 'employee',
    isSuperAdmin: false
  }
];

const JWT_SECRET = 'simple-secret-key';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// Simple login endpoint
app.post('/api/auth/login', (req, res) => {
  try {
    console.log('Login attempt:', req.body);
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = users.find(u => u.email === email.toLowerCase());
    
    if (!user) {
      return res.status(401).json({ error: 'Account not found' });
    }
    
    if (user.password !== password) {
      return res.status(401).json({ error: 'Password incorrect' });
    }
    
    // Create token
    const token = signToken({
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    });
    
    console.log('Login successful for:', email);
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSuperAdmin: user.isSuperAdmin,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simple auth middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Protected route example
app.get('/api/user', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Simple login server running' });
});

app.listen(PORT, () => {
  console.log(`Simple login server running at http://localhost:${PORT}`);
  console.log('Available users:');
  console.log('- owner@kimoel.local / ChangeMe123!');
  console.log('- developer@kimoel.local / ChangeMe123!');
  console.log('- employee@kimoel.local / password123');
  console.log('- admin@kimoel.local / admin123');
  console.log('- user@kimoel.local / user123');
});
