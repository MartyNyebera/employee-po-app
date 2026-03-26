import { query } from './server/db.js';
import jwt from 'jsonwebtoken';

async function testCompleteFlow() {
  try {
    console.log('=== Testing Complete Material Request Flow ===');
    
    // Step 1: Check pending requests
    const pendingResult = await query('SELECT * FROM material_requests WHERE status = $1', ['pending']);
    console.log('Pending requests:', pendingResult.rows.length);
    
    if (pendingResult.rows.length > 0) {
      const request = pendingResult.rows[0];
      console.log('Found request:', request.id, request.item_name);
      
      // Step 2: Admin approval
      const adminToken = jwt.sign(
        { id: 1, email: 'admin@test.com', role: 'admin', name: 'Test Admin' },
        process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production',
        { expiresIn: '7d' }
      );
      
      console.log('Approving request...');
      const approvalResponse = await fetch('http://localhost:3001/api/material-requests/' + request.id + '/review', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminToken
        },
        body: JSON.stringify({
          status: 'approved',
          admin_notes: 'Approved via test script',
          reviewed_by: 1
        })
      });
      
      if (approvalResponse.ok) {
        console.log('✅ Request approved successfully');
        
        // Step 3: Check notification was created
        const notifResult = await query(
          'SELECT * FROM notifications WHERE recipient_id = $1 AND type = $2',
          [request.employee_id, 'success']
        );
        console.log('✅ Notifications created:', notifResult.rows.length);
        
        // Step 4: Test employee can fetch notifications
        const employeeToken = jwt.sign(
          { id: request.employee_id, email: 'danielbagunas@gmail.com', role: 'employee', name: 'Daniel Bagunas' },
          process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production',
          { expiresIn: '7d' }
        );
        
        const notifResponse = await fetch(`http://localhost:3001/api/employee/${request.employee_id}/notifications`, {
          headers: {
            'Authorization': 'Bearer ' + employeeToken
          }
        });
        
        if (notifResponse.ok) {
          const notifications = await notifResponse.json();
          console.log('✅ Employee can fetch notifications:', notifications.length);
          console.log('Latest notification:', notifications[0]?.title);
        } else {
          console.log('❌ Employee cannot fetch notifications');
        }
        
        // Step 5: Test employee can fetch their requests
        const requestsResponse = await fetch(`http://localhost:3001/api/material-requests/employee/${request.employee_id}`, {
          headers: {
            'Authorization': 'Bearer ' + employeeToken
          }
        });
        
        if (requestsResponse.ok) {
          const requests = await requestsResponse.json();
          console.log('✅ Employee can fetch requests:', requests.length);
          const updatedRequest = requests.find((r) => r.id === request.id);
          console.log('Request status:', updatedRequest?.status);
        } else {
          console.log('❌ Employee cannot fetch requests');
        }
        
      } else {
        console.log('❌ Approval failed');
      }
    } else {
      console.log('❌ No pending requests found');
    }
    
    console.log('=== Test Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testCompleteFlow();
