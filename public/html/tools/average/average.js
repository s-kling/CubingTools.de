let times = [];
let averageTags = [];
let wcaData = {};
let event = document.getElementById('event-type').value;
let userSolves = [];
let userAverages = [];

// === Add a time when Enter pressed ===
document.getElementById('timeInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTime();
});

// === Handle event type change ===
document.getElementById('event-type').addEventListener('change', async (e) => {
    event = e.target.value;
    await fetchUserData();
    calculateStats();
});

document.getElementById('target').addEventListener('input', calculateStats);

// === Add time ===
function addTime() {
    const input = document.getElementById('timeInput');
    const time = parseFloat(input.value);

    if (isNaN(time)) {
        alert('Please enter a valid number (e.g., 12.34).');
        input.value = '';
        return;
    }

    if (times.length >= 5) {
        times = [];
    }

    times.push({ raw: time, penalty: null, value: time });
    input.value = '';

    calculateStats();
    displayCurrentTimes();
}

// === Calculate stats for current session ===
function calculateStats() {
    const resultDiv = document.getElementById('result');
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
    const { bpa, wpa, tft } = calculateBpaWpaTft(times, target);

    document.getElementById('bpa').textContent = bpa ? bpa.toFixed(2) : '–';
    document.getElementById('wpa').textContent = wpa ? wpa.toFixed(2) : '–';
    document.getElementById('tft').textContent = tft ? tft.toFixed(2) : '–';
    document.getElementById('mean').textContent = mean ? mean : '0.00';

    // When an average of 5 is completed, store it
    if (ao5) {
        averageTags.push({ average: ao5, times: times.slice(-5) });
        displayTags();
    }
}

// === BPA / WPA / TFT calculation ===
function calculateBpaWpaTft(times, target) {
    console.log(times);
    if (times.length !== 4) return { bpa: null, wpa: null, tft: null };

    // Normalize times: convert objects into numbers
    const last4 = times.slice(-4).map((t) => {
        if (typeof t === 'object') {
            if (t.dnf) return 'DNF';
            return t.time + (t.plus2 ? 2 : 0);
        }
        return t; // plain number fallback
    });

    // Count DNFs
    const dnfCount = last4.filter((t) => t === 'DNF').length;

    if (dnfCount > 1) {
        return { bpa: 'DNF', wpa: 'DNF', tft: null };
    }

    // If exactly 1 DNF, exclude it only in WPA (worst) calculation
    const validTimes = last4.filter((t) => t !== 'DNF');

    const best = Math.min(...validTimes);
    const worst = Math.max(...validTimes);

    const sum = validTimes.reduce((a, b) => a + b, 0);

    let bpa, wpa;
    if (dnfCount === 1) {
        // BPA is impossible if 1 DNF (best+avg), WPA can still be computed
        bpa = 'DNF';
        wpa = (sum - best) / 3;
    } else {
        bpa = (sum - worst) / 3;
        wpa = (sum - best) / 3;
    }

    // TFT (time for target)
    let tft = null;
    if (target !== Infinity && dnfCount === 0) {
        const needed = target * 3 - (sum - best - worst);
        tft = needed;
    }

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

            const sorted = tag.times.map((t) => parseFloat(t));
            const min = Math.min(...sorted);
            const max = Math.max(...sorted);

            tag.times.forEach((t) => {
                let span = document.createElement('span');
                t = t.value;
                span.textContent = t.toFixed(2);

                // Mark best/worst
                if (t === min) {
                    span.classList.add('best');
                    span.textContent = `[${span.textContent}]`;
                }
                if (t === max) {
                    span.classList.add('worst');
                    span.textContent = `[${span.textContent}]`;
                }

                // Add rank
                const solveRank = getSolveRank(t);
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

        // Show penalty buttons only if no penalty applied
        if (!solve.penalty) {
            const btns = document.createElement('div');
            btns.classList.add('penalty-buttons');

            const plus2Btn = document.createElement('button');
            plus2Btn.textContent = '+2';
            plus2Btn.onclick = () => applyPenalty(i, 'plus2');

            const dnfBtn = document.createElement('button');
            dnfBtn.textContent = 'DNF';
            dnfBtn.onclick = () => applyPenalty(i, 'dnf');

            btns.appendChild(plus2Btn);
            btns.appendChild(dnfBtn);
            wrapper.appendChild(btns);
        }

        container.appendChild(wrapper);
    });
}

// === Apply penalty to a solve ===
function applyPenalty(index, type) {
    const solve = times[index];
    if (!solve || solve.penalty) return; // already has penalty

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

// === Handle WCA ID input ===
document.getElementById('wca').addEventListener('input', async (e) => {
    const wcaId = e.target.value.trim().toUpperCase();
    if (!wcaId) return;

    if (!/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId)) return;

    try {
        const response = await fetch(
            `https://www.worldcubeassociation.org/api/v0/persons/${wcaId}`
        );
        if (!response.ok) throw new Error('Failed to fetch WCA data');

        wcaData = await response.json();
        await fetchUserData();
        calculateStats();
    } catch (err) {
        console.error(err);
        alert('Could not fetch WCA data. Check the ID.');
    }
});

// === Fetch solves & averages for ranking ===
async function fetchUserData() {
    if (!wcaData) return;
    const wcaId = wcaData.person.id;

    try {
        const solvesRes = await fetch(`/api/wca/${wcaId}/${event}?getsolves=true`);
        const averagesRes = await fetch(`/api/wca/${wcaId}/${event}?getaverages=true`);

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
