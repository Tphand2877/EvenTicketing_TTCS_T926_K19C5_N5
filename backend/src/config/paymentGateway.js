const DEFAULT_MOMO_API_BASE_URL = 'https://test-payment.momo.vn';
const ALLOWED_MOMO_API_HOSTS = new Set(['test-payment.momo.vn', 'payment.momo.vn']);

const requireValue = (env, name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required payment gateway setting: ${name}.`);
  return value;
};

const parseUrl = (value, name, { allowHttp = false, originOnly = false } = {}) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid payment gateway URL setting: ${name}.`);
  }
  if (!['https:', ...(allowHttp ? ['http:'] : [])].includes(url.protocol)
    || url.username || url.password || url.search || url.hash
    || (originOnly && url.pathname !== '/')) {
    throw new Error(`Invalid payment gateway URL setting: ${name}.`);
  }
  return url;
};

const readMomoConfig = (env = process.env) => {
  // Staging uses NODE_ENV=production for Node optimizations but remains a
  // distinct deployment. Both public deployments require HTTPS callbacks.
  const requiresHttps = env.DEPLOY_ENV
    ? ['staging', 'production'].includes(env.DEPLOY_ENV)
    : env.NODE_ENV === 'production';
  const apiBaseValue = env.MOMO_API_BASE_URL?.trim() || DEFAULT_MOMO_API_BASE_URL;
  const apiBase = parseUrl(apiBaseValue, 'MOMO_API_BASE_URL', { originOnly: true });
  if (!ALLOWED_MOMO_API_HOSTS.has(apiBase.hostname)) {
    throw new Error('Invalid payment gateway URL setting: MOMO_API_BASE_URL.');
  }
  const apiBaseUrl = apiBase.origin;
  const redirectUrl = requireValue(env, 'MOMO_REDIRECT_URL');
  const ipnUrl = requireValue(env, 'MOMO_IPN_URL');
  parseUrl(redirectUrl, 'MOMO_REDIRECT_URL', { allowHttp: !requiresHttps });
  parseUrl(ipnUrl, 'MOMO_IPN_URL', { allowHttp: !requiresHttps });

  return {
    partnerCode: requireValue(env, 'MOMO_PARTNER_CODE'),
    accessKey: requireValue(env, 'MOMO_ACCESS_KEY'),
    secretKey: requireValue(env, 'MOMO_SECRET_KEY'),
    apiBaseUrl,
    redirectUrl,
    ipnUrl,
  };
};

module.exports = { ALLOWED_MOMO_API_HOSTS, DEFAULT_MOMO_API_BASE_URL, readMomoConfig };
