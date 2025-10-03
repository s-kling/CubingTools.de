let times = [];
let averageTags = [];
let wcaData = {};
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
    await fetchUserData();
    calculateStats();
});

// === Recalculate when target time changes ===
document.getElementById('target').addEventListener('input', calculateStats);

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
    let time = parseFloat(input.value);

    if (isNaN(time)) {
        alert('Please enter a valid number or DNF');
        input.value = '';
        return;
    }

    if (times.length >= 5) {
        times = [];
    }

    if (time == 'DNF') {
        time = Infinity;
        penalty = 'dnf';
    }

    times.push({ raw: time, penalty: null, value: time });
    input.value = '';

    calculateStats();
    displayCurrentTimes();
}

// === Calculate stats for current session ===
function calculateStats() {
    const resultDiv = document.getElementById('stats');
    const n = times.length;

    if (n === 0) {
        resultDiv.textContent = '';
        return;
    }

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

    document.getElementById('mean').textContent = mean ? (isFinite(mean) ? mean : 'DNF') : '0.00';
    document.getElementById('bpa').textContent = bpa === 'DNF' ? 'DNF' : bpa ? bpa.toFixed(2) : '-';
    document.getElementById('wpa').textContent = wpa === 'DNF' ? 'DNF' : wpa ? wpa.toFixed(2) : '-';
    document.getElementById('tft').textContent = tft;

    // When an average of 5 is completed, store it
    if (ao5) {
        averageTags.push({ average: ao5, times: times.slice(-5) });
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
            li.textContent = `Avg: ${tag.average}`;

            // Add ranking if WCA data available
            const rank = getAverageRank(parseFloat(tag.average));
            if (rank) li.textContent += ` (#${rank})`;

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
                const solveRank = getSolveRank(val);
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

        const rank = getSolveRank(solve.value);
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

    calculateStats();
    displayCurrentTimes();
}

// === Remove penalty from a solve ===
function removePenalty(index) {
    const solve = times[index];
    if (!solve || !solve.penalty) return; // no penalty to remove

    solve.penalty = null;
    solve.value = solve.raw;

    calculateStats();
    displayCurrentTimes();
}

// === Handle WCA ID input ===
document.getElementById('wca').addEventListener('input', async () => {
    const wcaId = document.getElementById('wca').value.trim().toUpperCase();
    if (!wcaId) return;

    if (!/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId)) return;

    try {
        const response = await fetch(
            `/api/wca/${wcaId}/${eventType}?getsolves=true`
        );
        if (!response.ok) throw new Error('Failed to fetch WCA data');

        wcaData = await response.json();
        await fetchUserData(wcaId);
        calculateStats();
    } catch (err) {
        console.error(err);
        alert('Could not fetch WCA data. Check the ID.');
    }
});

// === Fetch solves & averages for ranking ===
async function fetchUserData(wcaId) {
    if (!wcaData) return;

    try {
        const solvesRes = await fetch(`/api/wca/${wcaId}/${eventType}?getsolves=true`);
        const averagesRes = await fetch(`/api/wca/${wcaId}/${eventType}?getaverages=true`);

        if (solvesRes.ok) userSolves = await solvesRes.json();
        if (averagesRes.ok) userAverages = await averagesRes.json();
    } catch (err) {
        console.error('Error fetching user solves/averages:', err);
    }
}

// === Rank helpers ===
function getSolveRank(time) {
    if (!userSolves.length) return null;
    const sorted = [...userSolves, time].sort((a, b) => a - b);
    return sorted.indexOf(time) + 1;
}

function getAverageRank(avg) {
    if (!userAverages.length) return null;
    const sorted = [...userAverages, avg].sort((a, b) => a - b);
    return sorted.indexOf(avg) + 1;
}

// === Get user PR Average (from WCA data) ===
function getUserPRAverage() {
    if (!wcaData) return null;

    const eventId = document.getElementById('event-type').value;
    const records = wcaData.personal_records[eventId];
    if (records && records.average) {
        return (records.average / 100).toFixed(2);
    }
    return null;
}

// === Handle PR target checkbox ===
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
