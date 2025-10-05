const relaySelect = document.getElementById('relay');
const eventOptions = {
    miniguild: [
        '2x2',
        '3x3',
        '4x4',
        '5x5',
        'OH',
        'Pyraminx',
        'Clock',
        'Skewb',
        'Megaminx',
        'Square-1',
    ],
    guildford: [
        '2x2',
        '3x3',
        '4x4',
        '5x5',
        '6x6',
        '7x7',
        'OH',
        'Pyraminx',
        'Clock',
        'Skewb',
        'Megaminx',
        'Square-1',
    ],
    miniguildfto: [
        '2x2',
        '3x3',
        '4x4',
        '5x5',
        'OH',
        'Pyraminx',
        'Clock',
        'FTO',
        'Skewb',
        'Megaminx',
        'Square-1',
    ],
    guildfordfto: [
        '2x2',
        '3x3',
        '4x4',
        '5x5',
        '6x6',
        '7x7',
        'OH',
        'Pyraminx',
        'Clock',
        'FTO',
        'Skewb',
        'Megaminx',
        'Square-1',
    ],
    twotoseven: ['2x2', '3x3', '4x4', '5x5', '6x6', '7x7'],
};

relaySelect.addEventListener('change', () => {
    events = eventOptions[relaySelect.value] || [];
    addEventInputs();
    populateFormFromURL();
});

let events = eventOptions[relaySelect.value] || [];

const DNF_SENTINEL = 1000000; // large number to represent DNF
function isDNF(value) {
    return value === 'DNF' || value === null || value === undefined;
}

function addEventInputs() {
    const competitor1Events = document.getElementById('c1-times');
    const competitor2Events = document.getElementById('c2-times');

    competitor1Events.innerHTML = '';
    competitor2Events.innerHTML = '';

    events.forEach((event) => {
        const label1 = document.createElement('label');
        const span1 = document.createElement('span');
        span1.textContent = `${event}:`;

        const input1 = document.createElement('input');
        input1.type = 'text';
        input1.id = `c1-${event}`;
        input1.required = true;
        input1.placeholder = '0.00';

        label1.appendChild(span1);
        label1.appendChild(input1);

        const label2 = document.createElement('label');
        const span2 = document.createElement('span');
        span2.textContent = `${event}:`;

        const input2 = document.createElement('input');
        input2.type = 'text';
        input2.id = `c2-${event}`;
        input2.required = true;
        input2.placeholder = '0.00';

        label2.appendChild(span2);
        label2.appendChild(input2);

        input1.addEventListener('input', () => {
            formatInputField(input1);
            updateURLWithFormData();
            optimizeGuildford();
        });

        input2.addEventListener('input', () => {
            formatInputField(input2);
            updateURLWithFormData();
            optimizeGuildford();
        });

        competitor1Events.appendChild(label1);
        competitor2Events.appendChild(label2);
    });
}

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

    optimizeGuildford();
}

// Call populateFormFromURL on page load to set inputs
document.addEventListener('DOMContentLoaded', () => {
    if (relaySelect.value == 'miniguild') {
        events = [
            '2x2',
            '3x3',
            '4x4',
            '5x5',
            'OH',
            'Pyraminx',
            'Clock',
            'Skewb',
            'Megaminx',
            'Square-1',
        ];
    } else if (relaySelect.value == 'guildford') {
        events = [
            '2x2',
            '3x3',
            '4x4',
            '5x5',
            '6x6',
            '7x7',
            'OH',
            'Pyraminx',
            'Clock',
            'Skewb',
            'Megaminx',
            'Square-1',
        ];
    } else if (relaySelect.value == 'miniguildfto') {
        events = [
            '2x2',
            '3x3',
            '4x4',
            '5x5',
            'OH',
            'Pyraminx',
            'Clock',
            'FTO',
            'Skewb',
            'Megaminx',
            'Square-1',
        ];
    } else if (relaySelect.value == 'guildfordfto') {
        events = [
            '2x2',
            '3x3',
            '4x4',
            '5x5',
            '6x6',
            '7x7',
            'OH',
            'Pyraminx',
            'Clock',
            'FTO',
            'Skewb',
            'Megaminx',
            'Square-1',
        ];
    } else if (relaySelect.value == 'twotoseven') {
        events = ['2x2', '3x3', '4x4', '5x5', '6x6', '7x7'];
    }
    addEventInputs();
    populateFormFromURL();
});

let competitor1Name = 'Competitor 1';
let competitor2Name = 'Competitor 2';

async function handleButtons(competitor) {
    await getWCAData(competitor);
    updateURLWithFormData();
}

// Get the pickup time
var pickupTime = parseFloat(document.getElementById('pickup').value) || 1.5;

// Get the solve count to process
var solvecount = parseInt(document.getElementById('solvecount').value) || 25;

