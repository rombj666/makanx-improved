import { expireVendorSession, getVendorSessionVersion, isVendorApi } from './vendorSession';
import axios from 'axios';

const rawBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
// Ensure API_URL always ends with /api
const API_URL = rawBaseUrl.endsWith('/api') ? rawBaseUrl : `${rawBaseUrl}/api`;

export const API_ORIGIN = API_URL.replace(/\/api$/, '');

export const api = axios.create({
  baseURL: API_URL,
  // Server-issued device identity travels in an HttpOnly cookie, so every
  // request must carry the browser credential cookie (and accept Set-Cookie).
  withCredentials: true,
  // DO NOT set default Content-Type to 'application/json' here.
  // Axios sets it automatically for JSON, and handles multipart for FormData.
  headers: {
    // 'Content-Type': 'application/json', // REMOVED
  },
});

api.interceptors.request.use((config) => {
  if (isVendorApi(config.url || '')) {
    (config as typeof config & { vendorSessionVersion?: number }).vendorSessionVersion = getVendorSessionVersion();
  }
  
  // Only set application/json if data is NOT FormData and not already set
  if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  
  // If FormData, explicitly UNSET Content-Type if it was set to application/json default
  if (config.data instanceof FormData && config.headers['Content-Type'] === 'application/json') {
    delete config.headers['Content-Type'];
  }
  
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && isVendorApi(error.config?.url || '')) {
      expireVendorSession(error.config?.vendorSessionVersion ?? getVendorSessionVersion());
    }
    return Promise.reject(error);
  }
);
