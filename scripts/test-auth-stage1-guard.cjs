#!/usr/bin/env node
'use strict';
// 인증 게이트 · 1차 통과 판정 불변식 (architecture.md · conventions.md Gotchas)
//
// 가드 ① 도메인 게이트: ALLOWED_EMAIL_DOMAIN === 'dongyeongtour.co.kr' 이고, onAuthStateChanged 콜백이
//        isAllowedDomain(user.email) 로 검사해 실패 시 signOut 한다. (hd 파라미터는 UX 힌트일 뿐 우회 가능)
// 가드 ② 대외비 재인증은 reauthenticateWithPopup — signInWithPopup 호출은 최초 로그인 버튼 1곳뿐.
//        signInWithPopup 으로 재인증하면 팝업에서 다른 계정을 고르는 순간 세션이 그 계정으로 교체된다(세션 탈취).
//        + 재인증 중 계정 교체 race 방어(isReauthInProgress)가 onAuthStateChanged 에 살아 있을 것.
// 가드 ③ "1차 통과" 판정은 isStage1Passed(draft) 로만 — filterDraftBase·submitApprovalComment·openDetailModal 에서
//        approval1Status === '결재' / '전결' 직접 비교 금지(레거시 '전결'/null + approver1Email='jeongyeol' 문서가 빠진다).
const { scriptView, lineOf, sliceBody, reporter } = require('./lib-html.cjs');

const FILE = 'index.html';
const R = reporter('인증 게이트 · 1차 통과 판정 불변식');
const src = scriptView(FILE);

// ── ① ────────────────────────────────────────────────────────────────────────
const dom = src.match(/\bconst\s+ALLOWED_EMAIL_DOMAIN\s*=\s*["']([^"']+)["']/);
if (!dom) R.fail('`const ALLOWED_EMAIL_DOMAIN = \'…\'` 선언을 못 찾았다 — 회사 도메인 게이트가 사라졌거나 이름이 바뀌었다.');
else if (dom[1] !== 'dongyeongtour.co.kr') R.fail(`ALLOWED_EMAIL_DOMAIN 이 '${dom[1]}' 이다(기대 'dongyeongtour.co.kr') — 외부 계정이 사내 결재 시스템에 로그인할 수 있게 된다.`);
else R.ok("ALLOWED_EMAIL_DOMAIN = 'dongyeongtour.co.kr'");

