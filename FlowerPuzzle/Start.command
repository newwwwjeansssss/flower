#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
/bin/bash ./start.sh
status=$?
if [[ $status -ne 0 ]]; then
  printf '\n启动失败，请查看上方错误。按回车关闭。\n'
  read -r answer
fi
exit "$status"
