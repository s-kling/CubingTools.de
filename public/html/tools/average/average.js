const state = {
    times: [],
    averageTags: [],
    eventType: document.getElementById('event-type').value,
    userSolves: [],
    userAverages: [],
};

const meanEvents = ['666', '777', '444bf', '555bf', '333bf'];

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
});

// === Format input field ===
function formatInputField(input) {
    var currentValue = input.value;

    if (/[a-zA-Z]/.test(currentValue)) {
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

// === Add time ===
function addTime() {
    const input = document.getElementById('timeInput');
    let time = input.value;

    let penalty = null;

    if (state.times.length >= 5) {
        state.times = [];
    }

    if (time == 'DNF') {
        time = -1;
        penalty = 'dnf';
    }

    // Convert time to seconds
    if (time.includes(':')) {
        const parts = time.split(':');
        if (parts.length !== 2) {
            alert('Invalid time format');
            return;
        }
        const minutes = parseInt(parts[0], 10);
        const seconds = parseFloat(parts[1]);
        if (isNaN(minutes) || isNaN(seconds)) {
            alert('Invalid time format');
            return;
        }
        time = minutes * 60 + seconds;
    } else {
        time = parseFloat(time);
    }

    const event = document.getElementById('event-type').value;

    // Generate a custom ID to link each time to an average
    const averageId = `${event}${state.averageTags.length > 0 ? state.averageTags.length : 1}`;

    state.times.push({
        raw: time,
        penalty: penalty,
        value: time,
        event: event,
        averageId: averageId,
    });
    state.userSolves.push(time); // add to user solves for ranking
    input.value = '';

    calculateStats();
    displayCurrentTimes();
}

// === Calculate stats for current session ===
function calculateStats() {
    const n = state.times.length;

    if (n === 0) return;

    const mean = (state.times.reduce((a, b) => a + b.value, 0) / n).toFixed(2);
    let ao5 = null;
    let mo3 = null;

    if (n >= 5 && !meanEvents.includes(state.eventType)) {
        const last5 = state.times
            .slice(-5)
            .map((t) => t.value)
            .sort((a, b) => a - b);
        const trimmed = last5.slice(1, 4);
        ao5 = (trimmed.reduce((a, b) => a + b, 0) / 3).toFixed(2);
    }

    if (n >= 3 && meanEvents.includes(state.eventType)) {
        const last3 = state.times
            .slice(-3)
            .map((t) => t.value)
            .sort((a, b) => a - b);
        mo3 = ((last3[0] + last3[1] + last3[2]) / 3).toFixed(2);
    }

    const target = parseFloat(document.getElementById('target').value) || Infinity;
    let { bpa, wpa, tft } = calculateBpaWpaTft(state.times, target);

    // First test if tft exists, set to -
    tft = tft ? tft : '-';
    // Then test if tft is a number, format to 2 decimals
    tft = !isNaN(tft) ? tft.toFixed(2) : tft;

    const meanElem = document.getElementById('mean');
    if (meanElem) meanElem.textContent = mean ? (isFinite(mean) ? mean : 'DNF') : '0.00';

    const bpaElem = document.getElementById('bpa');
    if (bpaElem) bpaElem.textContent = bpa === 'DNF' ? 'DNF' : !isNaN(bpa) ? bpa.toFixed(2) : '-';

    const wpaElem = document.getElementById('wpa');
    if (wpaElem) wpaElem.textContent = wpa === 'DNF' ? 'DNF' : !isNaN(wpa) ? wpa.toFixed(2) : '-';

    const tftElem = document.getElementById('tft');
    if (tftElem) tftElem.textContent = tft;

    const event = document.getElementById('event-type').value;

    // When a mean of 3 or an average of 5 is completed, store it
    if (mo3 && n === 3) {
        const avgId = state.times[state.times.length - 1].averageId;

        state.averageTags.push({
            average: mo3,
            times: state.times.slice(-3),
            event: event,
            averageId: avgId,
        });
        saveAveragesToCookies();
        deleteCookie(`incomplete_${event}`);
        state.times = [];
        mo3 = mo3 === 'DNF' ? 'DNF' : parseFloat(mo3);
        state.userAverages.push(mo3); // add to user averages for ranking
        displayTags();
    }
    if (ao5 && n === 5) {
        const avgId = state.times[state.times.length - 1].averageId;

        state.averageTags.push({
            average: ao5,
            times: state.times.slice(-5),
            event: event,
            averageId: avgId,
        });
        saveAveragesToCookies();
        deleteCookie(`incomplete_${event}`);
        state.times = [];
        ao5 = ao5 === 'DNF' ? 'DNF' : parseFloat(ao5);
        state.userAverages.push(ao5); // add to user averages for ranking
        displayTags();
    }
}

// === BPA / WPA / TFT calculation ===
function calculateBpaWpaTft(times, target) {
    // For mean events (6x6, 7x7, BLD)
    if (times.length === 2 && meanEvents.includes(state.eventType)) {
        const mappedTimes = times.map((t) => {
            if (t.penalty === 'dnf' || t.value === Infinity) return 'DNF';
            return t.value;
        });

        const dnfCount = mappedTimes.filter((t) => t === 'DNF').length;

        if (dnfCount > 0) {
            return { bpa: 'DNF', wpa: 'DNF', tft: 'Not Possible' };
        }

        const sum = mappedTimes.reduce((a, b) => a + b, 0);

        let tft = null;
        if (target !== Infinity) {
            const needed = target * 2 - sum;
            tft = needed;
        }

        if (target <= 0 || dnfCount > 0) tft = 'Not Possible';

        let bpa = '-';
        let wpa = '-';
        return { bpa, wpa, tft };
    } else if (times.length === 4) {
        // Get last 4 times as numbers (handle DNF)
        const last4 = times.slice(-4).map((t) => {
            if (t.penalty === 'dnf' || t.value === Infinity) return 'DNF';
            return t.value;
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
            bpa = (sum - worst) / 3;
            wpa = 'DNF';
        } else {
            bpa = (sum - worst) / 3;
            wpa = (sum - best) / 3;
        }

        // time for target
        let tft = null;
        if (target !== Infinity && dnfCount === 0) {
            const needed = target * 3 - (sum - best - worst);
            tft = needed;
        }

        // Handle impossible/guaranteed target
        if (wpa < target) tft = 'Guaranteed';
        if (bpa > target) tft = 'Not Possible';

        return { bpa, wpa, tft };
    }

    return { bpa: '-', wpa: '-', tft: '-' };
}

// === Display current times in right container ===
function displayCurrentTimes() {
    const container = document.getElementById('currentTimes');
    container.innerHTML = '';

    state.times.forEach((solve, i) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('solve');

        let displayText;
        if (solve.penalty === 'dnf') {
            displayText = 'DNF';
        } else if (solve.penalty === 'plus2') {
            displayText = `${solve.raw.toFixed(2)}+`;
        } else {
            displayText = solve.raw.toFixed(2);
        }

        const rank = getSingleRank(solve.value);
        if (rank) displayText += ` (PR${rank})`;

        const span = document.createElement('span');
        span.textContent = displayText;
        wrapper.appendChild(span);

        const btns = document.createElement('div');
        btns.classList.add('penalty-buttons');

        const okayBtn = createButton({
            text: '✓',
            color: 'lime',
            onClick: () => removePenalty(i),
        });

        const plus2Btn = createButton({
            text: '+',
            color: 'orange',
            onClick: () => applyPenalty(i, 'plus2'),
        });

        const dnfBtn = createButton({
            text: 'x',
            color: 'red',
            onClick: () => applyPenalty(i, 'dnf'),
        });

        btns.appendChild(okayBtn);
        btns.appendChild(plus2Btn);
        btns.appendChild(dnfBtn);
        wrapper.appendChild(btns);

        container.appendChild(wrapper);
    });
}

// === Create a button helper ===
function createButton({ text, color, onClick }) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.classList.add('penalty-btn');
    btn.style.borderColor = color;
    btn.style.color = color;
    btn.onclick = onClick;
    return btn;
}

// === Apply penalty to a solve ===
function applyPenalty(index, type) {
    const solve = state.times[index];

    if (type === 'plus2') {
        solve.penalty = 'plus2';
        solve.value = solve.raw + 2;
    } else if (type === 'dnf') {
        solve.penalty = 'dnf';
        solve.value = Infinity;
    }

    // Use average ID to remove the average from the list, then re-add it with the penalty applied
    const avgId = solve.averageId;
    // Remove from list
    state.averageTags = state.averageTags.filter((tag) => tag.averageId !== avgId);
    setCookie(`averages_${state.eventType}`, state.averageTags, 365);
    // Remove from averages
    state.userAverages.shift();

    calculateStats();
    displayCurrentTimes();
}

// === Remove penalty from a solve ===
function removePenalty(index) {
    const solve = state.times[index];
    if (!solve || !solve.penalty) return; // no penalty to remove

    solve.penalty = null;
    solve.value = solve.raw;

    // Use average ID to remove the average from the list, then re-add it with the penalty applied
    const avgId = solve.averageId;
    // Remove from list
    state.averageTags = state.averageTags.filter((tag) => tag.averageId !== avgId);
    setCookie(`averages_${state.eventType}`, state.averageTags, 365);
    // Remove from averages
    state.userAverages.shift();

    calculateStats();
    displayCurrentTimes();
}

// ! WCA DATA

// === Handle WCA ID input ===
document.getElementById('wca').addEventListener('input', async () => {
    const wcaId = document.getElementById('wca').value.trim().toUpperCase();
    if (!wcaId) return;

    if (!/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId)) return;

    try {
        await fetchUserData(wcaId);
        calculateStats();

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
        alert('Could not fetch WCA data. Check the ID.');
    }
});

