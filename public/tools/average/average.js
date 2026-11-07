const state = {
    times: [],
    averageTags: [],
    eventType: document.getElementById('event-type').value,
    userSolves: [],
    userAverages: [],
    editIndex: null,
    mode: 'input', // 'input' or 'timer'
    timerRunning: false,
    timerStart: null,
    timerReady: false,
    timerHolding: false,
    timerAnimFrame: null,
    currentScramble: null,
    prefetchedScramble: null,
    undoData: null,
    previousAverage: null,
    sessionPrSingle: {},
    sessionPrAverage: {},
    // Inspection
    inspectionRunning: false,
    inspectionStart: null,
    inspectionAnimFrame: null,
    inspectionTime: null, // seconds used in the last inspection
};

// ============================================================
// EVENT METADATA
// Single source of truth for event name / puzzle-viewer id / icon. Whether an
// event uses Mean-of-3 instead of Average-of-5 comes from CubingCore (shared
// with every other tool and the backend). Previously this was
// spread across meanEvents / PUZZLE_MAP / EVENT_NAMES / an inline icons map
// that had drifted out of sync with each other.
// ============================================================

const EVENTS = {
    '222': { name: '2x2x2', puzzle: '2x2x2' },
    '333': { name: '3x3x3', puzzle: '3x3x3' },
    '444': { name: '4x4x4', puzzle: '4x4x4' },
    '555': { name: '5x5x5', puzzle: '5x5x5' },
    '666': { name: '6x6x6', puzzle: '6x6x6' },
    '777': { name: '7x7x7', puzzle: '7x7x7' },
    '333bf': { name: '3x3 Blindfolded', puzzle: '3x3x3' },
    '333oh': { name: '3x3 One-Handed', puzzle: '3x3x3' },
    'clock': { name: 'Clock', puzzle: 'clock' },
    'fto': { name: 'FTO', puzzle: 'fto' },
    'minx': { name: 'Megaminx', puzzle: 'megaminx' },
    'pyram': { name: 'Pyraminx', puzzle: 'pyraminx' },
    'skewb': { name: 'Skewb', puzzle: 'skewb' },
    'sq1': { name: 'Square-1', puzzle: 'square1' },
    '444bf': { name: '4x4 Blindfolded', puzzle: '4x4x4' },
    '555bf': { name: '5x5 Blindfolded', puzzle: '5x5x5' },
    '333mbf': { name: '3x3 Multi-Blind', puzzle: '3x3x3' },
    '333fm': { name: '3x3 Fewest Moves', puzzle: '3x3x3' },
};

// Events that use Mean of 3 rather than Average of 5, derived from EVENTS
// so this can never drift out of sync with the rest of the event metadata.
const meanEvents = Object.keys(EVENTS).filter((id) => CubingCore.isMeanEvent(id));

const BLIND_EVENTS = ['333bf', '444bf', '555bf'];

function isDnfValue(value) {
    return (
        value === 'DNF' ||
        value === -1 ||
        value === Infinity ||
        value === Number.POSITIVE_INFINITY ||
        value === Number.NEGATIVE_INFINITY
    );
}

function getSolveValue(solve) {
    if (!solve) return Infinity;

    if (solve.penalty === 'dnf' || solve.raw === -1 || isDnfValue(solve.value)) {
        return Infinity;
    }

    const raw = Number(solve.value ?? solve.raw);
    if (!Number.isFinite(raw)) return Infinity;

    return solve.penalty === 'plus2' ? raw + 2 : raw;
}

// ============================================================
// Shared time-string parsing
// Single canonical parser used by the manual time input, the edit modal,
// the competition page, and the goal-time settings input. Previously each
// of these re-implemented "DNF" / "m:ss.xx" / "ss.xx" parsing slightly
// differently.
// ============================================================

function parseTimeString(rawInput) {
    const parsed = CubingCore.parseTime(rawInput);
    return { raw: parsed.seconds, isDnf: parsed.isDnf, error: parsed.error };
}

// Wraps parseTimeString for the main time-input field / edit modal, which
// represent DNF as raw = -1, value = Infinity, to match the stored solve shape.
function parseSolveInput(rawInput) {
    const parsed = parseTimeString(rawInput);
    if (parsed.error) {
        return { raw: null, value: null, penalty: null, error: parsed.error };
    }
    if (parsed.isDnf) {
        return { raw: -1, value: Infinity, penalty: 'dnf', error: null };
    }
    return { raw: parsed.raw, value: parsed.raw, penalty: null, error: null };
}

function getFiniteAverageValues(items) {
    return items.map((item) => Number(item)).filter((value) => Number.isFinite(value));
}

// ============================================================
// Shared best/worst-solve helper
// Given an array of numeric solve values (DNF represented as Infinity),
// returns the index of the best (lowest finite) and worst (first DNF, else
// highest finite) solve. Previously this min/max/"mark first occurrence"
// logic was reimplemented independently in four different places.
// ============================================================

function getBestWorstIndices(values) {
    return CubingCore.bestWorstIndices(values);
}

// === Format input field on input ===
document.getElementById('timeInput').addEventListener('input', (e) => {
    formatInputField(e.target);
});

// === Add a time when Enter pressed ===
document.getElementById('timeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTime();
});

// === Recalculate when target time changes ===
document.getElementById('target').addEventListener('input', (e) => {
    calculateStats();
    formatInputField(e.target);
    updateTargetDisplay();
    setStorage('setting_target', e.target.value);
});

document.getElementById('card-tft').addEventListener('click', () => {
    showUserFeedbackPopup({
        title: 'Time for Target',
        messageHtml:
            'This stat calculates the time needed on your next solve in order to hit your target. You can adjust your target in the <strong>Settings</strong> tab, keeping it constant, setting it to your personal best, or having it recalculate automatically to help you progress towards a bigger goal.<br><br>If the TFT shows two times separated by a |, the first time is the time needed to guarantee hitting your target on the next solve. The second number indicates the time needed to still have a chance of reaching your target on the next two solves.',
    });
});

// === Update target display on timer page ===
function updateTargetDisplay() {
    const targetEl = document.getElementById('timerTarget');
    if (!targetEl) return;
    const targetVal = document.getElementById('target').value;
    if (targetVal && parseFloat(targetVal) > 0) {
        targetEl.textContent = `Target: ${targetVal}`;
        targetEl.classList.add('visible');
    } else {
        targetEl.classList.remove('visible');
    }
}

// === Format input field ===
function formatInputField(input) {
    input.value = CubingCore.formatTimeInputValue(input.value);
}

// === Format time for display (handles minutes:seconds) ===
function formatTime(seconds) {
    return CubingCore.formatTime(seconds);
}

function getRequiredSolvesForEvent(eventType) {
    return meanEvents.includes(eventType) ? 3 : 5;
}

// === Get required solve count for current event ===
function getRequiredSolves() {
    return getRequiredSolvesForEvent(state.eventType);
}

function getMeanOfFiniteValues(values) {
    return CubingCore.meanOfFinite(values);
}

// Average of the most recent solves for the event (Ao5 / Mo3, WCA rules).
// Returns null while there are not enough solves, Infinity for a DNF average and
// otherwise the average in seconds. (An Ao5 with exactly one DNF is a valid average:
// the DNF counts as the worst solve. This used to be reported as "no average".)
function getAverageValueForSet(solves, eventType = state.eventType) {
    if (!Array.isArray(solves)) return null;
    return CubingCore.averageForEvent(
        solves.map((solve) => getSolveValue(solve)),
        eventType,
    );
}

// === Rebuild userAverages from stored averages for an event ===
// Use this any time a completed average is invalidated (penalty change,
// edit, delete). A single solve's value cannot be reliably matched back to
// the average it belonged to, so the safe approach is to rebuild the whole
// list from state.averageTags rather than trying to splice out one entry.
function rebuildUserAverages(event) {
    state.userAverages = state.averageTags
        .filter((tag) => tag.event === event)
        .map((a) => parseFloat(a.average))
        .filter((a) => !isNaN(a) && isFinite(a));
}

// === Is the stats page currently the active tab? ===
// Used to avoid rebuilding Chart.js charts on every solve/average change
// when the stats page isn't even visible.
function isStatsPageActive() {
    return !!document.getElementById('page-stats')?.classList.contains('active');
}

// === Update session stats ===
function updateSessionStats() {
    const currentEvent = document.getElementById('event-type').value;
    const statsView = window._statsView || 'averages';

    const bestElem = document.getElementById('sessionBest');
    const avgElem = document.getElementById('sessionAvg');
    const countElem = document.getElementById('sessionCount');
    const deleteShame = document.getElementById('deleteStatShame');
    const countLabel = countElem?.closest('.stat-card')?.querySelector('.stat-label');

    if (deleteShame) deleteShame.textContent = state.deleteStatShameCounter || 0;

    if (statsView === 'solves') {
        if (countLabel) countLabel.textContent = 'Solves';

        const allSolves = [];
        state.averageTags
            .filter((tag) => tag.event === currentEvent)
            .forEach((tag) => (tag.times || []).forEach((s) => allSolves.push(s)));
        state.times.forEach((s) => allSolves.push(s));

        if (countElem) countElem.textContent = allSolves.length;

        if (allSolves.length === 0) {
            if (bestElem) bestElem.textContent = '-';
            if (avgElem) avgElem.textContent = '-';
            return;
        }

        const validSolves = getFiniteAverageValues(allSolves.map((solve) => getSolveValue(solve)));

        if (validSolves.length > 0) {
            const best = Math.min(...validSolves);
            const mean = CubingCore.meanOfFinite(validSolves);
            if (bestElem) bestElem.textContent = formatTime(best);
            if (avgElem) avgElem.textContent = formatTime(mean);
        } else {
            if (bestElem) bestElem.textContent = 'DNF';
            if (avgElem) avgElem.textContent = 'DNF';
        }
    } else {
        if (countLabel) countLabel.textContent = 'Averages';

        const eventAverages = state.averageTags.filter((tag) => tag.event === currentEvent);

        if (countElem) countElem.textContent = eventAverages.length;

        if (eventAverages.length === 0) {
            if (bestElem) bestElem.textContent = '-';
            if (avgElem) avgElem.textContent = '-';
            return;
        }

        const validAverages = getFiniteAverageValues(
            eventAverages.map((average) => average.average),
        );

        if (validAverages.length > 0) {
            const best = Math.min(...validAverages);
            const mean = CubingCore.meanOfFinite(validAverages);
            if (bestElem) bestElem.textContent = formatTime(best);
            if (avgElem) avgElem.textContent = formatTime(mean);
        } else {
            if (bestElem) bestElem.textContent = 'DNF';
            if (avgElem) avgElem.textContent = 'DNF';
        }
    }
}

// === Update averages empty state ===
function updateAveragesEmptyState() {
    const currentEvent = document.getElementById('event-type').value;
    const eventAverages = state.averageTags.filter((tag) => tag.event === currentEvent);
    const emptyEl = document.getElementById('averagesEmpty');
    const listEl = document.getElementById('tagContainer');
    const solvesEl = document.getElementById('solvesContainer');

    const statsView = window._statsView || 'averages';

    if (statsView === 'solves') {
        if (emptyEl) emptyEl.style.display = 'none';
        if (listEl) listEl.style.display = 'none';
        if (solvesEl) solvesEl.style.display = 'block';
    } else {
        if (emptyEl) {
            emptyEl.style.display = eventAverages.length === 0 ? 'block' : 'none';
        }
        if (listEl) {
            listEl.style.display = eventAverages.length === 0 ? 'none' : 'block';
        }
        if (solvesEl) solvesEl.style.display = 'none';
    }
}

// === STATS PAGE CHARTS ===

let statsAvgChart = null;
let statsInspChart = null;

function calcStatsTrend(data) {
    const n = data.length;
    if (n < 2) return data.map(() => null);
    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumXX = 0,
        count = 0;
    data.forEach((y, i) => {
        if (y === null || y === undefined) return;
        const x = i + 1;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
        count++;
    });
    if (count < 2) return data.map(() => null);
    const slope = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / count;
    return data.map((_, i) => +(slope * (i + 1) + intercept).toFixed(4));
}

function renderStatsCharts() {
    if (!window.Chart) return;
    // Avoid rebuilding charts the user can't currently see (e.g. every solve
    // add/delete used to pay for a full Chart.js destroy+rebuild even while
    // on the timer/input page).
    if (!isStatsPageActive()) return;

    const currentEvent = document.getElementById('event-type').value;
    updateSliderMax(currentEvent);
    const n = parseInt(document.getElementById('statsHistorySlider')?.value || '30', 10);
    const sliderValEl = document.getElementById('statsSliderVal');
    if (sliderValEl) sliderValEl.textContent = n;

    const rootStyles = getComputedStyle(document.documentElement);
    const linkColor = rootStyles.getPropertyValue('--link-color').trim();
    const secondaryText = rootStyles.getPropertyValue('--secondary-text').trim();
    const mainLighter = rootStyles.getPropertyValue('--main-lighter').trim();
    const successColor = (rootStyles.getPropertyValue('--success') || '#28a745').trim();
    const warningColor = (rootStyles.getPropertyValue('--warning') || '#f0a500').trim();

    // Build all individual solves for current event (used for both singles chart + inspection chart)
    const allSolves = [];
    state.averageTags
        .filter((tag) => tag.event === currentEvent)
        .forEach((tag) => (tag.times || []).forEach((s) => allSolves.push(s)));
    state.times.forEach((s) => allSolves.push(s));

    // ── First chart: Averages or Singles depending on stats view ───
    const statsView = window._statsView || 'averages';
    const avgLabelEl = document.getElementById('statsLegendAvgLabel');
    const avgCanvas = document.getElementById('statsAvgChart');

    if (avgCanvas) {
        if (statsAvgChart) {
            statsAvgChart.destroy();
            statsAvgChart = null;
        }

        let chartData, chartLabels, meanVal;

        if (statsView === 'solves') {
            if (avgLabelEl) avgLabelEl.textContent = 'Singles';
            const recentSolves = allSolves.slice(-n);
            chartData = recentSolves.map((solve) => {
                const value = getSolveValue(solve);
                return Number.isFinite(value) ? value : null;
            });
            chartLabels = recentSolves.map(
                (_, i) => allSolves.length - recentSolves.length + i + 1,
            );
            const validSingles = chartData.filter((v) => v !== null);
            meanVal = CubingCore.meanOfFinite(validSingles) ?? 0;
        } else {
            if (avgLabelEl) avgLabelEl.textContent = 'Averages';
            const eventTags = state.averageTags.filter((tag) => tag.event === currentEvent);
            const recentTags = eventTags.slice(-n);
            chartData = recentTags.map((tag) => {
                const v = parseFloat(tag.average);
                return isNaN(v) || !isFinite(v) ? null : v;
            });
            chartLabels = recentTags.map((_, i) => eventTags.length - recentTags.length + i + 1);
            const validAvg = chartData.filter((v) => v !== null);
            meanVal = CubingCore.meanOfFinite(validAvg) ?? 0;
        }

        if (chartData.length > 1) {
            const trend = calcStatsTrend(chartData);
            statsAvgChart = new window.Chart(avgCanvas, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [
                        {
                            data: Array(chartData.length).fill(meanVal),
                            borderColor: 'red',
                            borderWidth: 1.5,
                            borderDash: [6, 6],
                            pointRadius: 0,
                            fill: false,
                            label: 'Mean',
                            order: 0,
                        },
                        {
                            data: trend,
                            borderColor: successColor,
                            borderWidth: 1.5,
                            borderDash: [5, 6],
                            pointRadius: 0,
                            fill: false,
                            label: 'Trend',
                            order: 1,
                        },
                        {
                            data: chartData,
                            borderColor: linkColor,
                            borderWidth: 1.5,
                            pointRadius: chartData.length > 40 ? 0 : 2,
                            pointHoverRadius: 4,
                            pointBackgroundColor: linkColor,
                            backgroundColor: linkColor + '18',
                            fill: true,
                            tension: 0.35,
                            label: statsView === 'solves' ? 'Single' : 'Average',
                            order: 2,
                            spanGaps: true,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 200 },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) =>
                                    ctx.raw !== null ? ` ${formatTime(ctx.raw)}` : ' DNF',
                            },
                        },
                    },
                    scales: {
                        x: { display: false },
                        y: {
                            grid: { color: mainLighter },
                            ticks: {
                                color: secondaryText,
                                font: { family: 'Courier New', size: 10 },
                                maxTicksLimit: 5,
                                callback: (v) => formatTime(v),
                            },
                        },
                    },
                },
            });
        }
    }

    // ── Inspection chart ────────────────────────────────────
    const recentSolves = allSolves.slice(-n);
    const inspVals = recentSolves.map((s) => s.inspectionTime ?? null);
    const hasInsp = inspVals.some((v) => v !== null);

    const inspChartWrap = document.getElementById('statsInspChartWrap');
    const inspCanvas = document.getElementById('statsInspChart');
    const legendInspDot = document.getElementById('statsLegendInspDot');
    const legendInspLabel = document.getElementById('statsLegendInspLabel');
    if (inspChartWrap) inspChartWrap.hidden = !hasInsp;
    if (legendInspDot) legendInspDot.hidden = !hasInsp;
    if (legendInspLabel) legendInspLabel.hidden = !hasInsp;

    if (inspCanvas) {
        if (statsInspChart) {
            statsInspChart.destroy();
            statsInspChart = null;
        }
        if (hasInsp && recentSolves.length > 1) {
            const validInsp = inspVals.filter((v) => v !== null);
            const inspMean = CubingCore.meanOfFinite(validInsp);
            const inspTrend = calcStatsTrend(inspVals);

            statsInspChart = new window.Chart(inspCanvas, {
                type: 'line',
                data: {
                    labels: recentSolves.map(
                        (_, i) => allSolves.length - recentSolves.length + i + 1,
                    ),
                    datasets: [
                        {
                            data: Array(recentSolves.length).fill(inspMean),
                            borderColor: 'red',
                            borderWidth: 1.5,
                            borderDash: [6, 6],
                            pointRadius: 0,
                            fill: false,
                            label: 'Mean',
                            order: 0,
                        },
                        {
                            data: inspTrend,
                            borderColor: successColor,
                            borderWidth: 1.5,
                            borderDash: [5, 6],
                            pointRadius: 0,
                            fill: false,
                            label: 'Trend',
                            order: 1,
                        },
                        {
                            data: inspVals,
                            borderColor: warningColor,
                            borderWidth: 1.5,
                            pointRadius: recentSolves.length > 40 ? 0 : 2,
                            pointHoverRadius: 4,
                            pointBackgroundColor: warningColor,
                            backgroundColor: warningColor + '18',
                            fill: true,
                            tension: 0.35,
                            label: 'Inspection',
                            order: 2,
                            spanGaps: true,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 200 },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => (ctx.raw !== null ? ` ${ctx.raw.toFixed(2)}s` : ''),
                            },
                        },
                    },
                    scales: {
                        x: { display: false },
                        y: {
                            grid: { color: mainLighter },
                            ticks: {
                                color: secondaryText,
                                font: { family: 'Courier New', size: 10 },
                                maxTicksLimit: 5,
                                callback: (v) => `${v.toFixed(1)}s`,
                            },
                        },
                    },
                },
            });
        }
    }
}

