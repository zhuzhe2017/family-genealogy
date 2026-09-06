# GitHub Environments 配置指南

> 本文档说明如何为数字家谱项目配置 GitHub Environments（环境）审批流，实现 **staging 自动部署 → production 人工审批部署** 的发布流程。

---

## 一、创建 Environments

1. 打开 GitHub 仓库 → **Settings** → **Environments** → **New environment**
2. 分别创建以下两个环境：

| 环境名称 | 用途 | 保护规则 |
|----------|------|----------|
| `staging` | 预发布/测试环境，自动部署验证 | 无（或限制分支为 `main`/`master`） |
| `production` | 生产环境，需人工审批后部署 | Required reviewers + Deployment branches |

---

## 二、配置 `staging` 环境

| 配置项 | 值 | 说明 |
|--------|-----|------|
| **Deployment branches** | `main`, `master` | 仅允许主分支部署到 staging |
| **Required reviewers** | 不设置 | staging 自动部署，无需审批 |
| **Environment secrets** | 见下文「Secrets 配置」 | 独立于仓库 Secrets，可按环境覆盖 |

---

## 三、配置 `production` 环境（核心）

### 3.1 保护规则

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| **Required reviewers** | 1-2 名核心开发/运维 | 部署前必须人工点击「Approve and deploy」 |
| **Deployment branches** | `main`, `master` | 仅主分支可触发生产部署 |
| **Prevent self-review** | 勾选（可选） | 提交者不能审批自己的部署（团队协作时建议开启） |

### 3.2 Environment Secrets（独立配置，覆盖仓库级 Secrets）

在 `production` 环境的 **Secrets** 标签页中添加：

| Secret | 说明 | 获取方式 |
|--------|------|----------|
| `DEPLOY_HOST` | 生产服务器 IP/域名 | 服务器公网地址 |
| `DEPLOY_USER` | SSH 登录用户 | 如 `root` / `ubuntu` |
| `DEPLOY_SSH_KEY` | SSH 私钥（RSA/ED25519） | 本地 `~/.ssh/id_rsa` 内容 |
| `DEPLOY_PATH` | 项目部署目录 | 如 `/opt/family-genealogy` |
| `REGISTRY_USERNAME` | 镜像仓库账号 | Docker Hub / 阿里云 ACR 用户名 |
| `REGISTRY_PASSWORD` | 镜像仓库密码 | 镜像仓库访问凭证 |

> **关键**：`production` 环境的 Secrets 独立于仓库级 Secrets，实现 **staging 与 production 使用不同服务器/凭证** 的隔离。

### 3.3 审批流程演示

1. 开发者 push 代码到 `main` 分支
2. GitHub Actions 自动执行：CI → docker（构建镜像）→ **deploy-staging**（自动部署到测试服务器）
3. `deploy-staging` 成功后，`deploy-production` 进入 **Waiting** 状态（黄色等待图标）
4. 审批人收到通知（GitHub 页面/邮件），进入 Actions 页面点击 **「Approve and deploy」**
5. 生产部署执行：备份数据库 → docker compose pull → 滚动重启 → 健康检查
6. 若健康检查失败，自动触发 rollback job 输出容器状态

---

## 四、Staging 与 Production 的 docker-compose 差异

| 项目 | staging | production |
|------|---------|------------|
| 编排文件 | `docker-compose.yml` | `docker-compose.yml` + `docker-compose.prod.yml` |
| HTTPS | 无（HTTP 测试） | 有（nginx.prod.conf + TLS 证书） |
| 资源限制 | 无 | 有（cpus/memory 限制） |
| 日志轮转 | 无 | 有（json-file max-size/max-file） |
| 数据库备份 | 无 | 部署前自动执行 `scripts/backup-db.sh` |
| 端口映射 | `9527:80`, `9528:80` | `443:443`, `80:80`, `8443:443`, `8080:80` |

---

## 五、常见问题

### Q1: 审批人未收到通知？
- 确保审批人的 GitHub 账号在 **Required reviewers** 列表中
- 检查 GitHub 通知设置（Settings → Notifications → Actions）

### Q2: 如何跳过 staging 直接部署生产？
- 修改 [ci.yml](.github/workflows/ci.yml) 中 `deploy-production` 的 `needs: [deploy-staging]` 为 `needs: [docker]`（不推荐，失去预验证环节）

### Q3: staging 部署失败会阻塞生产吗？
- 会。`deploy-production` 依赖 `deploy-staging` 成功。若 staging 失败，生产部署不会触发，需先修复 staging 问题。

### Q4: 如何配置多审批人（任一通过即可）？
- 在 **Required reviewers** 中添加多人，GitHub 默认 **任一人审批通过即可** 继续执行。

---

## 六、下一步

- [ ] 创建 `staging` 与 `production` 环境并配置 Secrets
- [ ] 添加 1-2 名核心成员为 `production` 审批人
- [ ] 首次 push 验证 staging 自动部署 + production 审批流
- [ ] 配置镜像仓库（Docker Hub / 阿里云 ACR / 腾讯云 TCR）并更新 `IMAGE_NAMESPACE`
