# 외부 연동 — 웹훅 2종 · GAS 4 프로젝트(clasp)

> 정본. 루트 `CLAUDE.md` 가 @import 한다.

### External integrations (fire-and-forget)

Two Google Apps Script webhook URLs are hardcoded near the top of the script block:

- `APPS_SCRIPT_URL` — `syncToGoogleSheet(draftData)` mirrors every saved draft to a Google Sheet.
- `EMAIL_API_URL` — `sendEmailNotification(type, draftData)` sends approval/notification emails.

Both are called with `mode: 'no-cors'` and never awaited for success — failures only log. Treat them as best-effort side effects; never make a UI flow depend on their response.

### GAS (Google Apps Script) 소스 관리

4개의 GAS 프로젝트가 `gas/` 하위에 **clasp**로 관리됩니다. 각 폴더 안의 `.clasp.json`에 스크립트 ID가 있고, `Code.js` / `appsscript.json`이 진실의 원천. 수정 후 해당 폴더에서 `clasp push`, 레포 루트에서 `git commit`.

| 폴더 | 원본 이름 | 트리거 | 역할 |
|---|---|---|---|
| `gas/email-notification` | EmailAL | 웹앱(`doPost`) + 매일 1회 | `EMAIL_API_URL` 수신, Gmail 발송, 일일 미결재 요약 |
| `gas/sheet-mirror` | Imported | 웹앱(`doPost`) | `APPS_SCRIPT_URL` 수신, `imported` 시트에 draft 미러 |
| `gas/sync-firebase` | Syncfirebase | 매 시간 | `em`/`repair` 시트 → Firestore `meta/users`, `meta/repairMap` |
| `gas/_archive/migrate-drafts-index` | Migrate drafts index | 없음 | 1회성 마이그레이션 (실행 완료, 보관용) |

**중요 — GAS ↔ Firestore 인증**: `gas/sync-firebase`는 API Key가 아니라 **OAuth Bearer 토큰**(`ScriptApp.getOAuthToken()`)으로 Firestore에 접근합니다. 이유: 커밋 `4c50575`에서 `firestore.rules`가 `isCompanyUser()`(`request.auth != null + @dongyeongtour.co.kr`)를 요구하게 바뀌어 API Key 단독 접근은 403. 서비스 계정(실행자 Google 계정)이 Firestore 규칙을 우회하려면 아래 1회 설정이 이미 되어있어야 합니다:

1. `appsscript.json`의 `oauthScopes`에 `https://www.googleapis.com/auth/datastore` 포함
2. Apps Script 편집기 → ⚙️ 프로젝트 설정 → GCP 프로젝트를 **`approval-8ef73` 프로젝트 번호**로 연결
3. GCP IAM에서 실행 계정(`way@dongyeongtour.co.kr`)에 **"Cloud Datastore 사용자"** 역할 부여

새 PC에서는 `clasp login` → `way@dongyeongtour.co.kr` 로그인만 하면 됩니다(스크립트 ID는 커밋된 `.clasp.json`에 있음). `.clasprc.json`은 `.gitignore`에 포함.
