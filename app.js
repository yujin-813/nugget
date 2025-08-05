// 로그인 버튼 클릭 시 /authorize로 리다이렉트
const loginButton = document.getElementById('login-btn');
if (loginButton) {
    loginButton.addEventListener('click', function() {
        window.location.href = '/authorize';
    });
}document.addEventListener('DOMContentLoaded', function () {
    console.log('[INFO] DOMContentLoaded 이벤트 실행됨');

    const loginButton = document.getElementById('login-btn');
    const hamburgerMenu = document.getElementById('hamburger-menu');
    const sidebar = document.getElementById('sidebar');
    const leftLayout = document.querySelector('.left-layout');
    const navbar = document.querySelector('.navbar');
    const createNewReportButton = document.getElementById('create-new-report');
    const savedReportsContainer = document.getElementById('saved-reports');
    const reportTitle = document.getElementById('report-title');
    const reportDescription = document.getElementById('report-description');
    const saveReportButton = document.getElementById('save-report');
    const deleteReportButton = document.getElementById('delete-report');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const reportTitleHeader = document.getElementById('report-title-header');
    const reportContents = document.getElementById('report-contents');
    const savedReportButton = document.getElementById('saved-report');
    // "그래프로 보기" 버튼 클릭 이벤트 처리
    document.body.addEventListener('click', function(event) {
        if (event.target && event.target.classList.contains('graph-view-btn')) {
            const metric = event.target.getAttribute('data-metric');
            const startDate = event.target.getAttribute('data-start-date');
            const endDate = event.target.getAttribute('data-end-date');
            const propertyId = currentSelectedPropertyId;
    
            console.log('[DEBUG] graph-view-btn 버튼 클릭됨 - 매개변수:', { metric, startDate, endDate, propertyId });
    
            if (!metric || !startDate || !endDate || !propertyId) {
                console.error('[ERROR] showGraph 함수에 필요한 매개변수가 누락되었습니다.', { metric, startDate, endDate, propertyId });
                return;
            }
    
            if (!isValidDate(startDate) || !isValidDate(endDate)) {
                console.error('[ERROR] 날짜 형식이 올바르지 않습니다.', { startDate, endDate });
                return;
            }
    
            const validMetrics = ['activeUsers', 'screenPageViews', 'sessions'];
            if (!validMetrics.includes(metric)) {
                console.error('[ERROR] 유효하지 않은 메트릭입니다.', { metric });
                return;
            }
    
            showGraph(propertyId, metric, startDate, endDate);
        }
    });

    // 날짜 유효성 검사 함수
    function isValidDate(dateString) {
        const date = new Date(dateString);
        return !isNaN(date.getTime());
    }

    // 햄버거 메뉴 클릭 시 사이드 메뉴 열기/닫기
    if (hamburgerMenu) {
        hamburgerMenu.addEventListener('click', function() {
            console.log('[INFO] 햄버거 메뉴 클릭됨');
            toggleSidebar();
        });
    }

    // 새 리포트 만들기 버튼 클릭
    if (createNewReportButton) {
        createNewReportButton.addEventListener('click', createNewReport);
    }

    // 리포트 저장 버튼 클릭
    if (saveReportButton) {
        saveReportButton.addEventListener('click', saveReport);
    }

    // 리포트 삭제 버튼 클릭
    if (deleteReportButton) {
        deleteReportButton.addEventListener('click', deleteReport);
    }

    // 페이지 로드 시 기존 리포트 목록 불러오기
    loadSavedReports();

    // 사이드 메뉴 열기/닫기
    function toggleSidebar() {
        if (sidebar && leftLayout && navbar) {
            const isClosed = sidebar.classList.contains('closed');
            sidebar.classList.toggle('closed', !isClosed);
            sidebar.classList.toggle('expanded', isClosed);
            leftLayout.classList.toggle('expanded', isClosed);
            navbar.classList.toggle('expanded', isClosed);
        } else {
            console.error('[ERROR] 사이드바 관련 요소를 찾을 수 없습니다.');
        }
    }

    // 햄버거 클릭 핸들러
    function handleHamburgerClick(event) {
        console.log('[INFO] 햄버거 메뉴 클릭됨');
        toggleSidebar();
    }

    // 중복 방지를 위한 기존 리스너 제거 후 새 리스너 등록
    if (hamburgerMenu) {
        hamburgerMenu.replaceWith(hamburgerMenu.cloneNode(true)); // 기존 리스너 제거
        const newHamburgerMenu = document.getElementById('hamburger-menu'); // 복제된 요소 가져오기
        newHamburgerMenu.addEventListener('click', handleHamburgerClick); // 새 리스너 등록
    } else {
        console.error('[ERROR] 햄버거 메뉴 버튼을 찾을 수 없습니다.');
    }

    // 저장된 리포트 목록 클릭 시 사이드바 열기
    if (savedReportButton) {
        savedReportButton.addEventListener('click', function () {
            if (sidebar && sidebar.classList.contains('closed')) {
                console.log('[INFO] 저장된 리포트 버튼 클릭 - 사이드바 열기');
                toggleSidebar(); // 토글 함수 호출
            }
        });
    } else {
        console.error('[ERROR] 저장된 리포트 버튼을 찾을 수 없습니다.');
    }


    // 새 리포트 만들기
    function createNewReport() {
        resetReportEditor();
        if (reportTitleHeader) {
            reportTitleHeader.textContent = '새 리포트 만들기';
        }
    }

    // 리포트 저장 함수
    function saveReport() {
        if (!reportTitle) {
            console.error('리포트 제목을 입력할 수 있는 요소가 없습니다.');
            return;
        }
    
        const title = reportTitle.value.trim();
        const description = reportDescription ? reportDescription.value.trim() : '';
        const startDate = startDateInput ? startDateInput.value : '';
        const endDate = endDateInput ? endDateInput.value : '';
        const content = reportContents ? reportContents.innerHTML : ''; // 리포트 내용 저장
    
        if (!title) {
            alert('리포트 제목을 입력하세요.');
            return;
        }
    
        // 리포트 데이터 생성
        const reportData = { title, description, startDate, endDate, content };
    
        // 로컬 저장소에 저장
        saveReportToLocalStorage(reportData);
    
        // 목록 업데이트
        addSavedReportToList(reportData);
    
        alert('리포트가 저장되었습니다.');
    
        // 추천 생성 호출
        const extractedData = extractReportData(); // 리포트 데이터 추출
        const benchmarks = {
            activeUsers: { threshold: 1000 },
            sessions: { threshold: 500 },
        }; // 예제 벤치마크
    
        fetchRecommendations(extractedData, benchmarks);
    }
    

    // 로컬 저장소에 리포트 저장
    function saveReportToLocalStorage(report) {
        let reports = JSON.parse(localStorage.getItem('savedReports')) || [];
        const existingIndex = reports.findIndex(r => r.title === report.title);

        if (existingIndex >= 0) {
            reports[existingIndex] = report; // 동일한 제목의 리포트가 있을 경우 업데이트
        } else {
            reports.push(report); // 새 리포트 추가
        }

        localStorage.setItem('savedReports', JSON.stringify(reports));
    }

    // 리포트 불러오기
    function loadReport(report) {
        document.querySelectorAll('.saved-report-item').forEach(item => item.classList.remove('selected'));

        const selectedItem = Array.from(savedReportsContainer.children).find(item => item.textContent === report.title);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        if (reportTitle) reportTitle.value = report.title;
        if (reportDescription) reportDescription.value = report.description;
        if (startDateInput) startDateInput.value = report.startDate;
        if (endDateInput) endDateInput.value = report.endDate;
        if (reportContents) {
            console.log('[DEBUG] Loading report content:', report.content);  // 로드된 내용 확인
            reportContents.innerHTML = report.content || '<p class="placeholder-text">이곳에 질문과 응답을 추가하세요...</p>';
        }
    }
    // 버튼 클릭 시 모든 리포트 데이터 취합
    document.getElementById('summarize-button').addEventListener('click', function () {
        const allRows = extractReportData();
    
        console.log('[DEBUG] summarize-button 클릭 - 추출된 allRows:', allRows);
    
        if (allRows.length === 0) {
            console.error('[ERROR] summarizeReport에 전달된 rows 데이터가 비어 있습니다.');
            alert('요약할 데이터가 없습니다. 리포트를 추가하세요.');
            return;
        }
    
        summarizeReport(allRows);
    });
    
    function extractReportData() {
        const reportContents = document.getElementById('report-contents');
        const reportCards = reportContents.querySelectorAll('.report-card');
    
        const allRows = [];
    
        reportCards.forEach(card => {
            const dataTable = card.querySelector('.data-table-container table tbody');
            if (!dataTable) {
                console.warn('[WARN] 리포트 카드에서 테이블을 찾을 수 없습니다:', card);
                return;
            }
    
            const rows = Array.from(dataTable.rows).map(row => {
                const cells = Array.from(row.cells);
                return {
                    date: cells[0]?.textContent.trim(),
                    value: parseFloat(cells[1]?.textContent.trim()) || 0,
                };
            });
    
            allRows.push(...rows);
        });
    
        console.log('[DEBUG] extractReportData - 추출된 데이터:', allRows);
        return allRows;
    }
    
    

    // 리포트 삭제
    function deleteReport() {
        const selectedReport = document.querySelector('.saved-report-item.selected');
        if (selectedReport) {
            const reportTitle = selectedReport.textContent;

            // 로컬 저장소에서 리포트 삭제
            deleteReportFromLocalStorage(reportTitle);

            // UI에서 리포트 제거
            savedReportsContainer.removeChild(selectedReport);
            alert('리포트가 삭제되었습니다.');

            // 리포트 삭제 후 에디터 초기화
            resetReportEditor();
            if (reportTitleHeader) {
                reportTitleHeader.textContent = '리포트 만들기';
            }
        } else {
            alert('선택된 리포트가 없습니다.');
        }
    }

    // 리포트 삭제 (로컬 저장소에서)
    function deleteReportFromLocalStorage(reportTitle) {
        let reports = JSON.parse(localStorage.getItem('savedReports')) || [];
        reports = reports.filter(report => report.title !== reportTitle);
        localStorage.setItem('savedReports', JSON.stringify(reports));
    }

    // 저장된 리포트 목록에 추가
    function addSavedReportToList(report) {
        if (savedReportsContainer) {
            if (Array.from(savedReportsContainer.children).some(item => item.textContent === report.title)) {
                return;
            }

            const reportItem = document.createElement('button');
            reportItem.classList.add('saved-report-item');
            reportItem.textContent = report.title;

            reportItem.addEventListener('click', () => loadReport(report));

            savedReportsContainer.appendChild(reportItem);
        }
    }

    // 로컬 저장소에서 저장된 리포트 목록 불러오기
    function loadSavedReports() {
        const reports = JSON.parse(localStorage.getItem('savedReports')) || [];
        reports.forEach(report => addSavedReportToList(report));
    }

    // 리포트 에디터 초기화
    function resetReportEditor() {
        if (reportTitle) reportTitle.value = '';
        if (reportDescription) reportDescription.value = '';
        if (startDateInput) startDateInput.value = '';
        if (endDateInput) endDateInput.value = '';
        if (reportContents) {
            reportContents.innerHTML = `<p class="placeholder-text">이곳에 질문과 응답을 추가하세요...</p>`;
        }
    }
});

  
document.addEventListener('DOMContentLoaded', function () {
    // 기존 요소들 로드 후 처리
    const loadMonthlyReportButton = document.getElementById('load-monthly-report');

    if (loadMonthlyReportButton) {
        loadMonthlyReportButton.addEventListener('click', function() {
            const propertyId = currentSelectedPropertyId;
            if (!propertyId) {
                alert('먼저 속성을 선택하세요.');
                return;
            }
            fetchMonthlyReport(propertyId);
        });
    }
});


