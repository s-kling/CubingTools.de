const events = [
    { id: '333', name: '3x3x3 Cube', shortName: '3x3' },
    { id: '222', name: '2x2x2 Cube', shortName: '2x2' },
    { id: '444', name: '4x4x4 Cube', shortName: '4x4' },
    { id: '555', name: '5x5x5 Cube', shortName: '5x5' },
    { id: '666', name: '6x6x6 Cube', shortName: '6x6' },
    { id: '777', name: '7x7x7 Cube', shortName: '7x7' },
    { id: '888', name: '8x8x8 Cube', shortName: '8x8' },
    { id: '999', name: '9x9x9 Cube', shortName: '9x9' },

    { id: '333oh', name: '3x3x3 One-Handed', shortName: '3x3 OH' },
    { id: '222oh', name: '2x2x2 One-Handed', shortName: '2x2 OH' },

    { id: 'fto', name: 'Face-Turning Octahedron', shortName: 'FTO' },

    { id: '333tb', name: '3x3x3 Team-Blind', shortName: 'Team BLD' },
    { id: '333bf', name: '3x3x3 Blindfolded', shortName: '3x3 BLD' },
    { id: '222bf', name: '2x2x2 Blindfolded', shortName: '2x2 BLD' },
    { id: '444bf', name: '4x4x4 Blindfolded', shortName: '4x4 BLD' },
    { id: '555bf', name: '5x5x5 Blindfolded', shortName: '5x5 BLD' },

    { id: '333ft', name: '3x3x3 With Feet', shortName: '3x3 Feet' },
    { id: '444ft', name: '4x4x4 With Feet', shortName: '4x4 Feet' },

    { id: 'clock', name: 'Clock', shortName: 'Clock' },
    { id: '555clk', name: 'Pentagonal Clock', shortName: '5x5 Clock' },

    { id: 'pyram', name: 'Pyraminx', shortName: 'Pyra' },
    { id: 'maspyr', name: 'Master Pyraminx', shortName: 'Master Pyra' },

    { id: 'skewb', name: 'Skewb', shortName: 'Skewb' },
    { id: 'redi', name: 'Redi Cube', shortName: 'Redi' },

    { id: 'sq1', name: 'Square-1', shortName: 'Squan' },

    { id: '333fm', name: '3x3x3 Fewest Moves', shortName: 'FMC' },
    { id: '333lfm', name: '3x3x3 Linear Fewest Moves', shortName: '3x3 LFM' },
    { id: '333mts', name: '3x3x3 Match The Scramble', shortName: '3x3 MTS' },
    { id: '333tf', name: '3x3x3 Team-Factory', shortName: '3x3 Team Factory' },
    { id: '333ni', name: '3x3x3 No Inspection', shortName: '3x3 No Inspection' },
    { id: '333sc', name: '3x3x3 Scrambling', shortName: '3x3 Scrambling' },
    { id: '333on', name: '3x3x3 One Side', shortName: '3x3 One Side' },
    { id: '333doh', name: '3x3x3 Double One-Handed', shortName: '3x3 Double OH' },
    { id: '3333', name: 'Three 3x3x3 Cubes Relay', shortName: 'Three 3x3 Relay' },

    { id: 'minx', name: 'Megaminx', shortName: 'Mega' },
    { id: 'kilo', name: 'Kilominx', shortName: 'Kilo' },
    { id: 'giga', name: 'Gigaminx', shortName: 'Giga' },

    { id: 'mrb', name: '3x3x3 Mirror Blocks', shortName: 'Mirror Blocks' },
    { id: 'mrbbf', name: '3x3x3 Mirror Blocks Blindfolded', shortName: 'Mirror Blind' },

    { id: 'mag', name: 'Magic', shortName: 'Magic' },
    { id: 'masmag', name: 'Master Magic', shortName: 'Master Magic' },

    { id: 'guildford', name: '2-Man Mini Guildford', shortName: 'Mini Guildford' },
    { id: '24r', name: '2x2x2-4x4x4 Relay', shortName: '2 To 4 Relay' },
    { id: '25r', name: '2x2x2-5x5x5 Relay', shortName: '2 To 5 Relay' },
    { id: '27r', name: '2x2x2-7x7x7 Relay', shortName: '2 To 7 Relay' },

    { id: '223', name: '2x2x3 Cube', shortName: '2x2x3' },
    { id: 'gear', name: 'Gear Cube', shortName: 'Gear Cube' },
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
            if (event.id === '333') newTitle = 'NxNxN Cube';
            else if (event.id === '333oh') newTitle = 'One-Handed';
            else if (event.id === 'fto') newTitle = 'FTO';
            else if (event.id === '333tb') newTitle = 'Blindfolded';
            else if (event.id === '333ft') newTitle = 'Feet';
            else if (event.id === 'clock') newTitle = 'Clock';
            else if (event.id === 'pyra') newTitle = 'Pyraminx';
            else if (event.id === 'skewb') newTitle = 'Skewb';
            else if (event.id === 'sq1') newTitle = 'Square-1';
            else if (event.id === '333fm') newTitle = '3x3 Variations';
            else if (event.id === 'mega') newTitle = 'Minx';
            else if (event.id === 'mrb') newTitle = 'Mirror Blocks';
            else if (event.id === 'mag') newTitle = 'Magic';
            else if (event.id === 'guildford') newTitle = 'Relays';
            else if (event.id === '223') newTitle = 'Other Puzzles';

            // If the title changes, add a heading before the next section
            if (newTitle && newTitle !== currentTitle) {
                const titleDiv = document.createElement('div');
                titleDiv.className = 'event-section-title';
                titleDiv.textContent = newTitle;

                // Add a click event listener to the titleDiv
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

            // Create the checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = event.id;
            checkbox.value = event.id;
            checkbox.name = 'event-checkbox';

            // Create the label and append the checkbox inside it
            const label = document.createElement('label');
            label.classList += 'checkbox-label';
            label.appendChild(checkbox);          // Append the checkbox to the label
            label.appendChild(document.createTextNode(event.name)); // Add the event name as the label's text

            // Append the label directly to the parent container
            eventCheckboxes.appendChild(label);

        });
    }
}



