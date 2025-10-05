let times = [];
let averageTags = [];
let eventType = document.getElementById('event-type').value;
let userSolves = [];
let userAverages = [];

// === Format input field on input ===
document.getElementById('timeInput').addEventListener('input', (e) => {
    formatInputField(e.target);
});

// === Add a time when Enter pressed ===
document.getElementById('timeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTime();
});

// === Handle event type change ===
document.getElementById('event-type').addEventListener('change', async (e) => {
    eventType = e.target.value;
    const wcaId = document.getElementById('wca').value.trim().toUpperCase();
    if (!wcaId) return;
    if (!/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId)) return;
    await fetchUserData(wcaId);
    calculateStats();
});

// === Recalculate when target time changes ===
document.getElementById('target').addEventListener('input', (e) => {
    calculateStats();
    formatInputField(e.target);
});

// === Format input field ===
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

// === Add time ===
function addTime() {
    const input = document.getElementById('timeInput');
    let time = input.value;

    let penalty = null;

    if (times.length >= 5) {
        times = [];
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
    const averageId = `${event}${averageTags.length > 0 ? averageTags.length : 1}`;

    times.push({ raw: time, penalty: penalty, value: time, event: event, averageId: averageId });
    userSolves.push(time); // add to user solves for ranking
    input.value = '';

    calculateStats();
    displayCurrentTimes();
}

// === Calculate stats for current session ===
function calculateStats() {
    const n = times.length;

    if (n === 0) return;

    let html = '';
    const mean = (times.reduce((a, b) => a + b.value, 0) / n).toFixed(2);

    let ao5 = null;
    if (n >= 5) {
        const last5 = times
            .slice(-5)
            .map((t) => t.value)
            .sort((a, b) => a - b);
        const trimmed = last5.slice(1, 4);
        ao5 = (trimmed.reduce((a, b) => a + b, 0) / 3).toFixed(2);
        html += `<div><strong>Average of 5:</strong> ${ao5}</div>`;
    }

    const target = parseFloat(document.getElementById('target').value) || Infinity;
    let { bpa, wpa, tft } = calculateBpaWpaTft(times, target);

    // First test if tft exists, set to -
    tft = tft ? tft : '-';
    // Then test if tft is a number, format to 2 decimals
    tft = !isNaN(tft) ? tft.toFixed(2) : tft;

    const meanElem = document.getElementById('mean');
    if (meanElem) meanElem.textContent = mean ? (isFinite(mean) ? mean : 'DNF') : '0.00';

    const bpaElem = document.getElementById('bpa');
    if (bpaElem) bpaElem.textContent = bpa === 'DNF' ? 'DNF' : bpa ? bpa.toFixed(2) : '-';

    const wpaElem = document.getElementById('wpa');
    if (wpaElem) wpaElem.textContent = wpa === 'DNF' ? 'DNF' : wpa ? wpa.toFixed(2) : '-';

    const tftElem = document.getElementById('tft');
    if (tftElem) tftElem.textContent = tft;

    // When an average of 5 is completed, store it
    if (ao5) {
        const event = document.getElementById('event-type').value;
        const avgId = times[times.length - 1].averageId;

        averageTags.push({ average: ao5, times: times.slice(-5), event: event, averageId: avgId });
        ao5 = ao5 === 'DNF' ? 'DNF' : parseFloat(ao5);
        userAverages.push(ao5); // add to user averages for ranking
        displayTags();
    }
}

// === BPA / WPA / TFT calculation ===
function calculateBpaWpaTft(times, target) {
    if (times.length !== 4) return { bpa: null, wpa: null, tft: null };

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

// === Sidebar averages display ===
function displayTags() {
    const container = document.getElementById('tagContainer');
    container.innerHTML = '';

    averageTags
        .slice()
        .reverse()
        .forEach((tag) => {
            const li = document.createElement('li');
            tag.average = !isFinite(tag.average) ? 'DNF' : parseFloat(tag.average).toFixed(2);
            li.textContent = `Avg: ${tag.average}`;

            // Add ranking if WCA data available
            const rank = getAverageRank(tag.average);
            if (rank) {
                const rankSpan = document.createElement('span');
                rankSpan.textContent = ` PR${rank}`;
                rankSpan.style.float = 'right';
                li.appendChild(rankSpan);
            }

            const timesDiv = document.createElement('div');
            timesDiv.classList.add('times');

            const values = tag.times.map((t) => t.value);
            const min = Math.min(...values);
            const max = Math.max(...values);

            let markedBest = false;
            let markedWorst = false;

            tag.times.forEach((t) => {
                let span = document.createElement('span');
                const val = t.value === Infinity ? 'DNF' : t.value;
                span.textContent = val === 'DNF' ? 'DNF' : val.toFixed(2);

                // Mark best/worst
                if (val === min && !markedBest) {
                    span.classList.add('best');
                    span.textContent = `[${span.textContent}]`;
                    markedBest = true;
                } else if ((val === max || val === 'DNF') && !markedWorst) {
                    span.classList.add('worst');
                    span.textContent = `[${span.textContent}]`;
                    markedWorst = true;
                }

                // Add rank
                const solveRank = getSingleRank(val);
                if (solveRank) {
                    span.textContent += ` (#${solveRank})`;
                }

                timesDiv.appendChild(span);
                timesDiv.appendChild(document.createTextNode(' '));
            });

            li.appendChild(timesDiv);
            container.appendChild(li);
        });
}

// === Display current times in right container ===
function displayCurrentTimes() {
    const container = document.getElementById('currentTimes');
    container.innerHTML = '';

    times.forEach((solve, i) => {
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
    const solve = times[index];

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
    averageTags = averageTags.filter((tag) => tag.averageId !== avgId);
    // Remove from averages
    userAverages.shift();

    calculateStats();
    displayCurrentTimes();
}

// === Remove penalty from a solve ===
function removePenalty(index) {
    const solve = times[index];
    if (!solve || !solve.penalty) return; // no penalty to remove

    solve.penalty = null;
    solve.value = solve.raw;

    // Use average ID to remove the average from the list, then re-add it with the penalty applied
    const avgId = solve.averageId;
    // Remove from list
    averageTags = averageTags.filter((tag) => tag.averageId !== avgId);
    // Remove from averages
    userAverages.shift();

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
        const solvesRes = await fetch(`/api/wca/${wcaId}/${eventType}?getsolves=true`);
        const averagesRes = await fetch(`/api/wca/${wcaId}/${eventType}?getaverages=true`);

        if (solvesRes.ok) {
            const solvesData = await solvesRes.json();
            userSolves = solvesData.allResults || [];
        }
        if (averagesRes.ok) {
            const averagesData = await averagesRes.json();
            userAverages = averagesData.allAverages || [];
        }

        userSolves = userSolves.map((t) => (t <= 0 ? Infinity : t / 100));
        userAverages = userAverages.map((t) => (t <= 0 ? Infinity : t / 100));
    } catch (err) {
        throw new Error('Error fetching user solves/averages:', err);
    }
}

// === Rank helpers ===
function getSingleRank(time) {
    const sorted = [...userSolves, time].sort((a, b) => a - b);

    return sorted.indexOf(time) + 1;
}

function getAverageRank(time) {
    if (time === 'DNF') return userAverages.length;
    time = parseFloat(time);

    const sorted = [...userAverages, time].sort((a, b) => a - b);

    return sorted.indexOf(time) + 1;
}

// === Handle PR target checkbox ===
// Helper to get user's PR average (best non-DNF average)
function getUserPRAverage() {
    if (!userAverages.length) return null;
    const validAverages = userAverages.filter((a) => a !== Infinity && isFinite(a));
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
        }
    } else {
        targetInput.disabled = false;
        targetInput.value = '';
    }
});

