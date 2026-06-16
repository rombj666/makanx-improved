import axios from 'axios';

const rawBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
// Ensure API_URL always ends with /api
const API_URL = rawBaseUrl.endsWith('/api') ? rawBaseUrl : `${rawBaseUrl}/api`;

export const API_ORIGIN = API_URL.replace(/\/api$/, '');

export const api = axios.create({
  baseURL: API_URL,
  // DO NOT set default Content-Type to 'application/json' here.
  // Axios sets it automatically for JSON, and handles multipart for FormData.
  headers: {
    // 'Content-Type': 'application/json', // REMOVED
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Optional: Redirect to login or dispatch auth event
      // window.location.href = '/login'; 
    }
    return Promise.reject(error);
  }
);

export const toAbsoluteUrl = (path: string | undefined | null) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  
  // Backend uploads from /uploads - PREFIX WITH API ORIGIN
  if (path.startsWith('/uploads/')) {
    const baseUrl = API_ORIGIN;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  }
  
  // Default: assume it's backend URL if not caught above, OR handle other cases.
  // The user requirement said: "If startsWith("/uploads/"), prefix API_ORIGIN."
  // "If it startsWith("http"), use directly."
  
  // What about other paths? Assuming backend for safety if it looks like an API asset.
  const baseUrl = API_ORIGIN;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
