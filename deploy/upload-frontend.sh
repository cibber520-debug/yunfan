#!/usr/bin/env bash
# ============================================================
# 云帆志愿 · 上传前端到 CloudBase 静态网站托管（一键）
# 用法：在 Mac 终端执行  bash deploy/upload-frontend.sh
# 仅需：dist/ 已构建（后端域名已烧录进产物）
# 首次会开浏览器做一次 tcb 授权，之后不再需要
# ============================================================
set -e

# 切到项目根（本文件在 deploy/ 下，上一级即项目根）
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/.."

ENV_ID="cibber-test-d4g5zpfdc7f0223c6"

# 固定使用已验证的 CloudBase CLI 版本，避免依赖全局安装或 npx 的可执行文件解析。
# Bash 函数兼容 macOS 自带 Bash 3.2。
tcb() {
  npm exec --yes --package=@cloudbase/cli@3.7.3 -- tcb "$@"
}

if [ ! -d dist ]; then
  echo "❌ 找不到 dist/，请先构建前端（npm run build）"
  exit 1
fi

echo "==> 检查 tcb 登录状态（首次会打开浏览器授权）"
tcb login

echo "==> 上传 dist/ 到静态网站托管 (env=$ENV_ID)"
tcb hosting deploy ./dist -e "$ENV_ID" --concurrency 5 --retry-count 3

echo "✅ 前端已上传"
echo "   访问：https://$ENV_ID-1254041428.tcloudbaseapp.com"
