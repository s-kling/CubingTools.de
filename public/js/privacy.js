const policyFolder = '../html/privacy-policies/'; // Path to the folder containing policies
const policies = ['2024-12-24', '2024-12-01']; // List of policy versions (filenames without .md)

// Populate the dropdown with versions
const dropdown = document.getElementById('policy-version-dropdown');
const content = document.getElementById('policy-content');

policies.forEach((version) => {
    const option = document.createElement('option');
    option.value = version;
    option.textContent = version;
    dropdown.appendChild(option);
});

// Function to fetch and render markdown content
function loadPolicy(version) {
    const filePath = `${policyFolder}${version}.md`;
    fetch(filePath)
        .then((response) => {
            if (!response.ok) throw new Error('Policy file not found');
            return response.text();
        })
        .then((markdown) => {
            content.innerHTML = marked.parse(markdown); // Convert Markdown to HTML
        })
        .catch((error) => {
            content.innerHTML = `<p>Error loading policy: ${error.message}</p>`;
        });
}

// Load the initial policy content
loadPolicy(policies[0]);

// Update policy content on dropdown change
dropdown.addEventListener('change', (event) => {
    loadPolicy(event.target.value);
});