// === SOLVES VIEW (stats page) ===

function displaySolves() {
    const container = document.getElementById('solvesContainer');
    if (!container) return;

    const currentEvent = document.getElementById('event-type').value;
    // Build {solve, tag} pairs so each solve knows its parent average
    const allItems = [];

    state.averageTags
        .filter((tag) => tag.event === currentEvent)
        .forEach((tag) => {
            (tag.times || []).forEach((solve) => allItems.push({ solve, tag }));
        });

    // In-progress solves have no parent average yet
    state.times.forEach((solve) => allItems.push({ solve, tag: null }));

    container.innerHTML = '';

    if (allItems.length === 0) {
        const li = document.createElement('li');
        li.className = 'solves-empty';
        li.textContent = 'No solves yet.';
        container.appendChild(li);
        return;
    }

    // Show most recent first
    [...allItems].reverse().forEach(({ solve, tag }, idx) => {
        const li = document.createElement('li');
        if (tag) li.style.cursor = 'pointer';

        const avgRow = document.createElement('div');
        avgRow.classList.add('avg-row');

        const leftSide = document.createElement('span');
        leftSide.style.cssText = 'display:flex;align-items:baseline;gap:0.5em;';

        const numSpan = document.createElement('span');
        numSpan.className = 'solve-num';
        numSpan.textContent = `${allItems.length - idx}.`;
        leftSide.appendChild(numSpan);

        const solveValue = getSolveValue(solve);
        const timeSpan = document.createElement('span');
        timeSpan.classList.add('avg-value');
        if (!Number.isFinite(solveValue)) {
            timeSpan.textContent = 'DNF';
            timeSpan.style.color = 'var(--error)';
        } else if (solve.penalty === 'plus2') {
            timeSpan.textContent = formatTime(solveValue) + '+';
            timeSpan.style.color = 'var(--warning, #f0a500)';
        } else {
            timeSpan.textContent = formatTime(solveValue);
        }
        leftSide.appendChild(timeSpan);

        const rank = Number.isFinite(solveValue) ? getSingleRank(solveValue) : null;
        if (rank) {
            const rankSpan = document.createElement('span');
            rankSpan.classList.add('avg-rank');
            rankSpan.textContent = `PR${rank}`;
            leftSide.appendChild(rankSpan);
        }

        avgRow.appendChild(leftSide);

        // Right: action button (only for solves that belong to a completed average)
        if (tag) {
            const rightBtns = document.createElement('span');
            rightBtns.classList.add('avg-actions');

            const openBtn = document.createElement('button');
            openBtn.classList.add('avg-action-btn');
            openBtn.innerHTML = '<i class="fas fa-layer-group"></i>';
            openBtn.title = 'View average';
            openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAverageDetail(tag);
            });
            rightBtns.appendChild(openBtn);
            avgRow.appendChild(rightBtns);

            li.addEventListener('click', () => showAverageDetail(tag));
        }

        li.appendChild(avgRow);
        container.appendChild(li);
    });

    // Refresh charts after solves update
    renderStatsCharts();
}

// === Add time ===
function addTime() {
    const input = document.getElementById('timeInput');
    const parsed = parseSolveInput(input.value);

    if (parsed.error) {
        alert(parsed.error);
        return;
    }

    const required = getRequiredSolves();
    if (state.times.length >= required) {
        state.times = [];
    }

    const time = parsed.raw;
    const penalty = parsed.penalty;
    const event = document.getElementById('event-type').value;

    // Generate a custom ID to link each time to an average
    const averageId = `${event}-${Date.now()}`;

    // Save undo state before modification
    saveUndoState();

    state.times.push({
        raw: time,
        penalty: penalty,
        value: penalty === 'dnf' ? Infinity : time,
        event: event,
        averageId: averageId,
        scramble: state.currentScramble,
    });
    if (penalty !== 'dnf') state.userSolves.push(time); // add to user solves for ranking

    // Track session PR single
    if (
        time !== -1 &&
        time !== Infinity &&
        (!state.sessionPrSingle[event] || time < state.sessionPrSingle[event].value)
    ) {
        state.sessionPrSingle[event] = {
            value: time,
            scramble: state.currentScramble,
            event: event,
        };
    }

    input.value = '';

    calculateStats();
    displayCurrentTimes();
    updateUndoButton();
    saveIncomplete();
    generateScramble();
    window._showMobileSolveResult?.();
}

// === Calculate stats for current session ===

function calculateStats() {
    const n = state.times.length;
    const required = getRequiredSolves();

    // Always update general session UI
    updateSessionStats();
    updateAveragesEmptyState();
    updateAverageProgressUI(n, required);

    updateMean(n);

    // Not enough solves for BPA/WPA yet
    if (n < required - 1) {
        resetBpaWpa(document.getElementById('target').value);
        resetProbabilityAndMla();
        return;
    }

    if (n == required) {
        // Calculate current averages
        const { ao5, mo3 } = calculateCurrentAverages(n);

        // Save completed averages
        saveCompletedAverage(mo3, 3);
        saveCompletedAverage(ao5, 5);
    } else {
        // Calculate BPA / WPA / TFT
        const target = document.getElementById('target').value;
        const { bpa, wpa, tft } = calculateBpaWpaTft(state.times, target);

        displayBpaWpaTft(bpa, wpa, tft);

        // Calculate probability / MLA information
        updateProbabilityAndMla(n, bpa, wpa);
    }

    updateAverageProgressUI(n, required);
}

// ============================================================
// General display helpers
// ============================================================

function updateMean(n) {
    const elem = document.getElementById('mean');
    if (!elem) return;

    if (n === 0) {
        elem.textContent = '-';
        return;
    }

    const mean = CubingCore.mean(state.times.map((time) => getSolveValue(time)));
    elem.textContent = mean !== null && Number.isFinite(mean) ? formatTime(mean) : 'DNF';
}

function updateAverageProgressUI(n, required) {
    const duringAverage = document.querySelectorAll('.during-average');
    const afterAverage = document.querySelectorAll('.after-average');

    const averageStarted = n <= required - 1;
    const averageDone = n === required;

    duringAverage.forEach((el) => {
        el.style.display = averageStarted && !el.innerText.includes('-') ? 'flex' : 'none';
    });

    afterAverage.forEach((el) => {
        el.style.display = averageDone ? 'flex' : 'none';
    });
}

// ============================================================
// Current averages
// ============================================================

function calculateCurrentAverages(n) {
    let ao5 = null;
    let mo3 = null;

    const eventType = state.eventType;
    const required = getRequiredSolvesForEvent(eventType);
    if (n < required) return { ao5, mo3 };

    const averageValue = getAverageValueForSet(state.times.slice(-required), eventType);
    if (averageValue === null) return { ao5, mo3 };

    // 'DNF' is a real, saved result (e.g. two DNFs in an Ao5, any DNF in a Mo3).
    const text = Number.isFinite(averageValue) ? averageValue.toFixed(2) : 'DNF';
    if (meanEvents.includes(eventType)) mo3 = text;
    else ao5 = text;

    return { ao5, mo3 };
}

// ============================================================
// BPA / WPA / TFT
// ============================================================

function displayBpaWpaTft(bpa, wpa, tft) {
    setAverageStat(document.getElementById('bpa'), bpa);

    setAverageStat(document.getElementById('wpa'), wpa);

    const tftElem = document.getElementById('tft');

    if (tftElem) {
        if (tft == null || tft === '') {
            tftElem.textContent = '-';
        } else {
            tftElem.textContent = tft;
        }
    }
}

function setAverageStat(elem, value) {
    if (!elem) return;

    const isNumber = typeof value === 'number' && isFinite(value);
    const text = value === 'DNF' ? 'DNF' : isNumber ? formatTime(value) : '-';
    const rank = isNumber ? getAverageRank(value) : null;

    renderMetricValue(elem, text, { rank, pillKind: 'average' });
}

function renderMetricValue(
    elem,
    value,
    { rank = null, pillKind = 'average', fallbackText = '–' } = {},
) {
    if (!elem) return;

    elem.innerHTML = '';
    elem.style.position = 'relative';

    const displayText =
        value === null || value === undefined || value === '' ? fallbackText : value;
    const valueDiv = document.createElement('div');
    valueDiv.textContent = displayText;
    valueDiv.style.position = 'relative';
    valueDiv.style.zIndex = '1';
    elem.appendChild(valueDiv);

    if (!rank || getStorage('setting_show_pr_pills') === false) {
        return;
    }

    const prDiv = document.createElement('div');
    prDiv.className = 'pr-rank-pill';
    prDiv.textContent = `PR #${rank}`;
    prDiv.style.opacity = '0.8';
    prDiv.style.fontSize = '0.7em';
    prDiv.style.position = 'absolute';
    prDiv.style.left = '50%';
    prDiv.style.transform = 'translate(-50%, 100%)';
    prDiv.style.bottom = '0';
    prDiv.style.zIndex = '2';
    prDiv.style.background = getPrPillColor(rank, pillKind);

    elem.appendChild(prDiv);
}

// This is shared by BPA, WPA and MLA.
function setStatWithPr(elem, value, prRank) {
    renderMetricValue(elem, value, { rank: prRank, pillKind: 'average' });
}

function resetBpaWpa(target) {
    const bpa = document.getElementById('bpa');
    const wpa = document.getElementById('wpa');
    const tft = document.getElementById('tft');

    const time = calculateTimeForTarget(state.times, target);

    if (bpa) bpa.textContent = '-';
    if (wpa) wpa.textContent = '-';
    if (tft) tft.textContent = time;
}

// ============================================================
// Probability + MLA
// ============================================================

function updateProbabilityAndMla(n, bpa, wpa) {
    const probBpa = document.getElementById('bpa-prob');
    const probWpa = document.getElementById('wpa-prob');
    const mla = document.getElementById('mla');
    const mlaSolve = document.getElementById('mla-solve');

    const canShowProbability =
        n === 4 &&
        !meanEvents.includes(state.eventType) &&
        typeof bpa === 'number' &&
        isFinite(bpa) &&
        typeof wpa === 'number' &&
        isFinite(wpa) &&
        state.userSolves.length >= 5;

    const finiteSolves = state.userSolves.filter(isFinite).splice(0, 24 * getRequiredSolves());

    const canShowMlaMo3 =
        n === 2 && meanEvents.includes(state.eventType) && finiteSolves.length >= 3;

    if (canShowProbability) {
        updateAo5Probability(probBpa, probWpa, mla, mlaSolve);
        return;
    }

    clearProbabilityPills(probBpa, probWpa);

    if (canShowMlaMo3) {
        updateMla(mla, mlaSolve);
    } else {
        if (mla) mla.textContent = '-';
        if (mlaSolve) mlaSolve.textContent = '';
    }
}

// ============================================================
// Ao5 probability + MLA
// ============================================================

function updateAo5Probability(probBpaElem, probWpaElem, mlaElem, mlaSolveElem) {
    const currentValues = state.times.map((time) => getSolveValue(time));

    const validValues = currentValues.filter(isFinite);

    const best = Math.min(...validValues);
    const worst = Math.max(...validValues);
    const total = state.userSolves.length;
    if (total === 0 || validValues.length === 0) {
        clearProbabilityPills(probBpaElem, probWpaElem);
        updateMla(mlaElem, mlaSolveElem);
        return;
    }

    const pBpa =
        state.userSolves.filter((solve) => isFinite(solve) && solve <= best).length / total;

    const pWpa = state.userSolves.filter((solve) => solve >= worst).length / total;

    setProbabilityPill(probBpaElem, pBpa);
    setProbabilityPill(probWpaElem, pWpa);

    updateMla(mlaElem, mlaSolveElem);
}

function setProbabilityPill(elem, probability) {
    if (!elem) return;

    if (getStorage('setting_show_prob_pills') === false) {
        clearProbabilityPill(elem);
        return;
    }

    elem.textContent = `${(probability * 100).toFixed(1)}%`;
    elem.style.background = 'gray';
    elem.style.opacity = 0.6;
    elem.style.color = '#fff';
}

function clearProbabilityPill(elem) {
    if (!elem) return;

    elem.textContent = '';
    elem.style.background = '';
    elem.style.color = '';
}

function clearProbabilityPills(bpaElem, wpaElem) {
    clearProbabilityPill(bpaElem);
    clearProbabilityPill(wpaElem);
}

function resetProbabilityAndMla() {
    clearProbabilityPills(document.getElementById('bpa-prob'), document.getElementById('wpa-prob'));

    const mla = document.getElementById('mla');
    const mlaSolve = document.getElementById('mla-solve');

    if (mla) mla.textContent = '-';
    if (mlaSolve) mlaSolve.textContent = '';
}

// ============================================================
// Monte-Carlo "Most Likely Average" (MLA)
// Simulates the next solve from the user's solve history and estimates the
// resulting Ao5 (best/worst trimmed) or Mo3 (plain mean) accordingly.
// Previously this was two nearly-identical functions (updateAo5Mla /
// updateMo3Mla) and the shared display step used Ao5 trimming logic even
// for Mo3 events, which produced a wrong result for Mo3 (it averaged only 2
// of the 3 values instead of all 3).
// ============================================================

function updateMla(mlaElem, mlaSolveElem) {
    const eventType = state.eventType;
    const required = getRequiredSolvesForEvent(eventType);
    const isMean = meanEvents.includes(eventType);

    const finiteSolves = state.userSolves.filter(isFinite).splice(0, 24 * required);

    if (finiteSolves.length < required) {
        if (mlaElem) mlaElem.textContent = '-';
        if (mlaSolveElem) mlaSolveElem.textContent = '';
        return;
    }

    const iterations = isMean ? 2000 : 5000;
    const results = runMonteCarlo(iterations, () => {
        return finiteSolves[Math.floor(Math.random() * finiteSolves.length)];
    });

    displayMlaResult(mlaElem, mlaSolveElem, results, isMean);
}

function runMonteCarlo(iterations, callback) {
    const results = [];

    for (let i = 0; i < iterations; i++) {
        results.push(callback());
    }

    return results.filter(isFinite);
}

function displayMlaResult(mlaElem, mlaSolveElem, results, isMean) {
    const expectedNextSolve = CubingCore.meanOfFinite(results);

    if (mlaSolveElem) {
        mlaSolveElem.textContent =
            expectedNextSolve !== null ? `if ${formatTime(expectedNextSolve)}` : '';
    }

    if (!mlaElem) return;

    if (expectedNextSolve === null) {
        mlaElem.textContent = 'DNF';
        return;
    }

    // Same rules as a real average: Ao5 drops best+worst, Mo3 is the plain mean.
    const expectedMla = CubingCore.averageForEvent(
        [...state.times.map((solve) => getSolveValue(solve)), expectedNextSolve],
        state.eventType,
    );

    if (expectedMla === null || !Number.isFinite(expectedMla)) {
        mlaElem.textContent = 'DNF';
        return;
    }

    setStatWithPr(mlaElem, formatTime(expectedMla), getAverageRank(expectedMla));
}

// ============================================================
// Saving completed averages
// ============================================================

function saveCompletedAverage(average, solveCount) {
    if (!average || state.times.length !== solveCount) return;

    const averageId = state.times[state.times.length - 1].averageId;

    const alreadySaved = state.averageTags.some((tag) => tag.averageId === averageId);

    if (alreadySaved) return;

    const event = document.getElementById('event-type').value;

    const tag = {
        average,
        times: state.times.slice(-solveCount),
        event,
        averageId,
    };

    state.averageTags.push(tag);
    state.previousAverage = tag;

    updateSessionAveragePr(tag, event);

    saveAverages();
    deleteStorage(`ct_incomplete_${event}`);

    // Only track finite averages in userAverages (used for PR ranking) — a
    // literal 'DNF' string here would corrupt the numeric sort in rankIn().
    if (average !== 'DNF') {
        const numericAverage = parseFloat(average);
        if (Number.isFinite(numericAverage)) {
            state.userAverages.push(numericAverage);
        }
    }

    displayCompletedAverage(average);
    updateAfterAverageUI(average);
}

function updateSessionAveragePr(tag, event) {
    const value = parseFloat(tag.average);

    if (
        !isNaN(value) &&
        isFinite(value) &&
        (!state.sessionPrAverage[event] ||
            value < parseFloat(state.sessionPrAverage[event].average))
    ) {
        state.sessionPrAverage[event] = { ...tag };
    }
}

function displayCompletedAverage(average) {
    const averageElem = document.getElementById('average');
    if (!averageElem) return;

    const numeric = typeof average === 'number' ? average : parseFloat(average);
    const text = average === 'DNF' || !Number.isFinite(numeric) ? 'DNF' : formatTime(numeric);
    const rank = Number.isFinite(numeric) ? getAverageRank(numeric) : null;

    renderMetricValue(averageElem, text, { rank, pillKind: 'average' });
}

function updateAfterAverageUI(average) {
    displayTags();
    updateSessionStats();
    updatePrTarget();
    updateGoalTargetAfterAverage(parseFloat(average));

    celebrateAverage(parseFloat(average), getAverageRank(parseFloat(average)));
}

