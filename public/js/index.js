const carouselElement = document.getElementById('tools-carousel');

const TOOL_CARD_CONTENT = {
    guildford: {},
    grouping: {
        title: 'Groupifier',
    },
    average: {
        title: 'WCA Average Calculator',
    },
    globalCalc: {},
};

const TOOL_DISPLAY_ORDER = ['guildford', 'grouping', 'average', 'globalCalc'];

function pickRandom(array, count) {
    return [...array].sort(() => Math.random() - 0.5).slice(0, count);
}

function humanizeToolSlug(slug) {
    return slug
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sortTools(tools) {
    return [...tools].sort((leftTool, rightTool) => {
        const leftOrder = TOOL_DISPLAY_ORDER.indexOf(leftTool.filename);
        const rightOrder = TOOL_DISPLAY_ORDER.indexOf(rightTool.filename);

        if (leftOrder !== -1 || rightOrder !== -1) {
            if (leftOrder === -1) {
                return 1;
            }

            if (rightOrder === -1) {
                return -1;
            }

            return leftOrder - rightOrder;
        }

        return leftTool.title.localeCompare(rightTool.title);
    });
}

function createToolSlide(tool) {
    const slug = typeof tool.filename === 'string' ? tool.filename.trim() : '';
    const overrides = TOOL_CARD_CONTENT[slug] || {};
    const title = overrides.title || tool.title || humanizeToolSlug(slug) || 'Cubing Tool';
    const summary =
        tool.description || 'Open this tool to start working with the latest cubing workflows.';
    const sideText =
        tool.slogan || tool.description || 'Open the tool and jump straight into the workflow.';
    const article = document.createElement('article');
    article.className = 'tool-slide';
    article.dataset.toolName = title;
    article._keywords = Array.isArray(tool.keywords) ? tool.keywords : [];

    const copy = document.createElement('div');
    copy.className = 'tool-slide-copy';

    const heading = document.createElement('h3');
    heading.textContent = title;
    copy.appendChild(heading);

    const description = document.createElement('p');
    description.textContent = summary;
    copy.appendChild(description);

    const pillList = document.createElement('ul');
    pillList.className = 'tool-pill-list';
    copy.appendChild(pillList);

    const side = document.createElement('div');
    side.className = 'tool-slide-side';

    const sideDescription = document.createElement('p');
    sideDescription.textContent = sideText;
    side.appendChild(sideDescription);

    const action = document.createElement('a');
    action.href = `/tools/${slug}`;
    action.textContent = 'Open tool';
    side.appendChild(action);

    article.appendChild(copy);
    article.appendChild(side);

    return article;
}

if (carouselElement) {
    const track = carouselElement.querySelector('.tools-carousel-track');
    const dotsContainer = carouselElement.querySelector('.carousel-dots');
    const prevButton = carouselElement.querySelector('[data-carousel-prev]');
    const nextButton = carouselElement.querySelector('[data-carousel-next]');

    let slides = [];
    let activeSlide = 0;
    let autoRotateTimer = null;

    function stopAutoRotate() {
        if (autoRotateTimer) {
            clearInterval(autoRotateTimer);
            autoRotateTimer = null;
        }
    }

    function updateControlsVisibility() {
        const hasMultipleSlides = slides.length > 1;

        if (prevButton) {
            prevButton.hidden = !hasMultipleSlides;
        }

        if (nextButton) {
            nextButton.hidden = !hasMultipleSlides;
        }

        if (dotsContainer) {
            dotsContainer.hidden = !hasMultipleSlides;
        }
    }

    function restartAutoRotate() {
        stopAutoRotate();

        if (slides.length <= 1) {
            return;
        }

        autoRotateTimer = setInterval(() => {
            goToSlide(activeSlide + 1);
        }, 8000);
    }

    function syncCarousel() {
        if (!track || !slides.length) {
            return;
        }

        track.style.transform = `translateX(-${activeSlide * 100}%)`;

        const dots = Array.from(carouselElement.querySelectorAll('.carousel-dot'));
        dots.forEach((dot, index) => {
            const isActive = index === activeSlide;
            dot.classList.toggle('is-active', isActive);
            dot.setAttribute('aria-current', isActive ? 'true' : 'false');
        });

        const activeSlideEl = slides[activeSlide];
        const pillList = activeSlideEl?.querySelector('.tool-pill-list');
        if (pillList && activeSlideEl._keywords) {
            const picked = pickRandom(activeSlideEl._keywords, 3);
            pillList.innerHTML = '';
            picked.forEach((keyword) => {
                const listItem = document.createElement('li');
                listItem.textContent = keyword;
                pillList.appendChild(listItem);
            });
        }
    }

    function goToSlide(newIndex) {
        if (!slides.length) {
            return;
        }

        if (newIndex < 0) {
            activeSlide = slides.length - 1;
        } else {
            activeSlide = newIndex % slides.length;
        }

        syncCarousel();
    }

    function createDots() {
        if (!dotsContainer) {
            return;
        }

        dotsContainer.innerHTML = '';

        slides.forEach((slide, index) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'carousel-dot';
            dot.setAttribute('aria-label', `Show ${slide.dataset.toolName || 'tool'} slide`);
            dot.addEventListener('click', () => {
                goToSlide(index);
                restartAutoRotate();
            });
            dotsContainer.appendChild(dot);
        });
    }

    function renderStatus(title, message, isError = false) {
        if (!track) {
            return;
        }

        stopAutoRotate();
        activeSlide = 0;
        track.style.transform = 'translateX(0)';
        track.innerHTML = '';

        const article = document.createElement('article');
        article.className = `tool-slide tool-slide--status${isError ? ' tool-slide--error' : ''}`;
        article.dataset.toolName = title;

        const copy = document.createElement('div');
        copy.className = 'tool-slide-status-copy';

        const heading = document.createElement('h3');
        heading.textContent = title;
        copy.appendChild(heading);

        const description = document.createElement('p');
        description.textContent = message;
        copy.appendChild(description);

        article.appendChild(copy);
        track.appendChild(article);

        slides = [];

        if (dotsContainer) {
            dotsContainer.innerHTML = '';
        }

        updateControlsVisibility();
    }

    function renderSlides(tools) {
        if (!track) {
            return;
        }

        track.innerHTML = '';
        tools.forEach((tool) => {
            track.appendChild(createToolSlide(tool));
        });

        slides = Array.from(track.querySelectorAll('.tool-slide'));
        activeSlide = 0;
        createDots();
        updateControlsVisibility();
        syncCarousel();
        restartAutoRotate();
    }

    prevButton?.addEventListener('click', () => {
        goToSlide(activeSlide - 1);
        restartAutoRotate();
    });

    nextButton?.addEventListener('click', () => {
        goToSlide(activeSlide + 1);
        restartAutoRotate();
    });

    carouselElement.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToSlide(activeSlide - 1);
            restartAutoRotate();
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToSlide(activeSlide + 1);
            restartAutoRotate();
        }
    });

    carouselElement.addEventListener('mouseenter', stopAutoRotate);
    carouselElement.addEventListener('mouseleave', restartAutoRotate);

    (async function initCarousel() {
        renderStatus('Loading tools', 'The homepage carousel is fetching the latest tool list.');

        try {
            const tools = await window.fetchJsonOrThrow('/api/tools', {
                errorContext: 'Could not load homepage tools',
            });

            if (!Array.isArray(tools)) {
                throw new Error('Unexpected tool list response.');
            }

            const availableTools = sortTools(
                tools.filter((tool) => typeof tool?.filename === 'string' && tool.filename.trim()),
            );

            if (!availableTools.length) {
                renderStatus(
                    'No tools available',
                    'The homepage carousel could not find any published tools.',
                );
                return;
            }

            renderSlides(availableTools);
        } catch (error) {
            console.error('Error loading homepage carousel:', error);
            renderStatus(
                'Tools unavailable',
                'The homepage carousel could not load the current tool list right now.',
                true,
            );

            window.showUserErrorPopup({
                title: 'Could not load the homepage carousel',
                message: 'The homepage tool carousel could not be loaded right now.',
                error,
                reportTitle: 'Homepage carousel failed to load',
                reportContext:
                    'The homepage tool carousel request to /api/tools failed while rendering the page.',
                dedupeKey: 'homepage-carousel-tools',
            });
        }
    })();
}

