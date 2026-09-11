# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Korean-language internal approval / decision-making system ("DY 의사결정시스템") for the DY corporate group. The entire application is a **single static HTML file** (`public/index.html`, ~2700 lines) deployed to Firebase Hosting. There is no build step, no bundler, no `package.json` dependencies — Tailwind, Bootstrap Icons, and Firebase SDK are loaded from CDNs at runtime via ES modules.

> 🔴 상세는 아래 토픽 파일이 정본이다. **작업 토픽에 해당하는 파일만 읽는다**(통째 로드 금지).

@.claude/architecture.md
@.claude/caching.md
@.claude/permissions.md
@.claude/integrations.md
@.claude/conventions.md

## Commands

This project uses the Firebase CLI exclusively. All commands run from the repo root.

- `firebase serve` — local preview at http://localhost:5000 against `public/`
- `firebase deploy --only hosting` — deploy `public/` to project `approval-8ef73`
- `firebase deploy --only firestore:rules` — deploy `firestore.rules`
- `firebase deploy --only firestore:indexes` — deploy `firestore.indexes.json` (composite indexes)
- `firebase login` / `firebase use approval-8ef73` — auth / project switching

There are **no tests, no linter, no build**. Editing `public/index.html` and refreshing the browser is the entire dev loop. The `package-lock.json` at the root is essentially empty (no `package.json` exists).

## 중요 이슈 기록 / 작업 상태

- 이슈 기록: [`.claude/issues.md`](.claude/issues.md)
- 작업 체크박스: [`.claude/tasks.md`](.claude/tasks.md)