// === Fetch solves & averages for ranking ===
async function fetchUserData(wcaId) {
    try {
        const solvesRes = await fetch(`/api/wca/${wcaId}/${state.eventType}?getsolves=true`);
        const averagesRes = await fetch(`/api/wca/${wcaId}/${state.eventType}?getaverages=true`);

        if (solvesRes.ok) {
            const solvesData = await solvesRes.json();
            state.userSolves = solvesData.allResults || [];
        }
        if (averagesRes.ok) {
            const averagesData = await averagesRes.json();
            state.userAverages = averagesData.allAverages || [];
        }

        state.userSolves = state.userSolves.map((t) => (t <= 0 ? Infinity : t / 100));
        state.userAverages = state.userAverages.map((t) => (t <= 0 ? Infinity : t / 100));
    } catch (err) {
        throw new Error('Error fetching user solves/averages:', err);
    }
}

// === Rank helpers ===
function getSingleRank(time) {
    const sorted = [...state.userSolves, time].sort((a, b) => a - b);
    return sorted.indexOf(time) + 1;
}

function getAverageRank(time) {
    if (time === 'DNF') return state.userAverages.length;
    time = parseFloat(time);
    const sorted = [...state.userAverages, time].sort((a, b) => a - b);
    return sorted.indexOf(time) + 1;
}

