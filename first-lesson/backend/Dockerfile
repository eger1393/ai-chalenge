FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
RUN groupadd -g 1001 appgroup && useradd -u 1001 -g appgroup -m appuser
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/mcp-servers.json ./
RUN mkdir -p /app/.cache/huggingface && chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
CMD ["node", "dist/main"]
