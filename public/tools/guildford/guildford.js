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
        'Skewb',
        'Megaminx',
        'Square-1',
        'FTO',
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
        'Skewb',
        'Megaminx',
        'Square-1',
        'FTO',
    ],
    miniguild2027: [
        '2x2',
        '3x3',
        '4x4',
        '5x5',
        'OH',
        'Pyraminx',
        'FTO',
        'Skewb',
        'Megaminx',
        'Square-1',
    ],
    guildford2027: [
        '2x2',
        '3x3',
        '4x4',
        '5x5',
        '6x6',
        '7x7',
        'OH',
        'Pyraminx',
        'FTO',
        'Skewb',
        'Megaminx',
        'Square-1',
    ],
    twotoseven: ['2x2', '3x3', '4x4', '5x5', '6x6', '7x7'],
    customEventOptions: [
        '2x2',
        '3x3',
        '4x4',
        '5x5',
        '6x6',
        '7x7',
        'OH',
        '3x3-Blind',
        'Pyraminx',
        'Clock',
        'FTO',
        'Skewb',
        'Megaminx',
        'Square-1',
        '4x4-Blind',
        '5x5-Blind',
    ],
};

function eventNameToWcaId(eventName) {
    const map = {
        '2x2': '222',
        '3x3': '333',
        '4x4': '444',
        '5x5': '555',
        '6x6': '666',
        '7x7': '777',
        'OH': '333oh',
        '3x3-Blind': '333bf',
        'Pyraminx': 'pyram',
        'Clock': 'clock',
        'FTO': 'fto',
        'Skewb': 'skewb',
        'Megaminx': 'minx',
        'Square-1': 'sq1',
        '4x4-Blind': '444bf',
        '5x5-Blind': '555bf',
    };

    return map[eventName];
}

let events = eventOptions[relaySelect.value] || [];
let competitor1AllEventTimes = {};
let competitor2AllEventTimes = {};

relaySelect.addEventListener('change', handleAddingEvents);

function handleAddingEvents() {
    events = eventOptions[relaySelect.value] || [];

    const eventSpan = document.getElementById('events');
    eventSpan.innerHTML = '';

    let customRelay = [];

    eventOptions.customEventOptions.forEach((event) => {
        const eventTag = document.createElement('span');
        const eventWcaId = eventNameToWcaId(event);

        // Apply both event and unofficial classes because its too much work to differentiate between WCA events
        eventTag.classList += `cubing-icon event-${eventWcaId} unofficial-${eventWcaId}`;

        if (events.includes(event)) {
            eventTag.classList.add('selected');
            customRelay.push(event);
        }

        // When clicking too quickly the input might be removed before all future handling can be done
        let isProcessing = false;
        eventTag.addEventListener('click', async () => {
            if (isProcessing) return;
            isProcessing = true;

            try {
                if (!eventTag.classList.contains('selected')) {
                    eventTag.classList.add('selected');
                    customRelay.push(event);
                } else {
                    eventTag.classList.remove('selected');
                    let index = customRelay.indexOf(event);
                    customRelay.splice(index, 1);
                }

                // Make sure customRelay is the order of eventOptions.customEventOptions
                customRelay = eventOptions.customEventOptions.filter((event) =>
                    customRelay.includes(event),
                );

                // Check if customRelay matches any preset and update relaySelect if it does
                const presetKey = Object.keys(eventOptions).find(
                    (key) =>
                        key !== 'customEventOptions' &&
                        JSON.stringify(eventOptions[key]) === JSON.stringify(customRelay),
                );
                if (presetKey) {
                    relaySelect.value = presetKey;
                } else {
                    relaySelect.value = 'custom';
                }

                events = customRelay;
                await addEventInputs();

                const c1Input = document.getElementById(`c1-${event}`);
                const c2Input = document.getElementById(`c2-${event}`);
                if (c1Input) c1Input.value = competitor1AllEventTimes[event] || '';
                if (c2Input) c2Input.value = competitor2AllEventTimes[event] || '';
            } finally {
                isProcessing = false;
            }
        });

        eventSpan.appendChild(eventTag);
    });

    addEventInputs();
}

const DNF_SENTINEL = 1_000_000; // large number to represent DNF
function isDNF(value) {
    return value === 'DNF' || value === null || value === undefined;
}

async function addEventInputs() {
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
        input1.value = competitor1AllEventTimes[event] || '';

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
        input2.value = competitor2AllEventTimes[event] || '';

        label2.appendChild(span2);
        label2.appendChild(input2);

        input1.addEventListener('input', () => {
            competitor1AllEventTimes[event] = input1.value;
            formatInputField(input1);
            updateURLWithFormData();
            optimizeGuildford();
        });

        input2.addEventListener('input', () => {
            competitor2AllEventTimes[event] = input2.value;
            formatInputField(input2);
            updateURLWithFormData();
            optimizeGuildford();
        });

        competitor1Events.appendChild(label1);
        competitor2Events.appendChild(label2);
    });
}

