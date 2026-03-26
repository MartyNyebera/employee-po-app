import jwt from 'jsonwebtoken';
import { verifyToken } from './server/auth.js';

async function debugAuth() {
  try {
    // Create an employee token
    const employeeToken = jwt.sign(
      { id: 3, email: 'danielbagunas@gmail.com', role: 'employee', name: 'Daniel Bagunas' },
      process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production',
      { expiresIn: '7d' }
    );
    
    console.log('Token created:', employeeToken);
    
    // Test token verification
    const payload = verifyToken(employeeToken);
    console.log('Verified payload:', payload);
    
    if (payload) {
      // Test the notifications API
      const response = await fetch('http://localhost:3001/api/employee/3/notifications', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + employeeToken
        }
      });
      
      console.log('Response status:', response.status);
      const result = await response.text();
      console.log('Response body:', result);
    } else {
      console.log('Token verification failed');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugAuth();
