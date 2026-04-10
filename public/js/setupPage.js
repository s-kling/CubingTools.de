let currentPrivacyPolicyVersion = '2026-04-10';
const GITHUB_BUG_REPORT_URL = 'https://github.com/s-kling/cubingtools.de/issues/new';
const USER_ERROR_POPUP_COOLDOWN_MS = 20000;
const recentUserFeedbackPopups = new Map();

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

// Dedupe user feedback popups to avoid spamming users with multiple popups for the same message in a short time frame
function shouldSuppressUserFeedbackPopup(dedupeKey) {
    if (!dedupeKey) {
        return false;
    }

    const now = Date.now();

    for (const [key, timestamp] of recentUserFeedbackPopups.entries()) {
        if (now - timestamp > USER_ERROR_POPUP_COOLDOWN_MS) {
            recentUserFeedbackPopups.delete(key);
        }
    }

    const previousTimestamp = recentUserFeedbackPopups.get(dedupeKey);
    recentUserFeedbackPopups.set(dedupeKey, now);

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

function setPopupContent(element, text, html) {
    if (!element) {
        return;
    }

    if (typeof html === 'string') {
        element.innerHTML = html;
        return;
    }

    element.textContent = text || '';
}

function closeUserFeedbackPopup() {
    const popup = document.getElementById('user-feedback-popup');

    if (popup) {
        popup.remove();
    }
}

function ensureUserFeedbackPopup() {
    let popup = document.getElementById('user-feedback-popup');

    if (popup) {
        return popup;
    }

    popup = document.createElement('div');
    popup.id = 'user-feedback-popup';
    popup.className = 'user-feedback-popup user-feedback-popup--info';
    popup.innerHTML = `
        <div class="user-feedback-popup__backdrop" data-close-popup="true"></div>
        <div class="user-feedback-popup__dialog" role="dialog" aria-modal="true" aria-labelledby="user-feedback-popup-title">
            <button type="button" class="user-feedback-popup__close" aria-label="Close dialog">&times;</button>
            <p class="user-feedback-popup__eyebrow">Notice</p>
            <h2 id="user-feedback-popup-title"></h2>
            <p class="user-feedback-popup__message"></p>
            <p class="user-feedback-popup__hint" hidden></p>
            <div class="user-feedback-popup__actions">
                <a class="user-feedback-popup__primary" target="_blank" rel="noopener noreferrer" hidden></a>
                <button type="button" class="user-feedback-popup__dismiss">Close</button>
            </div>
        </div>
    `;

    popup.addEventListener('click', (event) => {
        if (
            event.target?.dataset?.closePopup === 'true' ||
            event.target.classList.contains('user-feedback-popup__close') ||
            event.target.classList.contains('user-feedback-popup__dismiss')
        ) {
            closeUserFeedbackPopup();
        }
    });

    return popup;
}

function showUserFeedbackPopup({
    title = 'Notice',
    message = '',
    messageHtml,
    hint = '',
    hintHtml,
    variant = 'info',
    eyebrow = 'Notice',
    primaryActionLabel,
    primaryActionHref,
    primaryActionTarget = '_blank',
    primaryActionRel = 'noopener noreferrer',
    dismissLabel = 'Close',
    dedupeKey,
}) {
    if (shouldSuppressUserFeedbackPopup(dedupeKey)) {
        return;
    }

    if (!document.body) {
        alert(`${title}\n\n${message || hint || ''}`.trim());
        return;
    }

    const popup = ensureUserFeedbackPopup();
    const normalizedVariant = ['error', 'success', 'info'].includes(variant) ? variant : 'info';
    const titleElement = popup.querySelector('#user-feedback-popup-title');
    const eyebrowElement = popup.querySelector('.user-feedback-popup__eyebrow');
    const messageElement = popup.querySelector('.user-feedback-popup__message');
    const hintElement = popup.querySelector('.user-feedback-popup__hint');
    const primaryActionElement = popup.querySelector('.user-feedback-popup__primary');
    const dismissElement = popup.querySelector('.user-feedback-popup__dismiss');

    popup.className = `user-feedback-popup user-feedback-popup--${normalizedVariant}`;
    titleElement.textContent = title;
    eyebrowElement.textContent = eyebrow;
    setPopupContent(messageElement, message, messageHtml);

    const hasHint = Boolean(hint || hintHtml);
    setPopupContent(hintElement, hint, hintHtml);
    hintElement.hidden = !hasHint;

    const hasPrimaryAction = Boolean(primaryActionLabel && primaryActionHref);
    primaryActionElement.hidden = !hasPrimaryAction;
    if (hasPrimaryAction) {
        primaryActionElement.textContent = primaryActionLabel;
        primaryActionElement.href = primaryActionHref;
        primaryActionElement.target = primaryActionTarget;
        primaryActionElement.rel = primaryActionRel;
    } else {
        primaryActionElement.textContent = '';
        primaryActionElement.removeAttribute('href');
    }

    dismissElement.textContent = dismissLabel;

    if (!document.body.contains(popup)) {
        document.body.appendChild(popup);
    }

    if (hasPrimaryAction) {
        primaryActionElement.focus();
    } else {
        dismissElement.focus();
    }
}

function showUserErrorPopup({
    title = 'Something went wrong',
    message = 'An unexpected error occurred.',
    messageHtml,
    error = null,
    reportTitle,
    reportContext = '',
    dedupeKey,
}) {
    const reportMessage =
        typeof message === 'string' && message.trim() ? message : getErrorMessage(error);

    showUserFeedbackPopup({
        title,
        message,
        messageHtml,
        hint: 'If this looks like a bug on our side, please open a GitHub report so it can be reproduced and fixed.',
        variant: 'error',
        eyebrow: 'Problem detected',
        primaryActionLabel: 'Open bug report',
        primaryActionHref: buildBugReportUrl({
            title,
            message: reportMessage,
            error,
            reportTitle,
            reportContext,
        }),
        dismissLabel: 'Dismiss',
        dedupeKey,
    });
}

window.closeUserFeedbackPopup = closeUserFeedbackPopup;
window.closeUserErrorPopup = closeUserFeedbackPopup;
window.showUserFeedbackPopup = showUserFeedbackPopup;
window.showUserErrorPopup = showUserErrorPopup;

function shouldIgnoreGlobalError(error) {
    const message = getErrorMessage(error);

    return (
        !message ||
        message === 'Script error.' ||
        message.includes('AbortError') ||
        message.includes('ResizeObserver loop')
    );
}

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
        closeUserFeedbackPopup();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    // COOKIE CONSENT
    const cookiesAccepted = localStorage.getItem('cookies_accepted');

    const sessionId = sessionStorage.getItem('session_id');

    if (!sessionId && cookiesAccepted !== 'false') {
        const visits = localStorage.getItem('visits')
            ? parseInt(localStorage.getItem('visits'), 10)
            : 0;
        sessionStorage.setItem('session_id', Date.now().toString());
        localStorage.setItem('visits', visits + 1);

        if ((parseInt(visits, 10) + 1) % 15 === 0) {
            showUserFeedbackPopup({
                title: 'Share Your Feedback',
                message:
                    "You seem to enjoy using CubingTools! We'd love to hear your thoughts and suggestions.",
                variant: 'info',
                eyebrow: 'Feedback',
                primaryActionLabel: 'Send Feedback',
                primaryActionHref: '/contact',
                primaryActionTarget: '_self',
                primaryActionRel: '',
                dismissLabel: 'Later',
                dedupeKey: 'fifteenth-visit-feedback',
            });
        }
    }

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
    const packageVersion = await addVersionTag();
    setupNavbar();
    setupFooter(packageVersion);
});

