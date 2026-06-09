# 중요 이슈 기록 아카이브 (approvalsys 2026)

> `issues.md`가 50줄 초과 시 오래된 항목을 이곳으로 이관.

- **2026-04-27 — 대외비 재인증 세션 탈취 (수정·배포)**
  - `signInWithPopup`은 팝업에서 다른 계정 선택 시 auth state를 silently 교체 → 다른 회사 계정으로 대외비 열람 가능.
  - 수정: `reauthenticateWithPopup(auth.currentUser, provider)` + `isReauthInProgress` 플래그 race 방어 + user-mismatch 시 강제 로그아웃. (`public/index.html` 77, 134, 285–296, 1959–1986)
