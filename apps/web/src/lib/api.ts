import axios from 'axios';

const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
// Ensure API_URL always ends with /api
const API_URL = envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`;

export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || API_URL.replace(/\/api$/, '');

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
  
  // Use API_ORIGIN which is either explicitly set or derived
  const baseUrl = API_ORIGIN;
  
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseUrl}${cleanPath}`;
};
