# ============================================================
# tenant-web 租户后台 — 运行时镜像（nginx 托管）
# 前置：CI 阶段一 tenant-web-ci 已完成 pnpm build，dist 已就绪
# CI 配置 context: ./tenant-web  dockerfile: Dockerfile
# ============================================================

FROM docker.m.daocloud.io/library/nginx:1.27-alpine AS runner

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