// Attach event listener to the time form submit button
function optimizeGuildford() {
    updateURLWithFormData();

    const competitor1Id = 'c1';
    const competitor2Id = 'c2';

    const competitor1 = collectCompetitorTimes(competitor1Id);
    const competitor2 = collectCompetitorTimes(competitor2Id);

    // Validate: ensure not both DNF for any event
    const invalidEvents = events.filter(
        (event) =>
            (competitor1[event] === DNF_SENTINEL || isNaN(competitor1[event])) &&
            (competitor2[event] === DNF_SENTINEL || isNaN(competitor2[event]))
    );

    const errorDiv = document.getElementById('bestCombination');
    const countDiv = document.getElementById('combinationsCounted');

    if (invalidEvents.length > 0) {
        errorDiv.innerHTML = `
            <h3>Invalid Guildford configuration</h3>
            <p>Neither competitor has a valid time for: ${invalidEvents.join(', ')}.</p>
            <p>Please enter a valid time for at least one competitor in each event before optimizing.</p>
        `;
        if (countDiv) countDiv.textContent = '';
        return; // 🚫 stop before optimization
    }

    // Otherwise proceed normally
    optimizeAndDisplayLive(competitor1, competitor2);
}

// Function to fetch average times from the API for a given WCA ID and event
async function getCurrentAverage(wcaId, event) {
    // Validate and sanitize inputs
    const sanitizedWcaId = wcaId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const sanitizedEvent = event.replace(/[^a-zA-Z0-9]/g, '');
    const solvecount = parseInt(document.getElementById('solvecount').value) || 25;

    // Construct the API URL
    const apiUrl = `/api/wca/${encodeURIComponent(sanitizedWcaId)}/${encodeURIComponent(
        sanitizedEvent
    )}?num=${solvecount}`;

    try {
        const response = await fetch(apiUrl);

        // Check for suspicious responses or errors
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(
                    `API returned 404 for WCA ID: ${sanitizedWcaId}, Event: ${sanitizedEvent}`
                );
            }
            throw new Error(`Error fetching data: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate the response structure
        if (!data || typeof data.average !== 'number') {
            throw new Error('Invalid response format from API');
        }

        return data.average;
    } catch (error) {
        console.error(`Error fetching average for event ${sanitizedEvent}: ${error.message}`);
        return null;
    }
}

// Function to get competitor name
async function getCompetitorName(wcaId) {
    const apiUrl = `/api/wca/${wcaId}/name`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Error fetching data: ${response.statusText}`);
        }
        const data = await response.json();
        return data.name;
    } catch (error) {
        console.error(`Error fetching competitor name: ${error.message}`);
        return 'Competitor Name';
    }
}

// Function to get WCA data for all events for a given competitor
async function getWCAData(competitorId) {
    const wcaId = document.getElementById(`${competitorId}-wca`).value.toUpperCase().trim();

    // Test if a WCA ID was given
    if (!/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId)) return;

    let eventMap = {};

    if (relaySelect.value == 'miniguild') {
        eventMap = {
            '2x2': '222',
            '3x3': '333',
            '4x4': '444',
            '5x5': '555',
            'OH': '333oh',
            'Pyraminx': 'pyram',
            'Clock': 'clock',
            'Skewb': 'skewb',
            'Megaminx': 'minx',
            'Square-1': 'sq1',
        };
    } else if (relaySelect.value == 'guildford') {
        eventMap = {
            '2x2': '222',
            '3x3': '333',
            '4x4': '444',
            '5x5': '555',
            '6x6': '666',
            '7x7': '777',
            'OH': '333oh',
            'Pyraminx': 'pyram',
            'Clock': 'clock',
            'Skewb': 'skewb',
            'Megaminx': 'minx',
            'Square-1': 'sq1',
        };
    } else if (relaySelect.value == 'miniguildfto') {
        eventMap = {
            '2x2': '222',
            '3x3': '333',
            '4x4': '444',
            '5x5': '555',
            'OH': '333oh',
            'Pyraminx': 'pyram',
            'Clock': 'clock',
            'FTO': 'fto',
            'Skewb': 'skewb',
            'Megaminx': 'minx',
            'Square-1': 'sq1',
        };
    } else if (relaySelect.value == 'guildfordfto') {
        eventMap = {
            '2x2': '222',
            '3x3': '333',
            '4x4': '444',
            '5x5': '555',
            '6x6': '666',
            '7x7': '777',
            'OH': '333oh',
            'Pyraminx': 'pyram',
            'Clock': 'clock',
            'FTO': 'fto',
            'Skewb': 'skewb',
            'Megaminx': 'minx',
            'Square-1': 'sq1',
        };
    } else if (relaySelect.value == 'twotoseven') {
        eventMap = {
            '2x2': '222',
            '3x3': '333',
            '4x4': '444',
            '5x5': '555',
            '6x6': '666',
            '7x7': '777',
        };
    }

    try {
        const name = await getCompetitorName(wcaId);
        if (competitorId === 'c1') {
            competitor1Name = name;
        } else {
            competitor2Name = name;
        }
        const nameEl = document.getElementById(`${competitorId}-name`);
        if (nameEl) nameEl.textContent = name;

        // Fetch averages in parallel for all events
        const pairs = Object.entries(eventMap);
        await Promise.all(
            pairs.map(async ([eventName, eventId]) => {
                const avg = await getCurrentAverage(wcaId, eventId);
                const input = document.getElementById(`${competitorId}-${eventName}`);
                if (!input) return;
                if (avg === null || avg === undefined) {
                    input.value = 'DNF';
                } else {
                    // avg is in seconds (float). Put it in "m:ss.ss" format, then set input to that string.
                    const formatted = formatTime(avg);
                    input.value = formatted;
                }
                formatInputField(input);
            })
        );

        // After populating, run optimize
        optimizeGuildford();
    } catch (err) {
        console.error(err);
    }
}

