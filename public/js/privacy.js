const policyFolder = '../html/privacy-policies/'; // Path to the folder containing policies
const policies = [
    '2026-04-10',
    '2026-03-31',
    '2026-02-14',
    '2025-02-27',
    '2024-12-24',
    '2024-12-01',
]; // List of policy versions (filenames without .md)
const termsFolder = '../html/terms/'; // Path to the folder containing terms
const terms = ['2026-04-02'];

const dropdown = document.getElementById('dropdown');
const content = document.getElementById('content');

document.addEventListener('DOMContentLoaded', () => {
    const optGroupPolicy = document.createElement('optgroup');
    optGroupPolicy.label = 'Privacy Policies';
    dropdown.appendChild(optGroupPolicy);

    const optGroupTerms = document.createElement('optgroup');
    optGroupTerms.label = 'Terms and Conditions';
    dropdown.appendChild(optGroupTerms);

    policies.forEach((version) => {
        const option = document.createElement('option');
        option.value = 'policy:' + version;
        option.textContent = version;
        optGroupPolicy.appendChild(option);
    });

    terms.forEach((version) => {
        const option = document.createElement('option');
        option.value = 'terms:' + version;
        option.textContent = version;
        optGroupTerms.appendChild(option);
    });

    // If the URL has a version parameter, select it in the dropdown and load the corresponding policy
    // Example URL: /privacy-policy?version=2026-03-31
    const urlParams = new URLSearchParams(window.location.search);
    const versionParam = urlParams.get('terms') || urlParams.get('policy');
    if (versionParam) {
        const fileType = urlParams.get('terms') ? 'terms' : 'policy';
        if (versionParam === 'latest') {
            const latestVersion = fileType === 'policy' ? policies[0] : terms[0];
            loadMarkdown(fileType, latestVersion);

            // Select the correct option in the dropdown
            dropdown.value = `${fileType}:${latestVersion}`;
        } else {
            const optionToSelect = dropdown.querySelector(
                `option[value="${fileType}:${versionParam}"]`,
            );
            if (optionToSelect) {
                optionToSelect.selected = true;
                const [file, version] = optionToSelect.value.split(':');
                loadMarkdown(file, version);

                // Select the correct option in the dropdown
                dropdown.value = `${fileType}:${versionParam}`;
            } else {
                content.innerHTML = `<p>Invalid version specified in URL. Please select a valid version from the dropdown.</p>`;
                window.showUserErrorPopup({
                    title: 'Invalid policy version',
                    message:
                        'The version specified in the URL is not valid. Please select a valid version from the dropdown.',
                    reportTitle:
                        'Privacy policy page failed to load due to invalid version parameter',
                    reportContext: `An invalid version parameter (${versionParam}) was provided in the URL.`,
                    dedupeKey: `privacy-policy-invalid-version:${versionParam}`,
                });
            }
        }
    }
});

// Function to fetch and render markdown content
function loadMarkdown(file, version) {
    let folder = file === 'policy' ? policyFolder : termsFolder;

    const filePath = `${folder}${version}.md`;
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
            window.showUserErrorPopup({
                title: 'Could not load the privacy policy',
                message: 'The selected privacy policy version could not be loaded.',
                error,
                reportTitle: 'Privacy policy page failed to load a policy file',
                reportContext: `Loading the privacy policy markdown failed for version ${version}.`,
                dedupeKey: `privacy-policy:${version}`,
            });
        });
}

// Load the initial policy content
loadMarkdown('policy', policies[0]);

// Update policy content on dropdown change
dropdown.addEventListener('change', (event) => {
    const [file, version] = event.target.value.split(':');
    loadMarkdown(file, version);
});