// === COOKIE HELPERS ===
function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
        JSON.stringify(value)
    )}; expires=${expires}; path=/`;
}

function getCookie(name) {
    const cookies = document.cookie.split('; ');
    const cookie = cookies.find((row) => row.startsWith(encodeURIComponent(name) + '='));
    if (!cookie) return null;
    try {
        return JSON.parse(decodeURIComponent(cookie.split('=')[1]));
    } catch {
        return null;
    }
}

function deleteCookie(name) {
    document.cookie = `${encodeURIComponent(
        name
    )}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

// === SAVE & LOAD AVERAGES PER EVENT ===
function saveAveragesToCookies() {
    const grouped = {};

    // Group averages by event type
    averageTags.forEach((avg) => {
        if (!grouped[avg.event]) grouped[avg.event] = [];
        grouped[avg.event].push(avg);
    });

    // Save each event separately
    Object.keys(grouped).forEach((event) => {
        setCookie(`averages_${event}`, grouped[event]);
    });
}

function loadAveragesFromCookies() {
    const event = document.getElementById('event-type').value;
    const saved = getCookie(`averages_${event}`);
    if (saved && Array.isArray(saved)) {
        averageTags = saved;
        displayTags();

        // Rebuild userSolves and userAverages from saved data
        userSolves = [];
        userAverages = [];
        saved.forEach((avg) => {
            const values = avg.times.map((t) =>
                t.value === Infinity || t.value <= 0 ? Infinity : t.value
            );
            userSolves.push(...values);
            if (avg.average !== 'DNF' && isFinite(avg.average)) {
                userAverages.push(parseFloat(avg.average));
            }
        });
    } else {
        // No stored averages for this event
        averageTags = [];
        userSolves = [];
        userAverages = [];
        displayTags();
    }
}

