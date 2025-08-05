
// 질문 제출 버튼 클릭 시 리포트 생성 호출
function fetchMonthlyReport(propertyId) {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!propertyId) {
        console.error('[ERROR] Property ID is missing.');
        return;
    }

    console.log(`[DEBUG] Sending /monthly-report request for Property ID: ${propertyId}`);
    fetch('/monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, start_date: startDate, end_date: endDate })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log(`[DEBUG] Monthly Report Data Received:`, data);
        renderKPIReport(data); // 받은 데이터를 렌더링
    })
    .catch(error => {
        console.error('[ERROR] Failed to fetch monthly report:', error);
        alert('월간 리포트를 불러오는 중 오류가 발생했습니다. 다시 시도하세요.');
    });
}

function renderKPIReport(reportData) {
    const reportContents = document.getElementById('report-contents');
    if (!reportContents) {
        console.error('[ERROR] report-contents element not found.');
        return;
    }

    reportContents.innerHTML = ''; // 기존 리포트 초기화

    if (!reportData || Object.keys(reportData).length === 0) {
        const errorCard = document.createElement('div');
        errorCard.className = 'error-card';
        errorCard.textContent = '리포트 데이터가 없습니다.';
        reportContents.appendChild(errorCard);
        return;
    }

    // KPI 데이터 추가
    const metrics = [
        { label: '총 방문자수', value: reportData.totalActiveUsers || 'N/A', unit: '명' },
        { 
            label: '총 세션수', 
            value: reportData.totalSessions || 'N/A', 
            unit: '회', 
            subLabel: reportData.averageSessionDuration ? `평균 체류시간: ${parseFloat(reportData.averageSessionDuration).toFixed(2)}초` : '평균 체류시간: N/A'
        },
        { label: '주 유입 채널', value: reportData.topSourceMedium || 'N/A' },
        { label: '신규 방문자', value: reportData.firstVisits || 'N/A', unit: '명' },
    ];

    metrics.forEach(metric => {
        const card = document.createElement('div');
        card.className = 'kpi-card';

        // KPI 카드 내용
        card.innerHTML = `
            <div class="kpi-content">
                <div class="kpi-label">${metric.label}</div>
                <div class="kpi-value">${metric.value} <span>${metric.unit || ''}</span></div>
                ${metric.subLabel ? `<div class="kpi-sub-label">${metric.subLabel}</div>` : ''}
            </div>
        `;

        // 삭제 버튼 추가
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-kpi-btn';
        deleteButton.textContent = '삭제';
        
        // 삭제 버튼 클릭 시 해당 KPI 카드 삭제
        deleteButton.addEventListener('click', () => {
            card.remove();  // 카드 삭제
            console.log(`[INFO] KPI 카드 삭제됨 - ${metric.label}`);
        });

        // KPI 카드에 삭제 버튼 추가
        card.appendChild(deleteButton);

        reportContents.appendChild(card);
    });

    // 목표 달성 섹션 추가
    if (reportData.goals && Array.isArray(reportData.goals)) {
        addGoalAchievementSection(reportData.goals, reportContents);
    } else {
        console.log('[INFO] 목표 데이터가 없습니다.');
    }

    // 시각화 섹션 추가
    if (reportData.visualization) {
        createVisualizationSection(reportData.visualization, reportContents);
    }
}
// 목표 달성률 계산 함수
function calculateAchievementRate(eventName, goalValue, goals) {
    // 해당 이벤트의 실제 수치를 가져옴 (현재 데이터를 기준으로 계산)
    const selectedGoal = goals.find(goal => goal.eventName === eventName);

    // 실제 데이터가 없으면 0으로 처리
    const actualCount = selectedGoal ? selectedGoal.actualCount : 0;

    // 달성률 계산
    const achievementRate = ((actualCount / goalValue) * 100).toFixed(2);
    
    return achievementRate; // 계산된 달성률 반환
}

