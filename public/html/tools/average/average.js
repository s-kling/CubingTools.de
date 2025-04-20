let times = [];
let allResults = [];
let averageTags = [];
let wcaId = '';

// Load saved tags from cookies
window.onload = function () {
    loadTagsFromCookies();
    displayTags();
};

const targetInput = document.getElementById('target');
const timeInput = document.getElementById('timeInput');

targetInput.addEventListener('input', () => {
    formatInputField(targetInput);
    calculateAverage();
});

timeInput.addEventListener('input', () => {
    formatInputField(timeInput);
});

function formatInputField(input) {
    var currentValue = input.value;

    if (input.value.includes('DNF')) {
        input.value = '0.00';
    } else if (/[a-zA-Z]/.test(currentValue)) {
        input.value = 'DNF';
        return;
    }

    var valDigitsOnly = currentValue.replace(/[^0-9]/g, '');

    while (valDigitsOnly.startsWith('0')) {
        valDigitsOnly = valDigitsOnly.substring(1, valDigitsOnly.length);
    }

    if (valDigitsOnly.length < 3) {
        while (valDigitsOnly.length < 3) {
            valDigitsOnly = '0' + valDigitsOnly;
        }
    }

    var currLength = valDigitsOnly.length;
    var modified = '';
    if (currLength <= 4) {
        modified =
            valDigitsOnly.slice(0, currLength - 2) + '.' + valDigitsOnly.slice(currLength - 2);

        if (modified == '0.00') {
            modified = '';
        }
    } else if (currLength > 4) {
        modified =
            valDigitsOnly.slice(0, currLength - 2) + '.' + valDigitsOnly.slice(currLength - 2);
        modified =
            modified.slice(0, modified.length - 5) + ':' + modified.slice(modified.length - 5);
    }
    input.value = modified;
}

async function addTime() {
    const wcaId = document.getElementById('wca').value.toUpperCase().trim();
    const event = document.getElementById('event-type').value;
    const timeInput = document.getElementById('timeInput');
    const inputValue = timeInput.value.trim();

    if (inputValue.toUpperCase() === 'DNF') {
        times.push('DNF');
    } else {
        const timeValue = parseFloat(inputValue);
        if (!isNaN(timeValue)) {
            times.push(timeValue);
        } else {
            // Invalid entry, do not add
            return;
        }
    }

    if (times.length === 6) {
        resetTimes();
        addTime(); // Start fresh
        return;
    }

    await updateTimeList(wcaId, event);
    calculateAverage();

    if (times.length === 5) {
        saveTag();
    }

    timeInput.value = '';
    timeInput.focus();
}

// Function to update the time list display with personal ranks
async function updateTimeList(wcaId, event) {
    const timeList = document.getElementById('timeList');
    timeList.innerHTML = '';

    for (let i = 0; i < times.length; i++) {
        const time = times[i];
        const listItem = document.createElement('li');

        if (/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || event === 'ccc') {
            const prRank = await getPersonalRank(wcaId, event, time, true);
            listItem.textContent = `${time} (PR${prRank})`;
        } else {
            listItem.textContent = time;
        }

        listItem.onclick = () => removeTime(i);
        timeList.appendChild(listItem);
    }
}

// Function to fetch personal rank for a given time from WCA API
async function getPersonalRank(wcaId, event, time, fetchSingles) {
    const wcaIdInputValue = document.getElementById('wca').value.toUpperCase().trim();

    try {
        if (!allResults.length || wcaIdInputValue !== wcaId) {
            wcaId = wcaIdInputValue;
            if (fetchSingles) {
                // Only fetch the solves on the first entry
                if (time == times[0]) {
                    const response = await fetch(`/api/wca/${wcaId}/${event}?getsolves=true`);
                    const data = await response.json();
                    allResults = data.allResults.filter((result) => result > 0); // Only consider completed solve times
                }
            } else {
                // Only fetch the solves on the first entry
                const response = await fetch(`/api/wca/${wcaId}/${event}?getaverages=true`);
                const data = await response.json();
                allResults = data.allAverages.filter((result) => result > 0);
            }
        }

        // Sort the solves in ascending order
        allResults.sort((a, b) => a - b);
        let rank = 1;

        // Count how many official solves are better than the entered time
        for (const officialTime of allResults) {
            if (time < officialTime / 100) {
                // API times are in milliseconds
                break;
            }
            rank++;
        }

        // Add the new time to allResults so that the previous times get an updated rank
        allResults.push(time);
        return rank;
    } catch (error) {
        console.error('Error fetching WCA data:', error);
        alert(
            'Something went wrong! If this issue persists please contact us as soon as possible!'
        );
        return '';
    }
}