// === Handle PR target checkbox ===
// Helper to get user's PR average (best non-DNF average)
function getUserPRAverage() {
    if (!state.userAverages.length) return null;
    const validAverages = state.userAverages.filter((a) => a !== Infinity && isFinite(a));
    if (!validAverages.length) return null;
    return Math.min(...validAverages).toFixed(2);
}

const usePrCheckbox = document.getElementById('usePrTarget');
const targetInput = document.getElementById('target');

usePrCheckbox.addEventListener('change', () => {
    if (usePrCheckbox.checked) {
        const pr = getUserPRAverage();
        if (pr) {
            targetInput.value = pr;
            targetInput.disabled = true;
            calculateBpaWpaTft(state.times, parseFloat(pr));
        }
    } else {
        targetInput.disabled = false;
        targetInput.value = '';
        calculateBpaWpaTft(state.times, Infinity);
    }
});

// === COOKIE HELPERS ===
function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
        JSON.stringify(value),
    )}; expires=${expires}; path=/`;
}

function getCookie(name) {
    const cookies = document.cookie.split('; ');
    const cookie = cookies.find((row) => row.startsWith(encodeURIComponent(name) + '='));
    if (!cookie) return null;
    try {
        const value = decodeURIComponent(cookie.split('=')[1]);
        return JSON.parse(value);
    } catch (e) {
        console.error(`Error parsing cookie ${name}:`, e);
        return null;
    }
}

function deleteCookie(name) {
    document.cookie = `${encodeURIComponent(
        name,
    )}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

// === SAVE & LOAD AVERAGES PER EVENT ===
function saveAveragesToCookies() {
    const grouped = {};

    // Group averages by event type
    state.averageTags.forEach((avg) => {
        if (!grouped[avg.event]) grouped[avg.event] = [];
        grouped[avg.event].push(avg);
    });

    // Save each event separately
    Object.keys(grouped).forEach((event) => {
        setCookie(`averages_${event}`, grouped[event], 365);
    });
}

