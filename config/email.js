const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST,
  port:   Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.sendOTPEmail = async (to, name, otp, type) => {
  const subject = type === 'verify' ? 'Verify your LexNLand email' : 'Reset your LexNLand password';
  const text    = `Hi ${name},\n\nYour OTP is: ${otp}\n\nIt expires in 10 minutes.\n\n– LexNLand Team`;
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
};
