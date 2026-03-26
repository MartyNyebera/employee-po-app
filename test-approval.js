import { query } from './server/db.js';

async function testApproval() {
  try {
    // Get pending requests
    const pendingResult = await query('SELECT * FROM material_requests WHERE status = $1 LIMIT 1', ['pending']);
    console.log('Pending requests:', pendingResult.rows);
    
    if (pendingResult.rows.length > 0) {
      const request = pendingResult.rows[0];
      console.log('Testing approval for request:', request.id);
      
      // Test the approval API
      const response = await fetch('http://localhost:3001/api/material-requests/' + request.id + '/review', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token' // This will fail but let's see the error
        },
        body: JSON.stringify({
          status: 'approved',
          admin_notes: 'Test approval',
          reviewed_by: 'Test Admin'
        })
      });
      
      console.log('Response status:', response.status);
      const result = await response.text();
      console.log('Response body:', result);
    } else {
      console.log('No pending requests found');
    }
    
    // Check notifications
    const notifResult = await query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5');
    console.log('Recent notifications:', notifResult.rows);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testApproval();
