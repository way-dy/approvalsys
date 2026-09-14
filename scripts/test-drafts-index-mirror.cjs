#!/usr/bin/env node
'use strict';
// drafts ↔ drafts_index 이중 쓰기 불변식 (architecture.md · conventions.md · playbook data-approval)
//   목록·검색 화면은 drafts_index(슬림 미러)만 읽는다. drafts 만 쓰고 미러를 빠뜨리면
//   상세는 새 값·목록은 옛 값(또는 삭제된 문서가 목록에 유령으로 남음)이 된다.
//
// 가드 ① drafts 쓰기(setDoc/updateDoc/deleteDoc/addDoc/transaction.set·update) 지점마다 앞뒤 ±WINDOW 행 안에
//        미러 갱신(saveIndexDoc / updateIndexDoc / drafts_index 직접 쓰기)이 있을 것. 삭제는 drafts_index 삭제가 있을 것.
// 가드 ② 미러 헬퍼(saveIndexDoc/updateIndexDoc/buildIndexDoc) 인자에 FieldValue 센티넬(arrayUnion 등) 금지
//        — 센티넬은 실제 값이 아니라 buildIndexDoc 폴백이 `[]` 로 깨뜨린다. 본체엔 센티넬, 미러엔 평문.
// 가드 ③ adminSaveApprovalStatus(결재자까지 바뀌는 관리자 수정)는 saveIndexDoc(전체 재작성)을 쓸 것
//        — updateIndexDoc 은 7필드 화이트리스트라 approver* 가 빠져 목록 결재현황이 stale 로 남는다.
const { scriptView, lineOf, sliceBody, sliceParens, reporter } = require('./lib-html.cjs');

const FILE = 'index.html';
const WINDOW = 15;
const R = reporter('drafts ↔ drafts_index 미러 불변식');
const src = scriptView(FILE);
const lines = src.split('\n');

