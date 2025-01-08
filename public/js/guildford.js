let events = [
  "2x2",
  "3x3",
  "4x4",
  "5x5",
  "6x6",
  "7x7",
  "OH",
  "Pyraminx",
  "Clock",
  "Skewb",
  "Megaminx",
  "Square-1",
];

const relaySelect = document.getElementById("relay");
relaySelect.addEventListener("change", () => {
  if (relaySelect.value == "miniguild") {
    events = [
      "2x2",
      "3x3",
      "4x4",
      "5x5",
      "OH",
      "Pyraminx",
      "Clock",
      "Skewb",
      "Megaminx",
      "Square-1",
    ];
  } else if (relaySelect.value == "guildford") {
    events = [
      "2x2",
      "3x3",
      "4x4",
      "5x5",
      "6x6",
      "7x7",
      "OH",
      "Pyraminx",
      "Clock",
      "Skewb",
      "Megaminx",
      "Square-1",
    ];
  } else if (relaySelect.value == "miniguildfto") {
    events = [
      "2x2",
      "3x3",
      "4x4",
      "5x5",
      "OH",
      "Pyraminx",
      "Clock",
      "FTO",
      "Skewb",
      "Megaminx",
      "Square-1",
    ];
  } else if (relaySelect.value == "guildfordfto") {
    events = [
      "2x2",
      "3x3",
      "4x4",
      "5x5",
      "6x6",
      "7x7",
      "OH",
      "Pyraminx",
      "Clock",
      "FTO",
      "Skewb",
      "Megaminx",
      "Square-1",
    ];
  } else if (relaySelect.value == "twotoseven") {
    events = ["2x2", "3x3", "4x4", "5x5", "6x6", "7x7"];
  }
  addEventInputs();
  populateFormFromURL();
});

function addEventInputs() {
  const competitor1Events = document.getElementById("c1-times");
  const competitor2Events = document.getElementById("c2-times");

  competitor1Events.innerHTML = "";
  competitor2Events.innerHTML = "";

  events.forEach((event) => {
    const label1 = document.createElement("label");
    const span1 = document.createElement("span");
    span1.textContent = `${event}:`;

    const input1 = document.createElement("input");
    input1.type = "text";
    input1.id = `c1-${event}`;
    input1.required = true;

    label1.appendChild(span1);
    label1.appendChild(input1);

    const label2 = document.createElement("label");
    const span2 = document.createElement("span");
    span2.textContent = `${event}:`;

    const input2 = document.createElement("input");
    input2.type = "text";
    input2.id = `c2-${event}`;
    input2.required = true;

    label2.appendChild(span2);
    label2.appendChild(input2);

    input1.addEventListener("input", () => updateURLWithFormData());
    input2.addEventListener("input", () => updateURLWithFormData());

    competitor1Events.appendChild(label1);
    competitor2Events.appendChild(label2);
  });
}

