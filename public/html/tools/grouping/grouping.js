const events = [
    // NxNxN Cubes
    { id: '333', name: '3x3x3 Cube', shortName: '3x3' },
    { id: '222', name: '2x2x2 Cube', shortName: '2x2' },
    { id: '444', name: '4x4x4 Cube', shortName: '4x4' },
    { id: '555', name: '5x5x5 Cube', shortName: '5x5' },
    { id: '666', name: '6x6x6 Cube', shortName: '6x6' },
    { id: '777', name: '7x7x7 Cube', shortName: '7x7' },
    { id: '888', name: '8x8x8 Cube', shortName: '8x8' },
    { id: '999', name: '9x9x9 Cube', shortName: '9x9' },

    // One-Handed
    { id: '333oh', name: '3x3x3 One-Handed', shortName: '3x3 OH' },
    { id: '222oh', name: '2x2x2 One-Handed', shortName: '2x2 OH' },
    { id: '333oh_x2', name: '3x3x3 Double One-Handed', shortName: 'Double OH' },
    { id: '333oh_water', name: '3x3x3 H2OH', shortName: 'H2OH' },
    { id: '444oh', name: '4x4x4 One-Handed', shortName: '4x4 OH' },
    { id: 'minx_oh', name: 'Megaminx One-Handed', shortName: 'Minx OH' },
    { id: 'clock_oh', name: 'Clock One-Handed', shortName: 'Clock OH' },
    { id: 'magic_oh', name: 'Magic One-Handed', shortName: 'Magic OH' },

    // FTO
    { id: 'fto', name: 'Face-Turning Octahedron', shortName: 'FTO' },
    {
        id: 'fto_bld',
        name: 'Face-Turning Octahedron Blindfolded',
        shortName: 'FTO BLD',
    },
    {
        id: 'fto_mbld',
        name: 'Face-Turning Octahedron Multi-Blind',
        shortName: 'FTO MBLD',
    },

    // Feet
    { id: '333ft', name: '3x3x3 With Feet', shortName: 'Feet' },
    { id: '444ft', name: '4x4x4 With Feet', shortName: '4x4 Feet' },

    // Clock
    { id: 'clock', name: 'Clock', shortName: 'Clock' },
    { id: 'penta_clock', name: 'Pentagonal Clock', shortName: '5x5 Clock' },
    { id: 'clock_doubles', name: 'Clock Doubles', shortName: 'Clock Dbl.' },

    // Pyraminx
    { id: 'pyram', name: 'Pyraminx', shortName: 'Pyram' },
    { id: 'mpyram', name: 'Master Pyraminx', shortName: 'Master Pyram' },
    { id: 'pyram_duo', name: 'Pyraminx Duo', shortName: 'Pyram Duo' },
    { id: 'pyramorphix', name: 'Pyramorphix', shortName: 'Pyramorph' },

    // Minx
    { id: 'minx', name: 'Megaminx', shortName: 'Minx' },
    { id: 'kilominx', name: 'Kilominx', shortName: 'Kilo' },
    { id: 'mkilominx', name: 'Master Kilominx', shortName: 'M. Kilo' },
    { id: 'gigaminx', name: 'Gigaminx', shortName: 'Giga' },

    // Skewb
    { id: 'redi', name: 'Redi Cube', shortName: 'Redi' },
    { id: 'skewb', name: 'Skewb', shortName: 'Skewb' },
    { id: 'ivy_cube', name: 'Ivy Cube', shortName: 'Ivy' },

    // Square-1
    { id: 'sq1', name: 'Square-1', shortName: 'SQ1' },

    // Mirror Blocks
    { id: '333_mirror_blocks', name: 'Mirror Blocks', shortName: 'Mirror' },
    {
        id: '222_mirror_blocks',
        name: '2x2x2 Mirror Blocks',
        shortName: '2x2 Mirror',
    },
    {
        id: '333_mirror_blocks_bld',
        name: 'Mirror Blocks Blindfolded',
        shortName: 'Mirror BLD',
    },

    // Magic
    { id: 'magic', name: 'Magic', shortName: 'Magic' },
    { id: 'mmagic', name: 'Master Magic', shortName: 'M. Magic' },

    // Relays
    { id: 'miniguild', name: 'Mini Guildford', shortName: 'Mini Guild' },
    {
        id: 'miniguild_2_person',
        name: '2-man Mini Guildford',
        shortName: '2p Guild',
    },
    { id: '234relay', name: '2x2x2-4x4x4 Relay', shortName: '2-4 Relay' },
    { id: '2345relay', name: '2x2x2-5x5x5 Relay', shortName: '2-5 Relay' },
    { id: '234567relay', name: '2x2x2-7x7x7 Relay', shortName: '2-7 Relay' },
    {
        id: '234567relay_2_person',
        name: '2-man 2x2x2-7x7x7 Relay',
        shortName: '2p 2-7 Relay',
    },

    // 3x3 Variations
    { id: '333fm', name: '3x3x3 Fewest Moves', shortName: '3x3 FM' },
    {
        id: '333_linear_fm',
        name: '3x3x3 Linear Fewest Moves',
        shortName: 'Linear FM',
    },
    { id: '333mts', name: '3x3x3 Match The Scramble', shortName: 'MTS' },
    {
        id: '333mts_old',
        name: '3x3x3 Match The Scramble With Inspection',
        shortName: 'MTS Old',
    },
    {
        id: '333_team_factory',
        name: '3x3x3 Team Factory',
        shortName: 'Team Factory',
    },
    {
        id: '333_inspectionless',
        name: '3x3x3 No Inspection',
        shortName: 'No Inspect',
    },
    { id: '333_scrambling', name: '3x3x3 Scrambling', shortName: 'Scramble' },
    { id: '333_one_side', name: '3x3x3 One Side', shortName: 'One Side' },
    {
        id: '333_x3_relay',
        name: 'Three 3x3x3 Cubes Relay',
        shortName: '3x3 Relay',
    },
    { id: '333_cube_mile', name: '3x3x3 Cube Mile', shortName: 'Cube Mile' },
    {
        id: '333_oven_mitts',
        name: '3x3x3 With Oven Mitts',
        shortName: 'Oven Mitts',
    },
    { id: '333_supersolve', name: '3x3x3 Supersolve', shortName: 'Supersolve' },
    { id: '333_siamese', name: 'Siamese Cube', shortName: 'Siamese' },

    // Cuboids
    { id: '222_squared', name: '2x2x2 Squared', shortName: '2x2 Sq.' },
    { id: '223_cuboid', name: '2x2x3 Cuboid', shortName: '2x2x3' },
    { id: '223_banana', name: '2x2x3 Banana', shortName: 'Banana' },

    // NxNxN Blindfolded
    { id: '222bf', name: '2x2x2 Blindfolded', shortName: '2x2 BLD' },
    { id: '333bf', name: '3x3x3 Blindfolded', shortName: '3x3 BLD' },
    { id: '444bf', name: '4x4x4 Blindfolded', shortName: '4x4 BLD' },
    { id: '555bf', name: '5x5x5 Blindfolded', shortName: '5x5 BLD' },
    { id: '666bf', name: '6x6x6 Blindfolded', shortName: '6x6 BLD' },
    { id: '777bf', name: '7x7x7 Blindfolded', shortName: '7x7 BLD' },
    { id: '888bf', name: '8x8x8 Blindfolded', shortName: '8x8 BLD' },
    { id: '999bf', name: '9x9x9 Blindfolded', shortName: '9x9 BLD' },
    { id: '101010bf', name: '10x10x10 Blindfolded', shortName: '10x10 BLD' },
    { id: '111111bf', name: '11x11x11 Blindfolded', shortName: '11x11 BLD' },

    // Minx Blindfolded
    { id: 'minx_bld', name: 'Megaminx Blindfolded', shortName: 'Minx BLD' },
    {
        id: 'minx444_bld',
        name: 'Master Kilominx Blindfolded',
        shortName: 'M. Kilo BLD',
    },
    { id: 'minx555_bld', name: 'Gigaminx Blindfolded', shortName: 'Giga BLD' },
    {
        id: 'minx2345relay_bld',
        name: 'Kilo-Gigaminx Relay Blindfolded',
        shortName: 'Kilo-Giga BLD',
    },

    // Other Blindfolded
    { id: '333_speed_bld', name: '3x3x3 Speed-Blind', shortName: 'Speed BLD' },
    { id: '333_team_bld', name: '3x3x3 Team-Blind', shortName: 'Team BLD' },
    {
        id: '333_team_bld_old',
        name: '3x3x3 Team-Blind With Inspection',
        shortName: 'Team BLD Old',
    },
    { id: 'sq1_bld', name: 'Square-1 Blindfolded', shortName: 'SQ1 BLD' },
    {
        id: 'pyram_crystal_bld',
        name: 'Pyraminx Crystal Blindfolded',
        shortName: 'Pyram Cr. BLD',
    },

    // Multi-Blindfolded
    { id: '333mbf', name: '3x3x3 Multi-Blind', shortName: '3x3 MBLD' },
    { id: '444mbf', name: '4x4x4 Multi-Blind', shortName: '4x4 MBLD' },
    { id: '555mbf', name: '5x5x5 Multi-Blind', shortName: '5x5 MBLD' },
    { id: 'sq1_mbo', name: 'Square-1 Multi-Blind', shortName: 'SQ1 MBLD' },
    { id: '333mbo', name: '3x3x3 Multi-Blind Old Style', shortName: 'Old MBLD' },

    // Relays Blindfolded
    {
        id: '333_oh_bld_team_relay',
        name: '3x3x3 + OH + BLD Team Relay',
        shortName: '3x3+OH+Blind Relay',
    },
    {
        id: '333bf_2_person_relay',
        name: '3x3x3 Blindfolded 2-man Relay',
        shortName: 'BLD 2p Relay',
    },
    {
        id: '333bf_3_person_relay',
        name: '3x3x3 Blindfolded 3-man Relay',
        shortName: 'BLD 3p Relay',
    },
    {
        id: '333bf_4_person_relay',
        name: '3x3x3 Blindfolded 4-man Relay',
        shortName: 'BLD 4p Relay',
    },
    {
        id: '333bf_8_person_relay',
        name: '3x3x3 Blindfolded 8-man Relay',
        shortName: 'BLD 8p Relay',
    },
    {
        id: '2345relay_bld',
        name: '2x2x2-5x5x5 Relay Blindfolded',
        shortName: '2-5 BLD Relay',
    },
    {
        id: '234567relay_bld',
        name: '2x2x2-7x7x7 Relay Blindfolded',
        shortName: '2-7 BLD Relay',
    },
    {
        id: '2345678relay_bld',
        name: '2x2x2-8x8x8 Relay Blindfolded',
        shortName: '2-8 BLD Relay',
    },
    {
        id: 'miniguild_bld',
        name: 'Mini Guildford Blindfolded',
        shortName: 'Mini Guild BLD',
    },

    // Other
    { id: '15puzzle', name: '15 Puzzle', shortName: '15 Puzz.' },
    {
        id: 'corner_heli222',
        name: 'Corner Helicopter 2x2x2',
        shortName: 'Heli 2x2',
    },
    { id: 'gear_cube', name: 'Gear Cube', shortName: 'Gear' },
    { id: 'rainbow_cube', name: 'Rainbow Cube', shortName: 'Rainbow' },
    { id: '360_puzzle', name: '360 Puzzle', shortName: '360' },
    { id: 'snake', name: 'Snake', shortName: 'Snake' },
    { id: 'dino', name: 'Dino Cube', shortName: 'Dino' },
];

