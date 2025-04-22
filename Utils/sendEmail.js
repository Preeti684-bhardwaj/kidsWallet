const nodeMailer = require("nodemailer");

// -----------------Send email-----------------------------------
const sendEmail = async (options) => {
  try{
  const transporter = nodeMailer.createTransport({
    host: process.env.SMPT_HOST,
    port: process.env.SMPT_PORT,
    service: process.env.SMPT_SERVICE,
    secure: true,
    logger: false,
    debug: true,
    auth: {
      user: process.env.SMPT_MAIL,
      pass: process.env.SMPT_PASSWORD,
    },
    tls:{
        rejectUnauthorized: true
    }
  });

  const mailOptions = {
    from: process.env.SMPT_MAIL,
    to: options.email,
    subject: options.subject,
    html: options.html, // Change 'text' to 'html'
  };

  await transporter.sendMail(mailOptions);
}catch(err){
  console.log("message not sent" ,err);
}
};

module.exports = sendEmail;