// --- 공통 설정 (Configuration) ---
// 0:Time, 1:성명, 2:소속, 3:연락처, 4:이메일 ...
const NAME_INDEX = 1;   // B열
const PHONE_INDEX = 3;  // D열
const EMAIL_INDEX = 4;  // E열

// 저장 위치 (1부터 시작: J=10, M=13)
const QR_SAVE_COL = 10;      // J열
const REMIND_STATUS_COL = 13; // M열

// 행사 정보
const EVENT_NAME = "2026 광명시 사회연대경제 사업설명회";
const EVENT_DATE = "2026. 1. 13. (화) 13:50 ~ 16:00";
const EVENT_LOCATION = "광명시청 본관 1층 대회의실";
const CONTACT_INFO = "02-2680-6333";

/**
 * 1. 메뉴 생성 함수 (시트를 열 때 자동 실행)
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('➡️ 행사 관리 기능')
      .addItem('📧 리마인더 메일 일괄 발송', 'sendReminderEmails')
      .addToUi();
}

/**
 * 2. 신청 시 자동 메일 발송 함수 (트리거용)
 */
function sendEventConfirmation(e) {
  try {
    const responses = e.values;
    const userName = responses[NAME_INDEX];
    const userPhone = responses[PHONE_INDEX];
    const userEmail = responses[EMAIL_INDEX];

    // 필수 정보 유효성 검사
    if (!userName || !userPhone) {
      console.error("필수 정보 누락 - 성명: " + userName + ", 연락처: " + userPhone);
      return;
    }

    if (!userEmail || !userEmail.includes('@')) {
      console.error("유효하지 않은 이메일: " + userEmail);
      return;
    }

    // QR 코드 데이터: 성명|연락처 형식
    const qrData = userName + "|" + userPhone;
    const qrImageUrl = generateQRCode(qrData);

    // 시트에 QR 저장 (getActiveSheet 대신 명시적으로 시트 이름 지정)
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Form Responses 1");
    if (!sheet) {
      console.error("'Form Responses 1' 시트를 찾을 수 없습니다.");
      return;
    }

    const row = e.range.getRow();
    sheet.getRange(row, QR_SAVE_COL).setValue(qrImageUrl);

    // 메일 발송
    sendEmail(userEmail, userName, qrImageUrl, "참가확정");

  } catch (error) {
    console.error("접수 메일 에러: " + error.toString());
  }
}

/**
 * 3. 리마인더 메일 일괄 발송 함수 (메뉴 클릭용)
 */
function sendReminderEmails() {
  // [중요] 실제 시트 이름인 'Form Responses 1'을 사용해야 합니다.
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Form Responses 1"); 
  
  const ui = SpreadsheetApp.getUi();
  if (!sheet) {
    ui.alert("오류: 'Form Responses 1' 시트를 찾을 수 없습니다.");
    return;
  }

  const dataRange = sheet.getDataRange();
  const data = dataRange.getValues();
  
  let sentCount = 0;
  
  // 2행부터 루프 (헤더 제외)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const userEmail = row[EMAIL_INDEX];
    const userName = row[NAME_INDEX];
    // 배열 인덱스는 0부터이므로 J열(10번째)은 인덱스 9
    const qrImageUrl = row[QR_SAVE_COL - 1]; 
    // M열(13번째)은 인덱스 12
    const remindStatus = row[REMIND_STATUS_COL - 1];
    
    // 이메일이 있고, QR이 있고, 아직 발송 안 했다면
    if (userEmail && qrImageUrl && remindStatus !== "발송완료") {
      try {
        sendEmail(userEmail, userName, qrImageUrl, "리마인더");
        
        // M열에 '발송완료' 표시 (i+1 행)
        sheet.getRange(i + 1, REMIND_STATUS_COL).setValue("발송완료");
        sentCount++;
      } catch (err) {
        console.error("리마인더 에러 (" + userEmail + "): " + err.toString());
      }
    }
  }
  
  ui.alert(`총 ${sentCount}건의 리마인더 메일을 발송했습니다.`);
}

/**
 * 헬퍼 함수: QR 코드 생성
 */
function generateQRCode(text) {
  const encodedText = encodeURIComponent(text);
  return `https://quickchart.io/qr?text=${encodedText}&size=300`;
}

/**
 * 헬퍼 함수: 이메일 발송
 */
function sendEmail(to, name, qrUrl, type) {
  let subject = "";
  let intro = "";
  
  if (type === "참가확정") {
    subject = `[참가확정] ${EVENT_NAME} 입장 QR 코드`;
    intro = "참가 신청이 완료되었습니다.";
  } else {
    subject = `[D-Day 알림] ${EVENT_NAME} 행사 안내`;
    intro = "행사가 곧 시작됩니다! 잊지 말고 참석해주세요.";
  }

  const htmlBody = `
    <div style="font-family: 'Malgun Gothic', sans-serif; max-width: 600px; padding: 20px; border: 1px solid #ddd;">
      <h2 style="color: #E91E63;">${EVENT_NAME}</h2>
      <p>안녕하세요, <strong>${name}</strong>님.</p>
      <p>${intro} 입장 시 아래 QR 코드를 제시해주세요.</p>
      <hr>
      <div style="text-align: center; margin: 30px 0;">
        <img src="${qrUrl}" alt="QR Code" style="border: 1px solid #ccc; padding: 10px; border-radius: 10px;">
      </div>
      <p><strong>일시:</strong> ${EVENT_DATE}</p>
      <p><strong>장소:</strong> ${EVENT_LOCATION}</p>
      <hr>
      <p style="font-size: 12px; color: #666;">문의: ${CONTACT_INFO}</p>
    </div>
  `;

  MailApp.sendEmail({
    to: to,
    subject: subject,
    htmlBody: htmlBody
  });
}