function storeCompetitionDataInURL() {
    const url = new URL(window.location.href);
    const data = {
        r: competitionData.includeRunners,
        j: competitionData.includeJudges,
        c: competitors.map(({ id, name, wcaId, events }) => ({ id, name, wcaId, events })),
        g: Object.fromEntries(
            Object.entries(competitionData.groups).map(([eventId, groups]) => [
                eventId,
                groups.map(({ competitors, judges, runners, scramblers }) => ({
                    c: competitors.map(({ id }) => id),
                    j: judges.map(({ id }) => id),
                    r: runners.map(({ id }) => id),
                    s: scramblers.map(({ id }) => id),
                })),
            ])
        ),
    };
    const compressedData = btoa(JSON.stringify(data));
    url.searchParams.set('cd', compressedData);
    window.history.replaceState({}, '', url);
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
            ])
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

function setupCompetition() {
    const competitionName = document.getElementById('competition-name').value;
    const maxCompetitors = document.getElementById('max-competitors').value;

    // Get checkbox states
    includeRunners = document.getElementById('do-runners').checked;
    includeJudges = document.getElementById('do-judges').checked;

    if (competitionName && maxCompetitors) {
        competitionData.name = competitionName;
        competitionData.maxCompetitors = parseInt(maxCompetitors);
        competitionData.includeRunners = includeRunners;
        competitionData.includeJudges = includeJudges;

        document.getElementById('competition-setup').style.display = 'none';
        document.getElementById('event-selection').style.display = 'block';

        const eventCheckboxes = document.getElementById('event-checkboxes');
        eventCheckboxes.innerHTML = ''; // Clear previous checkboxes if any

        let currentTitle = '';

        events.forEach((event) => {
            let newTitle = '';

            // Determine the title based on the event's id
            if (event.id === '333') newTitle = 'NxNxN Cubes';
            else if (event.id === '333oh') newTitle = 'One-Handed';
            else if (event.id === 'fto') newTitle = 'FTO';
            else if (event.id === '333ft') newTitle = 'Feet';
            else if (event.id === 'clock') newTitle = 'Clock';
            else if (event.id === 'pyram') newTitle = 'Pyraminx';
            else if (event.id === 'minx') newTitle = 'Minx';
            else if (event.id === 'redi') newTitle = 'Skewb';
            else if (event.id === 'sq1') newTitle = 'Square-1';
            else if (event.id === '333_mirror_blocks') newTitle = 'Mirror Blocks';
            else if (event.id === 'magic') newTitle = 'Magic';
            else if (event.id === 'miniguild') newTitle = 'Relays';
            else if (event.id === '333fm') newTitle = '3x3 Variations';
            else if (event.id === '222_squared') newTitle = 'Cuboids';
            else if (event.id === '222bf') newTitle = 'Blindfolded';
            else if (event.id === 'minx_bld') newTitle = 'Minx Blindfolded';
            else if (event.id === '333_speed_bld') newTitle = 'Other Blindfolded';
            else if (event.id === '333mbf') newTitle = 'Multi Blindfolded';
            else if (event.id === '333_oh_bld_team_relay') newTitle = 'Relays Blindfolded';
            else if (event.id === '15puzzle') newTitle = 'Other';

            // If the title changes, add a heading before the next section
            if (newTitle && newTitle !== currentTitle) {
                const titleDiv = document.createElement('div');
                titleDiv.className = 'event-section-title';
                titleDiv.textContent = newTitle;

                // Add a click event listener to the titleDiv
                titleDiv.addEventListener('click', () => {
                    let nextElement = titleDiv.nextElementSibling;
                    const checkboxes = [];

                    // Gather all checkboxes under the current title
                    while (nextElement && !nextElement.classList.contains('event-section-title')) {
                        const checkbox = nextElement.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            checkboxes.push(checkbox);
                        }
                        nextElement = nextElement.nextElementSibling;
                    }

                    // Determine if all checkboxes are already checked
                    const allChecked = checkboxes.every((checkbox) => checkbox.checked);

                    // Set all checkboxes to the opposite of allChecked
                    checkboxes.forEach((checkbox) => {
                        checkbox.checked = !allChecked;
                    });
                });

                eventCheckboxes.appendChild(titleDiv);
                currentTitle = newTitle;
            }

            handleAddingEventDivs(event, eventCheckboxes);
        });
    }
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

