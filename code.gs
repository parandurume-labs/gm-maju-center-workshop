// --- 공통 설정 (Configuration) ---
const COL_NAME = 1;     // B열: 이름
const COL_TOPIC = 8;    // I열: 2부 토의주제
const COL_EMAIL = 9;    // J열: 이메일

// 저장 위치 (0부터 시작하는 배열 기준 인덱스)
// 폼 원본 응답 열: A(타임스탬프)~L(개인정보활용동의여부) = 12개 (인덱스 0~11)
const COL_ASSIGNED_TOPIC = 12; // M열: 배정된 주제
const COL_ASSIGNED_TABLE = 13; // N열: 테이블 번호
const COL_QR_URL = 14;         // O열: QR 코드 이미지 URL (메일 첨부용)
const COL_CHECKIN_CODE = 15;   // P열: 체크인 코드 (AppSheet QR 스캔 대조용)
const COL_CHECKIN_STATUS = 16; // Q열: 출석 상태 (AppSheet가 QR 스캔 시 Y로 업데이트)
const COL_SEND_STATUS = 17;    // R열: 최종메일발송상태

// 2부 토의 주제 목록
const PART2_TOPICS = [
  "1층 카페&베이커리 (메뉴 추천, 활용도 등)",
  "2층 팝업스토어 (판로지원, 아이디어 등)",
  "3층 교육프로그램 (희망 교육 주제)",
  "3층 체험프로그램 (희망 체험 주제)",
  "3층 소셜리빙랩 (사회 문제 실험 방식)",
  "4층 문화기획 (지역예술가 협업 프로그램)",
  "4층 시민/기업 네트워킹 (네트워킹 아이디어)",
  "옥상정원 (공간 활용 아이디어)",
  "회원 꾸러미 구성 (선물 꾸러미, 굿즈)",
  "회원 멤버십 혜택 (멤버십 운영, 회비)"
];

/**
 * 헬퍼: 폼 응답에서 선택된 주제 파싱
 * 구글 폼 체크박스 응답은 쉼표로 구분되지만, 주제명 내부에도 쉼표가 포함될 수 있어
 * 단순 split(',') 대신 PART2_TOPICS의 prefix를 기준으로 매칭한다.
 */
function parseTopics(topicsRaw) {
  if (!topicsRaw) return ["미지정 주제"];
  const raw = topicsRaw.toString();
  const matched = PART2_TOPICS.filter(topic => {
    const prefix = topic.split(' (')[0]; // 괄호 앞 핵심 키워드만 추출
    return raw.includes(prefix);
  });
  return matched.length > 0 ? matched : ["미지정 주제"];
}

/**
 * 1. 폼 제출 시 즉시 실행되는 함수 (신청 완료 및 기본 안내)
 * 설정 방법: Apps Script 왼쪽 메뉴 '트리거(시계 아이콘)' -> 트리거 추가
 *            -> 함수: onFormSubmit / 이벤트 유형: 양식 제출 시
 */
