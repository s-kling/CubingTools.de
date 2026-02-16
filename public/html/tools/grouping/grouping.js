let events = [];

/* --- small helpers --- */
function debounce(fn, wait = 200) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

function createEl(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'className') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('data-')) el.dataset[k.slice(5)] = v;
        else el.setAttribute(k, v);
    });
    children.forEach((c) => {
        if (typeof c === 'string') el.appendChild(document.createTextNode(c));
        else if (c instanceof Node) el.appendChild(c);
    });
    return el;
}

/* Central initialization */
document.addEventListener('DOMContentLoaded', async () => {
    // 1) fetch events once
    try {
        const response = await fetch('/events');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const payload = await response.json();
        events = payload.events || payload; // allow multiple shapes
    } catch (err) {
        console.error('Error fetching events:', err);
        events = events || []; // fallback
    }

    // 2) load data from URL if present
    try {
        loadCompetitionDataFromURL();
    } catch (err) {
        console.warn('Could not load competition data from URL:', err);
    }

    // 3) wire event-searchbar safely (may be rendered later), use delegated search if absent
    const searchInput = document.getElementById('event-searchbar');
    if (searchInput) {
        const doFilter = debounce((e) => {
            const searchTerm = e.target.value.trim().toLowerCase();
            filterEventCheckboxes(searchTerm);
        }, 160);
        searchInput.addEventListener('input', doFilter);
    } else {
        // fallback: in case searchbar is added dynamically later, observe DOM
        const observer = new MutationObserver((mutations, obs) => {
            const el = document.getElementById('event-searchbar');
            if (el) {
                const doFilter = debounce((e) => {
                    const searchTerm = e.target.value.trim().toLowerCase();
                    filterEventCheckboxes(searchTerm);
                }, 160);
                el.addEventListener('input', doFilter);
                obs.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});

function filterEventCheckboxes(searchTerm) {
    const eventCheckboxes = document.getElementById('event-checkboxes');
    if (!eventCheckboxes) return;
    const eventCheckboxDivs = eventCheckboxes.querySelectorAll('.event-checkbox');

    eventCheckboxDivs.forEach((checkbox) => {
        const pNameTag = checkbox.querySelector('p');
        const eventName =
            pNameTag && pNameTag.textContent ? pNameTag.textContent.toLowerCase() : '';
        const eventShortName = checkbox.id ? checkbox.id.toLowerCase() : '';
        if (!searchTerm || eventName.includes(searchTerm) || eventShortName.includes(searchTerm)) {
            checkbox.style.display = '';
        } else {
            checkbox.style.display = 'none';
        }
    });
}

function loadCompetitionDataFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const compressedData = urlParams.get('cd');
    if (compressedData) {
        const data = JSON.parse(atob(compressedData));
        includeRunners = data.r;
        includeJudges = data.j;
        competitors = data.c.map(({ id, name, wcaId, events }) => ({
            id,
            name,
            wcaId,
            events,
            groupAssignments: {},
        }));
        competitionData.groups = Object.fromEntries(
            Object.entries(data.g).map(([eventId, groups]) => [
                eventId,
                groups.map(({ c, j, r, s }) => ({
                    competitors: c.map((id) => competitors.find((comp) => comp.id === id)),
                    judges: j.map((id) => competitors.find((comp) => comp.id === id)),
                    runners: r.map((id) => competitors.find((comp) => comp.id === id)),
                    scramblers: s.map((id) => competitors.find((comp) => comp.id === id)),
                })),
            ]),
        );
        selectedEvents = Object.keys(competitionData.groups);
        generateGroupHTML();
        document.getElementById('competition-setup').style.display = 'none';
        document.getElementById('event-selection').style.display = 'none';
        document.getElementById('competitor-setup').style.display = 'none';
        document.getElementById('grouping-results').style.display = 'block';
        document.getElementById('do-runners').checked = competitionData.includeRunners;
        document.getElementById('do-judges').checked = competitionData.includeJudges;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadCompetitionDataFromURL();
});

let selectedEvents = [];
let competitors = [];
let competitionData = {};

let includeRunners = false;
let includeJudges = false;

function selectAllEventCheckboxes() {
    var ele = document.getElementsByName('event-checkbox');
    for (var i = 0; i < ele.length; i++) {
        if (ele[i].type == 'checkbox') {
            ele[i].checked = true;
        }
    }
}

function deselectAllEventCheckboxes() {
    var ele = document.getElementsByName('event-checkbox');
    for (var i = 0; i < ele.length; i++) {
        if (ele[i].type == 'checkbox') {
            ele[i].checked = false;
        }
    }
}

function selectAllUnderLabel(labelId) {
    // Get all checkboxes in the container
    const checkboxes = document.querySelectorAll(`#${labelId} ~ input[type='checkbox']`);

    // Check all checkboxes
    checkboxes.forEach((checkbox) => (checkbox.checked = true));
}

function getEventSectionTitle(event) {
    // return a human-readable section title for grouping events
    if (!event || !event.id) return '';
    const id = event.id;
    if (id === '333') return 'NxNxN Cubes';
    if (id === '333oh') return 'One-Handed';
    if (id === 'fto') return 'FTO';
    if (id === '333ft') return 'Feet';
    if (id === 'clock') return 'Clock';
    if (id === 'pyram') return 'Pyraminx';
    if (id === 'minx') return 'Minx';
    if (id === 'redi') return 'Skewb';
    if (id === 'sq1') return 'Square-1';
    if (id === '333_mirror_blocks') return 'Mirror Blocks';
    if (id === 'magic') return 'Magic';
    if (id === 'miniguild') return 'Relays';
    if (id === '333fm') return '3x3 Variations';
    if (id === '222_squared') return 'Cuboids';
    if (id === '222bf') return 'Blindfolded';
    if (id === 'minx_bld') return 'Minx Blindfolded';
    if (id === '333_speed_bld') return 'Other Blindfolded';
    if (id === '333mbf') return 'Multi Blindfolded';
    if (id === '333_oh_bld_team_relay') return 'Relays Blindfolded';
    if (id === '15puzzle') return 'Other';
}

function setupCompetition() {
    const competitionName = document.getElementById('competition-name').value.trim();
    const maxCompetitorsRaw = document.getElementById('max-competitors').value;
    const maxCompetitors = Number.parseInt(maxCompetitorsRaw, 10);

    includeRunners = document.getElementById('do-runners').checked;
    includeJudges = document.getElementById('do-judges').checked;

    if (!competitionName) {
        alert('Please enter a competition name.');
        return;
    }
    if (!Number.isFinite(maxCompetitors) || maxCompetitors <= 0) {
        alert('Please enter a valid positive number for maximum competitors per group.');
        return;
    }

    competitionData.name = competitionName;
    competitionData.maxCompetitors = maxCompetitors;
    competitionData.includeRunners = includeRunners;
    competitionData.includeJudges = includeJudges;

    document.getElementById('competition-setup').classList.add('hidden');
    document.getElementById('event-selection').classList.remove('hidden');
    document.getElementById('event-selection').style.display = 'block';

    const eventCheckboxes = document.getElementById('event-checkboxes');
    if (!eventCheckboxes) return;

    // Clear the existing container and rebuild grouped by section title
    eventCheckboxes.innerHTML = '';

    let currentTitle = null;
    events.forEach((ev) => {
        const sectionTitle = getEventSectionTitle(ev);
        if (sectionTitle && sectionTitle !== currentTitle) {
            const titleDiv = document.createElement('div');
            titleDiv.className = 'event-section-title';
            titleDiv.textContent = sectionTitle;
            eventCheckboxes.appendChild(titleDiv);
            currentTitle = sectionTitle;
        }
        handleAddingEventDivs(ev, eventCheckboxes);
    });
}

function addCustomEvent() {
    const newEventName = prompt("What is the events' name?", '');
    if (newEventName == null || newEventName == '') return;

    const newEventId = prompt("What is the events' ID?", '');
    if (newEventId == null || newEventId == '') return;

    const newEventShortName = prompt("What is the events' short name?", '');
    if (newEventShortName == null || newEventShortName == '') return;

    const event = {
        id: newEventId,
        name: newEventName,
        shortName: newEventShortName,
    };

    events.push(event);

    const eventCheckboxes = document.getElementById('event-checkboxes');

    handleAddingEventDivs(event, eventCheckboxes);
}

const eventSearchbar = document.getElementById('event-searchbar');

eventSearchbar.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const eventCheckboxes = document.getElementById('event-checkboxes');
    const eventCheckboxDivs = eventCheckboxes.querySelectorAll('.event-checkbox');

    eventCheckboxDivs.forEach((checkbox) => {
        const pNameTag = checkbox.querySelector('p');
        const eventName = pNameTag.textContent.toLowerCase();
        const eventShortName = pNameTag.parentElement.id.toLowerCase();
        if (eventName.includes(searchTerm) || eventShortName.includes(searchTerm)) {
            checkbox.style.display = 'block';
        } else {
            checkbox.style.display = 'none';
        }
    });
});

function handleAddingEventDivs(event, eventCheckboxes) {
    if (!eventCheckboxes) eventCheckboxes = document.getElementById('event-checkboxes');
    if (!event || !eventCheckboxes) return;

    // Avoid duplicate tiles
    if (document.getElementById(event.id)) return;

    // Root tile
    const tile = document.createElement('div');
    tile.className = 'event-checkbox unchecked';
    tile.id = event.id;
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-pressed', 'false');

    const titleP = document.createElement('p');
    titleP.textContent = event.name || event.shortName || event.id;
    tile.appendChild(titleP);

    // Controls wrapper (hidden until selected)
    const controlsWrap = document.createElement('div');
    controlsWrap.className = 'controls hidden';

    // Dynamic group label (text first, checkbox after)
    const dynamicGroupLabel = document.createElement('label');
    dynamicGroupLabel.htmlFor = `dynamic-group-${event.id}`;
    dynamicGroupLabel.textContent = 'Dynamic Groups';

    const dynamicGroupCheckbox = document.createElement('input');
    dynamicGroupCheckbox.type = 'checkbox';
    dynamicGroupCheckbox.id = `dynamic-group-${event.id}`;
    dynamicGroupCheckbox.name = 'dynamic-group';
    dynamicGroupCheckbox.value = event.id;
    dynamicGroupCheckbox.checked = true;
    dynamicGroupCheckbox.addEventListener('click', (e) => e.stopPropagation());

    // append checkbox after textual label content
    dynamicGroupLabel.appendChild(dynamicGroupCheckbox);

    // Group count input
    const groupInput = document.createElement('input');
    groupInput.type = 'number';
    groupInput.id = `group-input-${event.id}`;
    groupInput.name = 'group-input';
    groupInput.placeholder = 'Max Groups';
    groupInput.style.display = 'none';

    dynamicGroupCheckbox.addEventListener('change', () => {
        groupInput.style.display = dynamicGroupCheckbox.checked ? 'none' : 'block';
    });

    // Competitor sort type label + select (label first)
    const competitorSortTypeLabel = document.createElement('label');
    competitorSortTypeLabel.htmlFor = `competitor-sort-type-${event.id}`;
    competitorSortTypeLabel.textContent = 'Sort:';

    const competitorSortTypeSelect = document.createElement('select');
    competitorSortTypeSelect.id = `competitor-sort-type-${event.id}`;
    competitorSortTypeSelect.name = 'competitor-sort-type';
    ['Round Robin', 'Linear', 'Random'].forEach((type) => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        competitorSortTypeSelect.appendChild(option);
    });
    competitorSortTypeLabel.appendChild(competitorSortTypeSelect);

    // Build wrapper layout (label-first controls)
    const leftControls = document.createElement('div');
    leftControls.appendChild(dynamicGroupLabel);
    leftControls.appendChild(groupInput);
    leftControls.appendChild(competitorSortTypeLabel);

    // Prevent clicks on controls from toggling the tile
    leftControls.addEventListener('click', (e) => e.stopPropagation());
    controlsWrap.appendChild(leftControls);

    tile.appendChild(controlsWrap);

    // Toggle selection behaviour (tile click or keyboard)
    function toggleSelection() {
        const isChecked = tile.classList.toggle('checked');
        tile.classList.toggle('unchecked', !isChecked);
        tile.setAttribute('aria-pressed', String(isChecked));
        if (isChecked) {
            controlsWrap.classList.remove('hidden');
            titleP.textContent = `${event.name}`;
        } else {
            controlsWrap.classList.add('hidden');
            titleP.textContent = event.name;
        }
    }

    tile.addEventListener('click', toggleSelection);
    tile.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSelection();
        }
    });

    eventCheckboxes.appendChild(tile);
}

