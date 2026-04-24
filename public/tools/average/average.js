const state = {
    times: [],
    averageTags: [],
    eventType: document.getElementById('event-type').value,
    userSolves: [],
    userAverages: [],
    editIndex: null,
    mode: 'input', // 'input' or 'timer'
    timerRunning: false,
    timerStart: null,
    timerReady: false,
    timerHolding: false,
    timerAnimFrame: null,
    currentScramble: null,
    undoData: null,
    previousAverage: null,
    sessionPrSingle: {},
    sessionPrAverage: {},
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
    updateTargetDisplay();
    setStorage('setting_target', e.target.value);
});

// === Update target display on timer page ===
function updateTargetDisplay() {
    const targetEl = document.getElementById('timerTarget');
    if (!targetEl) return;
    const targetVal = document.getElementById('target').value;
    if (targetVal && parseFloat(targetVal) > 0) {
        targetEl.textContent = `Target: ${targetVal}`;
        targetEl.classList.add('visible');
    } else {
        targetEl.classList.remove('visible');
    }
}

// === Format input field ===
function formatInputField(input) {
    var currentValue = input.value;

    // Test if there are any letters in the input, if so set to DNF
    // Check if the last character is a number, if so set to that number
    if (/[a-zA-Z]/.test(currentValue)) {
        const lastCharacter = currentValue.slice(-1);
        if (/\d/.test(lastCharacter)) {
            input.value = lastCharacter;
        } else {
            input.value = 'DNF';
            return;
        }
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

// === Format time for display (handles minutes:seconds) ===
function formatTime(seconds) {
    if (seconds === Infinity || seconds === -1) return 'DNF';
    if (typeof seconds !== 'number' || isNaN(seconds)) return 'DNF';
    if (seconds >= 60) {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(2);
        return `${mins}:${secs.padStart(5, '0')}`;
    }
    return seconds.toFixed(2);
}

// === Get required solve count for current event ===
function getRequiredSolves() {
    return meanEvents.includes(state.eventType) ? 3 : 5;
}

// === Update progress bar ===
function updateProgress() {
    const required = getRequiredSolves();
    const current = state.times.length;
    const pct = Math.min((current / required) * 100, 100);

    const fill = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');
    const hint = document.getElementById('solveCountHint');

    if (fill) {
        fill.style.width = `${pct}%`;
        fill.classList.toggle('complete', current >= required);
    }
    if (label) {
        label.textContent = `${current} / ${required} solves`;
    }
    if (hint) {
        hint.textContent = required;
    }
}

// === Update session stats ===
function updateSessionStats() {
    const currentEvent = document.getElementById('event-type').value;
    const eventAverages = state.averageTags.filter((tag) => tag.event === currentEvent);

    const bestElem = document.getElementById('sessionBest');
    const avgElem = document.getElementById('sessionAvg');
    const countElem = document.getElementById('sessionCount');
    const deleteShame = document.getElementById('deleteStatShame');

    if (eventAverages.length === 0) {
        if (bestElem) bestElem.textContent = '-';
        if (avgElem) avgElem.textContent = '-';
        if (countElem) countElem.textContent = '0';
        if (deleteShame) deleteShame.textContent = state.deleteStatShameCounter || 0;
        return;
    }

    const validAverages = eventAverages
        .map((a) => parseFloat(a.average))
        .filter((a) => !isNaN(a) && isFinite(a));

    if (validAverages.length > 0) {
        const best = Math.min(...validAverages);
        const mean = validAverages.reduce((a, b) => a + b, 0) / validAverages.length;
        if (bestElem) bestElem.textContent = formatTime(best);
        if (avgElem) avgElem.textContent = formatTime(mean);
    } else {
        if (bestElem) bestElem.textContent = 'DNF';
        if (avgElem) avgElem.textContent = 'DNF';
    }

    if (countElem) countElem.textContent = eventAverages.length;
    if (deleteShame) deleteShame.textContent = state.deleteStatShameCounter || 0;
}

// === Update averages empty state ===
function updateAveragesEmptyState() {
    const currentEvent = document.getElementById('event-type').value;
    const eventAverages = state.averageTags.filter((tag) => tag.event === currentEvent);
    const emptyEl = document.getElementById('averagesEmpty');
    const listEl = document.getElementById('tagContainer');

    if (emptyEl) {
        emptyEl.style.display = eventAverages.length === 0 ? 'block' : 'none';
    }
    if (listEl) {
        listEl.style.display = eventAverages.length === 0 ? 'none' : 'block';
    }
}

// === Add time ===
function addTime() {
    const input = document.getElementById('timeInput');
    let time = input.value;

    let penalty = null;

    const required = getRequiredSolves();
    if (state.times.length >= required) {
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
    const averageId = `${event}-${Date.now()}`;

    // Save undo state before modification
    saveUndoState();

    state.times.push({
        raw: time,
        penalty: penalty,
        value: time,
        event: event,
        averageId: averageId,
        scramble: state.currentScramble,
    });
    state.userSolves.push(time); // add to user solves for ranking

    // Track session PR single
    if (
        time !== -1 &&
        time !== Infinity &&
        (!state.sessionPrSingle[event] || time < state.sessionPrSingle[event].value)
    ) {
        state.sessionPrSingle[event] = {
            value: time,
            scramble: state.currentScramble,
            event: event,
        };
    }

    input.value = '';

    calculateStats();
    displayCurrentTimes();
    updateProgress();
    updateUndoButton();
    saveIncomplete();
    fetchScramble();
}

// === Calculate stats for current session ===
function calculateStats() {
    const n = state.times.length;

    updateProgress();
    updateSessionStats();
    updateAveragesEmptyState();

    const required = getRequiredSolves();

    const tftElem = document.getElementById('tft');
    const wpaElem = document.getElementById('wpa');
    const bpaElem = document.getElementById('bpa');
    const meanElem = document.getElementById('mean');
    const averageElem = document.getElementById('average');

    const duringAverageElem = document.querySelectorAll('.during-average');
    const afterAverageElem = document.querySelectorAll('.after-average');

    if (n !== required && n !== required - 1) {
        averageElem.style.display = 'none';
        if (meanElem) meanElem.textContent = '0.00';
        if (bpaElem) bpaElem.textContent = '-';
        if (wpaElem) wpaElem.textContent = '-';
        if (tftElem) tftElem.textContent = '–';

        duringAverageElem.forEach((el) => (el.style.display = 'flex'));
        afterAverageElem.forEach((el) => (el.style.display = 'none'));

        return;
    }

    if (n >= required) {
        meanElem.style.display = 'none';
        bpaElem.style.display = 'none';
        wpaElem.style.display = 'none';
        tftElem.style.display = 'none';
        averageElem.style.display = 'block';

        duringAverageElem.forEach((el) => (el.style.display = 'none'));
        afterAverageElem.forEach((el) => (el.style.display = 'flex'));
    }

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

    tft = tft ? tft : '-';
    tft = !isNaN(tft) ? formatTime(tft) : tft;

    if (meanElem)
        meanElem.textContent = mean
            ? isFinite(mean)
                ? formatTime(parseFloat(mean))
                : 'DNF'
            : '0.00';
    if (bpaElem) bpaElem.textContent = bpa === 'DNF' ? 'DNF' : !isNaN(bpa) ? formatTime(bpa) : '-';
    if (wpaElem) wpaElem.textContent = wpa === 'DNF' ? 'DNF' : !isNaN(wpa) ? formatTime(wpa) : '-';
    if (tftElem) tftElem.textContent = tft;

    const event = document.getElementById('event-type').value;

    if (mo3 && n === 3) {
        const avgId = state.times[state.times.length - 1].averageId;

        const alreadySaved = state.averageTags.some((tag) => tag.averageId === avgId);
        console.log(alreadySaved);
        if (!alreadySaved) {
            const newTag = { average: mo3, times: state.times.slice(-3), event, averageId: avgId };
            console.log(newTag);
            state.averageTags.push(newTag);
            console.log(state.averageTags);
            state.previousAverage = newTag;

            const moVal = parseFloat(mo3);
            if (
                !isNaN(moVal) &&
                isFinite(moVal) &&
                (!state.sessionPrAverage[event] ||
                    moVal < parseFloat(state.sessionPrAverage[event].average))
            ) {
                state.sessionPrAverage[event] = { ...newTag };
            }

            saveAverages();
            deleteStorage(`ct_incomplete_${event}`);
            state.userAverages.push(mo3 === 'DNF' ? 'DNF' : parseFloat(mo3));
            averageElem.innerText = mo3 === 'DNF' ? 'DNF' : formatTime(parseFloat(mo3));
            displayTags();
            updateProgress();
            updateSessionStats();
            updatePrTarget();
        }
    }

    if (ao5 && n === 5) {
        const avgId = state.times[state.times.length - 1].averageId;

        const alreadySaved = state.averageTags.some((tag) => tag.averageId === avgId);
        console.log(alreadySaved);
        if (!alreadySaved) {
            const newTag = { average: ao5, times: state.times.slice(-5), event, averageId: avgId };
            console.log(newTag);
            state.averageTags.push(newTag);
            console.log(state.averageTags);
            state.previousAverage = newTag;

            const aoVal = parseFloat(ao5);
            if (
                !isNaN(aoVal) &&
                isFinite(aoVal) &&
                (!state.sessionPrAverage[event] ||
                    aoVal < parseFloat(state.sessionPrAverage[event].average))
            ) {
                state.sessionPrAverage[event] = { ...newTag };
            }

            saveAverages();
            deleteStorage(`ct_incomplete_${event}`);
            state.userAverages.push(ao5 === 'DNF' ? 'DNF' : parseFloat(ao5));
            averageElem.innerText = ao5 === 'DNF' ? 'DNF' : formatTime(parseFloat(ao5));
            displayTags();
            updateProgress();
            updateSessionStats();
            updatePrTarget();
        }
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
            displayText = `${formatTime(solve.raw)}+`;
        } else {
            displayText = formatTime(solve.raw);
        }

        const rank = getSingleRank(solve.value);
        if (rank) displayText += ` (PR${rank})`;

        const textSpan = document.createElement('span');
        textSpan.classList.add('solve-text');
        textSpan.textContent = displayText;
        wrapper.appendChild(textSpan);

        const btns = document.createElement('div');
        btns.classList.add('penalty-buttons');

        const okayBtn = createButton({
            icon: 'fas fa-check',
            type: 'confirm',
            onClick: () => removePenalty(i),
        });

        const plus2Btn = createButton({
            text: '+',
            type: 'plus2',
            onClick: () => applyPenalty(i, 'plus2'),
        });

        const dnfBtn = createButton({
            text: 'x',
            type: 'dnf',
            onClick: () => applyPenalty(i, 'dnf'),
        });

        const editBtn = createButton({
            icon: 'fas fa-pen',
            type: 'edit',
            onClick: () => openEditModal(i),
        });

        const deleteBtn = createButton({
            icon: 'fas fa-times-circle',
            type: 'delete',
            onClick: () => deleteTime(i),
        });

        btns.appendChild(okayBtn);
        btns.appendChild(plus2Btn);
        btns.appendChild(dnfBtn);
        btns.appendChild(editBtn);
        btns.appendChild(deleteBtn);
        wrapper.appendChild(btns);

        container.appendChild(wrapper);
    });
}

// === Create a button helper ===
function createButton({ text, icon, color, type = 'confirm', onClick }) {
    const btn = document.createElement('button');
    if (icon) {
        btn.innerHTML = `<i class="${icon}"></i>`;
    } else {
        btn.textContent = text;
    }
    btn.classList.add('penalty-btn', type);
    if (color) {
        btn.style.borderColor = color;
        btn.style.color = color;
    }
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
    saveAverages();
    // Remove from averages
    state.userAverages.shift();

    calculateStats();
    displayCurrentTimes();
    saveIncomplete();
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
    saveAverages();
    // Remove from averages
    state.userAverages.shift();

    calculateStats();
    displayCurrentTimes();
    saveIncomplete();
}

// === Edit modal ===
function openEditModal(index) {
    const solve = state.times[index];
    if (!solve) return;

    state.editIndex = index;

    let currentValue;
    if (solve.raw === -1) {
        currentValue = 'DNF';
    } else {
        currentValue = formatTime(solve.raw);
    }

    const modal = document.getElementById('editModal');
    const editInput = document.getElementById('editTimeInput');
    modal.hidden = false;
    editInput.value = currentValue;
    editInput.focus();
    editInput.select();
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.hidden = true;
    state.editIndex = null;
    document.getElementById('timeInput').focus();
}

function confirmEdit() {
    const index = state.editIndex;
    if (index === null) return;

    const solve = state.times[index];
    if (!solve) return;

    const editInput = document.getElementById('editTimeInput');
    let time = editInput.value;
    let penalty = null;

    if (time.toUpperCase() === 'DNF') {
        time = -1;
        penalty = 'dnf';
    } else if (time.includes(':')) {
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
        if (isNaN(time)) {
            alert('Invalid time format');
            return;
        }
    }

    solve.raw = time;
    solve.value = time;
    solve.penalty = penalty;

    // Remove the average that this time belongs to, since the value changed
    const avgId = solve.averageId;
    state.averageTags = state.averageTags.filter((tag) => tag.averageId !== avgId);
    saveAverages();
    state.userAverages = state.userAverages.filter((avg) => avg !== solve.value);

    closeEditModal();
    calculateStats();
    displayCurrentTimes();
    saveIncomplete();
}

// Edit modal event listeners
document.getElementById('editCancel').addEventListener('click', closeEditModal);
document.getElementById('editConfirm').addEventListener('click', confirmEdit);
document.getElementById('editTimeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') closeEditModal();
});
document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
});

