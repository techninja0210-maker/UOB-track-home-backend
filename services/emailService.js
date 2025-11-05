const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Configure email transporter
    // For production, use a real email service (SendGrid, AWS SES, etc.)
    // For development, you can use Gmail or Ethereal (test email service)
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || 'test@ethereal.email',
        pass: process.env.SMTP_PASS || 'test-password',
      },
    });

    this.fromEmail = process.env.FROM_EMAIL || 'noreply@uobsecurity.com';
    this.fromName = process.env.FROM_NAME || 'UOB Security House';
  }

  /**
   * Send email
   */
  async sendEmail({ to, subject, html, text }) {
    try {
      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to,
        subject,
        text,
        html,
        // Add headers to reduce spam score
        headers: {
          'X-Mailer': 'UOB Security House',
          'X-Priority': '1',
          'Importance': 'high',
        },
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log(`✅ Email sent successfully!`);
      console.log(`   To: ${to}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Message ID: ${info.messageId}`);
      
      if (process.env.NODE_ENV === 'development') {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          console.log(`📧 Email Preview URL: ${previewUrl}`);
          console.log(`   ⚠️  This is a test email service. In production, configure real SMTP settings.`);
        }
      }

      return { success: true, messageId: info.messageId, previewUrl: nodemailer.getTestMessageUrl(info) };
    } catch (error) {
      console.error('❌ Email send error:', error);
      console.error('   Error details:', error.message);
      if (error.response) {
        console.error('   SMTP Response:', error.response);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email, resetToken, userName) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Password Reset Request - UOB Security House</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .email-wrapper {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
          }
          .header { 
            background: linear-gradient(135deg, #FFD700, #B8860B); 
            padding: 40px 30px; 
            text-align: center; 
          }
          .header h1 { 
            color: #1A1A1A; 
            margin: 0;
            font-size: 24px;
            font-weight: bold;
          }
          .content { 
            padding: 40px 30px; 
          }
          .reset-link-box {
            background-color: #fff3cd;
            border: 2px solid #FFD700;
            border-radius: 8px;
            padding: 20px;
            margin: 30px 0;
            text-align: center;
          }
          .reset-link-box a {
            display: inline-block;
            padding: 15px 40px;
            background: linear-gradient(135deg, #FFD700, #B8860B);
            color: #1A1A1A;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            font-size: 16px;
            margin: 10px 0;
            transition: all 0.3s ease;
          }
          .reset-link-box a:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(255, 215, 0, 0.4);
          }
          .link-text {
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
            word-break: break-all;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            color: #0066cc;
            text-align: center;
          }
          .link-text a {
            color: #0066cc;
            text-decoration: underline;
          }
          .warning-box {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer { 
            text-align: center; 
            padding: 30px;
            background-color: #f8f9fa;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #dee2e6;
          }
          .expiry-notice {
            background-color: #d1ecf1;
            border-left: 4px solid #0c5460;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            font-weight: bold;
            color: #0c5460;
          }
          @media only screen and (max-width: 600px) {
            .content {
              padding: 20px 15px;
            }
            .header {
              padding: 30px 20px;
            }
            .reset-link-box a {
              padding: 12px 30px;
              font-size: 14px;
            }
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="header">
            <h1>🔒 Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi ${userName || 'there'},</p>
            <p>We received a request to reset your password for your <strong>UOB Security House</strong> account.</p>
            
            <div class="reset-link-box">
              <p style="margin: 0 0 15px 0; font-weight: bold; color: #1A1A1A;">Click the button below to reset your password:</p>
              <a href="${resetUrl}" style="color: #1A1A1A !important;">Reset My Password</a>
            </div>
            
            <div class="link-text">
              <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">Or copy and paste this link into your browser:</p>
              <a href="${resetUrl}" style="color: #0066cc !important; text-decoration: underline;">${resetUrl}</a>
            </div>
            
            <div class="expiry-notice">
              ⏰ This link will expire in 1 hour for security reasons.
            </div>
            
            <div class="warning-box">
              <p style="margin: 0; font-weight: bold;">⚠️ Security Notice:</p>
              <p style="margin: 5px 0 0 0;">If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
            </div>
            
            <p style="margin-top: 30px;">If you have any questions or concerns, please contact our support team.</p>
            
            <p style="margin-top: 20px;">
              Best regards,<br>
              <strong>UOB Security House Team</strong>
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">© ${new Date().getFullYear()} UOB Security House. All rights reserved.</p>
            <p style="margin: 10px 0 0 0;">This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
═══════════════════════════════════════════════════════════
PASSWORD RESET REQUEST - UOB SECURITY HOUSE
═══════════════════════════════════════════════════════════

Hi ${userName || 'there'},

We received a request to reset your password for your UOB Security House account.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESET YOUR PASSWORD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Click or copy this link into your browser to reset your password:

${resetUrl}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏰ IMPORTANT: This link will expire in 1 hour for security reasons.

⚠️ SECURITY NOTICE:
If you didn't request a password reset, please ignore this email.
Your password will remain unchanged.

If you have any questions or concerns, please contact our support team.

Best regards,
UOB Security House Team

───────────────────────────────────────────────────────────
© ${new Date().getFullYear()} UOB Security House. All rights reserved.
This is an automated email. Please do not reply to this message.
═══════════════════════════════════════════════════════════
    `;

    console.log(`📧 Sending password reset email to: ${email}`);
    console.log(`🔗 Reset URL: ${resetUrl}`);
    
    const result = await this.sendEmail({
      to: email,
      subject: 'Password Reset Request - UOB Security House',
      html,
      text,
    });

    if (result.success) {
      console.log(`✅ Password reset email sent successfully to ${email}`);
      console.log(`📧 Email preview available in development mode`);
    } else {
      console.error(`❌ Failed to send password reset email to ${email}:`, result.error);
    }

    return result;
  }

  /**
   * Send deposit confirmation email
   */
  async sendDepositConfirmation(email, userName, currency, amount, transactionHash) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4CAF50, #45a049); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .detail-box { background: white; padding: 15px; border-left: 4px solid #4CAF50; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Deposit Confirmed</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Your deposit has been successfully confirmed and credited to your account!</p>
            <div class="detail-box">
              <p><strong>Currency:</strong> ${currency}</p>
              <p><strong>Amount:</strong> ${amount} ${currency}</p>
              <p><strong>Transaction Hash:</strong><br><small style="word-break: break-all;">${transactionHash}</small></p>
              <p><strong>Status:</strong> <span style="color: #4CAF50;">✅ Confirmed</span></p>
            </div>
            <p>Your balance has been updated and is now available for trading.</p>
            <p>Best regards,<br>UOB Security House Team</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} UOB Security House. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `✅ ${currency} Deposit Confirmed - ${amount} ${currency}`,
      html,
    });
  }

  /**
   * Send withdrawal approval email
   */
  async sendWithdrawalApproval(email, userName, currency, amount, destinationAddress, transactionHash) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #2196F3, #1976D2); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .detail-box { background: white; padding: 15px; border-left: 4px solid #2196F3; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Withdrawal Approved</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Your withdrawal request has been approved and processed!</p>
            <div class="detail-box">
              <p><strong>Currency:</strong> ${currency}</p>
              <p><strong>Amount:</strong> ${amount} ${currency}</p>
              <p><strong>Destination:</strong><br><small style="word-break: break-all;">${destinationAddress}</small></p>
              <p><strong>Transaction Hash:</strong><br><small style="word-break: break-all;">${transactionHash}</small></p>
              <p><strong>Status:</strong> <span style="color: #4CAF50;">✅ Completed</span></p>
            </div>
            <p>Your funds have been sent to the destination address. Please check your external wallet.</p>
            <p>Best regards,<br>UOB Security House Team</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} UOB Security House. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `✅ ${currency} Withdrawal Approved - ${amount} ${currency}`,
      html,
    });
  }

  /**
   * Send withdrawal rejection email
   */
  async sendWithdrawalRejection(email, userName, currency, amount, reason) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f44336, #d32f2f); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .detail-box { background: white; padding: 15px; border-left: 4px solid #f44336; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ Withdrawal Rejected</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Unfortunately, your withdrawal request has been rejected.</p>
            <div class="detail-box">
              <p><strong>Currency:</strong> ${currency}</p>
              <p><strong>Amount:</strong> ${amount} ${currency}</p>
              <p><strong>Reason:</strong> ${reason}</p>
              <p><strong>Status:</strong> <span style="color: #f44336;">❌ Rejected</span></p>
            </div>
            <p>Your funds have been refunded to your account balance.</p>
            <p>If you have questions, please contact our support team.</p>
            <p>Best regards,<br>UOB Security House Team</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} UOB Security House. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `❌ ${currency} Withdrawal Rejected`,
      html,
    });
  }

  /**
   * Send gold purchase confirmation
   */
  async sendGoldPurchaseConfirmation(email, userName, goldGrams, cryptoCurrency, cryptoAmount, skrId) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #FFD700, #B8860B); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: #1A1A1A; margin: 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .detail-box { background: white; padding: 15px; border-left: 4px solid #FFD700; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏆 Gold Purchase Successful</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Congratulations! Your gold purchase has been completed successfully.</p>
            <div class="detail-box">
              <p><strong>Gold Amount:</strong> ${goldGrams} grams</p>
              <p><strong>Paid With:</strong> ${cryptoAmount} ${cryptoCurrency}</p>
              <p><strong>SKR ID:</strong> ${skrId}</p>
              <p><strong>Status:</strong> <span style="color: #4CAF50;">✅ Confirmed</span></p>
            </div>
            <p>Your Storage Keeping Receipt (SKR) has been generated and is now available in your account.</p>
            <p>You can view your SKR in the SKRs section of your dashboard.</p>
            <p>Best regards,<br>UOB Security House Team</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} UOB Security House. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `🏆 Gold Purchase Confirmed - ${goldGrams}g`,
      html,
    });
  }
}

module.exports = new EmailService();


