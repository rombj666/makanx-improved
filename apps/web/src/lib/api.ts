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
  
  // Static maps from /public/maps - KEEP AS IS (relative to frontend root)
  if (path.startsWith('/maps/')) return path;

  // Backend uploads from /uploads - PREFIX WITH API ORIGIN
  if (path.startsWith('/uploads/')) {
    const baseUrl = API_ORIGIN;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  }
  
  // Default: assume it's backend URL if not caught above, OR handle other cases.
  // The user requirement said: "If startsWith("/uploads/"), prefix API_ORIGIN."
  // "If mapImageUrl startsWith("/maps/"), use it directly (do NOT prefix API_ORIGIN)."
  // "If it startsWith("http"), use directly."
  
  // What about other paths? Assuming backend for safety if it looks like an API asset.
  const baseUrl = API_ORIGIN;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
