# Build from project root: docker compose build (or docker build -f server/Dockerfile .)
# When installed via npm, the package includes the full frontend/ so we build it here.
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

COPY server/ .
COPY --from=frontend-builder /app/frontend/dist/ /frontend/dist/

EXPOSE 3000

CMD ["sh", "-c", "node db/wait.js && npm run init-db && npm start"]
