FROM node:20-alpine AS builder

WORKDIR /app
ARG VITE_AUTH_URL=http://localhost:3000
ENV VITE_AUTH_URL=${VITE_AUTH_URL}

COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

