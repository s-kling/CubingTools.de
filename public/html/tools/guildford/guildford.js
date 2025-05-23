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
        });

        input2.addEventListener('input', () => {
            formatInputField(input2);
            updateURLWithFormData();
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
document.getElementById('timeForm').addEventListener('submit', async function (event) {
    event.preventDefault();

    // Update URL with form data
    updateURLWithFormData();

    const competitor1Id = 'c1';
    const competitor2Id = 'c2';

    // Collect the times after they have been populated by WCA data
    const competitor1 = collectCompetitorTimes(competitor1Id);
    const competitor2 = collectCompetitorTimes(competitor2Id);

    optimizeAndDisplayLive(competitor1, competitor2);
});

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

    try {
        let events = {};

        if (relaySelect.value == 'miniguild') {
            events = {
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
            events = {
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
            events = {
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
            events = {
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
            events = {
                '2x2': '222',
                '3x3': '333',
                '4x4': '444',
                '5x5': '555',
                '6x6': '666',
                '7x7': '777',
            };
        }

        const times = {};

        for (const [eventName, eventId] of Object.entries(events)) {
            const name = await getCompetitorName(wcaId);
            const competitorName = document.getElementById(`${competitorId}-name`);
            competitorId === 'c1' ? (competitor1Name = name) : (competitor2Name = name);
            competitorName.textContent = name;

            const average = await getCurrentAverage(wcaId, eventId);
            times[eventName] = average !== null ? average : null;

            // Update the input field live
            const input = document.getElementById(`${competitorId}-${eventName}`);
            if (times[eventName] !== null) {
                input.value = formatTime(times[eventName].toFixed(2)).replace(/[^0-9.]/g, '');
                formatInputField(input);
            } else {
                input.value = 'DNF';
            }
        }
    } catch (error) {
        alert(`Error fetching data: ${error.message}`);
    }
}

// Existing function to collect times from the form fields
function collectCompetitorTimes(competitorId) {
    const times = {};

    events.forEach((event) => {
        const value = getTimeInSeconds(document.getElementById(`${competitorId}-${event}`).value);
        if (value === 'DNF' || isNaN(value)) {
            times[event] = 10000; // Use 10000 for DNF (did not finish)
        } else {
            times[event] = parseFloat(value);
        }
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
    var currentValue = input;
    if (currentValue.includes(':')) {
        var parts = currentValue.split(':');
        var minutes = parseInt(parts[0]);
        var seconds = parseFloat(parts[1]);
        var totalSeconds = minutes * 60 + seconds;
    } else {
        var totalSeconds = parseFloat(currentValue);
    }
    return totalSeconds;
}

/**
 * Depth-First Search (DFS) function to explore all possible combinations of events
 * assigned to two competitors, using alpha-beta pruning to optimize the search.
 *
 * @param {number} index - The current index in the events array.
 * @param {Array<string>} group1 - The list of events assigned to competitor 1.
 * @param {Array<string>} group2 - The list of events assigned to competitor 2.
 * @param {number} alpha - The best time found so far for competitor 1.
 * @param {number} beta - The best time found so far for competitor 2.
 * @param {number} group1Time - The total time for the events assigned to competitor 1.
 * @param {number} group2Time - The total time for the events assigned to competitor 2.
 * @returns {Promise<number>} - The best time found for the current combination of events.
 */
async function processCombinationsWithAlphaBetaLive(competitor1, competitor2, pickupTime) {
    const bestCombinationDiv = document.getElementById('bestCombination');
    const combinationsCountedDiv = document.getElementById('combinationsCounted');

    let bestTime = Infinity;
    let combinationsCount = 0;

    const startCalculating = Date.now();

    const dfs = async (index, group1, group2, alpha, beta, group1Time, group2Time) => {
        if (index === events.length) {
            const maxTime = Math.max(group1Time, group2Time);
            combinationsCount++;

            const stopCalculating = Date.now();
            const timeTaken = (stopCalculating - startCalculating) / 1000;

            if (maxTime < bestTime) {
                bestTime = maxTime;
                let diff = Math.abs(group1Time - group2Time);
                const totalGroup1Time = group1.reduce(
                    (sum, event) => sum + (competitor1[event] || 0),
                    0
                );
                const totalGroup2Time = group2.reduce(
                    (sum, event) => sum + (competitor2[event] || 0),
                    0
                );
                const averageTime = (totalGroup1Time + totalGroup2Time) / 2;

                const eventDifference = Math.abs(group1.length - group2.length);
                const threshold = averageTime / events.length + eventDifference * pickupTime;

                var middleEventsText = '';

                if (diff < threshold) {
                    const sortedEvents1 = group1
                        .map((event) => ({
                            event,
                            time: competitor1[event] + (competitor2[event] || 0),
                        }))
                        .sort((a, b) => a.time - b.time);

                    const sortedEvents2 = group2
                        .map((event) => ({
                            event,
                            time: competitor2[event] + (competitor1[event] || 0),
                        }))
                        .sort((a, b) => a.time - b.time);

                    // Selecting the first few events whose total time is under the threshold
                    let middleEvents = [];
                    let sum1 = 0,
                        sum2 = 0;

                    for (let item of sortedEvents1) {
                        if (sum1 + item.time < threshold) {
                            sum1 += item.time;
                            middleEvents.push(item.event);
                        } else break;
                    }

                    for (let item of sortedEvents2) {
                        if (sum2 + item.time < threshold) {
                            sum2 += item.time;
                            middleEvents.push(item.event);
                        } else break;
                    }

                    middleEventsText =
                        middleEvents.length > 0
                            ? `<p title="Suggested middle events, should any competitor finish early.">Suggested events in the middle: ${middleEvents.join(
                                  ', '
                              )}</p>`
                            : '';
                }

                bestCombinationDiv.innerHTML = `
                    <h3>Best Combination</h3>
                    <p>${competitor1Name} (${formatTime(group1Time)}): ${group1.join(', ')}</p>
                    <p>${competitor2Name} (${formatTime(group2Time)}): ${group2.join(', ')}</p>
                    ${middleEventsText}
                    <p>Total Time: ${formatTime(bestTime)}</p>`;
            }

            combinationsCountedDiv.textContent = `Analyzed ${combinationsCount} combinations in ${timeTaken} seconds`;
            return maxTime;
        }

        const currentEvent = events[index];
        const time1 = (competitor1[currentEvent] || 0) + pickupTime;
        const time2 = (competitor2[currentEvent] || 0) + pickupTime;

        // Check for DNF in the same event
        if (competitor1[currentEvent] === 10000 && competitor2[currentEvent] === 10000) {
            alert(`Guildford is invalid: Both competitors have DNF in ${currentEvent}`);
            return Infinity;
        }

        let localBest = Infinity;

        // Assign to Group 1
        if (group1Time + time1 < beta) {
            const result = await dfs(
                index + 1,
                [...group1, currentEvent],
                group2,
                alpha,
                beta,
                group1Time + time1,
                group2Time
            );
            localBest = Math.min(localBest, result);
            alpha = Math.max(alpha, result);
        }

        if (alpha >= beta) return localBest;

        // Assign to Group 2
        if (group2Time + time2 < alpha) {
            const result = await dfs(
                index + 1,
                group1,
                [...group2, currentEvent],
                alpha,
                beta,
                group1Time,
                group2Time + time2
            );
            localBest = Math.min(localBest, result);
            beta = Math.min(beta, result);
        }

        return localBest;
    };

    await dfs(0, [], [], -Infinity, Infinity, 0, 0);
}

// Main function to start the optimization and live update
function optimizeAndDisplayLive(competitor1, competitor2) {
    const pickupTime = parseFloat(document.getElementById('pickup').value) || 0;

    processCombinationsWithAlphaBetaLive(competitor1, competitor2, pickupTime);
}