// ── ① ────────────────────────────────────────────────────────────────────────
// `doc(db, 'drafts', …)` / `collection(db, 'drafts')` 를 가리키는 변수 이름(예: const docRef = doc(db, 'drafts', docId))
const draftsRefVars = new Set();
for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:doc|collection)\(\s*db\s*,\s*["']drafts["']/g)) draftsRefVars.add(m[1]);

const isDraftsTarget = (args) => {
  const first = args.trim();
  if (/^(?:doc|collection)\(\s*db\s*,\s*["']drafts["']/.test(first)) return true;
  if (/^doc\(\s*collection\(\s*db\s*,\s*["']drafts["']/.test(first)) return true;
  const ident = (first.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/) || [])[1];
  return !!ident && draftsRefVars.has(ident);
};

const writes = [];
for (const m of src.matchAll(/\b(setDoc|updateDoc|deleteDoc|addDoc|transaction\.set|transaction\.update|transaction\.delete|batch\.set|batch\.update|batch\.delete)\s*\(/g)) {
  const openIdx = m.index + m[0].length - 1;
  const args = sliceParens(src, openIdx);
  if (isDraftsTarget(args)) writes.push({ op: m[1], line: lineOf(src, m.index) });
}

if (writes.length < 5) {
  R.fail(`drafts 쓰기 지점을 ${writes.length}곳밖에 못 찾았다(기대 ≥5: 신규/수정·결재·지급일·반려확인·관리자수정·삭제×2). `
    + '추출 정규식이 깨졌거나 쓰기 코드가 헬퍼로 감싸졌다 — 이 가드가 조용히 아무것도 안 보는 상태이니 탐지식을 같이 고칠 것.');
}

let unmirrored = 0;
for (const w of writes) {
  const from = Math.max(0, w.line - 1 - WINDOW);
  const to = Math.min(lines.length, w.line + WINDOW);
  const ctx = lines.slice(from, to).join('\n');
  const isDelete = /delete/i.test(w.op);
  const mirrored = isDelete
    ? /\bdeleteDoc\(\s*doc\(\s*db\s*,\s*["']drafts_index["']/.test(ctx) || /\bbatch\.delete\([^)]*drafts_index/.test(ctx)
    : /\b(saveIndexDoc|updateIndexDoc)\s*\(/.test(ctx) || /\b(setDoc|updateDoc)\(\s*doc\(\s*db\s*,\s*["']drafts_index["']/.test(ctx);
  if (!mirrored) {
    unmirrored++;
    R.fail(`public/${FILE}:${w.line} \`${w.op}\` 로 drafts 를 ${isDelete ? '삭제하는데' : '쓰는데'} 앞뒤 ${WINDOW}행 안에 `
      + (isDelete ? '`deleteDoc(doc(db, \'drafts_index\', …))` 가 없다 → 목록에 삭제된 문서가 유령으로 남는다.'
        : '`saveIndexDoc(...)` / `updateIndexDoc(...)` 호출이 없다 → 상세와 목록(drafts_index)이 어긋난다.')
      + ' conventions.md "After any write to drafts" 5단계를 따를 것.');
  }
}
if (writes.length >= 5 && !unmirrored) R.ok(`drafts 쓰기 ${writes.length}곳 (${writes.map((w) => w.line).join(', ')}행) 모두 미러 동반`);

// ── ② ────────────────────────────────────────────────────────────────────────
const SENTINEL = /\b(arrayUnion|arrayRemove|increment|deleteField)\s*\(/;
let helperCalls = 0;
for (const m of src.matchAll(/\b(saveIndexDoc|updateIndexDoc|buildIndexDoc)\s*\(/g)) {
  const before = src.slice(Math.max(0, m.index - 20), m.index);
  if (/(function|async function)\s*$/.test(before)) continue; // 정의부
  helperCalls++;
  const args = sliceParens(src, m.index + m[0].length - 1);
  const s = args.match(SENTINEL);
  if (s) {
    R.fail(`public/${FILE}:${lineOf(src, m.index)} \`${m[1]}(...)\` 인자에 FieldValue 센티넬 \`${s[1]}()\` 이 들어 있다. `
      + '센티넬은 실제 값이 아니라 미러 재구성(buildIndexDoc 폴백)이 `[]`/쓰레기로 깨진다 → 본체(drafts)엔 센티넬, 미러엔 계산한 평문 배열/값을 넘길 것.');
  }
}
if (helperCalls === 0) R.fail('saveIndexDoc/updateIndexDoc/buildIndexDoc 호출을 하나도 못 찾았다 — 미러 헬퍼 이름이 바뀌었으면 이 테스트도 같이 고칠 것.');
else R.ok(`미러 헬퍼 호출 ${helperCalls}곳 — 센티넬 인자 0`);

// ── ③ ────────────────────────────────────────────────────────────────────────
const admin = sliceBody(src, /window\.adminSaveApprovalStatus\s*=\s*async\s*\([^)]*\)\s*=>\s*\{/);
if (!admin) {
  R.fail('`window.adminSaveApprovalStatus = async (...) => {` 를 못 찾았다 — 이름/형태가 바뀌었으면 가드 ③ 탐지식을 같이 고칠 것.');
} else if (!/\bsaveIndexDoc\s*\(/.test(admin.body)) {
  R.fail(`public/${FILE}:${admin.start}-${admin.end} adminSaveApprovalStatus 가 saveIndexDoc(전체 재작성)을 부르지 않는다. `
    + 'updateIndexDoc 은 approval*/finalApprovalDate/paymentDate/rejectionAckedBy 7필드 화이트리스트라 결재자(approver*) 변경이 미러에 안 실린다 → `await saveIndexDoc({ ...draft, ...updateData })` 로 되돌릴 것.');
} else {
  R.ok(`adminSaveApprovalStatus (${admin.start}-${admin.end}행) saveIndexDoc 사용`);
}

R.done();
