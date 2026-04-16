 const FIREBASE_PROJECT_ID = "approval-8ef73";

  function syncToFirebase() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. 직원 리스트 동기화 ('em' 시트 -> meta/users)
    const userSheet = ss.getSheetByName('em');
    if (userSheet) {
      const data = userSheet.getDataRange().getValues();
      const userList = data.slice(1).map(row => ({
        name: row[0],
        email: row[1],
        team: row[2],
        role: row[3],
        confidentialAccess: (row[4] === '승인' || row[4] === '대외비'),
        approvalOnly: (row[5] === '결재전용'),
        isAdmin: (row[6] === '관리자')
      })).filter(u => u.email);

      updateFirestoreDocument('meta', 'users', { list: userList });
    }

    // 2. 수리비 매핑 동기화 ('repair' 시트 -> meta/repairMap)
    const repairSheet = ss.getSheetByName('repair');
    if (repairSheet) {
      const data = repairSheet.getDataRange().getValues();
      const repairMap = {};
      data.forEach(row => {
        const docId = row[2] ? row[2].toString().trim() : null;
        const cost = row[1];
        if (docId && cost) {
          repairMap[docId] = cost;
        }
      });

      updateFirestoreDocument('meta', 'repairMap', { map: repairMap });
    }
  }

  function updateFirestoreDocument(collection, docId, jsonData) {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;

    const payload = { fields: jsonToFirestore(jsonData) };

    const options = {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      Logger.log(`[성공] ${collection}/${docId} 동기화 완료 (${code})`);
    } else {
      Logger.log(`[실패 ${code}] ${collection}/${docId}: ${response.getContentText().slice(0, 300)}`); 
    }
  }

  function jsonToFirestore(obj) {
    const fields = {};
    for (const key in obj) {
      const val = obj[key];
      if (val === null || val === undefined) {
        fields[key] = { nullValue: null };
      } else if (Array.isArray(val)) {
        fields[key] = {
          arrayValue: {
            values: val.map(v => {
              if (typeof v === 'object' && v !== null) {
                return { mapValue: { fields: jsonToFirestore(v) } };
              } else if (typeof v === 'boolean') {
                return { booleanValue: v };
              } else if (typeof v === 'number') {
                return Number.isInteger(v) ? { integerValue: v } : { doubleValue: v };
              } else {
                return { stringValue: String(v) };
              }
            })
          }
        };
      } else if (typeof val === 'object') {
        fields[key] = { mapValue: { fields: jsonToFirestore(val) } };
      } else if (typeof val === 'boolean') {
        fields[key] = { booleanValue: val };
      } else if (typeof val === 'number') {
        fields[key] = Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
      } else {
        fields[key] = { stringValue: String(val) };
      }
    }
    return fields;
  }

  function setupTrigger() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => ScriptApp.deleteTrigger(t));

    ScriptApp.newTrigger('syncToFirebase')
      .timeBased()
      .everyHours(1)
      .create();

    Logger.log("트리거 설정 완료.");
  }