#!/usr/bin/env node
'use strict';
// 인라인 <script> 문법 검사 — public/*.html 의 src 없는 스크립트를 전부 파싱한다.
//   막는 것: 괄호·따옴표·백틱 하나 어긋나 앱 전체가 백지로 뜨는 배포.
//   (이 앱은 JS 전부가 index.html 의 <script type="module"> 한 덩어리라 구문오류 1개 = 로그인 화면조차 안 뜬다.)
//   classic → vm.Script 로 컴파일, module → 임시 .mjs + `node --check`(import 문 때문에 vm.Script 불가).
//   네트워크·자격증명 0. import URL 은 파싱만 하고 받지 않는다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { readHtml, htmlFiles, inlineScripts, reporter } = require('./lib-html.cjs');

const R = reporter('인라인 스크립트 문법');
let total = 0;

for (const file of htmlFiles()) {
  const scripts = inlineScripts(readHtml(file));
  scripts.forEach((s, i) => {
    total++;
    const label = `public/${file} 의 인라인 <script${s.kind === 'module' ? ' type="module"' : ''}> #${i + 1} (html ${s.startLine}행부터)`;
    if (s.kind === 'classic') {
      try {
        new vm.Script(s.code, { filename: `${file}#script${i + 1}`, lineOffset: s.startLine - 1 });
        R.ok(label);
      } catch (e) {
        const stackLine = String(e.stack || '').split('\n')[0];
        R.fail(`${label}: 문법 오류 — ${e.message} (${stackLine}). 이 상태로 배포하면 그 스크립트 전체가 실행되지 않는다.`);
      }
      return;
    }
    // module: 원문 줄 번호가 html 줄 번호와 같도록 앞에 빈 줄을 채워 임시파일로 검사
    const tmp = path.join(os.tmpdir(), `approvalsys-syntax-${process.pid}-${i}.mjs`);
    fs.writeFileSync(tmp, '\n'.repeat(s.startLine - 1) + s.code, 'utf8');
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    try { fs.unlinkSync(tmp); } catch (_) {}
    if (r.status === 0) {
      R.ok(label);
    } else {
      const msg = (r.stderr || r.stdout || '').split('\n').filter(Boolean).slice(0, 6).join(' | ')
        .replace(new RegExp(tmp.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'g'), `public/${file}`);
      R.fail(`${label}: 문법 오류 — ${msg}. (표시된 행 번호 = public/${file} 의 실제 행) 이 상태로 배포하면 앱 전체가 백지다.`);
    }
  });
}

if (total === 0) {
  R.fail('public/*.html 에서 인라인 스크립트를 하나도 못 찾았다 — 추출 정규식이 깨졌거나 JS 가 외부 파일로 분리됐다. '
    + '분리했다면 이 테스트의 소스 목록도 같이 옮길 것(원문 grep 테스트는 원문을 쪼개는 순간 조용히 무력화된다).');
}
R.done();
