#!/usr/bin/env bash
# 태그(또는 수동 입력)에서 릴리스 태그 / versionName / versionCode 를 정해 GITHUB_OUTPUT 에 쓴다.
#   versionCode = VERSION_CODE_BASE + 실행 번호  (항상 이전 빌드보다 커야 덮어쓰기 설치가 된다)
set -euo pipefail

EVENT="${EVENT_NAME:?EVENT_NAME 필요}"
RUN_NUMBER="${RUN_NUMBER:?RUN_NUMBER 필요}"
BASE="${VERSION_CODE_BASE:?VERSION_CODE_BASE 필요}"

if [ "$EVENT" = "push" ]; then
  TAG="${REF_NAME:?REF_NAME 필요}"
  NAME="${TAG#v}"
else
  NAME="${INPUT_VERSION:-}"
  [ -n "$NAME" ] || NAME="1.0.${RUN_NUMBER}"
  NAME="${NAME#v}"
  TAG="v${NAME}"
fi

if ! [[ "$NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
  echo "::error::버전 형식이 올바르지 않습니다: '$NAME' (예: 1.0.1)"
  exit 1
fi

CODE=$(( BASE + RUN_NUMBER ))
OUT="${GITHUB_OUTPUT:-/dev/stdout}"
{
  echo "tag=$TAG"
  echo "name=$NAME"
  echo "code=$CODE"
} >> "$OUT"
echo "릴리스 태그 $TAG / versionName $NAME / versionCode $CODE"
