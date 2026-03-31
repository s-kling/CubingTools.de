let currentPrivacyPolicyVersion = '2026-02-14';
const GITHUB_BUG_REPORT_URL = 'https://github.com/s-kling/cubingtools.de/issues/new';
const USER_ERROR_POPUP_COOLDOWN_MS = 20000;
const recentUserErrorPopups = new Map();

// Format error messages
function getErrorMessage(error) {
    if (!error) {
        return 'Unknown error';
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim();
    }

    return 'Unknown error';
}

// Dedupe user error popups to avoid spamming users with multiple popups for the same error in a short time frame
function shouldSuppressUserErrorPopup(dedupeKey) {
    if (!dedupeKey) {
        return false;
    }

    const now = Date.now();

    for (const [key, timestamp] of recentUserErrorPopups.entries()) {
        if (now - timestamp > USER_ERROR_POPUP_COOLDOWN_MS) {
            recentUserErrorPopups.delete(key);
        }
    }

    const previousTimestamp = recentUserErrorPopups.get(dedupeKey);
    recentUserErrorPopups.set(dedupeKey, now);

    return (
        typeof previousTimestamp === 'number' &&
        now - previousTimestamp < USER_ERROR_POPUP_COOLDOWN_MS
    );
}

// Build a GitHub issue URL with pre-filled title and body based on the error details
function buildBugReportUrl({ title, message, error, reportTitle, reportContext = '' }) {
    const bugTitle = reportTitle || `Bug: ${title}`;
    const errorMessage = getErrorMessage(error);
    const errorStack = typeof error?.stack === 'string' ? error.stack : 'Unavailable';
    const errorUrl = typeof error?.url === 'string' ? error.url : 'Unavailable';
    const body = [
        '## Summary',
        message,
        '',
        '## Context',
        reportContext || 'Describe what you were doing when this happened.',
        '',
        '## Technical details',
        `- Page: ${window.location.href}`,
        `- Request URL: ${errorUrl}`,
        `- Error: ${errorMessage}`,
        `- User agent: ${navigator.userAgent}`,
        '',
        '## Stack trace',
        '```',
        errorStack,
        '```',
    ].join('\n');

    const url = new URL(GITHUB_BUG_REPORT_URL);
    url.searchParams.set('labels', 'bug');
    url.searchParams.set('title', bugTitle);
    url.searchParams.set('body', body);
    return url.toString();
}

// Close the popup
function closeUserErrorPopup() {
    const popup = document.getElementById('user-error-popup');

    if (popup) {
        popup.remove();
    }
}

function ensureUserErrorPopup() {
    let popup = document.getElementById('user-error-popup');

    if (popup) {
        return popup;
    }

    popup = document.createElement('div');
    popup.id = 'user-error-popup';
    popup.className = 'user-error-popup';
    popup.innerHTML = `
        <div class="user-error-popup__backdrop" data-close-popup="true"></div>
        <div class="user-error-popup__dialog" role="dialog" aria-modal="true" aria-labelledby="user-error-popup-title">
            <button type="button" class="user-error-popup__close" aria-label="Close error dialog">&times;</button>
            <p class="user-error-popup__eyebrow">Problem detected</p>
            <h2 id="user-error-popup-title"></h2>
            <p class="user-error-popup__message"></p>
            <p class="user-error-popup__hint">
                If this looks like a bug on our side, please open a GitHub report so it can be reproduced and fixed.
            </p>
            <div class="user-error-popup__actions">
                <a class="user-error-popup__report" style="width=100%" target="_blank" rel="noopener noreferrer">Open bug report</a>
                <button type="button" class="user-error-popup__dismiss">Dismiss</button>
            </div>
        </div>
    `;

    popup.addEventListener('click', (event) => {
        if (
            event.target?.dataset?.closePopup === 'true' ||
            event.target.classList.contains('user-error-popup__close') ||
            event.target.classList.contains('user-error-popup__dismiss')
        ) {
            closeUserErrorPopup();
        }
    });

    return popup;
}

