// ============================================================================
// [설정 영역]
// 1. 실제 사용 중인 구글 스프레드시트 ID
const SPREADSHEET_ID = "1t5SZJ-6DQNR6G-2gQMzo2P0lWtyiIV-vugwiLe-mqz4"; 
const SHEET_NAME = "imported"; // 데이터를 읽어올 시트 이름

// 2. 앱 접속 주소
const APP_URL = "https://approval-8ef73.web.app";
// ============================================================================

/**
 * [트리거 함수] 매일 아침 실행될 함수
 * - 시트를 확인하여 미결재 상태인 건을 결재자별로 집계(Count)합니다.
 * - 개별 건마다 메일을 보내지 않고, 1인당 1통의 '요약 리마인드' 메일을 발송합니다.
 */
function sendDailyPendingReminders() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    console.error(`[오류] '${SHEET_NAME}' 시트를 찾을 수 없습니다.`);
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return; // 데이터 없음

  const headers = data[0];
  const rows = data.slice(1);
  // 컬럼 인덱스 찾기
  const idxMap = {
    docId: headers.indexOf('DocID'),
    appr1Email: headers.indexOf('1차결재자이메일'), 
    appr1Status: headers.indexOf('1차결재상태'),
    appr2Email: headers.indexOf('2차결재자이메일'),
    appr2Status: headers.indexOf('2차결재상태')
  };
  // 필수 컬럼 확인
  if (idxMap.appr1Email === -1 || idxMap.appr2Email === -1) {
    console.error("[오류] 결재자 이메일 컬럼이 없습니다.");
    return;
  }

  // 이메일별 미결재 건수 집계용 객체 생성
  let pendingMap = {};
  // 예: { 'ceo@dy.co.kr': 3, 'manager@dy.co.kr': 1 }

  rows.forEach(row => {
    const status1 = row[idxMap.appr1Status];
    const status2 = row[idxMap.appr2Status];
    let targetEmail = null;

    // [로직] 누구에게 독촉 메일을 보낼 것인가?
    if (!status1 || status1 === '대기') {
      targetEmail = row[idxMap.appr1Email];
    }
    else if (status1 === '결재' && (!status2 || status2 === '대기')) {
      targetEmail = row[idxMap.appr2Email];
    }
    
    // 유효한 이메일이면 카운트 증가 ("전결"이나 "반려" 등은 무시)
    if (targetEmail && targetEmail !== '전결' && String(targetEmail).includes('@')) {
      pendingMap[targetEmail] = (pendingMap[targetEmail] || 0) + 1;
    }
  });

  // 집계된 데이터를 바탕으로 메일 일괄 발송
  let emailCount = 0;
  const recipients = Object.keys(pendingMap);
  recipients.forEach(email => {
    const count = pendingMap[email];
    
    // 요약 메일용 가상의 draft 객체 생성
    const summaryDraft = {
      count: count,  // 건수 전달
      title: `미결재 문서 총 ${count}건`, // 메일 제목
      drafter: "시스템 알림",
      corporation: "-",
      docId: "-",
      category: "결재 대기",
      date: formatDate(new Date()),
      // 본문에 들어갈 안내 멘트
      content: `현재 귀하가 결재해야 할 문서가 <strong>총 ${count}건</strong> 있습니다.<br>시스템에 접속하여 일괄 결재를 진행해 주세요.`
    };

    // 타입을 'REMIND_SUMMARY'로 지정하여 발송
    sendEmailInternal('REMIND_SUMMARY', summaryDraft, email);
    emailCount++;
  });
  console.log(`[Daily Remind] 총 ${emailCount}명에게 요약 리마인드 메일 발송 완료.`);
}

/**
 * 웹 앱 요청 처리 (Client에서 보내는 데이터 수신)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const type = data.type; // NEW, APPROVED, REJECT, REMIND
    const draft = data.draft;

    let recipients = "";
    // 수신자 설정 로직
    switch (type) {
      case 'NEW':
        if (draft.category === '대외비') {
           recipients = [draft.approver1Email, draft.approver2Email, draft.drafterEmail]
             .filter(email => email && String(email).includes('@'))
             .join(',');
        } else {
           recipients = `all@dongyeongtour.co.kr,${draft.drafterEmail}`;
        }
        break;

      case 'APPROVED':
        recipients = draft.drafterEmail;
        break;

      case 'REJECT':
        recipients = draft.drafterEmail;
        break;
      case 'REMIND':
        if (!draft.approval1Status) {
          recipients = draft.approver1Email;
        } else if (draft.approval1Status === '결재' && !draft.approval2Status) {
          recipients = draft.approver2Email;
        }
        break;
    }

    if (recipients) {
      sendEmailInternal(type, draft, recipients);
    }

    return ContentService.createTextOutput(JSON.stringify({ result: "success" }));
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", msg: error.message }));
  }
}

/**
 * 내부 이메일 발송 헬퍼 함수
 * - 기존 MailApp 대신 GmailApp을 사용하여 'from' 별칭 발송 기능 지원
 */