// Function to update URL with form data (including event times)
function updateURLWithFormData() {
  const params = new URLSearchParams();

  // Get the main form values
  const pickupTime = document.getElementById("pickup").value;
  const solvecount = document.getElementById("solvecount").value;
  // const relay = document.getElementById('relay').value;
  const competitor1Id = document.getElementById("c1-wca").value;
  const competitor2Id = document.getElementById("c2-wca").value;

  // Add main form values to the query parameters
  if (pickupTime) params.set("pickup", pickupTime);
  if (solvecount) params.set("solvecount", solvecount);
  // if (relay) params.set('relay', relay);
  if (competitor1Id) params.set("c1", competitor1Id);
  if (competitor2Id) params.set("c2", competitor2Id);

  // Add event times for Competitor 1
  events.forEach((event) => {
    const time = document.getElementById(`c1-${event}`).value;
    if (time) params.set(`c1-${event}`, time);
  });

  // Add event times for Competitor 2
  events.forEach((event) => {
    const time = document.getElementById(`c2-${event}`).value;
    if (time) params.set(`c2-${event}`, time);
  });

  // Update the URL without reloading the page
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

// Function to populate form inputs from URL parameters
function populateFormFromURL() {
  const params = new URLSearchParams(window.location.search);

  // Populate main form values
  if (params.has("pickup"))
    document.getElementById("pickup").value = params.get("pickup");
  if (params.has("solvecount"))
    document.getElementById("solvecount").value = params.get("solvecount");
  // if (params.has('relay')) document.getElementById('relay').value = params.get('relay');
  if (params.has("c1"))
    document.getElementById("c1-wca").value = params.get("c1");
  if (params.has("c2"))
    document.getElementById("c2-wca").value = params.get("c2");

  // Populate event times for Competitor 1
  events.forEach((event) => {
    if (params.has(`c1-${event}`)) {
      document.getElementById(`c1-${event}`).value = params.get(`c1-${event}`);
    }
  });

  // Populate event times for Competitor 2
  events.forEach((event) => {
    if (params.has(`c2-${event}`)) {
      document.getElementById(`c2-${event}`).value = params.get(`c2-${event}`);
    }
  });
}

// Call populateFormFromURL on page load to set inputs
document.addEventListener("DOMContentLoaded", () => {
  if (relaySelect.value == "miniguild") {
    events = [
      "2x2",
      "3x3",
      "4x4",
      "5x5",
      "OH",
      "Pyraminx",
      "Clock",
      "Skewb",
      "Megaminx",
      "Square-1",
    ];
  } else if (relaySelect.value == "guildford") {
    events = [
      "2x2",
      "3x3",
      "4x4",
      "5x5",
      "6x6",
      "7x7",
      "OH",
      "Pyraminx",
      "Clock",
      "Skewb",
      "Megaminx",
      "Square-1",
    ];
  } else if (relaySelect.value == "miniguildfto") {
    events = [
      "2x2",
      "3x3",
      "4x4",
      "5x5",
      "OH",
      "Pyraminx",
      "Clock",
      "FTO",
      "Skewb",
      "Megaminx",
      "Square-1",
    ];
  } else if (relaySelect.value == "guildfordfto") {
    events = [
      "2x2",
      "3x3",
      "4x4",
      "5x5",
      "6x6",
      "7x7",
      "OH",
      "Pyraminx",
      "Clock",
      "FTO",
      "Skewb",
      "Megaminx",
      "Square-1",
    ];
  } else if (relaySelect.value == "twotoseven") {
    events = ["2x2", "3x3", "4x4", "5x5", "6x6", "7x7"];
  }
  addEventInputs();
  populateFormFromURL();
});

let competitor1Name = "";
let competitor2Name = "";

async function handleButtons(competitor) {
  await getWCAData(competitor);
  updateURLWithFormData();
}

// Get the pickup time
var pickupTime = parseFloat(document.getElementById("pickup").value) || 1.5;

// Get the solve count to process
var solvecount = parseInt(document.getElementById("solvecount").value) || 25;

// Attach event listener to the time form submit button
document
  .getElementById("timeForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    // Update URL with form data
    updateURLWithFormData();

    const competitor1Id = "c1";
    const competitor2Id = "c2";

    // Collect the times after they have been populated by WCA data
    const competitor1 = collectCompetitorTimes(competitor1Id);
    const competitor2 = collectCompetitorTimes(competitor2Id);

    optimizeAndDisplayLive(competitor1, competitor2);
  });

// Function to fetch average times from the API for a given WCA ID and event
async function getCurrentAverage(wcaId, event) {
  solvecount = parseInt(document.getElementById("solvecount").value) || 25;
  const apiUrl = `/api/wca/${wcaId}/${event}?num=${solvecount}`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }
    const data = await response.json();
    return data.average;
  } catch (error) {
    console.error(
      `Error fetching average for event ${event}: ${error.message}`
    );
    return null;
  }
}

// Function to get WCA data for all events for a given competitor
async function getWCAData(competitorId) {
  const wcaId = document
    .getElementById(`${competitorId}-wca`)
    .value.toUpperCase()
    .trim();

  // Test if a WCA ID was given
  if (!/\d{4}[a-zA-Z]{4}\d{2}/.test(wcaId)) return;

  try {
    let events = {};

    if (relaySelect.value == "miniguild") {
      events = {
        "2x2": "222",
        "3x3": "333",
        "4x4": "444",
        "5x5": "555",
        OH: "333oh",
        Pyraminx: "pyram",
        Clock: "clock",
        Skewb: "skewb",
        Megaminx: "minx",
        "Square-1": "sq1",
      };
    } else if (relaySelect.value == "guildford") {
      events = {
        "2x2": "222",
        "3x3": "333",
        "4x4": "444",
        "5x5": "555",
        "6x6": "666",
        "7x7": "777",
        OH: "333oh",
        Pyraminx: "pyram",
        Clock: "clock",
        Skewb: "skewb",
        Megaminx: "minx",
        "Square-1": "sq1",
      };
    } else if (relaySelect.value == "miniguildfto") {
      events = {
        "2x2": "222",
        "3x3": "333",
        "4x4": "444",
        "5x5": "555",
        OH: "333oh",
        Pyraminx: "pyram",
        Clock: "clock",
        FTO: "fto",
        Skewb: "skewb",
        Megaminx: "minx",
        "Square-1": "sq1",
      };
    } else if (relaySelect.value == "guildfordfto") {
      events = {
        "2x2": "222",
        "3x3": "333",
        "4x4": "444",
        "5x5": "555",
        "6x6": "666",
        "7x7": "777",
        OH: "333oh",
        Pyraminx: "pyram",
        Clock: "clock",
        FTO: "fto",
        Skewb: "skewb",
        Megaminx: "minx",
        "Square-1": "sq1",
      };
    } else if (relaySelect.value == "twotoseven") {
      events = {
        "2x2": "222",
        "3x3": "333",
        "4x4": "444",
        "5x5": "555",
        "6x6": "666",
        "7x7": "777",
      };
    }

    const times = {};

    for (const [eventName, eventId] of Object.entries(events)) {
      const average = await getCurrentAverage(wcaId, eventId);
      times[eventName] = average !== null ? average : null;

      // Update the input field live
      const input = document.getElementById(`${competitorId}-${eventName}`);
      input.value =
        times[eventName] !== null ? times[eventName].toFixed(2) : "DNF";
    }
  } catch (error) {
    alert(`Error fetching data: ${error.message}`);
  }
}