// ── Newsletter signup ──────────────────────────────────────────

const NEWSLETTER_COUNTRIES = [
    ['AF', 'Afghanistan'],
    ['AL', 'Albania'],
    ['DZ', 'Algeria'],
    ['AD', 'Andorra'],
    ['AO', 'Angola'],
    ['AG', 'Antigua and Barbuda'],
    ['AR', 'Argentina'],
    ['AM', 'Armenia'],
    ['AU', 'Australia'],
    ['AT', 'Austria'],
    ['AZ', 'Azerbaijan'],
    ['BS', 'Bahamas'],
    ['BH', 'Bahrain'],
    ['BD', 'Bangladesh'],
    ['BB', 'Barbados'],
    ['BY', 'Belarus'],
    ['BE', 'Belgium'],
    ['BZ', 'Belize'],
    ['BJ', 'Benin'],
    ['BT', 'Bhutan'],
    ['BO', 'Bolivia'],
    ['BA', 'Bosnia and Herzegovina'],
    ['BW', 'Botswana'],
    ['BR', 'Brazil'],
    ['BN', 'Brunei'],
    ['BG', 'Bulgaria'],
    ['BF', 'Burkina Faso'],
    ['BI', 'Burundi'],
    ['CV', 'Cabo Verde'],
    ['KH', 'Cambodia'],
    ['CM', 'Cameroon'],
    ['CA', 'Canada'],
    ['CF', 'Central African Republic'],
    ['TD', 'Chad'],
    ['CL', 'Chile'],
    ['CN', 'China'],
    ['TW', 'Chinese Taipei'],
    ['CO', 'Colombia'],
    ['KM', 'Comoros'],
    ['CG', 'Congo'],
    ['CR', 'Costa Rica'],
    ['HR', 'Croatia'],
    ['CU', 'Cuba'],
    ['CY', 'Cyprus'],
    ['CZ', 'Czech Republic'],
    ['CI', "Côte d'Ivoire"],
    ['KP', "Democratic People's Republic of Korea"],
    ['CD', 'Democratic Republic of the Congo'],
    ['DK', 'Denmark'],
    ['DJ', 'Djibouti'],
    ['DM', 'Dominica'],
    ['DO', 'Dominican Republic'],
    ['EC', 'Ecuador'],
    ['EG', 'Egypt'],
    ['SV', 'El Salvador'],
    ['GQ', 'Equatorial Guinea'],
    ['ER', 'Eritrea'],
    ['EE', 'Estonia'],
    ['SZ', 'Eswatini'],
    ['ET', 'Ethiopia'],
    ['FM', 'Federated States of Micronesia'],
    ['FJ', 'Fiji'],
    ['FI', 'Finland'],
    ['FR', 'France'],
    ['GA', 'Gabon'],
    ['GM', 'Gambia'],
    ['GE', 'Georgia'],
    ['DE', 'Germany'],
    ['GH', 'Ghana'],
    ['GR', 'Greece'],
    ['GD', 'Grenada'],
    ['GT', 'Guatemala'],
    ['GW', 'Guinea Bissau'],
    ['GN', 'Guinea'],
    ['GY', 'Guyana'],
    ['HT', 'Haiti'],
    ['HN', 'Honduras'],
    ['HK', 'Hong Kong, China'],
    ['HU', 'Hungary'],
    ['IS', 'Iceland'],
    ['IN', 'India'],
    ['ID', 'Indonesia'],
    ['IR', 'Iran'],
    ['IQ', 'Iraq'],
    ['IE', 'Ireland'],
    ['IL', 'Israel'],
    ['IT', 'Italy'],
    ['JM', 'Jamaica'],
    ['JP', 'Japan'],
    ['JO', 'Jordan'],
    ['KZ', 'Kazakhstan'],
    ['KE', 'Kenya'],
    ['KI', 'Kiribati'],
    ['XK', 'Kosovo'],
    ['KW', 'Kuwait'],
    ['KG', 'Kyrgyzstan'],
    ['LA', 'Laos'],
    ['LV', 'Latvia'],
    ['LB', 'Lebanon'],
    ['LS', 'Lesotho'],
    ['LR', 'Liberia'],
    ['LY', 'Libya'],
    ['LI', 'Liechtenstein'],
    ['LT', 'Lithuania'],
    ['LU', 'Luxembourg'],
    ['MO', 'Macau, China'],
    ['MG', 'Madagascar'],
    ['MW', 'Malawi'],
    ['MY', 'Malaysia'],
    ['MV', 'Maldives'],
    ['ML', 'Mali'],
    ['MT', 'Malta'],
    ['MH', 'Marshall Islands'],
    ['MR', 'Mauritania'],
    ['MU', 'Mauritius'],
    ['MX', 'Mexico'],
    ['MD', 'Moldova'],
    ['MC', 'Monaco'],
    ['MN', 'Mongolia'],
    ['ME', 'Montenegro'],
    ['MA', 'Morocco'],
    ['MZ', 'Mozambique'],
    ['MM', 'Myanmar'],
    ['NA', 'Namibia'],
    ['NR', 'Nauru'],
    ['NP', 'Nepal'],
    ['NL', 'Netherlands'],
    ['NZ', 'New Zealand'],
    ['NI', 'Nicaragua'],
    ['NE', 'Niger'],
    ['NG', 'Nigeria'],
    ['MK', 'North Macedonia'],
    ['NO', 'Norway'],
    ['OM', 'Oman'],
    ['PK', 'Pakistan'],
    ['PW', 'Palau'],
    ['PS', 'Palestine'],
    ['PA', 'Panama'],
    ['PG', 'Papua New Guinea'],
    ['PY', 'Paraguay'],
    ['PE', 'Peru'],
    ['PH', 'Philippines'],
    ['PL', 'Poland'],
    ['PT', 'Portugal'],
    ['QA', 'Qatar'],
    ['KR', 'Republic of Korea'],
    ['RO', 'Romania'],
    ['RU', 'Russia'],
    ['RW', 'Rwanda'],
    ['KN', 'Saint Kitts and Nevis'],
    ['LC', 'Saint Lucia'],
    ['VC', 'Saint Vincent and the Grenadines'],
    ['WS', 'Samoa'],
    ['SM', 'San Marino'],
    ['ST', 'São Tomé and Príncipe'],
    ['SA', 'Saudi Arabia'],
    ['SN', 'Senegal'],
    ['RS', 'Serbia'],
    ['SC', 'Seychelles'],
    ['SL', 'Sierra Leone'],
    ['SG', 'Singapore'],
    ['SK', 'Slovakia'],
    ['SI', 'Slovenia'],
    ['SB', 'Solomon Islands'],
    ['SO', 'Somalia'],
    ['ZA', 'South Africa'],
    ['SS', 'South Sudan'],
    ['ES', 'Spain'],
    ['LK', 'Sri Lanka'],
    ['SD', 'Sudan'],
    ['SR', 'Suriname'],
    ['SE', 'Sweden'],
    ['CH', 'Switzerland'],
    ['SY', 'Syria'],
    ['TJ', 'Tajikistan'],
    ['TZ', 'Tanzania'],
    ['TH', 'Thailand'],
    ['TL', 'Timor-Leste'],
    ['TG', 'Togo'],
    ['TO', 'Tonga'],
    ['TT', 'Trinidad and Tobago'],
    ['TN', 'Tunisia'],
    ['TR', 'Turkey'],
    ['TM', 'Turkmenistan'],
    ['TV', 'Tuvalu'],
    ['UG', 'Uganda'],
    ['UA', 'Ukraine'],
    ['AE', 'United Arab Emirates'],
    ['GB', 'United Kingdom'],
    ['US', 'United States'],
    ['UY', 'Uruguay'],
    ['UZ', 'Uzbekistan'],
    ['VA', 'Vatican City'],
    ['VU', 'Vanuatu'],
    ['VE', 'Venezuela'],
    ['VN', 'Vietnam'],
    ['YE', 'Yemen'],
    ['ZM', 'Zambia'],
    ['ZW', 'Zimbabwe'],
];

