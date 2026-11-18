@AGENTS.md

# 배포 규칙 (이 저장소)

- **설치는 GitHub Release 링크로만 한다. adb(USB 연결)는 쓰지 않는다.**
- 고정 다운로드 링크: https://github.com/Wani-Jung/gersang-scout/releases/latest/download/gersang-scout.apk
  (저장소가 비공개라서, 폰 브라우저에 GitHub 로그인이 되어 있어야 받아진다)
- **키·비밀번호는 절대 커밋하지 않는다.** `*.keystore`, `key.properties`, `local.properties` 는 `.gitignore` 로 제외돼 있다.
  예외: 공개 디버그 키 `android/app/debug.keystore` (비밀번호가 공개된 키라 비밀이 아니다. 릴리스 키로 바꿀 때 제거한다).
  릴리스 키를 쓰게 되면 키스토어는 base64 로 GitHub Secrets 에만 넣는다 (KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD).
  비밀번호를 `gradle.properties` 같은 추적되는 파일에 평문으로 쓰지 않는다.
- 비공개 저장소 Actions 무료 사용량은 월 2,000분이다.

## 새 버전 내는 법 ("새 버전 올려줘")

1. 변경 사항을 커밋하고 `main` 에 푸시한다.
2. 아래 중 하나로 릴리스를 만든다.
   - 태그 푸시: `git tag vX.Y.Z` → `git push origin vX.Y.Z`
   - 수동 실행: `gh workflow run release.yml -f version=X.Y.Z` (version 을 비우면 `1.0.<실행번호>`)
3. `.github/workflows/release.yml` 이 APK 를 빌드해서 Release 에 `gersang-scout.apk` 이름으로 올린다.
   `gh run list --workflow release.yml` / `gh run watch` 로 진행을 본다. 빌드가 실패하면 Release 는 만들어지지 않는다.
- versionName 은 태그 이름(`vX.Y.Z` 에서 `v` 뺀 것), versionCode 는 `10 + 실행 번호` 로 자동이다. 직접 고치지 않는다.

## 설치가 덮어쓰기로 되려면

- 폰의 기존 앱과 **서명 키가 같고 versionCode 가 더 커야** 한다. 그래서 CI 는 APK 를 만든 뒤
  `.github/scripts/verify-apk.sh` 로 서명 지문·패키지·versionCode 를 검사하고, 다르면 릴리스를 만들지 않는다.
- 서명 키를 바꿀 때는 `release.yml` 의 `EXPECTED_CERT_SHA256` 도 새 키의 지문으로 함께 바꾼다.
- 키를 바꾸면 폰에서 한 번은 앱 삭제 후 재설치가 필요하고, 앱 안의 기록(AsyncStorage)이 사라진다.
  **반드시 먼저 앱의 💾 백업 내보내기로 파일을 저장하고, 설치 후 불러오기로 복원한다.**

## 기타

- `android/` 폴더는 CI 가 바로 빌드하려고 저장소에 커밋돼 있다 (`expo prebuild` 로 재생성하지 않는다).
- 로컬에서 `android/` 에서 `gradlew assembleRelease` 로 빌드하는 것은 확인용이다. 폰에 설치하는 APK 는 항상 CI 가 만든 것을 쓴다.
- CI 는 용량·시간을 줄이려고 `armeabi-v7a, arm64-v8a` 두 ABI 만 빌드한다 (x86 에뮬레이터용은 제외).