// Function to populate competitor times in the form
function fillCompetitorTimes(competitorId, times) {
  Object.keys(times).forEach((event) => {
    const input = document.getElementById(`${competitorId}-${event}`);
    if (times[event] !== null) {
      input.value = times[event].toFixed(2); // Populate with average time
    } else {
      input.value = "DNF"; // Mark as DNF if no average available
    }
  });
}

// Existing function to collect times from the form fields
function collectCompetitorTimes(competitorId) {
  const times = {};

  events.forEach((event) => {
    const value = document.getElementById(`${competitorId}-${event}`).value;
    if (value === "DNF" || isNaN(value)) {
      times[event] = Infinity; // Use infinity for DNF (did not finish)
    } else {
      times[event] = parseFloat(value);
    }
  });

  return times;
}

function calculateMaxTime(combination, competitor1, competitor2, pickup) {
  const time1 =
    combination[0].reduce(
      (sum, event) => sum + (competitor1[event] || 0) + pickup,
      0
    ) - pickup;
  const time2 =
    combination[1].reduce(
      (sum, event) => sum + (competitor2[event] || 0) + pickup,
      0
    ) - pickup;
  return Math.max(time1, time2);
}

// Function to format time in seconds to "Xm Ys" format
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  let secs = seconds % 60;
  secs = secs < 10 ? "0" + secs.toFixed(2) : secs.toFixed(2);
  return `${minutes}:${secs}`;
}

async function processCombinationsWithAlphaBetaLive(
  competitor1,
  competitor2,
  pickupTime
) {
  const bestCombinationDiv = document.getElementById("bestCombination");
  const combinationsCountedDiv = document.getElementById("combinationsCounted");

  let bestCombination = null;
  let bestTime = Infinity;
  let combinationsCount = 0;

  const dfs = async (
    index,
    group1,
    group2,
    alpha,
    beta,
    group1Time,
    group2Time
  ) => {
    if (index === events.length) {
      const maxTime = Math.max(group1Time, group2Time);
      combinationsCount++;

      if (maxTime < bestTime) {
        bestTime = maxTime;
        bestCombination = [group1.slice(), group2.slice()];

        bestCombinationDiv.innerHTML = `
                    <h3>Best Combination</h3>
                    <p>Competitor 1 (${formatTime(group1Time)}): ${group1.join(
          ", "
        )}</p>
                    <p>Competitor 2 (${formatTime(group2Time)}): ${group2.join(
          ", "
        )}</p>
                    <p>Total Time: ${formatTime(bestTime)}</p>`;
      }

      combinationsCountedDiv.textContent = `Combinations Analyzed: ${combinationsCount}`;
      return maxTime;
    }

    const currentEvent = events[index];
    const time1 = (competitor1[currentEvent] || 0) + pickupTime;
    const time2 = (competitor2[currentEvent] || 0) + pickupTime;

    let localBest = Infinity;

    // Assign to Group 1
    if (group1Time + time1 < beta) {
      const result = await dfs(
        index + 1,
        [...group1, currentEvent],
        group2,
        alpha,
        beta,
        group1Time + time1,
        group2Time
      );
      localBest = Math.min(localBest, result);
      alpha = Math.max(alpha, result);
    }

    if (alpha >= beta) return localBest;

    // Assign to Group 2
    if (group2Time + time2 < alpha) {
      const result = await dfs(
        index + 1,
        group1,
        [...group2, currentEvent],
        alpha,
        beta,
        group1Time,
        group2Time + time2
      );
      localBest = Math.min(localBest, result);
      beta = Math.min(beta, result);
    }

    return localBest;
  };

  await dfs(0, [], [], -Infinity, Infinity, 0, 0);
}

// Main function to start the optimization and live update
function optimizeAndDisplayLive(competitor1, competitor2) {
  const pickupTime = parseFloat(document.getElementById("pickup").value) || 0;

  processCombinationsWithAlphaBetaLive(competitor1, competitor2, pickupTime);
}
