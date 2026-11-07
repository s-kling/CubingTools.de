let inputArray = [];
let originalArray = [];
let frequencyMap = {};
let sessions = {};
let sessionNames = {};
let currentDataSourceMode = 'cstimer';

function setDataSourceMode(mode) {
    currentDataSourceMode = mode === 'wca' ? 'wca' : mode === 'average' ? 'average' : 'cstimer';

    const fileUpload = document.getElementById('fileUpload');
    const wcaIdFetch = document.getElementById('wcaIdFetch');
    const averageToolFetch = document.getElementById('averageToolFetch');
    const sourceCsTimer = document.getElementById('sourceCsTimer');
    const sourceWca = document.getElementById('sourceWca');
    const sourceAverage = document.getElementById('sourceAverage');

    if (
        !fileUpload ||
        !wcaIdFetch ||
        !averageToolFetch ||
        !sourceCsTimer ||
        !sourceWca ||
        !sourceAverage
    ) {
        return;
    }

    fileUpload.style.display = currentDataSourceMode === 'cstimer' ? 'flex' : 'none';
    wcaIdFetch.style.display = currentDataSourceMode === 'wca' ? 'flex' : 'none';
    averageToolFetch.style.display = currentDataSourceMode === 'average' ? 'flex' : 'none';

    sourceCsTimer.classList.toggle('active', currentDataSourceMode === 'cstimer');
    sourceWca.classList.toggle('active', currentDataSourceMode === 'wca');
    sourceAverage.classList.toggle('active', currentDataSourceMode === 'average');
}

function loadCSTimerFile(event) {
    const file = event.target.files[0];

    if (!file) {
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            sessions = data;
            sessionNames = parseSessionNames(data?.properties?.sessionData);
            populateSessionDropdown();
        } catch (error) {
            alert('Invalid cstimer file format.');
        }
    };

    reader.readAsText(file);
}

function parseSessionNames(sessionData) {
    if (!sessionData) {
        return {};
    }

    if (typeof sessionData === 'string') {
        try {
            return JSON.parse(sessionData);
        } catch (error) {
            return {};
        }
    }

    if (typeof sessionData === 'object') {
        return sessionData;
    }

    return {};
}

// csTimer solve: [[penaltyMs, timeMs], scramble, comment, timestamp]; penalty -1 = DNF, 2000 = +2.
// Returns centiseconds, DNF_MARK for a DNF, or null for rows that cannot be used.
const DNF_MARK = -1;

function extractSolveCentiseconds(solve) {
    const penaltyMs = Number(solve?.[0]?.[0]);
    const timeMs = Number(solve?.[0]?.[1]);
    if (penaltyMs === -1) return DNF_MARK;
    if (!Number.isFinite(timeMs) || timeMs < 0 || !Number.isFinite(penaltyMs)) return null;
    return Math.round((timeMs + Math.max(0, penaltyMs)) / 10);
}

function populateSessionDropdown() {
    const sessionDropdown = document.getElementById('sessionDropdown');
    sessionDropdown.innerHTML = ''; // Clear previous options

    const sessionKeys = Object.keys(sessions)
        .filter((sessionKey) => sessionKey !== 'properties' && Array.isArray(sessions[sessionKey]))
        .sort((a, b) => Number(a.replace('session', '')) - Number(b.replace('session', '')));

    for (const sessionKey of sessionKeys) {
        if (sessions[sessionKey].length > 0) {
            const option = document.createElement('option');
            option.value = sessionKey;

            const sessionId = sessionKey.replace('session', '');
            option.textContent = sessionNames[sessionId]?.name || `Session ${sessionId}`;
            sessionDropdown.appendChild(option);
        }
    }

    if (sessionDropdown.options.length === 0) {
        alert('No valid sessions found in this csTimer export.');
        return;
    }

    document.getElementById('sessionDropdownContainer').style.display = 'block';
    generateChartFromSession();
}

function generateChartFromSession() {
    const selectedSession = document.getElementById('sessionDropdown').value;
    const sessionData = sessions[selectedSession] || [];

    originalArray = sessionData
        .map((item) => extractSolveCentiseconds(item))
        .filter((time) => time === DNF_MARK || (Number.isFinite(time) && time > 0))
        .reverse(); // csTimer lists oldest first; everything below works newest first

    if (originalArray.length === 0) {
        setEmptyState('No valid solves found in this session.');
        return;
    }

    inputArray = [...originalArray];

    initializeSlider();
    updateChart();
}

