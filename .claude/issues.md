# 중요 이슈 기록 (approvalsys)

> 50줄 초과 시 `issues-archive-YYYY.md`로 오래된 항목 이관. (2026-04-27 재인증 건 → `issues-archive-2026.md`)

- **2026-06-09 — 지급 완료 문서가 회계 큐에서 안 빠짐 = drafts_index 미러 paymentDate drift (GAS 백필로 해소)**
  - 증상: 2026-0245(2/27 지급)이 상세모달엔 "지급 완료"인데 회계 지급처리 큐에 잔류. 원인: `savePaymentDate`의 `drafts_index` 동기화 라인은 커밋 `a89e431`(2026-03-12) 도입 → 그 이전 지급분은 `drafts`에만 기록, 미러 `paymentDate=null`. 자가복구 `_supplementFromDrafts`는 *인덱스 누락* 문서만 치유, *필드 stale*은 방치.
  - 진단: `git log -S "updateIndexDoc(docId, { paymentDate"` 로 도입일(3/12) vs 문서 처리일(2/27) 대조 → 확정. `verifyMirror('2026-0245')` 로그가 `index.paymentDate=null` 실증.
  - 해결: `gas/_archive/migrate-drafts-index/Code.js`에 `backfillMirrorFields()`(미러 7필드만 `updateMask` PATCH·멱등) + `verifyMirror`/`checkStuckDoc` 추가. 편집기 1회 실행 → **697건 동기화·실패 0**. going-forward 코드 정상(코드 배포 불필요). 커밋 `b2ad07c`,`72dce7c`.

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

- **2026-05-27 — 대외비 결재 시 일반 결재자 권한 회귀 수정 (수정·배포)**
  - 증상: 대외비 본인 결재자가 승인/반려 시도 시 `Missing or insufficient permissions` 토스트.
  - 원인: 2026-05-21 커밋 `8f704e1`에서 rules `drafts`/`drafts_index` update 게이트를 "대외비면 슈퍼관리자만"으로 좁힘. 의도는 본문/카테고리 편집 차단이었으나 `submitApprovalComment`의 결재 6필드 update까지 같은 게이트에 걸려 회귀.
  - 수정: `firestore.rules`에 헬퍼 2개 추가(`isApprovalOnlyUpdate` = 6필드 한정 + 카테고리 불변, `isApproverForDoc` = 1·2차 결재자 본인) → `drafts`/`drafts_index` update에 세 번째 허용 경로 추가. delete·read·create 변경 없음.
  - 결재 6필드: `approval1Status`, `approval1Comment`, `approval2Status`, `approval2Comment`, `finalApprovalDate`, `rejectionAckedBy`.
  - 영향 분석: `editDraft`/`adminSaveApprovalStatus`는 클라이언트 슈퍼관리자 게이트로 차단(영향 없음). `markRejectionAcked`는 클라 자체 대외비 제외. `savePaymentDate`는 회계 카테고리 한정. 상세모달 자동보정(line 2298)은 결재 6필드 화이트리스트 내, 결재자 본인 열람 시 통과.
  - 카테고리 우회 방지: `(resource.data.category != '대외비' && request.resource.data.category != '대외비')` 양방향 검사 + 결재 경로는 `request.resource.data.category == resource.data.category` 불변 강제.
  - 배포 완료(`firebase deploy --only firestore:rules`). hosting/index.html 변경 없음 → 사용자 새로고침 불필요.

- **2026-05-22 — 반려/미결 서브탭 + 반려건 미확인(NEW) 표시 (수정·배포)**
  - 배경: 기안 반려 시 메일은 발송되나 앱 내 인지가 약함 → 분류 탭 + NEW 표시 요청.
  - 신규 필드 `rejectionAckedBy`(이메일 배열): 반려 문서를 본인(기안자/1·2차 결재자)이 상세모달로 열람하면 본인 이메일 추가 → NEW 해제. 기기 무관 동기화. `drafts` 본체는 `arrayUnion`, `drafts_index` 미러는 평문 배열(센티넬 금지).
  - UI: 페이지 내 서브탭 칩(`#subtab-bar`). `myDrafts`=전체/진행중/반려/완료, `toApprove`=결재대기/반려. 칩·사이드바에 미확인 반려 건수 뱃지, 카드에 NEW 핀.
  - 구조: `filterDraft` → `filterDraftBase`로 改名, `filterDraft`는 `matchesTab(draft,listType,getSubTab(listType))` 호출 래퍼. 기존 호출부 전부 불변. `toApprove/pending`은 base가 이미 '미결'만 반환하므로 동작 동일.
  - 결재자 반려탭은 로드된 데이터(전역 50+본인 200) 기준 — 추가 인덱스/쿼리 없음. `firestore.rules`·`firestore.indexes.json` 변경 없음.
  - 대외비는 ack/NEW 전면 제외(rules상 일반 사용자 update 불가). 목록 노출은 정상 유지.
  - `buildIndexDoc`에 `rejectionAckedBy` 추가, `updateIndexDoc` 화이트리스트 7필드(`+rejectionAckedBy`). `submitApprovalComment`는 반려 시 반려자 본인 pre-ack.
  - 배포 완료(`firebase deploy --only hosting`, rules/indexes 변경 없음). 커밋 `d29cb43`.
