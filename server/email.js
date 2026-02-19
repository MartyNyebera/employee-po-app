/**
 * Email notifications for admin approval flow.
 * Uses SMTP (e.g. Gmail, Outlook). Set SMTP_* in .env to enable.
 * If SMTP is not configured or Gmail rejects the password, falls back to
 * Ethereal (free fake SMTP) so you can still test the email flow.
 * Ethereal emails are viewable via a URL printed in the console.
 */
import nodemailer from 'nodemailer';

const APP_NAME = process.env.APP_NAME || 'Kimoel Tracking System';

/** Cached Ethereal transporter so we only create one account per server run */
let etherealTransporter = null;

async function getEtherealTransporter() {
  if (etherealTransporter) return etherealTransporter;
  try {
    const testAccount = await nodemailer.createTestAccount();
    etherealTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[Email] Using Ethereal test account:', testAccount.user);
    return etherealTransporter;
  } catch (err) {
    console.error('[Email] Failed to create Ethereal account:', err.message);
    return null;
  }
}

function createSmtpTransporter() {
  const host = (process.env.SMTP_HOST || '').toLowerCase();
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  // Gmail requires a 16-character App Password, not your normal account password
  if (host === 'smtp.gmail.com' && pass.length !== 16) {
    console.warn(
      '[Email] Gmail requires an App Password (16 characters), not your normal password. ' +
      'Create one at: https://myaccount.google.com/apppasswords\n' +
      '[Email] Falling back to Ethereal test email...'
    );
    return null;
  }
  // Use Gmail service preset for smtp.gmail.com (correct port/secure for App Passwords)
  if (host === 'smtp.gmail.com') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return nodemailer.createTransport({
    host,
    port: port ? parseInt(port, 10) : 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

async function getTransporter() {
  const smtp = createSmtpTransporter();
  if (smtp) return { transport: smtp, isEthereal: false };
  const ethereal = await getEtherealTransporter();
  if (ethereal) return { transport: ethereal, isEthereal: true };
  return null;
}

/** Comma-separated list of admin emails to notify when someone requests admin access */
function getAdminNotificationEmails() {
  const raw = process.env.ADMIN_NOTIFICATION_EMAILS || '';
  const fromEnv = raw.split(',').map((e) => e.trim()).filter(Boolean);
  const developer = process.env.SUPER_ADMIN_DEVELOPER_EMAIL;
  const owner = process.env.SUPER_ADMIN_OWNER_EMAIL;
  const combined = [...new Set([developer, owner, ...fromEnv].filter(Boolean))];
  return combined;
}

const fromAddress = process.env.SMTP_FROM || process.env.SUPER_ADMIN_DEVELOPER_EMAIL || 'noreply@kimoel.local';

/**
 * Send email. Resolves to true if sent, false if skipped (no SMTP/Ethereal). Rejects on send error.
 */
async function sendMail({ to, subject, text, html }) {
  const result = await getTransporter();
  if (!result) {
    console.log('[Email] No SMTP or Ethereal available. Skipping:', subject, 'to', to);
    return false;
  }
  const { transport, isEthereal } = result;
  const toStr = Array.isArray(to) ? to.join(', ') : to;
  try {
    console.log(`[Email] Sending${isEthereal ? ' (via Ethereal)' : ''}:`, subject, '->', toStr);
    const info = await transport.sendMail({
      from: `"${APP_NAME}" <${fromAddress}>`,
      to: toStr,
      subject,
      text: text || undefined,
      html: html || undefined,
    });
    console.log('[Email] Sent successfully to', toStr);
    if (isEthereal) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('[Email] ★ Preview URL (open in browser):', previewUrl);
    }
    return true;
  } catch (err) {
    const msg = err.message || String(err);
    const response = err.response || '';
    console.error('[Email] Send failed:', msg);
    if (response) console.error('[Email] Server response:', response);
    if (err.stack) console.error('[Email] Stack:', err.stack);
    throw err;
  }
}

/**
 * Notify super admins (CEO/Developer) that a new admin account has been requested.
 */
export async function sendEmailToAdminsNewRequest(applicantEmail, applicantName) {
  const to = getAdminNotificationEmails();
  if (to.length === 0) return false;
  const subject = `[${APP_NAME}] New admin account request – ${applicantName}`;
  const text = [
    `A new admin account has been requested.`,
    ``,
    `Applicant: ${applicantName}`,
    `Email: ${applicantEmail}`,
    ``,
    `Please sign in to the admin dashboard to approve or reject this request.`,
  ].join('\n');
  const html = `
    <p>A new admin account has been requested.</p>
    <p><strong>Applicant:</strong> ${applicantName}<br><strong>Email:</strong> ${applicantEmail}</p>
    <p>Please sign in to the admin dashboard to approve or reject this request.</p>
  `;
  return sendMail({ to, subject, text, html });
}

/**
 * Notify the applicant that their admin request was approved or rejected.
 */
export async function sendEmailToApplicant(applicantEmail, applicantName, decision) {
  const isApproved = decision === 'approved';
  const subject = `[${APP_NAME}] Your admin account request has been ${isApproved ? 'approved' : 'rejected'}`;
  const text = isApproved
    ? [
        `Hello ${applicantName},`,
        ``,
        `Your request for an admin account has been approved.`,
        `You can now sign in with your email and password.`,
        ``,
        `Thank you,`,
        APP_NAME,
      ].join('\n')
    : [
        `Hello ${applicantName},`,
        ``,
        `Your request for an admin account has been reviewed and was not approved at this time.`,
        `If you have questions, please contact the system administrator.`,
        ``,
        `Thank you,`,
        APP_NAME,
      ].join('\n');
  const html = isApproved
    ? `<p>Hello ${applicantName},</p><p>Your request for an admin account has been <strong>approved</strong>. You can now sign in with your email and password.</p><p>Thank you,<br>${APP_NAME}</p>`
    : `<p>Hello ${applicantName},</p><p>Your request for an admin account has been reviewed and was <strong>not approved</strong> at this time. If you have questions, please contact the system administrator.</p><p>Thank you,<br>${APP_NAME}</p>`;
  return sendMail({ to: applicantEmail, subject, text, html });
}
