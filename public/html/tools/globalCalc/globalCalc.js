let inputArray = [];
let originalArray = [];
let frequencyMap = {};
let sessions = {};
let sessionNames = {};
let currentDataSourceMode = 'cstimer';
const meanEvents = new Set(['666', '777', '444bf', '555bf', '333bf']);

function setDataSourceMode(mode) {
    currentDataSourceMode = mode === 'wca' ? 'wca' : 'cstimer';

    const fileUpload = document.getElementById('fileUpload');
    const wcaIdFetch = document.getElementById('wcaIdFetch');
    const sourceCsTimer = document.getElementById('sourceCsTimer');
    const sourceWca = document.getElementById('sourceWca');

    if (!fileUpload || !wcaIdFetch || !sourceCsTimer || !sourceWca) {
        return;
    }

    const showCsTimer = currentDataSourceMode === 'cstimer';
    fileUpload.style.display = showCsTimer ? 'flex' : 'none';
    wcaIdFetch.style.display = showCsTimer ? 'none' : 'flex';

    sourceCsTimer.classList.toggle('active', showCsTimer);
    sourceWca.classList.toggle('active', !showCsTimer);
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

function extractSolveCentiseconds(solve) {
    const baseTime = Number(solve?.[0]?.[0]);
    const penaltyTime = Number(solve?.[0]?.[1] || 0);

    if (!Number.isFinite(baseTime) || baseTime < 0) {
        return null;
    }

    const totalMilliseconds = baseTime + Math.max(0, penaltyTime);
    return Math.round(totalMilliseconds / 10);
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
        .filter((time) => Number.isFinite(time) && time > 0)
        .reverse(); // Convert milliseconds to centiseconds

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

    const apiUrl = `/api/wca/${wcaId}/${event}?getsolves=true`;
    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.allResults && data.allResults.length > 0) {
            originalArray = data.allResults
                .filter((time) => time > 0)
                .map((time) => Math.floor(time));

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

        alert('Error fetching WCA data. Please check your input and try again.');
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
    if (!Number.isFinite(seconds)) {
        return '—';
    }

    if (seconds < 60) {
        return seconds.toFixed(2);
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(2);
    return `${minutes}:${remainingSeconds.padStart(5, '0')}`;
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
    return meanEvents.has(eventId) ? 3 : 5;
}

function computeAttemptMetric(attemptTimes, eventId) {
    if (meanEvents.has(eventId)) {
        return attemptTimes.reduce((sum, value) => sum + value, 0) / attemptTimes.length;
    }

    const sorted = [...attemptTimes].sort((a, b) => a - b);
    const middle = sorted.slice(1, 4);
    return middle.reduce((sum, value) => sum + value, 0) / middle.length;
}

function computeBestRollingAverage(times, eventId) {
    const windowSize = getEventWindow(eventId);

    if (times.length < windowSize) {
        return null;
    }

    let best = Infinity;
    for (let i = 0; i <= times.length - windowSize; i++) {
        const window = times.slice(i, i + windowSize);
        const value = computeAttemptMetric(window, eventId);
        if (value < best) {
            best = value;
        }
    }

    return Number.isFinite(best) ? best : null;
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

function erfApprox(x) {
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * absX);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
}

function normalCdf(x, mean, stdDev) {
    if (!Number.isFinite(stdDev) || stdDev <= 0) {
        return x > mean ? 1 : 0;
    }

    const z = (x - mean) / (stdDev * Math.sqrt(2));
    return 0.5 * (1 + erfApprox(z));
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

    const chronologicalTimesInSeconds = inputArray.map((centiseconds) => centiseconds / 100);
    const sortedTimesInSeconds = [...chronologicalTimesInSeconds].sort((a, b) => a - b);
    const recencyWeights = getRecencyWeights(chronologicalTimesInSeconds.length);

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
    const averageDeviation = calculateAverageDeviation(chronologicalTimesInSeconds, recencyWeights);
    const bestSingle = Math.min(...chronologicalTimesInSeconds);
    const bestAverage = computeBestRollingAverage(chronologicalTimesInSeconds, eventId);
    const simulatedAverages = simulateNextAverageDistribution(
        chronologicalTimesInSeconds,
        eventId,
        recencyWeights,
    );

    let predictedGlobal = null;
    let probabilityBetterAverage = null;
    if (simulatedAverages.length > 0) {
        predictedGlobal =
            simulatedAverages.reduce((sum, value) => sum + value, 0) / simulatedAverages.length;
        if (bestAverage !== null) {
            const betterCount = simulatedAverages.filter((value) => value < bestAverage).length;
            probabilityBetterAverage = betterCount / simulatedAverages.length;
        }
    }

    const stdDev = calculateStdDev(chronologicalTimesInSeconds, recencyWeights);
    const mean = weightedAverage(chronologicalTimesInSeconds, recencyWeights);
    const probabilityBetterSingle = normalCdf(bestSingle, mean, stdDev);

    globalTime.textContent =
        predictedGlobal === null
            ? 'Need more solves for prediction'
            : formatSecondsToClock(predictedGlobal);

    document.getElementById('averageDeviation').textContent =
        averageDeviation === null ? '—' : '±' + formatSecondsToClock(averageDeviation);
    document.getElementById('bestSingle').textContent = formatSecondsToClock(bestSingle);
    document.getElementById('bestAverage').textContent =
        bestAverage === null
            ? `Need ${getEventWindow(eventId)} solves`
            : formatSecondsToClock(bestAverage);
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
    setDataSourceMode('cstimer');
});
