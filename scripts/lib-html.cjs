'use strict';
// 격리 테스트 공용 헬퍼 — public/*.html 원문을 읽어 인라인 스크립트·함수 본문을 슬라이스한다.
//   (이 파일은 러너 대상이 아니다 — 이름이 test-*.cjs / *-test.cjs 가 아니므로.)
//
// 🔴 테스트는 배포될 바이트(작업트리 public/)를 그대로 읽는다. 손으로 옮긴 복사본을 검사하지 말 것.
// 🔴 주석 제거는 "줄 첫머리 //" 와 블록주석만 — `///.*$/gm` 은 'https://…' 의 // 부터 코드를 지운다
//    (playbook core-verify, callcenter 2026-08-19 실제로 밟음). 줄 번호가 원문과 맞도록 개행은 보존한다.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function readHtml(name) {
  return fs.readFileSync(path.join(PUBLIC, name), 'utf8').replace(/\r\n/g, '\n');
}

function htmlFiles() {
  return fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html')).sort();
}

// 인라인 <script>(src 없음) 추출. type 이 없거나 text/javascript = classic, module = module.
// 그 외(type="application/json" 등 데이터 블록)는 JS 가 아니므로 제외한다.
function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const t = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    let kind;
    if (!t || /^(text|application)\/javascript$/i.test(t)) kind = 'classic';
    else if (/^module$/i.test(t)) kind = 'module';
    else continue;
    const bodyStart = m.index + m[0].indexOf('>') + 1;
    const startLine = html.slice(0, bodyStart).split('\n').length; // 본문 1행 = html 의 이 줄
    out.push({ kind, code: m[2], startLine });
  }
  return out;
}

// 줄 번호 보존 주석 제거(블록주석 → 개행만 남김, 줄 첫머리 // → 빈 줄)
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''))
    .replace(/^[ \t]*\/\/.*$/gm, ''); // 🔴 `^\s*` 는 앞 빈 줄의 개행까지 먹어 줄 번호가 밀린다 — 공백·탭만
}

// index.html 의 전체 인라인 스크립트를 html 줄 번호가 유지되도록 한 덩어리로 돌려준다.
//   반환 문자열의 N번째 줄 = index.html 의 N번째 줄(스크립트 밖은 빈 줄).
function scriptView(name) {
  const html = readHtml(name);
  const lines = html.split('\n').map(() => '');
  for (const s of inlineScripts(html)) {
    stripComments(s.code).split('\n').forEach((l, i) => { lines[s.startLine - 1 + i] = l; });
  }
  return lines.join('\n');
}

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

// anchor 문자열(정규식) 뒤 첫 `{` 부터 짝 맞는 `}` 까지 본문을 잘라 준다. 못 찾으면 null.
function sliceBody(text, anchorRe) {
  const m = anchorRe.exec(text);
  if (!m) return null;
  const open = text.indexOf('{', m.index + m[0].length - 1);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return { body: text.slice(open, i + 1), start: lineOf(text, open), end: lineOf(text, i) }; }
  }
  return null;
}

// 괄호 짝 맞춰 호출 인자 텍스트를 잘라 준다(openIdx = '(' 위치).
function sliceParens(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (depth === 0) return text.slice(openIdx + 1, i); }
  }
  return text.slice(openIdx + 1);
}

// 실패 수집·출력(한국어). 에이전트가 읽고 스스로 고칠 수 있게 "무엇이 / 왜 / 어디" 를 찍는다.
function reporter(title) {
  const fails = [];
  return {
    fail(msg) { fails.push(msg); },
    ok(msg) { console.log('  ✓ ' + msg); },
    done() {
      if (fails.length) {
        console.log(`❌ ${title} — ${fails.length}건 위반`);
        fails.forEach((f) => console.log('  - ' + f));
        process.exit(1);
      }
      console.log(`✅ ${title}`);
    },
  };
}

module.exports = { ROOT, PUBLIC, readHtml, htmlFiles, inlineScripts, stripComments, scriptView, lineOf, sliceBody, sliceParens, reporter };
