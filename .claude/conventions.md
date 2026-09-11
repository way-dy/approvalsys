# 관례 · 반드시 아는 함정(Gotchas)

> 정본. 루트 `CLAUDE.md` 가 @import 한다.

## Conventions

- All UI strings, comments, toasts, and field values are in Korean. Status values are Korean literals: `'결재'` (approved), `'반려'` (rejected), `'전결'` (delegated/auto-approved at stage 1). Don't translate these — they're persisted in Firestore.
- Inline event handlers use `window.someFn = ...` to expose functions to `onclick=` attributes. New interactive functions called from HTML must be assigned to `window`.
- After any write to `drafts`, also: (1) call `saveIndexDoc` or `updateIndexDoc`, (2) update `draftCache[docId]` and the matching entry in `allFetchedData` for optimistic UI, (3) add the docId to `recentlyUpdatedDocIds`, (4) `localStorage.removeItem(CACHE_KEYS.DRAFTS)` to invalidate the stale list cache, (5) `renderWithFilter(getActiveTabTarget())`.

## Gotchas (must-know)

- **1차 전결 처리**: when `approver1Input === '전결'` at draft creation, we save `approver1Email='jeongyeol'`, `approver1Name='전결'`, `approval1Status='결재'`. Legacy docs may have `approval1Status='전결'` or `null`. **Always use the `isStage1Passed(draft)` helper** (defined just above `filterDraft`) to test "1차 통과" — never compare `approval1Status === '결재'` directly. The helper is the source of truth in `filterDraft` (toApprove/toApproveConfidential), `openDetailModal` (isAppr2 button), and `submitApprovalComment` (stage routing).
- **Admin approver `<select>` fallback**: `admin-approver1-email` / `admin-approver2-email` are `<select>` elements built from `userList`. If `draft.approver*Email` isn't in `userList` (전결 = `'jeongyeol'`, or 퇴사자), `.value = email` silently shows blank. The admin panel populates them via `buildOptionsFor(email, name)` which prepends a fallback `<option>` when the value is missing. Preserve this when refactoring the admin panel.
- **Search "no docs" flash**: `runSearch` filters local 50건 first; if 0 matches AND keyword ≥ 2 chars, it shows a "전체 기간에서 검색 중..." placeholder instead of "문서가 없습니다", and `autoGlobalSearch` (250ms debounce) takes over. `autoGlobalSearch` has a fallback path: if `fetchGlobalSearchResults` returns 0 (e.g., the `searchTokens` composite index isn't deployed), it loads the latest 200 from `drafts_index` and filters client-side. Don't remove the fallback.
- **searchTokens composite index**: `fetchGlobalSearchResults` queries `drafts_index` with `where('searchTokens', 'array-contains', ...) + orderBy('createdAt', 'desc')`. This requires a composite Firestore index — if it isn't created, the query throws and the fallback above kicks in. Creating the index in Firebase Console will make global search faster, but the app works without it.
- **대외비 재인증은 반드시 `reauthenticateWithPopup`**: `signInWithPopup`은 팝업에서 다른 계정을 고르면 auth state 자체를 그 계정으로 교체해버려 세션 탈취가 가능. `reauthenticateWithPopup(auth.currentUser, provider)`은 현재 계정에 한정해 재인증하며, 다른 계정 선택 시 `auth/user-mismatch` 에러를 던지고 세션을 건드리지 않음. 추가로 `isReauthInProgress` 플래그가 `onAuthStateChanged`에서 race를 방어. 자세한 내력은 "중요 이슈 기록" 참조.
- **서브탭(분류 칩) 모델**: 메인 탭 일부(`myDrafts`·`toApprove`)는 페이지 내 칩(`#subtab-bar`)으로 다시 분류된다. `SUB_TABS` 상수가 칩 정의, `currentSubTab`이 탭별 선택 상태. 권한 필터의 단일 진실은 여전히 `filterDraftBase`(구 `filterDraft`) — 외부 노출용 `filterDraft(draft,listType)`는 `matchesTab(draft,listType,getSubTab(listType))`를 호출하는 래퍼라 기존 호출부는 그대로 두면 된다. 칩 미정의 탭(`allDrafts`·`acc-*`·대외비)은 sub=null → base 그대로(불변). 반려건 미확인 표시(NEW 핀·뱃지)는 `rejectionAckedBy`로 추적하며 **대외비는 ack/NEW에서 전면 제외**(rules상 일반 사용자 update 불가) — 단 목록 노출은 정상.
