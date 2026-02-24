#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== FRONTEND BUILD VERIFICATION ===');
console.log('Build completed, checking all possible frontend paths...');

const possiblePaths = [
  'client/dist',
  'frontend/dist', 
  'dist',
  'client/build',
  'frontend/build',
  'build'
];

let foundPath = null;

for (const checkPath of possiblePaths) {
  const indexPath = path.join(checkPath, 'index.html');
  console.log(`Checking: ${indexPath}`);
  
  if (fs.existsSync(indexPath)) {
    foundPath = checkPath;
    console.log(`✅ Frontend build successful! Found index.html in ${checkPath}/`);
    break;
  }
}

if (!foundPath) {
  console.error('❌ ERROR: No index.html found in any frontend path!');
  console.error('Searched paths:', possiblePaths);
  console.error('Make sure "npm run build" completed successfully.');
  process.exit(1);
}

console.log('🎉 Frontend verification complete - ready for deployment!');
process.exit(0);
