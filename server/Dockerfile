# ============================================================
# 后端多阶段构建 Dockerfile
# server 是独立子项目（无 workspace:* 依赖），直接用 npm 安装
# 阶段一：依赖安装（含原生模块编译工具链）
# 阶段二：构建 TypeScript 产物
# 阶段三：仅安装生产依赖 + 精简运行时
# ============================================================

# ---------- 阶段一：依赖安装 ----------
FROM docker.m.daocloud.io/library/node:20-alpine AS deps
WORKDIR /app

# 原生模块（bcrypt）编译工具
RUN apk add --no-cache python3 make g++

# 仅复制清单以最大化利用构建缓存（server 是独立项目，不需要 pnpm-workspace.yaml）
COPY package.json ./
RUN npm install --no-audit --no-fund

# ---------- 阶段二：构建 ----------
FROM deps AS build
COPY tsconfig.json nest-cli.json* ./
COPY src ./src
COPY test ./test 2>/dev/null || true
RUN npm run build

# ---------- 阶段三：生产运行时 ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache python3 make g++

# 仅复制清单并安装生产依赖（不含 devDependencies，体积更小）
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 编译产物
COPY --from=build /app/dist ./dist

# 数据目录（数据库 schema/迁移脚本/上传文件），运行时挂载卷即可持久化
VOLUME ["/app/database", "/app/uploads"]

EXPOSE 3000

# 用非 root 用户运行（node 用户为 alpine 默认自带）
USER node

CMD ["node", "dist/main.js"]
