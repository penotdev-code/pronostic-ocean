FROM node:24-alpine

WORKDIR /app
COPY server/server.js ./server.js
COPY index.html ./public/
COPY css ./public/css
COPY js ./public/js
RUN mkdir -p /data && chown node:node /data

USER node
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data PUBLIC_DIR=/app/public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
