// --- 공통 설정 (Configuration) ---
const COL_NAME = 1;     // B열: 이름
const COL_TOPIC = 7;    // H열: 2부 논의주제
const COL_EMAIL = 9;    // J열: 이메일

// 저장 위치 (1부터 시작하는 Range 기준이 아닌 0부터 시작하는 배열 기준 인덱스)
const COL_ASSIGNED_TOPIC = 10; // K열
const COL_ASSIGNED_TABLE = 11; // L열
const COL_SEND_STATUS = 12;    // M열

/**
 * 1. 폼 제출 시 즉시 실행되는 함수 (신청 완료 및 기본 안내)
 * 설정 방법: Apps Script 왼쪽 메뉴 '트리거(시계 아이콘)' -> 트리거 추가 -> 'onFormSubmit' 선택 -> 이벤트 유형 '양식 제출 시'로 설정
 */
function onFormSubmit(e) {
  try {
    // e.values 배열 기준 인덱스
    const name = e.values[COL_NAME];
    const email = e.values[COL_EMAIL];

    if (!email || !email.includes('@')) return; // 이메일이 없거나 유효하지 않은 경우 종료

    const subject = "[사회연대경제혁신센터] 마주 워크숍 참가 신청이 완료되었습니다.";
    const body = `
      <div style="font-family: 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2>마주 워크숍 참가 신청 완료 안내</h2>
        <p>안녕하세요, <strong>${name}</strong>님.</p>
        <p>사회연대경제혁신센터 운영모색을 위한 '마주 워크숍' 참가 신청이 정상적으로 접수되었습니다.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #0f172a;">[6/9 행사 기본 안내]</h3>
          <ul style="line-height: 1.6; padding-left: 20px; margin-bottom: 0;">
            <li><strong>일시:</strong> 2026년 6월 9일 (화) 오후 2시</li>
            <li><strong>장소:</strong> 사회연대경제혁신센터 다목적홀</li>
            <li><strong>안내:</strong> 본 행사는 1부(특강 및 안내)와 2부(원탁 토의)로 나뉘어 진행됩니다.</li>
          </ul>
        </div>

        <p style="color: #ef4444; font-weight: bold;">[중요] 2부 토의 주제 지정 및 입장용 QR 코드 안내</p>
        <p>참가자분들이 신청 시 선택해주신 '2부 토의주제'를 바탕으로 현재 테이블 배정 작업을 진행 중입니다.</p>
        <p><strong>행사 전날, 최종 배정된 [토의 주제 / 테이블 번호]와 당일 현장 체크인을 위한 [출석용 QR코드]를 본 이메일로 다시 보내드릴 예정입니다.</strong></p>
        
        <p>감사합니다.</p>
      </div>
    `;

    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: body
    });
  } catch (error) {
    console.error("접수 메일 에러: " + error.toString());
  }
}

/**
 * 2. 행사 전날 일괄 실행하는 함수 (주제 배정, 테이블 지정, QR 생성 및 발송)
 * 실행 방법: 시트 상단에 생성된 '워크숍 관리' 메뉴 -> '최종 안내 및 QR 메일 일괄 발송' 클릭
 */