// 네트워크 요청 헬퍼 함수
function fetchWithErrorHandling(url, options = {}, errorMessage = '네트워크 오류가 발생했습니다.') {
    return fetch(url, options)
        .then(response => {
            if (!response.ok) {
                console.error(`응답 상태 코드: ${response.status}, URL: ${url}`);
                throw new Error(`${errorMessage} (상태 코드: ${response.status})`);
            }
            return response.json();
        })
        .catch(error => {
            console.error(errorMessage, error);
            alert(errorMessage);
            throw error;
        });
}


// 로그인된 사용자 정보를 표시하는 함수
function displayUserInfo() {
    fetchWithErrorHandling('/get-user-info', {}, '사용자 정보를 불러오는 중 오류가 발생했습니다.')
        .then(userInfo => {
            const loginStatus = document.getElementById('login-status');
            if (loginStatus) {
                loginStatus.textContent = userInfo && userInfo.email
                    ? `로그인됨: ${userInfo.email}`
                    : '로그인되지 않았습니다.';
            }
        });
}


// 페이지가 완전히 로드된 후 실행
document.addEventListener('DOMContentLoaded', function () {
    const submitQuestionButton = document.getElementById('submit-question');
    let isProcessing = false; // 중복 요청 방지를 위한 플래그

    if (submitQuestionButton) {
        submitQuestionButton.addEventListener('click', function () {
            // 중복 요청 방지: 이미 처리 중이면 종료
            if (isProcessing) {
                console.warn('[WARN] 중복 요청 방지: 요청 처리 중');
                return;
            }
            isProcessing = true; // 요청 처리 시작

            const question = document.getElementById('user-question')?.value?.trim();
            const propertyId = document.getElementById('property-dropdown')?.value;
            const fileInput = document.getElementById('file'); // 파일 input 요소
            const uploadedFile = fileInput?.files[0]; // 파일이 선택된 경우

            console.log('[DEBUG] 질문:', question);
            console.log('[DEBUG] 속성 ID:', propertyId);
            console.log('[DEBUG] 파일 input 요소:', fileInput);
            console.log('[DEBUG] 선택된 파일:', uploadedFile);

            if (!question) {
                alert('질문을 입력하세요.');
                isProcessing = false; // 요청 처리 종료
                return;
            }

            if (uploadedFile) {
                console.log(`[INFO] 파일이 선택되었습니다: ${uploadedFile.name}`);
            } else {
                console.log('[WARN] 파일이 선택되지 않았습니다.');
            }

            // CSV 관련 질문인지 확인
            const isCsvQuestion = uploadedFile && uploadedFile.name.match(/\.(csv|xlsx)$/i);
            console.log('[DEBUG] CSV 질문 여부:', isCsvQuestion);

            // 중복 질문인지 확인
            const existingQuestions = document.querySelectorAll('.user-message');
            const isDuplicate = Array.from(existingQuestions).some(q => q.textContent === question);

            if (isDuplicate) {
                alert('동일한 질문이 이미 있습니다. 새로운 질문을 입력하세요.');
                isProcessing = false; // 요청 처리 종료
                return;
            }

            if (isCsvQuestion) {
                console.log(`[INFO] CSV 관련 질문: ${question}, 업로드된 파일: ${uploadedFile.name}`);
                submitCsvQuestion(question, uploadedFile)
                    .finally(() => { isProcessing = false; }); // 요청 처리 종료
            } else if (propertyId) {
                console.log(`[INFO] GA4 관련 질문: ${question}, Property ID: ${propertyId}`);
                submitQuestion(question, propertyId)
                    .finally(() => { isProcessing = false; }); // 요청 처리 종료
            } else {
                alert('질문에 적합한 속성 ID 또는 파일을 제공하세요.');
                isProcessing = false; // 요청 처리 종료
            }
        });
    } else {
        console.error('[ERROR] submit-question 버튼을 찾을 수 없습니다.');
    }
});