function addCookieConsentBanner() {
    const cookiesAccepted = localStorage.getItem('cookies_accepted');
    const message = !cookiesAccepted
        ? 'We use cookies to improve your experience. By accepting these cookies, you agree to our privacy policy.'
        : 'Our privacy policies have changed. Please review and accept again.';

    const messageHtml = !cookiesAccepted
        ? 'We use cookies to improve your experience. By accepting these cookies, you agree to our <a href="/privacy-policy" style="color: #ffd700;">privacy policy</a>.'
        : 'Our <a href="/privacy-policy" style="color: #ffd700;">privacy policies</a> have changed. Please review and accept again.';

    showUserFeedbackPopup({
        title: 'Cookie Consent',
        message,
        messageHtml,
        variant: 'info',
        eyebrow: 'Notice',
        primaryActionLabel: 'Accept',
        primaryActionHref: '#',
        primaryActionTarget: '_self',
        primaryActionRel: '',
        dismissLabel: 'Decline',
        dedupeKey: 'cookie-consent-banner',
    });

    const primaryButton = document.querySelector('.user-feedback-popup__primary');
    const dismissButton = document.querySelector('.user-feedback-popup__dismiss');

    // Have the cursor be pointer
    primaryButton.style.cursor = 'pointer';
    dismissButton.style.cursor = 'pointer';

    if (primaryButton) {
        primaryButton.removeAttribute('href');
        primaryButton.removeAttribute('target');
        primaryButton.removeAttribute('rel');
        primaryButton.addEventListener('click', () => {
            handleConsent(true);
        });
    }

    if (dismissButton) {
        dismissButton.addEventListener('click', () => {
            handleConsent(false);
        });
    }
}

