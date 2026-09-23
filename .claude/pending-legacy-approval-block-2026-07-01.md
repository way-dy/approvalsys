# 보류·폐기: 옛 시스템 결재 전면 차단 (2026-07-01 미커밋 작업)

- 2026-09-23 운영 점검(smoke)에서 발견: 7/1 부터 작업트리에만 남아 있던 변경. 커밋·배포된 적 없음.
- 내용: `firestore.rules` drafts `update: if false` + `processApproval` 진입 시 OPS 안내 alert 후 return.
- 6/30 컷오버 결정(`d51f2c8`: 신규 기안만 차단, **기존 기안 결재는 유지**)을 뒤집는 변경이라 way 결정으로 **폐기**. 작업트리는 커밋 상태로 복원.
- 되살리려면 아래 패치를 `git apply` (저장소 루트에서).

```diff
diff --git a/firestore.rules b/firestore.rules
index df93ad7..e8d0041 100644
--- a/firestore.rules
+++ b/firestore.rules
@@ -71,15 +71,10 @@ service cloud.firestore {
       //   레거시에서 새 기안 만들면 dyops와 데이터 갈라져 혼선 → create 봉쇄.
       //   조회(read)·기존 기안 결재(update)는 유지(보관·진행분 마무리).
       allow create: if false;
-      allow update: if isCompanyUser()
-                    && (
-                      (resource.data.category != '대외비'
-                        && request.resource.data.category != '대외비')
-                      || isSuperAdmin()
-                      || (resource.data.category == '대외비'
-                          && isApproverForDoc()
-                          && isApprovalOnlyUpdate())
-                    );
+      // 🚫 결재도 신규 시스템(OPS/dyops)으로 이전(2026-07-01) — 옛 시스템 결재 하드 차단.
+      //   결재자가 옛 시스템에서 승인하던 경로 원천 차단(보관·조회 전용). 결재는 dy-ops 에서만.
+      //   회귀 가드: 옛 시스템 결재 재허용 금지(dyops 와 승인상태 divergence·이중결재 유발).
+      allow update: if false;
       allow delete: if isCompanyUser()
                     && (resource.data.category != '대외비' || isSuperAdmin());
     }
diff --git a/public/index.html b/public/index.html
index 487de1b..4274846 100644
--- a/public/index.html
+++ b/public/index.html
@@ -1934,6 +1934,11 @@
         // 결재 처리
         // =========================================================================
         window.processApproval = (docId, action) => {
+            // 🚫 결재는 신규 시스템(OPS/dyops)으로 이전 — 옛 시스템 결재 차단 + dyops 유도.
+            //   (rules 도 drafts update:false 하드차단. 콘솔 우회도 서버에서 거부.)
+            alert('결재는 신규 시스템(OPS)으로 이전되었습니다.\n\ndy-ops.web.app 의 [의사결정 → 결재 대기] 에서 결재해 주세요.');
+            window.open('https://dy-ops.web.app/decisions/approve', '_blank', 'noopener');
+            return;
             pendingDocId = docId;
             pendingAction = action;
 
```
