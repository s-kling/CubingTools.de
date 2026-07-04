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
        closeMobileSheets();
    }
});

// ─────────────────────────────────────────────────────────────
//  MOBILE BOTTOM SHEETS
// ─────────────────────────────────────────────────────────────

/** Cached tool data so we only fetch once */
let _cachedTools = null;

function isMobileLayout() {
    return window.matchMedia('(max-width: 650px)').matches;
}

/**
 * Build and inject the bottom bar + two sheets (tools, nav) into the DOM.
 * Called once after the tools list is available.
 */
function setupMobileBottomBar(tools) {
    // ── Backdrop ──────────────────────────────────────────────
    const backdrop = document.createElement('div');
    backdrop.className = 'mobile-sheet-backdrop';
    backdrop.id = 'mobile-sheet-backdrop';
    document.body.appendChild(backdrop);

    // ── Tools Sheet ───────────────────────────────────────────
    const toolsSheet = document.createElement('div');
    toolsSheet.id = 'mobile-tools-sheet';
    toolsSheet.setAttribute('role', 'dialog');
    toolsSheet.setAttribute('aria-modal', 'true');
    toolsSheet.setAttribute('aria-label', 'Tools');
    toolsSheet.innerHTML = buildToolsSheetHTML(tools);
    document.body.appendChild(toolsSheet);

    // ── Nav Sheet ─────────────────────────────────────────────
    const navSheet = document.createElement('div');
    navSheet.id = 'mobile-nav-sheet';
    navSheet.setAttribute('role', 'dialog');
    navSheet.setAttribute('aria-modal', 'true');
    navSheet.setAttribute('aria-label', 'Menu');
    navSheet.innerHTML = buildNavSheetHTML();
    document.body.appendChild(navSheet);

    // ── Bottom Bar ────────────────────────────────────────────
    const bar = document.createElement('div');
    bar.id = 'mobile-bottom-bar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Main navigation');
    bar.innerHTML = `
        <button class="mobile-bottom-bar__btn" id="mbb-home" aria-label="Home">
            <i class="fas fa-home"></i>
            <span>Home</span>
        </button>
        <button class="mobile-bottom-bar__btn" id="mbb-tools" aria-label="Tools" aria-expanded="false" aria-controls="mobile-tools-sheet">
            <i class="fas fa-wrench"></i>
            <span>Tools</span>
        </button>
        <button class="mobile-bottom-bar__btn" id="mbb-menu" aria-label="Menu" aria-expanded="false" aria-controls="mobile-nav-sheet">
            <i class="fas fa-bars"></i>
            <span>Menu</span>
        </button>
    `;
    document.body.appendChild(bar);

    // ── Event wiring ──────────────────────────────────────────
    document.getElementById('mbb-home').addEventListener('click', () => {
        closeMobileSheets();
        window.location.href = '/';
    });

    document.getElementById('mbb-tools').addEventListener('click', () => {
        toggleSheet('tools');
    });

    document.getElementById('mbb-menu').addEventListener('click', () => {
        toggleSheet('nav');
    });

    backdrop.addEventListener('click', closeMobileSheets);

    // Tools sheet: close button
    toolsSheet
        .querySelector('.mobile-tools-sheet__close')
        ?.addEventListener('click', closeMobileSheets);

    // Tools sheet: live search filter
    const searchInput = toolsSheet.querySelector('.mobile-tools-sheet__search');
    if (searchInput) {
        searchInput.addEventListener('input', () => filterToolsSheet(searchInput.value, tools));
    }

    // Nav sheet: theme toggle button
    const themeBtn = navSheet.querySelector('#mobile-nav-theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const html = document.documentElement;
            const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            const icon = themeBtn.querySelector('i');
            if (icon) {
                icon.className = `fas fa-${newTheme === 'dark' ? 'sun' : 'moon'}`;
            }
            const label = themeBtn.querySelector('.mobile-nav-sheet__theme-label');
            if (label) {
                label.textContent = newTheme === 'dark' ? 'Light mode' : 'Dark mode';
            }
        });
    }
}

