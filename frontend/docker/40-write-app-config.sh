#!/bin/sh
# Runs each time the container starts (nginx executes everything in /docker-entrypoint.d).
# It makes the backend URL a runtime setting: change VITE_API_BASE_URL and restart the
# container, with no rebuild of the UI.
set -eu

api_base_url="${VITE_API_BASE_URL:-http://localhost:8080}"

# Keep the value a plain string inside the generated JavaScript.
escaped=$(printf '%s' "$api_base_url" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = { apiBaseUrl: "$escaped" };
EOF

echo "UI will call the backend at: $api_base_url"
