FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
COPY src ./src
COPY public ./public
COPY test ./test
USER node
EXPOSE 3000
CMD ["node", "server.js"]