(function initNewsletterSection() {
    const form = document.getElementById('newsletter-form');
    const countrySelect = document.getElementById('newsletter-country');
    const emailInput = document.getElementById('newsletter-email');
    const submitBtn = document.getElementById('newsletter-submit');
    const statusEl = document.getElementById('newsletter-status');

    if (!form || !countrySelect) {
        return;
    }

    // Populate country dropdown
    NEWSLETTER_COUNTRIES.forEach(([code, name]) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        countrySelect.appendChild(option);
    });

    // Handle URL query params for feedback after redirect
    function handleNewsletterQueryParams() {
        const params = new URLSearchParams(window.location.search);
        const newsletterStatus = params.get('newsletter');
        const reminderStatus = params.get('reminder');

        const messages = {
            newsletter: {
                'confirmed': {
                    type: 'success',
                    text: 'Your subscription is confirmed. You will receive emails when new competitions are announced in your country.',
                },
                'already-confirmed': {
                    type: 'info',
                    text: 'This email address is already subscribed.',
                },
                'unsubscribed': {
                    type: 'success',
                    text: 'You have been unsubscribed and will no longer receive competition emails.',
                },
                'not-found': {
                    type: 'error',
                    text: 'Subscription not found. It may have already been removed.',
                },
                'invalid': { type: 'error', text: 'The link is invalid or has expired.' },
                'error': { type: 'error', text: 'Something went wrong. Please try again later.' },
            },
            reminder: {
                'set': {
                    type: 'success',
                    text: 'You will be reminded when registration opens for that competition.',
                },
                'already-set': {
                    type: 'info',
                    text: 'You already have a reminder set for this competition.',
                },
                'cancelled': {
                    type: 'success',
                    text: 'Your registration reminder has been cancelled.',
                },
                'not-found': {
                    type: 'error',
                    text: 'Reminder not found. It may have already been removed.',
                },
                'invalid': { type: 'error', text: 'The reminder link is invalid or has expired.' },
                'error': { type: 'error', text: 'Something went wrong. Please try again later.' },
            },
        };

        let msg = null;
        if (newsletterStatus && messages.newsletter[newsletterStatus]) {
            msg = messages.newsletter[newsletterStatus];
        } else if (reminderStatus && messages.reminder[reminderStatus]) {
            msg = messages.reminder[reminderStatus];
        }

        if (msg && statusEl) {
            showStatus(msg.text, msg.type);

            // Scroll to and briefly highlight the newsletter section
            const section = document.getElementById('newsletter');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Clean query params from URL without reloading
            const cleanUrl = window.location.pathname;
            window.history.replaceState(null, '', cleanUrl);
        }
    }

    function showStatus(text, type = 'info') {
        if (!statusEl) {
            return;
        }
        statusEl.textContent = text;
        statusEl.className = `newsletter-notice newsletter-notice--${type}`;
        statusEl.hidden = false;
    }

    function hideStatus() {
        if (!statusEl) {
            return;
        }
        statusEl.hidden = true;
        statusEl.textContent = '';
        statusEl.className = 'newsletter-notice';
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideStatus();

        const email = emailInput ? emailInput.value.trim() : '';
        const country = countrySelect.value;

        if (!country) {
            showStatus('Please select a country.', 'error');
            countrySelect.focus();
            return;
        }

        if (!email) {
            showStatus('Please enter your email address.', 'error');
            emailInput && emailInput.focus();
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Subscribing…';
        }

        try {
            await window.fetchJsonOrThrow('/api/newsletter/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, country }),
                errorContext: 'Newsletter subscription failed',
            });

            showStatus(
                'Almost done! Check your inbox and click the confirmation link to activate your subscription.',
                'success',
            );
            form.reset();
        } catch (error) {
            const msg =
                error?.payload?.error ||
                error?.message ||
                'Subscription failed. Please try again later.';
            showStatus(msg, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Subscribe';
            }
        }
    });

    handleNewsletterQueryParams();
})();