document.getElementById('wca').addEventListener('input', async function () {
    const wcaInput = this.value.toUpperCase().trim();
    if (wcaInput.length === 10) {
        const event = document.getElementById('event-type').value;
        await updateTimeList(wcaInput, event);
    }
});

function removeTime(index) {
    const i = allResults.indexOf(times[index]);
    if (i > -1) {
        allResults.splice(i, 1);
    }
    times.splice(index, 1);
    updateTimeList();
    calculateAverage();
}

// Function to calculate various averages or targets
function calculateAverage() {
    const targetInput = document.getElementById('target');
    const target = parseFloat(targetInput.value);
    let result = {};

    // Exclude DNFs for calculations
    const validTimes = times.filter((t) => t !== 'DNF').sort((a, b) => a - b);

    if (times.length === 2) {
        if (validTimes.length === 2) {
            result.target = 3 * target - validTimes[0] - validTimes[1];
        }
    } else if (times.length === 3) {
        if (validTimes.length === 3) {
            result.target = 3 * target - validTimes[1] - validTimes[2];
            result.average = (validTimes[0] + validTimes[1] + validTimes[2]) / 3;
        }
    } else if (times.length === 4) {
        if (validTimes.length >= 3) {
            result.bpa = (validTimes[0] + validTimes[1] + validTimes[2]) / 3;
            result.wpa = (validTimes[1] + validTimes[2] + validTimes[3]) / 3;
            result.target = 3 * target - validTimes[1] - validTimes[2];
        }
    } else if (times.length === 5) {
        const dnfCount = times.filter((t) => t === 'DNF').length;
        if (dnfCount >= 2) {
            result.average = 'DNF';
        } else {
            const validSorted = times
                .map((t) => (t === 'DNF' ? Infinity : t))
                .sort((a, b) => a - b);
            const middleThree = validSorted.slice(1, 4);
            if (middleThree.includes(Infinity)) {
                result.average = 'DNF';
            } else {
                result.average = (middleThree[0] + middleThree[1] + middleThree[2]) / 3;
            }
        }
    }

    displayResult(result, target);
}

// Function to display the results with personal rank for the average
async function displayResult(result, target) {
    const resultDiv = document.getElementById('result');
    const wcaId = document.getElementById('wca').value.toUpperCase().trim();
    const event = document.getElementById('event-type').value;
    let message = '<div class="result-card">';

    // Target Time
    if (!isNaN(result.target)) {
        if (result.target < 0 || (result.bpa !== undefined && result.bpa > target)) {
            message += `<p class="result-line warning">⚠️ Target cannot be reached.</p>`;
        } else {
            message += `<p class="result-line">🎯 <strong>Time for target:</strong> ${result.target.toFixed(
                2
            )}</p>`;
        }
    }

    // Average
    if (result.average !== undefined) {
        const isValidWCA = /\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || event === 'ccc';
        const averageLabel = times.length === 3 ? 'Mean of 3' : 'Average of 5';
        let averageLine = `<p class="result-line">📊 <strong>${averageLabel}:</strong> ${
            result.average === 'DNF' ? 'DNF' : result.average.toFixed(2)
        }`;

        if (result.average !== 'DNF' && isValidWCA) {
            const prRank = await getPersonalRank(wcaId, event, result.average, false);
            averageLine += ` <span class="rank">(PR${prRank})</span>`;
        }
        averageLine += '</p>';
        message += averageLine;
    }

    // BPA
    if (result.bpa !== undefined) {
        const isValidWCA = /\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || event === 'ccc';
        let bpaLine = `<p class="result-line">💡 <strong>BPA:</strong> ${result.bpa.toFixed(2)}`;
        if (isValidWCA) {
            const prRank = await getPersonalRank(wcaId, event, result.bpa, false);
            bpaLine += ` <span class="rank">(PR${prRank})</span>`;
        }
        bpaLine += '</p>';
        message += bpaLine;
    }

    // WPA
    if (result.wpa !== undefined) {
        const isValidWCA = /\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || event === 'ccc';
        let wpaLine = `<p class="result-line">🌀 <strong>WPA:</strong> ${result.wpa.toFixed(2)}`;
        if (isValidWCA) {
            const prRank = await getPersonalRank(wcaId, event, result.wpa, false);
            wpaLine += ` <span class="rank">(PR${prRank})</span>`;
        }
        wpaLine += '</p>';
        message += wpaLine;
    }

    message += '</div>';
    resultDiv.innerHTML = message;
}