const auth = sliceBody(src, /\bonAuthStateChanged\s*\(\s*auth\s*,\s*async\s*\(\s*user\s*\)\s*=>\s*\{/);
if (!auth) {
  R.fail('`onAuthStateChanged(auth, async (user) => {` 콜백을 못 찾았다 — 형태가 바뀌었으면 가드 ①② 탐지식을 같이 고칠 것.');
} else {
  const gate = auth.body.match(/if\s*\(\s*!\s*isAllowedDomain\s*\(\s*user\.email\s*\)\s*\)\s*\{([\s\S]*?)\breturn\b/);
  if (!gate) {
    R.fail(`public/${FILE}:${auth.start}-${auth.end} onAuthStateChanged 콜백에 \`if (!isAllowedDomain(user.email)) { … return; }\` 차단이 없다 — 도메인 외 계정이 그대로 앱에 들어온다.`);
  } else if (!/\bsignOut\s*\(\s*auth\s*\)/.test(gate[1])) {
    R.fail(`public/${FILE}:${auth.start}-${auth.end} 도메인 차단 분기에 \`signOut(auth)\` 가 없다 — 화면만 막고 Firebase 세션은 살아 있어 rules 상 읽기가 가능해진다.`);
  } else {
    R.ok(`onAuthStateChanged (${auth.start}행~) 도메인 외 계정 signOut 차단`);
  }
  if (!/\bisReauthInProgress\b[\s\S]{0,80}user\.email\s*!==\s*currentUser\.email/.test(auth.body)) {
    R.fail(`public/${FILE}:${auth.start}-${auth.end} onAuthStateChanged 에 재인증 중 계정 교체 방어(\`isReauthInProgress && … user.email !== currentUser.email\`)가 없다. `
      + 'reauthenticateWithPopup 의 user-mismatch 에만 기대면 SDK 동작 변경/race 시 세션이 교체된다(architecture.md 이중 안전장치).');
  } else {
    R.ok('재인증 중 계정 교체 race 방어 유지');
  }
}

// ── ② ────────────────────────────────────────────────────────────────────────
const signIns = [...src.matchAll(/\bsignInWithPopup\s*\(/g)].map((m) => ({ line: lineOf(src, m.index), text: src.split('\n')[lineOf(src, m.index) - 1].trim() }));
const badSignIns = signIns.filter((s) => !/btn-login/.test(s.text));
if (badSignIns.length) {
  badSignIns.forEach((s) => R.fail(`public/${FILE}:${s.line} 로그인 버튼(#btn-login) 밖에서 signInWithPopup 을 부른다: \`${s.text.slice(0, 100)}\`. `
    + '재인증 용도라면 반드시 `reauthenticateWithPopup(auth.currentUser, provider)` — signInWithPopup 은 다른 계정 선택 시 세션을 통째로 교체한다.'));
} else if (signIns.length !== 1) {
  R.fail(`signInWithPopup 호출이 ${signIns.length}곳이다(기대: #btn-login 1곳). 최초 로그인 경로가 사라졌거나 중복됐다.`);
} else {
  R.ok(`signInWithPopup 은 로그인 버튼 1곳(${signIns[0].line}행)뿐`);
}
const reauth = sliceBody(src, /\basync\s+function\s+reAuthWithGoogle\s*\([^)]*\)\s*\{/);
if (!reauth) R.fail('`async function reAuthWithGoogle()` 를 못 찾았다 — 대외비 재인증 경로가 바뀌었으면 가드 ② 탐지식을 같이 고칠 것.');
else if (!/\breauthenticateWithPopup\s*\(/.test(reauth.body)) R.fail(`public/${FILE}:${reauth.start}-${reauth.end} reAuthWithGoogle 이 reauthenticateWithPopup 을 쓰지 않는다 — 대외비 재인증에서 계정 교체(세션 탈취)가 가능해진다.`);
else if (!/\bisReauthInProgress\s*=\s*true\b/.test(reauth.body)) R.fail(`public/${FILE}:${reauth.start}-${reauth.end} reAuthWithGoogle 이 isReauthInProgress = true 를 세우지 않는다 — onAuthStateChanged 의 race 방어가 무력화된다.`);
else R.ok(`reAuthWithGoogle (${reauth.start}행~) reauthenticateWithPopup + isReauthInProgress`);

// ── ③ ────────────────────────────────────────────────────────────────────────
const DIRECT = /\bapproval1Status\s*(?:===|==|!==|!=)\s*["'](결재|전결)["']|["'](결재|전결)["']\s*(?:===|==|!==|!=)\s*[\w.?]*approval1Status\b/g;
const helper = sliceBody(src, /\bfunction\s+isStage1Passed\s*\(\s*draft\s*\)\s*\{/);
if (!helper) R.fail('`function isStage1Passed(draft)` 헬퍼가 없다 — 1차 통과 판정의 단일 진실이 사라졌다(conventions.md).');
else if (!/jeongyeol/.test(helper.body) || !/전결/.test(helper.body)) R.fail(`public/${FILE}:${helper.start}-${helper.end} isStage1Passed 가 전결(approver1Email='jeongyeol' / '전결')을 인정하지 않는다 — 전결 문서가 2차 결재함에서 사라진다.`);
else R.ok(`isStage1Passed (${helper.start}행~) 전결 인정`);

const SITES = [
  ['filterDraftBase', /\bfunction\s+filterDraftBase\s*\([^)]*\)\s*\{/],
  ['submitApprovalComment', /window\.submitApprovalComment\s*=\s*async\s*\([^)]*\)\s*=>\s*\{/],
  ['openDetailModal', /window\.openDetailModal\s*=\s*async\s*\([^)]*\)\s*=>\s*\{/],
];
for (const [name, re] of SITES) {
  const b = sliceBody(src, re);
  if (!b) { R.fail(`\`${name}\` 본문을 못 찾았다 — 이름/형태가 바뀌었으면 가드 ③ 대상 목록을 같이 고칠 것.`); continue; }
  const hits = [...b.body.matchAll(DIRECT)];
  if (hits.length) {
    hits.forEach((h) => R.fail(`public/${FILE}:${b.start - 1 + lineOf(b.body, h.index)} ${name} 안에서 \`${h[0]}\` 로 1차 통과를 직접 비교한다. `
      + '레거시 문서(approval1Status 가 \'전결\'/null, approver1Email=\'jeongyeol\')가 빠진다 → `isStage1Passed(draft)` 를 쓸 것.'));
  } else if (!/\bisStage1Passed\s*\(/.test(b.body)) {
    R.fail(`public/${FILE}:${b.start}-${b.end} ${name} 이 isStage1Passed 를 부르지 않는다 — 2차 결재 권한/표시 판정이 헬퍼를 우회하고 있다.`);
  } else {
    R.ok(`${name} (${b.start}-${b.end}행) isStage1Passed 사용 · 직접 비교 0`);
  }
}

R.done();
