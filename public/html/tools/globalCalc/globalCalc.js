let inputArray = [];
let originalArray = [];
let frequencyMap = {};
let sessions = {};
let sessionNames = {};
let currentDataSourceMode = 'cstimer';

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
    slider.min = 1;
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

    const topTimesList = document.getElementById('topTimesList');
    topTimesList.innerHTML = '';
    const listItem = document.createElement('li');
    listItem.textContent = message;
    topTimesList.appendChild(listItem);

    if (window.myChart) {
        window.myChart.destroy();
    }
}

function computePredictedGlobal(topTimes) {
    const sortedTimes = topTimes.map(([time]) => Number(time)).sort((a, b) => a - b);

    if (sortedTimes.length >= 5) {
        const middleThree = sortedTimes.slice(1, 4);
        return middleThree.reduce((sum, value) => sum + value, 0) / middleThree.length;
    }

    if (sortedTimes.length >= 3) {
        return sortedTimes.reduce((sum, value) => sum + value, 0) / sortedTimes.length;
    }

    return null;
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

    if (inputArray.length === 0) {
        setEmptyState('No solves available for the selected range.');
        return;
    }

    inputArray.sort((a, b) => a - b);
    const timeInSeconds = inputArray.map((centiseconds) => centiseconds / 100);

    frequencyMap = {};
    timeInSeconds.forEach((time) => {
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
    const predictedGlobal = computePredictedGlobal(topTimes);
    globalTime.textContent =
        predictedGlobal === null
            ? 'Need at least 3 frequency buckets'
            : formatSecondsToClock(predictedGlobal);

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