function submitQuestion(question, propertyId = null, uploadedFile = null) {
    console.log('[INFO] submitQuestion - 질문 처리 시작:', question);

    // 전역 상태의 파일 참조 활용
    if (!uploadedFile && lastUploadedFile) {
        console.log('[INFO] 이전에 업로드된 파일 사용:', lastUploadedFile.name);
        uploadedFile = lastUploadedFile;
    }

    if (uploadedFile) {
        console.log('[INFO] CSV 관련 질문 처리 중...');
        return submitCsvQuestion(question, uploadedFile); // Promise 반환
    } else if (propertyId) {
        console.log('[INFO] GA4 관련 질문 처리 중...');
        return submitGa4Question(question, propertyId); // Promise 반환
    } else {
        console.error('[ERROR] 질문 처리 실패 - Property ID나 파일 누락');
        return Promise.reject(new Error('Invalid inputs for question submission')); // 명시적 Promise 반환
    }
}


function submitGa4Question(question, propertyId) {
    console.log('[INFO] submitGa4Question - 질문 처리 시작:', { question, propertyId });

    return fetch('/analyze-question', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, property_id: propertyId })
    })
    .then(response => {
        console.log('[DEBUG] submitGa4Question - 응답 상태 코드:', response.status);
        if (!response.ok) {
            console.error('[ERROR] submitGa4Question - 응답 실패:', response.status);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('[INFO] submitGa4Question - 응답 데이터:', data);
        handleQuestionResponse(data); // 응답 처리
    })
    .catch(error => {
        console.error('[ERROR] submitGa4Question - 오류 발생:', error);
        alert('요청 처리 중 오류가 발생했습니다.');
    })
    .finally(() => {
        console.log('[INFO] submitGa4Question - 요청 완료');
    });
}







