@AGENTS.md

# 배포 규칙 (이 저장소)

- **설치는 GitHub Release 링크로만 한다. adb(USB 연결)는 쓰지 않는다.**
- 고정 다운로드 링크: https://github.com/Wani-Jung/gersang-scout/releases/latest/download/gersang-scout.apk
- **키·비밀번호는 절대 커밋하지 않는다.** `*.keystore`, `key.properties`, `local.properties` 는 예외 없이 `.gitignore` 로 제외돼 있다.
  비밀번호를 `gradle.properties` 같은 추적되는 파일에 평문으로 쓰지 않는다.
- **서명 키**: v1.0.0 은 공개 디버그 키로 서명했고, **v1.1.0 부터 릴리스 키**로 서명한다 (디버그 키 파일은 저장소에서 제거했다).
  - 릴리스 키는 GitHub Secrets 에만 있다: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
    워크플로가 실행될 때만 꺼내 쓰고 끝나면 지운다.
  - 원본 키스토어와 비밀번호는 이 PC 의 `C:\Users\EKR\gersang-keystore-backup\` 에 있다 (`KEYSTORE-INFO.txt` 에 별칭·비밀번호·지문 정리).
    저장소 밖이며, **잃어버리면 이후 버전을 폰의 기존 앱 위에 덮어 설치할 수 없다.** 다른 곳(USB, 개인 클라우드, 비밀번호 관리자)에도 복사해 둔다.
  - 이 키의 인증서 SHA-256 은 `release.yml` 의 `EXPECTED_CERT_SHA256` 에 있다.
- **이 저장소는 공개(public)다. 커밋에 비밀(키·비밀번호·토큰)이 섞이면 즉시 누구에게나 노출되므로, 커밋·푸시 전에 `git diff --staged` 로 확인한다. 한 번 올라간 비밀은 지워도 이력에 남으니 폐기(재발급)한다.**
- 공개 저장소라 GitHub Actions 사용량은 무제한(무료)이다.

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
- **화면에서 AsyncStorage 키를 바꾸거나 새로 만들면** `lib/backup.ts` 의 `KEY` 목록도 같이 고치고, 옛 키의 기록을 새 키로 옮기는 코드를 둔다
  (`migrateLegacySamin` 참고). 안 그러면 💾 백업에서 빠지거나, 업데이트 뒤 기록이 사라진 것처럼 보인다. 백업 시험은 가짜 저장소로 돌려서 확인한다.
- 로컬에서 `android/` 에서 `gradlew assembleRelease` 로 빌드하는 것은 확인용이다. 서명 환경변수(`KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)가
  없으면 폰에 설치할 수 있게 서명된 APK 가 나오지 않는다. 폰에 설치하는 APK 는 항상 CI 가 만든 것을 쓴다.
- 이 저장소의 서명 키를 바꿔야 하면(분실 등) 폰에서 앱 삭제 후 재설치가 필요하다. 위의 💾 백업 절차를 먼저 따른다.
- CI 는 용량·시간을 줄이려고 `armeabi-v7a, arm64-v8a` 두 ABI 만 빌드한다 (x86 에뮬레이터용은 제외).