function goToSetupCompetition() {
    document.getElementById('event-selection').classList.add('hidden');
    document.getElementById('competition-setup').classList.remove('hidden');
}

function goToEventSelection() {
    document.getElementById('competitor-setup').classList.add('hidden');
    document.getElementById('event-selection').classList.remove('hidden');
}

function selectEvents() {
    selectedEvents = Array.from(document.querySelectorAll('.event-checkbox.checked')).map(
        (checkbox) => checkbox.id,
    );

    if (selectedEvents.length === 0) {
        alert('Please select at least one event to continue.');
        return;
    }

    document.getElementById('event-selection').classList.add('hidden');
    document.getElementById('competitor-setup').classList.remove('hidden');

    // build competitor form now that we have selectedEvents
    updateCompetitorForm();
}

function updateCompetitorForm() {
    const competitorForm = document.getElementById('competitor-form');
    if (!competitorForm) return;
    competitorForm.innerHTML = '';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'competitor-name';
    nameInput.placeholder = 'Competitor Name';

    const wcaInput = document.createElement('input');
    wcaInput.type = 'text';
    wcaInput.id = 'competitor-wca';
    wcaInput.placeholder = 'WCA ID (optional)';

    competitorForm.appendChild(nameInput);
    competitorForm.appendChild(wcaInput);

    // Build event checkboxes with label BEFORE the checkbox input
    selectedEvents.forEach((eventId) => {
        const label = document.createElement('label');
        const event = events.find((e) => e.id === eventId) || { id: eventId, shortName: eventId };
        label.htmlFor = `event-${event.id}`;
        label.className = 'inline';

        // checkbox input first
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `event-${event.id}`;
        checkbox.value = event.id;
        checkbox.name = 'event-checkbox';

        label.appendChild(checkbox);

        // then the label text
        const textNode = document.createTextNode(event.shortName || event.name || event.id);
        label.appendChild(textNode);

        competitorForm.appendChild(label);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Add Competitor';
    addBtn.onclick = () => {
        addCompetitor();
    };

    competitorForm.appendChild(addBtn);
}

function addCompetitor() {
    const nameInput = document.getElementById('competitor-name');
    const wcaInput = document.getElementById('competitor-wca');

    let name = nameInput ? nameInput.value.trim() : '';
    let wcaId = wcaInput ? wcaInput.value.trim().toUpperCase() : '';

    if (!name && !wcaId) {
        alert('Please provide a competitor name or WCA ID.');
        return;
    }

    // simple WCA ID validation — preserve string if looks like an id else null
    if (!/^\d{4}[A-Z]{4}\d{2}$/.test(wcaId)) {
        // treat as not provided
        if (wcaId === '') wcaId = null;
        else wcaId = wcaId; // keep whatever the user typed (nonstandard)
    }

    const eventCheckboxes = document.querySelectorAll(
        '#competitor-form input[type="checkbox"]:checked',
    );
    const evts = Array.from(eventCheckboxes).map((cb) => cb.value);

    if (evts.length === 0) {
        alert('Please select at least one event for this competitor.');
        return;
    }

    const competitor = {
        id: competitors.length + 1,
        name,
        wcaId,
        events: evts,
        groupAssignments: {},
    };

    competitors.push(competitor);

    // reset inputs
    if (nameInput) nameInput.value = '';
    if (wcaInput) wcaInput.value = '';

    displayCompetitors(); // re-render
}

async function displayCompetitors(doNames = true) {
    const competitorListBody = document.querySelector('#competitor-list tbody');
    if (!competitorListBody) return;
    competitorListBody.innerHTML = '';

    for (let index = 0; index < competitors.length; index++) {
        const competitor = competitors[index];

        // If the competitor has a WCA ID but no name fetched, attempt to fetch
        if (competitor.wcaId && !competitor.nameFetched && doNames) {
            try {
                competitor.name = await getCompetitorName(competitor.wcaId);
            } catch (err) {
                console.warn('Could not fetch name for', competitor.wcaId);
            }
            competitor.nameFetched = true;
        }

        const row = document.createElement('tr');
        row.dataset.id = competitor.id;

        // ID cell
        const idCell = document.createElement('td');
        idCell.textContent = competitor.id;
        row.appendChild(idCell);

        // Name cell (inline editable)
        const nameCell = document.createElement('td');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = competitor.name;
        nameSpan.className = 'competitor-name';
        nameSpan.tabIndex = 0;

        // on click -> convert to input
        nameSpan.addEventListener('click', () => {
            const input = document.createElement('input');
            input.className = 'competitor-name-input';
            input.value = competitor.name;
            input.addEventListener('blur', () => {
                competitor.name = input.value.trim() || competitor.name;
                nameSpan.textContent = competitor.name;
                nameCell.removeChild(input);
                nameCell.appendChild(nameSpan);
            });
            nameCell.removeChild(nameSpan);
            nameCell.appendChild(input);
            input.focus();
        });

        nameSpan.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameSpan.click();
            }
        });

        nameCell.appendChild(nameSpan);
        row.appendChild(nameCell);

        // Events cell
        const eventsCell = document.createElement('td');
        eventsCell.textContent = competitor.events.join(', ');
        row.appendChild(eventsCell);

        // Actions cell
        const actionsCell = document.createElement('td');
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'delete-btn';
        deleteButton.setAttribute('aria-label', `Delete competitor ${competitor.name}`);
        deleteButton.onclick = () => {
            deleteCompetitor(competitor.id);
        };

        actionsCell.appendChild(deleteButton);
        row.appendChild(actionsCell);

        competitorListBody.appendChild(row);
    }

    // Refresh the competitor form (so new checkboxes use up-to-date selectedEvents)
    updateCompetitorForm();
}