// === Confirm popup ===
let _confirmCallback = null;

function showConfirmPopup(title, message, onConfirm) {
    const popup = document.getElementById('confirmPopup');
    document.getElementById('confirmPopupTitle').textContent = title;
    document.getElementById('confirmPopupMessage').textContent = message;
    _confirmCallback = onConfirm;
    popup.hidden = false;
}

function closeConfirmPopup() {
    document.getElementById('confirmPopup').hidden = true;
    _confirmCallback = null;
}

document.getElementById('confirmPopupCancel').addEventListener('click', closeConfirmPopup);
document.getElementById('confirmPopupConfirm').addEventListener('click', () => {
    if (_confirmCallback) _confirmCallback();
    closeConfirmPopup();
});
document.getElementById('confirmPopup').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirmPopup();
});

// === Delete a time ===
function deleteTime(index) {
    showConfirmPopup(
        'Delete this time?',
        'This solve will be removed from the current set.',
        () => {
            const solve = state.times[index];
            if (!solve) return;

            // Remove the average that this time belongs to, since the set is incomplete now
            const avgId = solve.averageId;
            state.averageTags = state.averageTags.filter((tag) => tag.averageId !== avgId);
            saveAverages();
            // Remove from averages
            state.userAverages = state.userAverages.filter((avg) => avg !== solve.value);

            // Remove the time from the current session
            state.times.splice(index, 1);

            // Update the delete stat shame counter
            state.deleteStatShameCounter = (parseInt(state.deleteStatShameCounter, 10) || 0) + 1;
            localStorage.setItem('deleteStatShameCounter', state.deleteStatShameCounter);

            calculateStats();
            displayCurrentTimes();
            updateProgress();
            saveIncomplete();
        },
    );
}

// === Delete a single average ===
function deleteAverage(averageId) {
    showConfirmPopup(
        'Delete this average?',
        'This average and its solves will be permanently removed.',
        () => {
            state.averageTags = state.averageTags.filter((tag) => tag.averageId !== averageId);
            saveAverages();

            // If no averages left for this event, also delete the cookie
            const currentEvent = document.getElementById('event-type').value;
            const eventAverages = state.averageTags.filter((tag) => tag.event === currentEvent);
            if (eventAverages.length === 0) {
                deleteStorage(`averages_${currentEvent}`);
            }

            // Rebuild user averages
            state.userAverages = state.averageTags
                .filter((tag) => tag.event === currentEvent)
                .map((a) => parseFloat(a.average))
                .filter((a) => !isNaN(a) && isFinite(a));

            displayTags();
            updateSessionStats();
            updateAveragesEmptyState();
        },
    );
}