// 목표 달성 영역 추가 함수
function addGoalAchievementSection(goals, container) {
    const goalSection = document.createElement('div');
    goalSection.className = 'goal-section';

    const goalTitle = document.createElement('h3');
    goalTitle.textContent = '목표 달성';
    goalSection.appendChild(goalTitle);

    // 이벤트 선택을 위한 select 태그 추가
    const eventSelect = document.createElement('select');
    eventSelect.className = 'event-select';
    eventSelect.innerHTML = '<option value="">이벤트 선택</option>';

    // goals 배열에서 이벤트 이름을 불러와 select 옵션에 추가
    goals.forEach(goal => {
        const option = document.createElement('option');
        option.value = goal.eventName;
        option.textContent = goal.eventName;
        eventSelect.appendChild(option);
    });

    goalSection.appendChild(eventSelect);

    // 목표 입력 필드와 저장 버튼을 숨긴 상태로 두기
    const goalInputWrapper = document.createElement('div');
    goalInputWrapper.className = 'goal-input-wrapper';
    goalInputWrapper.style.display = 'none'; // 처음에는 숨기기

    const goalValueInput = document.createElement('input');
    goalValueInput.type = 'number';
    goalValueInput.placeholder = '목표를 입력하세요';
    goalValueInput.className = 'goal-input';
    
    const saveButton = document.createElement('button');
    saveButton.className = 'save-goal-btn';
    saveButton.textContent = '목표 저장';
    
    goalInputWrapper.appendChild(goalValueInput);
    goalInputWrapper.appendChild(saveButton);
    
    goalSection.appendChild(goalInputWrapper);

    // 삭제 버튼 추가
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-goal-btn';
    deleteButton.textContent = '삭제';
    goalSection.appendChild(deleteButton);

    // 삭제 버튼 클릭 시 해당 goalSection 삭제
    deleteButton.addEventListener('click', () => {
        goalSection.remove();  // 해당 goalSection 삭제
        console.log(`[INFO] 목표 삭제됨 - 이벤트: ${eventSelect.value}`);
    });

    // 이벤트 선택 변경 시 목표 입력 필드 보여주기
    eventSelect.addEventListener('change', function() {
        const selectedEvent = eventSelect.value;
        if (selectedEvent) {
            const selectedGoal = goals.find(goal => goal.eventName === selectedEvent);

            if (selectedGoal) {
                goalValueInput.value = selectedGoal.goalValue || ''; // 기존 목표 값 채우기

                // 목표 입력 필드와 저장 버튼 보이기
                goalInputWrapper.style.display = 'block';

                // 목표 저장 버튼 클릭 시 목표 값 저장
                saveButton.onclick = function() {
                    const newGoalValue = parseFloat(goalValueInput.value);
                    if (!isNaN(newGoalValue) && newGoalValue >= 0) {
                        // 선택된 이벤트의 목표 값을 업데이트
                        selectedGoal.goalValue = newGoalValue;

                        // 목표 달성률 계산
                        const achievementRate = calculateAchievementRate(selectedGoal.eventName, newGoalValue, goals);
                        const achievementText = `도달률: ${achievementRate}%`;

                        // 달성률 표시
                        let achievementEl = document.getElementById(`achievement-${selectedGoal.eventName}`);
                        
                        // achievementEl이 없으면 새로 생성하여 추가
                        if (!achievementEl) {
                            achievementEl = document.createElement('div');
                            achievementEl.id = `achievement-${selectedGoal.eventName}`;
                            achievementEl.className = 'achievement-rate';
                            goalSection.appendChild(achievementEl);  // goalSection에 추가
                        }

                        // 달성률 업데이트
                        achievementEl.textContent = achievementText;
                        console.log(`[INFO] 목표 저장됨 - 이벤트: ${selectedGoal.eventName}, 목표값: ${newGoalValue}, 달성률: ${achievementRate}%`);
                    } else {
                        alert('유효한 목표 값을 입력하세요.');
                    }
                };
            }
        } else {
            goalInputWrapper.style.display = 'none'; // 이벤트 선택을 취소하면 목표 입력 필드 숨기기
        }
    });

    container.appendChild(goalSection);
}



function createVisualizationSection(visualizationData, targetContainer) {
    // 차트를 포함할 섹션 컨테이너 추가
    const visualizationRow = document.createElement('div');
    visualizationRow.className = 'visualization-row';
    targetContainer.appendChild(visualizationRow);

    // 유입 경로별 비율 파이 차트 카드 추가
    const pieChartCard = document.createElement('div');
    pieChartCard.className = 'visualization-card';

    const pieChartTitle = document.createElement('h4');
    pieChartTitle.textContent = '유입 경로 분석';
    pieChartTitle.className = 'chart-title';
    pieChartCard.appendChild(pieChartTitle);

    const pieChartContainer = document.createElement('div');
    pieChartContainer.className = 'visualization pie-chart';
    pieChartCard.appendChild(pieChartContainer);
    visualizationRow.appendChild(pieChartCard);

    // 파이 차트 데이터 렌더링
    if (visualizationData.sessionSourceData && visualizationData.sessionSourceData.length > 0) {
        renderSourceMediumPieChart(visualizationData.sessionSourceData, pieChartContainer);
    } else {
        pieChartContainer.innerHTML = '<p>유입 경로 데이터가 없습니다.</p>';
    }

    // 일별 사용자 변화 라인차트 카드 추가
    const lineChartCard = document.createElement('div');
    lineChartCard.className = 'visualization-card';

    const lineChartTitle = document.createElement('h4');
    lineChartTitle.textContent = '일별 사용자 변화';
    lineChartTitle.className = 'chart-title';
    lineChartCard.appendChild(lineChartTitle);

    const lineChartContainer = document.createElement('div');
    lineChartContainer.className = 'visualization line-chart';
    lineChartCard.appendChild(lineChartContainer);
    visualizationRow.appendChild(lineChartCard);

    // 일별 사용자 데이터 렌더링
    if (visualizationData.dailyActiveUsersData && visualizationData.dailyActiveUsersData.length > 0) {
        renderDailyActiveUsersLineChart(visualizationData.dailyActiveUsersData, lineChartContainer);
    } else {
        lineChartContainer.innerHTML = '<p>일별 사용자 데이터가 없습니다.</p>';
    }
}




