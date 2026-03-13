const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function buildApiUrl(path = '') {
  if (!path) {
    if (API_BASE_URL) {
      return API_BASE_URL;
    }
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  }

  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}