// === Clear all averages for current event ===
function clearAllAverages() {
    const currentEvent = document.getElementById('event-type').value;
    const eventAverages = state.averageTags.filter((tag) => tag.event === currentEvent);

    if (eventAverages.length === 0) return;

    showConfirmPopup(
        `Clear all ${eventAverages.length} averages?`,
        'All averages for this event will be permanently removed.',
        () => {
            state.averageTags = state.averageTags.filter((tag) => tag.event !== currentEvent);
            deleteStorage(`averages_${currentEvent}`);

            state.userAverages = [];
            state.userSolves = [];

            displayTags();
            updateSessionStats();
            updateAveragesEmptyState();
        },
    );
}

document.getElementById('clearAllBtn').addEventListener('click', clearAllAverages);

// ! WCA DATA

// === Handle WCA ID input ===
document.getElementById('wca').addEventListener('input', async () => {
    const wcaId = document.getElementById('wca').value.trim().toUpperCase();
    setStorage('setting_wca', wcaId);
    if (!wcaId) return;

    if (!/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId) || wcaId.length !== 10) return;

    try {
        await fetchUserData(wcaId);
        calculateStats();
        updatePrTarget();

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
        window.showUserErrorPopup({
            title: 'Could not load WCA data',
            message: 'WCA results could not be loaded for the average calculator.',
            error: err,
            reportTitle: 'Average calculator failed to load WCA data',
            reportContext: `Loading WCA data failed for ${wcaId} in event ${state.eventType}.`,
            dedupeKey: `average-wca:${wcaId}:${state.eventType}`,
        });
    }
});

// === Fetch solves & averages for ranking ===
async function fetchUserData(wcaId) {
    const [solvesData, averagesData] = await Promise.all([
        window.fetchJsonOrThrow(`/api/wca/${wcaId}/${state.eventType}?getsolves=true`, {
            errorContext: 'Could not load WCA solves',
        }),
        window.fetchJsonOrThrow(`/api/wca/${wcaId}/${state.eventType}?getaverages=true`, {
            errorContext: 'Could not load WCA averages',
        }),
    ]);

    state.userSolves = Array.isArray(solvesData?.allResults) ? solvesData.allResults : [];
    state.userAverages = Array.isArray(averagesData?.allAverages) ? averagesData.allAverages : [];

    state.userSolves = state.userSolves.map((t) => (t <= 0 ? Infinity : t / 100));
    state.userAverages = state.userAverages.map((t) => (t <= 0 ? Infinity : t / 100));
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
// Helper to get user's PR average (best non-DNF average from WCA or session)
function getUserPRAverage() {
    const validAverages = state.userAverages.filter(
        (a) => a !== Infinity && isFinite(a) && !isNaN(a),
    );
    if (!validAverages.length) return null;
    return Math.min(...validAverages).toFixed(2);
}

// Update target field to current PR when "Use PR" is checked
function updatePrTarget() {
    if (!usePrCheckbox.checked) return;
    const pr = getUserPRAverage();
    if (pr) {
        targetInput.value = pr;
        targetInput.disabled = true;
    } else {
        targetInput.value = '';
        targetInput.disabled = true;
    }
    setStorage('setting_target', targetInput.value);
    calculateStats();
    updateTargetDisplay();
}

const usePrCheckbox = document.getElementById('usePrTarget');
const targetInput = document.getElementById('target');

usePrCheckbox.addEventListener('change', () => {
    if (usePrCheckbox.checked) {
        updatePrTarget();
    } else {
        targetInput.disabled = false;
        targetInput.value = '';
    }
    setStorage('setting_usePr', usePrCheckbox.checked);
    calculateStats();
    updateTargetDisplay();
});

// === STORAGE HELPERS (localStorage) ===
function setStorage(name, value) {
    try {
        localStorage.setItem(name, JSON.stringify(value));
    } catch (e) {
        console.error(`Error saving ${name}:`, e);
    }
}

function getStorage(name) {
    try {
        const raw = localStorage.getItem(name);
        return raw === null ? null : JSON.parse(raw);
    } catch (e) {
        console.error(`Error reading ${name}:`, e);
        return null;
    }
}

function deleteStorage(name) {
    localStorage.removeItem(name);
}

// Compact Serialization
// Solve array: [raw, penalty, averageId, scramble]
// Average array: [average, event, averageId, [[raw, penalty, averageId, scramble], ...]]

function serializeSolve(solve) {
    return [solve.raw, solve.penalty ?? null, solve.averageId, solve.scramble ?? null];
}

function deserializeSolve(arr, event) {
    const [raw, penalty, averageId, scramble] = arr;
    let value = raw;
    if (penalty === 'dnf') value = Infinity;
    else if (penalty === 'plus2') value = raw + 2;
    return { raw, penalty, value, event, averageId, scramble };
}

function serializeTag(tag) {
    return [tag.average, tag.event, tag.averageId, tag.times.map(serializeSolve)];
}

function deserializeTag(arr) {
    const [average, event, averageId, solves] = arr;
    return {
        average,
        event,
        averageId,
        times: solves.map((s) => deserializeSolve(s, event)),
    };
}

let _saveDebounceTimer = null;
function scheduleSave() {
    if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer = setTimeout(() => {
        _saveDebounceTimer = null;
        flushSave();
    }, 500);
}

function flushSave() {
    try {
        const serialized = state.averageTags.map(serializeTag);
        localStorage.setItem('ct_averages', JSON.stringify(serialized));
    } catch (e) {
        console.error('flushSave failed:', e, state.averageTags);
    }
}

// Migrate legacy cookies to localStorage on first load
(function migrateCookies() {
    const cookies = document.cookie.split('; ').filter(Boolean);
    for (const cookie of cookies) {
        const eqIndex = cookie.indexOf('=');
        if (eqIndex === -1) continue;
        const name = decodeURIComponent(cookie.substring(0, eqIndex));
        if (!name.startsWith('averages_') && !name.startsWith('incomplete_')) continue;

        try {
            const value = JSON.parse(decodeURIComponent(cookie.substring(eqIndex + 1)));

            if (name.startsWith('averages_') && Array.isArray(value)) {
                // Merge into ct_averages, avoiding duplicates
                const existing = JSON.parse(localStorage.getItem('ct_averages') || '[]');
                const existingIds = new Set(existing.map((a) => a[2])); // averageId is index 2
                const incoming = value
                    .filter((tag) => !existingIds.has(tag.averageId))
                    .map((tag) =>
                        serializeTag({ ...tag, event: tag.event || name.replace('averages_', '') }),
                    );
                localStorage.setItem('ct_averages', JSON.stringify([...existing, ...incoming]));
            }

            if (name.startsWith('incomplete_') && Array.isArray(value)) {
                const event = name.replace('incomplete_', '');
                const newKey = `ct_incomplete_${event}`;
                if (localStorage.getItem(newKey) === null) {
                    localStorage.setItem(newKey, JSON.stringify(value.map(serializeSolve)));
                }
            }
        } catch (e) {
            /* skip malformed cookies */
        }

        // Delete the old cookie regardless
        document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }
})();

// === SAVE & LOAD INCOMPLETE SOLVES ===
function saveIncomplete() {
    const event = document.getElementById('event-type').value || state.eventType;
    if (state.times.length > 0 && state.times.length < getRequiredSolves()) {
        setStorage(`ct_incomplete_${event}`, state.times.map(serializeSolve));
    } else {
        localStorage.removeItem(`ct_incomplete_${event}`);
    }
}

function loadIncomplete() {
    const event = document.getElementById('event-type').value || state.eventType;

    // Migrate legacy incomplete key
    const legacyKey = `incomplete_${event}`;
    const legacy = getStorage(legacyKey);
    if (legacy && Array.isArray(legacy)) {
        setStorage(`ct_incomplete_${event}`, legacy.map(serializeSolve));
        localStorage.removeItem(legacyKey);
    }

    const saved = getStorage(`ct_incomplete_${event}`);
    if (saved && Array.isArray(saved) && saved.length > 0) {
        state.times = saved.map((s) => deserializeSolve(s, event));
        displayCurrentTimes();
    }
}

// === SAVE & LOAD AVERAGES PER EVENT ===
function saveAverages() {
    scheduleSave();
}

function loadAverages() {
    // Flush any pending save before loading to avoid losing in-memory tags
    if (_saveDebounceTimer) {
        clearTimeout(_saveDebounceTimer);
        _saveDebounceTimer = null;
        flushSave();
    }

    const event = document.getElementById('event-type').value;

    // Legacy localStorage migration (old per-event keys)
    const legacyKey = `averages_${event}`;
    const legacy = getStorage(legacyKey);
    if (legacy && Array.isArray(legacy)) {
        const existing = JSON.parse(localStorage.getItem('ct_averages') || '[]');
        const existingIds = new Set(existing.map((a) => a[2]));
        const incoming = legacy
            .filter((tag) => !existingIds.has(tag.averageId))
            .map((tag) => serializeTag({ ...tag, event: tag.event || event }));
        localStorage.setItem('ct_averages', JSON.stringify([...existing, ...incoming]));
        localStorage.removeItem(legacyKey);
    }

    const saved = getStorage('ct_averages');
    if (saved && Array.isArray(saved)) {
        state.averageTags = saved.map(deserializeTag);
    } else {
        state.averageTags = [];
    }

    state.userSolves = [];
    state.userAverages = [];
    state.averageTags
        .filter((tag) => tag.event === event)
        .forEach((avg) => {
            avg.times.forEach((t) => {
                state.userSolves.push(t.value === -1 ? Infinity : t.value);
            });
            if (avg.average !== 'DNF' && isFinite(parseFloat(avg.average))) {
                state.userAverages.push(parseFloat(avg.average));
            }
        });

    displayTags();
    updateAveragesEmptyState();
    updateSessionStats();
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

            // Top row: average value + rank + delete
            const avgRow = document.createElement('div');
            avgRow.classList.add('avg-row');

            const leftSide = document.createElement('span');
            const avgSpan = document.createElement('span');
            avgSpan.classList.add('avg-value');
            avgSpan.textContent =
                tag.average === 'DNF' ? 'DNF' : formatTime(parseFloat(tag.average));
            leftSide.appendChild(avgSpan);

            const rank = getAverageRank(tag.average);
            if (rank) {
                const rankSpan = document.createElement('span');
                rankSpan.classList.add('avg-rank');
                rankSpan.textContent = ` PR${rank}`;
                leftSide.appendChild(rankSpan);
            }

            avgRow.appendChild(leftSide);

            const rightBtns = document.createElement('span');
            rightBtns.classList.add('avg-actions');

            const snapBtn = document.createElement('button');
            snapBtn.classList.add('avg-action-btn');
            snapBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
            snapBtn.title = 'Share this average';
            snapBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                shareSnapshot('average', {
                    average: tag.average,
                    times: tag.times,
                    event: tag.event,
                    rank: rank,
                });
            });
            rightBtns.appendChild(snapBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('avg-delete');
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteBtn.title = 'Delete this average';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteAverage(tag.averageId);
            });
            rightBtns.appendChild(deleteBtn);

            avgRow.appendChild(rightBtns);

            li.appendChild(avgRow);

            // Times detail (click to expand)
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
                    val === 'DNF' ? 'DNF' : typeof val === 'number' ? formatTime(val) : 'DNF';

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

            // Click to show detail popup
            li.addEventListener('click', () => {
                showAverageDetail(tag);
            });

            container.appendChild(li);
        });

    updateAveragesEmptyState();
}