function generateDataTable(data) {
    const headers = ["Date", "Active Users"];
    const rows = data.rows.map(row => ({
        date: parseDate(row.dimensionValues[0]?.value),
        activeUsers: row.metricValues[0]?.value || 0,
    }));

    let tableHTML = `
        <table border="1">
            <thead>
                <tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        <td>${d3.timeFormat('%Y-%m-%d')(row.date)}</td>
                        <td>${row.activeUsers}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    return tableHTML;
}


// 날짜 변환 함수 (유지)
function parseDate(dateString) {
    if (dateString && dateString.length === 8) {
        const year = dateString.slice(0, 4);
        const month = dateString.slice(4, 6);
        const day = dateString.slice(6, 8);
        return new Date(`${year}-${month}-${day}`);
    }
    console.error('[ERROR] 잘못된 날짜 형식:', dateString);
    return new Date(NaN);
}


// 채팅 버블 추가 함수
function addChatBubble(type, content) {
    console.log('[INFO] addChatBubble - 메시지 추가 시작:', { type, content });

    const chatContainer = document.getElementById('ai-response');
    if (!chatContainer) {
        console.error('[ERROR] addChatBubble - 컨테이너를 찾을 수 없습니다.');
        return;
    }

    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble', type === 'user' ? 'user-bubble' : 'ai-bubble');
    bubble.innerHTML = `
        <div class="bubble-content">
            ${content}
        </div>
    `;
    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    console.log('[INFO] addChatBubble - 메시지 추가 완료');
}



function addAIResponse(response1, response2, additionalData) {
    console.log('[DEBUG] addAIResponse 호출됨 - 팩트 응답:', response1, '전략 응답:', response2, '추가 데이터:', additionalData);

    // 팩트 기반 응답 렌더링
    addChatBubble('ai', `
        <p><strong>팩트 기반 응답:</strong></p>
        <p>${response1 || '팩트 응답 없음'}</p>
    `);

    // 전략적 조언 렌더링
    addChatBubble('ai', `
        <p><strong>전략적 조언:</strong></p>
        <p>${response2 || '전략적 조언 없음'}</p>
    `);

    // 데이터 테이블 추가
    const tableHTML = generateDataTable(additionalData);
    addChatBubble('ai', tableHTML);

    // 리포트 추가 버튼 생성
    addReportButton(response1, response2, additionalData);
}




// 데이터 시각화 처리 함수
function handleDataVisualization(rawData) {
    const cleanedData = cleanData(rawData);
    if (cleanedData.length === 0) {
        addChatBubble('ai', '<p>시각화할 데이터가 없습니다.</p>');
        return;
    }

    const table = generateDataTable(cleanedData);
    addChatBubble('ai', table);

    const graphContainer = document.createElement('div');
    graphContainer.classList.add('graph-container');
    document.getElementById('ai-response').appendChild(graphContainer);

    renderLineChart(cleanedData, graphContainer, 'metricValue');
}


// 그래프 렌더링 함수
function renderGraph(cleanedData, graphContainer) {
    if (cleanedData.length === 0) {
        console.error('[ERROR] 렌더링할 데이터가 없습니다.');
        graphContainer.innerHTML = '<p>시각화할 데이터가 없습니다.</p>';
        return;
    }

    const metric = 'metricValue';
    renderLineChart(cleanedData, graphContainer, metric);
}


function formatText(text) {
    if (!text) {
        return ''; // text가 undefined, null, 빈 문자열일 경우 빈 문자열 반환
    }
    // 간단한 텍스트 포맷팅을 통해 중요한 데이터를 볼드 처리합니다.
    return text.replace(/총\s(\d+명)/g, '<strong>$1</strong>')
               .replace(/트래픽을 증대시킬 수 있습니다\./g, '<strong>트래픽을 증대시킬 수 있습니다.</strong>');
}


function someEventHandler() {
    // 각 요소의 값을 가져오기 전에 해당 요소가 존재하는지 먼저 확인
    const propertyDropdown = document.getElementById('property-dropdown');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');

    // 값 가져오기
    const propertyId = propertyDropdown ? propertyDropdown.value : null;
    const metric = 'activeUsers'; // metric은 정해진 값으로 사용
    const startDate = startDateInput ? startDateInput.value : null;
    const endDate = endDateInput ? endDateInput.value : null;

    console.log('[DEBUG] someEventHandler 호출됨 - 매개변수 확인:', {
        propertyId,
        metric,
        startDate,
        endDate
    });

    if (propertyId && metric && startDate && endDate) {
        showGraph(propertyId, metric, startDate, endDate);
    } else {
        console.error('[ERROR] showGraph 함수에 필요한 매개변수가 일부 누락되었습니다.', {
            propertyId,
            metric,
            startDate,
            endDate
        });
    }
}


function showGraph(propertyId, metric, startDate, endDate) {
    console.log('[DEBUG] showGraph 호출됨 - 매개변수 확인:', {
        propertyId,
        metric,
        startDate,
        endDate
    });

    if (!propertyId || !metric || !startDate || !endDate) {
        console.error('[ERROR] showGraph 함수에 전달된 매개변수가 누락되었습니다.', {
            propertyId,
            metric,
            startDate,
            endDate
        });
        return;
    }

    console.log('[INFO] fetch 요청을 진행합니다.');
    fetch('/fetch-metric-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            property_id: propertyId,
            metric: metric,
            start_date: startDate,
            end_date: endDate
        })
    })
    .then(response => {
        if (!response.ok) {
            console.error('[ERROR] fetch-metric-data 요청 실패, 응답 상태 코드:', response.status);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log('[INFO] fetch-metric-data 요청 성공, 응답 처리 진행 중');
        return response.json();
    })
    .then(data => {
        console.log('[INFO] 데이터 성공적으로 수신됨:', data);

        let container = document.getElementById('graph-container');
        if (!container) {
            console.warn('[WARNING] graph-container가 존재하지 않음. 새로운 컨테이너를 생성합니다.');
            container = document.createElement('div');
            container.id = 'graph-container';
            document.body.appendChild(container); // 원하는 위치에 컨테이너를 추가하세요.
        }

        renderVisualization('line', data, container);
    })
    .catch((error) => {
        console.error('[ERROR] showGraph 함수에서 오류 발생:', error);
    });
}


// 시각화 함수

function renderVisualization(type, data, container) {
    console.log('[DEBUG] renderVisualization 호출됨 - 타입:', type, ', 데이터:', data);

    if (!container) {
        console.error('[ERROR] 컨테이너 요소가 전달되지 않았습니다. 시각화 진행 불가.');
        return;
    }

    if (!data || data.length < 2) {
        console.warn('[WARN] 시각화할 데이터가 부족합니다. 컨테이너 ID:', container.id);
        container.innerHTML = '<p>시각화할 데이터가 부족합니다.</p>';
        return;
    }

    switch (type) {
        case 'line':
            console.log('[INFO] 라인 차트 렌더링 시작, 컨테이너 ID:', container.id);
            renderLineChart(data, container);
            break;
        default:
            console.warn('[WARN] 지원되지 않는 시각화 유형입니다:', type, ', 컨테이너 ID:', container.id);
            container.innerHTML = '<p>지원되지 않는 시각화 유형입니다.</p>';
    }
}
// 데이터 정제 함수
function cleanData(rawData) {
    if (!rawData || !Array.isArray(rawData.rows) || rawData.rows.length === 0) {
        console.error('[ERROR] cleanData - 데이터가 유효하지 않음');
        return [];
    }

    const metricName = rawData.metricHeaders?.[0]?.name || 'metricValue';

    return rawData.rows.map(row => ({
        date: parseDate(row.dimensionValues[0]?.value),
        [metricName]: parseFloat(row.metricValues[0]?.value || 'NaN')
    })).filter(item => 
        item.date instanceof Date && !isNaN(item.date.getTime()) && !isNaN(item[metricName])
    );
}

function renderLineChart(data, container, metric = "activeUsers") {
    const rows = data.rows.map(row => ({
        date: parseDate(row.dimensionValues[0]?.value),
        value: Number(row.metricValues[0]?.value) || 0,
    }));

    // 유효한 데이터만 필터링 및 정렬
    const cleanedRows = rows
        .filter(row => row.date && !isNaN(row.value))
        .sort((a, b) => a.date - b.date); // 날짜 순으로 정렬

    if (cleanedRows.length === 0) {
        console.error('[ERROR] 렌더링할 유효한 데이터가 없습니다.', rows);
        container.innerHTML = '<p>유효한 데이터가 없습니다.</p>';
        return;
    }

    console.log('[DEBUG] 정렬된 데이터:', cleanedRows);

    const margin = { top: 20, right: 30, bottom: 50, left: 50 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    d3.select(container).select('svg').remove(); // 기존 SVG 제거

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
        .domain(d3.extent(cleanedRows, d => d.date))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(cleanedRows, d => d.value)])
        .range([height, 0]);

    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%Y-%m-%d')));

    svg.append('g').call(d3.axisLeft(y));

    const lineGenerator = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.value));

    const pathData = lineGenerator(cleanedRows);

    if (!pathData) {
        console.error('[ERROR] 라인을 그릴 데이터가 유효하지 않습니다.', cleanedRows);
        return;
    }

    svg.append('path')
        .datum(cleanedRows)
        .attr('fill', 'none')
        .attr('stroke', 'steelblue')
        .attr('stroke-width', 1.5)
        .attr('d', pathData);

    svg.selectAll('.dot')
        .data(cleanedRows)
        .enter()
        .append('circle')
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.value))
        .attr('r', 4)
        .attr('fill', 'steelblue');
}





// 날짜 변환 함수
function parseDate(dateString) {
    if (dateString && dateString.length === 8) {
        const year = dateString.slice(0, 4);
        const month = dateString.slice(4, 6);
        const day = dateString.slice(6, 8);
        const parsedDate = new Date(`${year}-${month}-${day}`);
        if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
        }
    }
    console.error('[ERROR] 잘못된 날짜 형식:', dateString);
    return null; // 잘못된 데이터는 null로 반환
}


// 계정 목록을 가져오는 함수
function fetchAccounts() {
    fetchWithErrorHandling('/get-accounts', {}, '계정을 가져오는 중 오류가 발생했습니다.')
        .then(accounts => populateAccountDropdown(accounts));
}

// 계정 드롭다운 채우기
function populateAccountDropdown(accounts) {
    const accountSelectContainer = document.getElementById('account-select');
    accountSelectContainer.innerHTML = ''; // 초기화

    const select = document.createElement('select');
    select.id = 'account-dropdown';

    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.name.split('/')[1];
        option.text = account.displayName;
        select.appendChild(option);
    });

    accountSelectContainer.appendChild(select);
    select.addEventListener('change', function() {
        fetchProperties(this.value);
    });
}
    
    
// 속성 목록을 가져오는 함수
function fetchProperties(accountId) {
    fetchWithErrorHandling(`/get-properties/${accountId}`, {}, '속성을 가져오는 중 오류가 발생했습니다.')
        .then(properties => {
            populatePropertyDropdown(properties);

            if (properties.length > 0) {
                const firstProperty = properties[0];
                const propertyId = firstProperty.name.split('/')[1];
                console.log(`[DEBUG] Automatically selected first property: ${propertyId}`);
            }
        });
}

let currentSelectedPropertyId = null;
function setSelectedPropertyId(propertyId) {
    if (!propertyId || propertyId === currentSelectedPropertyId) {
        console.warn('[WARNING] 동일한 Property ID가 이미 저장되어 있습니다. 서버 요청 생략:', propertyId);
        return;
    }

    currentSelectedPropertyId = propertyId;
    console.log('[DEBUG] setSelectedPropertyId 호출됨. propertyId:', propertyId);
    fetch('/set-selected-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId })
    })
    .then(response => {
        if (response.ok) {
            console.log('[INFO] Property ID가 서버 세션에 정상적으로 저장되었습니다:', propertyId);
        } else {
            console.error('[ERROR] Failed to set property ID in session:', response.status);
        }
    })
    .catch(error => {
        console.error('Error setting property ID in session:', error);
    });
}


window.onload = function() {
    displayUserInfo();
    fetchAccounts();

    // 날짜 기본값을 해당 월로 설정
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    document.getElementById('start-date').value = `${year}-${month}-01`;
    document.getElementById('end-date').value = `${year}-${month}-${day}`;
};

let lastUploadedFile = null; // 업로드된 파일 참조

document.getElementById('upload-form').addEventListener('submit', function (event) {
    event.preventDefault();

    const fileInput = document.getElementById('file');
    const file = fileInput.files[0];
    if (!file) {
        alert('업로드할 파일을 선택하세요.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload-data', {
        method: 'POST',
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('[INFO] 업로드 성공:', data);
            lastUploadedFile = file; // 전역 변수에 파일 저장
            document.getElementById('upload-status').textContent = `업로드된 파일: ${file.name}`;
            alert('파일 업로드 성공');
        } else {
            console.error('[ERROR] 업로드 실패:', data.message);
            alert('업로드 실패: ' + data.message);
        }
    })
    .catch(error => {
        console.error('[ERROR] 업로드 처리 중 오류:', error);
        alert('업로드 처리 중 오류가 발생했습니다.');
    });
});



// 팝업 열기/닫기 기능
const modal = document.getElementById('data-modal');
const closeModal = document.getElementById('close-modal');
const backdrop = document.createElement('div');
backdrop.className = 'modal-backdrop';

document.body.appendChild(backdrop);

function openModal() {
    const modal = document.getElementById('data-modal');
    const backdrop = document.querySelector('.modal-backdrop');
    if (modal && backdrop) {
        modal.classList.remove('hidden');
        backdrop.classList.add('visible');
    } else {
        console.error('[ERROR] modal 또는 backdrop 요소를 찾을 수 없습니다.');
    }
}

function closeModalFn() {
    const modal = document.getElementById('data-modal');
    const backdrop = document.querySelector('.modal-backdrop');
    if (modal && backdrop) {
        modal.classList.add('hidden');
        backdrop.classList.remove('visible');
    } else {
        console.error('[ERROR] modal 또는 backdrop 요소를 찾을 수 없습니다.');
    }
}



closeModal.addEventListener('click', closeModalFn);
backdrop.addEventListener('click', closeModalFn);

function showModalWithData(data) {
    const tableContainer = document.getElementById('data-table');
    const headers = data.headers || [];
    const rows = data.rows || [];
    const suggestions = data.aiSuggestions
        ? data.aiSuggestions.split('\n').map(line => `<li>${line}</li>`).join('')
        : '<li>AI 유추 결과가 없습니다.</li>';

    // 테이블 HTML 생성
    const tableHTML = `
        <div class="data-table-container">
            <h4>데이터 미리보기:</h4>
            <table>
                <thead>
                    <tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>${headers.map(header => `<td>${row[header] || ''}</td>`).join('')}</tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // 팝업에 데이터 표시
    if (tableContainer) {
        tableContainer.innerHTML = `
            ${tableHTML}
            <h4>AI 유추 결과:</h4>
            <ul>${suggestions}</ul>
            <button id="confirm-columns">확인</button>
        `;
    } else {
        console.error('[ERROR] tableContainer를 찾을 수 없습니다.');
    }

    openModal(); // 팝업 열기

    // 확인 버튼 이벤트 등록
    const confirmButton = document.getElementById('confirm-columns');
    if (confirmButton) {
        confirmButton.addEventListener('click', () => {
            closeModalFn();
            finalizeColumns(headers); // 컬럼 확정
        });
    } else {
        console.error('[ERROR] confirm-columns 버튼을 찾을 수 없습니다.');
    }
}