async function fetchWCAData() {
    setDataSourceMode('wca');

    const wcaId = document.getElementById('wcaIdInput').value.toUpperCase().trim();
    const event = document.getElementById('event-type').value;
    if (!wcaId || !event) {
        alert('Please enter a valid WCA ID and event.');
        return;
    }

    const btn = document.querySelector('#wcaIdFetch button');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    const apiUrl = `/api/wca/${wcaId}/${event}?getsolves=true&dnf=1`;
    try {
        const data = await window.fetchJsonOrThrow(apiUrl, {
            errorContext: 'Could not load WCA solve data',
        });

        if (data.allResults && data.allResults.length > 0) {
            originalArray = data.allResults
                .filter((time) => time > 0 || time === DNF_MARK)
                .map((time) => (time > 0 ? Math.floor(time) : DNF_MARK));

            if (originalArray.length === 0) {
                setEmptyState('No valid solve data found for this WCA ID and event.');
                return;
            }

            inputArray = [...originalArray];
            initializeSlider();
            updateChart();
        } else {
            alert('No valid solve data found for this WCA ID and event.');
        }
    } catch (error) {
        console.error(error);
        window.showUserErrorPopup({
            title: 'Could not load WCA solve data',
            message: 'The GlobalCalc tool could not fetch WCA results right now.',
            error,
            reportTitle: 'GlobalCalc failed to load WCA data',
            reportContext: `Fetching solve data failed for ${wcaId} in event ${event}.`,
            dedupeKey: `global-calc-wca:${wcaId}:${event}`,
        });
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

function initializeSlider() {
    const slider = document.getElementById('elementSlider');

    if (originalArray.length === 0) {
        document.getElementById('sliderContainer').style.display = 'none';
        return;
    }

    const defaultSliderValue = Math.min(originalArray.length, 2000); // Default to 2000 or the total solves
    slider.max = originalArray.length;
    slider.min = 5;
    slider.value = defaultSliderValue;
    document.getElementById('sliderValue').textContent = defaultSliderValue;
    document.getElementById('sliderContainer').style.display = 'block';
}

function formatTimeForChart(seconds) {
    return Number(seconds).toFixed(1);
}

function formatSecondsToClock(seconds) {
    return CubingCore.formatTime(seconds, { dnf: '—' });
}

function setEmptyState(message) {
    document.getElementById('predictedGlobal').textContent = '—';
    document.getElementById('averageDeviation').textContent = '—';
    document.getElementById('bestSingle').textContent = '—';
    document.getElementById('bestAverage').textContent = '—';
    document.getElementById('probBetterSingle').textContent = '—';
    document.getElementById('probBetterAverage').textContent = '—';

    const topTimesList = document.getElementById('topTimesList');
    topTimesList.innerHTML = '';
    const listItem = document.createElement('li');
    listItem.textContent = message;
    topTimesList.appendChild(listItem);

    if (window.myChart) {
        window.myChart.destroy();
    }
}

function getEventWindow(eventId) {
    return CubingCore.requiredSolves(eventId);
}

// Average of one window of attempts (DNF = Infinity) under the event's WCA format.
function computeAttemptMetric(attemptTimes, eventId) {
    return CubingCore.averageForEvent(attemptTimes, eventId);
}

function computeBestRollingAverage(times, eventId) {
    return CubingCore.bestRollingAverage(times, eventId);
}

function getRecencyWeights(count, oldestWeight = 0.85) {
    if (count <= 0) {
        return [];
    }

    if (count === 1) {
        return [1];
    }

    const clampedOldestWeight = Math.max(0.5, Math.min(1, oldestWeight));
    const weightRange = 1 - clampedOldestWeight;

    return Array.from({ length: count }, (_, index) => {
        const relativeAge = index / (count - 1);
        return 1 - weightRange * relativeAge;
    });
}

function weightedAverage(values, weights) {
    if (!values.length) {
        return null;
    }

    if (!weights || weights.length !== values.length) {
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
        return null;
    }

    let weightedSum = 0;
    for (let i = 0; i < values.length; i++) {
        weightedSum += values[i] * weights[i];
    }

    return weightedSum / totalWeight;
}

function simulateNextAverageDistribution(times, eventId, weights, iterations = 12000) {
    const windowSize = getEventWindow(eventId);

    if (times.length < windowSize) {
        return [];
    }

    const sampleWeights =
        weights && weights.length === times.length ? weights : Array(times.length).fill(1);
    const totalWeight = sampleWeights.reduce((sum, weight) => sum + weight, 0);

    if (totalWeight <= 0) {
        return [];
    }

    const cumulativeWeights = [];
    let runningWeight = 0;
    for (let i = 0; i < sampleWeights.length; i++) {
        runningWeight += sampleWeights[i];
        cumulativeWeights.push(runningWeight);
    }

    const pickWeightedTime = () => {
        const randomTarget = Math.random() * totalWeight;
        for (let i = 0; i < cumulativeWeights.length; i++) {
            if (randomTarget <= cumulativeWeights[i]) {
                return times[i];
            }
        }
        return times[times.length - 1];
    };

    const simulations = [];
    for (let i = 0; i < iterations; i++) {
        const sample = [];
        for (let j = 0; j < windowSize; j++) {
            sample.push(pickWeightedTime());
        }
        simulations.push(computeAttemptMetric(sample, eventId));
    }

    return simulations;
}

function calculateAverageDeviation(times, weights) {
    if (times.length === 0) {
        return null;
    }

    const mean = weightedAverage(times, weights);
    if (mean === null) {
        return null;
    }

    if (!weights || weights.length !== times.length) {
        return times.reduce((sum, value) => sum + Math.abs(value - mean), 0) / times.length;
    }

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
        return null;
    }

    let weightedDeviation = 0;
    for (let i = 0; i < times.length; i++) {
        weightedDeviation += Math.abs(times[i] - mean) * weights[i];
    }

    return weightedDeviation / totalWeight;
}

function calculateStdDev(times, weights) {
    if (times.length === 0) {
        return null;
    }

    const mean = weightedAverage(times, weights);
    if (mean === null) {
        return null;
    }

    if (!weights || weights.length !== times.length) {
        const variance = times.reduce((sum, value) => sum + (value - mean) ** 2, 0) / times.length;
        return Math.sqrt(variance);
    }

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
        return null;
    }

    let weightedVariance = 0;
    for (let i = 0; i < times.length; i++) {
        weightedVariance += (times[i] - mean) ** 2 * weights[i];
    }

    return Math.sqrt(weightedVariance / totalWeight);
}