// === Confirm before switching event mid-solve ===
const eventSelector = document.getElementById('event-type');
const timerEventSelect = document.getElementById('timerEventSelect');
let lastEventType = eventSelector.value;

eventSelector.addEventListener('change', async (e) => {
    const newEvent = e.target.value;

    // Persist selected event
    setStorage('setting_event', newEvent);

    // Save incomplete solves for current event before switching
    saveIncomplete();

    // Load incomplete solves for the new event if they exist
    const incompleteSolves = getStorage(`incomplete_${newEvent}`);
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
    state.undoData = null;
    updateUndoButton();

    // Load event-specific averages and rebuild stats
    loadAverages();
    calculateStats();
    updateProgress();
    updatePrTarget();
    updateTargetDisplay();
    fetchScramble();

    // Keep timer event select in sync
    if (timerEventSelect) timerEventSelect.value = newEvent;

    // Update analyze button link
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) analyzeBtn.href = `/tools/globalCalc?source=average&event=${newEvent}`;
});

// Timer page event selector → sync to hidden event-type
if (timerEventSelect) {
    timerEventSelect.addEventListener('change', (e) => {
        eventSelector.value = e.target.value;
        eventSelector.dispatchEvent(new Event('change'));
    });
}

// === Persist incomplete solves on page unload ===
window.addEventListener('beforeunload', () => {
    saveIncomplete();
});

// === Auto-load averages on page load ===
window.addEventListener('DOMContentLoaded', () => {
    // Restore saved settings
    const savedEvent = getStorage('setting_event');
    if (savedEvent) {
        document.getElementById('event-type').value = savedEvent;
    }

    const savedWca = getStorage('setting_wca');
    if (savedWca) {
        document.getElementById('wca').value = savedWca;
    }

    const savedTarget = getStorage('setting_target');
    if (savedTarget) {
        document.getElementById('target').value = savedTarget;
    }

    const savedUsePr = getStorage('setting_usePr');
    if (savedUsePr === true) {
        document.getElementById('usePrTarget').checked = true;
        document.getElementById('target').disabled = true;
    }

    const savedHoldDuration = getStorage('setting_holdDuration');
    if (savedHoldDuration !== null && !isNaN(savedHoldDuration)) {
        currentHoldDuration = savedHoldDuration;
    }

    state.deleteStatShameCounter =
        parseInt(localStorage.getItem('deleteStatShameCounter'), 10) || 0;

    state.eventType = document.getElementById('event-type').value;
    if (timerEventSelect) timerEventSelect.value = state.eventType;

    // Set initial analyze button link
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) analyzeBtn.href = `/tools/globalCalc?source=average&event=${state.eventType}`;

    loadAverages();
    loadIncomplete();
    calculateStats();
    updateProgress();
    updateUndoButton();
    updateTargetDisplay();
    fetchScramble();

    // Trigger WCA data load if a saved WCA ID is valid
    if (savedWca && /\d{4}[a-zA-Z]{4}\d{2}/.test(savedWca)) {
        document.getElementById('wca').dispatchEvent(new Event('input'));
    }

    // Restore input mode
    const lastMode = localStorage.getItem('lastMode');
    if (lastMode === 'input') {
        setMode('input');
    } else {
        setMode('timer');
    }

    // Undo button
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) undoBtn.addEventListener('click', undoLastSolve);

    // Initialize sub-navbar indicator width
    const activeTab = document.querySelector('.sub-navbar-tab.active');
    if (activeTab && subNavIndicator) {
        subNavIndicator.style.width = `${activeTab.offsetWidth}px`;
    }
});

// === SCRAMBLE ===

const PUZZLE_MAP = {
    '222': '2x2x2',
    '333': '3x3x3',
    '444': '4x4x4',
    '555': '5x5x5',
    '666': '6x6x6',
    '777': '7x7x7',
    '333bf': '3x3x3',
    '333oh': '3x3x3',
    'clock': 'clock',
    'minx': 'megaminx',
    'pyram': 'pyraminx',
    'skewb': 'skewb',
    'sq1': 'square1',
    '444bf': '4x4x4',
    '555bf': '5x5x5',
};

function updateScrambleDrawing(scramble) {
    const viewer = document.getElementById('scrambleViewer');
    if (!viewer) return;

    const puzzle = PUZZLE_MAP[state.eventType] || '3x3x3';
    viewer.puzzle = puzzle;

    if (scramble) {
        viewer.alg = '';
        viewer.experimentalSetupAlg = scramble;
    } else {
        viewer.alg = '';
        viewer.experimentalSetupAlg = '';
    }
}

async function fetchScramble() {
    const scrambleText = document.getElementById('scrambleText');
    if (!scrambleText) return;

    scrambleText.textContent = 'Loading scramble...';

    try {
        const res = await fetch(`/api/scramble/${state.eventType}`);
        if (!res.ok) throw new Error('Failed to fetch scramble');
        const data = await res.json();
        if (data.scrambles && data.scrambles.length > 0) {
            state.currentScramble = data.scrambles[0];
            scrambleText.textContent = state.currentScramble;
            updateScrambleDrawing(state.currentScramble);
        } else {
            scrambleText.textContent = 'No scramble available';
            updateScrambleDrawing(null);
        }
    } catch (err) {
        console.error('Scramble fetch error:', err);
        scrambleText.textContent = 'Could not load scramble';
        updateScrambleDrawing(null);
    }
}