function sendFinalNoticeWithQR() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("설문지 응답 시트1");
  if (!sheet) {
    SpreadsheetApp.getUi().alert("오류: '설문지 응답 시트1' 시트를 찾을 수 없습니다.");
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  
  // 첫 번째 행(헤더)에 배정 및 발송 확인용 열 추가 (K, L, M열)
  if (data[0].length <= COL_ASSIGNED_TOPIC) {
    sheet.getRange(1, COL_ASSIGNED_TOPIC + 1).setValue("배정된 주제");
    sheet.getRange(1, COL_ASSIGNED_TABLE + 1).setValue("테이블 번호");
    sheet.getRange(1, COL_SEND_STATUS + 1).setValue("최종메일발송상태");
  }

  let sentCount = 0;

  // 2번째 행(데이터 시작)부터 반복 실행
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[COL_NAME];       // B열: 이름
    const topicsRaw = row[COL_TOPIC]; // H열: 2부 토의주제
    const email = row[COL_EMAIL];     // J열: 이메일
    
    let assignedTopic = row[COL_ASSIGNED_TOPIC]; // K열: 배정된 주제
    let assignedTable = row[COL_ASSIGNED_TABLE]; // L열: 테이블 번호
    const isSent = row[COL_SEND_STATUS];         // M열: 발송 상태

    // 이메일이 없거나 유효하지 않거나, 이미 발송된 경우 다음 사람으로 넘어감
    if (!email || !email.includes('@') || isSent === "발송완료") continue;

    // --- 주제 및 테이블 지정 로직 (자동화) ---
    if (!assignedTopic) {
      // 신청한 2개의 주제 중 첫 번째 주제를 우선 배정하는 단순 로직 (콤마 분리)
      const topicArray = topicsRaw ? topicsRaw.toString().split(',') : ["미지정 주제"];
      assignedTopic = topicArray[0].trim(); 
      
      // 임시 테이블 번호 1~10 랜덤 배정 (실제 운영시 이 부분을 고도화할 수 있습니다)
      assignedTable = "Table " + (Math.floor(Math.random() * 10) + 1);

      // 시트에 배정 결과 기록 (Range는 1부터 시작하므로 인덱스 + 1)
      sheet.getRange(i + 1, COL_ASSIGNED_TOPIC + 1).setValue(assignedTopic);
      sheet.getRange(i + 1, COL_ASSIGNED_TABLE + 1).setValue(assignedTable);
    }

    // --- QR 코드 URL 생성 ---
    const qrData = encodeURIComponent(`${name}|${email}`);
    const qrUrl = `https://quickchart.io/qr?text=${qrData}&size=250`;

    // --- 최종 안내 이메일 내용 구성 ---
    const subject = `[최종안내] 내일 마주 워크숍 테이블 배정 및 입장 QR코드 안내`;
    const body = `
      <div style="font-family: 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #ddd; border-radius: 10px; padding: 30px;">
        <h2 style="color: #2563eb; text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px;">마주 워크숍 최종 참석 안내</h2>
        
        <p style="font-size: 16px;">안녕하세요, <strong>${name}</strong>님!</p>
        <p>내일(6/9) 진행되는 사회연대경제혁신센터 워크숍의 토의 테이블 배정 결과와 현장 입장용 QR코드를 안내해 드립니다.</p>
        
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <h3 style="margin-top: 0; color: #166534; font-size: 18px;">[2부 토의 배정 결과]</h3>
          <p style="font-size: 16px; margin-bottom: 5px;"><strong>📌 주제:</strong> ${assignedTopic}</p>
          <p style="font-size: 16px; margin: 0;"><strong>🪑 좌석:</strong> ${assignedTable}</p>
          <p style="font-size: 13px; color: #15803d; margin-top: 10px;">* 1부 행사 종료 후, 휴식 시간에 위 안내된 테이블로 이동해 주시기 바랍니다.</p>
        </div>

        <div style="text-align: center; background-color: #f8fafc; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #334155;">[나의 출석용 QR 코드]</h3>
          <p style="font-size: 14px; color: #64748b; margin-bottom: 15px;">입장 시 현장 데스크 또는 테이블 퍼실리테이터에게<br>아래 QR코드를 보여주세요.</p>
          <img src="${qrUrl}" alt="출석용 QR코드" style="width: 200px; height: 200px; border: 3px solid #fff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border-radius: 10px;"/>
        </div>
        
        <p style="text-align: center; font-weight: bold;">내일 행사장(사회연대경제혁신센터 다목적홀)에서 뵙겠습니다.<br>감사합니다.</p>
      </div>
    `;

    try {
      // 이메일 발송
      MailApp.sendEmail({
        to: email,
        subject: subject,
        htmlBody: body
      });

      // 시트에 발송 완료 상태 기록
      sheet.getRange(i + 1, COL_SEND_STATUS + 1).setValue("발송완료");
      sentCount++;
    } catch (err) {
      console.error(`이메일 발송 에러 (${email}): ` + err.toString());
    }
  }

  // 발송 완료 후 안내 메시지 팝업
  SpreadsheetApp.getUi().alert(`총 ${sentCount}명의 참가자에게 최종 QR 메일 발송을 완료했습니다.`);
}

/**
 * 3. 시트 상단에 실행 메뉴 추가 (스크립트를 열지 않고 시트에서 바로 클릭 가능)
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ 워크숍 관리')
    .addItem('최종 안내 및 QR 메일 일괄 발송', 'sendFinalNoticeWithQR')
    .addToUi();
}