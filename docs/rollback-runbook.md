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

```bash
cd /path/to/family-genealogy

# 停止当前服务
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# 修改 docker-compose.yml 中的镜像标签为上一版本
# 或直接使用 docker 命令指定旧镜像启动
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

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

在 `.github/workflows/ci.yml` 中已配置 `Rollback on failure` 步骤，当前仅打印容器状态。建议增强为：

```yaml
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
      
      # 回滚到上一版本镜像（需提前记录旧镜像标签）
      docker compose -f docker-compose.yml -f docker-compose.prod.yml down
      docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
      
      # 等待服务启动
      sleep 10
      
      # 验证健康
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