function onFormSubmit(e) {
  try {
    const name = e.values[COL_NAME];
    const email = e.values[COL_EMAIL];

    if (!email || !email.includes('@')) return;

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
            <li><strong>장소:</strong> 광명시청 1층 대회의실</li>
            <li><strong>안내:</strong> 본 행사는 1부(특강 및 안내)와 2부(원탁 토의)로 나뉘어 진행됩니다.</li>
          </ul>
        </div>

        <p style="color: #ef4444; font-weight: bold;">[중요] 2부 토의 주제 지정 및 입장용 QR 코드 안내</p>
        <p>참가자분들이 신청 시 선택해주신 '2부 토의주제'를 바탕으로 현재 테이블 배정 작업을 진행 중입니다.</p>
        <p><strong>행사 전날, 최종 배정된 [토의 주제 / 테이블 번호]와 당일 현장 체크인을 위한 [출석용 QR코드]를 본 이메일로 다시 보내드릴 예정입니다.</strong></p>

        <p>감사합니다.</p>
      </div>
    `;

    MailApp.sendEmail({ to: email, subject: subject, htmlBody: body });
  } catch (error) {
    console.error("접수 메일 에러: " + error.toString());
  }
}

/**
 * 2. 행사 전날 일괄 실행하는 함수 (주제 배정, 테이블 지정, QR 생성 및 발송)
 * 실행 방법: '🛠️ 워크숍 관리' 메뉴 -> '최종 안내 및 QR 메일 일괄 발송' 클릭
 */
function sendFinalNoticeWithQR() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("설문지 응답 시트1");
  if (!sheet) {
    SpreadsheetApp.getUi().alert("오류: '설문지 응답 시트1' 시트를 찾을 수 없습니다.");
    return;
  }

  const data = sheet.getDataRange().getValues();

  // 첫 번째 행(헤더)에 배정 및 발송 확인용 열 추가 (M~R열)
  if (data[0][COL_ASSIGNED_TOPIC] !== "배정된 주제") {
    sheet.getRange(1, COL_ASSIGNED_TOPIC + 1).setValue("배정된 주제");
    sheet.getRange(1, COL_ASSIGNED_TABLE + 1).setValue("테이블 번호");
    sheet.getRange(1, COL_QR_URL + 1).setValue("QR 코드 URL");
    sheet.getRange(1, COL_CHECKIN_CODE + 1).setValue("체크인 코드");
    sheet.getRange(1, COL_CHECKIN_STATUS + 1).setValue("출석 상태");
    sheet.getRange(1, COL_SEND_STATUS + 1).setValue("최종메일발송상태");
  }

  let sentCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[COL_NAME];       // B열: 이름
    const topicsRaw = row[COL_TOPIC]; // I열: 2부 토의주제
    const email = row[COL_EMAIL];     // J열: 이메일

    let assignedTopic = row[COL_ASSIGNED_TOPIC]; // M열: 배정된 주제
    let assignedTable = row[COL_ASSIGNED_TABLE]; // N열: 테이블 번호
    const isSent = row[COL_SEND_STATUS];         // R열: 발송 상태

    if (!email || !email.includes('@') || isSent === "발송완료") continue;

    // --- 주제 및 테이블 지정 로직 ---
    if (!assignedTopic) {
      // prefix 매칭 방식으로 주제 파싱 (주제명 내부 쉼표 대응)
      const topicArray = parseTopics(topicsRaw);
      assignedTopic = topicArray[0];

      // 임시 테이블 번호 1~10 랜덤 배정 (운영 시 시트에서 직접 수정 가능)
      assignedTable = "Table " + (Math.floor(Math.random() * 10) + 1);

      sheet.getRange(i + 1, COL_ASSIGNED_TOPIC + 1).setValue(assignedTopic);
      sheet.getRange(i + 1, COL_ASSIGNED_TABLE + 1).setValue(assignedTable);
    }

    // --- QR 코드 생성 ---
    // checkinCode: QR에 담기는 실제 값 → AppSheet에서 이 값을 스캔해 참가자 행 조회
    const checkinCode = `${name}|${email}`;
    const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(checkinCode)}&size=250`;

    sheet.getRange(i + 1, COL_QR_URL + 1).setValue(qrUrl);
    sheet.getRange(i + 1, COL_CHECKIN_CODE + 1).setValue(checkinCode);

    // --- 최종 안내 이메일 발송 ---
    const subject = `[최종안내] 6월9일 마주 워크숍 테이블 배정 및 입장 QR코드 안내`;
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

        <p style="text-align: center; font-weight: bold;">행사장(광명시청 1층 대회의실)에서 뵙겠습니다.<br>감사합니다.</p>
      </div>
    `;

    try {
      MailApp.sendEmail({ to: email, subject: subject, htmlBody: body });
      sheet.getRange(i + 1, COL_CHECKIN_STATUS + 1).setValue("N");
      sheet.getRange(i + 1, COL_SEND_STATUS + 1).setValue("발송완료");
      sentCount++;
    } catch (err) {
      console.error(`이메일 발송 에러 (${email}): ` + err.toString());
    }
  }

  SpreadsheetApp.getUi().alert(`총 ${sentCount}명의 참가자에게 최종 QR 메일 발송을 완료했습니다.`);
}

/**
 * 3. 행사 후 사후 메일 일괄 발송 (참석자/불참자 구분)
 * 실행 방법: '🛠️ 워크숍 관리' 메뉴 -> '사후 감사/안내 메일 발송' 클릭
 * 전제 조건: AppSheet에서 출석 상태(Q열)가 Y 또는 N으로 업데이트된 이후 실행
 */
function sendPostEventEmails() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("설문지 응답 시트1");
  if (!sheet) {
    SpreadsheetApp.getUi().alert("오류: '설문지 응답 시트1' 시트를 찾을 수 없습니다.");
    return;
  }

  const data = sheet.getDataRange().getValues();
  let attendedCount = 0;
  let absentCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[COL_NAME];
    const email = row[COL_EMAIL];
    const checkinStatus = row[COL_CHECKIN_STATUS]; // Q열: Y(참석) / N(불참)
    const sendStatus = row[COL_SEND_STATUS];       // R열

    if (!email || !email.includes('@')) continue;
    if (sendStatus === "사후메일발송완료") continue; // 중복 방지
    // 최종 QR 메일이 발송된(출석 상태가 초기화된) 행만 처리
    if (checkinStatus !== "Y" && checkinStatus !== "N") continue;

    try {
      if (checkinStatus === "Y") {
        const subject = `[마주 워크숍] 함께해 주셔서 감사합니다! 결과 요약 안내`;
        const body = `
          <div style="font-family: 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #ddd; border-radius: 10px; padding: 30px;">
            <h2 style="color: #2563eb; text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px;">마주 워크숍 참석 감사 안내</h2>
            <p style="font-size: 16px;">안녕하세요, <strong>${name}</strong>님!</p>
            <p>지난 6월 9일 진행된 사회연대경제혁신센터 <strong>'마주 워크숍'</strong>에 소중한 시간을 내어 함께해 주셔서 진심으로 감사드립니다.</p>
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 25px 0;">
              <h3 style="margin-top: 0; color: #166534;">[워크숍 결과 요약]</h3>
              <p>이번 워크숍에서 도출된 핵심 아이디어와 의견 요약본은 추후 센터 운영 계획에 반영될 예정입니다.</p>
              <p>결과 보고서가 완성되는 대로 별도 안내 드리겠습니다.</p>
            </div>
            <p>앞으로도 사회연대경제혁신센터의 다양한 프로그램에 많은 관심과 참여 부탁드립니다.</p>
            <p style="text-align: center; font-weight: bold; margin-top: 30px;">감사합니다.<br>사회연대경제혁신센터 드림</p>
          </div>
        `;
        MailApp.sendEmail({ to: email, subject: subject, htmlBody: body });
        attendedCount++;
      } else {
        const subject = `[마주 워크숍] 아쉽게도 함께하지 못했네요 - 결과 자료 공유`;
        const body = `
          <div style="font-family: 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #ddd; border-radius: 10px; padding: 30px;">
            <h2 style="color: #64748b; text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">마주 워크숍 결과 자료 안내</h2>
            <p style="font-size: 16px;">안녕하세요, <strong>${name}</strong>님.</p>
            <p>지난 6월 9일 진행된 사회연대경제혁신센터 <strong>'마주 워크숍'</strong>에 신청해 주셨으나, 당일 함께하지 못하셔서 아쉬웠습니다.</p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 25px 0;">
              <h3 style="margin-top: 0; color: #334155;">[워크숍 결과 요약]</h3>
              <p>이번 워크숍의 주요 논의 내용과 아이디어 요약본을 공유드립니다.</p>
              <p>결과 보고서가 완성되는 대로 별도 안내 드리겠습니다.</p>
            </div>
            <p>다음 행사에서 꼭 함께할 수 있기를 기대합니다.</p>
            <p style="text-align: center; font-weight: bold; margin-top: 30px;">감사합니다.<br>사회연대경제혁신센터 드림</p>
          </div>
        `;
        MailApp.sendEmail({ to: email, subject: subject, htmlBody: body });
        absentCount++;
      }
      sheet.getRange(i + 1, COL_SEND_STATUS + 1).setValue("사후메일발송완료");
    } catch (err) {
      console.error(`사후 메일 에러 (${email}): ` + err.toString());
    }
  }

  SpreadsheetApp.getUi().alert(`사후 메일 발송 완료: 참석자 ${attendedCount}명, 불참자 ${absentCount}명`);
}

/**
 * 4. 2부 토의용 주제별 의견 수집 폼 자동 생성
 * 실행 방법: '🛠️ 워크숍 관리' 메뉴 -> '2부 주제별 의견수집 폼 생성' 클릭
 */
function createPart2FeedbackForms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const folder = DriveApp.getFileById(ss.getId()).getParents().next();

  let statusSheet = ss.getSheetByName("폼 생성 결과");
  if (statusSheet) {
    ss.deleteSheet(statusSheet);
  }
  statusSheet = ss.insertSheet("폼 생성 결과");
  statusSheet.appendRow(["주제", "구글 폼 링크", "응답 확인 시트 이름"]);

  PART2_TOPICS.forEach(topic => {
    const formTitle = `[마주 워크숍] 2부 토의 의견 수집 - ${topic}`;
    const form = FormApp.create(formTitle);

    form.addTextItem().setTitle("성함").setRequired(true);
    form.addParagraphTextItem().setTitle(`'${topic}'에 대한 소중한 의견을 자유롭게 남겨주세요.`).setRequired(true);

    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

    const file = DriveApp.getFileById(form.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    statusSheet.appendRow([topic, form.getPublishedUrl(), "(확인 필요)"]);
  });

  SpreadsheetApp.getUi().alert("2부 주제별 의견 수집 폼 생성이 완료되었습니다.\n'폼 생성 결과' 시트를 확인해 주세요.");
}

/**
 * 5. 시트 상단에 실행 메뉴 추가
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ 워크숍 관리')
    .addItem('최종 안내 및 QR 메일 일괄 발송', 'sendFinalNoticeWithQR')
    .addSeparator()
    .addItem('사후 감사/안내 메일 발송 (참석자·불참자)', 'sendPostEventEmails')
    .addSeparator()
    .addItem('2부 주제별 의견수집 폼 생성', 'createPart2FeedbackForms')
    .addToUi();
}

/**
 * [고급] AI 요약 기능 (참고용)
 * 응답 시트에서 "=AI_SUMMARIZE(범위)" 형태로 사용할 수 있는 사용자 정의 함수 예시입니다.
 * 실제 사용을 위해서는 Gemini API 키 설정 등이 필요합니다.
 */
function AI_SUMMARIZE(contentRange) {
  if (!contentRange) return "데이터가 없습니다.";
  const text = Array.isArray(contentRange) ? contentRange.flat().filter(String).join("\n") : contentRange;
  return "[AI 요약 기능 예시] 의견들을 모아서 분석하는 로직이 여기에 들어갑니다. (API 연동 필요)";
}
