// 리포트 데이터 저장 객체
const reportsData = {};
function addToReport(question, response, additionalData, strategicAdvice) {
    if (!additionalData || !Array.isArray(additionalData.rows)) {
        console.error('[ERROR] addToReport - 데이터가 비어있거나 배열이 아닙니다:', additionalData);
        return;
    }

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

    // 리포트 카드 구성
    const responseContainer = document.createElement('div');
    responseContainer.classList.add('response-container');

    // 질문 섹션 추가
    const questionSection = document.createElement('div');
    questionSection.classList.add('report-section');
    questionSection.innerHTML = `<strong>질문:</strong> ${question}`;

    // 응답 섹션 추가
    const responseSection = document.createElement('div');
    responseSection.classList.add('report-section');
    responseSection.innerHTML = `<strong>응답:</strong><pre>${response}</pre>`;

    // 전략적 조언 섹션 추가
    const strategicAdviceSection = document.createElement('div');
    strategicAdviceSection.classList.add('report-section');
    strategicAdviceSection.innerHTML = `
        <strong>전략적 조언:</strong>
        <p>${strategicAdvice || '전략적 조언 없음'}</p>
    `;

    // 차트 컨테이너 추가
    const chartContainer = document.createElement('div');
    chartContainer.classList.add('chart-container');
    chartContainer.style.marginBottom = '20px';

    // 구성 요소 추가
    responseContainer.appendChild(questionSection);
    responseContainer.appendChild(responseSection);
    responseContainer.appendChild(strategicAdviceSection);
    reportCard.appendChild(responseContainer);
    reportCard.appendChild(chartContainer);
    reportContents.appendChild(reportCard);

    // 차트 생성
    const chartData = additionalData.rows;
    if (chartData && chartData.length > 0) {
        setTimeout(() => drawChart(chartContainer, chartData), 100);
    } else {
        chartContainer.innerHTML = '<p>차트를 생성할 데이터가 없습니다.</p>';
        console.warn('[WARN] 차트를 그릴 데이터가 없습니다:', chartData);
    }

    console.log(`[DEBUG] 리포트 컨테이너에 리포트 추가 완료 (ID: ${reportId})`);
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
        console.log('[DEBUG] 처리 중인 row 데이터:', row);

        const date = row.dimensionValues?.[0]?.value || null;
        const value = parseInt(row.metricValues?.[0]?.value || 0, 10);

        if (!date || isNaN(value)) {
            console.warn('[WARN] 유효하지 않은 row 데이터:', row);
            return; // 무효한 데이터는 무시
        }

        dates.push(date);
        totalValue += value;
        maxValue = Math.max(maxValue, value);
        minValue = Math.min(minValue, value);
    });

    if (dates.length === 0) {
        console.error('[ERROR] 유효한 날짜 데이터가 없습니다.');
        return null;
    }

    const averageValue = totalValue / rows.length;

    console.log('[DEBUG] aggregateReportData 결과:', {
        totalValue, averageValue, maxValue, minValue, dates
    });

    return {
        totalValue,
        averageValue,
        maxValue,
        minValue,
        dates,
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
// 리포트 데이터를 요약하는 함수
async function summarizeReport(rows) {
    console.log('[DEBUG] summarizeReport 호출됨. 전달된 rows 데이터:', rows);

    if (!Array.isArray(rows) || rows.length === 0) {
        console.error('[ERROR] summarizeReport에 전달된 rows 데이터가 비어있습니다.');
        alert('리포트 데이터가 없습니다. 새로운 데이터를 추가하세요.');
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

        console.log('[DEBUG] 서버에서 반환된 응답 데이터:', result);
        const rows = result.rows || []; // rows 데이터 추출

        if (!Array.isArray(rows)) {
            console.error('[ERROR] 반환된 rows 데이터가 배열이 아닙니다:', rows);
            return;
        }

        const summaryContainer = document.getElementById('summary-container');
        if (!summaryContainer) {
            console.error('[ERROR] summary-container 요소를 찾을 수 없습니다.');
            return;
        }

        summaryContainer.textContent = result.summary || '요약 생성 실패'; // 요약 결과 표시
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


function addReportButton(question, analysis, data) {
    const chatContainer = document.getElementById('ai-response');
    if (!chatContainer) {
        console.error('[ERROR] ai-response 컨테이너를 찾을 수 없습니다.');
        return;
    }

    const button = document.createElement('button');
    button.className = 'add-to-report-btn';
    button.textContent = '리포트에 추가하기';
    button.addEventListener('click', () => {
        // 버튼 클릭 시 즉시 리포트 추가
        addToReport(question, analysis, data);
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
    // 사용자 질문과 분석 결과
    const { response, additional_data } = data;
    const question = "사용자 질문 예시"; // 실제 사용자 질문
    const strategicAdvice = response.split("전략적 조언:")[1]?.trim() || "전략적 조언 없음";

    // 차원과 메트릭 데이터
    const { dimensions, metrics, rows } = additional_data;

    // 기간 계산 (첫 번째와 마지막 날짜)
    const dates = rows.map(row => parseDate(row.dimensionValues[0]?.value));
    const periodStart = d3.timeFormat('%Y-%m-%d')(d3.min(dates));
    const periodEnd = d3.timeFormat('%Y-%m-%d')(d3.max(dates));

    // 활성 사용자 계산 (또는 다른 메트릭)
    const totalMetricValue = rows.reduce(
        (sum, row) => sum + Number(row.metricValues[0]?.value || 0),
        0
    );

    const analysis = `${metrics[0]}: ${totalMetricValue}`;

    // 질문 추가
    addChatBubble('user', `<p>${question}</p>`);

    // 분석 결과 추가
    addChatBubble('ai', `
        <p><strong>질문 분석 결과:</strong></p>
        <p>기간: ${periodStart} ~ ${periodEnd}</p>
        <p>${analysis}</p>
        <p><strong>전략적 조언:</strong> ${strategicAdvice}</p>
    `);

    // 데이터 테이블 추가
    const tableHTML = generateDataTable(additional_data);
    addChatBubble('ai', tableHTML);

    // 차트 추가
    const chartContainer = document.createElement('div');
    chartContainer.classList.add('chart-container');
    document.getElementById('ai-response').appendChild(chartContainer);
    renderLineChart(additional_data, chartContainer, metrics[0]);

    // 리포트 추가 버튼
    addReportButton(question, analysis, additional_data);
}