// === BPA / WPA / TFT calculation ===
// BPA (Best Possible Average): best Ao5 still achievable with any next solve
// WPA (Worst Possible Average): worst Ao5 if the next solve is maximally bad (DNF)
// TFT (Time For Target): exact next-solve time needed to hit the target average
function calculateBpaWpaTft(times, target) {
    const tft = calculateTimeForTarget(times, target);

    // For mean events (6x6, 7x7, BLD)
    if (times.length === 2 && meanEvents.includes(state.eventType)) {
        const mappedTimes = times.map((t) => {
            const v = getSolveValue(t);
            return Number.isFinite(v) ? v : 'DNF';
        });

        const dnfCount = mappedTimes.filter((t) => t === 'DNF').length;

        if (dnfCount > 0) {
            return { bpa: 'DNF', wpa: 'DNF', tft: 'Not Possible' };
        }

        const sum = mappedTimes.reduce((a, b) => a + b, 0);

        // BPA: theoretical floor — best mean achievable if the 3rd solve were near zero
        // WPA: any DNF on solve 3 makes the entire Mo3 a DNF
        const bpa = (sum + 0) / 3;
        const wpa = 'DNF';

        return { bpa, wpa, tft };
    } else if (times.length === 4) {
        // Get last 4 times as numbers (handle DNF)
        const last4 = times.slice(-4).map((t) => {
            const v = getSolveValue(t);
            return Number.isFinite(v) ? v : 'DNF';
        });

        // Count DNFs
        const dnfCount = last4.filter((t) => t === 'DNF').length;

        if (dnfCount > 1) {
            return { bpa: 'DNF', wpa: 'DNF', tft: 'Not Possible' };
        }

        // If exactly 1 DNF, exclude it only in WPA (worst) calculation
        const validTimes = last4.filter((t) => t !== 'DNF');

        const best = Math.min(...validTimes);
        const worst = Math.max(...validTimes);

        const sum = validTimes.reduce((a, b) => a + b, 0);

        let bpa, wpa;
        if (dnfCount === 1) {
            // WPA is impossible if 1 DNF (best+avg), BPA can still be computed
            bpa = sum / 3;
            wpa = 'DNF';
        } else {
            bpa = (sum - worst) / 3;
            wpa = (sum - best) / 3;
        }

        return { bpa, wpa, tft };
    }

    return { bpa: '-', wpa: '-', tft: tft };
}

function calculateTimeForTarget(times, target) {
    const solves = times.map((a) => parseFloat(a.value)).sort((a, b) => a - b);
    let tft = '-';
    let n = solves.length;

    target = parseFloat(isNaN(target) ? formattedTimeToSeconds(target) : target);

    if (n === 4) {
        let sum = solves[1] + solves[2];
        tft = 3 * target - sum;

        if (tft < solves[0]) return 'Not Possible';
        else if (tft > solves[n - 1]) return 'Guaranteed';
    } else if (n === 3) {
        // Have BPA still be under/at target:
        // A(x) = (s_1 + s_2 + x) / 3 {0 < x <= 3 * t - s_1 - s_2}
        // solve for x when A(x) = t
        // x < 3 * t - s_1 - s_2 | x ∈ R+
        let lesserSum = solves[0] + solves[1];
        let timeForStillPossibleBPA = 3 * target - lesserSum;

        // Guarantee target average:
        // B(x) = (s_2 + s_3 + x) / 3 {0 < x <= 3 * t - s_2 - s_3}
        // solve for x when B(x) = t
        // x < 3 * t - s_2 - s_3 | x ∈ R+, (s_1 + s_2 + s_3) / 3 < t
        let greaterSum = solves[1] + solves[2];
        let timeForGuaranteedTarget = 3 * target - greaterSum;

        // Second condition for guaranteed target:
        // (s_1 + s_2 + s_3) / 3 < t
        let isSecondConditionMet = solves.reduce((acc, cur) => acc + cur, 0) / 3 < target;

        // the BPA is no longer under target, i.e. target not possible, when x is out of the domain
        let isWithinDomain = 0 < timeForStillPossibleBPA;
        if (!isWithinDomain) return 'Not Possible';

        // the WPA is under/at the target, i.e. target is inevitable, when x is within the domain
        let isTargetGuaranteedConditionMet = 0 < timeForGuaranteedTarget;

        timeForGuaranteedTarget =
            isTargetGuaranteedConditionMet && isSecondConditionMet
                ? formatTime(timeForGuaranteedTarget)
                : 'Not Possible';

        return `${timeForGuaranteedTarget} | ${formatTime(timeForStillPossibleBPA)}`;
    } else if (n === 2) {
        let sum = solves[0] + solves[1];
        tft = 3 * target - sum;
    } else if (n === 1) {
        let sum = solves[0];
        tft = 2 * target - sum;
    } else return formatTime(target);

    return tft > 0 ? formatTime(tft) : 'Not Possible';
}

// === Display current times in right container ===
function displayCurrentTimes() {
    const container = document.getElementById('currentTimes');
    container.innerHTML = '';

    // Find best and worst solves (exclude DNFs for best, include all for worst)
    const values = state.times.map((solve) => getSolveValue(solve));
    const { bestIdx, worstIdx } = getBestWorstIndices(values);

    state.times.forEach((solve, i) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('solve');

        // NOTE: this used to be `const displayText`, which was then
        // reassigned below for best/worst solves — that throws a
        // TypeError ("Assignment to constant variable") at runtime and
        // breaks rendering whenever a best or worst solve is present.
        let displayText = getSolveDisplayText(solve);

        // Highlight best/worst
        const textSpan = document.createElement('span');
        textSpan.classList.add('solve-text');
        if (i === bestIdx) {
            textSpan.style.color = 'var(--success)';
            displayText = `(${displayText})`;
        } else if (i === worstIdx) {
            textSpan.style.color = 'var(--error)';
            displayText = `(${displayText})`;
        }

        const rank = Number.isFinite(values[i]) ? getSingleRank(values[i]) : null;

        // Add PR pill if rank exists
        textSpan.textContent = displayText;
        if (rank) {
            const prPill = document.createElement('span');
            prPill.classList.add('pr-pill');
            prPill.textContent = `#${rank}`;
            prPill.style.marginLeft = '0.5em';
            prPill.style.background = getPrPillColor(rank, 'single');
            prPill.style.color = '#fff';
            prPill.style.borderRadius = '999px';
            prPill.style.fontSize = '0.65em';
            prPill.style.padding = '0.1em 0.6em';
            prPill.style.verticalAlign = 'middle';
            prPill.style.opacity = '0.8';
            textSpan.appendChild(prPill);
        }
        wrapper.appendChild(textSpan);

        const btns = document.createElement('div');
        btns.classList.add('penalty-buttons');

        const okayBtn = createButton({
            icon: 'fas fa-check',
            type: 'confirm',
            onClick: () => removePenalty(i),
        });

        const plus2Btn = createButton({
            text: '+',
            type: 'plus2',
            onClick: () => applyPenalty(i, 'plus2'),
        });

        const dnfBtn = createButton({
            text: 'x',
            type: 'dnf',
            onClick: () => applyPenalty(i, 'dnf'),
        });

        const editBtn = createButton({
            icon: 'fas fa-pen',
            type: 'edit',
            onClick: () => openEditModal(i),
        });

        const deleteBtn = createButton({
            icon: 'fas fa-times-circle',
            type: 'delete',
            onClick: () => deleteTime(i),
        });

        btns.appendChild(okayBtn);
        btns.appendChild(plus2Btn);
        btns.appendChild(dnfBtn);
        btns.appendChild(editBtn);
        btns.appendChild(deleteBtn);
        wrapper.appendChild(btns);

        container.appendChild(wrapper);
    });
}

// PR Pill color creator
function getPrPillColor(rank, format) {
    // from var(--success) for #1 to var(--error) for the worst ranked solve, with a gradient in between
    const successColor =
        getComputedStyle(document.documentElement).getPropertyValue('--success').trim() ||
        '#28a745';
    const errorColor =
        getComputedStyle(document.documentElement).getPropertyValue('--error').trim() || '#dc3545';
    const successRGB = hexToRgb(successColor);
    const errorRGB = hexToRgb(errorColor);

    const max =
        format === 'average'
            ? state.userAverages.length === 0
                ? 1
                : state.userAverages.length
            : state.userSolves.length === 0
              ? 1
              : state.userSolves.length;

    const ratio = 1 - Math.min(rank / max, 1);
    const r = Math.round(successRGB.r * ratio + errorRGB.r * (1 - ratio));
    const g = Math.round(successRGB.g * ratio + errorRGB.g * (1 - ratio));
    const b = Math.round(successRGB.b * ratio + errorRGB.b * (1 - ratio));
    return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => {
        return r + r + g + g + b + b;
    });
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
          }
        : null;
}

// === Create a button helper ===
function createButton({ text, icon, color, type = 'confirm', onClick }) {
    const btn = document.createElement('button');
    if (icon) {
        btn.innerHTML = `<i class="${icon}"></i>`;
    } else {
        btn.textContent = text;
    }
    btn.classList.add('penalty-btn', type);
    if (color) {
        btn.style.borderColor = color;
        btn.style.color = color;
    }
    btn.onclick = onClick;
    return btn;
}

// === Apply or remove a penalty on a solve ===
// type: 'plus2' | 'dnf' | null  (null clears any existing penalty)
function applyPenalty(index, type) {
    const solve = state.times[index];
    if (!solve) return;
    if (type === null && !solve.penalty) return; // nothing to clear

    if (type === 'plus2') {
        solve.penalty = 'plus2';
        solve.value = solve.raw + 2;
    } else if (type === 'dnf') {
        solve.penalty = 'dnf';
        solve.value = Infinity;
    } else {
        // type === null — clear penalty
        solve.penalty = null;
        solve.value = solve.raw;
    }

    // Invalidate the parent average so it is recalculated with the updated penalty
    const event = document.getElementById('event-type').value;
    state.averageTags = state.averageTags.filter((tag) => tag.averageId !== solve.averageId);
    saveAverages();
    // Rebuild rather than shift(): shift() removed the OLDEST average, not
    // necessarily the one that was just invalidated.
    rebuildUserAverages(event);

    calculateStats();
    displayCurrentTimes();
    saveIncomplete();
}

// Convenience wrapper — removes any penalty from a solve
function removePenalty(index) {
    applyPenalty(index, null);
}

// === Edit modal ===
function openEditModal(index) {
    const solve = state.times[index];
    if (!solve) return;

    state.editIndex = index;

    let currentValue;
    if (solve.raw === -1) {
        currentValue = 'DNF';
    } else {
        currentValue = formatTime(solve.raw);
    }

    const modal = document.getElementById('editModal');
    const editInput = document.getElementById('editTimeInput');
    modal.hidden = false;
    editInput.value = currentValue;
    editInput.focus();
    editInput.select();
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.hidden = true;
    state.editIndex = null;
    document.getElementById('timeInput').focus();
}

function confirmEdit() {
    const index = state.editIndex;
    if (index === null) return;

    const solve = state.times[index];
    if (!solve) return;

    const editInput = document.getElementById('editTimeInput');
    const parsed = parseSolveInput(editInput.value);

    if (parsed.error) {
        alert(parsed.error);
        return;
    }

    solve.raw = parsed.raw;
    solve.value = parsed.value;
    solve.penalty = parsed.penalty;

    // Remove the average that this time belongs to, since the value changed
    const event = document.getElementById('event-type').value;
    const avgId = solve.averageId;
    state.averageTags = state.averageTags.filter((tag) => tag.averageId !== avgId);
    saveAverages();
    // Rebuild rather than filtering userAverages by solve.value: userAverages
    // holds AVERAGE values, not individual solve times, so that comparison
    // almost never matched and left the stale average's value in the list.
    rebuildUserAverages(event);

    closeEditModal();
    calculateStats();
    displayCurrentTimes();
    saveIncomplete();
}

// Edit modal event listeners
document.getElementById('editCancel').addEventListener('click', closeEditModal);
document.getElementById('editConfirm').addEventListener('click', confirmEdit);
document.getElementById('editTimeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') closeEditModal();
});
document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
});

// === Confirm popup ===
let _confirmCallback = null;

function showConfirmPopup(title, message, onConfirm) {
    const popup = document.getElementById('confirmPopup');
    document.getElementById('confirmPopupTitle').textContent = title;
    document.getElementById('confirmPopupMessage').textContent = message;
    _confirmCallback = onConfirm;
    popup.hidden = false;
}

function closeConfirmPopup() {
    document.getElementById('confirmPopup').hidden = true;
    _confirmCallback = null;
}

document.getElementById('confirmPopupCancel').addEventListener('click', closeConfirmPopup);
document.getElementById('confirmPopupConfirm').addEventListener('click', () => {
    if (_confirmCallback) _confirmCallback();
    closeConfirmPopup();
});
document.getElementById('confirmPopup').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirmPopup();
});

// === Delete a time ===
function deleteTime(index) {
    showConfirmPopup(
        'Delete this time?',
        'This solve will be removed from the current set.',
        () => {
            const solve = state.times[index];
            if (!solve) return;

            // Remove the average that this time belongs to, since the set is incomplete now
            const event = document.getElementById('event-type').value;
            const avgId = solve.averageId;
            state.averageTags = state.averageTags.filter((tag) => tag.averageId !== avgId);
            saveAverages();
            // Rebuild rather than filtering userAverages by solve.value (see
            // confirmEdit for why that comparison doesn't work).
            rebuildUserAverages(event);

            // Remove the time from the current session
            state.times.splice(index, 1);

            // Update the delete stat shame counter
            state.deleteStatShameCounter = (parseInt(state.deleteStatShameCounter, 10) || 0) + 1;
            localStorage.setItem('deleteStatShameCounter', state.deleteStatShameCounter);

            displayCurrentTimes();
            saveIncomplete();
            calculateStats();
        },
    );
}

// === Delete a single average ===
function deleteAverage(averageId) {
    showConfirmPopup(
        'Delete this average?',
        'This average and its solves will be permanently removed.',
        () => {
            state.averageTags = state.averageTags.filter((tag) => tag.averageId !== averageId);
            saveAverages();

            // If no averages left for this event, also delete the cookie
            const currentEvent = document.getElementById('event-type').value;
            const eventAverages = state.averageTags.filter((tag) => tag.event === currentEvent);
            if (eventAverages.length === 0) {
                deleteStorage(`averages_${currentEvent}`);
            }

            // Rebuild user averages
            rebuildUserAverages(currentEvent);

            displayTags();
            updateSessionStats();
            updateAveragesEmptyState();
        },
    );
}

// === Clear all averages for current event ===
function clearAllAverages() {
    const currentEvent = document.getElementById('event-type').value;
    const eventAverages = state.averageTags.filter((tag) => tag.event === currentEvent);

    if (eventAverages.length === 0) return;

    showConfirmPopup(
        `Clear all ${eventAverages.length} averages?`,
        'All averages for this event will be permanently removed.',
        () => {
            state.averageTags = state.averageTags.filter((tag) => tag.event !== currentEvent);
            deleteStorage(`averages_${currentEvent}`);

            state.userAverages = [];
            state.userSolves = [];

            displayTags();
            updateSessionStats();
            updateAveragesEmptyState();
        },
    );
}

// === STATS SLIDER HELPER ===

function updateSliderMax(event) {
    const slider = document.getElementById('statsHistorySlider');
    const sliderValEl = document.getElementById('statsSliderVal');
    if (!slider) return;

    const currentEvent = event || document.getElementById('event-type').value;
    const statsView = window._statsView || 'averages';

    let count;
    if (statsView === 'solves') {
        const allSolves = [];
        state.averageTags
            .filter((tag) => tag.event === currentEvent)
            .forEach((tag) => (tag.times || []).forEach((s) => allSolves.push(s)));
        state.times.forEach((s) => allSolves.push(s));
        count = allSolves.length;
    } else {
        count = state.averageTags.filter((tag) => tag.event === currentEvent).length;
    }

    const newMax = Math.max(5, count);
    slider.max = newMax;
    if (parseInt(slider.value, 10) > newMax) {
        slider.value = newMax;
    }
    if (sliderValEl) sliderValEl.textContent = slider.value;
}

document.getElementById('clearAllBtn').addEventListener('click', clearAllAverages);

document.getElementById('statsViewAverages')?.addEventListener('click', () => {
    window._statsView = 'averages';
    document.getElementById('statsViewAverages').classList.add('active');
    document.getElementById('statsViewSolves').classList.remove('active');
    updateAveragesEmptyState();
    updateSliderMax();
    updateSessionStats();
    renderStatsCharts();
});

document.getElementById('statsViewSolves')?.addEventListener('click', () => {
    window._statsView = 'solves';
    document.getElementById('statsViewSolves').classList.add('active');
    document.getElementById('statsViewAverages').classList.remove('active');
    updateSliderMax();
    updateSessionStats();
    displaySolves();
    updateAveragesEmptyState();
});

document.getElementById('statsHistorySlider')?.addEventListener('input', renderStatsCharts);

// ! WCA DATA

// === Handle WCA ID input ===
document.getElementById('wca').addEventListener('input', async () => {
    const wcaId = document.getElementById('wca').value.trim().toUpperCase();
    setStorage('setting_wca', wcaId);
    if (!wcaId) return;

    if (!/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || wcaId.length !== 10) return;

    try {
        await fetchUserData(wcaId);
        calculateStats();
        updatePrTarget();

        // Set the target placeholder to user's PR average if available
        const prAverage = getUserPRAverage();
        const targetInput = document.getElementById('target');
        if (prAverage && isFinite(prAverage)) {
            targetInput.placeholder = `Target (${prAverage})`;
        } else {
            targetInput.placeholder = 'Target (0.00)';
        }
    } catch (err) {
        console.error(err);
        window.showUserErrorPopup({
            title: 'Could not load WCA data',
            message: 'WCA results could not be loaded for the average calculator.',
            error: err,
            reportTitle: 'Average calculator failed to load WCA data',
            reportContext: `Loading WCA data failed for ${wcaId} in event ${state.eventType}.`,
            dedupeKey: `average-wca:${wcaId}:${state.eventType}`,
        });
    }
});

