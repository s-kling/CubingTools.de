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
    { id: 'fto_bld', name: 'Face-Turning Octahedron Blindfolded', shortName: 'FTO BLD' },
    { id: 'fto_mbld', name: 'Face-Turning Octahedron Multi-Blind', shortName: 'FTO MBLD' },

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
    { id: '222_mirror_blocks', name: '2x2x2 Mirror Blocks', shortName: '2x2 Mirror' },
    { id: '333_mirror_blocks_bld', name: 'Mirror Blocks Blindfolded', shortName: 'Mirror BLD' },

    // Magic
    { id: 'magic', name: 'Magic', shortName: 'Magic' },
    { id: 'mmagic', name: 'Master Magic', shortName: 'M. Magic' },

    // Relays
    { id: 'miniguild', name: 'Mini Guildford', shortName: 'Mini Guild' },
    { id: 'miniguild_2_person', name: '2-man Mini Guildford', shortName: '2p Guild' },
    { id: '234relay', name: '2x2x2-4x4x4 Relay', shortName: '2-4 Relay' },
    { id: '2345relay', name: '2x2x2-5x5x5 Relay', shortName: '2-5 Relay' },
    { id: '234567relay', name: '2x2x2-7x7x7 Relay', shortName: '2-7 Relay' },
    { id: '234567relay_2_person', name: '2-man 2x2x2-7x7x7 Relay', shortName: '2p 2-7 Relay' },

    // 3x3 Variations
    { id: '333fm', name: '3x3x3 Fewest Moves', shortName: '3x3 FM' },
    { id: '333_linear_fm', name: '3x3x3 Linear Fewest Moves', shortName: 'Linear FM' },
    { id: '333mts', name: '3x3x3 Match The Scramble', shortName: 'MTS' },
    { id: '333mts_old', name: '3x3x3 Match The Scramble With Inspection', shortName: 'MTS Old' },
    { id: '333_team_factory', name: '3x3x3 Team Factory', shortName: 'Team Factory' },
    { id: '333_inspectionless', name: '3x3x3 No Inspection', shortName: 'No Inspect' },
    { id: '333_scrambling', name: '3x3x3 Scrambling', shortName: 'Scramble' },
    { id: '333_one_side', name: '3x3x3 One Side', shortName: 'One Side' },
    { id: '333_x3_relay', name: 'Three 3x3x3 Cubes Relay', shortName: '3x3 Relay' },
    { id: '333_cube_mile', name: '3x3x3 Cube Mile', shortName: 'Cube Mile' },
    { id: '333_oven_mitts', name: '3x3x3 With Oven Mitts', shortName: 'Oven Mitts' },
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
    { id: 'minx444_bld', name: 'Master Kilominx Blindfolded', shortName: 'M. Kilo BLD' },
    { id: 'minx555_bld', name: 'Gigaminx Blindfolded', shortName: 'Giga BLD' },
    { id: 'minx2345relay_bld', name: 'Kilo-Gigaminx Relay Blindfolded', shortName: 'Kilo-Giga BLD' },

    // Other Blindfolded
    { id: '333_speed_bld', name: '3x3x3 Speed-Blind', shortName: 'Speed BLD' },
    { id: '333_team_bld', name: '3x3x3 Team-Blind', shortName: 'Team BLD' },
    { id: '333_team_bld_old', name: '3x3x3 Team-Blind With Inspection', shortName: 'Team BLD Old' },
    { id: 'sq1_bld', name: 'Square-1 Blindfolded', shortName: 'SQ1 BLD' },
    { id: 'pyram_crystal_bld', name: 'Pyraminx Crystal Blindfolded', shortName: 'Pyram Cr. BLD' },

    // Multi-Blindfolded
    { id: '333mbf', name: '3x3x3 Multi-Blind', shortName: '3x3 MBLD' },
    { id: '444mbf', name: '4x4x4 Multi-Blind', shortName: '4x4 MBLD' },
    { id: '555mbf', name: '5x5x5 Multi-Blind', shortName: '5x5 MBLD' },
    { id: 'sq1_mbo', name: 'Square-1 Multi-Blind', shortName: 'SQ1 MBLD' },
    { id: '333mbo', name: '3x3x3 Multi-Blind Old Style', shortName: 'Old MBLD' },

    // Relays Blindfolded
    { id: '333_oh_bld_team_relay', name: '3x3x3 + OH + BLD Team Relay', shortName: '3x3+OH+Blind Relay' },
    { id: '333bf_2_person_relay', name: '3x3x3 Blindfolded 2-man Relay', shortName: 'BLD 2p Relay' },
    { id: '333bf_3_person_relay', name: '3x3x3 Blindfolded 3-man Relay', shortName: 'BLD 3p Relay' },
    { id: '333bf_4_person_relay', name: '3x3x3 Blindfolded 4-man Relay', shortName: 'BLD 4p Relay' },
    { id: '333bf_8_person_relay', name: '3x3x3 Blindfolded 8-man Relay', shortName: 'BLD 8p Relay' },
    { id: '2345relay_bld', name: '2x2x2-5x5x5 Relay Blindfolded', shortName: '2-5 BLD Relay' },
    { id: '234567relay_bld', name: '2x2x2-7x7x7 Relay Blindfolded', shortName: '2-7 BLD Relay' },
    { id: '2345678relay_bld', name: '2x2x2-8x8x8 Relay Blindfolded', shortName: '2-8 BLD Relay' },
    { id: 'miniguild_bld', name: 'Mini Guildford Blindfolded', shortName: 'Mini Guild BLD' },

    // Other
    { id: '15puzzle', name: '15 Puzzle', shortName: '15 Puzz.' },
    { id: 'corner_heli222', name: 'Corner Helicopter 2x2x2', shortName: 'Heli 2x2' },
    { id: 'gear_cube', name: 'Gear Cube', shortName: 'Gear' },
    { id: 'rainbow_cube', name: 'Rainbow Cube', shortName: 'Rainbow' },
    { id: '360_puzzle', name: '360 Puzzle', shortName: '360' },
    { id: 'snake', name: 'Snake', shortName: 'Snake' },
    { id: 'dino', name: 'Dino Cube', shortName: 'Dino' },
];

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
    checkboxes.forEach(checkbox => checkbox.checked = true);
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

        events.forEach(event => {
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
                    const allChecked = checkboxes.every(checkbox => checkbox.checked);

                    // Set all checkboxes to the opposite of allChecked
                    checkboxes.forEach(checkbox => {
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
    const newEventName = prompt('What is the events\' name?', '');
    if (newEventName == null || newEventName == '') return;

    const newEventId = prompt('What is the events\' ID?', '');
    if (newEventId == null || newEventId == '') return;

    const newEventShortName = prompt('What is the events\' short name?', '');
    if (newEventShortName == null || newEventShortName == '') return;

    const event = {
        id: newEventId,
        name: newEventName,
        shortName: newEventShortName
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

            // Prevent the checkbox from closing if the input is clicked
            wrapper.addEventListener('click', (e) => e.stopPropagation());

            checkbox.appendChild(wrapper);

            // Special events (all fewest moves and multi blind events)
            if (event.id.includes('fm') || event.id.includes('mbf') || event.id.includes('mbld') || event.id === '333_mbo') {
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
    selectedEvents = Array.from(document.querySelectorAll('.event-checkbox.checked')).map(checkbox => checkbox.id);

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

    selectedEvents.forEach(eventId => {
        const event = events.find(e => e.id === eventId);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `event-${event.id}`;
        checkbox.value = event.id;
        checkbox.name = 'event-checkbox'

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

    const eventCheckboxes = document.querySelectorAll('#competitor-form input[type="checkbox"]:checked');
    const events = Array.from(eventCheckboxes).map(checkbox => checkbox.value);

    const competitor = {
        id: competitors.length + 1,
        name,
        wcaId,
        events,
        groupAssignments: {} // Initialize group assignments for each event
    };

    competitors.push(competitor);
    displayCompetitors();
}

async function displayCompetitors() {
    const competitorListBody = document.querySelector('#competitor-list tbody');
    competitorListBody.innerHTML = '';

    for (let index = 0; index < competitors.length; index++) {
        const competitor = competitors[index];

        // If the competitor has a WCA ID but no name yet, fetch it
        if (competitor.wcaId && !competitor.nameFetched) {
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
    const index = competitors.findIndex(competitor => competitor.id === id);

    // If a competitor with the given id is found, remove it from the array
    if (index !== -1) {
        competitors.splice(index, 1);

        // Update the IDs of all competitors
        competitors.forEach((competitor, idx) => {
            competitor.id = idx + 1;
        });

        displayCompetitors();
        selectedEvents = selectedEvents.filter(eventId =>
            competitors.some(competitor => competitor.events.includes(eventId))
        );
    }
}

function finalizeCompetitors() {
    competitionData.competitors = competitors;

    document.getElementById('competitor-setup').style.display = 'none';
    document.getElementById('grouping-results').style.display = 'block';

    generateGroups();
}

document.getElementById('copyData').addEventListener('click', () => {
    const competitionDataStr = JSON.stringify(competitionData, null, 2);
    navigator.clipboard.writeText(competitionDataStr).then(() => {
        alert('Competition data copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy competition data: ', err);
    });
});

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

    // Sort the array based on the retrieved averages
    array.sort((a, b) => {
        const avgA = averages[a.wcaId];
        const avgB = averages[b.wcaId];

        // If both have averages, sort by average
        if (avgA !== null && avgB !== null) {
            return avgA - avgB;
        }

        // If one has an average and the other doesn't, the one with the average goes first
        if (avgA !== null) return -1;
        if (avgB !== null) return 1;

        // If neither has an average, sort by WCA ID
        return (a.wcaId || '').localeCompare(b.wcaId || '');
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
    const groupingOutput = document.getElementById('grouping-output');
    groupingOutput.innerHTML = '';  // Clear the output div before appending

    competitionData.groups = {};  // Reset groups data

    for (const eventId of selectedEvents) {
        let eventCompetitors = competitors.filter(competitor => competitor.events.includes(eventId));

        // Sort the competitors by their average times using the updated sortArray function
        eventCompetitors = await sortArray(eventCompetitors, eventId);

        // Determine the number of groups
        const dynamicGroupCheckbox = document.getElementById(`dynamic-group-${eventId}`);
        let numGroups;

        if (dynamicGroupCheckbox && !dynamicGroupCheckbox.checked) {
            const groupInput = document.getElementById(`group-input-${eventId}`);
            numGroups = (parseInt(groupInput.value, 10) < eventCompetitors.length) ? parseInt(groupInput.value, 10) : eventCompetitors.length;
        } else {
            numGroups = Math.ceil(eventCompetitors.length / maxCompetitors);
        }

        const eventGroups = Array.from({ length: numGroups }, () => ({
            competitors: [],
            judges: [],
            scramblers: [],
            runners: []
        }));

        // Distribute competitors evenly among the groups, starting with the last group
        eventCompetitors.forEach((competitor, index) => {
            const groupIndex = (numGroups - 1) - (index % numGroups);
            eventGroups[groupIndex].competitors.push(competitor);
            competitor.groupAssignments[eventId] = groupIndex + 1; // Groups are 1-indexed
        });

        // Assign runners, judges, and scramblers ensuring no overlap
        for (let groupIndex = 0; groupIndex < eventGroups.length; groupIndex++) {
            const shuffledCompetitors = shuffleArray(competitors);

            const group = eventGroups[groupIndex];

            // Number of Scramblers and Runners per group
            // const numOfHelpers = Math.ceil(Math.pow(group.competitors.length / 6, 1 / 1.32));
            const numOfHelpers = Math.ceil(Math.ceil(group.competitors.length) / 5.7);

            // Assign scramblers: top n * numOfHelpers competitors sorted by speed
            const topCompetitors = eventCompetitors.slice(0, numOfHelpers * eventGroups.length);
            const availableScramblers = topCompetitors.filter(competitor => competitor.groupAssignments[eventId] !== (groupIndex + 1));

            if (availableScramblers.length > 0 || eventCompetitors.length == 1) {
                const scramblers = [];
                for (let i = 0; i < numOfHelpers; i++) {
                    const totalWeight = availableScramblers.reduce((sum, competitor, index) => {
                        const weight = competitor.wcaId ? (availableScramblers.length - index) : 1;
                        return sum + weight;
                    }, 0);
                    let randomWeight = Math.random() * totalWeight;
                    for (let j = 0; j < availableScramblers.length; j++) {
                        const weight = availableScramblers[j].wcaId ? (availableScramblers.length - j) : 1;
                        randomWeight -= weight;
                        if (randomWeight <= 0) {
                            scramblers.push(availableScramblers[j]);
                            availableScramblers.splice(j, 1);
                            break;
                        }
                    }
                }
                group.scramblers = scramblers;
            } else {
                // Increase the number of groups by 1 and redo the process
                numGroups += 1;
                eventGroups.length = 0;
                for (let i = 0; i < numGroups; i++) {
                    eventGroups.push({
                        competitors: [],
                        judges: [],
                        scramblers: [],
                        runners: []
                    });
                }
                eventCompetitors.forEach((competitor, index) => {
                    const groupIndex = (numGroups - 1) - (index % numGroups);
                    eventGroups[groupIndex].competitors.push(competitor);
                    competitor.groupAssignments[eventId] = groupIndex + 1;
                });
                groupIndex = 0; // Reset groupIndex to reassign helpers
            }

            // Assign judges if applicable
            if (includeJudges) {
                const availableJudges = shuffledCompetitors.filter(competitor =>
                    !group.competitors.includes(competitor) &&
                    !group.judges.includes(competitor) &&
                    !group.runners.includes(competitor) &&
                    !group.scramblers.includes(competitor)
                );
                group.judges = availableJudges.slice(0, group.competitors.length);
            }

            // Assign runners if applicable
            if (includeRunners) {
                const availableRunners = shuffledCompetitors.filter(competitor =>
                    !group.competitors.includes(competitor) &&
                    !group.judges.includes(competitor) &&
                    !group.runners.includes(competitor) &&
                    !group.scramblers.includes(competitor)
                );
                if (availableRunners.length > 0) {
                    group.runners = availableRunners.slice(0, numOfHelpers);
                }
            }
        }

        // Store groups in competitionData
        competitionData.groups[eventId] = eventGroups;

        // Append the groups to the DOM
        const event = events.find(e => e.id === eventId);
        const eventDiv = document.createElement('div');
        eventDiv.className = 'event-group';

        const eventTitle = document.createElement('h3');
        eventTitle.textContent = event.name;
        eventDiv.appendChild(eventTitle);

        eventGroups.forEach((group, groupIndex) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'group';

            const groupTitle = document.createElement('h4');
            groupTitle.textContent = `Group ${groupIndex + 1} (${group.competitors.length} competitors)`;
            groupDiv.appendChild(groupTitle);

            const competitorDiv = document.createElement('ul');
            group.competitors.forEach(competitor => {
                const competitorName = document.createElement('li');
                competitorName.textContent = competitor.name;
                competitorDiv.appendChild(competitorName);
            });
            groupDiv.appendChild(competitorDiv);

            if (includeJudges && group.judges.length !== 0) {
                const judgesDiv = document.createElement('div');
                judgesDiv.innerHTML = `Judge(s): <span>${group.judges.map(j => j.name).join(', ')}</span>`;
                groupDiv.appendChild(judgesDiv);
            }

            if (includeRunners) {
                const runnersDiv = document.createElement('div');
                runnersDiv.innerHTML = group.runners.length !== 0 ?
                    `Runner(s): <span>${group.runners.map(r => r.name).join(', ')}</span>` : 'Running Judges';
                groupDiv.appendChild(runnersDiv);
            }

            const scramblersDiv = document.createElement('div');
            scramblersDiv.innerHTML = `Scrambler(s): <span>${group.scramblers.map(s => s.name).join(', ')}</span>`;
            groupDiv.appendChild(scramblersDiv);

            eventDiv.appendChild(groupDiv);
        });

        groupingOutput.appendChild(eventDiv);
    }

    // Create a table for each competitor sorted by their ID
    competitors.sort((a, b) => a.id - b.id).forEach(competitor => {
        const competitorTable = document.createElement('table');
        competitorTable.className = 'competitor-table';

        const headerRow = document.createElement('tr');
        const headerCells = ['Event', 'Compete', 'Judge', 'Run', 'Scramble'];
        headerCells.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        competitorTable.appendChild(headerRow);

        selectedEvents.forEach(eventId => {
            const event = events.find(e => e.id === eventId);
            const row = document.createElement('tr');

            const eventCell = document.createElement('td');
            eventCell.textContent = event.shortName;
            row.appendChild(eventCell);

            const competeCell = document.createElement('td');
            competeCell.textContent = competitor.groupAssignments[eventId] || '';
            row.appendChild(competeCell);

            const judgeGroups = competitionData.groups[eventId]
                .map((group, index) => group.judges.includes(competitor) ? index + 1 : null)
                .filter(group => group !== null)
                .join(', ');

            const judgeCell = document.createElement('td');
            judgeCell.textContent = judgeGroups;
            row.appendChild(judgeCell);

            const runGroups = competitionData.groups[eventId]
                .map((group, index) => group.runners.includes(competitor) ? index + 1 : null)
                .filter(group => group !== null)
                .join(', ');

            const runCell = document.createElement('td');
            runCell.textContent = runGroups;
            row.appendChild(runCell);

            const scrambleGroups = competitionData.groups[eventId]
                .map((group, index) => group.scramblers.includes(competitor) ? index + 1 : null)
                .filter(group => group !== null)
                .join(', ');

            const scrambleCell = document.createElement('td');
            scrambleCell.textContent = scrambleGroups;
            row.appendChild(scrambleCell);

            competitorTable.appendChild(row);
        });

        const competitorDiv = document.createElement('div');
        const competitorName = document.createElement('h4');
        competitorName.textContent = competitor.name;
        competitorDiv.appendChild(competitorName);
        competitorDiv.appendChild(competitorTable);
        competitorDiv.className = 'competitor-assignments';

        groupingOutput.appendChild(competitorDiv);
    });
}

// document.getElementById('send-email').addEventListener('click', async () => {
//     const email = prompt('Please enter your email address:');
//     if (!email) return;

//     try {
//         const response = await fetch('/api/send-email', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify({ email, competitionData, selectedEvents })
//         });

//         if (response.ok) {
//             alert('Email sent successfully!');
//         } else {
//             throw new Error('Failed to send email');
//         }
//     } catch (error) {
//         console.error('Error sending email:', error);
//         alert('There was an error sending the email. Please try again later.');
//     }
// });