function addCustomEvent() {
    const newEventName = prompt('What is the events\' name?', '');
    if (newEventName == null || newEventName == '') return;

    const newEventId = newEventName.substring(0, 3);
    events.push({ id: newEventId, name: newEventName, shortName: newEventName });

    const eventCheckboxes = document.getElementById('event-checkboxes');

    // Create the checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = newEventId;
    checkbox.value = newEventId;
    checkbox.name = 'event-checkbox';

    // Create the label and append the checkbox inside it
    const label = document.createElement('label');
    label.classList += 'checkbox-label'
    label.appendChild(checkbox);          // Append the checkbox to the label
    label.appendChild(document.createTextNode(newEventName)); // Add the event name as the label's text

    // Append the label directly to the parent container
    eventCheckboxes.appendChild(label);
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
    const checkboxes = document.querySelectorAll('#event-checkboxes input:checked');
    selectedEvents = Array.from(checkboxes).map(checkbox => checkbox.value);

    if (selectedEvents.length > 0) {
        competitionData.events = selectedEvents;

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
        displayCompetitors();
    }
}


function finalizeCompetitors() {
    competitionData.competitors = competitors;

    document.getElementById('competitor-setup').style.display = 'none';
    document.getElementById('grouping-results').style.display = 'block';

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

        // If neither has an average, sort by WCA ID (or another fallback criterion)
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
        const numGroups = Math.ceil(eventCompetitors.length / maxCompetitors);
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
            const numOfHelpers = Math.ceil(Math.pow(group.competitors.length / 6, 1 / 1.32));

            // Assign scramblers: competitors not in this group but in the event
            const availableScramblers = eventCompetitors.filter(competitor => competitor.groupAssignments[eventId] !== (groupIndex + 1));
            if (availableScramblers.length > 0) {
                group.scramblers = availableScramblers.slice(0, numOfHelpers);
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
            groupTitle.textContent = `Group ${groupIndex + 1}`;
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
}
