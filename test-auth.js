// Test the authenticated API call
fetch('/api/material-requests')
  .then(response => response.json())
  .then(data => {
    console.log('Authenticated API Response:', data);
    console.log('Type:', typeof data);
    console.log('Is Array:', Array.isArray(data));
  })
  .catch(error => {
    console.error('Error:', error);
  });