function sendEmailInternal(type, draft, recipients) {
  let subject = "";
  let badgeText = "";
  let colorTheme = "#2563eb"; // 기본 파랑

  switch (type) {
    case 'NEW':
      subject = `[기안상신] ${draft.title} (기안자: ${draft.drafter})`;
      badgeText = "신규 기안";
      break;
    case 'APPROVED':
      subject = `[결재완료] ${draft.title} 건이 최종 승인되었습니다.`;
      colorTheme = "#16a34a"; // 녹색
      badgeText = "결재 완료";
      break;
    case 'REJECT':
      subject = `[반려알림] ${draft.title} 건이 반려되었습니다.`;
      colorTheme = "#dc2626"; // 빨강
      badgeText = "반려 처리";
      break;
    // 리마인드 요약용 케이스
    case 'REMIND_SUMMARY':
      subject = `[결재요청] 미결재 문서가 ${draft.count}건 있습니다.`;
      colorTheme = "#ea580c"; // 주황색
      badgeText = "미결재 현황";
      break;
    // 개별 리마인드 (기존 호환성)
    case 'REMIND':
      subject = `[결재요청] 미결재 문서가 있습니다: ${draft.title}`;
      colorTheme = "#ea580c"; // 주황
      badgeText = "결재 대기";
      break;
  }

  // [수정 포인트] 결재 행동이 필요한 타입인 경우 URL에 파라미터 추가
  let targetUrl = APP_URL;
  if (type === 'NEW' || type === 'REMIND' || type === 'REMIND_SUMMARY') {
    // 기존 URL 뒤에 ?menu=toApprove 를 붙임
    targetUrl = APP_URL + "?menu=toApprove";
  }

  // APP_URL 대신 수정된 targetUrl을 템플릿에 전달
  const htmlBody = getHtmlTemplate(draft, type, badgeText, colorTheme, targetUrl);

  // GmailApp.sendEmail 사용 (alias 발송을 위해 필수)
  try {
    GmailApp.sendEmail(recipients, subject, "", { // 본문은 htmlBody로 대체하므로 빈 문자열
      htmlBody: htmlBody,
      name: "동영관광 결재시스템",
      from: "dy@dongyeongtour.co.kr" // 지메일 설정에 등록된 별칭
    });
  } catch (e) {
    // 별칭 권한이 없거나 오류 발생 시 기본 계정으로 발송 시도
    console.warn("GmailApp 별칭 발송 실패, MailApp으로 재시도합니다: " + e.message);
    MailApp.sendEmail({
      to: recipients,
      subject: subject,
      htmlBody: htmlBody,
      name: "동영관광 결재시스템"
    });
  }
}

/**
 * HTML 이메일 템플릿 생성 함수
 * - 'REMIND_SUMMARY' 타입일 경우 불필요한 테이블(Grid) 정보를 숨깁니다.
 */