function handleAddingEventDivs(event, eventCheckboxes) {
    if (!eventCheckboxes) eventCheckboxes = document.getElementById('event-checkboxes');

    // Create the checkbox
    const checkbox = document.createElement('div');
    checkbox.classList = 'event-checkbox unchecked';
    checkbox.id = event.id;
    checkbox.value = event.id;
    checkbox.innerHTML = `<p>${event.name}</p>`;

    // Append the label directly to the parent container
    eventCheckboxes.appendChild(checkbox);

    checkbox.addEventListener('click', () => {
        checkbox.classList.toggle('checked');
        checkbox.classList.toggle('unchecked');

        if (checkbox.classList.contains('checked')) {
            checkbox.innerHTML = `<p>${event.name} (Selected)</p>`;

            const dynamicGroupCheckbox = document.createElement('input');
            dynamicGroupCheckbox.type = 'checkbox';
            dynamicGroupCheckbox.addEventListener('click', (e) => e.stopPropagation());
            dynamicGroupCheckbox.id = `dynamic-group-${event.id}`;
            dynamicGroupCheckbox.name = 'dynamic-group';
            dynamicGroupCheckbox.value = event.id;
            dynamicGroupCheckbox.checked = true;

            const dynamicGroupLabel = document.createElement('label');
            dynamicGroupLabel.htmlFor = `dynamic-group-${event.id}`;
            dynamicGroupLabel.textContent = 'Dynamic Groups';

            const groupInput = document.createElement('input');
            groupInput.type = 'number';
            groupInput.id = `group-input-${event.id}`;
            groupInput.name = 'group-input';
            groupInput.placeholder = 'Max Groups';
            groupInput.style.display = 'none';

            dynamicGroupCheckbox.addEventListener('change', () => {
                groupInput.style.display = dynamicGroupCheckbox.checked ? 'none' : 'block';
            });

            const wrapper = document.createElement('div');
            dynamicGroupLabel.appendChild(dynamicGroupCheckbox);
            wrapper.appendChild(dynamicGroupLabel);
            wrapper.appendChild(groupInput);

            const competitorSortTypeSelect = document.createElement('select');
            competitorSortTypeSelect.id = `competitor-sort-type-${event.id}`;
            competitorSortTypeSelect.name = 'competitor-sort-type';
            competitorSortTypeSelect.style.display = 'block';

            const competitorSortTypeLabel = document.createElement('label');
            competitorSortTypeLabel.htmlFor = `competitor-sort-type-${event.id}`;
            competitorSortTypeLabel.textContent = 'Sort competitors by:';

            const sortTypes = ['Round Robin', 'Linear', 'Random'];

            sortTypes.forEach((sortType) => {
                const option = document.createElement('option');
                option.value = sortType;
                option.textContent = sortType;
                competitorSortTypeSelect.appendChild(option);
            });

            competitorSortTypeLabel.appendChild(competitorSortTypeSelect);

            wrapper.appendChild(competitorSortTypeLabel);

            // Prevent the checkbox from closing if the input is clicked
            wrapper.addEventListener('click', (e) => e.stopPropagation());

            checkbox.appendChild(wrapper);

            // Special events (all fewest moves and multi blind events)
            if (
                event.id.includes('fm') ||
                event.id.includes('mbf') ||
                event.id.includes('mbld') ||
                event.id === '333_mbo'
            ) {
                dynamicGroupCheckbox.checked = false;
                dynamicGroupCheckbox.disabled = true;
                groupInput.value = 1;
                groupInput.disabled = true;
                groupInput.style.display = 'block';
            }
        } else {
            checkbox.innerHTML = `<p>${event.name}</p>`;

            const wrapper = checkbox.querySelector('div');
            if (wrapper) wrapper.remove();
        }
    });
}

