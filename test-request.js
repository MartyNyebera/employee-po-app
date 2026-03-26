// Test script to verify the material request flow
async function testMaterialRequest() {
  try {
    // 1. Login as existing approved employee
    const loginResponse = await fetch('http://localhost:3001/api/employee/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@employee.com',
        password: 'password123'
      })
    });

      if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('Employee logged in:', loginData);
      
      // 3. Submit a material request
      const requestResponse = await fetch('http://localhost:3001/api/material-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loginData.token}`
        },
        body: JSON.stringify({
          item_name: 'Test Item',
          item_code: 'TEST-001',
          quantity_requested: 5,
          unit: 'pcs',
          purpose: 'Testing the request flow',
          urgency: 'normal',
          employee_id: loginData.employee.id,
          employee_name: loginData.employee.full_name
        })
      });

      if (requestResponse.ok) {
        const requestData = await requestResponse.json();
        console.log('Material request submitted:', requestData);
      } else {
        console.error('Failed to submit request:', await requestResponse.text());
      }
    } else {
      console.error('Failed to login:', await loginResponse.text());
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Test the flow
testMaterialRequest();
