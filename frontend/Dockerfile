# syntax=docker/dockerfile:1

# ---- dependencies: cached until package.json / package-lock.json change ------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- test: used by docker-compose.test.yml, not part of the runtime image -----
FROM deps AS test
COPY . .
CMD ["npm", "run", "test"]

# ---- build the static site ---------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run build

# ---- runtime: nginx serving the built files ----------------------------------
FROM nginx:1.27-alpine AS final
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# Runs at container start and writes the backend URL from VITE_API_BASE_URL into /config.js.
COPY docker/40-write-app-config.sh /docker-entrypoint.d/40-write-app-config.sh
RUN chmod +x /docker-entrypoint.d/40-write-app-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