// Existing function to collect times from the form fields
function collectCompetitorTimes(competitorId) {
    const times = {};
    events.forEach((event) => {
        const el = document.getElementById(`${competitorId}-${event}`);
        const raw = el ? el.value : '';
        const seconds = getTimeInSeconds(raw);
        times[event] = isNaN(seconds) ? DNF_SENTINEL : seconds;
    });
    return times;
}

function calculateMaxTime(combination, competitor1, competitor2, pickup) {
    const time1 =
        combination[0].reduce((sum, event) => sum + (competitor1[event] || 0) + pickup, 0) - pickup;
    const time2 =
        combination[1].reduce((sum, event) => sum + (competitor2[event] || 0) + pickup, 0) - pickup;
    return Math.max(time1, time2);
}

// Function to format time in seconds to "Xm Ys" format
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    let secs = seconds % 60;
    secs = secs < 10 ? '0' + secs.toFixed(2) : secs.toFixed(2);
    return `${minutes}:${secs}`;
}

function getTimeInSeconds(input) {
    if (typeof input !== 'string') return NaN;
    const s = input.trim();
    if (!s) return NaN;
    if (/^dnf$/i.test(s)) return NaN; // caller will map NaN to DNF sentinel
    if (s.includes(':')) {
        const parts = s.split(':');
        const minutes = parseInt(parts[0], 10);
        const seconds = parseFloat(parts[1]);
        if (isNaN(minutes) || isNaN(seconds)) return NaN;
        return minutes * 60 + seconds;
    } else {
        // plain seconds (or formatted like 12.34)
        const v = parseFloat(s);
        return isNaN(v) ? NaN : v;
    }
}

function processCombinations(competitor1, competitor2, pickup) {
    const bestCombinationDiv = document.getElementById('bestCombination');
    const combinationsCountedDiv = document.getElementById('combinationsCounted');

    let bestTime = Infinity;
    let bestGroups = null;
    let combos = 0;
    const start = Date.now();

    // Precompute event times (including pickup except for final subtraction)
    const times1 = events.map((e) => (competitor1[e] || 0) + pickup);
    const times2 = events.map((e) => (competitor2[e] || 0) + pickup);

    function dfs(index, group1Idxs, group2Idxs, sum1, sum2) {
        // Lower bound pruning: if the larger of sums already >= bestTime, prune
        const currentMax = Math.max(sum1, sum2);
        if (currentMax >= bestTime) return;

        if (index === events.length) {
            combos++;
            // subtract last pickup per competitor (because every group sum added pickup per event)
            const real1 = sum1 - (group1Idxs.length > 0 ? pickup : 0);
            const real2 = sum2 - (group2Idxs.length > 0 ? pickup : 0);
            const totalMax = Math.max(real1, real2);
            if (totalMax < bestTime) {
                bestTime = totalMax;
                bestGroups = {
                    group1: group1Idxs.map((i) => events[i]),
                    group2: group2Idxs.map((i) => events[i]),
                    time1: real1,
                    time2: real2,
                };
            }
            return;
        }

        // Try assign event index to competitor 1
        dfs(index + 1, [...group1Idxs, index], group2Idxs, sum1 + times1[index], sum2);

        // Try assign event index to competitor 2
        dfs(index + 1, group1Idxs, [...group2Idxs, index], sum1, sum2 + times2[index]);
    }

    dfs(0, [], [], 0, 0);

    const timeTaken = (Date.now() - start) / 1000;
    combinationsCountedDiv.textContent = `Analyzed ${combos} combinations in ${timeTaken.toFixed(
        2
    )}s`;

    if (bestGroups) {
        bestCombinationDiv.innerHTML = `
            <h3>Best Combination</h3>
            <p>${competitor1Name} (${formatTime(bestGroups.time1)}): ${bestGroups.group1.join(
            ', '
        )}</p>
            <p>${competitor2Name} (${formatTime(bestGroups.time2)}): ${bestGroups.group2.join(
            ', '
        )}</p>
            <p>Total Time: ${formatTime(bestTime)}</p>`;
    } else {
        bestCombinationDiv.innerHTML = `<p>No valid combination found.</p>`;
    }
}

function optimizeAndDisplayLive(competitor1, competitor2) {
    const pickupTime = parseFloat(document.getElementById('pickup').value) || 0;
    processCombinations(competitor1, competitor2, pickupTime);
}
