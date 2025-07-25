const nodeMailer = require("nodemailer");
require("dotenv").config();

const sendEmail = async (options) => {
  try {
    const transporter = nodeMailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT), 
      service: process.env.SMTP_SERVICE,
      secure: true,
      auth: {
        user: process.env.SMTP_MAIL,
        pass: process.env.SMTP_PASSWORD, // Use App Password here
      },
      tls: {
        rejectUnauthorized: true
      }
    });

    const mailOptions = {
      from: `"Kita" <${process.env.SMTP_MAIL}>`,
      to: options.email,
      subject: options.subject,
      html: options.html,
    };

    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully");
  } catch (err) {
    console.log("Message not sent:", err);
  }
};

module.exports = sendEmail;