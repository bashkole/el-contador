# Build from project root: docker build -f server/Dockerfile .
FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

COPY server/ .
COPY admin/ /admin/

EXPOSE 3000

CMD ["sh", "-c", "node db/wait.js && npm run init-db && npm start"]