document.getElementById('newScrambleBtn').addEventListener('click', fetchScramble);

// === SCRAMBLE FULLSCREEN POPUP ===

document.getElementById('scrambleText').addEventListener('click', () => {
    if (!state.currentScramble) return;
    const popup = document.getElementById('scrambleFullscreen');
    document.getElementById('scrambleFullscreenText').textContent = state.currentScramble;
    popup.hidden = false;
});

document.getElementById('scrambleFullscreenClose').addEventListener('click', () => {
    document.getElementById('scrambleFullscreen').hidden = true;
});

document.getElementById('scrambleFullscreen').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        e.currentTarget.hidden = true;
    }
});

// === MODE TOGGLE ===

const modeInputBtn = document.getElementById('modeInput');
const modeTimerBtn = document.getElementById('modeTimer');
const inputModeDiv = document.getElementById('inputMode');
const timerModeDiv = document.getElementById('timerMode');

function setMode(mode) {
    state.mode = mode;
    localStorage.setItem('lastMode', mode);

    if (mode === 'input') {
        inputModeDiv.hidden = false;
        timerModeDiv.hidden = true;
        modeInputBtn.classList.add('active');
        modeTimerBtn.classList.remove('active');
        document.getElementById('timeInput').focus();
        stopTimer(true);
    } else {
        inputModeDiv.hidden = true;
        timerModeDiv.hidden = false;
        modeTimerBtn.classList.add('active');
        modeInputBtn.classList.remove('active');
        resetTimerDisplay();
    }
}

modeInputBtn.addEventListener('click', () => setMode('input'));
modeTimerBtn.addEventListener('click', () => setMode('timer'));

// === TIMER / STOPWATCH ===

const timerDisplay = document.getElementById('timerDisplay');
const HOLD_DURATION = 300; // ms to hold before ready
let holdTimeout = null;
let currentHoldDuration = HOLD_DURATION;

// === SUB-NAVBAR TAB SWITCHING ===

const subNavTabs = document.querySelectorAll('.sub-navbar-tab');
const subNavIndicator = document.getElementById('subNavIndicator');
const pageViews = document.querySelectorAll('.page-view');

subNavTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        subNavTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        // Position indicator based on tab index
        const tabIndex = [...subNavTabs].indexOf(tab);
        subNavIndicator.style.width = `${tab.offsetWidth}px`;
        subNavIndicator.style.transform =
            tabIndex === 0 ? 'none' : `translateX(${tab.offsetLeft - 3}px)`;

        pageViews.forEach((page) => {
            page.classList.remove('active');
            // Re-trigger animation
            page.style.animation = 'none';
            page.offsetHeight;
            page.style.animation = '';
        });
        document.getElementById(`page-${targetTab}`).classList.add('active');

        // Sync settings inputs when opening settings
        if (targetTab === 'settings') {
            syncToSettings();
        }
        // Refresh stats page when opening
        if (targetTab === 'stats') {
            displayTags();
            updateSessionStats();
            updateAveragesEmptyState();
        }
    });
});

// === SETTINGS SYNC ===

function syncToSettings() {
    document.getElementById('settingsEvent').value = document.getElementById('event-type').value;
    document.getElementById('settingsWca').value = document.getElementById('wca').value;
    document.getElementById('settingsTarget').value = document.getElementById('target').value;
    document.getElementById('settingsUsePr').checked =
        document.getElementById('usePrTarget').checked;
    document.getElementById('settingsHoldDuration').value = currentHoldDuration;

    // Sync mode toggle
    const settingsModeInput = document.getElementById('settingsModeInput');
    const settingsModeTimer = document.getElementById('settingsModeTimer');
    if (state.mode === 'input') {
        settingsModeInput.classList.add('active');
        settingsModeTimer.classList.remove('active');
        localStorage.setItem('lastMode', 'input');
    } else {
        settingsModeTimer.classList.add('active');
        settingsModeInput.classList.remove('active');
        localStorage.setItem('lastMode', 'timer');
    }
}

// Settings → Timer sync: Event
document.getElementById('settingsEvent').addEventListener('change', (e) => {
    document.getElementById('event-type').value = e.target.value;
    document.getElementById('event-type').dispatchEvent(new Event('change'));
    if (timerEventSelect) timerEventSelect.value = e.target.value;
});

// Settings → Timer sync: WCA ID
document.getElementById('settingsWca').addEventListener('input', (e) => {
    const wcaInput = document.getElementById('wca');
    wcaInput.value = e.target.value;
    wcaInput.dispatchEvent(new Event('input'));
});

// Settings → Timer sync: Target
document.getElementById('settingsTarget').addEventListener('input', (e) => {
    formatInputField(e.target);
    const targetInput = document.getElementById('target');
    targetInput.value = e.target.value;
    targetInput.dispatchEvent(new Event('input'));
});

// Settings → Timer sync: Use PR checkbox
document.getElementById('settingsUsePr').addEventListener('change', (e) => {
    const checkbox = document.getElementById('usePrTarget');
    checkbox.checked = e.target.checked;
    checkbox.dispatchEvent(new Event('change'));
});

// Settings → Timer sync: Hold Duration
document.getElementById('settingsHoldDuration').addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 0) {
        currentHoldDuration = val;
        setStorage('setting_holdDuration', val);
    }
});

// Settings → Timer sync: Mode toggle
document.getElementById('settingsModeInput').addEventListener('click', () => {
    setMode('input');
    document.getElementById('settingsModeInput').classList.add('active');
    document.getElementById('settingsModeTimer').classList.remove('active');
});
document.getElementById('settingsModeTimer').addEventListener('click', () => {
    setMode('timer');
    document.getElementById('settingsModeTimer').classList.add('active');
    document.getElementById('settingsModeInput').classList.remove('active');
});

// Settings: Clear all
document.getElementById('settingsClearAll').addEventListener('click', clearAllAverages);

function resetTimerDisplay() {
    if (timerDisplay) {
        timerDisplay.textContent = '0.00';
        timerDisplay.classList.remove('ready', 'running');
    }
    state.timerRunning = false;
    state.timerReady = false;
    state.timerHolding = false;
    state.timerStart = null;
    document.querySelector('main').classList.remove('timer-running');
    if (state.timerAnimFrame) {
        cancelAnimationFrame(state.timerAnimFrame);
        state.timerAnimFrame = null;
    }
    if (holdTimeout) {
        clearTimeout(holdTimeout);
        holdTimeout = null;
    }
}

function updateTimerDisplay() {
    if (!state.timerRunning || !state.timerStart) return;
    const elapsed = (performance.now() - state.timerStart) / 1000;
    timerDisplay.textContent = formatTime(parseFloat(elapsed.toFixed(2)));
    state.timerAnimFrame = requestAnimationFrame(updateTimerDisplay);
}

function startTimer() {
    state.timerRunning = true;
    state.timerReady = false;
    state.timerStart = performance.now();
    timerDisplay.classList.remove('ready');
    timerDisplay.classList.add('running');
    document.querySelector('main').classList.add('timer-running');
    state.timerAnimFrame = requestAnimationFrame(updateTimerDisplay);
}

function stopTimer(cancelled = false) {
    if (!state.timerRunning) return;

    const elapsed = (performance.now() - state.timerStart) / 1000;
    state.timerRunning = false;
    document.querySelector('main').classList.remove('timer-running');

    if (state.timerAnimFrame) {
        cancelAnimationFrame(state.timerAnimFrame);
        state.timerAnimFrame = null;
    }

    timerDisplay.classList.remove('running');

    if (cancelled) return;

    // Round to centiseconds
    const time = Math.round(elapsed * 100) / 100;
    timerDisplay.textContent = formatTime(time);

    // Add the time to the session
    addTimerTime(time);
}

function addTimerTime(time) {
    const required = getRequiredSolves();
    if (state.times.length >= required) {
        state.times = [];
    }

    const event = document.getElementById('event-type').value;
    const averageId = `${event}-${Date.now()}`;

    // Save undo state before modification
    saveUndoState();

    state.times.push({
        raw: time,
        penalty: null,
        value: time,
        event: event,
        averageId: averageId,
        scramble: state.currentScramble,
    });
    state.userSolves.push(time);

    // Track session PR single
    if (!state.sessionPrSingle[event] || time < state.sessionPrSingle[event].value) {
        state.sessionPrSingle[event] = {
            value: time,
            scramble: state.currentScramble,
            event: event,
        };
    }

    calculateStats();
    displayCurrentTimes();
    updateProgress();
    updateUndoButton();
    saveIncomplete();
    fetchScramble();
}

