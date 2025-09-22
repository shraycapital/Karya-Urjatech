// Domain configuration for different environments
export const DOMAIN_CONFIG = {
  // Production custom domain
  production: {
    primary: 'https://karya.urja.tech',
    fallback: 'https://kartavya-58d2c.web.app',
    logo: '/images/urjatech-logo-optimized.png'
  },
  // Development
  development: {
    primary: 'http://localhost:5173',
    fallback: 'http://localhost:5173',
    logo: '/images/urjatech-logo-optimized.png'
  }
};

// Get current domain configuration
export const getCurrentDomainConfig = () => {
  const hostname = window.location.hostname;
  
  if (hostname === 'karya.urja.tech') {
    return DOMAIN_CONFIG.production;
  } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return DOMAIN_CONFIG.development;
  } else {
    // Firebase domain or other
    return DOMAIN_CONFIG.production;
  }
};

// Get primary domain for current environment
export const getPrimaryDomain = () => {
  return getCurrentDomainConfig().primary;
};

// Get logo path for current environment
export const getLogoPath = () => {
  return getCurrentDomainConfig().logo;
};
