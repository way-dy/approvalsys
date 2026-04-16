function doPost(e) {
  const lock = LockService.getScriptLock();
  // 동시성 문제 방지: 10초 동안 락 시도
  lock.tryLock(10000);

  try {
    // 1. 시트 설정
    const sheetId = '1t5SZJ-6DQNR6G-2gQMzo2P0lWtyiIV-vugwiLe-mqz4'; // 사용 중인 시트 ID
    const sheetName = 'imported'; // 시트 이름
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName(sheetName);

    // 2. 데이터 파싱
    const data = JSON.parse(e.postData.contents);

    // 3. 헤더가 없으면 생성 (시트가 비어있는 첫 실행 시에만 작동)
    // *주의: 이미 데이터가 있는 시트라면, 구글 시트 1행에 수동으로 컬럼명을 추가해야 합니다.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'DocID', '작성일', '기안자', '법인', '구분', '제목', '결재상태', '지급일',
        '1차결재자이메일', '1차결재자이름', '1차결재상태',
        '2차결재자이메일', '2차결재자이름', '2차결재상태'
      ]);
    }

    // 4. 기존 데이터의 ID 목록 가져오기 (A열 기준 중복 체크)
    const range = sheet.getDataRange();
    const values = range.getValues();
    let rowIndex = -1;

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === data.docId) {
        rowIndex = i + 1; // 행 번호 (1부터 시작하므로 인덱스 + 1)
        break;
      }
    }

    // 5. 저장할 데이터 배열 구성 (새로운 결재자 정보 컬럼 추가)
    const rowData = [
      data.docId,
      data.date,
      data.drafter,
      data.corporation,
      data.category,
      data.title,
      data.approval2Status || '진행중', // 최종결재상태 (문서 전체 상태)
      data.paymentDate || '',
      // --- [추가] 결재 독촉 알림을 위한 상세 정보 ---
      data.approver1Email || '',  // 1차 이메일
      data.approver1Name || '',   // 1차 이름
      data.approval1Status || '', // 1차 상태
      data.approver2Email || '',  // 2차 이메일
      data.approver2Name || '',   // 2차 이름
      data.approval2Status || ''  // 2차 상태 (개별 승인 상태)
    ];

    // 6. 데이터 입력 (수정 또는 신규 추가)
    if (rowIndex > 0) {
      // [수정] 이미 존재하는 ID면 해당 행 업데이트
      // 데이터 길이가 늘어났으므로, 자동으로 우측 열까지 확장하여 덮어씁니다.
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      return ContentService.createTextOutput("Updated").setMimeType(ContentService.MimeType.TEXT);
    } else {
      // [신규] 없으면 맨 아래 추가
      sheet.appendRow(rowData);
      return ContentService.createTextOutput("Inserted").setMimeType(ContentService.MimeType.TEXT);
    }

  } catch (e) {
    return ContentService.createTextOutput("Error: " + e.toString()).setMimeType(ContentService.MimeType.TEXT);
  } finally {
    lock.releaseLock();
  }
}