function goToSetupCompetition() {
    document.getElementById('event-selection').style.display = 'none';
    document.getElementById('competition-setup').style.display = 'block';
}

function goToEventSelection() {
    document.getElementById('competitor-setup').style.display = 'none';
    document.getElementById('event-selection').style.display = 'block';
}

function selectEvents() {
    selectedEvents = Array.from(document.querySelectorAll('.event-checkbox.checked')).map(
        (checkbox) => checkbox.id
    );

    if (selectedEvents.length > 0) {
        document.getElementById('event-selection').style.display = 'none';
        document.getElementById('competitor-setup').style.display = 'block';
        updateCompetitorForm();
    }
}

function updateCompetitorForm() {
    const competitorForm = document.getElementById('competitor-form');
    competitorForm.innerHTML = '';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'competitor-name';
    nameInput.placeholder = 'Competitor Name';

    competitorForm.appendChild(nameInput);

    selectedEvents.forEach((eventId) => {
        const event = events.find((e) => e.id === eventId);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `event-${event.id}`;
        checkbox.value = event.id;
        checkbox.name = 'event-checkbox';

        const label = document.createElement('label');
        label.htmlFor = `event-${event.id}`;
        label.textContent = event.shortName;

        const div = document.createElement('div');
        div.appendChild(checkbox);
        div.appendChild(label);
        div.className += 'inline';

        competitorForm.appendChild(div);
    });
}

