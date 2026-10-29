# Build context is the repo root (see docker-compose.yml): the server serves ../frontend
FROM node:22-alpine
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY backend/server.js ./
COPY backend/src ./src
COPY backend/test ./test
COPY frontend /app/frontend
USER node
EXPOSE 3000
CMD ["node", "server.js"]
