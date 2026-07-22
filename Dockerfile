FROM node:22-slim AS frontend-builder

WORKDIR /app/frontend
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

FROM node:22-slim AS server

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/server.js server/
COPY server/src/ ./src/

COPY --from=frontend-builder /app/frontend/dist /app/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_DIR=/app/dist
ENV DB_PATH=/app/data/data.db

RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 3000

CMD ["node", "server.js"]
