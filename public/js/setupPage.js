document.addEventListener('DOMContentLoaded', () => {
    const consentBanner = document.getElementById('cookie-consent-banner');
    const cookiesAccepted = localStorage.getItem('cookies_accepted');

    if (cookiesAccepted === 'true') {
        window.dataLayer = window.dataLayer || [];
        function gtag() {
            dataLayer.push(arguments);
        }
        gtag('js', new Date());
        gtag('config', 'G-7FDCB5928P');
    } else if (!cookiesAccepted) {
        consentBanner.style.display = 'block';
    }

    // Function to handle cookie consent
    function handleConsent(isAccepted) {
        localStorage.setItem('cookies_accepted', isAccepted);
        consentBanner.style.display = 'none';
    }

    // Event listeners for accept and decline buttons
    document
        .getElementById('accept-cookies')
        .addEventListener('click', () => handleConsent('true'));
    document
        .getElementById('decline-cookies')
        .addEventListener('click', () => handleConsent('false'));

    loadTools();
    setupNavbar();
    setupFooter();
});

async function loadTools() {
    const toolsContainer = document.getElementById('sidebar');
    toolsContainer.innerHTML = '';

    try {
        const response = await fetch('/api/tools');
        const tools = await response.json();

        if (Array.isArray(tools)) {
            tools.forEach((tool) => {
                const toolElement = document.createElement('a');
                toolElement.className = 'tool-tag';
                toolElement.href = `/tools/${tool.filename.replace('.html', '')}`;
                toolElement.rel = 'noopener noreferrer';

                toolElement.innerHTML = `
                    <h3 class="tool-title">${tool.title}</h3>
                `;

                toolsContainer.appendChild(toolElement);
            });
        } else {
            console.error('Expected an array but received:', tools);
        }
    } catch (error) {
        console.error('Error loading tools:', error);
    }
}

function setupNavbar() {
    const navbar = document.getElementById('navbar');
    navbar.innerHTML = '';

    const logo = document.createElement('a');
    logo.href = '/';
    logo.className = 'logo';
    logo.innerHTML = 'CubingTools';

    const navDiv = document.createElement('div');
    navDiv.className = 'navbar';

    const homeLink = document.createElement('a');
    homeLink.href = '/';
    homeLink.innerHTML = 'Home';

    const contactLink = document.createElement('a');
    contactLink.href = 'mailto:info@cubingtools.de';
    contactLink.innerHTML = 'Contact';

    const betaLink = document.createElement('a');
    betaLink.style.cursor = 'pointer';

    if (location.port == 8443) {
        betaLink.onclick = () => {
            location.port = 443; // Redirect to release port
        };

        if (document.getElementById('title')) {
            const title = document.getElementById('title');
            title.innerText += ' (Beta Version)';
        }
        betaLink.innerHTML = 'Release Version';
    } else {
        betaLink.onclick = () => {
            location.port = 8443; // Redirect to beta testing port
        };
        betaLink.innerHTML = 'Beta Version';
    }

    navDiv.appendChild(homeLink);
    navDiv.appendChild(contactLink);
    navDiv.appendChild(betaLink);

    navbar.appendChild(logo);
    navbar.appendChild(navDiv);
}

function setupFooter() {
    const footer = document.getElementById('footer');
    footer.innerHTML = '';

    const footerDiv = document.createElement('div');
    footerDiv.className = 'footer-content';

    // Copyright
    const footerText = document.createElement('p');
    footerText.innerHTML = '© 2025 CubingTools by Sebastian Kling';
    footerText.className = 'small-screen';

    // Credit
    const creditText = document.createElement('p');
    creditText.innerHTML = 'Developed by ';
    creditText.className = 'big-screen';

    const name = document.createElement('a');
    name.href = 'mailto:sebastian@cubingtools.de';
    name.innerText = 'Sebastian Kling';
    creditText.appendChild(name);

    // Privacy Policy
    const privacyText = document.createElement('p');
    privacyText.innerText = 'For more information on how we handle your data, please read our ';
    privacyText.className = 'big-screen';

    const privacyLink = document.createElement('a');
    privacyLink.href = '/privacy-policy';
    privacyLink.innerText = 'Privacy Policy';
    privacyText.appendChild(privacyLink);

    // Append elements to footer
    footerDiv.appendChild(footerText);
    footerDiv.appendChild(creditText);
    footerDiv.appendChild(privacyText);

    footer.appendChild(footerDiv);
}
