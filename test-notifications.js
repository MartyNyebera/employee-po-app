import jwt from 'jsonwebtoken';

async function testEmployeeNotifications() {
  try {
    // Create an employee token
    const employeeToken = jwt.sign(
      { id: 3, email: 'danielbagunas@gmail.com', role: 'employee', name: 'Daniel Bagunas' },
      process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production',
      { expiresIn: '7d' }
    );
    
    console.log('Created employee token');
    
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
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testEmployeeNotifications();