// === KEYBOARD HANDLING FOR TIMER ===
document.addEventListener('keydown', (e) => {
    if (state.mode !== 'timer') return;

    // Ignore if focus is on an input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // If timer is running, allow ANY key to stop
    if (state.timerRunning) {
        stopTimer();
        if (e.key === 'Escape') applyPenalty(state.times.length - 1, 'dnf');
        return;
    }

    // Only allow spacebar to start the timer
    if (e.code !== 'Space') return;
    e.preventDefault();

    if (state.timerHolding) return; // already holding

    state.timerHolding = true;
    timerDisplay.textContent = '0.00';
    timerDisplay.classList.remove('running');

    holdTimeout = setTimeout(() => {
        state.timerReady = true;
        timerDisplay.classList.add('ready');
    }, currentHoldDuration);
});

document.addEventListener('keyup', (e) => {
    if (state.mode !== 'timer') return;

    // Only care about spacebar for starting, but ignore key for stopping
    if (!state.timerRunning && e.code !== 'Space') return;
    e.preventDefault();

    if (holdTimeout) {
        clearTimeout(holdTimeout);
        holdTimeout = null;
    }

    if (state.timerReady && !state.timerRunning && e.code === 'Space') {
        state.timerHolding = false;
        startTimer();
        return;
    }

    // If timer is running, any key stops it (handled in keydown)

    // Released too early — not ready
    state.timerHolding = false;
    state.timerReady = false;
    timerDisplay.classList.remove('ready');
});

// === TOUCH TIMER ===

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

// Touch-based timer (tap and hold to start/stop)
(function initTouchTimer() {
    const timerArea = document.querySelector('.timer-area');
    if (!timerArea) return;

    let touchHoldTimeout = null;

    timerArea.addEventListener(
        'touchstart',
        (e) => {
            if (state.mode !== 'timer') return;

            // Don't intercept buttons or inputs
            const tag = e.target.tagName;
            // Or progress-label class
            const isProgressLabel = e.target.classList.contains('progress-label');
            if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || isProgressLabel) return;

            e.preventDefault();

            if (state.timerRunning) {
                stopTimer();
                return;
            }

            if (state.timerHolding) return;

            state.timerHolding = true;
            timerDisplay.textContent = '0.00';
            timerDisplay.classList.remove('running');

            touchHoldTimeout = setTimeout(() => {
                state.timerReady = true;
                timerDisplay.classList.add('ready');
            }, currentHoldDuration);
        },
        { passive: false },
    );

    timerArea.addEventListener('touchend', (e) => {
        if (state.mode !== 'timer') return;

        const tag = e.target.tagName;
        const isProgressLabel = e.target.classList.contains('progress-label');
        if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || isProgressLabel) return;

        if (touchHoldTimeout) {
            clearTimeout(touchHoldTimeout);
            touchHoldTimeout = null;
        }

        if (state.timerReady && !state.timerRunning) {
            state.timerHolding = false;
            startTimer();
            return;
        }

        state.timerHolding = false;
        state.timerReady = false;
        timerDisplay.classList.remove('ready');
    });
})();

// === MOBILE SWIPE-DOWN PENALTY SHEET ===

(function initMobilePenaltySheet() {
    const sheet = document.getElementById('mobilePenaltySheet');
    if (!sheet) return;

    let swipeStartY = 0;
    let lastSolveIndex = -1;
    const SWIPE_THRESHOLD = 50;

    function showSheet() {
        if (!isMobile()) return;
        const lastIdx = state.times.length - 1;
        if (lastIdx < 0) return;

        lastSolveIndex = lastIdx;
        const solve = state.times[lastIdx];

        const timeText = document.getElementById('penaltySheetTime');
        if (solve.penalty === 'dnf') {
            timeText.textContent = 'DNF';
        } else if (solve.penalty === 'plus2') {
            timeText.textContent = formatTime(solve.raw) + '+';
        } else {
            timeText.textContent = formatTime(solve.raw);
        }

        sheet.hidden = false;
        requestAnimationFrame(() => {
            sheet.classList.add('visible');
        });
    }

    function hideSheet() {
        sheet.classList.remove('visible');
        sheet.addEventListener(
            'transitionend',
            () => {
                if (!sheet.classList.contains('visible')) {
                    sheet.hidden = true;
                }
            },
            { once: true },
        );
    }

    // Swipe down on timer area to open sheet
    const timerArea = document.querySelector('.timer-area');
    if (timerArea) {
        timerArea.addEventListener(
            'touchstart',
            (e) => {
                if (!isMobile()) return;
                if (state.timerRunning || state.timerHolding) return;
                swipeStartY = e.touches[0].clientY;
            },
            { passive: true },
        );

        timerArea.addEventListener(
            'touchend',
            (e) => {
                if (!isMobile()) return;
                if (state.timerRunning || state.timerHolding) return;
                const required = getRequiredSolves();
                if (state.times.length === required + 1) return;

                const dy = e.changedTouches[0].clientY - swipeStartY;
                if (dy > SWIPE_THRESHOLD) {
                    showSheet();
                }
            },
            { passive: true },
        );
    }

    // Tap handle or swipe up to dismiss
    sheet.querySelector('.penalty-sheet-handle').addEventListener('click', hideSheet);

    let sheetSwipeStartY = 0;
    sheet.addEventListener(
        'touchstart',
        (e) => {
            sheetSwipeStartY = e.touches[0].clientY;
        },
        { passive: true },
    );

    sheet.addEventListener(
        'touchend',
        (e) => {
            const dy = e.changedTouches[0].clientY - sheetSwipeStartY;
            if (dy > 40) hideSheet();
        },
        { passive: true },
    );

    // Penalty button handlers
    document.getElementById('penaltyOk').addEventListener('click', () => {
        if (lastSolveIndex >= 0) removePenalty(lastSolveIndex);
        hideSheet();
    });

    document.getElementById('penaltyPlus2').addEventListener('click', () => {
        if (lastSolveIndex >= 0) applyPenalty(lastSolveIndex, 'plus2');
        hideSheet();
    });

    document.getElementById('penaltyDnf').addEventListener('click', () => {
        if (lastSolveIndex >= 0) applyPenalty(lastSolveIndex, 'dnf');
        hideSheet();
    });

    document.getElementById('penaltyEdit').addEventListener('click', () => {
        if (lastSolveIndex >= 0) openEditModal(lastSolveIndex);
        hideSheet();
    });

    document.getElementById('penaltyDelete').addEventListener('click', () => {
        if (lastSolveIndex >= 0) deleteTime(lastSolveIndex);
        hideSheet();
    });
})();

// === EVENT NAMES FOR DISPLAY ===
const EVENT_NAMES = {
    '222': '2x2x2',
    '333': '3x3x3',
    '444': '4x4x4',
    '555': '5x5x5',
    '666': '6x6x6',
    '777': '7x7x7',
    '333bf': '3x3 Blindfolded',
    '333oh': '3x3 One-Handed',
    'clock': 'Clock',
    'minx': 'Megaminx',
    'pyram': 'Pyraminx',
    'skewb': 'Skewb',
    'sq1': 'Square-1',
    '444bf': '4x4 Blindfolded',
    '555bf': '5x5 Blindfolded',
};

// === UNDO ===

function saveUndoState() {
    state.undoData = {
        times: JSON.parse(JSON.stringify(state.times)),
        scramble: state.currentScramble,
        averageTagsLength: state.averageTags.length,
        userSolvesLength: state.userSolves.length,
        userAveragesLength: state.userAverages.length,
    };
}

