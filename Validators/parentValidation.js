const validator = require("validator");

const isValidEmail = email => validator.isEmail(email);

// const isValidPhone = (phone) => validator.isMobilePhone(phone, "en-IN");

const isValidPassword = (password) => {
  if (password.length < 8) {
    return "Password must be at least 8 characters long";
  }

  if (!/(?=.*[a-z])/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }

  if (!/(?=.*[A-Z])/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }

  if (!/(?=.*\d)/.test(password)) {
    return "Password must contain at least one number";
  }

  if (!/(?=.*[@$!%*?&.,:;<>^()[\]{}+_=|/~`#\\-])/.test(password)) {
    return "Password must contain at least one special character";
  }

  if (/\s/.test(password)) {
    return "Password must not contain any spaces";
  }

  // If all checks pass, the password is valid
  return null;
};
const isValidLength = (name) => {
  // const nameRegex = /^(?=.{4,40}$)[A-Za-z](?:\s?[A-Za-z]+)*[A-Za-z]$/;
  if (!name) {
    return "Name is required";
  }
  if (/^\s|\s$/.test(name)) {
    return "Name should not start or end with a space";
  }
  if (name.length < 4 || name.length > 40) {
    return "Name should be between 4 and 40 characters long";
  }
  if (/^[0-9]/.test(name)) {
    return "Name should not start with a number";
  }
  if (/\d/.test(name)) {
    return "Name should not contain numbers";
  }
  if (/[^a-zA-Z\s]/.test(name)) {
    return "Name should only contain letters and spaces";
  }
  if (/\s{2,}/.test(name)) {
    return "Name should not contain consecutive spaces";
  }
  // if (!nameRegex.test(name)) {
  //   return "Name contains invalid characters";
  // }
  return null;  // No errors
};

const detectOS = (userAgent) => {
  if (!userAgent) return 'Unknown';
  
  if (userAgent.includes('Windows')) {
    return 'Windows';
  } else if (userAgent.includes('Mac OS')) {
    return 'MacOS';
  } else if (userAgent.includes('Linux')) {
    return 'Linux';
  } else if (userAgent.includes('Android') ||userAgent.includes('okhttp')) {
    return 'Android';
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iPod') || userAgent.includes('iPad Simulator') || userAgent.includes('iPhone Simulator') || userAgent.includes('iPod Simulator') || userAgent.includes('CFNetwork') || userAgent.includes('Darwin')) {
    return 'IOS';
  }
  return 'Unknown';
};

module.exports = {
    isValidEmail,
    isValidPassword,
    isValidLength,
    detectOS
  };