function showUserErrorPopup({
    title = 'Something went wrong',
    message = 'An unexpected error occurred.',
    error = null,
    reportTitle,
    reportContext = '',
    dedupeKey,
}) {
    if (shouldSuppressUserErrorPopup(dedupeKey)) {
        return;
    }

    if (!document.body) {
        alert(`${title}\n\n${message}`);
        return;
    }

    const popup = ensureUserErrorPopup();
    popup.querySelector('#user-error-popup-title').textContent = title;
    popup.querySelector('.user-error-popup__message').textContent = message;
    popup.querySelector('.user-error-popup__report').href = buildBugReportUrl({
        title,
        message,
        error,
        reportTitle,
        reportContext,
    });

    if (!document.body.contains(popup)) {
        document.body.appendChild(popup);
    }

    popup.querySelector('.user-error-popup__report').focus();
}

function shouldIgnoreGlobalError(error) {
    const message = getErrorMessage(error);

    return (
        !message ||
        message === 'Script error.' ||
        message.includes('AbortError') ||
        message.includes('ResizeObserver loop')
    );
}

window.closeUserErrorPopup = closeUserErrorPopup;
window.showUserErrorPopup = showUserErrorPopup;
window.fetchJsonOrThrow = async function (url, options = {}) {
    const { errorContext = 'Request failed', ...fetchOptions } = options;
    const response = await fetch(url, fetchOptions);
    const responseText = await response.text();

    let payload = null;
    if (responseText) {
        try {
            payload = JSON.parse(responseText);
        } catch {
            payload = responseText;
        }
    }

    if (!response.ok) {
        const payloadMessage =
            payload && typeof payload === 'object'
                ? payload.error || payload.message
                : responseText;
        const error = new Error(payloadMessage || `${errorContext} (${response.status})`);
        error.status = response.status;
        error.url = response.url;
        error.payload = payload;
        throw error;
    }

    return payload;
};

window.addEventListener('error', (event) => {
    const error = event.error || new Error(event.message || 'Unexpected runtime error');

    if (shouldIgnoreGlobalError(error)) {
        return;
    }

    showUserErrorPopup({
        title: 'Unexpected page error',
        message: 'This page hit an unexpected error and may not behave correctly.',
        error,
        reportTitle: 'Unexpected browser error',
        reportContext: 'The browser raised a runtime error while using the site.',
        dedupeKey: `global-error:${getErrorMessage(error)}`,
    });
});

window.addEventListener('unhandledrejection', (event) => {
    const error =
        event.reason instanceof Error ? event.reason : new Error(getErrorMessage(event.reason));

    if (shouldIgnoreGlobalError(error)) {
        return;
    }

    showUserErrorPopup({
        title: 'Unexpected request error',
        message: 'A request failed unexpectedly and the page may be out of sync.',
        error,
        reportTitle: 'Unhandled browser promise rejection',
        reportContext: 'The browser reported an unhandled rejected promise while using the site.',
        dedupeKey: `unhandled-rejection:${getErrorMessage(error)}`,
    });
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeUserErrorPopup();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // // HERO
    // const hasSeenHero = localStorage.getItem('hero_seen');

    // if (!hasSeenHero) {
    //     showHero();
    // }

    const sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
        sessionStorage.setItem('session_id', Date.now().toString());
        const visits = localStorage.getItem('visits')
            ? parseInt(localStorage.getItem('visits'))
            : 0;
        localStorage.setItem('visits', visits + 1);
    }

    // COOKIE CONSENT
    const cookiesAccepted = localStorage.getItem('cookies_accepted');

    if (cookiesAccepted === currentPrivacyPolicyVersion) {
        window.dataLayer = window.dataLayer || [];
        function gtag() {
            dataLayer.push(arguments);
        }
        gtag('js', new Date());
        gtag('config', 'G-7FDCB5928P');
    } else if (cookiesAccepted !== currentPrivacyPolicyVersion && cookiesAccepted !== 'false') {
        addCookieConsentBanner();
    }

    loadTools();
    addVersionTag();
    setupNavbar();
    setupFooter();
});

