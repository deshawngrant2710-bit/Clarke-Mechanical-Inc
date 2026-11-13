import axios from 'axios';

// Dev uses the Vite proxy ("/api"); production build uses the Render backend URL
// injected at build time via VITE_API_URL (e.g. https://clarke-mechanical-api.onrender.com/api).
// If VITE_API_URL is ever missing from a production build, fall back to the real
// backend — NOT "/api", which on the live site just returns the HTML page and
// breaks every screen.
const PROD_API = 'https://clarke-mechanical-inc.onrender.com/api';
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : PROD_API) });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => {
    // An HTML page is never valid API data (it means the request was misrouted).
    // Reject it so screens show their error/empty state instead of crashing.
    if (typeof res.data === 'string' && /^\s*<(!doctype|html)/i.test(res.data)) {
      const e = new Error('API returned an HTML page instead of data');
      e.response = { ...res, status: 502, data: { error: 'Server unreachable — please try again.' } };
      return Promise.reject(e);
    }
    return res;
  },
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Install the offline layer (caches reads + queues whitelisted tech mutations).
import { installOffline } from '../lib/offlineSync';
installOffline(api);

export default api;