function finalizeColumns(headers) {
    const userInputs = headers.map(header => `
        <label>${header}: 
            <input type="text" value="${header}" data-original="${header}" class="column-input">
        </label><br>
    `).join('');

    document.getElementById('data-table').innerHTML = `
        <h4>컬럼 속성 수정</h4>
        ${userInputs}
        <button id="submit-columns">저장</button>
    `;

    document.getElementById('submit-columns').addEventListener('click', () => {
        const modifiedHeaders = Array.from(document.querySelectorAll('.column-input')).map(input => ({
            original: input.getAttribute('data-original'),
            modified: input.value
        }));

        console.log('[INFO] 수정된 컬럼 속성:', modifiedHeaders);
        alert('컬럼 속성이 저장되었습니다.');
    });
}



function createTableHTML(rows, headers) {
    return `
        <table border="1">
            <thead>
                <tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.slice(0, 10).map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
        </table>
    `;
}





let draggedElement = null; // 현재 드래그 중인 요소

function handleDragStart(event) {
    draggedElement = event.currentTarget; // 드래그 중인 요소 저장
    event.currentTarget.style.opacity = '0.5'; // 드래그 중인 요소 투명도 조정
}

function handleDragOver(event) {
    event.preventDefault(); // 기본 드래그 동작 방지
}

function handleDrop(event) {
    event.preventDefault(); // 기본 드래그 동작 방지

    const reportContents = document.getElementById('report-contents');
    const children = Array.from(reportContents.children);

    // 드롭된 위치 계산
    const dropIndex = children.indexOf(event.currentTarget);
    const dragIndex = children.indexOf(draggedElement);

    if (dragIndex !== -1 && dropIndex !== -1 && dragIndex !== dropIndex) {
        // 드래그된 요소를 새로운 위치로 이동
        reportContents.removeChild(draggedElement);
        if (dragIndex < dropIndex) {
            reportContents.insertBefore(draggedElement, children[dropIndex + 1]);
        } else {
            reportContents.insertBefore(draggedElement, children[dropIndex]);
        }
    }
}

function handleDragEnd(event) {
    event.currentTarget.style.opacity = '1'; // 드래그 종료 후 투명도 복원
}

function submitCsvQuestion(question, uploadedFile) {
    const formData = new FormData();
    formData.append('file', uploadedFile);
    formData.append('question', question);

    return fetch('/upload-data', { // 파일 업로드 처리
        method: 'POST',
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            console.error('[ERROR] CSV 처리 실패:', data.message);
            alert('CSV 처리 실패: ' + data.message);
            return;
        }

        console.log('[INFO] 업로드된 데이터:', data);

        // 질문과 업로드된 데이터를 classify_question 함수로 전달
        const headers = data.headers;
        classifyQuestionWithCsv(question, headers);
    })
    .catch(error => {
        console.error('[ERROR] CSV 질문 처리 중 오류:', error);
        alert('CSV 질문 처리 중 오류가 발생했습니다.');
    });
}
function classifyQuestionWithCsv(question, headers) {
    console.log('[DEBUG] classifyQuestionWithCsv 호출됨 - Question:', question, 'Headers:', headers);

    // Step 1: GA4 관련 키워드 확인
    const GA4_KEYWORDS = ["사용자수", "페이지뷰", "전환", "클릭", "매출", "세션"];
    if (GA4_KEYWORDS.some(keyword => question.includes(keyword))) {
        console.log('[INFO] classifyQuestionWithCsv - GA4 데이터 관련 질문으로 분류됨');
        return "data_related";
    }

    // Step 2: 파일 헤더와 질문 비교
    if (headers.some(header => question.includes(header))) {
        console.log('[INFO] classifyQuestionWithCsv - 파일 데이터 관련 질문으로 분류됨');
        return "file_data_related";
    }

    // Step 3: 일반 질문으로 분류
    console.log('[INFO] classifyQuestionWithCsv - 일반 질문으로 분류됨');
    return "generic_question";
}

