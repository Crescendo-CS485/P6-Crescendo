// API base URL — empty in local dev (Vite proxy handles /api/*),
// set to the API Gateway URL in production builds via .env.production
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";
