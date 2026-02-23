#!/bin/bash
# 日志敏感信息清理脚本
# 使用方法: cat log.txt | ./sanitize-log.sh

sed \
  -e 's/cnwy_k_[A-Za-z0-9]*/[REDACTED_KEY]/g' \
  -e 's/Bearer [A-Za-z0-9_-]*/Bearer [REDACTED]/g' \
  -e 's/0x[0-9a-fA-F]\{40\}/[REDACTED_ADDR]/g' \
  -e 's/[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}/[REDACTED_UUID]/g' \
  -e 's/sk-[A-Za-z0-9]*/[REDACTED_SK]/g' \
  -e 's/[0-9a-f]\{32,\}\.[A-Za-z0-9_-]*/[REDACTED_TOKEN]/g'