function handleConsent(isAccepted) {
    let acceptedVersion = isAccepted ? currentPrivacyPolicyVersion : 'false';
    localStorage.setItem('cookies_accepted', acceptedVersion);
    closeUserFeedbackPopup();
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
    let version = '...';
    versionElement.className = 'version-tag';
    versionElement.innerText = 'Loading...';
    versionElement.href = 'https://github.com/s-kling/cubingtools.de/releases/';

    try {
        const response = await fetch('/api/version');
        const versionData = await response.json();
        version = versionData.version || 'unknown';

        versionElement.innerText =
            window.location.port == 8001 || window.location.hostname === 'beta.cubingtools.de'
                ? `BETA ${version}`
                : `v${version}`;
    } catch (error) {
        console.error('Error loading version:', error);
        versionElement.innerText = 'Error loading version';
    }

    document.getElementById('version').appendChild(versionElement);

    return version;
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
    logoImage.style.maxHeight = '50px';

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

    // Dark mode toggle
    const themeToggle = document.createElement('li');
    const themeToggleButton = document.createElement('button');
    themeToggleButton.type = 'button';
    themeToggleButton.className = 'theme-toggle';
    themeToggleButton.setAttribute('aria-label', 'Toggle dark mode');
    const isDark = localStorage.getItem('theme') === 'dark';
    themeToggleButton.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`;

    themeToggleButton.addEventListener('click', () => {
        const html = document.documentElement;
        const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeToggleButton.innerHTML = `<i class="fas fa-${newTheme === 'dark' ? 'sun' : 'moon'}"></i>`;
    });

    themeToggle.appendChild(themeToggleButton);

    const pages = document.createElement('ul');

    const homeLink = document.createElement('li');
    homeLink.innerHTML = '<a href="/">Home</a>';

    const contactLink = document.createElement('li');
    contactLink.innerHTML = '<a href="/contact">Contact</a>';

    const privacyLink = document.createElement('li');
    privacyLink.innerHTML = '<a href="/privacy-policy">Privacy Policy</a>';

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
    pages.appendChild(privacyLink);
    pages.appendChild(changeRelease);
    pages.appendChild(themeToggle);

    navbar.appendChild(logo);
    navbar.appendChild(hamburger);
    navbar.appendChild(label);
    navbar.appendChild(pages);

    // Apply saved theme on page load
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

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

function setupFooter(packageVersion) {
    const footer = document.getElementById('footer');
    footer.innerHTML = '';

    const footerDiv = document.createElement('div');
    footerDiv.className = 'footer-content';

    // Copyright
    const footerText = document.createElement('a');
    footerText.innerHTML = `${window.location.hostname} v${packageVersion} by Sebastian Kling`;
    footerText.href = '/contact';
    footerText.className = 'small-screen';

    // Credit
    const creditText = document.createElement('p');
    creditText.innerHTML = 'Developed by ';
    creditText.className = 'big-screen';

    const name = document.createElement('a');
    name.href = '/contact';
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
