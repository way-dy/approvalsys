# 중요 이슈 기록 (approvalsys)

> 50줄 초과 시 `issues-archive-YYYY.md`로 오래된 항목 이관.

- **2026-04-27 — 대외비 재인증 세션 탈취 (수정·배포)**
  - `signInWithPopup`은 팝업에서 다른 계정 선택 시 auth state를 silently 교체 → 다른 회사 계정으로 대외비 열람 가능.
  - 수정: `reauthenticateWithPopup(auth.currentUser, provider)` + `isReauthInProgress` 플래그 race 방어 + user-mismatch 시 강제 로그아웃. (`public/index.html` 77, 134, 285–296, 1959–1986)

- **2026-05-04 — 관리자 패널 수정 후 리스트 stale (수정·배포)**
  - `adminSaveApprovalStatus`가 `updateIndexDoc`(화이트리스트 부분 update)로 처리 → 결재자 변경이 인덱스에 미반영. not-found fallback `setDoc`은 갱신 *이전* `draftCache` 기반이라 stale.
  - 수정: 관리자 흐름은 `saveIndexDoc(fullSyncedData)`로 전체 재작성. `buildIndexDoc`에 `approval*Comment`/`finalApprovalDate` 포함. (1545–1571, 2277–2287)

- **2026-05-04 — 본인 기안이 시간 지나면 "내가 올린 기안"에서 사라짐 (수정·배포)**
  - `drafts_index`를 전역 `createdAt desc + limit(50)`만 한 번 페치 → 본인 기안이 50건 윈도우 밖으로 밀려나면 `myDrafts` 필터(in-memory)에서 사라짐.
  - 수정: `_fetchMyDraftsIndex(email)` 헬퍼 추가, `Promise.all`로 전역 50건+본인 200건 dedup 머지. `drafterEmail ASC + createdAt DESC` 합성 인덱스 추가. (729–795, `firestore.indexes.json`)

- **2026-05-21 — 슈퍼관리자(SUPER_ADMIN_EMAILS) 도입 + 대외비 수정/삭제/룰 강화 (수정·배포)**
  - 신규: `SUPER_ADMIN_EMAILS = ['way@dongyeongtour.co.kr']`, `isSuperAdmin(user)`, `applySuperAdminElevation()`(currentUser 초기화 3곳에서 `confidentialAccess`+`isAdmin` 강제 true).
  - 대외비 **수정**: 기존 isAdmin → 대외비 한정 슈퍼관리자만 (4중 게이트: 상세모달 버튼·관리자 패널·`editDraft`·`adminSaveApprovalStatus`).
  - 대외비 **삭제 신규**: `window.deleteConfidentialDraft(docId)`. 2단계 확인(confirm+docId prompt). 순서: accessLogs → Storage `deleteObject` → `drafts_index` → `drafts` → 캐시(`draftCache`/`allFetchedData`/`localStorage[DRAFTS]`) + `recentlyUpdatedDocIds` 10초 보호.
  - `firestore.rules`: `isSuperAdmin()` 헬퍼 + `drafts`/`drafts_index` update/delete 대외비 게이트(현재+신규 카테고리 양쪽 검사로 카테고리 변경 우회 차단). read/create는 `isCompanyUser()` 유지.
  - 슈퍼관리자 추가 시 **`index.html` 상수 + `firestore.rules` 헬퍼 동시 갱신**.

- **2026-05-21 — 대외비 상세모달 슈퍼관리자 차단 핫픽스 (수정·배포)**
  - `filterDraft`는 `confidentialAccess` 기반이라 슈퍼관리자(elevation) 통과 → 리스트는 보임. 그러나 `isConfidentialViewer(draft)`(line 2013)는 기안자/1차/2차 결재자 화이트리스트라 슈퍼관리자 차단 → 상세 진입 시 "열람 권한이 없습니다" 토스트.
  - 수정: `isConfidentialViewer`에 `if (isSuperAdmin(currentUser)) return true;` 1줄. 30분 재인증은 슈퍼관리자도 그대로(본인 확인).
  - 교훈: 권한 모델 변경 시 `filterDraft` 외에 별도 화이트리스트(`isConfidentialViewer` 등) 누락 점검 필수.

- **2026-05-22 — 반려/미결 서브탭 + 반려건 미확인(NEW) 표시 (수정·미배포)**
  - 배경: 기안 반려 시 메일은 발송되나 앱 내 인지가 약함 → 분류 탭 + NEW 표시 요청.
  - 신규 필드 `rejectionAckedBy`(이메일 배열): 반려 문서를 본인(기안자/1·2차 결재자)이 상세모달로 열람하면 본인 이메일 추가 → NEW 해제. 기기 무관 동기화. `drafts` 본체는 `arrayUnion`, `drafts_index` 미러는 평문 배열(센티넬 금지).
  - UI: 페이지 내 서브탭 칩(`#subtab-bar`). `myDrafts`=전체/진행중/반려/완료, `toApprove`=결재대기/반려. 칩·사이드바에 미확인 반려 건수 뱃지, 카드에 NEW 핀.
  - 구조: `filterDraft` → `filterDraftBase`로 改名, `filterDraft`는 `matchesTab(draft,listType,getSubTab(listType))` 호출 래퍼. 기존 호출부 전부 불변. `toApprove/pending`은 base가 이미 '미결'만 반환하므로 동작 동일.
  - 결재자 반려탭은 로드된 데이터(전역 50+본인 200) 기준 — 추가 인덱스/쿼리 없음. `firestore.rules`·`firestore.indexes.json` 변경 없음.
  - 대외비는 ack/NEW 전면 제외(rules상 일반 사용자 update 불가). 목록 노출은 정상 유지.
  - `buildIndexDoc`에 `rejectionAckedBy` 추가, `updateIndexDoc` 화이트리스트 7필드(`+rejectionAckedBy`). `submitApprovalComment`는 반려 시 반려자 본인 pre-ack.
  - 배포: `firebase deploy --only hosting`만 필요 (rules/indexes 불필요).