function normalCdf(x, mean, stdDev) {
    return CubingCore.normalCdf(x, mean, stdDev);
}

function formatProbability(probability) {
    if (!Number.isFinite(probability)) {
        return '—';
    }

    const percent = Math.max(0, Math.min(100, probability * 100));
    if (percent < 0.01 && percent > 0) {
        return '<0.01%';
    }
    return `${percent.toFixed(2)}%`;
}

// Function to update the chart with the current input data
function updateChart() {
    if (originalArray.length === 0) {
        setEmptyState('Load data to see your solve distribution.');
        return;
    }

    const sliderValue = Number(document.getElementById('elementSlider').value);
    document.getElementById('sliderValue').textContent = sliderValue;

    inputArray = originalArray.slice(0, sliderValue);
    const eventId = document.getElementById('event-type').value;

    if (inputArray.length === 0) {
        setEmptyState('No solves available for the selected range.');
        return;
    }

    // `attempts` is newest first and keeps DNFs (as Infinity) in their real position, so a rolling
    // average never glues together solves that were not actually consecutive. Statistics about the
    // distribution of times (frequency, spread, best single) only use the solved attempts.
    const attempts = inputArray.map((cs) => (cs === DNF_MARK ? Infinity : cs / 100));
    const recencyWeights = getRecencyWeights(attempts.length);
    const solved = [];
    const solvedWeights = [];
    attempts.forEach((time, i) => {
        if (Number.isFinite(time)) {
            solved.push(time);
            solvedWeights.push(recencyWeights[i]);
        }
    });
    if (solved.length === 0) {
        setEmptyState('No finished solves in the selected range (only DNFs).');
        return;
    }
    const sortedTimesInSeconds = [...solved].sort((a, b) => a - b);

    frequencyMap = {};
    sortedTimesInSeconds.forEach((time) => {
        const bucket = time.toFixed(1);
        frequencyMap[bucket] = (frequencyMap[bucket] || 0) + 1;
    });

    const sortedBuckets = Object.keys(frequencyMap)
        .map(Number)
        .sort((a, b) => a - b);
    const labels = sortedBuckets.map((time) => formatTimeForChart(time));
    const data = sortedBuckets.map((time) => frequencyMap[time.toFixed(1)]);

    const topTimes = Object.entries(frequencyMap)
        .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
        .slice(0, 5);

    const topTimesList = document.getElementById('topTimesList');
    topTimesList.innerHTML = '';
    topTimes.forEach(([time, freq]) => {
        const listItem = document.createElement('li');
        listItem.textContent = `Time ${formatSecondsToClock(Number(time))}: ${freq} solves`;
        topTimesList.appendChild(listItem);
    });

    if (topTimes.length === 0) {
        const listItem = document.createElement('li');
        listItem.textContent = 'No frequency data available.';
        topTimesList.appendChild(listItem);
    }

    const globalTime = document.getElementById('predictedGlobal');
    const averageDeviation = calculateAverageDeviation(solved, solvedWeights);
    const bestSingle = Math.min(...solved);
    const bestAverage = computeBestRollingAverage(attempts, eventId);
    const simulatedAverages = simulateNextAverageDistribution(
        attempts,
        eventId,
        recencyWeights,
    );

    let predictedGlobal = null;
    let probabilityBetterAverage = null;
    if (simulatedAverages.length > 0) {
        // The prediction is the typical finished average; simulated DNF averages still count against
        // "probability of beating your best" below because the denominator is every simulation.
        predictedGlobal = CubingCore.meanOfFinite(simulatedAverages);
        if (bestAverage !== null) {
            const betterCount = simulatedAverages.filter((value) => value < bestAverage).length;
            probabilityBetterAverage = betterCount / simulatedAverages.length;
        }
    }

    const stdDev = calculateStdDev(solved, solvedWeights);
    const mean = weightedAverage(solved, solvedWeights);
    const probabilityBetterSingle = normalCdf(bestSingle, mean, stdDev);

    globalTime.textContent =
        predictedGlobal === null
            ? 'Need more solves for prediction'
            : formatSecondsToClock(predictedGlobal);

    document.getElementById('averageDeviation').textContent =
        averageDeviation === null ? '—' : '±' + formatSecondsToClock(averageDeviation);
    document.getElementById('bestSingle').textContent = formatSecondsToClock(bestSingle);
    document.getElementById('bestAverage').textContent =
        bestAverage !== null
            ? formatSecondsToClock(bestAverage)
            : attempts.length >= getEventWindow(eventId)
              ? 'No finished average yet (too many DNFs)'
              : `Need ${getEventWindow(eventId)} solves`;
    document.getElementById('probBetterSingle').textContent =
        formatProbability(probabilityBetterSingle);
    document.getElementById('probBetterAverage').textContent =
        formatProbability(probabilityBetterAverage);

    if (window.myChart) {
        window.myChart.destroy();
    }

    const rootStyles = getComputedStyle(document.documentElement);
    const barColor = rootStyles.getPropertyValue('--button-background').trim();
    const textColor = rootStyles.getPropertyValue('--main-text').trim();

    const ctx = document.getElementById('frequencyChart').getContext('2d');
    window.myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Frequency',
                    data: data,
                    backgroundColor: barColor,
                    borderColor: barColor,
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Solve Times (seconds)',
                        color: textColor,
                    },
                    ticks: {
                        color: textColor,
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12,
                    },
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency',
                        color: textColor,
                    },
                    ticks: {
                        color: textColor,
                        precision: 0,
                    },
                    beginAtZero: true,
                },
            },
            plugins: {
                legend: {
                    labels: {
                        color: textColor,
                    },
                },
            },
        },
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    const event = params.get('event');

    if (source === 'average') {
        setDataSourceMode('average');
        if (event) {
            const eventSelect = document.getElementById('averageEventType');
            if (eventSelect) {
                eventSelect.value = event;
            }
        }
        loadAverageToolData();
    } else {
        setDataSourceMode('cstimer');
    }
});