// 유입 경로별 비율 파이 차트 렌더링 함수
function renderSourceMediumPieChart(data, container) {
    container.innerHTML = '';  // 기존 차트 초기화

    const width = 300;
    const height = 300;
    const radius = Math.min(width, height) / 2;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const pie = d3.pie()
        .value(d => d.activeUsers);

    const arc = d3.arc()
        .innerRadius(0)
        .outerRadius(radius);

    const color = d3.scaleOrdinal().range(["#4D8AFF", "#A3C9FF", "#E1ECFF"]);

    const pieData = pie(data);

    svg.selectAll('path')
        .data(pieData)
        .enter()
        .append('path')
        .attr('d', arc)
        .attr('fill', (d, i) => color(i))
        .attr('stroke', '#fff')
        .attr('stroke-width', '2px')
        .append('title')
        .text(d => `${d.data.sessionSourceMedium}: ${d.data.activeUsers} users`);
}

// 일별 사용자 변화 라인차트 렌더링 함수
function renderDailyActiveUsersLineChart(data, container) {
    container.innerHTML = ''; // 기존 차트 초기화

    console.log('[DEBUG] Original Data:', data); // 원본 데이터 확인

    // 차트의 여백 설정
    const margin = { top: 20, right: 30, bottom: 70, left: 50 };
    const containerWidth = container.clientWidth; // 부모 컨테이너의 너비
    const width = containerWidth - margin.left - margin.right; // 차트 전체 너비 설정
    const height = 300 - margin.top - margin.bottom; // 차트 전체 높이 설정

    // SVG 요소 생성
    const svg = d3.select(container)
        .append("svg")
        .attr("viewBox", `0 0 ${containerWidth} ${height + margin.top + margin.bottom}`)
        .attr("width", "100%")
        .attr("height", "100%")
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // 날짜 형식을 파싱하기 위한 d3의 시간 파서
    const parseDate = d3.timeParse("%Y%m%d");

    // 데이터 포맷 정리: 날짜 형식 파싱 및 사용자 수 변환
    let parsedData = data.map(d => {
        const parsedDate = parseDate(d.date);
        if (!parsedDate) {
            console.error(`[ERROR] Invalid date format for entry: ${d.date}`);
        }
        return {
            date: parsedDate,
            activeUsers: +d.activeUsers
        };
    }).filter(d => d.date && !isNaN(d.activeUsers));

    console.log('[DEBUG] Parsed Data:', parsedData); // 파싱된 데이터 확인

    // 데이터 정렬 (날짜 순)
    parsedData.sort((a, b) => a.date - b.date);
    console.log('[DEBUG] Sorted Data:', parsedData); // 정렬된 데이터 확인

    // 중복된 날짜 처리 (같은 날짜의 activeUsers 합산)
    parsedData = parsedData.reduce((acc, current) => {
        const existing = acc.find(item => item.date.getTime() === current.date.getTime());
        if (existing) {
            existing.activeUsers += current.activeUsers;
        } else {
            acc.push(current);
        }
        return acc;
    }, []);

    console.log('[DEBUG] Deduplicated Data:', parsedData); // 중복 제거 후 데이터 확인

    // 충분한 데이터가 있는지 확인
    if (parsedData.length < 2) {
        container.innerHTML = '<p>그래프를 그릴 데이터가 충분하지 않습니다.</p>';
        console.error('[ERROR] 데이터가 충분하지 않아 그래프를 그릴 수 없습니다.');
        return;
    }

    // X축과 Y축의 스케일 설정
    const x = d3.scaleTime().range([0, width]);
    const y = d3.scaleLinear().range([height, 0]);

    // X축, Y축 도메인 설정
    x.domain(d3.extent(parsedData, d => d.date));
    y.domain([0, d3.max(parsedData, d => d.activeUsers) * 1.1]); // 최대값보다 약간 더 높게 설정하여 그래프 여백 추가

    console.log('[DEBUG] X Domain:', x.domain()); // X 도메인 설정 확인
    console.log('[DEBUG] Y Domain:', y.domain()); // Y 도메인 설정 확인

    // X축 추가
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x)
            .tickFormat(d3.timeFormat('%Y-%m-%d'))
            .ticks(parsedData.length < 5 ? parsedData.length : 5) // 최대 5개의 레이블만 표시하여 보기 좋게 조정
        )
        .selectAll("text")
        .style("text-anchor", "middle")
        .attr("dx", "-0.5em")
        .attr("dy", "1em")
        .attr("transform", "rotate(-45)");

    // Y축 추가
    svg.append("g")
        .call(d3.axisLeft(y).ticks(5));

    // 라인 생성 함수 정의
    const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.activeUsers))
        .curve(d3.curveMonotoneX); // 부드러운 곡선을 그리도록 설정

    // 라인 추가
    svg.append("path")
        .datum(parsedData)
        .attr("fill", "none")
        .attr("stroke", "#4D8AFF")
        .attr("stroke-width", 2)
        .attr("d", line);

    // 데이터 포인트에 점 추가
    svg.selectAll(".dot")
        .data(parsedData)
        .enter()
        .append("circle")
        .attr("class", "dot")
        .attr("cx", d => x(d.date))
        .attr("cy", d => y(d.activeUsers))
        .attr("r", 4)
        .attr("fill", "#4D8AFF")
        .on("mouseover", function (event, d) {
            d3.select(this)
                .transition()
                .duration(100)
                .attr("r", 6)
                .attr("fill", "#FF6347");

            // 툴팁 추가
            svg.append("text")
                .attr("id", "tooltip")
                .attr("x", x(d.date) + 10)
                .attr("y", y(d.activeUsers) - 10)
                .attr("text-anchor", "start")
                .attr("font-size", "12px")
                .attr("fill", "#333")
                .text(`${d3.timeFormat('%Y-%m-%d')(d.date)}: ${d.activeUsers} users`);
        })
        .on("mouseout", function () {
            d3.select(this)
                .transition()
                .duration(100)
                .attr("r", 4)
                .attr("fill", "#4D8AFF");

            // 툴팁 제거
            d3.select("#tooltip").remove();
        });

    console.log('[DEBUG] Line chart successfully rendered.'); // 라인 차트 성공적으로 렌더링 로그
}