function loadAveragesFromCookies() {
    const event = document.getElementById('event-type').value;
    const saved = getCookie(`averages_${event}`);
    if (saved && Array.isArray(saved)) {
        // Ensure all loaded averages have the event property set
        state.averageTags = saved.map((avg) => ({
            ...avg,
            event: avg.event || event,
        }));
        state.userSolves = [];
        state.userAverages = [];
        state.averageTags.forEach((avg) => {
            const values = avg.times.map((t) => {
                const timeValue = t.value ?? t.raw;
                return timeValue === -1 || timeValue === Infinity || timeValue <= 0
                    ? Infinity
                    : timeValue;
            });
            state.userSolves.push(...values);
            if (avg.average !== 'DNF' && isFinite(avg.average)) {
                state.userAverages.push(parseFloat(avg.average));
            }
        });
    } else {
        state.averageTags = [];
        state.userSolves = [];
        state.userAverages = [];
    }
    displayTags();
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
            tag.average = !isFinite(tag.average) ? 'DNF' : parseFloat(tag.average).toFixed(2);
            li.textContent = `Avg: ${tag.average}`;
            const rank = getAverageRank(tag.average);
            if (rank) {
                const rankSpan = document.createElement('span');
                rankSpan.textContent = ` PR${rank}`;
                rankSpan.style.float = 'right';
                li.appendChild(rankSpan);
            }

            const timesDiv = document.createElement('div');
            timesDiv.classList.add('times');

            const values = tag.times.map((t) => {
                const timeValue = t.value ?? t.raw;
                return timeValue === -1 ? Infinity : timeValue;
            });
            const min = Math.min(...values);
            const max = Math.max(...values);

            let markedBest = false;
            let markedWorst = false;

            tag.times.forEach((t) => {
                let span = document.createElement('span');
                const timeValue = t.value ?? t.raw;
                const val = timeValue === Infinity || timeValue === -1 ? 'DNF' : timeValue;
                span.textContent =
                    val === 'DNF' ? 'DNF' : typeof val === 'number' ? val.toFixed(2) : 'DNF';

                if (val === min && !markedBest) {
                    span.classList.add('best');
                    span.textContent = `[${span.textContent}]`;
                    markedBest = true;
                } else if ((val === max || val === 'DNF') && !markedWorst) {
                    span.classList.add('worst');
                    span.textContent = `[${span.textContent}]`;
                    markedWorst = true;
                }

                const solveRank = val === 'DNF' ? null : getSingleRank(timeValue);
                if (solveRank) span.textContent += ` (#${solveRank})`;

                timesDiv.appendChild(span);
                timesDiv.appendChild(document.createTextNode(' '));
            });

            li.appendChild(timesDiv);
            container.appendChild(li);
        });
}

// === Confirm before switching event mid-solve ===
const eventSelector = document.getElementById('event-type');
let lastEventType = eventSelector.value;

eventSelector.addEventListener('change', async (e) => {
    const newEvent = e.target.value;

    // Save incomplete solves for current event before switching
    const minSolvesForEvent = meanEvents.includes(state.eventType) ? 3 : 5;
    if (state.times.length > 0 && state.times.length < minSolvesForEvent) {
        setCookie(`incomplete_${state.eventType}`, state.times);
    } else if (state.times.length === 0) {
        deleteCookie(`incomplete_${state.eventType}`);
    }

    // Load incomplete solves for the new event if they exist
    const incompleteSolves = getCookie(`incomplete_${newEvent}`);
    if (incompleteSolves && Array.isArray(incompleteSolves)) {
        state.times = incompleteSolves;
        displayCurrentTimes();
    } else {
        state.times = [];
        displayCurrentTimes();
    }

    // Reset session-specific rankings
    state.userSolves = [];
    state.userAverages = [];
    state.averageTags = [];
    calculateStats();

    lastEventType = newEvent;
    state.eventType = newEvent;

    // Load event-specific averages and rebuild stats
    loadAveragesFromCookies();
    calculateStats();
});

// === Auto-load averages on page load ===
window.addEventListener('DOMContentLoaded', () => {
    state.eventType = document.getElementById('event-type').value;
    loadAveragesFromCookies();
    calculateStats();
});