// === Fetch solves & averages for ranking ===
async function fetchUserData(wcaId) {
    const eventType = state.eventType;
    const [solvesData, averagesData] = await Promise.all([
        window.fetchJsonOrThrow(`/api/wca/${wcaId}/${eventType}?getsolves=true`, {
            errorContext: 'Could not load WCA solves',
        }),
        window.fetchJsonOrThrow(`/api/wca/${wcaId}/${eventType}?getaverages=true`, {
            errorContext: 'Could not load WCA averages',
        }),
    ]);

    // Bail out if the user switched events while this fetch was in flight
    if (state.eventType !== eventType) return;

    // Do not overwrite existing solves/averages
    const newSolves = Array.isArray(solvesData?.allResults) ? solvesData.allResults : [];
    const newAverages = Array.isArray(averagesData?.allAverages) ? averagesData.allAverages : [];

    // Convert and append, avoiding duplicates
    const convertedSolves = newSolves.map((t) => (t <= 0 ? Infinity : t / 100));
    const convertedAverages = newAverages.map((t) => (t <= 0 ? Infinity : t / 100));

    // Append only new solves/averages that are not already present
    state.userSolves = [
        ...state.userSolves,
        ...convertedSolves.filter((t) => !state.userSolves.includes(t)),
    ];
    state.userAverages = [
        ...state.userAverages,
        ...convertedAverages.filter((t) => !state.userAverages.includes(t)),
    ];

    // Keep competition page WCA-only data in sync
    compState.wcaSolves = convertedSolves.filter((t) => isFinite(t));
    compState.wcaAverages = convertedAverages.filter((t) => isFinite(t));
}

// === Rank helpers ===
// Returns the 1-based rank of `time` within `list` (lowest value = rank 1)
function rankIn(time, list) {
    return [...list, time].sort((a, b) => a - b).indexOf(time) + 1;
}

function getSingleRank(time) {
    return rankIn(time, state.userSolves);
}

function getAverageRank(time) {
    if (time === 'DNF' || !isFinite(parseFloat(time))) return null;
    return rankIn(parseFloat(time), state.userAverages);
}

// === Handle PR target checkbox ===
// Helper to get user's PR average (best non-DNF average from WCA or session)
function getUserPRAverage() {
    const validAverages = state.userAverages.filter(
        (a) => a !== Infinity && isFinite(a) && !isNaN(a),
    );
    if (!validAverages.length) return null;
    return Math.min(...validAverages).toFixed(2);
}

// Update target field to current PR when "Use PR" is checked
function updatePrTarget() {
    if (!usePrCheckbox.checked) return;
    const pr = getUserPRAverage();
    if (pr) {
        targetInput.value = pr;
        targetInput.disabled = true;
    } else {
        targetInput.value = '';
        targetInput.disabled = true;
    }
    setStorage('setting_target', targetInput.value);
    calculateStats();
    updateTargetDisplay();
}

const usePrCheckbox = document.getElementById('usePrTarget');
const targetInput = document.getElementById('target');

usePrCheckbox.addEventListener('change', () => {
    if (usePrCheckbox.checked) {
        // Disable goal mode when PR mode is enabled
        setGoalModeEnabled(false);
        updatePrTarget();
    } else {
        targetInput.disabled = false;
        targetInput.value = '';
    }
    setStorage('setting_usePr', usePrCheckbox.checked);
    calculateStats();
    updateTargetDisplay();
});

// === GOAL MODE ===
// Automatically adjusts the session target based on recent performance.
// After each completed average the target steps 10 % of the gap toward the goal time.
// Performance is smoothed with an asymmetric EMA: quick to register improvement (α=0.3),
// slow to penalise regression (α=0.05), so a bad round barely hurts you.

// Asymmetric EMA weights
const GOAL_ALPHA_IMPROVE = 0.3;
const GOAL_ALPHA_REGRESS = 0.05;
// Gradient step: fraction of the gap between smoothed performance and the goal
const GOAL_GRADIENT = 0.1;

function getGoalEventKey() {
    return document.getElementById('event-type').value;
}

// Wraps parseTimeString: DNF or invalid strings resolve to NaN, matching the
// original behaviour of this function.
function formattedTimeToSeconds(str) {
    if (!str || str === '') return NaN;
    const parsed = parseTimeString(str);
    if (parsed.error || parsed.isDnf) return NaN;
    return parsed.raw;
}

function getSmoothedPerf() {
    const v = getStorage(`setting_smoothed_perf_${getGoalEventKey()}`);
    return v !== null ? parseFloat(v) : null;
}

function initSmoothedPerfFromHistory() {
    const event = getGoalEventKey();
    const eventTags = state.averageTags.filter((tag) => tag.event === event);
    if (eventTags.length === 0) return null;
    const validAvgs = eventTags
        .slice(-10)
        .map((t) => parseFloat(t.average))
        .filter((v) => !isNaN(v) && isFinite(v));
    if (validAvgs.length === 0) return null;
    const mean = CubingCore.meanOfFinite(validAvgs);
    setStorage(`setting_smoothed_perf_${event}`, mean.toFixed(4));
    return mean;
}

function updateSmoothedPerf(newAvg) {
    const event = getGoalEventKey();
    let smoothed = getSmoothedPerf();
    if (smoothed === null) {
        smoothed = newAvg;
    } else {
        const alpha = newAvg < smoothed ? GOAL_ALPHA_IMPROVE : GOAL_ALPHA_REGRESS;
        smoothed = smoothed * (1 - alpha) + newAvg * alpha;
    }
    setStorage(`setting_smoothed_perf_${event}`, smoothed.toFixed(4));
    return smoothed;
}

function getGoalTime() {
    const event = getGoalEventKey();
    const v = getStorage(`setting_goal_time_${event}`);
    return v !== null ? parseFloat(v) : null;
}

function calculateGoalAutoTarget() {
    if (getStorage('setting_goal_enabled') !== true) return null;
    const goalTime = getGoalTime();
    if (goalTime === null || !isFinite(goalTime) || goalTime <= 0) return null;
    let smoothed = getSmoothedPerf();
    if (smoothed === null) smoothed = initSmoothedPerfFromHistory();
    if (smoothed === null) return null;
    // If already at or below goal, just keep the goal as the target
    if (smoothed <= goalTime) return goalTime;
    const autoTarget = smoothed - (smoothed - goalTime) * GOAL_GRADIENT;
    return parseFloat(autoTarget.toFixed(2));
}

function applyGoalTarget() {
    if (getStorage('setting_goal_enabled') !== true) return;
    const auto = calculateGoalAutoTarget();
    const el = document.getElementById('target');
    el.value = auto !== null ? auto.toFixed(2) : '';
    el.disabled = true;
    setStorage('setting_target', el.value);
    calculateStats();
    updateTargetDisplay();
    updateGoalAutoTargetDisplay();
}

function updateGoalAutoTargetDisplay() {
    const displayEl = document.getElementById('goalAutoTargetDisplay');
    if (displayEl) {
        const auto = calculateGoalAutoTarget();
        displayEl.textContent = auto !== null ? formatTime(auto) : '–';
    }
    const stEl = document.getElementById('settingsTarget');
    if (stEl) stEl.value = document.getElementById('target').value;
}

function updateGoalTimeInput() {
    const goalTimeEl = document.getElementById('settingsGoalTime');
    if (!goalTimeEl) return;
    const savedGoalTime = getGoalTime();
    goalTimeEl.value = savedGoalTime !== null ? formatTime(savedGoalTime) : '';
}

function setGoalModeEnabled(enabled) {
    setStorage('setting_goal_enabled', enabled);
    const subEl = document.getElementById('goalSubSettings');
    if (subEl) subEl.style.display = enabled ? 'block' : 'none';
    const goalModeEl = document.getElementById('settingsGoalMode');
    if (goalModeEl) {
        goalModeEl.checked = enabled;
        document.getElementById('settingsUsePr').checked = !enabled;
    }

    if (enabled) {
        applyGoalTarget();
    } else {
        const targetEl = document.getElementById('target');
        targetEl.disabled = false;
        targetEl.value = '';
        setStorage('setting_target', '');
        const stEl = document.getElementById('settingsTarget');
        if (stEl) {
            stEl.disabled = false;
            stEl.value = '';
        }
        calculateStats();
        updateTargetDisplay();
    }
    updateGoalAutoTargetDisplay();
}

function updateGoalTargetAfterAverage(avgValue) {
    if (getStorage('setting_goal_enabled') !== true) return;
    if (typeof avgValue !== 'number' || !isFinite(avgValue)) return;
    updateSmoothedPerf(avgValue);
    applyGoalTarget();
}

// Settings → Goal Mode toggle
document.getElementById('settingsGoalMode')?.addEventListener('change', (e) => {
    if (e.target.checked) {
        // Disable PR mode first
        const usePrEl = document.getElementById('usePrTarget');
        const settingsUsePrEl = document.getElementById('settingsUsePr');
        if (usePrEl && usePrEl.checked) {
            usePrEl.checked = false;
            if (settingsUsePrEl) settingsUsePrEl.checked = false;
            setStorage('setting_usePr', false);
            targetInput.disabled = false;
        }
        setGoalModeEnabled(true);
    } else {
        setGoalModeEnabled(false);
    }
});

// Settings → Goal Time input
document.getElementById('settingsGoalTime')?.addEventListener('input', (e) => {
    formatInputField(e.target);
    const seconds = formattedTimeToSeconds(e.target.value);
    if (!isNaN(seconds) && isFinite(seconds) && seconds > 0) {
        setStorage(`setting_goal_time_${getGoalEventKey()}`, seconds.toFixed(4));
        if (getStorage('setting_goal_enabled') === true) {
            applyGoalTarget();
        }
    }
});

// === STORAGE HELPERS (localStorage) ===
function setStorage(name, value) {
    try {
        localStorage.setItem(name, JSON.stringify(value));
    } catch (e) {
        console.error(`Error saving ${name}:`, e);
    }
}

function getStorage(name) {
    try {
        const raw = localStorage.getItem(name);
        return raw === null ? null : JSON.parse(raw);
    } catch (e) {
        console.error(`Error reading ${name}:`, e);
        return null;
    }
}

function deleteStorage(name) {
    localStorage.removeItem(name);
}

// Compact Serialization
// Solve array: [raw, penalty, averageId, scramble]
// Average array: [average, event, averageId, [[raw, penalty, averageId, scramble], ...]]

function serializeSolve(solve) {
    return [
        solve.raw,
        solve.penalty ?? null,
        solve.averageId,
        solve.scramble ?? null,
        solve.inspectionTime ?? null,
    ];
}

function deserializeSolve(arr, event) {
    const [raw, penalty, averageId, scramble, inspectionTime] = arr;
    let value = raw;
    if (penalty === 'dnf') value = Infinity;
    else if (penalty === 'plus2') value = raw + 2;
    return {
        raw,
        penalty,
        value,
        event,
        averageId,
        scramble,
        inspectionTime: inspectionTime ?? null,
    };
}

function serializeTag(tag) {
    return [tag.average, tag.event, tag.averageId, tag.times.map(serializeSolve)];
}

function deserializeTag(arr) {
    const [average, event, averageId, solves] = arr;
    return {
        average,
        event,
        averageId,
        times: solves.map((s) => deserializeSolve(s, event)),
    };
}

let _saveDebounceTimer = null;
function scheduleSave() {
    if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer = setTimeout(() => {
        _saveDebounceTimer = null;
        flushSave();
    }, 5000);
}

function flushSave() {
    try {
        const serialized = state.averageTags.map(serializeTag);
        localStorage.setItem('ct_averages', JSON.stringify(serialized));
    } catch (e) {
        console.error('flushSave failed:', e, state.averageTags);
    }
}

// === STORAGE MIGRATION ===
// One-time migration: moves old per-event cookie data (averages_*, incomplete_*)
// into unified localStorage keys (ct_averages, ct_incomplete_*) on first load.
(function migrateCookies() {
    const cookies = document.cookie.split('; ').filter(Boolean);
    for (const cookie of cookies) {
        const eqIndex = cookie.indexOf('=');
        if (eqIndex === -1) continue;
        const name = decodeURIComponent(cookie.substring(0, eqIndex));
        if (!name.startsWith('averages_') && !name.startsWith('incomplete_')) continue;

        try {
            const value = JSON.parse(decodeURIComponent(cookie.substring(eqIndex + 1)));

            if (name.startsWith('averages_') && Array.isArray(value)) {
                // Merge into ct_averages, avoiding duplicates
                const existing = JSON.parse(localStorage.getItem('ct_averages') || '[]');
                const existingIds = new Set(existing.map((a) => a[2])); // averageId is index 2
                const incoming = value
                    .filter((tag) => !existingIds.has(tag.averageId))
                    .map((tag) =>
                        serializeTag({ ...tag, event: tag.event || name.replace('averages_', '') }),
                    );
                localStorage.setItem('ct_averages', JSON.stringify([...existing, ...incoming]));
            }

            if (name.startsWith('incomplete_') && Array.isArray(value)) {
                const event = name.replace('incomplete_', '');
                const newKey = `ct_incomplete_${event}`;
                if (localStorage.getItem(newKey) === null) {
                    localStorage.setItem(newKey, JSON.stringify(value.map(serializeSolve)));
                }
            }
        } catch (e) {
            /* skip malformed cookies */
        }

        // Delete the old cookie regardless
        document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }
})();

// === SAVE & LOAD INCOMPLETE SOLVES ===
function saveIncomplete(explicitEvent) {
    const event = explicitEvent || document.getElementById('event-type').value || state.eventType;
    if (state.times.length > 0 && state.times.length < getRequiredSolves()) {
        setStorage(`ct_incomplete_${event}`, state.times.map(serializeSolve));
    } else {
        localStorage.removeItem(`ct_incomplete_${event}`);
    }
}

function loadIncomplete() {
    const event = document.getElementById('event-type').value || state.eventType;

    // Migrate legacy incomplete key
    const legacyKey = `incomplete_${event}`;
    const legacy = getStorage(legacyKey);
    if (legacy && Array.isArray(legacy)) {
        setStorage(`ct_incomplete_${event}`, legacy.map(serializeSolve));
        localStorage.removeItem(legacyKey);
    }

    const saved = getStorage(`ct_incomplete_${event}`);
    if (saved && Array.isArray(saved) && saved.length > 0) {
        state.times = saved.map((s) => deserializeSolve(s, event));
        // Include incomplete solves in userSolves so rankings account for them
        state.times.forEach((t) => {
            if (t.penalty !== 'dnf' && isFinite(t.value) && t.value > 0) {
                state.userSolves.push(t.value);
            }
        });
        displayCurrentTimes();
    }
}

// === SAVE & LOAD AVERAGES PER EVENT ===
function saveAverages() {
    scheduleSave();
}

function loadAverages() {
    // Flush any pending save before loading to avoid losing in-memory tags
    if (_saveDebounceTimer) {
        clearTimeout(_saveDebounceTimer);
        _saveDebounceTimer = null;
        flushSave();
    }

    const event = document.getElementById('event-type').value;

    // Legacy localStorage migration (old per-event keys)
    const legacyKey = `averages_${event}`;
    const legacy = getStorage(legacyKey);
    if (legacy && Array.isArray(legacy)) {
        const existing = JSON.parse(localStorage.getItem('ct_averages') || '[]');
        const existingIds = new Set(existing.map((a) => a[2]));
        const incoming = legacy
            .filter((tag) => !existingIds.has(tag.averageId))
            .map((tag) => serializeTag({ ...tag, event: tag.event || event }));
        localStorage.setItem('ct_averages', JSON.stringify([...existing, ...incoming]));
        localStorage.removeItem(legacyKey);
    }

    const saved = getStorage('ct_averages');
    if (saved && Array.isArray(saved)) {
        state.averageTags = saved.map(deserializeTag);
    } else {
        state.averageTags = [];
    }

    state.userSolves = [];
    state.userAverages = [];
    state.averageTags
        .filter((tag) => tag.event === event)
        .forEach((avg) => {
            avg.times.forEach((t) => {
                state.userSolves.push(t.value === -1 ? Infinity : t.value);
            });
            if (avg.average !== 'DNF' && isFinite(parseFloat(avg.average))) {
                state.userAverages.push(parseFloat(avg.average));
            }
        });

    displayTags();
    updateAveragesEmptyState();
    updateSessionStats();
}

