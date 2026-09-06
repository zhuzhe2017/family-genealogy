# ============================================================
# 后端多阶段构建 Dockerfile
# 阶段一：安装依赖（含原生模块编译工具链，缓存友好）
# 阶段二：构建 TypeScript 产物
# 阶段三：仅安装生产依赖 + 精简运行时（无 dev 依赖/源码/编译链）
# ============================================================

# ---------- 阶段一：依赖安装 ----------
FROM node:20-alpine AS deps
WORKDIR /app

# pnpm
RUN corepack enable

# 原生模块（bcrypt）编译工具
RUN apk add --no-cache python3 make g++

# 仅复制清单以最大化利用构建缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- 阶段二：构建 ----------
FROM deps AS build
COPY tsconfig.json nest-cli.json* ./
COPY src ./src
RUN pnpm build

# ---------- 阶段三：生产运行时 ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable
RUN apk add --no-cache python3 make g++

# 仅复制清单并安装生产依赖（不含 devDependencies，体积更小）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# 编译产物
COPY --from=build /app/dist ./dist

# 数据目录（数据库 schema/迁移脚本/上传文件），运行时挂载卷即可持久化
# uploads 以匿名卷声明：即使未显式挂载，容器删除后上传文件也可保留；生产建议显式挂载卷
VOLUME ["/app/database", "/app/uploads"]

EXPOSE 3000

# 用非 root 用户运行（node 用户为 alpine 默认自带）
USER node

CMD ["node", "dist/main.js"]