// === Modify displayTags() to only show averages for current event ===
const originalDisplayTags = displayTags;
displayTags = function () {
    const container = document.getElementById('tagContainer');
    container.innerHTML = '';

    const currentEvent = document.getElementById('event-type').value;
    const eventAverages = averageTags.filter((tag) => tag.event === currentEvent);

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

            const values = tag.times.map((t) => t.value);
            const min = Math.min(...values);
            const max = Math.max(...values);

            let markedBest = false;
            let markedWorst = false;

            tag.times.forEach((t) => {
                let span = document.createElement('span');
                const val = t.value === Infinity ? 'DNF' : t.value;
                span.textContent = val === 'DNF' ? 'DNF' : val.toFixed(2);

                if (val === min && !markedBest) {
                    span.classList.add('best');
                    span.textContent = `[${span.textContent}]`;
                    markedBest = true;
                } else if ((val === max || val === 'DNF') && !markedWorst) {
                    span.classList.add('worst');
                    span.textContent = `[${span.textContent}]`;
                    markedWorst = true;
                }

                const solveRank = getSingleRank(val);
                if (solveRank) span.textContent += ` (#${solveRank})`;

                timesDiv.appendChild(span);
                timesDiv.appendChild(document.createTextNode(' '));
            });

            li.appendChild(timesDiv);
            container.appendChild(li);
        });

    // Save to cookies after updating
    saveAveragesToCookies();
};

// === Confirm before switching event mid-solve ===
const eventSelector = document.getElementById('event-type');
let lastEventType = eventSelector.value;

eventSelector.addEventListener('change', async (e) => {
    const newEvent = e.target.value;

    // Warn if user has unsaved solves or averages in current event
    if (times.length > 0 || userSolves.length > 0 || userAverages.length > 0) {
        const confirmSwitch = confirm(
            "⚠️ You're in the middle of a session. Switching events will:\n" +
                '• Clear all current solves and averages.\n' +
                '• Reset your WCA-based ranks.\n' +
                '• Load stored averages for the new event.\n\n' +
                'Do you want to continue?'
        );
        if (!confirmSwitch) {
            e.target.value = lastEventType;
            return;
        }

        // Clear current data before switching
        times = [];
        userSolves = [];
        userAverages = [];
        calculateStats();
        displayCurrentTimes();
    }

    lastEventType = newEvent;
    eventType = newEvent;

    // Load event-specific averages and rebuild stats
    loadAveragesFromCookies();
    calculateStats();
});

// === Auto-load averages on page load ===
window.addEventListener('DOMContentLoaded', () => {
    loadAveragesFromCookies();
});