function displayTags() {
    const container = document.getElementById('tagContainer');
    container.innerHTML = '';

    const currentEvent = document.getElementById('event-type').value;
    const eventAverages = state.averageTags.filter((tag) => tag.event === currentEvent);

    eventAverages
        .slice()
        .reverse()
        .forEach((tag) => {
            const li = document.createElement('li');

            // Use a local display value instead of mutating tag.average in
            // place — the previous code rewrote tag.average on every render,
            // which is a surprising side effect for a display function and
            // made other readers of tag.average (e.g. showAverageDetail)
            // depend on render order.
            const numericAverage = parseFloat(tag.average);
            const isDnfAvg = tag.average === 'DNF' || !Number.isFinite(numericAverage);
            const displayAverage = isDnfAvg ? 'DNF' : numericAverage.toFixed(2);

            // Top row: average value + rank + delete
            const avgRow = document.createElement('div');
            avgRow.classList.add('avg-row');

            const leftSide = document.createElement('span');
            const avgSpan = document.createElement('span');
            avgSpan.classList.add('avg-value');
            avgSpan.textContent =
                displayAverage === 'DNF' ? 'DNF' : formatTime(parseFloat(displayAverage));
            leftSide.appendChild(avgSpan);

            const rank = getAverageRank(displayAverage);
            if (rank) {
                const rankSpan = document.createElement('span');
                rankSpan.classList.add('avg-rank');
                rankSpan.textContent = ` PR${rank}`;
                leftSide.appendChild(rankSpan);
            }

            avgRow.appendChild(leftSide);

            const rightBtns = document.createElement('span');
            rightBtns.classList.add('avg-actions');

            const snapBtn = document.createElement('button');
            snapBtn.classList.add('avg-action-btn');
            snapBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
            snapBtn.title = 'Share this average';
            snapBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                shareSnapshot('average', {
                    average: displayAverage,
                    times: tag.times,
                    event: tag.event,
                    rank: rank,
                });
            });
            rightBtns.appendChild(snapBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('avg-delete');
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteBtn.title = 'Delete this average';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteAverage(tag.averageId);
            });
            rightBtns.appendChild(deleteBtn);

            avgRow.appendChild(rightBtns);

            li.appendChild(avgRow);

            // Times detail (click to expand)
            const timesDiv = document.createElement('div');
            timesDiv.classList.add('times');

            const values = tag.times.map((t) => getSolveValue(t));
            const { bestIdx, worstIdx } = getBestWorstIndices(values);

            tag.times.forEach((t, i) => {
                let span = document.createElement('span');
                const numVal = values[i];
                const timeStr = numVal === Infinity ? 'DNF' : formatTime(numVal);

                const isBest = i === bestIdx;
                const isWorst = i === worstIdx;
                span.textContent = isBest || isWorst ? `[${timeStr}]` : timeStr;
                if (isBest) span.classList.add('best');
                if (isWorst) span.classList.add('worst');

                const solveRank = numVal === Infinity ? null : getSingleRank(numVal);
                if (solveRank) span.textContent += ` (#${solveRank})`;

                timesDiv.appendChild(span);
                timesDiv.appendChild(document.createTextNode(' '));
            });

            li.appendChild(timesDiv);

            // Click to show detail popup
            li.addEventListener('click', () => {
                showAverageDetail(tag);
            });

            container.appendChild(li);
        });

    updateAveragesEmptyState();
    // Re-render history charts whenever the averages list changes
    renderStatsCharts();
}

// === Confirm before switching event mid-solve ===
const eventSelector = document.getElementById('event-type');
const timerEventSelect = document.getElementById('timerEventSelect');
let lastEventType = eventSelector.value;

eventSelector.addEventListener('change', async (e) => {
    const newEvent = e.target.value;

    // Persist selected event
    setStorage('setting_event', newEvent);

    // Save incomplete solves for current event before switching
    saveIncomplete(lastEventType);

    // Reset session-specific rankings
    state.times = [];
    state.userSolves = [];
    state.userAverages = [];
    lastEventType = newEvent;
    state.eventType = newEvent;
    calculateStats();
    state.undoData = null;
    updateUndoButton();

    // Load event-specific averages and rebuild stats
    loadAverages();
    calculateStats();
    updatePrTarget();
    updateGoalTimeInput();
    if (getStorage('setting_goal_enabled') === true) {
        applyGoalTarget();
    }
    updateTargetDisplay();
    generateScramble();

    // Reload WCA data if a valid WCA ID is present, since rankings are event-specific
    const wcaId = document.getElementById('wca').value.trim().toUpperCase();
    if (/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId)) {
        try {
            await fetchUserData(wcaId);
            calculateStats();
            updatePrTarget();
        } catch (err) {
            console.error(err);
            window.showUserErrorPopup({
                title: 'Could not load WCA data',
                message: 'WCA results could not be loaded for the average calculator.',
                error: err,
                reportTitle: 'Average calculator failed to load WCA data on event switch',
                reportContext: `Loading WCA data failed for ${wcaId} in event ${newEvent} after switching from ${lastEventType}.`,
                dedupeKey: `average-wca:${wcaId}:${newEvent}`,
            });
        }
    }

    // Load incomplete solves for the new event if they exist
    loadIncomplete();
    if (state.times.length === 0) displayCurrentTimes();

    // Keep timer event select in sync
    if (timerEventSelect) timerEventSelect.value = newEvent;

    // Update analyze button link
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) analyzeBtn.href = `/tools/globalCalc?source=average&event=${newEvent}`;

    // Reinit competition page for new event (may change solve count)
    initCompSolves();

    // If we're on the stats page, click the currently selected button to update the stats display
    if (window._statsView === 'averages') {
        document.getElementById('statsViewAverages').click();
    } else if (window._statsView === 'solves') {
        document.getElementById('statsViewSolves').click();
    }

    calculateStats();
});

// Timer page event selector → sync to hidden event-type
if (timerEventSelect) {
    timerEventSelect.addEventListener('change', (e) => {
        eventSelector.value = e.target.value;
        eventSelector.dispatchEvent(new Event('change'));
    });
}

// === Persist incomplete solves on page unload ===
// Completed averages are saved on a 5 s debounce. Flush it whenever the page may go away; otherwise an
// average finished within 5 s of closing or reloading the tab was lost. `pagehide` and `visibilitychange`
// are the events mobile browsers actually deliver (beforeunload is not reliable there).
function flushPendingSaves() {
    if (_saveDebounceTimer) {
        clearTimeout(_saveDebounceTimer);
        _saveDebounceTimer = null;
        flushSave();
    }
    saveIncomplete();
}
window.addEventListener('beforeunload', flushPendingSaves);
window.addEventListener('pagehide', flushPendingSaves);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSaves();
});

// === Stats display visibility ===
const DISPLAY_SETTINGS = [
    ['settingsShowMean', 'setting_show_mean', 'card-mean'],
    ['settingsShowBpa', 'setting_show_bpa', 'card-bpa'],
    ['settingsShowWpa', 'setting_show_wpa', 'card-wpa'],
    ['settingsShowMla', 'setting_show_mla', 'card-mla'],
    ['settingsShowTft', 'setting_show_tft', 'card-tft'],
];

function applyStatVisibility() {
    for (const [, settingKey, cardId] of DISPLAY_SETTINGS) {
        const el = document.getElementById(cardId);
        if (el) el.classList.toggle('card-hidden', getStorage(settingKey) === false);
    }
}

// === Auto-load averages on page load ===
window.addEventListener('DOMContentLoaded', () => {
    // Restore saved settings
    const savedEvent = getStorage('setting_event');
    if (savedEvent) {
        document.getElementById('event-type').value = savedEvent;
    }

    const savedWca = getStorage('setting_wca');
    if (savedWca) {
        document.getElementById('wca').value = savedWca;
        const compWcaEl = document.getElementById('compWcaInput');
        if (compWcaEl) compWcaEl.value = savedWca;
    }

    const savedTarget = getStorage('setting_target');
    if (savedTarget) {
        document.getElementById('target').value = savedTarget;
    }

    const savedUsePr = getStorage('setting_usePr');
    if (savedUsePr === true) {
        document.getElementById('usePrTarget').checked = true;
        document.getElementById('target').disabled = true;
    }

    // Restore goal mode settings
    const savedGoalEnabled = getStorage('setting_goal_enabled') === true;
    const goalModeEl = document.getElementById('settingsGoalMode');
    if (goalModeEl) goalModeEl.checked = savedGoalEnabled;
    const goalSubEl = document.getElementById('goalSubSettings');
    if (goalSubEl) goalSubEl.style.display = savedGoalEnabled ? 'block' : 'none';
    updateGoalTimeInput();
    if (savedGoalEnabled) {
        applyGoalTarget();
    }

    const savedHoldDuration = getStorage('setting_holdDuration');
    if (savedHoldDuration !== null && !isNaN(savedHoldDuration)) {
        currentHoldDuration = savedHoldDuration;
    }

    // Restore inspection settings
    applyInspectionSettings();

    // Restore display settings
    for (const [elemId, settingKey] of DISPLAY_SETTINGS) {
        const el = document.getElementById(elemId);
        if (el) el.checked = getStorage(settingKey) !== false;
    }
    const prPillEl = document.getElementById('settingsShowPrPills');
    if (prPillEl) prPillEl.checked = getStorage('setting_show_pr_pills') !== false;
    const probPillEl = document.getElementById('settingsShowProbPills');
    if (probPillEl) probPillEl.checked = getStorage('setting_show_prob_pills') !== false;
    applyStatVisibility();

    state.deleteStatShameCounter =
        parseInt(localStorage.getItem('deleteStatShameCounter'), 10) || 0;

    state.eventType = document.getElementById('event-type').value;
    lastEventType = state.eventType;
    if (timerEventSelect) timerEventSelect.value = state.eventType;

    // Set initial analyze button link
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) analyzeBtn.href = `/tools/globalCalc?source=average&event=${state.eventType}`;

    loadAverages();
    loadIncomplete();
    updateUndoButton();
    updateTargetDisplay();
    generateScramble();

    // Trigger WCA data load if a saved WCA ID is valid
    if (savedWca && /\d{4}[a-zA-Z]{4}\d{2}/.test(savedWca)) {
        document.getElementById('wca').dispatchEvent(new Event('input'));
    }

    // Restore input mode
    const lastMode = localStorage.getItem('lastMode');
    if (lastMode === 'input') {
        setMode('input');
    } else {
        setMode('timer');
    }

    // Undo button
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) undoBtn.addEventListener('click', undoLastSolve);

    // Initialize sub-navbar indicator width
    const activeTab = document.querySelector('.sub-navbar-tab.active');
    if (activeTab && subNavIndicator) {
        subNavIndicator.style.width = `${activeTab.offsetWidth}px`;
    }
    calculateStats();
    displayCurrentTimes();
});

// === SCRAMBLE ===

function updateScrambleDrawing(scramble) {
    const viewer = document.getElementById('scrambleViewer');
    const bigViewer = document.getElementById('bigScrambleViewer');
    if (!viewer) return;

    const puzzle = EVENTS[state.eventType]?.puzzle || '3x3x3';
    viewer.puzzle = puzzle;
    bigViewer.puzzle = puzzle;

    // remove <br> from scramble before drawing
    scramble = scramble ? scramble.replace(/<br>/g, ' ') : '';

    if (scramble) {
        viewer.alg = '';
        viewer.experimentalSetupAlg = scramble;
        bigViewer.alg = '';
        bigViewer.experimentalSetupAlg = scramble;
    } else {
        viewer.alg = '';
        viewer.experimentalSetupAlg = '';
        bigViewer.alg = '';
        bigViewer.experimentalSetupAlg = '';
    }
}

async function generateScramble() {
    const scrambleText = document.getElementById('scrambleText');
    if (!scrambleText) return;

    scrambleText.textContent = 'Loading scramble...';

    try {
        const res = await fetch(`/api/scramble/${state.eventType}`);
        if (!res.ok) throw new Error('Failed to fetch scramble');
        const data = await res.json();
        if (data.scrambles && data.scrambles.length > 0) {
            state.currentScramble = data.scrambles[0];
            // for Megaminx add <br> after every "U", "'" or "2"
            if (state.eventType === 'minx') {
                state.currentScramble = state.currentScramble.replace(/(U'|U)/g, '$1<br>');
            }
            scrambleText.innerHTML = state.currentScramble;
            updateScrambleDrawing(state.currentScramble);
        } else {
            scrambleText.textContent = 'No scramble available';
            updateScrambleDrawing(null);
        }
    } catch (err) {
        console.error('Scramble fetch error:', err);
        scrambleText.textContent = 'Could not load scramble';
        updateScrambleDrawing(null);
    }
}

document.getElementById('newScrambleBtn').addEventListener('click', generateScramble);

// === SCRAMBLE FULLSCREEN POPUP ===

document.getElementById('scrambleText').addEventListener('click', () => {
    if (!state.currentScramble) return;
    const popup = document.getElementById('scrambleFullscreen');
    document.getElementById('scrambleFullscreenText').innerHTML = state.currentScramble;
    popup.hidden = false;
});

document.getElementById('scrambleFullscreenClose').addEventListener('click', () => {
    document.getElementById('scrambleFullscreen').hidden = true;
});

document.getElementById('scrambleFullscreen').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        e.currentTarget.hidden = true;
    }
});

// === MODE TOGGLE ===

const modeInputBtn = document.getElementById('modeInput');
const modeTimerBtn = document.getElementById('modeTimer');
const inputModeDiv = document.getElementById('inputMode');
const timerModeDiv = document.getElementById('timerMode');

function setMode(mode) {
    state.mode = mode;
    localStorage.setItem('lastMode', mode);

    if (mode === 'input') {
        inputModeDiv.hidden = false;
        timerModeDiv.hidden = true;
        modeInputBtn.classList.add('active');
        modeTimerBtn.classList.remove('active');
        document.getElementById('timeInput').focus();
        stopTimer(true);
    } else {
        inputModeDiv.hidden = true;
        timerModeDiv.hidden = false;
        modeTimerBtn.classList.add('active');
        modeInputBtn.classList.remove('active');
        resetTimerDisplay();
    }
    updateInspectionBadge();
}

modeInputBtn.addEventListener('click', () => setMode('input'));
modeTimerBtn.addEventListener('click', () => setMode('timer'));

// === TIMER / STOPWATCH ===

const timerDisplay = document.getElementById('timerDisplay');
const HOLD_DURATION = 300; // ms to hold before ready
let holdTimeout = null;
let currentHoldDuration = HOLD_DURATION;

// === SUB-NAVBAR TAB SWITCHING ===

const subNavTabs = document.querySelectorAll('.sub-navbar-tab');
const subNavIndicator = document.getElementById('subNavIndicator');
const pageViews = document.querySelectorAll('.page-view');

subNavTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        subNavTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        // Position indicator based on tab index
        const tabIndex = [...subNavTabs].indexOf(tab);
        subNavIndicator.style.width = `${tab.offsetWidth}px`;
        subNavIndicator.style.transform =
            tabIndex === 0 ? 'none' : `translateX(${tab.offsetLeft - 3}px)`;

        pageViews.forEach((page) => {
            page.classList.remove('active');
            // Re-trigger animation
            page.style.animation = 'none';
            page.offsetHeight;
            page.style.animation = '';
        });
        document.getElementById(`page-${targetTab}`).classList.add('active');

        // Sync settings inputs when opening settings
        if (targetTab === 'settings') {
            syncToSettings();
        }
        // Refresh stats page when opening
        if (targetTab === 'stats') {
            displayTags();
            updateSessionStats();
            updateAveragesEmptyState();
            renderStatsCharts();
        }
        // Initialize competition page when shown
        if (targetTab === 'comp') {
            initCompSolves();
            const compWcaEl = document.getElementById('compWcaInput');
            if (compWcaEl) compWcaEl.value = document.getElementById('wca').value;
        }
    });
});

// === INSPECTION SETTINGS HELPER ===
// Reads inspection preferences from storage and syncs them to the settings UI.
// Called on page load and whenever the settings panel is opened.
function applyInspectionSettings() {
    const enabled = getStorage('setting_inspection_enabled') === true;
    const inspEnabledEl = document.getElementById('settingsInspectionEnabled');
    if (inspEnabledEl) {
        inspEnabledEl.checked = enabled;
        const subEl = document.getElementById('inspectionSubSettings');
        if (subEl) subEl.style.display = enabled ? 'block' : 'none';
    }
    const inspEvents = getStorage('setting_inspection_events') || 'notBlind';
    const inspAllBtn = document.getElementById('settingsInspectionEventsAll');
    const inspNotBlindBtn = document.getElementById('settingsInspectionEventsNotBlind');
    if (inspAllBtn && inspNotBlindBtn) {
        inspAllBtn.classList.toggle('active', inspEvents === 'all');
        inspNotBlindBtn.classList.toggle('active', inspEvents !== 'all');
    }
    const inspType = getStorage('setting_inspection_type') || 'normal';
    const inspNormalBtn = document.getElementById('settingsInspectionNormal');
    const inspInfiniteBtn = document.getElementById('settingsInspectionInfinite');
    if (inspNormalBtn && inspInfiniteBtn) {
        inspNormalBtn.classList.toggle('active', inspType !== 'infinite');
        inspInfiniteBtn.classList.toggle('active', inspType === 'infinite');
    }
}

// === SETTINGS SYNC ===

function syncToSettings() {
    document.getElementById('settingsEvent').value = document.getElementById('event-type').value;
    document.getElementById('settingsWca').value = document.getElementById('wca').value;
    document.getElementById('settingsTarget').value = document.getElementById('target').value;
    document.getElementById('settingsUsePr').checked =
        document.getElementById('usePrTarget').checked;
    document.getElementById('settingsHoldDuration').value = currentHoldDuration;

    // Sync inspection settings
    applyInspectionSettings();

    // Sync mode toggle
    const settingsModeInput = document.getElementById('settingsModeInput');
    const settingsModeTimer = document.getElementById('settingsModeTimer');
    if (state.mode === 'input') {
        settingsModeInput.classList.add('active');
        settingsModeTimer.classList.remove('active');
        localStorage.setItem('lastMode', 'input');
    } else {
        settingsModeTimer.classList.add('active');
        settingsModeInput.classList.remove('active');
        localStorage.setItem('lastMode', 'timer');
    }

    // Sync display settings
    for (const [elemId, settingKey] of DISPLAY_SETTINGS) {
        const el = document.getElementById(elemId);
        if (el) el.checked = getStorage(settingKey) !== false;
    }
    const prPillEl = document.getElementById('settingsShowPrPills');
    if (prPillEl) prPillEl.checked = getStorage('setting_show_pr_pills') !== false;
    const probPillEl = document.getElementById('settingsShowProbPills');
    if (probPillEl) probPillEl.checked = getStorage('setting_show_prob_pills') !== false;
    const mlaFactorEl = document.getElementById('settingsMlaFactor');
    if (mlaFactorEl) mlaFactorEl.value = parseFloat(getStorage('setting_mla_factor')) || 1.5;

    // Sync goal mode
    const goalEnabled = getStorage('setting_goal_enabled') === true;
    const goalModeSyncEl = document.getElementById('settingsGoalMode');
    if (goalModeSyncEl) goalModeSyncEl.checked = goalEnabled;
    const goalSubSyncEl = document.getElementById('goalSubSettings');
    if (goalSubSyncEl) goalSubSyncEl.style.display = goalEnabled ? 'block' : 'none';
    updateGoalTimeInput();
    updateGoalAutoTargetDisplay();
    const stEl = document.getElementById('settingsTarget');
    if (stEl) stEl.disabled = goalEnabled;
}

