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
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to,
        subject,
        text,
        html,
      });

      console.log(`✅ Email sent: ${info.messageId}`);
      if (process.env.NODE_ENV === 'development') {
        console.log(`📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Email send error:', error);
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
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #FFD700, #B8860B); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: #1A1A1A; margin: 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 15px 30px; background: #FFD700; color: #1A1A1A; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>We received a request to reset your password for your UOB Security House account.</p>
            <p>Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
            <p>Best regards,<br>UOB Security House Team</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} UOB Security House. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Password Reset Request
      
      Hi ${userName},
      
      We received a request to reset your password for your UOB Security House account.
      
      Click this link to reset your password: ${resetUrl}
      
      This link will expire in 1 hour.
      
      If you didn't request a password reset, please ignore this email.
      
      Best regards,
      UOB Security House Team
    `;

    return this.sendEmail({
      to: email,
      subject: '🔒 Password Reset Request - UOB Security House',
      html,
      text,
    });
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


