// Jest mock for src/lib/api.ts
// import.meta.env is not available in Jest (Node/CommonJS), so we stub API_BASE as empty string.
// In tests, all fetch calls will use relative paths (/api/...) as in local dev.
module.exports = { API_BASE: "" };