// Settings → Timer sync: Event
document.getElementById('settingsEvent').addEventListener('change', (e) => {
    document.getElementById('event-type').value = e.target.value;
    document.getElementById('event-type').dispatchEvent(new Event('change'));
    if (timerEventSelect) timerEventSelect.value = e.target.value;
});

// Settings → Timer sync: WCA ID
document.getElementById('settingsWca').addEventListener('input', (e) => {
    const wcaInput = document.getElementById('wca');
    wcaInput.value = e.target.value;
    wcaInput.dispatchEvent(new Event('input'));
});

// Settings → Timer sync: Target
document.getElementById('settingsTarget').addEventListener('input', (e) => {
    formatInputField(e.target);
    const targetInput = document.getElementById('target');
    targetInput.value = e.target.value;
    targetInput.dispatchEvent(new Event('input'));
});

// Settings → Timer sync: Use PR checkbox
document.getElementById('settingsUsePr').addEventListener('change', (e) => {
    const checkbox = document.getElementById('usePrTarget');
    checkbox.checked = e.target.checked;
    checkbox.dispatchEvent(new Event('change'));
});

// Settings → Timer sync: Hold Duration
document.getElementById('settingsHoldDuration').addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 0) {
        currentHoldDuration = val;
        setStorage('setting_holdDuration', val);
    }
});

// Settings → Timer sync: Mode toggle
document.getElementById('settingsModeInput').addEventListener('click', () => {
    setMode('input');
    document.getElementById('settingsModeInput').classList.add('active');
    document.getElementById('settingsModeTimer').classList.remove('active');
});
document.getElementById('settingsModeTimer').addEventListener('click', () => {
    setMode('timer');
    document.getElementById('settingsModeTimer').classList.add('active');
    document.getElementById('settingsModeInput').classList.remove('active');
});

// Settings: Clear all
document.getElementById('settingsClearAll').addEventListener('click', clearAllAverages);

// Settings: Inspection toggle
document.getElementById('settingsInspectionEnabled')?.addEventListener('change', (e) => {
    setStorage('setting_inspection_enabled', e.target.checked);
    const subEl = document.getElementById('inspectionSubSettings');
    if (subEl) subEl.style.display = e.target.checked ? 'block' : 'none';
    updateInspectionBadge();
});

// Also update badge when inspection events mode changes (affects shouldUseInspection)
document
    .getElementById('settingsInspectionEventsAll')
    ?.addEventListener('click', updateInspectionBadge);
document
    .getElementById('settingsInspectionEventsNotBlind')
    ?.addEventListener('click', updateInspectionBadge);

// Cancel inspection button
document.getElementById('cancelInspectionBtn')?.addEventListener('click', () => {
    if (state.inspectionRunning) {
        resetTimerDisplay();
    }
});

// Settings: Inspection events mode
document.getElementById('settingsInspectionEventsAll')?.addEventListener('click', () => {
    setStorage('setting_inspection_events', 'all');
    document.getElementById('settingsInspectionEventsAll').classList.add('active');
    document.getElementById('settingsInspectionEventsNotBlind').classList.remove('active');
});
document.getElementById('settingsInspectionEventsNotBlind')?.addEventListener('click', () => {
    setStorage('setting_inspection_events', 'notBlind');
    document.getElementById('settingsInspectionEventsNotBlind').classList.add('active');
    document.getElementById('settingsInspectionEventsAll').classList.remove('active');
});

// Settings: Inspection type
document.getElementById('settingsInspectionNormal')?.addEventListener('click', () => {
    setStorage('setting_inspection_type', 'normal');
    document.getElementById('settingsInspectionNormal').classList.add('active');
    document.getElementById('settingsInspectionInfinite').classList.remove('active');
});
document.getElementById('settingsInspectionInfinite')?.addEventListener('click', () => {
    setStorage('setting_inspection_type', 'infinite');
    document.getElementById('settingsInspectionInfinite').classList.add('active');
    document.getElementById('settingsInspectionNormal').classList.remove('active');
});

// Settings → Stats Display card toggles
for (const [elemId, settingKey] of DISPLAY_SETTINGS) {
    document.getElementById(elemId)?.addEventListener('change', (e) => {
        setStorage(settingKey, e.target.checked);
        applyStatVisibility();
    });
}

// Settings → PR pill toggle
document.getElementById('settingsShowPrPills')?.addEventListener('change', (e) => {
    setStorage('setting_show_pr_pills', e.target.checked);
    calculateStats();
});

// Settings → Likelihood pill toggle
document.getElementById('settingsShowProbPills')?.addEventListener('change', (e) => {
    setStorage('setting_show_prob_pills', e.target.checked);
    calculateStats();
});

// Settings → MLA target nudge factor
document.getElementById('settingsMlaFactor')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
        setStorage('setting_mla_factor', val);
        calculateStats();
    }
});

function resetTimerDisplay() {
    if (timerDisplay) {
        timerDisplay.textContent = '0.00';
        timerDisplay.classList.remove(
            'ready',
            'holding',
            'running',
            'inspecting',
            'inspection-plus2',
            'inspection-dnf',
            'inspection-holding',
            'inspection-ready',
        );
    }
    state.timerRunning = false;
    state.timerReady = false;
    state.timerHolding = false;
    state.timerStart = null;
    // Clean up any active inspection
    state.inspectionRunning = false;
    state.inspectionStart = null;
    if (state.inspectionAnimFrame) {
        cancelAnimationFrame(state.inspectionAnimFrame);
        state.inspectionAnimFrame = null;
    }
    const hintEl = document.getElementById('inspectionHint');
    if (hintEl) hintEl.hidden = true;
    const cancelBtn = document.getElementById('cancelInspectionBtn');
    if (cancelBtn) cancelBtn.hidden = true;
    document.querySelector('main').classList.remove('timer-running');
    if (state.timerAnimFrame) {
        cancelAnimationFrame(state.timerAnimFrame);
        state.timerAnimFrame = null;
    }
    if (holdTimeout) {
        clearTimeout(holdTimeout);
        holdTimeout = null;
    }
}

// === INSPECTION HELPERS ===

function shouldUseInspection() {
    if (getStorage('setting_inspection_enabled') !== true) return false;
    const eventsMode = getStorage('setting_inspection_events') || 'notBlind';
    if (eventsMode === 'notBlind' && BLIND_EVENTS.includes(state.eventType)) return false;
    return true;
}

function updateInspectionBadge() {
    const badge = document.getElementById('inspectionBadge');
    if (!badge) return;
    const enabled = getStorage('setting_inspection_enabled') === true;
    badge.style.display = !(state.mode === 'timer' && enabled && shouldUseInspection())
        ? 'none'
        : 'inline-block';
}

function startInspection() {
    state.inspectionRunning = true;
    state.inspectionStart = performance.now();
    timerDisplay.classList.remove('ready', 'holding', 'running');
    timerDisplay.classList.add('inspecting');
    document.querySelector('main').classList.add('timer-running');
    const hintEl = document.getElementById('inspectionHint');
    if (hintEl) hintEl.hidden = false;
    const cancelBtn = document.getElementById('cancelInspectionBtn');
    if (cancelBtn) cancelBtn.hidden = false;
    updateInspectionDisplay();
}

function updateInspectionDisplay() {
    if (!state.inspectionRunning || !state.inspectionStart) return;
    const elapsed = (performance.now() - state.inspectionStart) / 1000;
    const inspType = getStorage('setting_inspection_type') || 'normal';
    if (inspType === 'normal') {
        const remaining = 15 - elapsed;
        if (remaining <= -2) {
            timerDisplay.textContent = 'DNF';
            timerDisplay.classList.add('inspection-dnf');
            timerDisplay.classList.remove('inspection-plus2');
        } else if (remaining <= 0) {
            timerDisplay.textContent = `+2 (${Math.ceil(remaining)})`;
            timerDisplay.classList.add('inspection-plus2');
            timerDisplay.classList.remove('inspection-dnf');
        } else {
            timerDisplay.textContent = `${Math.ceil(remaining)}`;
            timerDisplay.classList.remove('inspection-plus2', 'inspection-dnf');
        }
    } else {
        timerDisplay.textContent = elapsed.toFixed(0);
        timerDisplay.classList.remove('inspection-plus2', 'inspection-dnf');
    }
    state.inspectionAnimFrame = requestAnimationFrame(updateInspectionDisplay);
}

function stopInspection() {
    if (!state.inspectionRunning) return;
    const elapsed = (performance.now() - state.inspectionStart) / 1000;
    state.inspectionTime = Math.round(elapsed * 100) / 100;
    state.inspectionRunning = false;
    if (state.inspectionAnimFrame) {
        cancelAnimationFrame(state.inspectionAnimFrame);
        state.inspectionAnimFrame = null;
    }
    timerDisplay.classList.remove(
        'inspecting',
        'inspection-plus2',
        'inspection-dnf',
        'inspection-holding',
        'inspection-ready',
    );
    document.querySelector('main').classList.remove('timer-running');
    const hintEl = document.getElementById('inspectionHint');
    if (hintEl) hintEl.hidden = true;
    document.getElementById('cancelInspectionBtn').hidden = true;
}

function updateTimerDisplay() {
    if (!state.timerRunning || !state.timerStart) return;
    const elapsed = (performance.now() - state.timerStart) / 1000;
    timerDisplay.textContent = formatTime(parseFloat(elapsed.toFixed(2)));
    state.timerAnimFrame = requestAnimationFrame(updateTimerDisplay);
}

function startTimer() {
    state.timerRunning = true;
    state.timerReady = false;
    state.timerStart = performance.now();
    timerDisplay.classList.remove('ready', 'holding');
    timerDisplay.classList.add('running');
    document.querySelector('main').classList.add('timer-running');
    state.timerAnimFrame = requestAnimationFrame(updateTimerDisplay);
}

function stopTimer(cancelled = false) {
    if (!state.timerRunning) return;

    const elapsed = (performance.now() - state.timerStart) / 1000;
    state.timerRunning = false;
    state.timerJustStopped = true;
    document.querySelector('main').classList.remove('timer-running');

    if (state.timerAnimFrame) {
        cancelAnimationFrame(state.timerAnimFrame);
        state.timerAnimFrame = null;
    }

    timerDisplay.classList.remove('running');

    if (cancelled) return;

    // Round to centiseconds
    const time = Math.round(elapsed * 100) / 100;
    timerDisplay.textContent = formatTime(time);

    // Add the time to the session
    addTimerTime(time);
}

function addTimerTime(time) {
    const required = getRequiredSolves();
    if (state.times.length >= required) {
        state.times = [];
    }

    const event = document.getElementById('event-type').value;
    const averageId = `${event}-${Date.now()}`;

    // Save undo state before modification
    saveUndoState();

    state.times.push({
        raw: time,
        penalty: null,
        value: time,
        event: event,
        averageId: averageId,
        scramble: state.currentScramble,
        inspectionTime: state.inspectionTime ?? null,
    });
    state.inspectionTime = null; // reset after use
    state.userSolves.push(time);

    // Track session PR single
    if (!state.sessionPrSingle[event] || time < state.sessionPrSingle[event].value) {
        state.sessionPrSingle[event] = {
            value: time,
            scramble: state.currentScramble,
            event: event,
        };
    }

    // If the time is a new PR single, celebrate
    const isPr = getSingleRank(time) === 1;
    if (isPr && state.userSolves.length > 1) {
        triggerEmojiAnimation('🎉', 10, document.getElementById('timerDisplay'));
    }

    displayCurrentTimes();
    updateUndoButton();
    saveIncomplete();
    generateScramble();
    window._showMobileSolveResult?.();
    calculateStats();
}

// === EMOJI CELEBRATION ANIMATION ===

function triggerEmojiAnimation(emoji, count, originEl) {
    const rect = (originEl || document.getElementById('timerDisplay')).getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const SCALE = 150;
    const GRAVITY = 9.81 * SCALE;

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.textContent = emoji;
        particle.style.cssText = `
            position: fixed;
            left: ${originX}px;
            top: ${originY}px;
            font-size: ${14 + Math.random() * 18}px;
            pointer-events: none;
            z-index: 9999;
        `;
        document.body.appendChild(particle);

        const vx = (Math.random() * 2 - 1) * SCALE * 2;
        const vy = -(2 + Math.random() * 3) * SCALE;
        const startTime = performance.now();

        (function (vx, vy, startTime) {
            function animate(now) {
                const t = (now - startTime) / 1000;
                const x = originX + vx * t;
                const y = originY + vy * t + 0.5 * GRAVITY * t * t;
                const opacity = Math.max(0, 1 - t / 2);
                particle.style.left = `${x}px`;
                particle.style.top = `${y}px`;
                particle.style.opacity = opacity;
                if (y < window.innerHeight + 50 && opacity > 0) {
                    requestAnimationFrame(animate);
                } else {
                    particle.remove();
                }
            }
            requestAnimationFrame(animate);
        })(vx, vy, startTime);
    }
}

// Celebration priority (most special = most emojis):
//   under target  → 🎯  ×  5
//   PR single     → 🎉  × 10  (triggered in addTimerTime)
//   PR average    → 🎉  × 18
//   under goal    → 🌟  × 25
function celebrateAverage(avgVal, rank) {
    if (typeof avgVal !== 'number' || !isFinite(avgVal)) return;
    const originEl = document.getElementById('average');
    const goalTime = typeof getGoalTime === 'function' ? getGoalTime() : null;
    const isUnderGoal = goalTime !== null && avgVal <= goalTime;
    const isPrAvg = state.userAverages.length > 1 && rank === 1;
    const targetVal = parseFloat(document.getElementById('target').value);
    const isUnderTarget =
        !isNaN(targetVal) && isFinite(targetVal) && targetVal > 0 && avgVal < targetVal;

    if (isUnderGoal) {
        triggerEmojiAnimation('🌟', 25, originEl);
    } else if (isPrAvg) {
        triggerEmojiAnimation('🎉', 18, originEl);
    } else if (isUnderTarget) {
        triggerEmojiAnimation('🎯', 5, originEl);
    }
}

// === KEYBOARD HANDLING FOR TIMER ===
document.addEventListener('keydown', (e) => {
    if (state.mode !== 'timer') return;

    // Don't interfere with text input
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Escape cancels an active inspection
    if (e.key === 'Escape' && state.inspectionRunning) {
        e.preventDefault();
        stopInspection();
        resetTimerDisplay();
        timerDisplay.textContent = '0.00';
        return;
    }

    // Any key stops a running timer
    if (state.timerRunning) {
        e.preventDefault();
        stopTimer();
        if (e.key === 'Escape') applyPenalty(state.times.length - 1, 'dnf');
        return;
    }

    // From here on, only Space matters
    if (e.code !== 'Space') return;
    e.preventDefault();

    // Don't restart/duplicate an existing hold
    if (state.timerHolding) return;

    state.timerHolding = true;

    // ---------------------------------------------------------
    // Inspection already running:
    // hold Space to end inspection and start the solve
    // ---------------------------------------------------------
    if (state.inspectionRunning) {
        timerDisplay.classList.add('inspection-holding');

        holdTimeout = setTimeout(() => {
            state.timerReady = true;
            timerDisplay.classList.remove('inspection-holding');
            timerDisplay.classList.add('inspection-ready');
        }, currentHoldDuration);

        return;
    }

    // ---------------------------------------------------------
    // Inspection should be used:
    // first Space press starts inspection immediately.
    // A later Space press will use the hold flow above.
    // ---------------------------------------------------------
    if (shouldUseInspection()) {
        state.timerHolding = false;

        timerDisplay.classList.add('inspecting');

        if (!state.inspectionAnimFrame) {
            startInspection();
        }

        return;
    }

    // ---------------------------------------------------------
    // No inspection:
    // hold Space until the timer is ready to start.
    // ---------------------------------------------------------
    timerDisplay.textContent = '0.00';

    timerDisplay.classList.remove('running', 'inspecting', 'inspection-plus2', 'inspection-dnf');
    timerDisplay.classList.add('holding');

    holdTimeout = setTimeout(() => {
        state.timerReady = true;
        timerDisplay.classList.remove('holding');
        timerDisplay.classList.add('ready');
    }, currentHoldDuration);
});

document.addEventListener('keyup', (e) => {
    if (state.mode !== 'timer') return;
    if (e.code !== 'Space') return;

    // Don't interfere with text input
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    e.preventDefault();

    // Cancel the hold timer regardless of how far we got
    if (holdTimeout) {
        clearTimeout(holdTimeout);
        holdTimeout = null;
    }

    // ---------------------------------------------------------
    // Space was held long enough:
    // start the solve.
    // ---------------------------------------------------------
    if (state.timerReady && !state.timerRunning) {
        state.timerHolding = false;
        state.timerReady = false;

        timerDisplay.classList.remove('ready', 'holding', 'inspection-holding', 'inspection-ready');

        if (state.inspectionRunning) {
            stopInspection();
        }

        startTimer();
        return;
    }

    // ---------------------------------------------------------
    // Space was released before the hold completed.
    // ---------------------------------------------------------
    state.timerHolding = false;
    state.timerReady = false;

    timerDisplay.classList.remove('ready', 'holding', 'inspection-holding', 'inspection-ready');

    // A timer was just stopped, so consume this Space release
    // without starting anything.
    if (state.timerJustStopped) {
        state.timerJustStopped = false;
        return;
    }

    // If inspection is active, restore its visual state.
    if (state.inspectionRunning) {
        timerDisplay.classList.add('inspecting');

        if (!state.inspectionAnimFrame) {
            updateInspectionDisplay();
        }
    }
});

// === TOUCH TIMER ===

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

