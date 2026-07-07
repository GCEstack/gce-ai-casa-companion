FROM node:20-alpine AS builder
WORKDIR /app
COPY web-revamp/package*.json ./web-revamp/
RUN cd web-revamp && npm ci
COPY web-revamp/ ./web-revamp/
RUN cd web-revamp && npm run build

FROM nginx:alpine
COPY --from=builder /app/web-revamp/dist /usr/share/nginx/html
COPY web-revamp/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