function buildToolsSheetHTML(tools) {
    const featured = (tools || []).filter((t) => t.filename.includes('guildford'));
    const other = (tools || []).filter((t) => !t.filename.includes('guildford'));

    function toolRow(tool, isFeatured) {
        const href = `/tools/${tool.filename.replace('.html', '')}`;
        const badge = isFeatured ? '<span class="mobile-sheet-tool__badge">Featured</span>' : '';
        return `
            <li>
                <a class="mobile-sheet-tool" href="${href}">
                    <span class="mobile-sheet-tool__icon"><i class="fas fa-cube"></i></span>
                    <span>${tool.title}</span>
                    ${badge}
                </a>
            </li>`;
    }

    const featuredHTML = featured.map((t) => toolRow(t, true)).join('');
    const otherHTML = other.map((t) => toolRow(t, false)).join('');

    return `
        <div class="mobile-tools-sheet__handle" aria-hidden="true"></div>
        <div class="mobile-tools-sheet__header">
            <span class="mobile-tools-sheet__title">Tools</span>
            <button class="mobile-tools-sheet__close" aria-label="Close tools">&times;</button>
        </div>
        <div class="mobile-tools-sheet__search-wrap">
            <input class="mobile-tools-sheet__search" type="search" placeholder="Search tools…" aria-label="Search tools">
        </div>
        <ul class="mobile-tools-sheet__list" id="mobile-tools-list">
            ${featured.length ? `<li class="mobile-tools-sheet__section-label">Featured</li>${featuredHTML}` : ''}
            ${other.length ? `<li class="mobile-tools-sheet__section-label">All Tools</li>${otherHTML}` : ''}
        </ul>
    `;
}

function buildNavSheetHTML() {
    const isDark = (localStorage.getItem('theme') || 'dark') === 'dark';
    const themeLabel = isDark ? 'Light mode' : 'Dark mode';
    const themeIcon = isDark ? 'sun' : 'moon';

    const betaLabel = (() => {
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            return location.port === '8001' ? 'Full Release' : 'Beta';
        }
        return location.hostname === 'beta.cubingtools.de' ? 'Full Release' : 'Beta';
    })();

    const betaHref = (() => {
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return '#';
        if (location.hostname === 'beta.cubingtools.de')
            return location.href.replace('beta.cubingtools.de', 'cubingtools.de');
        return location.href.replace('cubingtools.de', 'beta.cubingtools.de');
    })();

    return `
        <div class="mobile-nav-sheet__handle" aria-hidden="true"></div>
        <ul class="mobile-nav-sheet__list">
            <li>
                <a class="mobile-nav-sheet__item" href="/">
                    <i class="fas fa-home"></i>Home
                </a>
            </li>
            <li>
                <a class="mobile-nav-sheet__item" href="/contact">
                    <i class="fas fa-envelope"></i>Contact
                </a>
            </li>
            <li>
                <a class="mobile-nav-sheet__item" href="/privacy-policy">
                    <i class="fas fa-shield-alt"></i>Privacy Policy
                </a>
            </li>
            <li>
                <a class="mobile-nav-sheet__item" href="${betaHref}">
                    <i class="fas fa-flask"></i>${betaLabel}
                </a>
            </li>
            <li>
                <button id="mobile-nav-theme-toggle" class="mobile-nav-sheet__item" style="width:100%;border:none;background:transparent;text-align:left;cursor:pointer;font-size:16px;font-weight:500;color:var(--main-text);">
                    <i class="fas fa-${themeIcon}"></i><span class="mobile-nav-sheet__theme-label">${themeLabel}</span>
                </button>
            </li>
        </ul>
    `;
}

/** Filter tool rows in the tools sheet based on the search query */
function filterToolsSheet(query, tools) {
    const list = document.getElementById('mobile-tools-list');
    if (!list) return;

    const q = query.trim().toLowerCase();
    if (!q) {
        // Restore full list
        const sheet = document.getElementById('mobile-tools-sheet');
        if (sheet) {
            const listEl = sheet.querySelector('#mobile-tools-list');
            if (listEl) listEl.innerHTML = buildToolsSheetInnerHTML(tools);
        }
        return;
    }

    const matched = (tools || []).filter((t) => t.title.toLowerCase().includes(q));
    if (matched.length === 0) {
        list.innerHTML = `<li class="mobile-tools-sheet__empty">No tools match "<strong>${q}</strong>"</li>`;
        return;
    }

    list.innerHTML = matched
        .map((t) => {
            const href = `/tools/${t.filename.replace('.html', '')}`;
            return `<li><a class="mobile-sheet-tool" href="${href}">
            <span class="mobile-sheet-tool__icon"><i class="fas fa-cube"></i></span>
            <span>${t.title}</span>
        </a></li>`;
        })
        .join('');
}