// Touch-based timer (tap and hold to start/stop)
(function initTouchTimer() {
    const timerArea = document.querySelector('.timer-area');
    if (!timerArea) return;

    let touchHoldTimeout = null;

    timerArea.addEventListener(
        'touchstart',
        (e) => {
            if (state.mode !== 'timer') return;

            // Don't intercept buttons, inputs, or the scramble text
            const tag = e.target.tagName;
            const isScramble = !!e.target.closest('.scramble-container');
            if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || isScramble) return;

            e.preventDefault();

            if (state.timerRunning) {
                stopTimer();
                return;
            }

            if (state.timerHolding) return;

            state.timerHolding = true;
            window._hideMobileSolveResult?.();

            if (state.inspectionRunning) {
                // During inspection: show warning colour while holding, green when ready
                timerDisplay.classList.add('inspection-holding');
                touchHoldTimeout = setTimeout(() => {
                    state.timerReady = true;
                    timerDisplay.classList.remove('inspection-holding');
                    timerDisplay.classList.add('inspection-ready');
                }, currentHoldDuration);
            } else if (shouldUseInspection()) {
                // Inspection enabled but not running: start on touchend (no hold needed)
                timerDisplay.classList.add('inspecting');
            } else {
                timerDisplay.textContent = '0.00';
                timerDisplay.classList.remove(
                    'running',
                    'inspecting',
                    'inspection-plus2',
                    'inspection-dnf',
                );
                timerDisplay.classList.add('holding');
                touchHoldTimeout = setTimeout(() => {
                    state.timerReady = true;
                    timerDisplay.classList.remove('holding');
                    timerDisplay.classList.add('ready');
                }, currentHoldDuration);
            }
        },
        { passive: false },
    );

    timerArea.addEventListener('touchend', (e) => {
        if (state.mode !== 'timer') return;

        const tag = e.target.tagName;
        const isScramble = !!e.target.closest('.scramble-container');
        if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || isScramble) return;

        if (touchHoldTimeout) {
            clearTimeout(touchHoldTimeout);
            touchHoldTimeout = null;
        }

        if (state.timerReady && !state.timerRunning) {
            state.timerHolding = false;
            timerDisplay.classList.remove(
                'ready',
                'holding',
                'inspection-holding',
                'inspection-ready',
            );

            if (state.inspectionRunning) {
                stopInspection();
                startTimer();
            } else {
                startTimer();
            }
            return;
        }

        state.timerHolding = false;
        state.timerReady = false;
        timerDisplay.classList.remove('ready', 'holding', 'inspection-holding', 'inspection-ready');

        if (!state.timerRunning) {
            if (state.timerJustStopped) {
                state.timerJustStopped = false;
            } else if (!state.inspectionRunning && shouldUseInspection()) {
                startInspection();
            } else if (state.inspectionRunning) {
                timerDisplay.classList.add('inspecting');
                if (!state.inspectionAnimFrame) updateInspectionDisplay();
            }
        }
    });
})();

// === MOBILE SWIPE-DOWN PENALTY SHEET ===

(function initMobileSolveResult() {
    const bar = document.getElementById('mobilePenaltySheet');
    if (!bar) return;

    let lastSolveIndex = -1;
    let autoHideTimer = null;

    function showBar() {
        if (!isMobile()) return;
        const lastIdx = state.times.length - 1;
        if (lastIdx < 0) return;

        lastSolveIndex = lastIdx;
        const solve = state.times[lastIdx];

        const timeText = document.getElementById('penaltySheetTime');
        if (solve.penalty === 'dnf') {
            timeText.textContent = 'DNF';
        } else if (solve.penalty === 'plus2') {
            timeText.textContent = formatTime(solve.raw) + '+';
        } else {
            timeText.textContent = formatTime(solve.raw);
        }

        bar.hidden = false;
        requestAnimationFrame(() => bar.classList.add('visible'));

        // Auto-hide after 8 seconds
        clearTimeout(autoHideTimer);
        autoHideTimer = setTimeout(hideBar, 8000);
    }

    function hideBar() {
        clearTimeout(autoHideTimer);
        bar.classList.remove('visible');
        bar.addEventListener(
            'transitionend',
            () => {
                if (!bar.classList.contains('visible')) bar.hidden = true;
            },
            { once: true },
        );
    }

    // Expose for use in addTimerTime(), addTime(), and timer hold start
    window._showMobileSolveResult = showBar;
    window._hideMobileSolveResult = hideBar;

    // Penalty button handlers
    document.getElementById('penaltyOk').addEventListener('click', () => {
        if (lastSolveIndex >= 0) removePenalty(lastSolveIndex);
        hideBar();
    });

    document.getElementById('penaltyPlus2').addEventListener('click', () => {
        if (lastSolveIndex >= 0) applyPenalty(lastSolveIndex, 'plus2');
        hideBar();
    });

    document.getElementById('penaltyDnf').addEventListener('click', () => {
        if (lastSolveIndex >= 0) applyPenalty(lastSolveIndex, 'dnf');
        hideBar();
    });

    document.getElementById('penaltyEdit').addEventListener('click', () => {
        if (lastSolveIndex >= 0) openEditModal(lastSolveIndex);
        hideBar();
    });

    document.getElementById('penaltyDelete').addEventListener('click', () => {
        if (lastSolveIndex >= 0) deleteTime(lastSolveIndex);
        hideBar();
    });
})();

// === UNDO ===

function saveUndoState() {
    state.undoData = {
        times: JSON.parse(JSON.stringify(state.times)),
        scramble: state.currentScramble,
        averageTagsLength: state.averageTags.length,
        userSolvesLength: state.userSolves.length,
        userAveragesLength: state.userAverages.length,
    };
}

function undoLastSolve() {
    if (!state.undoData) return;
    const undo = state.undoData;

    // Track which averages are being removed (for cookie cleanup)
    const removedTags = state.averageTags.slice(undo.averageTagsLength);

    // Remove any averages added after snapshot
    while (state.averageTags.length > undo.averageTagsLength) {
        state.averageTags.pop();
    }

    state.times = undo.times;
    state.currentScramble = undo.scramble;

    const scrambleText = document.getElementById('scrambleText');
    if (scrambleText) scrambleText.innerHTML = undo.scramble || 'No scramble';
    updateScrambleDrawing(undo.scramble);

    state.userSolves.length = undo.userSolvesLength;
    state.userAverages.length = undo.userAveragesLength;

    state.undoData = null;

    saveAverages();
    saveIncomplete();
    displayCurrentTimes();
    displayTags();
    updateUndoButton();
    updateSessionStats();
    updateAveragesEmptyState();
    calculateStats();
}

function getSolveDisplayText(solve) {
    if (!solve) return '–';
    if (solve.penalty === 'dnf' || solve.raw === -1 || !Number.isFinite(getSolveValue(solve))) {
        return 'DNF';
    }
    if (solve.penalty === 'plus2') {
        return `${formatTime(solve.raw)}+`;
    }
    return formatTime(solve.raw);
}

function updateUndoButton() {
    const btn = document.getElementById('undoBtn');
    if (btn) btn.disabled = !state.undoData;
}

// === SNAPSHOT / SHARE ===

function wrapCanvasText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
}

function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Preload logo for snapshot cards
let _snapshotLogo = null;
(function () {
    const img = new Image();
    img.src = '/assets/logo_long.png';
    img.onload = () => {
        _snapshotLogo = img;
    };
})();

function generateSnapshotCanvas(type, data) {
    const W = 500;
    const pad = 32;
    const cardR = 12; // prominent card radius per design (12–18px)
    const pillR = 11; // fully round pill

    const cs = getComputedStyle(document.documentElement);
    const cv = (v) => cs.getPropertyValue(v).trim();
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    const colors = {
        bg: cv('--main-background') || '#000000',
        cardBg: cv('--card-bg') || cv('--secondary-background') || '#191923',
        cardBorder: cv('--card-border') || 'rgba(255,255,255,0.08)',
        text: cv('--main-text') || '#F4F4F5',
        muted: cv('--secondary-text') || '#A1A1AA',
        accent: cv('--button-background') || '#4F46E5',
        buttonColor: cv('--button-color') || '#FFFFFF',
        success: cv('--success') || '#2ecc71',
        error: cv('--error') || '#e74c3c',
        border: cv('--main-lighter') || '#2A2A31',
    };

    const F = "'Poppins', sans-serif"; // --font-main

    const eventName = EVENTS[data.event]?.name || data.event;
    const isMean = meanEvents.includes(data.event);
    const avgLabel = isMean ? 'Mean of 3' : 'Average of 5';

    // --- Pre-measure height ---
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = 1;
    const mctx = tmp.getContext('2d');

    const logoH = 32;
    let h = pad + logoH + 20 + 20 + 54 + 24 + 20; // top pad + logo + gap + event + mainTime + rank + divider

    if (type === 'average' && data.times) {
        data.times.forEach((t) => {
            h += 26;
            if (t.scramble) {
                mctx.font = `11px monospace`;
                const lines = wrapCanvasText(mctx, t.scramble, W - pad * 2 - 20);
                h += lines.length * 16 + 6;
            }
        });
        h += 8;
    }

    if (type === 'single' && data.scramble) {
        h += 24;
        mctx.font = `13px monospace`;
        const lines = wrapCanvasText(mctx, data.scramble, W - pad * 2);
        h += lines.length * 18 + 8;
    }

    h += 52; // date + url + bottom pad

    // --- Render ---
    const dpr = Math.max(window.devicePixelRatio || 1, 3);

    const canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, h);

    // Card
    ctx.fillStyle = colors.cardBg;
    drawRoundRect(ctx, 12, 12, W - 24, h - 24, cardR);
    ctx.fill();
    ctx.strokeStyle = colors.cardBorder;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, 12, 12, W - 24, h - 24, cardR);
    ctx.stroke();

    let y = pad + 4;

    // Logo (invert for light mode)
    if (_snapshotLogo && _snapshotLogo.naturalWidth) {
        const logoW = Math.round(
            logoH * (_snapshotLogo.naturalWidth / _snapshotLogo.naturalHeight),
        );
        const logoX = Math.round((W - logoW) / 2);

        if (isLight) {
            const offscreen = document.createElement('canvas');
            offscreen.width = logoW;
            offscreen.height = logoH;
            const octx = offscreen.getContext('2d');
            octx.filter = 'invert(1)';
            octx.drawImage(_snapshotLogo, 0, 0, logoW, logoH);
            ctx.drawImage(offscreen, logoX, y, logoW, logoH);
        } else {
            ctx.drawImage(_snapshotLogo, logoX, y, logoW, logoH);
        }
    } else {
        ctx.fillStyle = colors.text;
        ctx.font = `600 16px ${F}`;
        ctx.textAlign = 'center';
        ctx.fillText('cubingtools.de', W / 2, y + 16);
    }
    y += logoH + 20;

    // Event + type
    ctx.fillStyle = colors.muted;
    ctx.font = `500 13px ${F}`;
    ctx.textAlign = 'center';
    ctx.fillText(type === 'average' ? `${eventName} ${avgLabel}` : `${eventName} Single`, W / 2, y);
    y += 12;

    // Main time
    const mainTime =
        type === 'average'
            ? data.average === 'DNF'
                ? 'DNF'
                : formatTime(parseFloat(data.average))
            : data.value === -1 || data.value === Infinity
              ? 'DNF'
              : formatTime(data.value);
    ctx.fillStyle = colors.text;
    ctx.font = `700 42px ${F}`;
    ctx.fillText(mainTime, W / 2, y + 42);
    y += 54;

    // Ranking pill
    if (data.rank) {
        const label = `PR #${data.rank}`;
        ctx.font = `600 12px ${F}`;
        const tw = ctx.measureText(label).width;
        const pillW = tw + 20;
        const pillH = 22;
        const pillX = (W - pillW) / 2;

        ctx.fillStyle = colors.accent;
        drawRoundRect(ctx, pillX, y - 2, pillW, pillH, pillR);
        ctx.fill();

        ctx.fillStyle = colors.buttonColor;
        ctx.fillText(label, W / 2, y + 13);
    }
    y += 24;

    // Divider
    ctx.strokeStyle = colors.cardBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
    y += 16;

    ctx.textAlign = 'left';

    if (type === 'average' && data.times) {
        const values = data.times.map((t) => getSolveValue(t));
        const { bestIdx, worstIdx } = getBestWorstIndices(values);

        data.times.forEach((t, i) => {
            const numVal = values[i];
            const timeStr = numVal === Infinity ? 'DNF' : formatTime(numVal);

            const isBest = i === bestIdx;
            const isWorst = i === worstIdx;

            const display = isBest || isWorst ? `(${timeStr})` : timeStr;
            const numStr = `${i + 1}. `;

            ctx.font = `600 14px ${F}`;
            ctx.fillStyle = colors.muted;
            ctx.fillText(numStr, pad, y + 18);
            const numW = ctx.measureText(numStr).width;

            if (isBest) ctx.fillStyle = colors.success;
            else if (isWorst) ctx.fillStyle = colors.error;
            else ctx.fillStyle = colors.text;
            ctx.fillText(display, pad + numW, y + 18);

            // Rank
            if (numVal !== Infinity) {
                const solveRank = getSingleRank(numVal);
                if (solveRank) {
                    const timeW = ctx.measureText(display).width;
                    ctx.fillStyle = colors.muted;
                    ctx.font = `400 11px ${F}`;
                    ctx.fillText(`#${solveRank}`, pad + numW + timeW + 8, y + 18);
                }
            }

            y += 24;

            // Scramble
            if (t.scramble) {
                ctx.fillStyle = colors.muted;
                ctx.font = '11px monospace';
                const lines = wrapCanvasText(ctx, t.scramble, W - pad * 2 - 20);
                lines.forEach((line) => {
                    ctx.fillText(line, pad + 20, y + 13);
                    y += 16;
                });
                y += 4;
            }
        });
    }

    if (type === 'single' && data.scramble) {
        ctx.fillStyle = colors.muted;
        ctx.font = `600 12px ${F}`;
        ctx.fillText('Scramble:', pad, y + 14);
        y += 22;

        ctx.font = '13px monospace';
        const lines = wrapCanvasText(ctx, data.scramble, W - pad * 2);
        lines.forEach((line) => {
            ctx.fillText(line, pad, y + 14);
            y += 18;
        });
        y += 6;
    }

    // Footer
    y += 8;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.muted;
    ctx.font = `400 11px ${F}`;
    const dateStr = new Date().toLocaleDateString('de-DE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    ctx.fillText(dateStr, W / 2, y + 12);
    y += 18;
    ctx.fillStyle = colors.muted;
    ctx.font = `400 11px ${F}`;
    ctx.fillText('cubingtools.de/tools/average', W / 2, y + 12);

    return canvas;
}

async function shareSnapshot(type, data) {
    const canvas = generateSnapshotCanvas(type, data);

    try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

        if (navigator.share && navigator.canShare) {
            const file = new File([blob], 'cubingtools-result.png', { type: 'image/png' });
            const shareData = { files: [file] };
            if (navigator.canShare(shareData)) {
                await navigator.share(shareData);
                return;
            }
        }

        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cubingtools-${type}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        if (err.name !== 'AbortError') console.error('Share error:', err);
    }
}

// === AVERAGE DETAIL POPUP ===

let _avgDetailTag = null;

function showAverageDetail(tag) {
    _avgDetailTag = tag;
    const popup = document.getElementById('avgDetailPopup');
    const titleEl = document.getElementById('avgDetailTitle');
    const timeEl = document.getElementById('avgDetailTime');
    const rankEl = document.getElementById('avgDetailRank');
    const solvesEl = document.getElementById('avgDetailSolves');

    const eventName = EVENTS[tag.event]?.name || tag.event;
    const isMean = meanEvents.includes(tag.event);
    titleEl.textContent = `${eventName} ${isMean ? 'Mean of 3' : 'Average of 5'}`;

    const avg = tag.average === 'DNF' ? 'DNF' : formatTime(parseFloat(tag.average));
    timeEl.textContent = avg;

    const rank = getAverageRank(tag.average);
    rankEl.textContent = rank ? `PR #${rank}` : '';

    solvesEl.innerHTML = '';

    const values = tag.times.map((t) => getSolveValue(t));
    const { bestIdx, worstIdx } = getBestWorstIndices(values);

    tag.times.forEach((t, i) => {
        const row = document.createElement('div');
        row.classList.add('avg-detail-solve-row');

        const numSpan = document.createElement('span');
        numSpan.classList.add('avg-detail-solve-num');
        numSpan.textContent = `${i + 1}.`;

        const infoDiv = document.createElement('div');
        infoDiv.classList.add('avg-detail-solve-info');

        const numVal = values[i];
        const timeStr = numVal === Infinity ? 'DNF' : formatTime(numVal);

        const isBest = i === bestIdx;
        const isWorst = i === worstIdx;

        const timeRow = document.createElement('div');
        const timeSpan = document.createElement('span');
        timeSpan.classList.add('avg-detail-solve-time');
        timeSpan.textContent = isBest || isWorst ? `(${timeStr})` : timeStr;
        if (isBest) timeSpan.classList.add('best');
        if (isWorst) timeSpan.classList.add('worst');
        timeRow.appendChild(timeSpan);

        if (numVal !== Infinity) {
            const solveRank = getSingleRank(numVal);
            if (solveRank) {
                const rankSpan = document.createElement('span');
                rankSpan.classList.add('avg-detail-solve-rank');
                rankSpan.textContent = `#${solveRank}`;
                timeRow.appendChild(rankSpan);
            }
        }

        // Penalty indicator
        if (t.penalty === 'plus2') {
            const penSpan = document.createElement('span');
            penSpan.classList.add('avg-detail-solve-rank');
            penSpan.textContent = ' +2';
            timeRow.appendChild(penSpan);
        }

        infoDiv.appendChild(timeRow);

        if (t.scramble) {
            const scrambleDiv = document.createElement('div');
            scrambleDiv.classList.add('avg-detail-solve-scramble');
            scrambleDiv.textContent = t.scramble;
            infoDiv.appendChild(scrambleDiv);
        }

        row.appendChild(numSpan);
        row.appendChild(infoDiv);
        solvesEl.appendChild(row);
    });

    popup.hidden = false;
}

function closeAverageDetail() {
    document.getElementById('avgDetailPopup').hidden = true;
    _avgDetailTag = null;
}

document.getElementById('avgDetailClose').addEventListener('click', closeAverageDetail);
document.getElementById('avgDetailPopup').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAverageDetail();
});

