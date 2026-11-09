// Runtime settings for the UI.
// In the Docker image this file is rewritten at container start from the VITE_API_BASE_URL
// environment variable. During "npm run dev" it stays empty and .env / the default is used.
window.__APP_CONFIG__ = {};
