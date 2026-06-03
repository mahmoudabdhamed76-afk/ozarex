FROM node:22-alpine

WORKDIR /app

COPY backend ./backend
COPY frontend ./frontend

RUN mkdir -p /app/data

# Railway provides PORT dynamically; Docker uses 8787 default
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8787}/api/health || exit 1

ENV NODE_ENV=production
CMD ["node", "backend/server.js"]
