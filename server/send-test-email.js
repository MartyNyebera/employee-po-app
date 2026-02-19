/**
 * Run: node server/send-test-email.js
 * Sends one test email to the first admin and prints success or the exact error.
 * Make sure .env has SMTP_HOST, SMTP_USER, SMTP_PASS set.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { sendEmailToAdminsNewRequest } = await import('./email.js');

console.log('SMTP_HOST:', process.env.SMTP_HOST ? 'set' : 'MISSING');
console.log('SMTP_USER:', process.env.SMTP_USER ? process.env.SMTP_USER : 'MISSING');
console.log('SMTP_PASS:', process.env.SMTP_PASS ? `${process.env.SMTP_PASS.length} chars` : 'MISSING');
console.log('');

try {
  await sendEmailToAdminsNewRequest('test@example.com', 'Test Applicant');
  console.log('Test email sent. Check your inbox (and spam).');
} catch (err) {
  console.error('Test email FAILED:');
  console.error('Message:', err.message);
  if (err.response) console.error('Response:', err.response);
  if (err.responseCode) console.error('Code:', err.responseCode);
  if (err.stack) console.error(err.stack);
  process.exit(1);
}
