# Build from project root: docker compose build (or docker build -f server/Dockerfile .)
# Expects pre-built frontend (frontend/dist). From source: run "npm run build" in frontend first.
# When installed via npm, the package ships frontend/dist; no frontend source is included.
FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

COPY server/ .
COPY frontend/dist/ /frontend/dist/

EXPOSE 3000

CMD ["sh", "-c", "node db/wait.js && npm run init-db && npm start"]
