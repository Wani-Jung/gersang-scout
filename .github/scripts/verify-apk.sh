#!/usr/bin/env bash
# 빌드된 APK 가 예상한 서명 키 / 패키지 / 버전인지 확인한다.
# 하나라도 다르면 실패해서 릴리스가 만들어지지 않는다
# (키가 다르면 폰의 기존 앱 위에 덮어쓰기 설치가 안 되고, versionCode 가 낮으면 설치가 거부된다).
#   사용법: verify-apk.sh <apk 경로>
#   필요한 환경변수: EXPECTED_CERT_SHA256, EXPECTED_VERSION_CODE, EXPECTED_VERSION_NAME
#   선택: EXPECTED_PACKAGE, APKSIGNER, AAPT2 (없으면 ANDROID_HOME 의 build-tools 에서 찾는다)
set -euo pipefail

APK="${1:?apk 경로가 필요합니다}"
: "${EXPECTED_CERT_SHA256:?}" "${EXPECTED_VERSION_CODE:?}" "${EXPECTED_VERSION_NAME:?}"
EXPECTED_PACKAGE="${EXPECTED_PACKAGE:-com.wanijung.gersangapp}"

if [ -z "${APKSIGNER:-}" ] || [ -z "${AAPT2:-}" ]; then
  BT=$(ls -d "${ANDROID_HOME:?ANDROID_HOME 필요}"/build-tools/* | sort -V | tail -1)
  APKSIGNER="${APKSIGNER:-$BT/apksigner}"
  AAPT2="${AAPT2:-$BT/aapt2}"
fi

fail() { echo "::error::$1"; exit 1; }

CERTS=$("$APKSIGNER" verify --print-certs "$APK")
ACTUAL=$(printf '%s\n' "$CERTS" | grep -m1 'certificate SHA-256 digest' | awk '{print $NF}' | tr 'A-F' 'a-f')
EXPECTED=$(printf '%s' "$EXPECTED_CERT_SHA256" | tr 'A-F' 'a-f')
echo "서명 지문(SHA-256): $ACTUAL"
[ "$ACTUAL" = "$EXPECTED" ] || fail "서명 키가 예상과 다릅니다. 예상 $EXPECTED / 실제 ${ACTUAL:-없음}"

BADGING=$("$AAPT2" dump badging "$APK" | head -n 1)
echo "$BADGING"
printf '%s' "$BADGING" | grep -q "name='$EXPECTED_PACKAGE'" || fail "패키지 이름이 $EXPECTED_PACKAGE 가 아닙니다."
printf '%s' "$BADGING" | grep -q "versionCode='$EXPECTED_VERSION_CODE'" || fail "versionCode 가 $EXPECTED_VERSION_CODE 가 아닙니다."
printf '%s' "$BADGING" | grep -q "versionName='$EXPECTED_VERSION_NAME'" || fail "versionName 이 $EXPECTED_VERSION_NAME 이 아닙니다."

echo "APK 확인 통과: 서명 키, 패키지, 버전이 모두 예상과 같습니다."
