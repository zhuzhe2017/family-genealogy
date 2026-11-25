# ============================================================
# web-admin 管理后台 — 运行时镜像（nginx 托管）
# 前置：CI 阶段一 web-admin-ci 已完成 pnpm build，dist 已就绪
# CI 配置 context: ./web-admin  dockerfile: Dockerfile
# ============================================================

FROM docker.m.daocloud.io/library/nginx:1.27-alpine AS runner

# 移除默认配置
RUN rm -f /etc/nginx/conf.d/default.conf

# 自定义 nginx 站点配置（反代后端 API）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 已构建好的 Vite 产物
COPY dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
