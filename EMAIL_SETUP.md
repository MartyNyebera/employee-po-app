# Email setup (admin notifications)

The app sends emails when someone requests an admin account and when you approve/reject them. It uses **Gmail SMTP** with your `.env` settings.

## Why "Username and Password not accepted"?

Gmail **does not accept your normal account password** for SMTP. You must use a **Gmail App Password** (16 characters).

Your current `SMTP_PASS` is not 16 characters, so Gmail rejects the login and no email is sent.

## Fix: create a Gmail App Password

1. Turn on **2-Step Verification** (required):  
   https://myaccount.google.com/security

2. Create an **App Password**:  
   https://myaccount.google.com/apppasswords  
   - Choose **Mail** and your device (or "Other" → type "Kimoel").
   - Click **Generate**.
   - Copy the **16-character** code (e.g. `abcd efgh ijkl mnop`).

3. In your **`.env`** file, set:
   ```env
   SMTP_PASS=abcdefghijklmnop
   ```
   Paste the 16-character code **with no spaces** (replace the example with your real code).

4. Restart the server and run the test:
   ```bash
   npm run test-email
   ```
   You should see "Test email sent. Check your inbox (and spam)."

5. If it works, submit an admin account request in the app; you and the other admin will receive the notification email.
