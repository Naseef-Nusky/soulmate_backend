const EXCHANGE_RATES = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.0,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 149.0,
  CNY: 7.24,
  AED: 3.67,
  SAR: 3.75,
  SGD: 1.34,
  MYR: 4.71,
  THB: 35.8,
  IDR: 15700,
  PHP: 55.5,
  VND: 24500,
  KRW: 1320,
  NZD: 1.66,
  CHF: 0.88,
  SEK: 10.7,
  NOK: 10.8,
  DKK: 6.87,
  PLN: 4.0,
  HUF: 360,
  CZK: 22.5,
  RON: 4.58,
  BGN: 1.80,
  HRK: 6.95,
  TRY: 32.0,
  ZAR: 18.5,
  BRL: 4.95,
  MXN: 17.0,
  ARS: 350,
  CLP: 920,
  COP: 4100,
  PEN: 3.70,
  LKR: 305.0,
};

const CURRENCY_INFO = {
  USD: { symbol: '$', code: 'USD', name: 'US Dollar' },
  EUR: { symbol: '€', code: 'EUR', name: 'Euro' },
  GBP: { symbol: '£', code: 'GBP', name: 'British Pound' },
  INR: { symbol: '₹', code: 'INR', name: 'Indian Rupee' },
  CAD: { symbol: 'C$', code: 'CAD', name: 'Canadian Dollar' },
  AUD: { symbol: 'A$', code: 'AUD', name: 'Australian Dollar' },
  JPY: { symbol: '¥', code: 'JPY', name: 'Japanese Yen' },
  CNY: { symbol: '¥', code: 'CNY', name: 'Chinese Yuan' },
  AED: { symbol: 'د.إ', code: 'AED', name: 'UAE Dirham' },
  SAR: { symbol: 'ر.س', code: 'SAR', name: 'Saudi Riyal' },
  SGD: { symbol: 'S$', code: 'SGD', name: 'Singapore Dollar' },
  MYR: { symbol: 'RM', code: 'MYR', name: 'Malaysian Ringgit' },
  THB: { symbol: '฿', code: 'THB', name: 'Thai Baht' },
  IDR: { symbol: 'Rp', code: 'IDR', name: 'Indonesian Rupiah' },
  PHP: { symbol: '₱', code: 'PHP', name: 'Philippine Peso' },
  VND: { symbol: '₫', code: 'VND', name: 'Vietnamese Dong' },
  KRW: { symbol: '₩', code: 'KRW', name: 'South Korean Won' },
  NZD: { symbol: 'NZ$', code: 'NZD', name: 'New Zealand Dollar' },
  CHF: { symbol: 'CHF', code: 'CHF', name: 'Swiss Franc' },
  SEK: { symbol: 'kr', code: 'SEK', name: 'Swedish Krona' },
  NOK: { symbol: 'kr', code: 'NOK', name: 'Norwegian Krone' },
  DKK: { symbol: 'kr', code: 'DKK', name: 'Danish Krone' },
  PLN: { symbol: 'zł', code: 'PLN', name: 'Polish Zloty' },
  HUF: { symbol: 'Ft', code: 'HUF', name: 'Hungarian Forint' },
  CZK: { symbol: 'Kč', code: 'CZK', name: 'Czech Koruna' },
  RON: { symbol: 'lei', code: 'RON', name: 'Romanian Leu' },
  BGN: { symbol: 'лв', code: 'BGN', name: 'Bulgarian Lev' },
  HRK: { symbol: 'kn', code: 'HRK', name: 'Croatian Kuna' },
  TRY: { symbol: '₺', code: 'TRY', name: 'Turkish Lira' },
  ZAR: { symbol: 'R', code: 'ZAR', name: 'South African Rand' },
  BRL: { symbol: 'R$', code: 'BRL', name: 'Brazilian Real' },
  MXN: { symbol: '$', code: 'MXN', name: 'Mexican Peso' },
  ARS: { symbol: '$', code: 'ARS', name: 'Argentine Peso' },
  CLP: { symbol: '$', code: 'CLP', name: 'Chilean Peso' },
  COP: { symbol: '$', code: 'COP', name: 'Colombian Peso' },
  PEN: { symbol: 'S/', code: 'PEN', name: 'Peruvian Sol' },
  LKR: { symbol: 'Rs', code: 'LKR', name: 'Sri Lankan Rupee' },
};

const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'COP'];

const BASE_CURRENCY = 'GBP';
const BASE_TRIAL_PRICE = 1.0;
const BASE_MONTHLY_PRICE = 29.99;
const BASE_TOTAL_PRICE = 15.0;

const formatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAmount(amount, currency) {
  const info = CURRENCY_INFO[currency] || CURRENCY_INFO.USD;
  const decimals = ZERO_DECIMAL_CURRENCIES.includes(currency) ? 0 : 2;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals));
  return `${info.symbol}${formatted}`;
}

function convertPrice(baseAmount, targetCurrency) {
  const targetRate = EXCHANGE_RATES[targetCurrency] || EXCHANGE_RATES.USD;
  const baseRate = EXCHANGE_RATES[BASE_CURRENCY] || 1;
  return baseAmount * (targetRate / baseRate);
}

export function getPricing(currencyCode = 'USD') {
  const currency = currencyCode?.toUpperCase() || 'USD';

  const trialAmount = convertPrice(BASE_TRIAL_PRICE, currency);
  const monthlyAmount = convertPrice(BASE_MONTHLY_PRICE, currency);
  const totalAmount = convertPrice(BASE_TOTAL_PRICE, currency);

  return {
    currency,
    symbol: CURRENCY_INFO[currency]?.symbol || '$',
    decimals: ZERO_DECIMAL_CURRENCIES.includes(currency) ? 0 : 2,
    trial: {
      amount: trialAmount,
      formatted: formatAmount(trialAmount, currency),
    },
    monthly: {
      amount: monthlyAmount,
      formatted: formatAmount(monthlyAmount, currency),
    },
    total: {
      amount: totalAmount,
      formatted: formatAmount(totalAmount, currency),
    },
  };
}

export function toMinorUnit(amount, currency) {
  const decimals = ZERO_DECIMAL_CURRENCIES.includes(currency?.toUpperCase()) ? 0 : 2;
  return Math.round(amount * Math.pow(10, decimals));
}

export function isZeroDecimal(currency) {
  return ZERO_DECIMAL_CURRENCIES.includes(currency?.toUpperCase());
}

export function getCurrencySymbol(currency) {
  return CURRENCY_INFO[currency?.toUpperCase()]?.symbol || '$';
}