function addCompetitor() {
    const name = document.getElementById('competitor-name').value;
    var wcaId = false;
    if (!name) return;

    // Test if input follows WCA ID order
    if (/^\d{4}[a-zA-Z]{4}\d{2}$/.test(name.toUpperCase().trim())) {
        wcaId = name.toUpperCase().trim();
    }

    const eventCheckboxes = document.querySelectorAll(
        '#competitor-form input[type="checkbox"]:checked'
    );
    const events = Array.from(eventCheckboxes).map((checkbox) => checkbox.value);

    const competitor = {
        id: competitors.length + 1,
        name,
        wcaId,
        events,
        groupAssignments: {}, // Initialize group assignments for each event
    };

    competitors.push(competitor);
    displayCompetitors();
}

async function displayCompetitors(doNames = true) {
    const competitorListBody = document.querySelector('#competitor-list tbody');
    competitorListBody.innerHTML = '';

    for (let index = 0; index < competitors.length; index++) {
        const competitor = competitors[index];

        // If the competitor has a WCA ID but no name yet, fetch it
        if (competitor.wcaId && !competitor.nameFetched && doNames) {
            competitor.name = await getCompetitorName(competitor.wcaId);
            competitor.nameFetched = true; // Mark that the name has been fetched
        }

        const row = document.createElement('tr');

        const idCell = document.createElement('td');
        idCell.textContent = competitor.id;

        const nameCell = document.createElement('td');
        nameCell.textContent = competitor.name;

        const eventsCell = document.createElement('td');
        eventsCell.textContent = competitor.events.join(', ');

        const actionsCell = document.createElement('td');
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => deleteCompetitor(competitor.id);
        deleteButton.classList.add('delete-btn');
        actionsCell.appendChild(deleteButton);

        row.appendChild(idCell);
        row.appendChild(nameCell);
        row.appendChild(eventsCell);
        row.appendChild(actionsCell);

        competitorListBody.appendChild(row);
    }

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
    // Find the index of the competitor with the matching id
    const index = competitors.findIndex((competitor) => competitor.id === id);

    // If a competitor with the given id is found, remove it from the array
    if (index !== -1) {
        competitors.splice(index, 1);

        // Update the IDs of all competitors
        competitors.forEach((competitor, idx) => {
            competitor.id = idx + 1;
        });

        displayCompetitors();
        selectedEvents = selectedEvents.filter((eventId) =>
            competitors.some((competitor) => competitor.events.includes(eventId))
        );
    }
}

function finalizeCompetitors() {
    competitionData.competitors = competitors;

    document.getElementById('competitor-setup').style.display = 'none';
    document.getElementById('grouping-results').style.display = 'block';

    storeCompetitionDataInURL();

    generateGroups();
}