function formatInputField(input) {
    // DNF is not an accepted input here: an unknown time stays empty and is treated as "cannot do".
    input.value = CubingCore.formatTimeInputValue(input.value, { allowDnf: false });
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

    // Add event times from the stored objects
    events.forEach((event) => {
        const c1Input = document.getElementById(`c1-${event}`);
        const c2Input = document.getElementById(`c2-${event}`);
        if (c1Input) competitor1AllEventTimes[event] = c1Input.value;
        if (c2Input) competitor2AllEventTimes[event] = c2Input.value;

        if (competitor1AllEventTimes[event])
            params.set(`c1-${event}`, `${competitor1AllEventTimes[event]}`);
        if (competitor2AllEventTimes[event])
            params.set(`c2-${event}`, `${competitor2AllEventTimes[event]}`);
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

    events = [];
    // First, deselect all event icons
    document.querySelectorAll('.cubing-icon.selected').forEach((icon) => {
        icon.classList.remove('selected');
    });

    eventOptions.customEventOptions.forEach((event) => {
        if (params.has(`c1-${event}`) || params.has(`c2-${event}`)) {
            events.push(event);
            // Set the icon to selected
            const eventWcaId = eventNameToWcaId(event);
            const eventSpan = document.querySelector(
                `.cubing-icon.event-${eventWcaId}.unofficial-${eventWcaId}`,
            );
            if (eventSpan) {
                eventSpan.classList.add('selected');
            }
        }

        // Check if events matches any preset and update relaySelect if it does
        const presetKey = Object.keys(eventOptions).find(
            (key) =>
                key !== 'customEventOptions' &&
                JSON.stringify(eventOptions[key]) === JSON.stringify(events),
        );
        if (presetKey) {
            relaySelect.value = presetKey;
        } else {
            relaySelect.value = 'custom';
        }
    });

    if (events.length == 0) {
        relaySelect.value = 'miniguild';
        events = eventOptions[relaySelect.value] || [];
    }

    addEventInputs();

    // Populate event times from stored objects
    events.forEach((event) => {
        if (params.has(`c1-${event}`)) {
            competitor1AllEventTimes[event] = params.get(`c1-${event}`);
            document.getElementById(`c1-${event}`).value = competitor1AllEventTimes[event];
        }
        if (params.has(`c2-${event}`)) {
            competitor2AllEventTimes[event] = params.get(`c2-${event}`);
            document.getElementById(`c2-${event}`).value = competitor2AllEventTimes[event];
        }
    });

    optimizeGuildford();
}

// Call populateFormFromURL on page load to set inputs
document.addEventListener('DOMContentLoaded', () => {
    // if (relaySelect.value == 'miniguild') {
    //     events = [
    //         '2x2',
    //         '3x3',
    //         '4x4',
    //         '5x5',
    //         'OH',
    //         'Pyraminx',
    //         'Clock',
    //         'Skewb',
    //         'Megaminx',
    //         'Square-1',
    //     ];
    // } else if (relaySelect.value == 'guildford') {
    //     events = [
    //         '2x2',
    //         '3x3',
    //         '4x4',
    //         '5x5',
    //         '6x6',
    //         '7x7',
    //         'OH',
    //         'Pyraminx',
    //         'Clock',
    //         'Skewb',
    //         'Megaminx',
    //         'Square-1',
    //     ];
    // } else if (relaySelect.value == 'miniguildfto') {
    //     events = [
    //         '2x2',
    //         '3x3',
    //         '4x4',
    //         '5x5',
    //         'OH',
    //         'Pyraminx',
    //         'Clock',
    //         'FTO',
    //         'Skewb',
    //         'Megaminx',
    //         'Square-1',
    //     ];
    // } else if (relaySelect.value == 'guildfordfto') {
    //     events = [
    //         '2x2',
    //         '3x3',
    //         '4x4',
    //         '5x5',
    //         '6x6',
    //         '7x7',
    //         'OH',
    //         'Pyraminx',
    //         'Clock',
    //         'FTO',
    //         'Skewb',
    //         'Megaminx',
    //         'Square-1',
    //     ];
    // } else if (relaySelect.value == 'twotoseven') {
    //     events = ['2x2', '3x3', '4x4', '5x5', '6x6', '7x7'];
    // }
    addEventInputs();
    populateFormFromURL();
    handleAddingEvents();
});

let competitor1Name = 'Competitor 1';
let competitor2Name = 'Competitor 2';

async function handleButtons(competitor) {
    const btn = document.querySelector(
        `#timeForm .competitor:has(#${competitor}-wca) .globals-btn`,
    );
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;
    try {
        await getWCAData(competitor);
        updateURLWithFormData();
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
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
            (competitor2[event] === DNF_SENTINEL || isNaN(competitor2[event])),
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
        return; // stop before optimization
    }

    // Otherwise proceed normally
    optimizeAndDisplayLive(competitor1, competitor2);
}

// Function to fetch average times and all solves from the API for a given WCA ID and event
// One request for all events of a competitor (was one request per event, i.e. 15-30 requests per refresh).
// Returns { eventId: seconds|null }; null means "not enough results" (shown as an empty field).
async function getCurrentAverages(wcaId, eventIds) {
    const sanitizedWcaId = wcaId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const solvecount = parseInt(document.getElementById('solvecount').value) || 25;
    const url = `/api/wca/averages?ids=${encodeURIComponent(sanitizedWcaId)}&events=${eventIds
        .map(encodeURIComponent)
        .join(',')}&num=${solvecount}`;

    try {
        const data = await window.fetchJsonOrThrow(url, { errorContext: 'Could not load competitor averages' });
        const own = data?.averages?.[sanitizedWcaId];
        if (!own || typeof own !== 'object') throw new Error('Invalid response format from API (averages)');
        return own;
    } catch (error) {
        console.error(`Error fetching averages for ${sanitizedWcaId}: ${error.message}`);
        window.showUserErrorPopup({
            title: 'Could not load Guildford WCA data',
            message: 'Some Guildford event data could not be loaded, so missing results will stay empty.',
            error,
            reportTitle: 'Guildford tool failed to load WCA data',
            reportContext: `Fetching Guildford data failed for ${sanitizedWcaId}.`,
            dedupeKey: `guildford-average:${sanitizedWcaId}`,
        });
        return {};
    }
}

// Function to get competitor name
async function getCompetitorName(wcaId) {
    const apiUrl = `/api/wca/${wcaId}/name`;

    try {
        const data = await window.fetchJsonOrThrow(apiUrl, {
            errorContext: 'Could not load competitor name',
        });
        return data.name;
    } catch (error) {
        console.error(`Error fetching competitor name: ${error.message}`);
        window.showUserErrorPopup({
            title: 'Could not load competitor name',
            message: 'The Guildford tool could not fetch the competitor name from WCA right now.',
            error,
            reportTitle: 'Guildford tool failed to load competitor name',
            reportContext: `Fetching the competitor name failed for WCA ID ${wcaId}.`,
            dedupeKey: `guildford-name:${wcaId}`,
        });
        return 'Competitor Name';
    }
}

// Function to get WCA data for all events for a given competitor
async function getWCAData(competitorId) {
    const wcaId = document.getElementById(`${competitorId}-wca`).value.toUpperCase().trim();

    // Test if a WCA ID was given
    if (!/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId)) return;

    try {
        const name = await getCompetitorName(wcaId);
        if (competitorId === 'c1') {
            competitor1Name = name;
        } else {
            competitor2Name = name;
        }
        const nameEl = document.getElementById(`${competitorId}-name`);
        if (nameEl) nameEl.textContent = name;

        const averages = await getCurrentAverages(
            wcaId,
            events.map((eventName) => eventNameToWcaId(eventName)),
        );
        events.forEach((eventName) => {
            const input = document.getElementById(`${competitorId}-${eventName}`);
            if (!input) return;
            const avg = averages[eventNameToWcaId(eventName)];
            input.value = Number.isFinite(avg) && avg > 0 ? formatTime(avg) : '';
            formatInputField(input);
        });

        // After populating, run optimize
        optimizeGuildford();
    } catch (err) {
        console.error(err);
    }
}

// Collect times from the form fields
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

// Relay totals are always shown as M:SS.xx (also below a minute); rounding is done by CubingCore.
function formatTime(seconds) {
    const text = CubingCore.formatTime(seconds);
    return text.includes(':') ? text : `0:${text.padStart(5, '0')}`;
}

// Seconds for a typed time; NaN for empty, DNF or invalid input (callers map NaN to the DNF sentinel).
function getTimeInSeconds(input) {
    if (typeof input !== 'string') return NaN;
    const parsed = CubingCore.parseTime(input);
    return parsed.error || parsed.isDnf ? NaN : parsed.seconds;
}

const HISTORY_LIMIT = 200;

function processCombinations(competitor1, competitor2, pickup) {
    const bestCombinationDiv = document.getElementById('bestCombination');
    const combinationsCountedDiv = document.getElementById('combinationsCounted');

    let bestTime = Infinity;
    let bestGroups = null;
    let combos = 0;
    let combinations = [];
    var start = Date.now();

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

            // Keep only the best few for the history table (every leaf would be up to 2^n table rows).
            combinations.push({
                group1: group1Idxs.map((i) => events[i]),
                group2: group2Idxs.map((i) => events[i]),
                time1: real1,
                time2: real2,
                totalTime: totalMax,
            });
            if (combinations.length > HISTORY_LIMIT * 4) {
                combinations.sort((a, b) => a.totalTime - b.totalTime);
                combinations.length = HISTORY_LIMIT;
            }

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
    combinations.sort((a, b) => a.totalTime - b.totalTime);
    combinations.length = Math.min(combinations.length, HISTORY_LIMIT);

    var stop = Date.now();

    const timeTaken = (stop - start) / 1000;
    combinationsCountedDiv.textContent = `Analyzed ${combos} combinations in ${timeTaken}s`;

    if (bestGroups) {
        bestCombinationDiv.innerHTML = `
            <h3>Best Combination</h3>
            <p>${CubingCore.escapeHtml(competitor1Name)} (${formatTime(bestGroups.time1)}): ${bestGroups.group1.join(
                ', ',
            )}</p>
            <p>${CubingCore.escapeHtml(competitor2Name)} (${formatTime(bestGroups.time2)}): ${bestGroups.group2.join(
                ', ',
            )}</p>
            <p>Total Time: ${formatTime(bestTime)}</p>`;

        document.getElementById('combination-history').innerHTML = `
            <h3>Combination History</h3>
            <table>
            <thead>
                <tr>
                <th>${CubingCore.escapeHtml(competitor1Name)}</th>
                <th>Time</th>
                <th>${CubingCore.escapeHtml(competitor2Name)}</th>
                <th>Time</th>
                <th>Total Time</th>
                </tr>
            </thead>
            <tbody>
                ${combinations
                    .map(
                        (combo) => `
                <tr>
                    <td>${combo.group1.join(', ')}</td>
                    <td>${formatTime(combo.time1)}</td>
                    <td>${combo.group2.join(', ')}</td>
                    <td>${formatTime(combo.time2)}</td>
                    <td>${formatTime(combo.totalTime)}</td>
                </tr>
                `,
                    )
                    .join('')}
            </tbody>
            </table>
        `;
    } else {
        bestCombinationDiv.innerHTML = `<p>No valid combination found.</p>`;
    }
}

function optimizeAndDisplayLive(competitor1, competitor2) {
    const pickupTime = parseFloat(document.getElementById('pickup').value) || 0;
    processCombinations(competitor1, competitor2, pickupTime);
}

function setCompetitorSource(competitorId, mode) {
    const wcaSection = document.getElementById(`${competitorId}-source-wca`);
    const globalsBtn = document.getElementById(`${competitorId}-globals-btn`);
    const toggle = wcaSection.closest('.competitor').querySelector('.source-toggle');
    const buttons = toggle.querySelectorAll('.source-toggle-btn');

    if (mode === 'average') {
        wcaSection.style.display = 'none';
        globalsBtn.style.display = 'none';
        buttons[0].classList.remove('active');
        buttons[1].classList.add('active');
        loadAverageToolTimes(competitorId);
    } else {
        wcaSection.style.display = '';
        globalsBtn.style.display = '';
        buttons[0].classList.add('active');
        buttons[1].classList.remove('active');
    }
}

function loadAverageToolTimes(competitorId) {
    const allEventTimes =
        competitorId === 'c1' ? competitor1AllEventTimes : competitor2AllEventTimes;
    let loadedAny = false;

    // The Average tool keeps everything under one key (ct_averages). This used to read a legacy
    // per-event key (averages_<event>) that the Average tool migrates away, so nothing was ever found.
    const saved = CubingCore.parseSavedAverages(localStorage.getItem('ct_averages'));

    events.forEach((eventName) => {
        const wcaId = eventNameToWcaId(eventName);
        if (!wcaId) return;

        // Most recent finished average for this event
        const last = saved.filter((tag) => tag.event === wcaId).pop();
        const avgValue = last ? parseFloat(last.average) : NaN;
        if (!isFinite(avgValue) || avgValue <= 0) return;

        const input = document.getElementById(`${competitorId}-${eventName}`);
        if (input) {
            input.value = formatTime(avgValue);
            formatInputField(input);
            allEventTimes[eventName] = input.value;
            loadedAny = true;
        }
    });

    if (loadedAny) {
        optimizeGuildford();
    }
}
