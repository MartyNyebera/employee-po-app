// Simple in-memory auth (no database required)
import { signToken } from './auth.js';

const users = new Map([
  ['owner@kimoel.local', { 
    id: 'owner-1', 
    email: 'owner@kimoel.local', 
    password: 'ChangeMe123!', 
    name: 'Owner', 
    role: 'admin', 
    isSuperAdmin: true 
  }],
  ['developer@kimoel.local', { 
    id: 'dev-1', 
    email: 'developer@kimoel.local', 
    password: 'ChangeMe123!', 
    name: 'Developer', 
    role: 'admin', 
    isSuperAdmin: true 
  }],
  ['employee@kimoel.local', { 
    id: 'emp-1', 
    email: 'employee@kimoel.local', 
    password: 'password123', 
    name: 'Employee', 
    role: 'employee', 
    isSuperAdmin: false 
  }]
]);

export function simpleLogin(email, password) {
  const user = users.get(email.toLowerCase());
  
  if (!user) {
    throw new Error('Account not found');
  }
  
  if (user.password !== password) {
    throw new Error('Password incorrect');
  }
  
  const token = signToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
  });
  
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    }
  };
}