async function sortArray(array, eventId) {
    // Store the average times for each competitor
    const averages = {};

    for (let i = 0; i < array.length; i++) {
        const competitor = array[i];
        if (competitor.wcaId) {
            try {
                const response = await fetch(`/api/WCA/${competitor.wcaId}/${eventId}`);
                const data = await response.json();
                averages[competitor.wcaId] = data.average || null;
            } catch (error) {
                console.error(`Failed to fetch data for ${competitor.wcaId}:`, error);
                averages[competitor.wcaId] = null;
            }
        } else {
            averages[competitor.wcaId] = null;
        }
    }

    // Sort the array based on the average times
    array.sort((a, b) => {
        const avgA = averages[a.wcaId] !== null ? averages[a.wcaId] : Number.MAX_VALUE;
        const avgB = averages[b.wcaId] !== null ? averages[b.wcaId] : Number.MAX_VALUE;
        return avgA - avgB;
    });

    return array;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function generateGroups() {
    const maxCompetitors = competitionData.maxCompetitors;
    competitionData.groups = {}; // Reset groups data

    for (const eventId of selectedEvents) {
        let eventCompetitors = competitors.filter((competitor) =>
            competitor.events.includes(eventId)
        );

        // Sort the competitors by their average times using the updated sortArray function
        eventCompetitors = await sortArray(eventCompetitors, eventId);

        // Determine the number of groups
        const dynamicGroupCheckbox = document.getElementById(`dynamic-group-${eventId}`);
        let numGroups;

        if (dynamicGroupCheckbox && !dynamicGroupCheckbox.checked) {
            const groupInput = document.getElementById(`group-input-${eventId}`);
            numGroups = parseInt(Math.abs(groupInput.value), 10);
        } else {
            const ratio = eventCompetitors.length / maxCompetitors;
            numGroups = ratio < 1 ? Math.ceil(ratio + 1) : Math.ceil(ratio);
        }

        const eventGroups = Array.from({ length: numGroups }, () => ({
            competitors: [],
            judges: [],
            scramblers: [],
            runners: [],
        }));

        // Get the sorting type for the event
        const sortTypeSelect = document.getElementById(`competitor-sort-type-${eventId}`);
        const sortType = sortTypeSelect ? sortTypeSelect.value : 'Round Robin';

        // Sort competitors based on the selected sort type
        if (sortType === 'Round Robin') {
            // Distribute competitors evenly among the groups, starting with the last group
            eventCompetitors.forEach((competitor, index) => {
                const groupIndex = numGroups - 1 - (index % numGroups);
                eventGroups[groupIndex].competitors.push(competitor);
                competitor.groupAssignments[eventId] = groupIndex + 1; // Groups are 1-indexed
            });
        } else if (sortType === 'Linear') {
            eventCompetitors.reverse();

            // Distribute competitors linearly among the groups
            eventCompetitors.forEach((competitor, index) => {
                const groupIndex = index % numGroups;
                eventGroups[groupIndex].competitors.push(competitor);
                competitor.groupAssignments[eventId] = groupIndex + 1; // Groups are 1-indexed
            });

            eventCompetitors = await sortArray(eventCompetitors, eventId);
        } else if (sortType === 'Random') {
            // Shuffle competitors and distribute randomly among the groups
            const shuffledCompetitors = shuffleArray(eventCompetitors);
            shuffledCompetitors.forEach((competitor, index) => {
                const groupIndex = index % numGroups;
                eventGroups[groupIndex].competitors.push(competitor);
                competitor.groupAssignments[eventId] = groupIndex + 1; // Groups are 1-indexed
            });
        }

        // Assign runners, judges, and scramblers ensuring no overlap
        for (let groupIndex = 0; groupIndex < eventGroups.length; groupIndex++) {
            const shuffledCompetitors = shuffleArray(competitors);

            const group = eventGroups[groupIndex];

            // Number of Scramblers per group
            const numOfScramblers = Math.ceil(Math.ceil(group.competitors.length) / 5.7);

            // Number of Runners per group
            const numOfRunners = Math.ceil(Math.ceil(group.competitors.length) ** 0.5);

            // Assign scramblers: top n * numOfScramblers competitors sorted by speed
            const topCompetitors = eventCompetitors.slice(0, numOfScramblers * eventGroups.length);
            const availableScramblers = topCompetitors.filter(
                (competitor) =>
                    competitor.events.includes(eventId) && !group.competitors.includes(competitor)
            );

            if (availableScramblers.length > 0) {
                const scramblers = [];
                for (let i = 0; i < numOfScramblers; i++) {
                    if (availableScramblers[i]) {
                        scramblers.push(availableScramblers[i]);
                    }
                }
                group.scramblers = scramblers;
            } else {
                // If there are no available scramblers, assign numOfScramblers random competitors that aren't in that event
                const availableCompetitors = shuffledCompetitors.filter(
                    (competitor) => !eventCompetitors.includes(competitor)
                );
                group.scramblers = availableCompetitors.slice(0, numOfScramblers);
            }

            // Assign judges if applicable
            if (includeJudges) {
                const availableJudges = shuffledCompetitors.filter(
                    (competitor) =>
                        !group.competitors.includes(competitor) &&
                        !group.judges.includes(competitor) &&
                        !group.runners.includes(competitor) &&
                        !group.scramblers.includes(competitor)
                );
                group.judges = availableJudges.slice(0, group.competitors.length);
            }

            // Assign runners if applicable
            if (includeRunners) {
                const availableRunners = shuffledCompetitors.filter(
                    (competitor) =>
                        !group.competitors.includes(competitor) &&
                        !group.judges.includes(competitor) &&
                        !group.runners.includes(competitor) &&
                        !group.scramblers.includes(competitor)
                );
                if (availableRunners.length > 0) {
                    group.runners = availableRunners.slice(0, numOfRunners);
                }
            }
        }

        // Store groups in competitionData
        competitionData.groups[eventId] = eventGroups;
    }

    generateGroupHTML();
}

function generateGroupHTML() {
    const groupingOutput = document.getElementById('grouping-output');
    groupingOutput.innerHTML = ''; // Clear the output div before appending

    for (const eventId of selectedEvents) {
        const eventGroups = competitionData.groups[eventId];
        const event = events.find((e) => e.id === eventId);
        const eventDiv = document.createElement('div');
        eventDiv.className = 'event-group';

        const eventTitle = document.createElement('h3');
        eventTitle.textContent = event.name;
        eventDiv.appendChild(eventTitle);

        const copyEventTag = document.createElement('p');
        copyEventTag.textContent = 'Copy Event';
        copyEventTag.title = 'Copy the event to the clipboard';
        copyEventTag.className = 'copy-tag';
        copyEventTag.id = `copy-event-info`;
        copyEventTag.addEventListener('click', () => copyEvent(eventId));
        eventDiv.appendChild(copyEventTag);

        eventGroups.forEach((group, groupIndex) => {
            // Sort competitors, judges, runners, and scramblers by registrant id
            group.competitors.sort((a, b) => a.id - b.id);
            group.judges.sort((a, b) => a.id - b.id);
            group.runners.sort((a, b) => a.id - b.id);
            group.scramblers.sort((a, b) => a.id - b.id);

            const groupDiv = document.createElement('div');
            groupDiv.className = 'group';

            const groupTitle = document.createElement('h4');
            groupTitle.textContent = `Group ${groupIndex + 1}`;
            groupDiv.appendChild(groupTitle);

            const editTag = document.createElement('p');
            editTag.textContent = `${group.competitors.length} ${
                group.competitors.length > 1 ? 'competitors' : 'competitor'
            } - Edit Group`;
            editTag.className = 'edit-tag';
            editTag.addEventListener('click', () => editGroup(group, eventId, groupIndex));
            groupDiv.appendChild(editTag);

            const copyGroupTag = document.createElement('p');
            copyGroupTag.style.cursor = 'pointer';
            copyGroupTag.textContent = 'Copy Group';
            copyGroupTag.title =
                'Copy the groups to the clipboard, ready to paste into the scorecard-generator by zbaruch20';
            copyGroupTag.className = 'copy-tag';
            copyGroupTag.addEventListener('click', () => copyGroup(group, groupIndex));
            groupDiv.appendChild(copyGroupTag);

            const competitorDiv = document.createElement('ul');
            group.competitors.forEach((competitor) => {
                const competitorName = document.createElement('li');
                competitorName.textContent = competitor.name;
                competitorDiv.appendChild(competitorName);
            });
            groupDiv.appendChild(competitorDiv);

            if (includeJudges && group.judges.length !== 0) {
                const judgesDiv = document.createElement('div');
                judgesDiv.innerHTML = `Judge(s): <span>${group.judges
                    .map((j) => j.name)
                    .join(', ')}</span>`;
                groupDiv.appendChild(judgesDiv);
            }

            if (includeRunners) {
                const runnersDiv = document.createElement('div');
                runnersDiv.innerHTML =
                    group.runners.length !== 0
                        ? `Runner(s): <span>${group.runners.map((r) => r.name).join(', ')}</span>`
                        : 'Running Judges';
                groupDiv.appendChild(runnersDiv);
            }

            const scramblersDiv = document.createElement('div');
            scramblersDiv.innerHTML = `Scrambler(s): <span>${group.scramblers
                .map((s) => s.name)
                .join(', ')}</span>`;
            groupDiv.appendChild(scramblersDiv);

            eventDiv.appendChild(groupDiv);
        });

        groupingOutput.appendChild(eventDiv);
    }

    // Create a table for each competitor sorted by their ID
    competitors
        .sort((a, b) => a.id - b.id)
        .forEach((competitor) => {
            const competitorTable = document.createElement('table');
            competitorTable.className = 'competitor-table';

            const headerRow = document.createElement('tr');
            const headerCells = ['Event', 'Compete', 'Judge', 'Run', 'Scramble'];
            headerCells.forEach((text) => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            competitorTable.appendChild(headerRow);

            selectedEvents.forEach((eventId) => {
                const event = events.find((e) => e.id === eventId);
                const row = document.createElement('tr');

                const eventCell = document.createElement('td');
                eventCell.textContent = event.shortName;
                row.appendChild(eventCell);

                const competeGroups = competitionData.groups[eventId]
                    .map((group, index) =>
                        group.competitors.includes(competitor) ? index + 1 : null
                    )
                    .filter((group) => group !== null)
                    .join(', ');

                const competeCell = document.createElement('td');
                competeCell.textContent = `${competeGroups}`;
                row.appendChild(competeCell);

                const judgeGroups = competitionData.groups[eventId]
                    .map((group, index) => (group.judges.includes(competitor) ? index + 1 : null))
                    .filter((group) => group !== null)
                    .join(', ');

                const judgeCell = document.createElement('td');
                judgeCell.textContent = judgeGroups;
                row.appendChild(judgeCell);

                const runGroups = competitionData.groups[eventId]
                    .map((group, index) => (group.runners.includes(competitor) ? index + 1 : null))
                    .filter((group) => group !== null)
                    .join(', ');

                const runCell = document.createElement('td');
                runCell.textContent = runGroups;
                row.appendChild(runCell);

                const scrambleGroups = competitionData.groups[eventId]
                    .map((group, index) =>
                        group.scramblers.includes(competitor) ? index + 1 : null
                    )
                    .filter((group) => group !== null)
                    .join(', ');

                const scrambleCell = document.createElement('td');
                scrambleCell.textContent = scrambleGroups;
                row.appendChild(scrambleCell);

                competitorTable.appendChild(row);

                const eventGroups = competitionData.groups[eventId];
                const competitorGroupMap = {};

                eventGroups.forEach((group, groupIndex) => {
                    group.competitors.forEach((competitor) => {
                        if (!competitorGroupMap[competitor.id]) {
                            competitorGroupMap[competitor.id] = [];
                        }
                        competitorGroupMap[competitor.id].push(groupIndex);
                    });
                });

                Object.keys(competitorGroupMap).forEach((competitorId) => {
                    if (competitorGroupMap[competitorId].length > 1) {
                        competitorGroupMap[competitorId].forEach((groupIndex) => {
                            const groupDiv = groupingOutput.querySelector(
                                `.event-group:nth-child(${
                                    selectedEvents.indexOf(eventId) + 1
                                }) .group:nth-child(${groupIndex + 2})`
                            );
                            if (groupDiv) {
                                groupDiv.style.backgroundColor = '#721D1D';
                            }
                        });
                    }
                });
            });

            const competitorDiv = document.createElement('div');
            const competitorTitle = document.createElement('div');
            competitorTitle.className = 'competitor-title';
            const competitorName = document.createElement('h4');
            const competitorWcaId = document.createElement('p');
            competitorName.textContent = `${competitor.name}`;
            competitorWcaId.textContent = `${competitor.wcaId ? `${competitor.wcaId}` : ''}`;
            competitorTitle.appendChild(competitorName);
            competitorTitle.appendChild(competitorWcaId);
            competitorDiv.appendChild(competitorTitle);
            competitorDiv.appendChild(competitorTable);
            competitorDiv.className = 'competitor-assignments';

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
        }
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
        }
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
                    (competitor) => competitor.id == select.value
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
    if (event.shiftKey && location.port === '8443') {
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
        document.getElementById('max-competitors').value = 4;
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
    selectedEvents = ['333', '222', '444', '555'];

    const eventIds = ['333', '222', '444', '555'];
    eventIds.forEach((id) => {
        const checkbox = document.getElementById(id);
        checkbox.classList.add('checked');
        checkbox.classList.remove('unchecked');
        checkbox.innerHTML = `<p>${events.find((e) => e.id === id).name} (Selected)</p>`;

        const dynamicGroupCheckbox = document.createElement('input');
        dynamicGroupCheckbox.type = 'checkbox';
        dynamicGroupCheckbox.addEventListener('click', (e) => e.stopPropagation());
        dynamicGroupCheckbox.id = `dynamic-group-${id}`;
        dynamicGroupCheckbox.name = 'dynamic-group';
        dynamicGroupCheckbox.value = id;
        dynamicGroupCheckbox.checked = true;

        const dynamicGroupLabel = document.createElement('label');
        dynamicGroupLabel.htmlFor = `dynamic-group-${id}`;
        dynamicGroupLabel.textContent = 'Dynamic Groups';

        const groupInput = document.createElement('input');
        groupInput.type = 'number';
        groupInput.id = `group-input-${id}`;
        groupInput.name = 'group-input';
        groupInput.placeholder = 'Max Groups';
        groupInput.style.display = 'none';

        dynamicGroupCheckbox.addEventListener('change', () => {
            groupInput.style.display = dynamicGroupCheckbox.checked ? 'none' : 'block';
        });

        const wrapper = document.createElement('div');
        dynamicGroupLabel.appendChild(dynamicGroupCheckbox);
        wrapper.appendChild(dynamicGroupLabel);
        wrapper.appendChild(groupInput);

        const competitorSortTypeSelect = document.createElement('select');
        competitorSortTypeSelect.id = `competitor-sort-type-${id}`;
        competitorSortTypeSelect.name = 'competitor-sort-type';
        competitorSortTypeSelect.style.display = 'block';

        const competitorSortTypeLabel = document.createElement('label');
        competitorSortTypeLabel.htmlFor = `competitor-sort-type-${id}`;
        competitorSortTypeLabel.textContent = 'Sort competitors by:';

        const sortTypes = ['Round Robin', 'Linear', 'Random'];

        sortTypes.forEach((sortType) => {
            const option = document.createElement('option');
            option.value = sortType;
            option.textContent = sortType;
            competitorSortTypeSelect.appendChild(option);
        });

        competitorSortTypeLabel.appendChild(competitorSortTypeSelect);

        wrapper.appendChild(competitorSortTypeLabel);

        // Prevent the checkbox from closing if the input is clicked
        wrapper.addEventListener('click', (e) => e.stopPropagation());

        checkbox.appendChild(wrapper);
    });

    // Set sort types and max groups for each event
    document.getElementById('dynamic-group-333').checked = true;
    document.getElementById('competitor-sort-type-333').value = 'Round Robin';

    document.getElementById('dynamic-group-222').checked = true;
    document.getElementById('competitor-sort-type-222').value = 'Linear';

    document.getElementById('dynamic-group-444').checked = true;
    document.getElementById('competitor-sort-type-444').value = 'Random';

    document.getElementById('dynamic-group-555').checked = false;
    document.getElementById('group-input-555').display = 'block';
    document.getElementById('group-input-555').value = 2;
    document.getElementById('competitor-sort-type-555').value = 'Round Robin';
}

function handleAddingMockCompetitors() {
    const mockCompetitors = [];
    for (let i = 1; i <= 8; i++) {
        mockCompetitors.push({
            id: i,
            name: `Competitor ${i}`,
            wcaId: null,
            events: ['333', '222', '444', '555'],
            groupAssignments: {},
        });
    }
    for (let i = 9; i <= 16; i++) {
        mockCompetitors.push({
            id: i,
            name: `WCA ID ${i}`,
            wcaId: '2023KLIN02',
            events: ['333', '222', '444', '555'],
            groupAssignments: {},
        });
    }
    competitors = mockCompetitors;

    competitionData.competitors = competitors;
    displayCompetitors(false);
}
