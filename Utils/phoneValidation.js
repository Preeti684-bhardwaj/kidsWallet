// Phone validation utility
const phoneValidation = {
    countrySpecs: {
      // North America and Caribbean
      1: { pattern: /^\d{10}$/, name: "United States/Canada" },
  
      // European countries
      44: { pattern: /^\d{10}$/, name: "United Kingdom" },
      33: { pattern: /^\d{9}$/, name: "France" },
      49: { pattern: /^\d{10,11}$/, name: "Germany" },
      39: { pattern: /^\d{10}$/, name: "Italy" },
      34: { pattern: /^\d{9}$/, name: "Spain" },
  
      // Asia
      86: { pattern: /^\d{11}$/, name: "China" },
      91: { pattern: /^\d{10}$/, name: "India" },
      81: { pattern: /^\d{10}$/, name: "Japan" },
      82: { pattern: /^\d{9,10}$/, name: "South Korea" },
      65: { pattern: /^\d{8}$/, name: "Singapore" },
      66: { pattern: /^\d{9}$/, name: "Thailand" },
  
      // Middle East
      971: { pattern: /^\d{9}$/, name: "United Arab Emirates" },
      966: { pattern: /^\d{9}$/, name: "Saudi Arabia" },
  
      // Oceania
      61: { pattern: /^\d{9}$/, name: "Australia" },
      64: { pattern: /^\d{8,9}$/, name: "New Zealand" },
  
      // South America
      55: { pattern: /^\d{10,11}$/, name: "Brazil" },
      54: { pattern: /^\d{10}$/, name: "Argentina" },
  
      // Africa
      27: { pattern: /^\d{9}$/, name: "South Africa" },
      20: { pattern: /^\d{10}$/, name: "Egypt" },
    },
  
    cleanPhoneNumber(phoneNumber) {
      if (!phoneNumber) return null;
      return phoneNumber.replace(/\D/g, "");
    },
  
    cleanCountryCode(countryCode) {
      if (!countryCode) return null;
      return countryCode.replace(/\D/g, "");
    },
  
    validatePhone(countryCode, phone) {
      // If either is not provided, consider it optional
      if (!countryCode && !phone) {
        return { isValid: true, message: "Phone is optional" };
      }
  
      // If one is provided, both must be provided
      if (!countryCode || !phone) {
        return {
          isValid: false,
          message:
            "Both country code and phone number are required when providing phone information",
        };
      }
  
      const cleanedCode = this.cleanCountryCode(countryCode);
      const cleanedPhone = this.cleanPhoneNumber(phone);
      const specs = this.countrySpecs[cleanedCode];
  
      if (!specs) {
        return {
          isValid: false,
          message: `Unsupported country code: +${cleanedCode}`,
        };
      }
  
      if (!specs.pattern.test(cleanedPhone)) {
        return {
          isValid: false,
          message: `Invalid phone number format for ${
            specs.name
          } (+${cleanedCode}). Expected format: ${this.getExpectedFormat(
            cleanedCode
          )}`,
        };
      }
  
      return {
        isValid: true,
        cleanedPhone,
        cleanedCode,
        formattedPhone: this.formatPhoneNumber(cleanedCode, cleanedPhone),
      };
    },
  
    getExpectedFormat(countryCode) {
      const specs = this.countrySpecs[countryCode];
      if (!specs) return "Unknown format";
  
      const pattern = specs.pattern.toString();
      if (pattern.includes("10")) return "10 digits";
      if (pattern.includes("9")) return "9 digits";
      if (pattern.includes("8")) return "8 digits";
      if (pattern.includes("10,11")) return "10 or 11 digits";
      return "Unknown format";
    },
  
    formatPhoneNumber(countryCode, phoneNumber) {
      return `+${countryCode}${phoneNumber}`;
    },
  };
  module.exports = {
      phoneValidation // Export for use in other parts of the application
    };