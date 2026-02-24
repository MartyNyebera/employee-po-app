const fs = require("fs");
const path = require("path");

const root = process.cwd();
const candidates = [
  "client/dist",
  "frontend/dist",
  "dist",
  "client/build",
  "frontend/build",
  "build",
].map((p) => path.join(root, p));

console.log("=== FRONTEND BUILD VERIFICATION ===");
console.log("CWD:", root);
console.log("Checking for index.html in:");

let found = null;

for (const dir of candidates) {
  const indexPath = path.join(dir, "index.html");
  console.log("-", indexPath);
  if (fs.existsSync(indexPath)) {
    found = dir;
    break;
  }
}

if (!found) {
  console.error("❌ Frontend not built. index.html not found in any candidate folder.");
  console.error("Searched:", candidates);
  process.exit(1);
}

console.log("✅ Frontend build OK. Found index.html in:", found);
process.exit(0);
