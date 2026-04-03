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