// Function to reset the times after the 5th entry
function resetTimes() {
    times = [];
    updateTimeList('', ''); // Reset the list
    document.getElementById('result').innerHTML = ''; // Clear the result section
}

// Function to save a new average tag after the 5th time
function saveTag() {
    if (localStorage.getItem('cookies_accepted') === 'true') {
        const dnfCount = times.filter((t) => t === 'DNF').length;
        let currentAverage = 'DNF';
        if (dnfCount < 2) {
            const sorted = times.map((t) => (t === 'DNF' ? Infinity : t)).sort((a, b) => a - b);
            const middle = sorted.slice(1, 4);
            if (!middle.includes(Infinity)) {
                currentAverage = (middle[0] + middle[1] + middle[2]) / 3;
                currentAverage = currentAverage.toFixed(2);
            }
        }

        const timestamp = new Date().toLocaleString();
        const eventType = document.getElementById('event-type').value;
        const target = document.getElementById('target').value;

        const tag = {
            average: currentAverage,
            times: [...times],
            date: timestamp,
            event: eventType,
            target: target,
        };

        averageTags.push(tag);
        saveTagsToCookies();
        displayTags();
    }
}

// Save tags to cookies
function saveTagsToCookies() {
    const d = new Date();
    d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);

    document.cookie = `averageTags=${JSON.stringify(
        averageTags
    )}; expires=${d.toUTCString()}; path=/;`;
}

// Load tags from cookies
function loadTagsFromCookies() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.split('=');
        if (name.trim() === 'averageTags') {
            averageTags = JSON.parse(decodeURIComponent(value));
        }
    }
}

// Display tags with their averages in reverse order
function displayTags() {
    const tagContainer = document.getElementById('tagContainer');
    tagContainer.innerHTML = '';

    averageTags
        .slice()
        .reverse()
        .forEach((tag, index) => {
            const tagElement = document.createElement('div');
            tagElement.classList.add('tag');
            tagElement.textContent = `${tag.average}`;

            // Determine if the target was reached
            const targetReached = parseFloat(tag.average) <= parseFloat(tag.target);

            // Apply gradient background
            tagElement.style.background = `linear-gradient(to left, ${
                targetReached ? 'green' : 'red'
            } 25%, var(--input-background) 50%)`;

            tagElement.onclick = () => showTagDetails(averageTags.length - 1 - index);
            tagContainer.appendChild(tagElement);
        });
}

// Show tag details in a popup
function showTagDetails(index) {
    const tag = averageTags[index];
    const popup = document.getElementById('popup');
    const popupContent = document.getElementById('popupContent');
    const targetReached = parseFloat(tag.average) <= parseFloat(tag.target);

    popupContent.innerHTML = `
        <h3>Average: ${tag.average}</h3>
        <p>Times: ${tag.times.join(', ')}</p>
        <p>Event: ${tag.event}</p>
        <p>Target: ${tag.target}</p>
        <p>Created: ${tag.date}</p>
        <button onclick="closePopup()">Close</button>
        <button onclick="confirmDelete(${index})">Delete</button>
    `;

    popupContent.style.background = `linear-gradient(to bottom, ${
        targetReached ? 'green' : 'red'
    } 0.05%, var(--input-background) 5%)`;

    popup.style.display = 'flex';
}

// Confirm and delete tag
function confirmDelete(index) {
    if (confirm('Are you sure you want to delete this tag?')) {
        averageTags.splice(index, 1);
        saveTagsToCookies();
        displayTags();
        closePopup();
    }
}

// Close popup
function closePopup() {
    document.getElementById('popup').style.display = 'none';
}

// Event listeners
document.getElementById('addButton').addEventListener('click', addTime);
document.getElementById('timeInput').addEventListener('keypress', function (event) {
    if (event.key === 'Enter') {
        addTime();
    }
});
