#!/bin/bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
if [[ "$(uname -s)" != Darwin ]]; then
  echo '此启动包需要 macOS。' >&2
  exit 1
fi
if [[ ! -f index.html || ! -f src/level_editor_shell/app_macos.py || ! -f requirements-runtime.txt ]]; then
  echo '文件不完整，请完整解压启动包。' >&2
  exit 1
fi
PYTHON="$ROOT/.venv-macos/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  BASE=""
  for candidate in "${FLOWER_EDITOR_PYTHON:-}" /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.13 /usr/local/bin/python3.12 /usr/local/bin/python3.13 python3.12 python3.13 python3.11 python3 "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"; do
    if [[ -n "$candidate" ]] && command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import platform,sys; sys.exit(not(platform.machine() in ("arm64", "x86_64") and (3,11)<=sys.version_info[:2]<(3,14)))' 2>/dev/null; then
      BASE="$candidate"
      break
    fi
  done
  if [[ -z "$BASE" ]]; then
    echo '未找到 Python 3.11–3.13。请安装 Python 3.12 后重新启动。' >&2
    echo '已有 Homebrew 可执行：brew install python@3.12' >&2
    exit 1
  fi
  "$BASE" -m venv "$ROOT/.venv-macos"
fi
if ! "$PYTHON" -c 'import webview, Cocoa, WebKit' >/dev/null 2>&1; then
  echo '首次启动：正在安装依赖，需要网络连接……'
  "$PYTHON" -m pip install --index-url https://pypi.org/simple -r "$ROOT/requirements-runtime.txt"
fi
export PYTHONPATH="$ROOT/src"
exec "$PYTHON" -m level_editor_shell.app_macos