function getHtmlTemplate(draft, type, badgeText, color, link) {
  
  // [NEW] 요약 메일인지 확인하는 플래그
  const isSummary = (type === 'REMIND_SUMMARY');
  let rawContent = draft.content || "";
  if (!rawContent.trim()) {
    rawContent = "(상세 내용이 없거나 불러올 수 없습니다)";
  }

  let formattedContent = rawContent
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n')      
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n') 
      .replace(/&nbsp;/gi, ' ')
      .replace(/<[^>]*>?/gm, ''); // 태그 제거

  formattedContent = formattedContent.replace(/\n{3,}/g, '\n\n'); // 연속 줄바꿈 축소
  
  const maxLength = 500;
  if (formattedContent.length > maxLength) {
    formattedContent = formattedContent.substring(0, maxLength) + '...';
  }

  const appr1Disp = draft.approver1Name ? `${draft.approver1Name} (${draft.approval1Status || '대기'})` : '-';
  const appr2Disp = draft.approver2Name ?
    `${draft.approver2Name} (${draft.approval2Status || '대기'})` : '-';

  // [변경점] 요약 메일이 아닐 때만 표시할 HTML 조각들 생성
  
  // 1. 문서 번호 및 날짜 (요약 메일엔 불필요)
  const subHeaderHtml = isSummary ?
    '' : 
    `<div style="margin-top: 8px; font-size: 13px; color: #6b7280;">문서번호: ${draft.docId} | 기안일: ${draft.date}</div>`;
  // 2. 상세 정보 테이블 (법인, 구분, 기안자 등 - 요약 메일엔 불필요)
  const infoGridHtml = isSummary ?
    '' : `
        <div class="info-grid">
          <div class="info-row">
            <span class="info-label">법인</span>
            <span class="info-value">${draft.corporation}</span>
          </div>
          <div class="info-row">
            <span class="info-label">구분</span>
            <span class="info-value"><span class="badge">${draft.category}</span></span>
          </div>
          <div class="info-row">
            <span class="info-label">기안자</span>
            <span class="info-value">${draft.drafter}</span>
          </div>
          <div class="info-row">
            <span class="info-label">1차 결재자</span>
            <span class="info-value">${appr1Disp}</span>
         </div>
          <div class="info-row">
            <span class="info-label">2차 결재자</span>
            <span class="info-value">${appr2Disp}</span>
          </div>
        </div>`;
  // 3. 상세 내용 박스 타이틀 (요약 메일이면 '알림 내용'으로 변경)
  const detailsTitle = isSummary ?
    '알림 내용' : '기안 상세 내용';

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: 'Noto Sans KR', sans-serif;
        background-color: #f3f4f6; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 20px auto;
        background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;
      }
      .header { background-color: ${color}; padding: 30px 20px; text-align: center; color: white;
      }
      .header h1 { margin: 0; font-size: 24px; font-weight: bold; color: #ffffff !important;
      }
      .header p { margin: 10px 0 0; font-size: 14px; opacity: 0.9; color: #ffffff !important;
      }
      .content { padding: 30px;
      }
      
      /* info-grid 스타일은 유지 */
      .info-grid { display: table;
        width: 100%; border-collapse: collapse; margin-bottom: 25px; }
      .info-row { display: table-row; border-bottom: 1px solid #f0f0f0;
      }
      .info-label { display: table-cell; padding: 12px 0; font-size: 13px; color: #6b7280; font-weight: 600;
        width: 100px; vertical-align: top; }
      .info-value { display: table-cell; padding: 12px 0; font-size: 14px;
        color: #1f2937; font-weight: 500; }
      
      .badge { display: inline-block;
        padding: 4px 10px; border-radius: 20px; background-color: ${color}15; color: ${color}; font-size: 12px; font-weight: bold;
      }
      .details-box { background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 30px; border: 1px solid #e5e7eb;
      }
      .details-title { font-size: 13px; font-weight: bold; color: #6b7280; margin-bottom: 10px; text-transform: uppercase;
      }
      .details-text { font-size: 14px; line-height: 1.6; color: #374151; white-space: pre-wrap;
        font-family: 'Noto Sans KR', sans-serif; }
      .btn-container { text-align: center; margin-top: 20px;
      }
      .btn { display: inline-block; background-color: ${color} !important; color: #ffffff !important; padding: 14px 30px;
        border-radius: 8px; text-decoration: none !important; font-weight: 800 !important; font-size: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid ${color};
      }
      .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af;
        border-top: 1px solid #e5e7eb; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>${badgeText} 알림</h1>
        <p>기안서 처리 현황을 알려드립니다.</p>
      </div>
      
      <div class="content">
        <div style="margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 20px; color: #111827;">${draft.title}</h2>
          ${subHeaderHtml}
        </div>

        ${infoGridHtml}

        <div class="details-box">
          <div class="details-title">${detailsTitle}</div>
          <div class="details-text">${formattedContent}</div>
          
          ${(!isSummary && draft.approval1Comment) ?
             `<div style="margin-top:15px; border-top:1px dashed #e5e7eb; padding-top:10px;">
             <strong style="font-size:13px; color:${color};">[1차 의견]</strong> 
             <span style="font-size:14px; color:#374151;">${draft.approval1Comment}</span>
           </div>` : ''}
          
          ${(!isSummary && draft.approval2Comment) ?
             `<div style="margin-top:10px;">
             <strong style="font-size:13px; color:${color};">[2차 의견]</strong> 
             <span style="font-size:14px; color:#374151;">${draft.approval2Comment}</span>
           </div>` : ''}
        </div>

        <div class="btn-container">
          <a href="${link}" class="btn">시스템 접속하여 확인하기</a>
        </div>
      </div>

      <div class="footer">
        본 메일은 동영관광 결재 시스템에서 발송된 발신전용 메일입니다.<br>
        &copy; Dongyoung Tourism. All rights reserved.
      </div>
    </div>
  </body>
  </html>
  `;
}

// [유틸리티] 날짜 포맷팅 함수
function formatDate(date) {
  if (!date) return '';
  if (typeof date === 'string') return date.substring(0, 10);
  try {
    return Utilities.formatDate(new Date(date), "Asia/Seoul", "yyyy-MM-dd");
  } catch (e) {
    return date;
  }
}