async function getCompetitorName(wcaId) {
    const apiUrl = `/api/wca/${wcaId}/name`;

    try {
        // Fetch the name from the backend
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Error fetching data: ${response.statusText}`);
        }
        const data = await response.json();

        // Return the name
        return data.name;
    } catch (error) {
        console.error(`Error fetching name for event ${wcaId}: ${error.message}`);
        return wcaId;
    }
}

function deleteCompetitor(id) {
    const index = competitors.findIndex((c) => c.id === id);
    if (index === -1) return;
    competitors.splice(index, 1);

    // reassign compact ids
    competitors.forEach((c, idx) => (c.id = idx + 1));

    // re-render
    displayCompetitors();
    selectedEvents = selectedEvents.filter((eventId) =>
        competitors.some((competitor) => competitor.events.includes(eventId)),
    );
}

async function finalizeCompetitors() {
    competitionData.competitors = competitors;

    document.getElementById('competitor-setup').classList.add('hidden');
    document.getElementById('grouping-results').classList.remove('hidden');

    generateGroups();
}

async function sortArray(array, eventId) {
    // Attach original index to guarantee stability
    const competitorsWithIndex = array.map((competitor, index) => ({
        competitor,
        index,
        average: null,
    }));

    // Fetch averages
    for (const item of competitorsWithIndex) {
        const { competitor } = item;

        if (!competitor.wcaId) {
            item.average = null;
            continue;
        }

        try {
            const response = await fetch(`/api/wca/${competitor.wcaId}/${eventId}`);
            const data = await response.json();
            item.average = data?.average ?? null;
        } catch (error) {
            console.error(`Failed to fetch data for ${competitor.wcaId}:`, error);
            item.average = null;
        }
    }

    // Stable sort
    competitorsWithIndex.sort((a, b) => {
        const avgA = a.average ?? Number.MAX_VALUE;
        const avgB = b.average ?? Number.MAX_VALUE;

        if (avgA !== avgB) {
            return avgA - avgB; // slower → faster or vice versa per your intent
        }

        // Tie-breaker: original order
        return a.index - b.index;
    });

    // Return sorted competitors only
    return competitorsWithIndex.map((item) => item.competitor);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function generateGroups() {
    competitionData.groups = {}; // Reset groups data

    for (const eventId of selectedEvents) {
        const maxCompetitors = competitionData.maxCompetitors;

        // Competitors in this event
        let eventCompetitors = competitors.filter((c) => c.events.includes(eventId));

        // Sort by slowest time first
        eventCompetitors = await sortArray(eventCompetitors, eventId);

        const dynamicCheckbox = document.getElementById(`dynamic-group-${eventId}`);
        let numGroups;

        // Trust me, I thought about this. If something is broken, this is not it
        if (eventCompetitors.length === 1) {
            numGroups = 1;
        } else if (dynamicCheckbox && !dynamicCheckbox.checked) {
            const groupInput = document.getElementById(`group-input-${eventId}`);
            const rawValue = Number(groupInput?.value);

            numGroups = Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : 1;
        } else {
            if (maxCompetitors < eventCompetitors.length) {
                numGroups = Math.ceil(eventCompetitors.length / maxCompetitors);
            } else {
                numGroups = 2;
            }
        }

        const eventGroups = Array.from({ length: numGroups }, () => ({
            competitors: [],
            judges: [],
            scramblers: [],
            runners: [],
        }));

        // Get the sorting type for the event
        const sortTypeSelect = document.getElementById(`competitor-sort-type-${eventId}`);
        const sortType = sortTypeSelect?.value ?? 'Round Robin';

        console.log(eventCompetitors);

        if (sortType === 'Round Robin') {
            eventCompetitors.forEach((competitor, index) => {
                const groupIndex = numGroups - 1 - (index % numGroups);
                eventGroups[groupIndex].competitors.push(competitor);
                competitor.groupAssignments ??= {};
                competitor.groupAssignments[eventId] = groupIndex + 1;
            });
        } else if (sortType === 'Linear') {
            eventCompetitors.reverse();
            // slowest → fastest, straight fill
            let numPerGroup = Math.ceil(eventCompetitors.length / numGroups);

            for (let i = 0; i < numGroups; i++) {
                for (let j = 0; j < numPerGroup; j++) {
                    const competitorIndex = i * numPerGroup + j;
                    if (competitorIndex >= eventCompetitors.length) break;
                    const competitor = eventCompetitors[competitorIndex];
                    eventGroups[i].competitors.push(competitor);
                    competitor.groupAssignments ??= {};
                    competitor.groupAssignments[eventId] = i + 1;
                }
            }
        } else if (sortType === 'Random') {
            const shuffled = shuffleArray([...eventCompetitors]);
            shuffled.forEach((competitor, index) => {
                const groupIndex = index % numGroups;
                eventGroups[groupIndex].competitors.push(competitor);
                competitor.groupAssignments ??= {};
                competitor.groupAssignments[eventId] = groupIndex + 1;
            });
        }

        // Global role tracking (official-style behavior)
        const usedAsScrambler = new Set();
        const usedAsJudge = new Set();
        const usedAsRunner = new Set();

        // Precompute scrambler top pool once (not per group)
        const totalScramblersNeeded = eventGroups.reduce(
            (sum, g) => sum + Math.ceil(g.competitors.length / 6),
            0,
        );

        const topPoolSize = totalScramblersNeeded;
        const topCompetitors = eventCompetitors.slice(0, topPoolSize);

        // Shared shuffled fallback pool
        const shuffledAll = shuffleArray([...competitors]);

        eventGroups.forEach((group) => {
            const numScramblers = Math.ceil(group.competitors.length / 6);
            const numRunners = Math.ceil(Math.sqrt(group.competitors.length));

            const groupCompetitorSet = new Set(group.competitors);

            /* ================= SCRAMBLERS ================= */

            let availableScramblers = topCompetitors.filter(
                (c) =>
                    c.wcaId && // <-- NEW
                    c.events.includes(eventId) &&
                    !groupCompetitorSet.has(c) &&
                    !usedAsScrambler.has(c),
            );

            if (availableScramblers.length < numScramblers) {
                const fallback = shuffledAll.filter(
                    (c) =>
                        c.wcaId && // <-- NEW
                        !groupCompetitorSet.has(c) &&
                        !usedAsScrambler.has(c),
                );

                availableScramblers = availableScramblers.concat(fallback);
            }

            group.scramblers = availableScramblers.slice(0, numScramblers);
            group.scramblers.forEach((c) => usedAsScrambler.add(c));

            /* ================= JUDGES ================= */

            if (includeJudges) {
                const availableJudges = shuffledAll.filter(
                    (c) =>
                        !groupCompetitorSet.has(c) &&
                        !usedAsScrambler.has(c) &&
                        !usedAsJudge.has(c),
                );

                group.judges = availableJudges.slice(0, group.competitors.length);
                group.judges.forEach((c) => usedAsJudge.add(c));
            } else {
                group.judges = [];
            }

            /* ================= RUNNERS ================= */

            if (includeRunners) {
                const availableRunners = shuffledAll.filter(
                    (c) =>
                        !groupCompetitorSet.has(c) &&
                        !usedAsScrambler.has(c) &&
                        !usedAsJudge.has(c) &&
                        !usedAsRunner.has(c),
                );

                group.runners = availableRunners.slice(0, numRunners);
                group.runners.forEach((c) => usedAsRunner.add(c));
            } else {
                group.runners = [];
            }
        });

        competitionData.groups[eventId] = eventGroups;
    }

    generateGroupHTML();
    storeCompetitionDataInURL();
}

function generateGroupHTML() {
    const groupingOutput = document.getElementById('grouping-output');
    if (!groupingOutput) return;
    groupingOutput.innerHTML = '';

    for (const eventId of selectedEvents) {
        const eventGroups = competitionData.groups[eventId] || [];
        const event = events.find((e) => e.id === eventId) || {
            id: eventId,
            name: eventId,
            shortName: eventId,
        };
        const eventDiv = createEl('div', { className: 'event-group' });

        const header = createEl('div', { className: 'event-header' });
        const eventTitle = createEl('h3', { text: event.name });
        header.appendChild(eventTitle);

        // copy event button
        const copyEventBtn = createEl('button', {
            className: 'copy-tag small',
            text: 'Copy Event',
        });
        copyEventBtn.title = 'Copy the event to the clipboard';
        copyEventBtn.addEventListener('click', () => copyEvent(eventId));
        header.appendChild(copyEventBtn);

        // download CSV button
        const downloadBtn = createEl('button', {
            className: 'copy-tag small',
            text: 'Download CSV',
        });
        downloadBtn.title = 'Download groups for this event as CSV';
        downloadBtn.addEventListener('click', () => {
            const csvLines = [];
            eventGroups.forEach((group, gIdx) => {
                group.competitors.forEach((c) => {
                    csvLines.push(
                        [eventId, `Group ${gIdx + 1}`, c.id, c.name, c.wcaId || ''].join(','),
                    );
                });
            });
            const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${eventId}_groups.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });
        header.appendChild(downloadBtn);

        eventDiv.appendChild(header);

        eventGroups.forEach((group, groupIndex) => {
            group.competitors.sort((a, b) => a.id - b.id);

            const groupDiv = createEl('div', { className: 'group' });
            const left = createEl('div', {});
            const right = createEl('div', {});

            const groupTitle = createEl('h4', { text: `Group ${groupIndex + 1}` });
            left.appendChild(groupTitle);

            const metaWrapper = createEl('div', {});
            const editTag = createEl('button', {
                className: 'edit-tag small',
                text: `${group.competitors.length} ${
                    group.competitors.length > 1 ? 'competitors' : 'competitor'
                } - Edit Group`,
            });
            editTag.addEventListener('click', () => editGroup(group, eventId, groupIndex));
            metaWrapper.appendChild(editTag);

            const copyGroupTag = createEl('button', {
                className: 'copy-tag small',
                text: 'Copy Group',
            });
            copyGroupTag.title = 'Copy this group to clipboard';
            copyGroupTag.addEventListener('click', () => copyGroup(group, groupIndex));
            metaWrapper.appendChild(copyGroupTag);

            left.appendChild(metaWrapper);

            const competitorDiv = createEl('ul', {});
            group.competitors.forEach((competitor) => {
                const li = createEl('li', { text: competitor.name });
                competitorDiv.appendChild(li);
            });

            left.appendChild(competitorDiv);

            if (includeJudges && group.judges && group.judges.length) {
                const judgesDiv = createEl('div', {
                    html: `${group.judges.length > 1 ? 'Judges' : 'Judge'}: <span>${group.judges
                        .map((j) => j.name)
                        .join(', ')}</span>`,
                });
                left.appendChild(judgesDiv);
            }

            if (includeRunners && group.runners) {
                const runnersDiv = createEl('div', {
                    html: group.runners.length
                        ? `${group.runners.length > 1 ? 'Runners' : 'Runner'}: <span>${group.runners
                              .map((r) => r.name)
                              .join(', ')}</span>`
                        : 'Running Judges',
                });
                left.appendChild(runnersDiv);
            }

            const scramblerCount = (group.scramblers || []).length;
            const scramblersDiv = createEl('div', {
                html: `${scramblerCount > 1 ? 'Scramblers' : 'Scrambler'}: <span>${(
                    group.scramblers || []
                )
                    .map((s) => s.name)
                    .join(', ')}</span>`,
            });

            left.appendChild(scramblersDiv);

            groupDiv.appendChild(left);
            groupDiv.appendChild(right);
            eventDiv.appendChild(groupDiv);
        });

        groupingOutput.appendChild(eventDiv);
    }

    // Recreate competitor assignment cards (sorted)
    competitors
        .slice()
        .sort((a, b) => a.id - b.id)
        .forEach((competitor) => {
            const competitorDiv = createEl('div', { className: 'competitor-assignments' });
            const competitorTitle = createEl('div', { className: 'competitor-title' });
            const competitorName = createEl('h4', { text: `${competitor.name}` });
            const competitorWcaId = createEl('p', {
                text: competitor.wcaId ? `${competitor.wcaId}` : '',
            });
            competitorTitle.appendChild(competitorName);
            competitorTitle.appendChild(competitorWcaId);
            competitorDiv.appendChild(competitorTitle);

            const competitorTable = createEl('table', { className: 'competitor-table' });
            const headerRow = createEl('tr', {});
            ['Event', 'Compete', 'Judge', 'Run', 'Scramble'].forEach((t) =>
                headerRow.appendChild(createEl('th', { text: t })),
            );
            competitorTable.appendChild(headerRow);

            selectedEvents.forEach((eventId) => {
                const event = events.find((e) => e.id === eventId) || { shortName: eventId };
                const row = createEl('tr', {});
                row.appendChild(createEl('td', { text: event.shortName || event.name || eventId }));

                const competeGroups = (competitionData.groups[eventId] || [])
                    .map((group, index) =>
                        group.competitors.includes(competitor) ? index + 1 : null,
                    )
                    .filter((x) => x !== null)
                    .join(', ');
                row.appendChild(createEl('td', { text: competeGroups }));

                const judgeGroups = (competitionData.groups[eventId] || [])
                    .map((group, index) =>
                        group.judges && group.judges.includes(competitor) ? index + 1 : null,
                    )
                    .filter((x) => x !== null)
                    .join(', ');
                row.appendChild(createEl('td', { text: judgeGroups }));

                const runGroups = (competitionData.groups[eventId] || [])
                    .map((group, index) =>
                        group.runners && group.runners.includes(competitor) ? index + 1 : null,
                    )
                    .filter((x) => x !== null)
                    .join(', ');
                row.appendChild(createEl('td', { text: runGroups }));

                const scrambleGroups = (competitionData.groups[eventId] || [])
                    .map((group, index) =>
                        group.scramblers && group.scramblers.includes(competitor)
                            ? index + 1
                            : null,
                    )
                    .filter((x) => x !== null)
                    .join(', ');
                row.appendChild(createEl('td', { text: scrambleGroups }));

                competitorTable.appendChild(row);
            });

            competitorDiv.appendChild(competitorTable);
            groupingOutput.appendChild(competitorDiv);
        });
}

function copyGroup(group, groupIndex) {
    const groupText = group.competitors
        .map((competitor) => {
            const regId = competitor.id;
            const groupId = groupIndex + 1;
            if (competitor.wcaId) {
                return `${competitor.name} | ${competitor.wcaId} > ${regId} - ${groupId}`;
            } else {
                return `${competitor.name} > ${regId} - ${groupId}`;
            }
        })
        .join('\n');

    navigator.clipboard.writeText(groupText).then(
        () => {
            alert('Group copied to clipboard!');
        },
        (err) => {
            console.error('Could not copy text: ', err);
        },
    );
}

function copyEvent(eventId) {
    const eventGroups = competitionData.groups[eventId];

    let eventText = '';

    eventGroups.forEach((group, groupIndex) => {
        group.competitors.forEach((competitor) => {
            const regId = competitor.id;
            const groupId = groupIndex + 1;
            if (competitor.wcaId) {
                eventText += `${competitor.name} | ${competitor.wcaId} > ${regId} - ${groupId}`;
                if (
                    groupIndex < eventGroups.length - 1 ||
                    group.competitors.indexOf(competitor) < group.competitors.length - 1
                ) {
                    eventText += '\n';
                }
            } else {
                eventText += `${competitor.name} > ${regId} - ${groupId}`;
                if (
                    groupIndex < eventGroups.length - 1 ||
                    group.competitors.indexOf(competitor) < group.competitors.length - 1
                ) {
                    eventText += '\n';
                }
            }
        });
    });

    navigator.clipboard.writeText(eventText).then(
        () => {
            alert('Event copied to clipboard!');
        },
        (err) => {
            console.error('Could not copy text: ', err);
        },
    );
}

function editGroup(group, eventId, groupIndex) {
    const editModal = document.getElementById('edit-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const doneButton = document.getElementById('done-button');

    let numOfDropdowns = 0;

    modalTitle.textContent = `Edit Group ${groupIndex + 1} for ${
        events.find((e) => e.id === eventId).name
    }`;
    modalBody.innerHTML = '';

    const createDropdownList = (title, members) => {
        const container = document.createElement('div');
        const titleElement = document.createElement('h5');
        titleElement.textContent = title;
        container.appendChild(titleElement);

        members.forEach((member, index) => {
            const select = document.createElement('select');
            select.dataset.index = index;

            competitors.forEach((competitor) => {
                const option = document.createElement('option');
                option.value = competitor.id;
                option.textContent = competitor.name;
                if (competitor.name === member.name) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            container.appendChild(select);
            numOfDropdowns++;
        });

        return container;
    };

    const competitorContainer = createDropdownList('Competitors', group.competitors);
    modalBody.appendChild(competitorContainer);

    let judgeContainer, runnerContainer, scramblerContainer;

    if (includeJudges) {
        judgeContainer = createDropdownList('Judges', group.judges);
        modalBody.appendChild(judgeContainer);
    }

    if (includeRunners) {
        runnerContainer = createDropdownList('Runners', group.runners);
        modalBody.appendChild(runnerContainer);
    }

    scramblerContainer = createDropdownList('Scramblers', group.scramblers);
    modalBody.appendChild(scramblerContainer);

    // Helper function to create a button
    function createButton(text, className, onClickHandler) {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = className;
        button.onclick = onClickHandler;
        return button;
    }

    // Helper function to add a select dropdown
    function addSelect(container, groupArray, competitors) {
        if (numOfDropdowns < competitors.length) {
            const newSelect = document.createElement('select');
            newSelect.dataset.index = groupArray.length;

            // Populate the select dropdown with competitors
            competitors.forEach((competitor) => {
                const option = document.createElement('option');
                option.value = competitor.id;
                option.textContent = competitor.name;
                newSelect.appendChild(option);
            });

            container.appendChild(newSelect);
            numOfDropdowns++;
            groupArray.push(competitors[0]); // Add the first competitor by default
        }
    }

    // Helper function to remove the last select dropdown
    function removeSelect(container, groupArray) {
        if (groupArray.length > 1) {
            groupArray.pop();
            container.removeChild(container.lastChild);
            numOfDropdowns--;
        }
    }

    // Add and Remove buttons for competitors
    const addCompetitorButton = createButton('+', 'add-btn', () => {
        addSelect(competitorContainer, group.competitors, competitors);
    });
    const removeCompetitorButton = createButton('-', 'remove-btn', () => {
        removeSelect(competitorContainer, group.competitors);
    });
    competitorContainer.insertBefore(addCompetitorButton, competitorContainer.children[1]);
    competitorContainer.insertBefore(removeCompetitorButton, competitorContainer.children[1]);

    // Add and Remove buttons for judges (if enabled)
    if (includeJudges) {
        const addJudgeButton = createButton('+', 'add-btn', () => {
            addSelect(judgeContainer, group.judges, competitors);
        });
        const removeJudgeButton = createButton('-', 'remove-btn', () => {
            removeSelect(judgeContainer, group.judges);
        });
        judgeContainer.insertBefore(addJudgeButton, judgeContainer.children[1]);
        judgeContainer.insertBefore(removeJudgeButton, judgeContainer.children[1]);
    }

    // Add and Remove buttons for runners (if enabled)
    if (includeRunners) {
        const addRunnerButton = createButton('+', 'add-btn', () => {
            addSelect(runnerContainer, group.runners, competitors);
        });
        const removeRunnerButton = createButton('-', 'remove-btn', () => {
            removeSelect(runnerContainer, group.runners);
        });
        runnerContainer.insertBefore(addRunnerButton, runnerContainer.children[1]);
        runnerContainer.insertBefore(removeRunnerButton, runnerContainer.children[1]);
    }

    // Add and Remove buttons for scramblers
    const addScramblerButton = createButton('+', 'add-btn', () => {
        addSelect(scramblerContainer, group.scramblers, competitors);
    });
    const removeScramblerButton = createButton('-', 'remove-btn', () => {
        removeSelect(scramblerContainer, group.scramblers);
    });
    scramblerContainer.insertBefore(addScramblerButton, scramblerContainer.children[1]);
    scramblerContainer.insertBefore(removeScramblerButton, scramblerContainer.children[1]);

    doneButton.onclick = () => {
        const selectedCompetitors = new Set();
        let hasDuplicateAssignments = false;

        const updateGroupMembers = (container, members) => {
            const selects = container.querySelectorAll('select');
            selects.forEach((select) => {
                const index = select.dataset.index;
                const selectedCompetitor = competitors.find(
                    (competitor) => competitor.id == select.value,
                );

                if (selectedCompetitors.has(selectedCompetitor.id)) {
                    hasDuplicateAssignments = true;
                } else {
                    selectedCompetitors.add(selectedCompetitor.id);
                    members[index] = selectedCompetitor;
                }
            });
        };

        updateGroupMembers(competitorContainer, group.competitors);

        if (includeJudges) {
            updateGroupMembers(judgeContainer, group.judges);
        }

        if (includeRunners) {
            updateGroupMembers(runnerContainer, group.runners);
        }

        updateGroupMembers(scramblerContainer, group.scramblers);

        if (hasDuplicateAssignments) {
            alert('A competitor cannot be assigned to more than one task in the same group.');
            return;
        }

        // Update the competitionData object with the new group data
        competitionData.groups[eventId][groupIndex] = group;

        // Update each competitor's task data
        competitors.forEach((competitor) => {
            competitor.groupAssignments[eventId] = null;
        });

        group.competitors.forEach((competitor) => {
            competitionData.competitors[competitor.id - 1].groupAssignments[eventId] =
                groupIndex + 1;
            console.log(competitionData.competitors[competitor.id - 1].groupAssignments[eventId]);

            competitor.groupAssignments[eventId] = groupIndex;
        });

        group.judges.forEach((judge) => {
            judge.groupAssignments[eventId] = groupIndex;
        });

        group.runners.forEach((runner) => {
            runner.groupAssignments[eventId] = groupIndex;
        });

        group.scramblers.forEach((scrambler) => {
            scrambler.groupAssignments[eventId] = groupIndex;
        });

        editModal.style.display = 'none';
        generateGroupHTML();
    };

    editModal.style.display = 'block';
}

document.addEventListener('keydown', (event) => {
    if (event.shiftKey && location.port === '8001') {
        const mockButton = document.createElement('button');
        mockButton.textContent = 'Add Mock Data';
        mockButton.className = 'mock-button';
        mockButton.onclick = addMockData;
        const title = document.querySelector('h1');
        title.appendChild(mockButton);
    }
});

document.addEventListener('keyup', () => {
    const mockButton = document.querySelector('.mock-button');
    if (mockButton) {
        mockButton.remove();
    }
});

function addMockData() {
    const currentStep =
        document.getElementById('event-selection').style.display === 'block'
            ? 'events'
            : document.getElementById('competitor-setup').style.display === 'block'
              ? 'competitors'
              : 'setup';

    if (currentStep === 'setup') {
        document.getElementById('competition-name').value = 'Mock Competition';
        document.getElementById('max-competitors').value = 6;
        document.getElementById('do-judges').checked = true;
        document.getElementById('do-runners').checked = true;
        setupCompetition();
        handleAddingMockEvents();
        selectEvents();
        handleAddingMockCompetitors();
        finalizeCompetitors();
    } else if (currentStep === 'events') {
        handleAddingMockEvents();
    } else if (currentStep === 'competitors') {
        handleAddingMockCompetitors();
    }
}

function handleAddingMockEvents() {
    selectedEvents = ['222', '333', '444', '555', '666', '777'];

    const eventConfig = {
        222: { sort: 'Round Robin', dynamic: true },
        333: { sort: 'Linear', dynamic: true },
        444: { sort: 'Random', dynamic: true },
        555: { sort: 'Linear', dynamic: false, groups: 3 },
        666: { sort: 'Round Robin', dynamic: false, groups: 4 },
        777: { sort: 'Random', dynamic: false, groups: 5 },
    };

    selectedEvents.forEach((id) => {
        const checkbox = document.getElementById(id);
        checkbox.classList.add('checked');
        checkbox.classList.remove('unchecked');
        checkbox.innerHTML = `<p>${events.find((e) => e.id === id).name}</p>`;

        const dynamicGroupCheckbox = document.createElement('input');
        dynamicGroupCheckbox.type = 'checkbox';
        dynamicGroupCheckbox.id = `dynamic-group-${id}`;
        dynamicGroupCheckbox.checked = eventConfig[id].dynamic;
        dynamicGroupCheckbox.addEventListener('click', (e) => e.stopPropagation());

        const dynamicGroupLabel = document.createElement('label');
        dynamicGroupLabel.htmlFor = dynamicGroupCheckbox.id;
        dynamicGroupLabel.textContent = 'Dynamic Groups';

        const groupInput = document.createElement('input');
        groupInput.type = 'number';
        groupInput.id = `group-input-${id}`;
        groupInput.placeholder = 'Number of Groups';
        groupInput.style.display = eventConfig[id].dynamic ? 'none' : 'block';

        if (!eventConfig[id].dynamic) {
            groupInput.value = eventConfig[id].groups;
        }

        dynamicGroupCheckbox.addEventListener('change', () => {
            groupInput.style.display = dynamicGroupCheckbox.checked ? 'none' : 'block';
        });

        const competitorSortTypeSelect = document.createElement('select');
        competitorSortTypeSelect.id = `competitor-sort-type-${id}`;

        ['Round Robin', 'Linear', 'Random'].forEach((type) => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            competitorSortTypeSelect.appendChild(option);
        });

        competitorSortTypeSelect.value = eventConfig[id].sort;

        const competitorSortTypeLabel = document.createElement('label');
        competitorSortTypeLabel.textContent = 'Sort competitors by:';
        competitorSortTypeLabel.appendChild(competitorSortTypeSelect);

        const wrapper = document.createElement('div');
        dynamicGroupLabel.appendChild(dynamicGroupCheckbox);
        wrapper.appendChild(dynamicGroupLabel);
        wrapper.appendChild(groupInput);
        wrapper.appendChild(competitorSortTypeLabel);

        wrapper.addEventListener('click', (e) => e.stopPropagation());
        checkbox.appendChild(wrapper);
    });
}

function handleAddingMockCompetitors() {
    const allEvents = ['222', '333', '444', '555', '666', '777'];
    const mockCompetitors = [];

    for (let i = 1; i <= 8; i++) {
        mockCompetitors.push({
            id: i,
            name: `Competitor ${i}`,
            wcaId: null,
            events: allEvents,
            groupAssignments: {},
        });
    }

    for (let i = 9; i <= 16; i++) {
        mockCompetitors.push({
            id: i,
            name: `WCA ID ${i}`,
            wcaId: '2023KLIN02',
            events: allEvents,
            groupAssignments: {},
        });
    }

    competitors = mockCompetitors;
    competitionData.competitors = competitors;
    console.log('Mock competitors:', competitors);
    displayCompetitors(false);
}

function storeCompetitionDataInURL() {
    try {
        const flags = (includeRunners ? 1 : 0) | (includeJudges ? 2 : 0);

        const index = Object.fromEntries(competitors.map((c, i) => [c.id, i]));

        const comp = competitors.map((c) => [c.id, c.name, c.events || []]);

        const groups = {};
        Object.entries(competitionData.groups || {}).forEach(([eid, gs]) => {
            groups[eid] = gs.map((g) => [
                (g.competitors || []).map((p) => index[p.id]),
                (g.judges || []).map((p) => index[p.id]),
                (g.runners || []).map((p) => index[p.id]),
                (g.scramblers || []).map((p) => index[p.id]),
            ]);
        });

        const json = JSON.stringify([flags, comp, groups]);
        const encoded = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const url = new URL(location.href);
        url.searchParams.set('cd', encoded);
        history.replaceState({}, '', url);
    } catch (err) {
        console.warn('storeCompetitionDataInURL failed:', err);
    }
}

function loadCompetitionDataFromURL() {
    try {
        const cd =
            new URLSearchParams(location.search).get('cd') || location.hash.replace(/^#cd=/, '');
        if (!cd) return false;

        const json = atob(cd.replace(/-/g, '+').replace(/_/g, '/'));
        const [flags, comp, groups] = JSON.parse(json);

        includeRunners = !!(flags & 1);
        includeJudges = !!(flags & 2);

        competitors = comp.map(([id, name, events]) => ({
            id,
            name,
            events: events || [],
            groupAssignments: {},
        }));

        competitionData = competitionData || {};
        competitionData.competitors = competitors;
        competitionData.groups = {};

        Object.entries(groups || {}).forEach(([eid, gs]) => {
            competitionData.groups[eid] = gs.map(([c, j, r, s]) => ({
                competitors: c.map((i) => competitors[i]).filter(Boolean),
                judges: j.map((i) => competitors[i]).filter(Boolean),
                runners: r.map((i) => competitors[i]).filter(Boolean),
                scramblers: s.map((i) => competitors[i]).filter(Boolean),
            }));
        });

        selectedEvents = Object.keys(competitionData.groups);

        // Rendering

        const runnersEl = document.getElementById('do-runners');
        const judgesEl = document.getElementById('do-judges');
        if (runnersEl) runnersEl.checked = includeRunners;
        if (judgesEl) judgesEl.checked = includeJudges;

        const eventCheckboxes = document.getElementById('event-checkboxes');
        if (eventCheckboxes && events?.length) {
            selectedEvents.forEach((eid) => {
                if (!document.getElementById(eid)) {
                    const eventObj = events.find((e) => e.id === eid) || {
                        id: eid,
                        name: eid,
                        shortName: eid,
                    };
                    handleAddingEventDivs(eventObj, eventCheckboxes);
                    const tile = document.getElementById(eid);
                    if (tile) {
                        tile.classList.add('checked');
                        tile.classList.remove('unchecked');
                    }
                }
            });
        }

        displayCompetitors(true);
        generateGroupHTML();

        if (Object.keys(competitionData.groups || {}).length) {
            document.getElementById('competition-setup')?.classList.add('hidden');
            document.getElementById('event-selection')?.classList.add('hidden');
            document.getElementById('competitor-setup')?.classList.add('hidden');
            document.getElementById('grouping-results')?.classList.remove('hidden');
        }

        return true;
    } catch (err) {
        console.warn('loadCompetitionDataFromURL failed:', err);
        return false;
    }
}
