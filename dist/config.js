window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.backendUrl = window.APP_CONFIG.backendUrl ?? (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'https://ajedrez-backend-7tdh.onrender.com');
