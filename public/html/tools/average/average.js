let times = [];
let allResults = [];
let averageTags = [];

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

// Function to update URL with form data (including event times)
function updateURLWithFormData() {
    const params = new URLSearchParams();

    // Get the main form values
    const pickupTime = document.getElementById('pickup').value;
    const solvecount = document.getElementById('solvecount').value;
    const competitor1Id = document.getElementById('c1-wca').value;
    const competitor2Id = document.getElementById('c2-wca').value;

    // Add main form values to the query parameters
    if (pickupTime) params.set('pickup', pickupTime);
    if (solvecount) params.set('solvecount', solvecount);
    if (competitor1Id) params.set('c1', competitor1Id);
    if (competitor2Id) params.set('c2', competitor2Id);
    if (competitor1Name) params.set('c1name', competitor1Name);
    if (competitor2Name) params.set('c2name', competitor2Name);

    // Add event times for Competitor 1
    events.forEach((event) => {
        const time = document.getElementById(`c1-${event}`).value;
        if (time) params.set(`c1-${event}`, time);
    });

    // Add event times for Competitor 2
    events.forEach((event) => {
        const time = document.getElementById(`c2-${event}`).value;
        if (time) params.set(`c2-${event}`, time);
    });

    // Update the URL without reloading the page
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
}

// Function to populate form inputs from URL parameters
function populateFormFromURL() {
    const params = new URLSearchParams(window.location.search);

    // Populate main form values
    if (params.has('pickup')) document.getElementById('pickup').value = params.get('pickup');
    if (params.has('solvecount'))
        document.getElementById('solvecount').value = params.get('solvecount');
    if (params.has('c1')) document.getElementById('c1-wca').value = params.get('c1');
    if (params.has('c2')) document.getElementById('c2-wca').value = params.get('c2');
    if (params.has('c1name')) competitor1Name = params.get('c1name');
    if (params.has('c2name')) competitor2Name = params.get('c2name');

    document.getElementById('c1-name').textContent = competitor1Name;
    document.getElementById('c2-name').textContent = competitor2Name;

    // Populate event times for Competitor 1
    events.forEach((event) => {
        if (params.has(`c1-${event}`)) {
            document.getElementById(`c1-${event}`).value = params.get(`c1-${event}`);
        }
    });

    // Populate event times for Competitor 2
    events.forEach((event) => {
        if (params.has(`c2-${event}`)) {
            document.getElementById(`c2-${event}`).value = params.get(`c2-${event}`);
        }
    });
}

// Function to add time to the sorted list
async function addTime() {
    const wcaId = document.getElementById('wca').value.toUpperCase().trim();
    const event = document.getElementById('event-type').value;

    const timeInput = document.getElementById('timeInput');
    const timeValue = parseFloat(timeInput.value);

    if (!isNaN(timeValue)) {
        if (timeValue > 0) {
            times.push(timeValue);
        } else if (timeValue === 0) {
            times.push(Infinity);
        }
        times.sort((a, b) => a - b);
        if (times.length === 6) {
            resetTimes(); // Reset the times for a new round
            addTime();
            return;
        }
        await updateTimeList(wcaId, event);
        calculateAverage();

        if (times.length === 5) {
            saveTag(); // Save the average tag after the 5th time
        }
    }

    timeInput.value = ''; // Clear input after adding
    timeInput.focus(); // Refocus on the input field
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
            listItem.textContent = `${time.toFixed(2)} (PR${prRank})`;
        } else {
            listItem.textContent = `${time.toFixed(2)}`;
        }

        listItem.onclick = () => removeTime(i);
        timeList.appendChild(listItem);
    }
}

// Function to fetch personal rank for a given time from WCA API
async function getPersonalRank(wcaId, event, time, fetchSingles) {
    try {
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

    times.sort((a, b) => a - b);

    if (times.length === 2) {
        result.target = 3 * target - times[0] - times[1];
    } else if (times.length === 3) {
        result.target = 3 * target - times[1] - times[2];
        result.average = (times[0] + times[1] + times[2]) / 3;
    } else if (times.length === 4) {
        result.bpa = (times[0] + times[1] + times[2]) / 3;
        result.wpa = (times[1] + times[2] + times[3]) / 3;
        result.target = 3 * target - times[1] - times[2];
    } else if (times.length === 5) {
        let middleTimes = times.slice(1, -1); // Remove fastest and slowest
        result.average = middleTimes.reduce((a, b) => a + b, 0) / 3;
    }

    displayResult(result, target);
}

// Function to display the results with personal rank for the average
async function displayResult(result, target) {
    const resultDiv = document.getElementById('result');
    let message = '';

    if (result.target !== undefined) {
        if (result.target < 0 || (result.bpa !== undefined && result.bpa > target)) {
            message += `<span class="warning">Target cannot be reached.</span><br>`;
        } else {
            message += `Time for target: ${result.target.toFixed(2)}<br>`;
        }
    }

    const wcaId = document.getElementById('wca').value.toUpperCase().trim();
    const event = document.getElementById('event-type').value;

    if (result.average !== undefined) {
        if (/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || event === 'ccc') {
            const prRank = await getPersonalRank(wcaId, event, result.average, false);
            if (times.length === 3) {
                message += `Mean of 3: ${result.average.toFixed(2)} (PR${prRank})<br>`;
            } else {
                message += `Average of 5: ${result.average.toFixed(2)} (PR${prRank})<br>`;
            }
        } else {
            if (times.length === 3) {
                message += `Mean of 3: ${result.average.toFixed(2)}<br>`;
            } else {
                message += `Average of 5: ${result.average.toFixed(2)}<br>`;
            }
        }
    }

    if (result.bpa !== undefined) {
        if (/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || event === 'ccc') {
            const prRank = await getPersonalRank(wcaId, event, result.bpa, false);
            message += `Best Possible Average (BPA): ${result.bpa.toFixed(2)} (PR${prRank})<br>`;
        } else {
            message += `Best Possible Average (BPA): ${result.bpa.toFixed(2)}`;
        }
    }

    if (result.wpa !== undefined) {
        if (/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || event === 'ccc') {
            const prRank = await getPersonalRank(wcaId, event, result.wpa, false);
            message += `Worst Possible Average (WPA): ${result.wpa.toFixed(2)} (PR${prRank})<br>`;
        } else {
            message += `Worst Possible Average (WPA): ${result.wpa.toFixed(2)}<br>`;
        }
    }

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
        const currentAverage = (times.slice(1, -1).reduce((a, b) => a + b, 0) / 3).toFixed(2);
        const timestamp = new Date().toLocaleString();
        const tag = { average: currentAverage, times: [...times], date: timestamp };

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
            tagElement.textContent = `${tag.average} (${tag.date})`;
            tagElement.onclick = () => showTagDetails(averageTags.length - 1 - index);
            tagContainer.appendChild(tagElement);
        });
}

// Show tag details in a popup
function showTagDetails(index) {
    const tag = averageTags[index];
    const popup = document.getElementById('popup');
    const popupContent = document.getElementById('popupContent');
    popupContent.innerHTML = `
        <h3>Average: ${tag.average}</h3>
        <p>Times: ${tag.times.join(', ')}</p>
        <p>Created: ${tag.date}</p>
        <button onclick="closePopup()">Close</button>
        <button onclick="confirmDelete(${index})">Delete</button>
    `;
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
