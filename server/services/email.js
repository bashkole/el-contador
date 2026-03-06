const nodemailer = require('nodemailer');

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('SMTP configuration is missing. Cannot send email.');
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

async function sendApprovalNotification(email, expense) {
  const transporter = createTransporter();
  if (!transporter) return;

  const { SMTP_FROM } = process.env;
  const from = SMTP_FROM || '"El Contador" <noreply@elcontador.com>';

  const subject = `Action Required: Expense Approval Needed for ${expense.vendor}`;
  
  const text = `
Hello,

An expense requires your approval.

Details:
- Vendor: ${expense.vendor}
- Date: ${new Date(expense.date).toLocaleDateString()}
- Category: ${expense.category || 'N/A'}
- Amount: ${expense.amount}

Please log in to El Contador to approve or reject this expense.

Thank you.
  `.trim();

  const html = `
<p>Hello,</p>
<p>An expense requires your approval.</p>
<h3>Details:</h3>
<ul>
  <li><strong>Vendor:</strong> ${expense.vendor}</li>
  <li><strong>Date:</strong> ${new Date(expense.date).toLocaleDateString()}</li>
  <li><strong>Category:</strong> ${expense.category || 'N/A'}</li>
  <li><strong>Amount:</strong> ${expense.amount}</li>
</ul>
<p>Please log in to El Contador to approve or reject this expense.</p>
<p>Thank you.</p>
  `.trim();

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject,
      text,
      html,
    });
    console.log(`Approval notification sent to ${email} for expense ${expense.id || 'unknown'}`);
  } catch (error) {
    console.error('Error sending approval notification email:', error);
  }
}

module.exports = {
  sendApprovalNotification,
};