document.getElementById('avgDetailShareBtn').addEventListener('click', () => {
    if (!_avgDetailTag) return;
    const rank = getAverageRank(_avgDetailTag.average);
    shareSnapshot('average', {
        average: _avgDetailTag.average,
        times: _avgDetailTag.times,
        event: _avgDetailTag.event,
        rank: rank,
    });
});

document.getElementById('avgDetailDeleteBtn').addEventListener('click', () => {
    if (!_avgDetailTag) return;
    deleteAverage(_avgDetailTag.averageId);
    closeAverageDetail();
});

// ── Toolbar: solve dots & label ──────────────────────────────
function updateToolbar() {
    const required = getRequiredSolves();
    const current = state.times.length;
    const dotsEl = document.getElementById('toolbarSolveDots');
    const labelEl = document.getElementById('toolbarSolveLabel');
    const targetPill = document.getElementById('toolbarTargetPill');
    const targetVal = document.getElementById('toolbarTargetValue');
    const iconEl = document.getElementById('toolbarEventIcon');

    // Dots
    if (dotsEl) {
        dotsEl.innerHTML = '';
        for (let i = 0; i < required; i++) {
            const dot = document.createElement('span');
            dot.className = 'solve-dot' + (i < current ? ' filled' : '');
            dotsEl.appendChild(dot);
        }
    }

    // Label: "SOLVE N" where N = next solve number (capped at required)
    if (labelEl) {
        const next = Math.min(current + 1, required);
        labelEl.textContent = `SOLVE ${next}`;
    }

    // Event icon: derived from the shared EVENTS map so it can never list an
    // event that doesn't otherwise exist in the app.
    if (iconEl) {
        const ev = state.eventType || '333';
        if (EVENTS[ev]) {
            iconEl.innerHTML = `<span class="cubing-icon event-${ev} unofficial-${ev}"></span>`;
        } else {
            iconEl.innerHTML = ev[0].toUpperCase();
        }
    }

    // Target pill
    const targetRaw = document.getElementById('target')?.value;
    if (targetPill && targetVal) {
        if (targetRaw && parseFloat(targetRaw) > 0) {
            targetVal.textContent = formatTime(parseFloat(targetRaw));
            targetPill.style.display = 'flex';
        } else {
            targetPill.style.display = 'none';
        }
    }
}

// Hook into target input changes
document.getElementById('target')?.addEventListener('input', updateToolbar);
document.getElementById('settingsTarget')?.addEventListener('input', updateToolbar);

// Call once on load — and after every solve via MutationObserver on the times list
document.addEventListener('DOMContentLoaded', () => {
    updateToolbar();
    updateInspectionBadge();

    // Watch the solve list for DOM changes (each addTime/deleteTime re-renders it)
    const solveList = document.getElementById('currentTimes');
    if (solveList) {
        new MutationObserver(updateToolbar).observe(solveList, { childList: true, subtree: true });
    }
});

// ── Zen Mode ─────────────────────────────────────────────────
(function initZenMode() {
    const btn = document.getElementById('zenModeBtn');
    const main = document.querySelector('main');
    if (!btn || !main) return;

    let zenActive = false;

    btn.addEventListener('click', () => {
        zenActive = !zenActive;
        main.classList.toggle('zen-mode', zenActive);
        btn.classList.toggle('zen-active', zenActive);
        btn.title = zenActive ? 'Exit Zen mode' : 'Zen mode';
        // Swap icon
    });
})();

// ═══════════════════════════════════════════════════════════════
// === COMPETITION PAGE ===
// ═══════════════════════════════════════════════════════════════

const compState = {
    // [{raw, penalty, value}] — length always equals required solves for current event
    times: [],
    wcaSolves: [], // WCA-only single times in seconds (no session data)
    wcaAverages: [], // WCA-only averages in seconds
};

function getCompRequiredSolves() {
    // Was its own copy of the mean-events check; now delegates to the single
    // shared helper so event-count rules can never drift between pages.
    return getRequiredSolvesForEvent(state.eventType);
}

// Initialize (or reinit on event change) — resets times if count changes
function initCompSolves() {
    const n = getCompRequiredSolves();
    if (compState.times.length !== n) {
        compState.times = Array.from({ length: n }, () => ({
            raw: null,
            penalty: null,
            value: null,
        }));
    }
    renderCompSolves();
    calculateCompStats();
}

function renderCompSolves() {
    const container = document.getElementById('compSolvesList');
    if (!container) return;
    const n = getCompRequiredSolves();
    container.innerHTML = '';

    for (let i = 0; i < n; i++) {
        const solve = compState.times[i] || { raw: null, penalty: null, value: null };

        const row = document.createElement('div');
        row.className = 'comp-solve-row';
        row.dataset.index = i;
        row.dataset.penalty = solve.penalty || '';

        // Solve number label
        const label = document.createElement('span');
        label.className = 'comp-solve-label';
        label.textContent = i + 1;

        // Time input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'comp-solve-input';
        input.placeholder = '–';
        input.autocomplete = 'off';
        input.dataset.index = i;
        input.setAttribute('inputmode', 'decimal');

        if (solve.penalty === 'dnf') {
            input.value = 'DNF';
        } else if (solve.raw !== null && isFinite(solve.raw)) {
            input.value = formatTime(solve.raw);
        }

        input.addEventListener('input', (e) => {
            formatInputField(e.target);
            parseAndSaveCompTime(i, input.value);
        });

        input.addEventListener('blur', (e) => parseAndSaveCompTime(i, input.value));

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                parseAndSaveCompTime(i, input.value);
                const allInputs = container.querySelectorAll('.comp-solve-input');
                const next = allInputs[i + 1];
                if (next) next.focus();
                else input.blur();
            }
            if (e.key === 'Escape') input.blur();
        });

        // Penalty buttons
        const penaltyBtns = document.createElement('div');
        penaltyBtns.className = 'penalty-buttons';

        penaltyBtns.appendChild(
            createButton({
                icon: 'fas fa-check',
                type: 'confirm',
                onClick: () => {
                    const t = compState.times[i];
                    t.penalty = null;
                    if (t.raw !== null && isFinite(t.raw)) {
                        t.value = t.raw;
                        input.value = formatTime(t.raw);
                    }
                    row.dataset.penalty = '';
                    renderCompSolveHighlights();
                    calculateCompStats();
                },
            }),
        );

        penaltyBtns.appendChild(
            createButton({
                text: '+',
                type: 'plus2',
                onClick: () => {
                    const t = compState.times[i];
                    if (t.raw !== null && isFinite(t.raw) && t.penalty !== 'dnf') {
                        t.penalty = 'plus2';
                        t.value = t.raw + 2;
                        row.dataset.penalty = 'plus2';
                        renderCompSolveHighlights();
                        calculateCompStats();
                    }
                },
            }),
        );

        penaltyBtns.appendChild(
            createButton({
                text: 'x',
                type: 'dnf',
                onClick: () => {
                    const t = compState.times[i];
                    t.penalty = 'dnf';
                    t.value = Infinity;
                    if (t.raw === null) t.raw = 0;
                    input.value = 'DNF';
                    row.dataset.penalty = 'dnf';
                    renderCompSolveHighlights();
                    calculateCompStats();
                },
            }),
        );

        const singlePr = document.createElement('span');
        singlePr.className = 'comp-single-pr';

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(singlePr);
        row.appendChild(penaltyBtns);
        container.appendChild(row);
    }

    renderCompSolveHighlights();
}

// Parse a typed time string and save to compState, then refresh UI
function parseAndSaveCompTime(index, value) {
    const container = document.getElementById('compSolvesList');
    const row = container?.querySelector(`.comp-solve-row[data-index="${index}"]`);
    const input = row?.querySelector('.comp-solve-input');

    value = (value || '').trim();

    if (!value) {
        compState.times[index] = { raw: null, penalty: null, value: null };
        if (row) row.dataset.penalty = '';
        renderCompSolveHighlights();
        calculateCompStats();
        return;
    }

    // Uses the shared parseTimeString parser (see top of file) instead of a
    // separate hand-rolled DNF/m:ss.xx parser. Comp page represents an
    // in-progress DNF's raw value as 0 (not -1) so the "clear penalty"
    // button has something sensible to fall back to — that quirk is
    // preserved here.
    const parsed = parseTimeString(value);
    const raw = parsed.error ? null : parsed.isDnf ? 0 : parsed.raw;
    const penalty = parsed.isDnf ? 'dnf' : null;

    const prev = compState.times[index];
    // Preserve explicit +2 penalty unless overridden by DNF or a fresh valid time
    const effectivePenalty = penalty ?? (prev.penalty === 'plus2' ? 'plus2' : null);
    const effectiveValue =
        effectivePenalty === 'dnf'
            ? Infinity
            : effectivePenalty === 'plus2' && raw !== null
              ? raw + 2
              : raw;

    compState.times[index] = { raw, penalty: effectivePenalty, value: effectiveValue };
    if (row) row.dataset.penalty = effectivePenalty || '';

    if (input && raw !== null) {
        input.value = effectivePenalty === 'dnf' ? 'DNF' : formatTime(raw);
    }

    renderCompSolveHighlights();
    calculateCompStats();
}

// Highlight best (green) and worst (red) solves once all times are filled (Ao5 only)
function renderCompSolveHighlights() {
    const n = getCompRequiredSolves();
    const rows = document.querySelectorAll('#compSolvesList .comp-solve-row');
    rows.forEach((row) => row.classList.remove('best-solve', 'worst-solve'));

    const filled = compState.times.filter((t) => t.value !== null);
    if (filled.length < n || meanEvents.includes(state.eventType)) return;

    const values = compState.times.map((t) => (t.value === null ? Infinity : t.value));
    const { bestIdx, worstIdx } = getBestWorstIndices(values);

    rows.forEach((row, i) => {
        if (i === bestIdx) row.classList.add('best-solve');
        else if (i === worstIdx) row.classList.add('worst-solve');
    });
}

// Calculate and display all stats for the competition page
function calculateCompStats() {
    const n = getCompRequiredSolves();
    const filledTimes = compState.times.filter((t) => t.value !== null);
    const filled = filledTimes.length;

    const meanEl = document.getElementById('comp-mean');
    const bpaEl = document.getElementById('comp-bpa');
    const wpaEl = document.getElementById('comp-wpa');
    const mlaEl = document.getElementById('comp-mla');
    const mlaSolveEl = document.getElementById('comp-mla-solve');
    const tftEl = document.getElementById('comp-tft');
    const avgEl = document.getElementById('comp-average');
    const duringCards = document.querySelectorAll('.comp-during-average');
    const afterCards = document.querySelectorAll('.comp-after-average');

    // Reset to dashes
    [meanEl, bpaEl, wpaEl, tftEl].forEach((el) => {
        if (el) el.textContent = '–';
    });
    if (mlaEl) {
        mlaEl.textContent = '–';
        mlaEl.innerHTML = '–';
    }
    if (mlaSolveEl) mlaSolveEl.textContent = '';
    if (avgEl) {
        avgEl.innerHTML = '';
        avgEl.textContent = '–';
    }

    if (filled === 0) {
        duringCards.forEach((el) => (el.style.display = 'flex'));
        afterCards.forEach((el) => (el.style.display = 'none'));
        return;
    }

    // Running mean of filled times
    const dnfInFilled = filledTimes.filter((t) => !isFinite(t.value)).length;
    const finiteFilledVals = filledTimes.filter((t) => isFinite(t.value)).map((t) => t.value);
    if (meanEl) {
        if (dnfInFilled > 0) {
            meanEl.textContent = 'DNF';
        } else if (finiteFilledVals.length > 0) {
            meanEl.textContent = formatTime(
                CubingCore.meanOfFinite(finiteFilledVals),
            );
        }
    }

    if (filled >= n) {
        // All solves entered — show final average
        duringCards.forEach((el) => (el.style.display = 'none'));
        afterCards.forEach((el) => (el.style.display = 'flex'));

        const averageValue = getAverageValueForSet(compState.times.slice(0, n), state.eventType);
        const average =
            averageValue === null || !Number.isFinite(averageValue) ? 'DNF' : averageValue.toFixed(2);

        if (avgEl) {
            const numeric = average === 'DNF' ? null : parseFloat(average);
            const text =
                average === 'DNF' || !Number.isFinite(numeric) ? 'DNF' : formatTime(numeric);
            const rank = Number.isFinite(numeric) ? getCompAverageRank(numeric) : null;
            // Reuses the same rendering helper as the average-calculator page
            // instead of a second hand-rolled DOM-building block.
            renderMetricValue(avgEl, text, { rank, pillKind: 'average' });
        }
    } else {
        // During average — show BPA / WPA / TFT when n−1 times are filled
        duringCards.forEach((el) => (el.style.display = 'flex'));
        afterCards.forEach((el) => (el.style.display = 'none'));

        const target = parseFloat(document.getElementById('target').value) || Infinity;
        const isMean = meanEvents.includes(state.eventType);

        if ((!isMean && filled === 4) || (isMean && filled === 2)) {
            const { bpa, wpa, tft } = calculateBpaWpaTft(filledTimes, target);

            if (bpaEl) {
                const isNumber = typeof bpa === 'number' && !isNaN(bpa) && isFinite(bpa);
                const text = bpa === 'DNF' ? 'DNF' : isNumber ? formatTime(bpa) : '–';
                const rank = isNumber ? getCompAverageRank(bpa) : null;
                renderMetricValue(bpaEl, text, { rank, pillKind: 'average' });
            }
            if (wpaEl) {
                const isNumber = typeof wpa === 'number' && !isNaN(wpa) && isFinite(wpa);
                const text = wpa === 'DNF' ? 'DNF' : isNumber ? formatTime(wpa) : '–';
                const rank = isNumber ? getCompAverageRank(wpa) : null;
                renderMetricValue(wpaEl, text, { rank, pillKind: 'average' });
            }
            if (tftEl) {
                tftEl.innerHTML = '';
                if (tft === 'Not Possible') {
                    tftEl.textContent = '0%';
                } else if (tft === 'Guaranteed') {
                    tftEl.textContent = '100%';
                } else if (typeof tft === 'number' && !isNaN(tft) && tft > 0) {
                    const timeDiv = document.createElement('div');
                    timeDiv.textContent = formatTime(tft);
                    tftEl.appendChild(timeDiv);
                    const prob = getCompTftProbability(tft);
                    if (prob !== null) {
                        const probDiv = document.createElement('div');
                        probDiv.className = 'stat-prob';
                        probDiv.textContent = `${prob}%`;
                        tftEl.appendChild(probDiv);
                    }
                } else {
                    tftEl.textContent = '–';
                }
            }

            // Most Likely Average (Ao5 only, requires WCA solve history)
            if (!isMean && filled === 4 && compState.wcaSolves.length >= 5) {
                const currentValues = filledTimes.map((t) =>
                    t.penalty === 'dnf' || !isFinite(t.value) ? Infinity : t.value,
                );
                const sortedHistory = [...compState.wcaSolves]
                    .filter((s) => isFinite(s))
                    .sort((a, b) => a - b);
                const medianSolve = sortedHistory[Math.floor(sortedHistory.length / 2)];

                if (mlaSolveEl) mlaSolveEl.textContent = `if ${formatTime(medianSolve)}`;

                if (mlaEl) {
                    const mlaVal = CubingCore.averageForEvent([...currentValues, medianSolve], state.eventType);
                    if (mlaVal === null || !Number.isFinite(mlaVal)) {
                        renderMetricValue(mlaEl, 'DNF', {});
                    } else {
                        renderMetricValue(mlaEl, formatTime(mlaVal), {
                            rank: getCompAverageRank(mlaVal),
                            pillKind: 'average',
                        });
                    }
                }
            }
        }
    }
    updateCompSolvePrPills();
}

// === Comp page: WCA-only rank + probability helpers ===
function getCompSingleRank(time) {
    if (!isFinite(time) || compState.wcaSolves.length === 0) return null;
    const finite = compState.wcaSolves.filter((s) => isFinite(s));
    return finite.length ? rankIn(time, finite) : null;
}

function getCompAverageRank(time) {
    if (!isFinite(time) || compState.wcaAverages.length === 0) return null;
    const finite = compState.wcaAverages.filter((a) => isFinite(a));
    return finite.length ? rankIn(time, finite) : null;
}

function getCompTftProbability(tft) {
    if (!isFinite(tft) || tft <= 0) return null;
    const finite = compState.wcaSolves.filter((s) => isFinite(s));
    if (finite.length === 0) return null;
    const below = finite.filter((s) => s <= tft).length;
    return Math.round((below / finite.length) * 100);
}

function updateCompSolvePrPills() {
    const rows = document.querySelectorAll('#compSolvesList .comp-solve-row');
    rows.forEach((row, i) => {
        const prEl = row.querySelector('.comp-single-pr');
        if (!prEl) return;
        prEl.innerHTML = '';
        const t = compState.times[i];
        if (!t || t.value === null || !isFinite(t.value)) return;
        const rank = getCompSingleRank(t.value);
        if (!rank) return;
        const pill = document.createElement('span');
        pill.className = 'pr-rank-pill comp-single-pr-pill';
        pill.textContent = `#${rank}`;
        pill.style.background = getPrPillColor(rank, 'single');
        prEl.appendChild(pill);
    });
}

// Comp WCA ID input — sync with shared wca input and load ranking data
document.getElementById('compWcaInput')?.addEventListener('input', async (e) => {
    const wcaId = e.target.value.trim().toUpperCase();
    document.getElementById('wca').value = wcaId;
    setStorage('setting_wca', wcaId);
    document.getElementById('settingsWca').value = wcaId;

    if (!wcaId || !/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || wcaId.length !== 10) {
        compState.wcaSolves = [];
        compState.wcaAverages = [];
        calculateCompStats();
        return;
    }

    try {
        await fetchUserData(wcaId);
        calculateCompStats();
        updatePrTarget();
    } catch (err) {
        console.error('Comp WCA fetch error:', err);
    }
});

// Clear all comp times
document.getElementById('compClearBtn')?.addEventListener('click', () => {
    const n = getCompRequiredSolves();
    compState.times = Array.from({ length: n }, () => ({ raw: null, penalty: null, value: null }));
    renderCompSolves();
    calculateCompStats();
});
