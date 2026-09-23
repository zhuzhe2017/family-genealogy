# 数字家谱 - 生产环境紧急回滚手册

> 版本：v1.0 ｜ 日期：2026-09-10
> 适用：Docker Compose 部署（`docker-compose.yml` + `docker-compose.prod.yml`）

---

## 1. 回滚触发条件

- 部署后健康检查失败（`/api/health` 返回非 200）
- 核心业务功能异常（登录失败、支付失败、数据读写错误）
- 错误率突增（5xx 比例 > 5%）

---

## 2. 回滚前准备

### 2.1 确认当前镜像标签

```bash
cd /path/to/family-genealogy
docker compose -f docker-compose.yml -f docker-compose.prod.yml images
```

记录当前运行的镜像标签（如 `family-server:main-abc1234`）。

### 2.2 确认上一版本镜像标签

```bash
# 查看镜像仓库中的历史标签（需替换为实际镜像仓库地址）
docker images | grep family-server
```

### 2.3 备份当前数据库（保险措施）

```bash
bash scripts/backup-db.sh
```

---

## 3. 回滚操作步骤

### 3.1 回滚应用服务

**前提**：CI 已推送带 commit SHA 的镜像标签（如 `family-server:main-abc1234`），旧版本镜像仍在仓库中。

```bash
cd /path/to/family-genealogy

# 1. 记录当前（失败）版本镜像标签，便于事后排查
docker compose -f docker-compose.yml -f docker-compose.prod.yml images

# 2. 在 docker-compose.yml 中把镜像标签改为上一稳定版本的标签
#    例如：image: your-registry/family-server:main-x9y8z7a
#    或使用 sed 批量替换（谨慎操作，先备份配置）：
#    sed -i.bak 's/family-server:main-abc1234/family-server:main-x9y8z7a/' docker-compose.yml

# 3. 拉取旧镜像并重启（不要使用 --build，--build 会用当前代码重新构建）
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans
```

**注意**：绝对不要使用 `up -d --build` 来回滚——它会用当前工作区的代码重新构建镜像，结果仍是新版本。

### 3.2 回滚数据库（仅限 Schema 变更失败时）

```bash
# 恢复最近备份
gunzip -c backups/family_genealogy_YYYYMMDD_HHMMSS.sql.gz | \
  docker compose -f docker-compose.yml exec -T mysql \
  sh -c "mysql -uroot -p$DB_ROOT_PASSWORD family_genealogy"
```

---

## 4. 回滚后验证

### 4.1 健康检查

```bash
# 等待服务启动
sleep 10

# 检查后端健康
curl -sf http://localhost:3000/api/health && echo "OK" || echo "FAIL"

# 检查前端
curl -sf https://admin.your-domain.com && echo "OK" || echo "FAIL"
```

### 4.2 核心业务验证

- [ ] 登录功能正常
- [ ] 家族列表加载正常
- [ ] 支付回调正常
- [ ] 数据库读写正常

---

## 5. 自动化回滚（CI/CD）

在 `.github/workflows/ci.yml` 中已配置 `Rollback on failure` 步骤。回滚需要知道**上一稳定版本的镜像标签**，因此部署前必须先记录当前运行的镜像，失败时恢复到该镜像：

```yaml
- name: Deploy to production via docker compose
  id: deploy
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: ${{ secrets.DEPLOY_USER }}
    key: ${{ secrets.DEPLOY_SSH_KEY }}
    script: |
      cd ${{ secrets.DEPLOY_PATH }}
      # 部署前记录当前镜像标签，供回滚使用
      docker compose -f docker-compose.yml -f docker-compose.prod.yml images --format "{{.Name}} {{.Image}}" > /tmp/pre-deploy-images.txt
      cat /tmp/pre-deploy-images.txt

      docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
      docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans

      for i in $(seq 1 30); do
        if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
          echo "Production backend is healthy"
          exit 0
        fi
        sleep 2
      done
      echo "Production health check failed after 60s"
      exit 1

- name: Rollback on failure
  if: failure()
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: ${{ secrets.DEPLOY_USER }}
    key: ${{ secrets.DEPLOY_SSH_KEY }}
    script: |
      cd ${{ secrets.DEPLOY_PATH }}
      echo "Deployment failed, initiating rollback..."

      # 恢复部署前的镜像标签（真正回滚到旧版本）
      while read name image; do
        service=$(echo "$name" | sed 's/.*family-genealogy-//')
        sed -i "s|image: .*${service}.*|image: ${image}|" docker-compose.yml
      done < /tmp/pre-deploy-images.txt

      docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
      docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans

      sleep 10
      for i in $(seq 1 30); do
        if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
          echo "Rollback successful"
          exit 0
        fi
        sleep 2
      done

      echo "Rollback failed, manual intervention required"
      exit 1
```

---

## 6. 联系人与升级路径

| 角色 | 联系方式 | 职责 |
|------|----------|------|
| 运维负责人 | - | 执行回滚操作 |
| 开发负责人 | - | 代码修复与重新部署 |
| 业务负责人 | - | 用户沟通与公告 |

---

## 7. 回滚演练记录

| 日期 | 演练场景 | 结果 | 耗时 | 备注 |
|------|----------|------|------|------|
| - | - | - | - | - |
