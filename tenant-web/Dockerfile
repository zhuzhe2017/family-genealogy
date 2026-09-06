# ============================================================
# tenant-web 租户后台 — 多阶段构建 Dockerfile
# 阶段一：node 构建 Vite 产物  阶段二：nginx 托管 + 反代后端 API
# ============================================================

# ---------- 阶段一：构建 ----------
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---------- 阶段二：运行时 ----------
FROM nginx:1.27-alpine AS runner

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
