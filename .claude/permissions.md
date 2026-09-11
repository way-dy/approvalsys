# 권한 모델 — `filterDraft`

> 정본. 루트 `CLAUDE.md` 가 @import 한다.

### Permission model — `filterDraft`

`filterDraft(draft, listType)` is the **single source of truth** for who can see what. Read it before changing any access logic. Key rules:

- `category === '대외비'` (confidential) is gated entirely on `currentUser.confidentialAccess === true` (a per-user flag from `meta/users`). **Admin / executive / CEO roles get no exemption** — only the explicit flag grants access. Confidential docs are completely filtered out of every non-confidential tab.
- Confidential viewing also requires a separate "re-auth" session tracked by `confidentialAuthTime` / `CONFIDENTIAL_SESSION_MS` (30 min).
- Non-confidential tabs (`myDrafts`, `toApprove`, `allDrafts`) match by `drafterEmail` / `approver1Email` / `approver2Email` against `currentUser.email`.
- Accounting tabs (`acc-paju`, `acc-yongin`, `acc-seoul`, `acc-tour`) only show docs to users on `team === '회계팀'`, only for categories `경비` / `직영수리비`, only after `approval2Status === '결재'`, only when `paymentDate` is unset, and split by `corporation`.
- `approvalOnly` users have their "내가 올린 기안" tab and the new-draft button hidden by `applyRoleBasedUI`.
- `isAdmin` enables the admin-only direct-edit path (`adminSaveApprovalStatus`) which bypasses normal approval routing and writes an `adminEditLog` audit field. **단, 대외비 카테고리 수정은 `isSuperAdmin(currentUser)`만 허용** — 4중 게이트(상세모달 버튼·관리자 패널·`editDraft`·`adminSaveApprovalStatus`).
- **슈퍼관리자(`SUPER_ADMIN_EMAILS = ['way@dongyeongtour.co.kr']`)**: `applySuperAdminElevation()`가 `currentUser` 초기화 3곳에서 `confidentialAccess`+`isAdmin` 강제 부여. 대외비 열람·수정·삭제 모두 가능. `isConfidentialViewer`(기안자/결재자 화이트리스트)도 슈퍼관리자 우회 포함 — **권한 모델 변경 시 별도 화이트리스트 누락 점검 필수**. 슈퍼관리자 추가는 `public/index.html` 상수 + `firestore.rules` `isSuperAdmin()` 헬퍼 동시 갱신. 단, **대외비 결재 처리(approval 6필드 + 카테고리 불변)는 결재 본인도 허용** (`firestore.rules` `isApprovalOnlyUpdate` + `isApproverForDoc` 분기).
- **대외비 삭제**: `window.deleteConfidentialDraft(docId)`. 슈퍼관리자+대외비 conditional render. 순서: accessLogs → Storage `deleteObject` → `drafts_index` → `drafts` → 캐시 정리 + `recentlyUpdatedDocIds` 10초 보호.

When adding a new tab or category, update **both** `filterDraft` and `getTitleByListType`, and add the matching `<button class="nav-item" data-target="...">` in the sidebar HTML.
