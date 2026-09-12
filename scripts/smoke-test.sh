# ============================================================
# 数字家谱 - 生产环境冒烟测试脚本
# 用途：部署后自动验证核心 API 可用性
# 用法：SMOKE_BASE_URL=https://example.com bash scripts/smoke-test.sh
#       或 bash scripts/smoke-test.sh [base_url]
# 示例：bash scripts/smoke-test.sh https://jiapuadmin.deejee.net
# ============================================================

#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${SMOKE_BASE_URL:-http://localhost:3000}}"
API_PREFIX="/api"

echo "[smoke] testing: $BASE_URL$API_PREFIX"
FAILED=0

# 测试 1: 健康检查
echo -n "[smoke] 1. health check ... "
if curl -sf "$BASE_URL$API_PREFIX/health" > /dev/null 2>&1; then
    echo "OK"
else
    echo "FAIL"
    FAILED=1
fi

# 测试 2: 登录接口（预期 400/401，拒绝空凭证）
echo -n "[smoke] 2. login endpoint ... "
LOGIN_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"phone":"","password":""}' \
    "$BASE_URL$API_PREFIX/user/pwd-login" 2>/dev/null || echo "000")
if [ "$LOGIN_RESP" = "400" ] || [ "$LOGIN_RESP" = "401" ]; then
    echo "OK ($LOGIN_RESP)"
else
    echo "FAIL ($LOGIN_RESP)"
    FAILED=1
fi

# 测试 3: 公开接口 - 姓氏列表
echo -n "[smoke] 3. surname list ... "
if curl -sf "$BASE_URL$API_PREFIX/surname?page=1&pageSize=1" > /dev/null 2>&1; then
    echo "OK"
else
    echo "FAIL"
    FAILED=1
fi

# 测试 4: CORS 预检（模拟浏览器跨域请求）
echo -n "[smoke] 4. CORS preflight ... "
CORS_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
    -H "Origin: https://admin.your-domain.com" \
    -H "Access-Control-Request-Method: POST" \
    "$BASE_URL$API_PREFIX/user/pwd-login" 2>/dev/null || echo "000")
if [ "$CORS_RESP" = "200" ] || [ "$CORS_RESP" = "204" ]; then
    echo "OK ($CORS_RESP)"
else
    echo "FAIL ($CORS_RESP)"
    FAILED=1
fi

# 测试 5: 静态资源 - 上传文件访问
echo -n "[smoke] 5. uploads access ... "
if curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/uploads/" 2>/dev/null | grep -qE "200|403"; then
    echo "OK"
else
    echo "FAIL"
    FAILED=1
fi

echo ""
if [ $FAILED -eq 0 ]; then
    echo "[smoke] ALL TESTS PASSED"
    exit 0
else
    echo "[smoke] SOME TESTS FAILED"
    exit 1
fi
