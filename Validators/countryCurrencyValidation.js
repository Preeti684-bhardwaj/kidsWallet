// Currency to country mapping for validation (using country names)
const COUNTRY_CURRENCY_MAP = {
    'UNITED STATES': ['USD'],
    'USA': ['USD'],
    'AMERICA': ['USD'],
    'INDIA': ['INR'],
    'UNITED KINGDOM': ['GBP'],
    'UK': ['GBP'],
    'BRITAIN': ['GBP'],
    'ENGLAND': ['GBP'],
    'CANADA': ['CAD'],
    'AUSTRALIA': ['AUD'],
    'JAPAN': ['JPY'],
    'CHINA': ['CNY'],
    'GERMANY': ['EUR'],
    'FRANCE': ['EUR'],
    'ITALY': ['EUR'],
    'SPAIN': ['EUR'],
    'NETHERLANDS': ['EUR'],
    'BELGIUM': ['EUR'],
    'AUSTRIA': ['EUR'],
    'IRELAND': ['EUR'],
    'PORTUGAL': ['EUR'],
    'FINLAND': ['EUR'],
    'GREECE': ['EUR'],
    'LUXEMBOURG': ['EUR'],
    'MALTA': ['EUR'],
    'CYPRUS': ['EUR'],
    'SLOVAKIA': ['EUR'],
    'SLOVENIA': ['EUR'],
    'ESTONIA': ['EUR'],
    'LATVIA': ['EUR'],
    'LITHUANIA': ['EUR'],
    'BRAZIL': ['BRL'],
    'MEXICO': ['MXN'],
    'RUSSIA': ['RUB'],
    'SOUTH KOREA': ['KRW'],
    'KOREA': ['KRW'],
    'SINGAPORE': ['SGD'],
    'HONG KONG': ['HKD'],
    'SWITZERLAND': ['CHF'],
    'SWEDEN': ['SEK'],
    'NORWAY': ['NOK'],
    'DENMARK': ['DKK'],
    'POLAND': ['PLN'],
    'CZECH REPUBLIC': ['CZK'],
    'CZECHIA': ['CZK'],
    'HUNGARY': ['HUF'],
    'ROMANIA': ['RON'],
    'BULGARIA': ['BGN'],
    'CROATIA': ['HRK'],
    'TURKEY': ['TRY'],
    'SOUTH AFRICA': ['ZAR'],
    'NIGERIA': ['NGN'],
    'EGYPT': ['EGP'],
    'ISRAEL': ['ILS'],
    'UNITED ARAB EMIRATES': ['AED'],
    'UAE': ['AED'],
    'SAUDI ARABIA': ['SAR'],
    'QATAR': ['QAR'],
    'KUWAIT': ['KWD'],
    'BAHRAIN': ['BHD'],
    'OMAN': ['OMR'],
    'JORDAN': ['JOD'],
    'LEBANON': ['LBP'],
    'THAILAND': ['THB'],
    'MALAYSIA': ['MYR'],
    'INDONESIA': ['IDR'],
    'PHILIPPINES': ['PHP'],
    'VIETNAM': ['VND'],
    'BANGLADESH': ['BDT'],
    'PAKISTAN': ['PKR'],
    'SRI LANKA': ['LKR'],
    'NEW ZEALAND': ['NZD'],
    'ARGENTINA': ['ARS'],
    'CHILE': ['CLP'],
    'COLOMBIA': ['COP'],
    'PERU': ['PEN'],
    'URUGUAY': ['UYU'],
    'ECUADOR': ['USD'],
    'PANAMA': ['USD'],
    'EL SALVADOR': ['USD'],
    'ZIMBABWE': ['USD'], // Zimbabwe also uses USD
    'TIMOR-LESTE': ['USD'],
    'MARSHALL ISLANDS': ['USD'],
    'MICRONESIA': ['USD'],
    'PALAU': ['USD'],
    'BRITISH VIRGIN ISLANDS': ['USD'],
    'TURKS AND CAICOS': ['USD'],
    'MONTENEGRO': ['EUR'],
    'KOSOVO': ['EUR'],
    'ANDORRA': ['EUR'],
    'MONACO': ['EUR'],
    'SAN MARINO': ['EUR'],
    'VATICAN CITY': ['EUR']
  };
  
  // Helper function to validate currency against country
  const validateCurrencyCountry = (country, currency) => {
    if (!country || !currency) {
      return true; // Skip validation if either is not provided
    }
    
    const validCurrencies = COUNTRY_CURRENCY_MAP[country.toUpperCase()];
    if (!validCurrencies) {
      return false; // Country not supported
    }
    
    return validCurrencies.includes(currency.toUpperCase());
  };

  module.exports = {
    validateCurrencyCountry,
    COUNTRY_CURRENCY_MAP
  };