// function showHero() {
//     const hero = document.createElement('section');
//     hero.className = 'hero';
//     hero.innerHTML = `
//         <h1>CubingTools is back.</h1>
//         <p>New and Improved 🚀</p>
//         <div class="info-section">
//             <div class="info-card" id="why-gone">
//                 <h2>Why we were gone</h2>
//                 <p>We took time to completely restructure the codebase, making it faster, more efficient, and easier to understand.</p>
//             </div>
//             <div class="info-card" id="what-changed">
//                 <h2>What has changed</h2>
//                 <p>Click here to check out the new features, fixes, and improvements on our GitHub release page.</p>
//             </div>
//             <div class="info-card" id="follow-bluesky">
//                 <h2>Follow us on BlueSky</h2>
//                 <p>Stay connected with CubingTools on BlueSky for news, updates, and sneak peeks into upcoming features.</p>
//             </div>
//         </div>
//         `;
//     document.body.prepend(hero);

//     // Disable scroll until hero is dismissed
//     document.body.style.overflow = 'hidden';

//     const dismissHero = () => {
//         hero.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
//         hero.style.opacity = '0';
//         hero.style.transform = 'translateY(-40px)';

//         setTimeout(() => {
//             hero.remove();
//             document.body.style.overflowY = 'auto';
//             localStorage.setItem('hero_seen', 'true'); // store flag
//         }, 800);

//         document.removeEventListener('keydown', dismissHero);
//         document.removeEventListener('click', dismissHero);
//     };

//     document.addEventListener('keydown', dismissHero);
//     document.addEventListener('click', dismissHero);

//     // Card actions
//     document.getElementById('what-changed').addEventListener('click', () => {
//         window.open('https://github.com/s-kling/CubingTools.de/releases/tag/Release', '_blank');
//     });

//     document.getElementById('follow-bluesky').addEventListener('click', () => {
//         window.open('https://bsky.app/profile/cubingtools.de', '_blank');
//     });
// }

function addCookieConsentBanner() {
    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.className = 'cookie-consent-banner';

    const cookiesAccepted = localStorage.getItem('cookies_accepted');
    const message = !cookiesAccepted
        ? 'We use cookies to improve your experience. By accepting these cookies, you agree to our <a href="/privacy-policy" style="color: #ffd700;">privacy policy</a>.'
        : 'Our <a href="/privacy-policy" style="color: #ffd700;">privacy policies</a> have changed. Please review and accept again.';

    banner.innerHTML = `
        <div id="cookie-consent-banner">
            <p>${message}</p>
            <div class="inline-buttons">
                <button id="accept-cookies" onclick="handleConsent(true)">Accept</button>
                <button id="decline-cookies" onclick="handleConsent(false)">Decline</button>
            </div>
        </div>
    `;
    document.body.appendChild(banner);
}

function handleConsent(isAccepted) {
    let acceptedVersion = isAccepted ? currentPrivacyPolicyVersion : 'false';
    localStorage.setItem('cookies_accepted', acceptedVersion);
    const consentBanner = document.getElementById('cookie-consent-banner');
    consentBanner.style.transition = 'opacity 0.3s ease';
    consentBanner.style.opacity = '0';

    setTimeout(() => {
        consentBanner.remove();
    }, 300);
}

async function loadTools() {
    const toolsContainer = document.getElementById('sidebar');
    toolsContainer.innerHTML = '';

    try {
        const tools = await window.fetchJsonOrThrow('/api/tools', {
            errorContext: 'Could not load tools',
        });

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
            throw new Error('Unexpected tool list response.');
        }
    } catch (error) {
        console.error('Error loading tools:', error);
        toolsContainer.innerHTML = '<h3>Tools unavailable</h3>';
        window.showUserErrorPopup({
            title: 'Could not load the tool list',
            message: 'The sidebar tools could not be loaded right now.',
            error,
            reportTitle: 'Tool list failed to load',
            reportContext:
                'The shared sidebar tool list request failed while rendering the page shell.',
            dedupeKey: 'setup-tools',
        });
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
            window.location.port == 8001 || window.location.hostname === 'beta.cubingtools.de'
                ? `BETA ${version.version}`
                : `v${version.version}`;
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
    if (window.location.port == 8001 || window.location.hostname === 'beta.cubingtools.de') {
        logoImage.src = '/assets/beta_logo_long.png';
    } else {
        logoImage.src = '/assets/logo_long.png';
    }
    logoImage.alt = 'CubingTools.de';
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
    contactLink.innerHTML = '<a href="/contact">Contact</a>';

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
    footerText.innerHTML = `© ${new Date().getFullYear()} CubingTools by Sebastian Kling`;
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