function buildToolsSheetInnerHTML(tools) {
    const featured = (tools || []).filter((t) => t.filename.includes('guildford'));
    const other = (tools || []).filter((t) => !t.filename.includes('guildford'));

    function toolRow(tool, isFeatured) {
        const href = `/tools/${tool.filename.replace('.html', '')}`;
        const badge = isFeatured ? '<span class="mobile-sheet-tool__badge">Featured</span>' : '';
        return `<li><a class="mobile-sheet-tool" href="${href}">
            <span class="mobile-sheet-tool__icon"><i class="fas fa-cube"></i></span>
            <span>${tool.title}</span>${badge}</a></li>`;
    }

    return [
        ...(featured.length
            ? [
                  `<li class="mobile-tools-sheet__section-label">Featured</li>`,
                  ...featured.map((t) => toolRow(t, true)),
              ]
            : []),
        ...(other.length
            ? [
                  `<li class="mobile-tools-sheet__section-label">All Tools</li>`,
                  ...other.map((t) => toolRow(t, false)),
              ]
            : []),
    ].join('');
}

let _activeSheet = null;

function toggleSheet(which) {
    if (_activeSheet === which) {
        closeMobileSheets();
        return;
    }
    closeMobileSheets(false); // close without animation reset so we can open immediately

    _activeSheet = which;

    const toolsSheet = document.getElementById('mobile-tools-sheet');
    const navSheet = document.getElementById('mobile-nav-sheet');
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    const toolsBtn = document.getElementById('mbb-tools');
    const menuBtn = document.getElementById('mbb-menu');

    if (which === 'tools' && toolsSheet) {
        toolsSheet.classList.add('is-open');
        toolsBtn?.setAttribute('aria-expanded', 'true');
        toolsBtn?.classList.add('is-active');
        // Focus the search input for immediate typing
        setTimeout(() => toolsSheet.querySelector('.mobile-tools-sheet__search')?.focus(), 50);
    } else if (which === 'nav' && navSheet) {
        navSheet.classList.add('is-open');
        menuBtn?.setAttribute('aria-expanded', 'true');
        menuBtn?.classList.add('is-active');
    }

    backdrop?.classList.add('is-visible');
}

function closeMobileSheets(resetActive = true) {
    const toolsSheet = document.getElementById('mobile-tools-sheet');
    const navSheet = document.getElementById('mobile-nav-sheet');
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    const toolsBtn = document.getElementById('mbb-tools');
    const menuBtn = document.getElementById('mbb-menu');

    toolsSheet?.classList.remove('is-open');
    navSheet?.classList.remove('is-open');
    backdrop?.classList.remove('is-visible');

    toolsBtn?.setAttribute('aria-expanded', 'false');
    toolsBtn?.classList.remove('is-active');
    menuBtn?.setAttribute('aria-expanded', 'false');
    menuBtn?.classList.remove('is-active');

    if (resetActive) _activeSheet = null;
}

// Expose globally so Escape key handler can reach it
window.closeMobileSheets = closeMobileSheets;

// ─────────────────────────────────────────────────────────────

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

        // One-Time popup as advertisement for the beta footer
        localStorage.setItem(
            'beta_popup_shown',
            localStorage.getItem('beta_popup_shown') || 'false',
        );
        // If on prod footer, and at least 3 visits, and haven't shown the popup yet, show the popup
        if (
            (location.hostname === 'cubingtools.de' || location.port === '8001') &&
            parseInt(localStorage.getItem('visits') || '0', 10) >= 3 &&
            localStorage.getItem('beta_popup_shown') === 'false'
        ) {
            showUserFeedbackPopup({
                title: 'Try our beta footer!',
                message:
                    'Experience the latest features and improvements by trying out our beta footer. Click the button below to switch to the beta release.',
                variant: 'info',
                eyebrow: 'New features',
                primaryActionLabel: 'Try Beta',
                primaryActionHref: location.href.replace('cubingtools.de', 'beta.cubingtools.de'),
                primaryActionTarget: '_self',
                primaryActionRel: '',
                dismissLabel: 'No thanks',
                dedupeKey: 'beta-footer-promo',
            });
            localStorage.setItem('beta_popup_shown', 'true');
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

    setupNavbar();
    addFooterTag();
    await loadTools(); // wait so mobile bar has tools data
});