function undoLastSolve() {
    if (!state.undoData) return;
    const undo = state.undoData;

    // Track which averages are being removed (for cookie cleanup)
    const removedTags = state.averageTags.slice(undo.averageTagsLength);

    // Remove any averages added after snapshot
    while (state.averageTags.length > undo.averageTagsLength) {
        state.averageTags.pop();
    }

    // Clean up cookies for events that lost their last average
    removedTags.forEach((tag) => {
        const remaining = state.averageTags.filter((t) => t.event === tag.event);
        if (remaining.length === 0) {
            deleteStorage(`averages_${tag.event}`);
        }
    });

    state.times = undo.times;
    state.currentScramble = undo.scramble;

    const scrambleText = document.getElementById('scrambleText');
    if (scrambleText) scrambleText.textContent = undo.scramble || 'No scramble';
    updateScrambleDrawing(undo.scramble);

    state.userSolves.length = undo.userSolvesLength;
    state.userAverages.length = undo.userAveragesLength;

    state.undoData = null;

    saveAverages();
    saveIncomplete();
    displayCurrentTimes();
    displayTags();
    updateProgress();
    calculateStats();
    updateUndoButton();
    updateSessionStats();
    updateAveragesEmptyState();
}

function updateUndoButton() {
    const btn = document.getElementById('undoBtn');
    if (btn) btn.disabled = !state.undoData;
}

// === SNAPSHOT / SHARE ===

function wrapCanvasText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
}

function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Preload logo for snapshot cards
let _snapshotLogo = null;
(function () {
    const img = new Image();
    img.src = '/assets/logo_long.png';
    img.onload = () => {
        _snapshotLogo = img;
    };
})();

function generateSnapshotCanvas(type, data) {
    const W = 500;
    const pad = 32;
    const cardR = 12; // prominent card radius per design (12–18px)
    const pillR = 11; // fully round pill

    const cs = getComputedStyle(document.documentElement);
    const cv = (v) => cs.getPropertyValue(v).trim();
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    const colors = {
        bg: cv('--main-background') || '#000000',
        cardBg: cv('--card-bg') || cv('--secondary-background') || '#191923',
        cardBorder: cv('--card-border') || 'rgba(255,255,255,0.08)',
        text: cv('--main-text') || '#F4F4F5',
        muted: cv('--secondary-text') || '#A1A1AA',
        accent: cv('--button-background') || '#4F46E5',
        buttonColor: cv('--button-color') || '#FFFFFF',
        success: cv('--success') || '#2ecc71',
        error: cv('--error') || '#e74c3c',
        border: cv('--main-lighter') || '#2A2A31',
    };

    const F = "'Poppins', sans-serif"; // --font-main

    const eventName = EVENT_NAMES[data.event] || data.event;
    const isMean = meanEvents.includes(data.event);
    const avgLabel = isMean ? 'Mean of 3' : 'Average of 5';

    // --- Pre-measure height ---
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = 1;
    const mctx = tmp.getContext('2d');

    const logoH = 32;
    let h = pad + logoH + 20 + 20 + 54 + 24 + 20; // top pad + logo + gap + event + mainTime + rank + divider

    if (type === 'average' && data.times) {
        data.times.forEach((t) => {
            h += 26;
            if (t.scramble) {
                mctx.font = `11px monospace`;
                const lines = wrapCanvasText(mctx, t.scramble, W - pad * 2 - 20);
                h += lines.length * 16 + 6;
            }
        });
        h += 8;
    }

    if (type === 'single' && data.scramble) {
        h += 24;
        mctx.font = `13px monospace`;
        const lines = wrapCanvasText(mctx, data.scramble, W - pad * 2);
        h += lines.length * 18 + 8;
    }

    h += 52; // date + url + bottom pad

    // --- Render ---
    const dpr = Math.max(window.devicePixelRatio || 1, 3);

    const canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, h);

    // Card
    ctx.fillStyle = colors.cardBg;
    drawRoundRect(ctx, 12, 12, W - 24, h - 24, cardR);
    ctx.fill();
    ctx.strokeStyle = colors.cardBorder;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, 12, 12, W - 24, h - 24, cardR);
    ctx.stroke();

    let y = pad + 4;

    // Logo (invert for light mode)
    if (_snapshotLogo && _snapshotLogo.naturalWidth) {
        const logoW = Math.round(
            logoH * (_snapshotLogo.naturalWidth / _snapshotLogo.naturalHeight),
        );
        const logoX = Math.round((W - logoW) / 2);

        if (isLight) {
            const offscreen = document.createElement('canvas');
            offscreen.width = logoW;
            offscreen.height = logoH;
            const octx = offscreen.getContext('2d');
            octx.filter = 'invert(1)';
            octx.drawImage(_snapshotLogo, 0, 0, logoW, logoH);
            ctx.drawImage(offscreen, logoX, y, logoW, logoH);
        } else {
            ctx.drawImage(_snapshotLogo, logoX, y, logoW, logoH);
        }
    } else {
        ctx.fillStyle = colors.text;
        ctx.font = `600 16px ${F}`;
        ctx.textAlign = 'center';
        ctx.fillText('cubingtools.de', W / 2, y + 16);
    }
    y += logoH + 20;

    // Event + type
    ctx.fillStyle = colors.muted;
    ctx.font = `500 13px ${F}`;
    ctx.textAlign = 'center';
    ctx.fillText(type === 'average' ? `${eventName} ${avgLabel}` : `${eventName} Single`, W / 2, y);
    y += 12;

    // Main time
    const mainTime =
        type === 'average'
            ? data.average === 'DNF'
                ? 'DNF'
                : formatTime(parseFloat(data.average))
            : data.value === -1 || data.value === Infinity
              ? 'DNF'
              : formatTime(data.value);
    ctx.fillStyle = colors.text;
    ctx.font = `700 42px ${F}`;
    ctx.fillText(mainTime, W / 2, y + 42);
    y += 54;

    // Ranking pill
    if (data.rank) {
        const label = `PR #${data.rank}`;
        ctx.font = `600 12px ${F}`;
        const tw = ctx.measureText(label).width;
        const pillW = tw + 20;
        const pillH = 22;
        const pillX = (W - pillW) / 2;

        ctx.fillStyle = colors.accent;
        drawRoundRect(ctx, pillX, y - 2, pillW, pillH, pillR);
        ctx.fill();

        ctx.fillStyle = colors.buttonColor;
        ctx.fillText(label, W / 2, y + 13);
    }
    y += 24;

    // Divider
    ctx.strokeStyle = colors.cardBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
    y += 16;

    ctx.textAlign = 'left';

    if (type === 'average' && data.times) {
        const values = data.times.map((t) => {
            const v = t.value ?? t.raw;
            return v === -1 || v === Infinity ? Infinity : v;
        });
        const min = Math.min(...values);
        const max = Math.max(...values);
        let markedBest = false,
            markedWorst = false;

        data.times.forEach((t, i) => {
            const val = t.value ?? t.raw;
            const numVal = val === -1 || val === Infinity ? Infinity : val;
            const timeStr = numVal === Infinity ? 'DNF' : formatTime(numVal);

            let isBest = numVal === min && !markedBest;
            let isWorst = (numVal === max || numVal === Infinity) && !markedWorst;
            if (isBest) markedBest = true;
            if (isWorst) markedWorst = true;

            const display = isBest || isWorst ? `(${timeStr})` : timeStr;
            const numStr = `${i + 1}. `;

            ctx.font = `600 14px ${F}`;
            ctx.fillStyle = colors.muted;
            ctx.fillText(numStr, pad, y + 18);
            const numW = ctx.measureText(numStr).width;

            if (isBest) ctx.fillStyle = colors.success;
            else if (isWorst) ctx.fillStyle = colors.error;
            else ctx.fillStyle = colors.text;
            ctx.fillText(display, pad + numW, y + 18);

            // Rank
            if (numVal !== Infinity) {
                const solveRank = getSingleRank(numVal);
                if (solveRank) {
                    const timeW = ctx.measureText(display).width;
                    ctx.fillStyle = colors.muted;
                    ctx.font = `400 11px ${F}`;
                    ctx.fillText(`#${solveRank}`, pad + numW + timeW + 8, y + 18);
                }
            }

            y += 24;

            // Scramble
            if (t.scramble) {
                ctx.fillStyle = colors.muted;
                ctx.font = '11px monospace';
                const lines = wrapCanvasText(ctx, t.scramble, W - pad * 2 - 20);
                lines.forEach((line) => {
                    ctx.fillText(line, pad + 20, y + 13);
                    y += 16;
                });
                y += 4;
            }
        });
    }

    if (type === 'single' && data.scramble) {
        ctx.fillStyle = colors.muted;
        ctx.font = `600 12px ${F}`;
        ctx.fillText('Scramble:', pad, y + 14);
        y += 22;

        ctx.font = '13px monospace';
        const lines = wrapCanvasText(ctx, data.scramble, W - pad * 2);
        lines.forEach((line) => {
            ctx.fillText(line, pad, y + 14);
            y += 18;
        });
        y += 6;
    }

    // Footer
    y += 8;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.muted;
    ctx.font = `400 11px ${F}`;
    const dateStr = new Date().toLocaleDateString('de-DE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    ctx.fillText(dateStr, W / 2, y + 12);
    y += 18;
    ctx.fillStyle = colors.muted;
    ctx.font = `400 11px ${F}`;
    ctx.fillText('cubingtools.de/tools/average', W / 2, y + 12);

    return canvas;
}

