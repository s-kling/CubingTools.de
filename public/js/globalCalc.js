let inputArray = [];
let originalArray = [];
let frequencyMap = {};
let sessions = {};
let sessionNames = {};

function loadCSTimerFile(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            sessions = data;
            sessionNames = JSON.parse(data.properties.sessionData); // Extract session names
            populateSessionDropdown();
        } catch (error) {
            alert("Invalid cstimer file format.");
        }
    };

    reader.readAsText(file);
}

function populateSessionDropdown() {
    const sessionDropdown = document.getElementById('sessionDropdown');
    sessionDropdown.innerHTML = ''; // Clear previous options

    for (const sessionKey in sessions) {
        if (sessions[sessionKey].length > 0 && sessionKey !== "properties") {
            const option = document.createElement('option');
            option.value = sessionKey;

            const sessionId = sessionKey.replace("session", "");
            option.textContent = sessionNames[sessionId]?.name || `Session ${sessionId}`;
            sessionDropdown.appendChild(option);
        }
    }

    document.getElementById('sessionDropdownContainer').style.display = 'block';
    generateChartFromSession();
}

function generateChartFromSession() {
    const selectedSession = document.getElementById('sessionDropdown').value;
    const sessionData = sessions[selectedSession];

    // Process session data to handle penalties and DNFs
    originalArray = sessionData.map(item => Math.floor((item[0][0] < 0) ? Infinity : (Math.floor(item[0][0] + item[0][1]) / 100))).reverse(); // Convert milliseconds to centiseconds
    inputArray = [...originalArray];

    initializeSlider();
    updateChart();
}

async function fetchWCAData() {
    const wcaId = document.getElementById('wcaIdInput').value.toUpperCase().trim();
    const event = document.getElementById('event-type').value;
    if (!wcaId || !event) {
        alert("Please a valid WCA ID.");
        return;
    }

    const apiUrl = `/api/wca/${wcaId}/${event}?getsolves=true`;
    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.allResults && data.allResults.length > 0) {
            originalArray = data.allResults
                .filter(time => time > 0)
                .map(time => Math.floor(time / 10));
            inputArray = [...originalArray];
            initializeSlider();
            updateChart();
        } else {
            alert("No valid solve data found for this WCA ID and event.");
        }
    } catch (error) {
        console.error(error);

        alert("Error fetching WCA data. Please check your input and try again.");
    }
}

function initializeSlider() {
    const slider = document.getElementById('elementSlider');
    const defaultSliderValue = Math.min(originalArray.length, 2000); // Default to 2000 or the total solves
    slider.max = originalArray.length;
    slider.value = defaultSliderValue;
    document.getElementById('sliderValue').textContent = defaultSliderValue;
    document.getElementById('sliderContainer').style.display = 'block';
}

// Helper function to format times for chart labels (one decimal place)
function formatTimeForChart(milliseconds) {
    return (milliseconds / 1000).toFixed(1);
}

// Helper function to format times for the top 5 list (minutes:seconds.milliseconds)
function formatTimeForTop5(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = ((milliseconds % 60000) / 1000).toFixed(1);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Function to update the chart with the current input data
function updateChart() {
    const sliderValue = document.getElementById('elementSlider').value;
    document.getElementById('sliderValue').textContent = sliderValue;

    // Slice the input array based on the slider value
    inputArray = originalArray.slice(0, sliderValue);

    // Sort times as numbers and round them to 1 decimal place
    inputArray.sort((a, b) => a - b);  // Sort numerically (correct order)
    inputArray = inputArray.map(num => num / 10);

    // Calculate frequency data with 1 decimal accuracy (numeric values)
    frequencyMap = {};
    inputArray.forEach(num => {
        frequencyMap[num.toFixed(1)] = (frequencyMap[num.toFixed(1)] || 0) + 1;  // Map time to frequency
    });

    const labels = Object.keys(frequencyMap).map(time => formatTimeForChart(time * 1000)); // Convert back to ms
    const data = Object.values(frequencyMap);

    // Calculate top 5 Times based on frequency
    const topTimes = Object.entries(frequencyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const topTimesList = document.getElementById('topTimesList');
    topTimesList.innerHTML = '';
    topTimes.forEach(([num, freq]) => {
        const listItem = document.createElement('li');
        listItem.textContent = `Time ${formatTimeForTop5(num * 1000)}: ${freq} times`;
        topTimesList.appendChild(listItem);
    });

    const globalTime = document.getElementById('predictedGlobal');
    globalTime.innerHTML = '';
    let times = [];
    for (let i = 0; i < topTimes.length; i++) {
        times.push(parseFloat(topTimes[i][0]));
    }
    times.sort((a, b) => a - b);
    let middleTimes = times.slice(1, -1); // Remove fastest and slowest
    let average = middleTimes.reduce((a, b) => a + b, 0) / 3;
    globalTime.innerText = Math.round(average * 100) / 100;

    // Destroy the old chart if it exists
    if (window.myChart) {
        window.myChart.destroy();
    }

    // Create the new chart
    const ctx = document.getElementById('frequencyChart').getContext('2d');
    window.myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Frequency',
                    data: data,
                    backgroundColor: 'rgba(80, 120, 162, 1)',
                    borderColor: 'rgba(80, 120, 162, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Solve Times (seconds)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}