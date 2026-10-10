FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY views ./views
COPY scripts ./scripts
COPY .env.example ./
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# Configuration comes from environment variables (docker run --env-file .env ...).
# For AUTH_MODE=local, mount users.json and set USERS_FILE to its path.
CMD ["node", "src/server.js"]