async function shareSnapshot(type, data) {
    const canvas = generateSnapshotCanvas(type, data);

    try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

        if (navigator.share && navigator.canShare) {
            const file = new File([blob], 'cubingtools-result.png', { type: 'image/png' });
            const shareData = { files: [file] };
            if (navigator.canShare(shareData)) {
                await navigator.share(shareData);
                return;
            }
        }

        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cubingtools-${type}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        if (err.name !== 'AbortError') console.error('Share error:', err);
    }
}

// === PROGRESS BAR POPUP ===

function showProgressPopup() {
    const required = getRequiredSolves();
    if (state.times.length === required + 1) return;

    const popup = document.getElementById('progressPopup');
    const content = document.getElementById('progressPopupContent');
    const title = document.getElementById('progressPopupTitle');

    title.textContent = `Current Solves (${state.times.length} / ${required})`;

    content.innerHTML = '';

    // Sort times by value for ranking
    const sorted = [...state.times]
        .map((t, i) => ({ ...t, originalIndex: i }))
        .sort((a, b) => {
            if (a.value === Infinity) return 1;
            if (b.value === Infinity) return -1;
            return a.value - b.value;
        });

    sorted.forEach((solve, rank) => {
        const row = document.createElement('div');
        row.classList.add('progress-solve-row');

        const rankSpan = document.createElement('span');
        rankSpan.classList.add('progress-solve-rank');
        rankSpan.textContent = `#${rank + 1}`;

        const timeSpan = document.createElement('span');
        timeSpan.classList.add('progress-solve-time');
        if (solve.penalty === 'dnf') {
            timeSpan.textContent = 'DNF';
        } else if (solve.penalty === 'plus2') {
            timeSpan.textContent = `${formatTime(solve.raw)}+`;
        } else {
            timeSpan.textContent = formatTime(solve.raw);
        }

        const prSpan = document.createElement('span');
        prSpan.classList.add('progress-solve-pr');
        if (solve.value !== Infinity && solve.value !== -1) {
            const prRank = getSingleRank(solve.value);
            if (prRank) prSpan.textContent = `PR${prRank}`;
        }

        const snapBtn = document.createElement('button');
        snapBtn.classList.add('progress-solve-snap');
        snapBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
        snapBtn.title = 'Share this time';
        snapBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const snapRank = getSingleRank(solve.value);
            shareSnapshot('single', {
                value: solve.value,
                raw: solve.raw,
                penalty: solve.penalty,
                scramble: solve.scramble || null,
                event: solve.event,
                rank: snapRank,
            });
        });

        row.appendChild(rankSpan);
        row.appendChild(timeSpan);
        row.appendChild(prSpan);
        row.appendChild(snapBtn);
        content.appendChild(row);
    });

    popup.hidden = false;
}

document.querySelector('.progress-bar').addEventListener('click', (e) => {
    e.stopPropagation();
    showProgressPopup();
});
document.querySelector('.progress-label').addEventListener('click', (e) => {
    e.stopPropagation();
    showProgressPopup();
});
document.querySelector('.progress-fill').addEventListener('click', (e) => {
    e.stopPropagation();
    showProgressPopup();
});

document.getElementById('progressPopupClose').addEventListener('click', () => {
    document.getElementById('progressPopup').hidden = true;
});
document.getElementById('progressPopup').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        document.getElementById('progressPopup').hidden = true;
    }
});

// === AVERAGE DETAIL POPUP ===

let _avgDetailTag = null;

function showAverageDetail(tag) {
    _avgDetailTag = tag;
    const popup = document.getElementById('avgDetailPopup');
    const titleEl = document.getElementById('avgDetailTitle');
    const timeEl = document.getElementById('avgDetailTime');
    const rankEl = document.getElementById('avgDetailRank');
    const solvesEl = document.getElementById('avgDetailSolves');

    const eventName = EVENT_NAMES[tag.event] || tag.event;
    const isMean = meanEvents.includes(tag.event);
    titleEl.textContent = `${eventName} ${isMean ? 'Mean of 3' : 'Average of 5'}`;

    const avg = tag.average === 'DNF' ? 'DNF' : formatTime(parseFloat(tag.average));
    timeEl.textContent = avg;

    const rank = getAverageRank(tag.average);
    rankEl.textContent = rank ? `PR #${rank}` : '';

    solvesEl.innerHTML = '';

    const values = tag.times.map((t) => {
        const v = t.value ?? t.raw;
        return v === -1 || v === Infinity ? Infinity : v;
    });
    const min = Math.min(...values);
    const max = Math.max(...values);
    let markedBest = false;
    let markedWorst = false;

    tag.times.forEach((t, i) => {
        const row = document.createElement('div');
        row.classList.add('avg-detail-solve-row');

        const numSpan = document.createElement('span');
        numSpan.classList.add('avg-detail-solve-num');
        numSpan.textContent = `${i + 1}.`;

        const infoDiv = document.createElement('div');
        infoDiv.classList.add('avg-detail-solve-info');

        const val = t.value ?? t.raw;
        const numVal = val === -1 || val === Infinity ? Infinity : val;
        const timeStr = numVal === Infinity ? 'DNF' : formatTime(numVal);

        let isBest = numVal === min && !markedBest;
        let isWorst = (numVal === max || numVal === Infinity) && !markedWorst;
        if (isBest) markedBest = true;
        if (isWorst) markedWorst = true;

        const timeRow = document.createElement('div');
        const timeSpan = document.createElement('span');
        timeSpan.classList.add('avg-detail-solve-time');
        timeSpan.textContent = isBest || isWorst ? `(${timeStr})` : timeStr;
        if (isBest) timeSpan.classList.add('best');
        if (isWorst) timeSpan.classList.add('worst');
        timeRow.appendChild(timeSpan);

        if (numVal !== Infinity) {
            const solveRank = getSingleRank(numVal);
            if (solveRank) {
                const rankSpan = document.createElement('span');
                rankSpan.classList.add('avg-detail-solve-rank');
                rankSpan.textContent = `#${solveRank}`;
                timeRow.appendChild(rankSpan);
            }
        }

        // Penalty indicator
        if (t.penalty === 'plus2') {
            const penSpan = document.createElement('span');
            penSpan.classList.add('avg-detail-solve-rank');
            penSpan.textContent = ' +2';
            timeRow.appendChild(penSpan);
        }

        infoDiv.appendChild(timeRow);

        if (t.scramble) {
            const scrambleDiv = document.createElement('div');
            scrambleDiv.classList.add('avg-detail-solve-scramble');
            scrambleDiv.textContent = t.scramble;
            infoDiv.appendChild(scrambleDiv);
        }

        row.appendChild(numSpan);
        row.appendChild(infoDiv);
        solvesEl.appendChild(row);
    });

    popup.hidden = false;
}

function closeAverageDetail() {
    document.getElementById('avgDetailPopup').hidden = true;
    _avgDetailTag = null;
}

document.getElementById('avgDetailClose').addEventListener('click', closeAverageDetail);
document.getElementById('avgDetailPopup').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAverageDetail();
});

document.getElementById('avgDetailShareBtn').addEventListener('click', () => {
    if (!_avgDetailTag) return;
    const rank = getAverageRank(_avgDetailTag.average);
    shareSnapshot('average', {
        average: _avgDetailTag.average,
        times: _avgDetailTag.times,
        event: _avgDetailTag.event,
        rank: rank,
    });
});

document.getElementById('avgDetailDeleteBtn').addEventListener('click', () => {
    if (!_avgDetailTag) return;
    deleteAverage(_avgDetailTag.averageId);
    closeAverageDetail();
});
