#!/usr/bin/env node
'use strict';
// 인라인 핸들러 배선 — onclick="fn(...)" 이 부르는 이름이 실제로 전역에 노출돼 있는지.
//   막는 것: 버튼을 눌러도 아무 일도 없고 콘솔에만 `ReferenceError: fn is not defined` 가 뜨는 배포.
//   이 앱의 JS 는 <script type="module"> 이라 최상위 function 선언이 전역이 아니다 →
//   HTML 속성·템플릿 문자열에서 부르는 함수는 반드시 `window.fn = …` 로 노출해야 한다(conventions.md).
//   (classic 스크립트가 생기면 그 최상위 `function fn` 선언도 전역으로 인정한다.)
//
// 🔴 속성값을 따옴표~따옴표로 통째 잡지 않는다 — JS 가 문자열 연결로 찍는 핸들러(`onclick="fn('+id+')"`,
//    `onclick="fn('${id}')"`)가 빠진다. 여는 따옴표 **직후 호출 이름 토큰만** 본다(playbook core-verify).
const { readHtml, htmlFiles, inlineScripts, stripComments, lineOf, reporter } = require('./lib-html.cjs');

const R = reporter('인라인 핸들러 배선(window 노출)');
// 따옴표 직후 오는 토큰 중 함수 이름이 아닌 것
const SKIP = new Set(['return', 'if', 'void', 'this', 'event', 'window', 'document', 'true', 'false', 'null', 'location', 'history', 'alert', 'confirm']);

const exposed = new Set();
const sources = [];
for (const file of htmlFiles()) {
  const html = readHtml(file);
  sources.push({ file, html });
  for (const s of inlineScripts(html)) {
    const code = stripComments(s.code);
    for (const m of code.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) exposed.add(m[1]);
    if (s.kind === 'classic') {
      for (const m of code.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) exposed.add(m[1]);
    }
  }
}

let checked = 0;
const missing = new Map(); // name → [위치]
for (const { file, html } of sources) {
  // 속성 형태만: on이름= 바로 뒤 따옴표(선택적 백슬래시 이스케이프). `.onclick = () =>` 같은 JS 대입은 공백 때문에 안 걸린다.
  const re = /\bon[a-z]+=\\?["']\s*([A-Za-z_$][\w$]*)(\s*[.(]?)/g;
  let m;
  while ((m = re.exec(html))) {
    const name = m[1];
    const next = m[2].trim();
    if (SKIP.has(name) || next === '.') continue; // this.parentElement.remove() · window.print() 등
    if (next !== '(') continue; // 호출이 아닌 토큰
    checked++;
    if (!exposed.has(name)) {
      if (!missing.has(name)) missing.set(name, []);
      missing.get(name).push(`public/${file}:${lineOf(html, m.index)}`);
    }
  }
}

if (checked === 0) {
  R.fail('인라인 핸들러 호출을 하나도 못 찾았다 — 추출 정규식이 깨졌거나 마크업이 외부 파일로 분리됐다. 이 테스트의 소스 목록을 같이 옮길 것.');
}
for (const [name, where] of missing) {
  R.fail(`\`${name}(...)\` 을 인라인 핸들러에서 부르는데 \`window.${name} = …\` 노출이 없다 (${where.join(', ')}). `
    + `module 스크립트의 함수는 전역이 아니므로 클릭 시 ReferenceError 로 조용히 죽는다 → 정의부를 \`window.${name} = …\` 로 노출하거나 addEventListener 로 배선할 것.`);
}
if (!missing.size) R.ok(`핸들러 호출 ${checked}곳 · 전역 노출 이름 ${exposed.size}개 대조 — 누락 0`);
R.done();