document.getElementById('averageEventType').addEventListener('change', loadAverageToolData);
document.getElementById('sourceAverage').addEventListener('click', loadAverageToolData);

function loadAverageToolData() {
    setDataSourceMode('average');

    const event = document.getElementById('averageEventType').value;
    if (!event) {
        alert('Please select an event.');
        return;
    }

    const eventType = document.getElementById('event-type');
    if (eventType) {
        eventType.value = event;
    }

    // Oldest first: completed averages in the order they were saved, then the solves of the average in progress.
    const toCs = (seconds) => (Number.isFinite(seconds) ? Math.round(seconds * 100) : DNF_MARK);
    const allTimes = [];
    for (const avg of CubingCore.parseSavedAverages(localStorage.getItem('ct_averages'))) {
        if (avg.event === event) allTimes.push(...avg.solves.map(toCs));
    }
    allTimes.push(...CubingCore.parseIncompleteSolves(localStorage.getItem(`ct_incomplete_${event}`)).map(toCs));
    allTimes.reverse(); // the rest of this tool works newest first (the slider keeps the most recent N)

    if (allTimes.length === 0) {
        setEmptyState('No averages found for this event in the Average Calculator.');
        return;
    }

    originalArray = allTimes.filter((cs) => cs === DNF_MARK || cs > 0);
    inputArray = [...originalArray];
    initializeSlider();
    updateChart();
}
