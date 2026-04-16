/**
 * ============================================================
 * drafts_index 마이그레이션 스크립트
 * - 기존 drafts 컬렉션 전체를 읽어 drafts_index 경량 문서 생성
 * - Google Apps Script 에디터에서 실행
 * - 1회성 작업 (이후 신규 기안부터는 앱이 자동 저장)
 * ============================================================
 * 사용법:
 *   1. script.google.com → 새 프로젝트
 *   2. 아래 코드 붙여넣기
 *   3. FIREBASE_PROJECT_ID 확인
 *   4. migrateAll() 실행
 * ============================================================
 */

const FIREBASE_PROJECT_ID = 'approval-8ef73';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// ─── 토큰 생성 (앱과 동일한 로직) ───────────────────────────
function generateSearchTokens(text) {
  if (!text) return [];
  const clean = text.replace(/\s+/g, '');
  const tokens = new Set();
  for (let size = 1; size <= 4; size++) {
    for (let i = 0; i <= clean.length - size; i++) {
      tokens.add(clean.substring(i, i + size));
    }
  }
  text.split(/\s+/).forEach(w => { if (w) tokens.add(w); });
  return [...tokens].slice(0, 500);
}

// ─── Firestore REST → JS 객체 변환 ──────────────────────────
function firestoreToObj(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (v.stringValue  !== undefined) out[k] = v.stringValue;
    else if (v.integerValue !== undefined) out[k] = Number(v.integerValue);
    else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    else if (v.nullValue  !== undefined) out[k] = null;
    else if (v.timestampValue !== undefined) out[k] = v.timestampValue;
    else if (v.arrayValue !== undefined)
      out[k] = (v.arrayValue.values || []).map(i => i.stringValue || i.integerValue || null);
    else if (v.mapValue !== undefined) out[k] = firestoreToObj(v.mapValue.fields);
  }
  return out;
}

// ─── JS 값 → Firestore REST 형식 변환 ───────────────────────
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string')  return { stringValue: val };
  if (typeof val === 'number')  return { integerValue: String(val) };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object' && val.timestampValue) return val; // 이미 변환된 경우
  return { stringValue: String(val) };
}

function objToFirestore(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

// ─── 인증 토큰 ───────────────────────────────────────────────
function getToken() {
  return ScriptApp.getOAuthToken();
}

// ─── drafts 컬렉션 전체 읽기 (페이징) ───────────────────────
function fetchAllDrafts() {
  const all = [];
  let pageToken = null;
  do {
    let url = `${FIRESTORE_BASE}/drafts?pageSize=300`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${getToken()}` },
      muteHttpExceptions: true
    });
    const json = JSON.parse(res.getContentText());
    if (json.error) { Logger.log('Fetch 오류: ' + JSON.stringify(json.error)); break; }
    (json.documents || []).forEach(d => {
      const obj = firestoreToObj(d.fields);
      // docId는 문서 이름 마지막 부분에서 추출
      obj.docId = obj.docId || d.name.split('/').pop();
      all.push(obj);
    });
    pageToken = json.nextPageToken;
    Logger.log(`  → ${all.length}건 읽음`);
    Utilities.sleep(200); // rate limit 대비
  } while (pageToken);
  return all;
}

// ─── drafts_index 문서 저장 (PATCH = upsert) ─────────────────
function saveIndexDoc(draft) {
  const tokens = generateSearchTokens(
    [draft.title, draft.drafter, draft.category, draft.corporation].filter(Boolean).join(' ')
  );

  const indexData = {
    docId:           draft.docId           || null,
    title:           draft.title           || null,
    category:        draft.category        || null,
    corporation:     draft.corporation     || null,
    drafter:         draft.drafter         || null,
    drafterEmail:    draft.drafterEmail    || null,
    date:            draft.date            || null,
    approver1Email:  draft.approver1Email  || null,
    approver1Name:   draft.approver1Name   || null,
    approver2Email:  draft.approver2Email  || null,
    approver2Name:   draft.approver2Name   || null,
    approval1Status: draft.approval1Status || null,
    approval2Status: draft.approval2Status || null,
    paymentDate:     draft.paymentDate     || null,
    searchTokens:    tokens
  };

  // createdAt은 타임스탬프라 별도 처리
  const fields = objToFirestore(indexData).fields;
  if (draft.createdAt) {
    fields.createdAt = { timestampValue: draft.createdAt }; // 원본 타임스탬프 그대로
  }

  const url = `${FIRESTORE_BASE}/drafts_index/${draft.docId}`;
  UrlFetchApp.fetch(url, {
    method: 'PATCH',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${getToken()}` },
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true
  });
}

// ─── 메인 실행 함수 ──────────────────────────────────────────
function migrateAll() {
  Logger.log('=== drafts_index 마이그레이션 시작 ===');
  const drafts = fetchAllDrafts();
  Logger.log(`총 ${drafts.length}건 처리 시작`);

  let success = 0, fail = 0;
  drafts.forEach((draft, i) => {
    try {
      saveIndexDoc(draft);
      success++;
      if ((i + 1) % 50 === 0) {
        Logger.log(`  ${i + 1}/${drafts.length} 완료`);
        Utilities.sleep(300); // 50건마다 잠깐 대기
      }
    } catch(e) {
      fail++;
      Logger.log(`  실패 [${draft.docId}]: ${e.message}`);
    }
  });

  Logger.log(`=== 완료: 성공 ${success}건 / 실패 ${fail}건 ===`);
}