function addCookieConsentBanner() {
    const cookiesAccepted = localStorage.getItem('cookies_accepted');
    const message = !cookiesAccepted
        ? 'We use cookies to improve your experience. By accepting these cookies, you agree to our privacy policy. By using the site even without accepting, you agree to the <a href="/privacy?terms=latest" style="color: #ffd700;">terms and conditions</a>.'
        : 'Our privacy policies have changed. Please review and accept again.';

    const messageHtml = !cookiesAccepted
        ? 'We use cookies to improve your experience. By accepting these cookies, you agree to our <a href="/privacy" style="color: #ffd700;">privacy policy</a>. By using the site even without accepting, you agree to the <a href="/privacy?terms=latest" style="color: #ffd700;">terms and conditions</a>.'
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
    if (toolsContainer) toolsContainer.innerHTML = '';

    try {
        const tools = await window.fetchJsonOrThrow('/api/tools', {
            errorContext: 'Could not load tools',
        });

        if (Array.isArray(tools)) {
            _cachedTools = tools;

            // ── Desktop sidebar (unchanged) ───────────────────
            if (toolsContainer) {
                const featuredTools = tools.filter((tool) => tool.filename.includes('guildford'));
                const otherTools = tools.filter((tool) => !tool.filename.includes('guildford'));

                toolsContainer.innerHTML += '<h3 class="big-screen">Featured</h3>';
                featuredTools.forEach((tool) => {
                    const toolElement = document.createElement('a');
                    toolElement.className = 'tool-tag';
                    toolElement.href = `/tools/${tool.filename.replace('.html', '')}`;
                    toolElement.rel = 'noopener noreferrer';
                    toolElement.innerHTML = `<h3 class="tool-title">${tool.title}</h3>`;
                    toolsContainer.appendChild(toolElement);
                });

                toolsContainer.innerHTML += '<h3 class="big-screen">Tools</h3>';
                otherTools.forEach((tool) => {
                    const toolElement = document.createElement('a');
                    toolElement.className = 'tool-tag';
                    toolElement.href = `/tools/${tool.filename.replace('.html', '')}`;
                    toolElement.rel = 'noopener noreferrer';
                    toolElement.innerHTML = `<h3 class="tool-title">${tool.title}</h3>`;
                    toolsContainer.appendChild(toolElement);
                });
            }

            // ── Mobile bottom bar (only injected once) ────────
            if (!document.getElementById('mobile-bottom-bar')) {
                setupMobileBottomBar(tools);
            }
        } else {
            throw new Error('Unexpected tool list response.');
        }
    } catch (error) {
        console.error('Error loading tools:', error);
        if (toolsContainer) toolsContainer.innerHTML = '<h3>Tools unavailable</h3>';

        // Still inject the bottom bar even on error — nav + menu still work
        if (!document.getElementById('mobile-bottom-bar')) {
            setupMobileBottomBar([]);
        }

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

async function addFooterTag() {
    const bar = document.getElementById('footer');
    if (!bar) return;
    bar.innerHTML = '';

    // ── Top row ──────────────────────────────────────────
    const top = document.createElement('div');
    top.className = 'footer-tag__top';

    const versionLink = document.createElement('a');
    versionLink.className = 'footer-tag__version';
    versionLink.href = 'https://github.com/s-kling/cubingtools.de/releases/';
    versionLink.target = '_blank';
    versionLink.rel = 'noopener noreferrer';
    versionLink.textContent = 'Loading…';

    top.appendChild(versionLink);

    // ── Bottom row ────────────────────────────────────────
    const bottom = document.createElement('div');
    bottom.className = 'footer-tag__links';

    [{ label: 'Made by Sebastian Kling', href: '/contact' }].forEach(
        ({ label, href, external }) => {
            const a = document.createElement('a');
            a.textContent = label;
            a.href = href;
            if (external) {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            }
            bottom.appendChild(a);
        },
    );

    bar.appendChild(top);
    bar.appendChild(bottom);

    // ── Fetch version ─────────────────────────────────────
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        const version = data.version || 'unknown';
        versionLink.innerHTML = `${window.location.hostname}&nbsp;<span class="footer-tag__num">v${version}</span>`;
    } catch {
        versionLink.textContent = window.location.hostname;
    }
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

    // Hide desktop navbar menu when clicking outside
    document.addEventListener('click', (event) => {
        if (!navbar.contains(event.target) && !label.contains(event.target)) {
            hamburger.checked = false;
        }
    });

    // Swipe to hide desktop navbar
    let touchStartX = 0;
    let touchEndX = 0;

    document.addEventListener('touchstart', (event) => {
        touchStartX = event.changedTouches[0].screenX;
    });

    document.addEventListener('touchend', (event) => {
        touchEndX = event.changedTouches[0].screenX;
        if (touchEndX < touchStartX - 50) {
            hamburger.checked = false;
            // Also close mobile sheets on swipe-left
            closeMobileSheets?.();
        }
    });
}
