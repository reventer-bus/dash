FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG VITE_N8N_URL=http://localhost:5678
ARG VITE_API_URL=http://localhost:8000
ENV VITE_N8N_URL=$VITE_N8N_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