// 차트 리사이징 함수
function renderChartOnResize(data, container) {
    window.addEventListener('resize', () => {
        renderDailyActiveUsersLineChart(data, container);
    });
}





// 지역별 사용자 히트맵 차트 렌더링 함수
function renderRegionHeatMap(data, container) {
    container.innerHTML = ''; // 기존 차트 초기화

    const width = 800;
    const height = 500;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const projection = d3.geoMercator()
        .scale(130)
        .translate([width / 2, height / 1.5]);

    const path = d3.geoPath().projection(projection);

    const color = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, d3.max(data, d => d.activeUsers)]);

    d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson")
        .then(geoData => {
            svg.selectAll("path")
                .data(geoData.features)
                .enter()
                .append("path")
                .attr("d", path)
                .attr("fill", d => {
                    const regionData = data.find(region => region.country === d.properties.name);
                    return regionData ? color(regionData.activeUsers) : "#ccc";
                })
                .attr("stroke", "#999")
                .attr("stroke-width", 0.5);
        })
        .catch(error => console.error('Error loading geojson data:', error));
}




function populatePropertyDropdown(properties) {
    console.log('[DEBUG] populatePropertyDropdown 호출됨. properties:', properties);
    const propertySelectContainer = document.getElementById('property-select');
    propertySelectContainer.innerHTML = '';  // 초기화

    if (properties.length > 0) {
        const select = document.createElement('select');
        select.id = 'property-dropdown';

        properties.forEach(property => {
            const option = document.createElement('option');
            option.value = property.name.split('/')[1];
            option.text = property.displayName;
            select.appendChild(option);
        });

        propertySelectContainer.appendChild(select);

        let isManualChange = false;

        // 기본 선택 설정
        select.value = properties[0].name.split('/')[1];
        setSelectedPropertyId(select.value);  // 첫 번째 속성을 기본으로 설정
        isManualChange = true;

        // 변경 시 이벤트 리스너 설정
        select.addEventListener('change', function() {
            if (isManualChange) {
                const selectedPropertyId = this.value;
                console.log('[DEBUG] select 변경됨. 선택된 property ID:', selectedPropertyId);
                setSelectedPropertyId(selectedPropertyId);
                // 필요 시 호출 (예: 자동으로 리포트를 불러오는 경우)
                fetchMonthlyReport(selectedPropertyId);
            }
        });
    } else {
        propertySelectContainer.textContent = '해당 계정에 속성이 없습니다.';
    }
}


