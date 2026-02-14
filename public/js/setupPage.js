document.addEventListener('DOMContentLoaded', () => {
    // HERO
    const hasSeenHero = localStorage.getItem('hero_seen');

    if (!hasSeenHero) {
        showHero();
    }

    // COOKIE CONSENT
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

    // Event listeners for accept and decline buttons
    document
        .getElementById('accept-cookies')
        .addEventListener('click', () => handleConsent('true'));
    document
        .getElementById('decline-cookies')
        .addEventListener('click', () => handleConsent('false'));

    // LOAD TOOLS
    loadTools();
    addVersionTag();
    setupNavbar();
    setupFooter();
});

function showHero() {
    const hero = document.createElement('section');
    hero.className = 'hero';
    hero.innerHTML = `
        <h1>CubingTools is back.</h1>
        <p>New and Improved 🚀</p>
        <div class="info-section">
            <div class="info-card" id="why-gone">
                <h2>Why we were gone</h2>
                <p>We took time to completely restructure the codebase, making it faster, more efficient, and easier to understand.</p>
            </div>
            <div class="info-card" id="what-changed">
                <h2>What has changed</h2>
                <p>Click here to check out the new features, fixes, and improvements on our GitHub release page.</p>
            </div>
            <div class="info-card" id="follow-bluesky">
                <h2>Follow us on BlueSky</h2>
                <p>Stay connected with CubingTools on BlueSky for news, updates, and sneak peeks into upcoming features.</p>
            </div>
        </div>
        `;
    document.body.prepend(hero);

    // Disable scroll until hero is dismissed
    document.body.style.overflow = 'hidden';

    const dismissHero = () => {
        hero.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
        hero.style.opacity = '0';
        hero.style.transform = 'translateY(-40px)';

        setTimeout(() => {
            hero.remove();
            document.body.style.overflowY = 'auto';
            localStorage.setItem('hero_seen', 'true'); // store flag
        }, 800);

        document.removeEventListener('keydown', dismissHero);
        document.removeEventListener('click', dismissHero);
    };

    document.addEventListener('keydown', dismissHero);
    document.addEventListener('click', dismissHero);

    // Card actions
    document.getElementById('what-changed').addEventListener('click', () => {
        window.open('https://github.com/s-kling/CubingTools.de/releases/tag/Release', '_blank');
    });

    document.getElementById('follow-bluesky').addEventListener('click', () => {
        window.open('https://bsky.app/profile/cubingtools.de', '_blank');
    });
}

// Function to handle cookie consent
function handleConsent(isAccepted) {
    localStorage.setItem('cookies_accepted', isAccepted);
    consentBanner.style.display = 'none';
}

async function loadTools() {
    const toolsContainer = document.getElementById('sidebar');
    toolsContainer.innerHTML = '';

    try {
        const response = await fetch('/api/tools');
        const tools = await response.json();

        if (Array.isArray(tools)) {
            const featuredTools = tools.filter((tool) => tool.filename.includes('guildford'));
            const otherTools = tools.filter((tool) => !tool.filename.includes('guildford'));

            toolsContainer.innerHTML += '<h3 class="big-screen">Featured</h3>';
            featuredTools.forEach((tool) => {
                const toolElement = document.createElement('a');
                toolElement.className = 'tool-tag';
                toolElement.href = `/tools/${tool.filename.replace('.html', '')}`;
                toolElement.rel = 'noopener noreferrer';

                toolElement.innerHTML = `
                        <h3 class="tool-title">${tool.title}</h3>
                    `;

                toolsContainer.appendChild(toolElement);
            });

            toolsContainer.innerHTML += '<h3 class="big-screen">Tools</h3>';
            otherTools.forEach((tool) => {
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

async function addVersionTag() {
    const versionElement = document.createElement('a');
    versionElement.className = 'version-tag';
    versionElement.innerText = 'Loading...';
    versionElement.href = 'https://github.com/s-kling/cubingtools.de/releases/';

    try {
        const response = await fetch('/api/version');
        const version = await response.json();

        versionElement.innerText =
            window.location.port == 8001 ? `BETA ${version.version}` : `v${version.version}`;
    } catch (error) {
        console.error('Error loading version:', error);
        versionElement.innerText = 'Error loading version';
    }

    document.getElementById('version').appendChild(versionElement);
}

function setupNavbar() {
    const navbar = document.getElementById('navbar');
    navbar.innerHTML = '';
    const logo = document.createElement('a');
    logo.href = '/';
    logo.className = 'logo';

    const logoImage = document.createElement('img');
    logoImage.src = '/assets/logo_long.png';
    logoImage.alt = 'CubingTools Logo';
    logoImage.className = 'logo-image';
    logoImage.style.maxHeight = '50px'; // Limit the size to match the text logo

    logo.style.display = 'flex';
    logo.style.alignItems = 'center';
    logo.appendChild(logoImage);

    const hamburger = document.createElement('input');
    hamburger.type = 'checkbox';
    hamburger.id = 'check';

    const label = document.createElement('label');
    label.htmlFor = 'check';
    label.className = 'checkbtn';

    const hamburgerIcon = document.createElement('i');
    hamburgerIcon.className = 'fas fa-bars';
    label.appendChild(hamburgerIcon);

    const pages = document.createElement('ul');

    const homeLink = document.createElement('li');
    homeLink.innerHTML = '<a href="/">Home</a>';

    const contactLink = document.createElement('li');
    contactLink.innerHTML = '<a href="mailto:info@cubingtools.de">Contact</a>';

    const changeRelease = document.createElement('li');
    changeRelease.style.cursor = 'pointer';

    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        changeRelease.onclick = () => {
            location.port = location.port === '8001' ? '8000' : '8001';
        };
        changeRelease.innerHTML =
            '<a href="#">' + (location.port === '8001' ? 'Full Release' : 'Beta') + '</a>';
    } else if (location.hostname === 'beta.cubingtools.de') {
        changeRelease.onclick = () => {
            location.hostname = 'cubingtools.de';
        };
        changeRelease.innerHTML = '<a href="#">Full Release</a>';
    } else {
        changeRelease.onclick = () => {
            location.hostname = 'beta.cubingtools.de';
        };
        changeRelease.innerHTML = '<a href="#">Beta</a>';
    }

    pages.appendChild(homeLink);
    pages.appendChild(contactLink);
    pages.appendChild(changeRelease);

    navbar.appendChild(logo);
    navbar.appendChild(hamburger);
    navbar.appendChild(label);
    navbar.appendChild(pages);

    // Hide navbar when clicking outside of it
    document.addEventListener('click', (event) => {
        if (!navbar.contains(event.target) && !label.contains(event.target)) {
            hamburger.checked = false;
        }
    });

    // Swipe to hide navbar
    let touchStartX = 0;
    let touchEndX = 0;

    document.addEventListener('touchstart', (event) => {
        touchStartX = event.changedTouches[0].screenX;
    });

    document.addEventListener('touchend', (event) => {
        touchEndX = event.changedTouches[0].screenX;
        if (touchEndX < touchStartX - 50) {
            // Adding a threshold for swipe
            hamburger.checked = false;
        }
    });
}

function setupFooter() {
    const footer = document.getElementById('footer');
    footer.innerHTML = '';

    const footerDiv = document.createElement('div');
    footerDiv.className = 'footer-content';

    // Copyright
    const footerText = document.createElement('a');
    footerText.innerHTML = '© 2025 CubingTools by Sebastian Kling';
    footerText.href = 'mailto:sebastian@cubingtools.de';
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
