import { query } from './server/db.js';
import jwt from 'jsonwebtoken';

async function testApprovalWithAuth() {
  try {
    // Create a test admin token
    const adminToken = jwt.sign(
      { id: 1, email: 'admin@test.com', role: 'admin', name: 'Test Admin' },
      process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production',
      { expiresIn: '7d' }
    );
    
    console.log('Created admin token');
    
    // Get pending requests
    const pendingResult = await query('SELECT * FROM material_requests WHERE status = $1 LIMIT 1', ['pending']);
    console.log('Pending requests:', pendingResult.rows.length);
    
    if (pendingResult.rows.length > 0) {
      const request = pendingResult.rows[0];
      console.log('Testing approval for request:', request.id);
      
      // Test the approval API with proper auth
      const response = await fetch('http://localhost:3001/api/material-requests/' + request.id + '/review', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminToken
        },
        body: JSON.stringify({
          status: 'approved',
          admin_notes: 'Test approval from script',
          reviewed_by: 1
        })
      });
      
      console.log('Response status:', response.status);
      const result = await response.text();
      console.log('Response body:', result);
      
      if (response.ok) {
        // Check if notification was created
        const notifResult = await query(
          'SELECT * FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 1',
          [request.employee_id]
        );
        console.log('Created notification:', notifResult.rows[0]);
      }
    } else {
      console.log('No pending requests found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testApprovalWithAuth();
