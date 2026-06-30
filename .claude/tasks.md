# 작업 상태 (approvalsys)

- [x] 대외비 재인증 세션 탈취 취약점 수정·배포 (2026-04-27)
- [x] 관리자 패널 수정 후 리스트 stale 이슈 수정·배포 (2026-05-04)
- [x] 본인 기안 누락 이슈 수정 + hosting/indexes 배포 (2026-05-04)
- [x] 슈퍼관리자 도입 + 대외비 수정/삭제/룰 강화 (2026-05-21 코드+rules+hosting 배포)
- [x] 대외비 상세모달 슈퍼관리자 차단 핫픽스 (2026-05-21 hosting 재배포)
- [x] 반려/미결 서브탭 + rejectionAckedBy 미확인(NEW) 표시 (2026-05-22 코드+hosting 배포, 커밋 `d29cb43`)
- [x] 대외비 결재 시 일반 결재자 권한 회귀 수정 (2026-05-27 firestore.rules 수정+배포 완료)
- [x] 지급 완료 문서가 회계 큐 잔류(미러 paymentDate drift) → GAS 백필 697건·실패0 (2026-06-09). 코드 버그 아님, 백필 도구 멱등 재실행 가능
- [x] 전체기안→전 탭 슈퍼관리자 일반 기안 삭제(최종승인 이후에도) (2026-06-30 hosting 배포, 커밋 `8c70559`+`632c29d`). `window.deleteDraft`(deleteConfidentialDraft 미러, 비대외비 전용) + openDetailModal 버튼(`!isConfidentialDraft && isSuper`). **rules 가 이미 허용**(비대외비 delete=`category!='대외비'||isSuperAdmin()`, 승인상태 차단 없음)·UI 버튼만 부재였음 → hosting only(rules 변경 0). dyops 병행 동시 반영
- [x] 동영(이천) 신규 법인 추가 (2026-06-25 hosting 배포, 커밋 `8a6eb95`). dyops와 병행 LIVE라 동시 반영. **법인 추가 시 손볼 4지점 = 기안 입력 select(L3077) / 전역검색 corpNames 배열(L1338) / 지급처리 acc-* (filterDraft switch·getTitleByListType·사이드바 버튼) / 회계 흐름은 corporation 값 분기만**
