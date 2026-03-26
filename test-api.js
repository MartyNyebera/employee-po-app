// Test API call to material requests
fetch('/api/material-requests')
  .then(response => response.json())
  .then(data => {
    console.log('API Response:', data);
    console.log('Type:', typeof data);
    console.log('Is Array:', Array.isArray(data));
  })
  .catch(error => {
    console.error('Error:', error);
  });