function handleCsvResponse(data) {
    console.log('[INFO] handleCsvResponse 호출됨 - 서버 응답 데이터:', data);

    // CSV 데이터 확인
    const { headers, rows, message } = data;

    // 업로드 성공 메시지
    if (message) {
        console.log('[INFO] 서버 메시지:', message);
    }

    // 데이터를 테이블로 생성하여 표시
    const dataTableContainer = document.getElementById('data-table');
    if (!dataTableContainer) {
        console.error('[ERROR] 데이터 테이블 컨테이너를 찾을 수 없습니다.');
        return;
    }

    // 테이블 HTML 생성
    let tableHTML = `
        <table border="1">
            <thead>
                <tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>${headers.map(header => `<td>${row[header] || ''}</td>`).join('')}</tr>
                `).join('')}
            </tbody>
        </table>
    `;

    dataTableContainer.innerHTML = `
        <h4>업로드된 CSV 데이터:</h4>
        ${tableHTML}
    `;

    // CSV 데이터 추가 분석 또는 추가 작업 가능
    console.log('[INFO] CSV 데이터 렌더링 완료');
}



// 리포트 데이터 저장 객체
const reportsData = {};
function addToReport(response1, response2, additionalData) {
    console.log('[DEBUG] addToReport 호출됨 - 데이터:', { response1, response2, additionalData });

    const reportContents = document.getElementById('report-contents');

    // 리포트 초기화 상태 제거 (플레이스홀더 제거)
    const placeholderText = reportContents.querySelector('.placeholder-text');
    if (placeholderText) {
        placeholderText.remove();
    }

    // 고유 ID 생성
    const reportId = `report-${Date.now()}`;
    const reportCard = document.createElement('div');
    reportCard.classList.add('report-card');
    reportCard.setAttribute('data-id', reportId);

    // 팩트 기반 응답 추가
    const factResponseSection = document.createElement('div');
    factResponseSection.classList.add('report-section');
    factResponseSection.innerHTML = `
        <strong>팩트 기반 응답:</strong>
        <p>${response1}</p>
    `;

    // 전략적 조언 추가
    const strategicAdviceSection = document.createElement('div');
    strategicAdviceSection.classList.add('report-section');
    strategicAdviceSection.innerHTML = `
        <strong>전략적 조언:</strong>
        <p>${response2}</p>
    `;

    // 데이터 테이블 추가
    const tableContainer = document.createElement('div');
    tableContainer.classList.add('data-table-container');
    if (additionalData && additionalData.rows) {
        const tableHTML = generateDataTable(additionalData);
        tableContainer.innerHTML = tableHTML;
    } else {
        tableContainer.innerHTML = '<p>데이터가 없습니다.</p>';
    }

    // 차트 추가
    const chartContainer = document.createElement('div');
    chartContainer.classList.add('chart-container');
    if (additionalData && additionalData.rows) {
        setTimeout(() => renderLineChart(additionalData, chartContainer, additionalData.metrics[0]), 100);
    } else {
        chartContainer.innerHTML = '<p>차트를 생성할 데이터가 없습니다.</p>';
    }

    // 리포트 카드에 섹션 추가
    reportCard.appendChild(factResponseSection);
    reportCard.appendChild(strategicAdviceSection);
    reportCard.appendChild(tableContainer);
    reportCard.appendChild(chartContainer);

    // 리포트 컨텐츠에 추가
    reportContents.appendChild(reportCard);

    console.log(`[DEBUG] 리포트에 데이터 추가 완료 (ID: ${reportId})`);
}









function exportReportData() {
    const exportedData = JSON.stringify(reportsData, null, 2); // JSON 형식으로 변환
    console.log('[INFO] 리포트 데이터 추출:', exportedData);

    // 다운로드 링크 생성 (선택사항)
    const blob = new Blob([exportedData], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'reportData.json';
    link.click();

    return exportedData;
}
function loadSavedReports() {
    const savedReports = JSON.parse(localStorage.getItem('savedReports')) || [];
    const reportContents = document.getElementById('report-contents');

    reportContents.innerHTML = ''; // 기존 리포트 초기화

    if (savedReports.length === 0) {
        reportContents.innerHTML = '<p class="placeholder-text">저장된 리포트가 없습니다.</p>';
        return;
    }

    savedReports.forEach(report => {
        const reportCard = document.createElement('div');
        reportCard.classList.add('report-card');
        reportCard.setAttribute('data-id', report.id);

        const chartContainer = document.createElement('div');
        chartContainer.classList.add('chart-container');
        chartContainer.style.marginBottom = '20px';

        const responseContainer = document.createElement('div');
        responseContainer.classList.add('response-container');

        const questionSection = document.createElement('div');
        questionSection.classList.add('report-section');
        questionSection.innerHTML = `<strong>질문:</strong> ${report.question}`;

        const answerSection = document.createElement('div');
        answerSection.classList.add('report-section');
        answerSection.innerHTML = `<strong>응답:</strong> ${report.analysis}`;

        responseContainer.appendChild(questionSection);
        responseContainer.appendChild(answerSection);
        reportCard.appendChild(responseContainer);
        reportCard.appendChild(chartContainer);
        reportContents.appendChild(reportCard);

        // 차트 로드
        if (report.data && report.data.rows) {
            setTimeout(() => drawChart(chartContainer, report.data.rows), 100);
        } else {
            chartContainer.innerHTML = '<p>차트를 생성할 데이터가 없습니다.</p>';
        }
    });

    console.log('[INFO] loadSavedReports - 리포트 로드 완료:', savedReports);
}



function aggregateReportData(rows) {
    console.log('[DEBUG] aggregateReportData 호출됨. 전달된 rows 데이터:', rows);

    if (!Array.isArray(rows) || rows.length === 0) {
        console.error('[ERROR] aggregateReportData에 전달된 데이터가 비어있습니다.');
        return null;
    }

    let totalValue = 0;
    let maxValue = Number.NEGATIVE_INFINITY;
    let minValue = Number.POSITIVE_INFINITY;
    const dates = [];

    rows.forEach(row => {
        const { date, value } = row;
        console.log('[DEBUG] 처리 중인 row 데이터:', row);

        const parsedDate = new Date(date); // 날짜를 Date 객체로 변환
        if (isNaN(parsedDate.getTime())) {
            console.warn('[WARN] 유효하지 않은 날짜 데이터:', date);
            return; // 유효하지 않은 날짜는 건너뜁니다
        }

        if (isNaN(value)) {
            console.warn('[WARN] 유효하지 않은 값 데이터:', value);
            return; // 유효하지 않은 값은 건너뜁니다
        }

        dates.push(parsedDate);
        totalValue += value;
        maxValue = Math.max(maxValue, value);
        minValue = Math.min(minValue, value);
    });

    if (dates.length === 0) {
        console.error('[ERROR] 유효한 날짜 데이터가 없습니다.');
        return null;
    }

    const averageValue = totalValue / dates.length;

    console.log('[DEBUG] aggregateReportData 결과:', {
        totalValue,
        averageValue,
        maxValue,
        minValue,
        dates
    });

    return {
        totalValue,
        averageValue,
        maxValue,
        minValue,
        dates: dates.map(date => date.toISOString().split('T')[0]), // ISO 날짜 형식으로 반환
    };
}



// OpenAI API를 호출하여 요약을 생성하는 함수
async function generateSummaryWithOpenAI(aggregatedData) {
    const { totalValue, averageValue, maxValue, minValue, dates } = aggregatedData;
    const dateRange = `${dates[0]} ~ ${dates[dates.length - 1]}`;

    const summaryPrompt = `
        아래 데이터의 요약을 한 줄로 작성해 주세요:
        기간: ${dateRange}
        총합: ${totalValue}
        평균: ${averageValue.toFixed(2)}
        최대 값: ${maxValue}
        최소 값: ${minValue}
    `;
    console.log(summaryPrompt);

    try {
        const apiKey = 'YOUR_OPENAI_API_KEY'; // 실제 API 키 입력

        if (!apiKey) {
            throw new Error('OpenAI API 키가 설정되지 않았습니다.');
        }

        const response = await fetch('https://api.openai.com/v1/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                prompt: summaryPrompt,
                max_tokens: 50,
                temperature: 0.5,
            }),
        });

        if (!response.ok) {
            console.error(`[ERROR] OpenAI API 응답 오류: ${response.status}`);
            return '요약을 생성하는 중 오류가 발생했습니다.';
        }

        const data = await response.json();
        const summary = data.choices[0]?.text?.trim() || '요약 생성 실패';
        console.log('[INFO] AI 요약 생성 완료:', summary);
        return summary;
    } catch (error) {
        console.error('[ERROR] OpenAI 요약 생성 중 오류 발생:', error);
        return '요약을 생성하는 중 오류가 발생했습니다.';
    }
}


// 리포트 요약 관련
async function summarizeReport(rows) {
    console.log('[DEBUG] summarizeReport 호출됨 - rows 데이터:', rows);

    if (!Array.isArray(rows) || rows.length === 0) {
        console.error('[ERROR] summarizeReport에 전달된 rows 데이터가 비어있습니다.');
        alert('요약할 데이터가 없습니다. 리포트를 추가하세요.');
        return;
    }

    const aggregatedData = aggregateReportData(rows);
    if (!aggregatedData) {
        console.error('[ERROR] aggregateReportData에서 데이터 처리 실패.');
        return;
    }

    try {
        const response = await fetch('http://localhost:5001/generate-summary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ aggregatedData }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate summary');
        }

        const result = await response.json();
        console.log('[DEBUG] 서버에서 반환된 요약 데이터:', result);

        const summaryContainer = document.getElementById('summary-container');
        if (summaryContainer) {
            summaryContainer.textContent = result.summary || '요약 생성 실패';
        } else {
            console.error('[ERROR] summary-container 요소를 찾을 수 없습니다.');
        }
    } catch (error) {
        console.error('[ERROR] 요약 생성 중 오류 발생:', error);
        alert('요약 생성 중 오류가 발생했습니다.');
    }
}







// 리포트 데이터 다운로드 버튼
document.getElementById('export-report-button').addEventListener('click', exportReportData);

function drawChart(container, data) {
    if (!Array.isArray(data) || data.length === 0) {
        console.error('[ERROR] drawChart - 데이터가 비어있거나 배열이 아닙니다:', data);
        container.innerHTML = '<p>유효한 데이터가 없습니다.</p>';
        return;
    }

    // 데이터 유효성 검사 및 변환
    const validData = data.map(row => {
        const date = parseDate(row.dimensionValues?.[0]?.value);
        const metricValue = parseFloat(row.metricValues?.[0]?.value || 'NaN');
        return { date, value: metricValue };
    }).filter(item => 
        item.date instanceof Date && !isNaN(item.date.getTime()) && !isNaN(item.value)
    );

    // 데이터 정렬 (x축 순서 보장)
    validData.sort((a, b) => a.date - b.date);

    if (validData.length === 0) {
        console.error('[ERROR] drawChart - 유효한 데이터가 없습니다.', data);
        container.innerHTML = '<p>차트를 생성할 유효한 데이터가 없습니다.</p>';
        return;
    }

    console.log('[DEBUG] 유효한 데이터:', validData);

    // SVG 영역 설정
    const containerWidth = container.clientWidth || 600;
    const containerHeight = container.clientHeight || 400;
    const margin = { top: 20, right: 30, bottom: 50, left: 50 };

    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    d3.select(container).select('svg').remove(); // 기존 차트 제거

    const svg = d3.select(container).append('svg')
        .attr('width', containerWidth)
        .attr('height', containerHeight)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // x축 (날짜)
    const xScale = d3.scaleTime()
        .domain(d3.extent(validData, d => d.date))
        .range([0, width]);

    // y축 (값)
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(validData, d => d.value)])
        .range([height, 0]);

    // x축 추가
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat('%Y-%m-%d')))
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end');

    // y축 추가
    svg.append('g')
        .call(d3.axisLeft(yScale));

    // 라인 생성
    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value));

    svg.append('path')
        .datum(validData)
        .attr('fill', 'none')
        .attr('stroke', 'steelblue')
        .attr('stroke-width', 2)
        .attr('d', line);

    // 데이터 포인트 표시
    svg.selectAll('circle')
        .data(validData)
        .enter()
        .append('circle')
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.value))
        .attr('r', 4)
        .attr('fill', 'steelblue')
        .append('title') // 마우스 오버 시 값 표시
        .text(d => `${d3.timeFormat('%Y-%m-%d')(d.date)}: ${d.value}`);
}


function addReportButton(response1, response2, additionalData) {
    console.log('[DEBUG] addReportButton 호출됨 - 데이터:', { response1, response2, additionalData });

    const chatContainer = document.getElementById('ai-response');
    if (!chatContainer) {
        console.error('[ERROR] ai-response 컨테이너를 찾을 수 없습니다.');
        return;
    }

    const button = document.createElement('button');
    button.className = 'add-to-report-btn';
    button.textContent = '리포트에 추가하기';

    button.addEventListener('click', () => {
        console.log('[DEBUG] addReportButton 클릭됨 - 데이터 전달:', { response1, response2, additionalData });
        addToReport(response1, response2, additionalData);
        alert('리포트에 추가되었습니다.');
    });

    chatContainer.appendChild(button);
}





function saveToReport(question, analysis, response) {
    if (!response || !response.rows) {
        console.error('[ERROR] saveToReport - 응답 데이터가 유효하지 않습니다.', response);
        return;
    }

    const savedReports = JSON.parse(localStorage.getItem('savedReports')) || [];
    const newReport = {
        id: `report-${Date.now()}`,
        question,
        analysis,
        data: response,
        timestamp: new Date().toISOString(),
    };

    // 저장된 데이터에 추가
    savedReports.push(newReport);
    localStorage.setItem('savedReports', JSON.stringify(savedReports));
    reportsData[newReport.id] = newReport;

    console.log('[DEBUG] saveToReport - 저장된 리포트:', savedReports);
}


// 이미 처리된 질문 및 응답을 추적하는 세트
const processedResponses = new Set();
// 질문 및 응답 처리 함수
function handleQuestionResponse(data) {
    console.log('[DEBUG] handleQuestionResponse 호출됨 - 데이터:', data);

    const { response1, response2, additional_data } = data;

    // 최소한 response1이 없으면 처리 중단
    if (!response1) {
        console.error('[ERROR] 응답 데이터가 누락되었습니다.', data);
        alert('응답 데이터를 처리할 수 없습니다.');
        return;
    }

    // 질문 입력 내용 가져오기
    const question = document.getElementById('user-question')?.value || '알 수 없는 질문';

    // 팩트 기반 응답 추가
    addChatBubble('ai', `
        <p><strong>팩트 기반 응답:</strong></p>
        <p>${response1}</p>
    `);

    // 전략적 조언이 있을 경우 추가
    if (response2) {
        addChatBubble('ai', `
            <p><strong>전략적 조언:</strong></p>
            <p>${response2}</p>
        `);
    }

    // 추가 데이터가 있는 경우 테이블 및 차트 추가
    if (additional_data && additional_data.rows) {
        // 데이터 테이블 생성 및 추가
        const tableHTML = generateDataTable(additional_data);
        addChatBubble('ai', tableHTML);

        // 차트 생성 및 추가
        const chartContainer = document.createElement('div');
        chartContainer.classList.add('chart-container');
        document.getElementById('ai-response').appendChild(chartContainer);

        // Line Chart 렌더링
        if (additional_data.metrics && additional_data.metrics.length > 0) {
            renderLineChart(additional_data, chartContainer, additional_data.metrics[0]);
        } else {
            console.warn('[WARN] 차트를 렌더링할 메트릭이 없습니다.');
        }
    } else {
        console.log('[INFO] 추가 데이터가 없어 테이블 및 차트를 생략합니다.');
    }

    // 리포트 추가 버튼 생성
    addReportButton(response1, response2 || '', additional_data || null);
}



async function fetchIssues(reportData, benchmarks) {
    try {
        const response = await fetch('/detect-issues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportData, benchmarks })
        });
        const data = await response.json();
        if (data.issues) {
            console.log('[INFO] 탐지된 문제:', data.issues);
        } else {
            console.error('[ERROR] 문제 탐지 실패:', data.error);
        }
    } catch (error) {
        console.error('[ERROR] /detect-issues 요청 중 오류:', error);
    }
}

async function fetchRecommendations(reportData, benchmarks) {
    try {
        const response = await fetch('/recommend-plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportData, benchmarks })
        });
        const data = await response.json();
        if (data.recommendations) {
            renderRecommendations(data.recommendations);
        } else {
            console.error('[ERROR] 추천 플랜 생성 실패:', data.error);
        }
    } catch (error) {
        console.error('[ERROR] /recommend-plans 요청 중 오류:', error);
    }
}

function renderRecommendations(recommendations) {
    const container = document.getElementById('recommendations-container');
    container.innerHTML = ''; // 기존 내용 초기화

    console.log('[DEBUG] Recommendations 데이터:', recommendations); // 디버그 출력

    if (!recommendations || recommendations.length === 0) {
        container.innerHTML = '<p>추천 데이터가 없습니다.</p>';
        return;
    }

    recommendations.forEach((recommendation, index) => {
        const div = document.createElement('div');
        div.classList.add('recommendation-item');
        div.innerHTML = `
            <p><strong>${recommendation.metric}:</strong> ${recommendation.recommendation}</p>
            <label>
                조정값 (%): 
                <input type="number" id="adjustment-${index}" value="0" step="1" min="0" />
            </label>
        `;
        container.appendChild(div);
    });
}

async function simulateOutcome(reportData) {
    const adjustments = {};
    document.querySelectorAll('.recommendation-item input').forEach((input, index) => {
        adjustments[`metric-${index}`] = parseFloat(input.value) / 100 || 0; // 퍼센트 조정값
    });

    try {
        const response = await fetch('/simulate-outcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportData, adjustments })
        });
        const data = await response.json();
        if (data.simulatedData) {
            renderSimulationResults(data.simulatedData);
        } else {
            console.error('[ERROR] 시뮬레이션 실패:', data.error);
        }
    } catch (error) {
        console.error('[ERROR] /simulate-outcome 요청 중 오류:', error);
    }
}

function renderSimulationResults(simulatedData) {
    const container = document.getElementById('simulation-results');
    container.innerHTML = ''; // 기존 내용 초기화

    for (const metric in simulatedData) {
        const avgValue = simulatedData[metric].reduce((sum, value) => sum + value, 0) / simulatedData[metric].length;

        const div = document.createElement('div');
        div.innerHTML = `
            <h4>${metric}</h4>
            <p>평균 값 (시뮬레이션): ${avgValue.toFixed(2)}</p>
        `;
        container.appendChild(div);
    }
}
document.addEventListener('DOMContentLoaded', function () {
    const simulateButton = document.getElementById('simulate-button');

    simulateButton.addEventListener('click', function () {
        const reportData = extractReportData(); // 리포트 데이터 추출
        simulateOutcome(reportData);
    });

    const summarizeButton = document.getElementById('summarize-button');
    summarizeButton.addEventListener('click', function () {
        const reportData = extractReportData(); // 리포트 데이터 추출
        const benchmarks = {
            activeUsers: { threshold: 1000 },
            sessions: { threshold: 500 },
        }; // 예제 벤치마크

        fetchRecommendations(reportData, benchmarks);
    });
});

function runSimulation() {
    const recommendations = document.querySelectorAll('.recommendation-item');
    const resultsContainer = document.getElementById('simulation-results-container');
    resultsContainer.innerHTML = ''; // 기존 결과 초기화

    recommendations.forEach((item, index) => {
        const metric = item.querySelector('strong').textContent.replace(':', '').trim();
        const adjustmentInput = document.getElementById(`adjustment-${index}`);
        const adjustmentValue = parseFloat(adjustmentInput.value) || 0;

        // 현재 데이터 값 가져오기 (예제: Active Users = 1000)
        const currentValue = metric === 'Active Users' ? 1000 : 500; // 임의의 현재 값 설정
        const adjustedValue = currentValue + (currentValue * adjustmentValue / 100);

        // 결과 표시
        const resultDiv = document.createElement('div');
        resultDiv.innerHTML = `
            <p><strong>${metric}:</strong> 현재 값: ${currentValue}, 예상 값: ${adjustedValue.toFixed(2)}</p>
        `;
        resultsContainer.appendChild(resultDiv);
    });
}

// 시뮬레이션 실행 버튼에 이벤트 리스너 추가
document.getElementById('run-simulation').addEventListener('click', runSimulation);
document.getElementById('get-recommendations').addEventListener('click', () => {
    const reportData = extractReportData(); // 리포트 데이터 추출
    const benchmarks = getBenchmarks(); // 벤치마크 데이터 가져오기

    if (reportData.length === 0) {
        alert('리포트 데이터가 없습니다. 먼저 리포트를 생성하세요.');
        return;
    }

    fetch('/recommend-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportData, benchmarks })
    })
    .then(response => response.json())
    .then(data => {
        displayRecommendations(data.recommendations); // 추천 결과 UI에 표시
    })
    .catch(error => console.error('추천 생성 중 오류:', error));
});


function getReportData() {
    return [
        { activeUsers: 1000, sessions: 500, revenue: 3000 },
        { activeUsers: 1200, sessions: 600, revenue: 3500 },
    ];
}

function getBenchmarks() {
    return { activeUsers: 1100, sessions: 550, revenue: 3200 };
}
function displayRecommendations(recommendations) {
    const problemList = document.getElementById('problem-list');
    const strategyList = document.getElementById('strategy-list');
    problemList.innerHTML = '';  // 기존 내용 초기화
    strategyList.innerHTML = '';

    let isStrategy = false;

    recommendations.forEach(item => {
        const text = item.recommendation;

        if (text.includes('전략적 추천')) {
            isStrategy = true;
            return; // "전략적 추천" 텍스트는 목록에 추가하지 않음
        }

        const li = document.createElement('li');
        li.textContent = text;

        if (isStrategy) {
            strategyList.appendChild(li);
        } else {
            problemList.appendChild(li);
        }
    });
}
