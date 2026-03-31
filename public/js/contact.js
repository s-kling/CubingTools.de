const RECAPTCHA_SITE_KEY = '6LcbEp8sAAAAAKlVITh_cHrU2TXrtshRLqQG03oC';
const RECAPTCHA_ACTION = 'contact_submit';

document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contact-form');
    const submitButton = contactForm?.querySelector('button[type="submit"]');
    const messageField = document.getElementById('message');
    const messageCounter = document.getElementById('message-counter');

    const { status } = new URLSearchParams(window.location.search);
    if (status === 'confirmed') {
        window.showUserErrorPopup({
            title: 'Message confirmed',
            message:
                'Thank you for confirming your message. We will get back to you as soon as possible.',
        });
    } else if (status === 'invalid') {
        window.showUserErrorPopup({
            title: 'Invalid confirmation link',
            message:
                'The confirmation link is invalid or has already been used. If you believe this is a mistake, please contact us directly at <a href="mailto:info@cubingtools.de">info@cubingtools.de</a>.',
        });
    }

    const updateMessageCounter = () => {
        if (!messageField || !messageCounter) {
            return;
        }

        const maxLength = Number.parseInt(messageField.getAttribute('maxlength') || '0', 10);

        if (!maxLength) {
            messageCounter.textContent = '';
            return;
        }

        const remainingCharacters = Math.max(0, maxLength - messageField.value.length);
        messageCounter.textContent = remainingCharacters;
        // Change color from green to red as the user types more characters
        const percentageUsed = (maxLength - remainingCharacters) / maxLength;
        const hue = 120 * (1 - percentageUsed);
        messageCounter.style.color = `hsl(${hue}, 80%, 50%)`;
    };

    updateMessageCounter();
    messageField?.addEventListener('input', updateMessageCounter);

    window
        .fetchJsonOrThrow('/api/tools', {
            errorContext: 'Could not load contact form tools',
        })
        .then((tools) => {
            if (!Array.isArray(tools)) {
                throw new Error('Unexpected tool list response.');
            }

            const toolSelect = document.getElementById('tool');
            tools.forEach((tool) => {
                const option = document.createElement('option');
                option.value = tool.filename;
                option.textContent = tool.title;
                toolSelect.appendChild(option);
            });
        })
        .catch((error) => {
            console.error('Error fetching tools:', error);
            window.showUserErrorPopup({
                title: 'Could not load contact form options',
                message: 'The tool dropdown on the contact page could not be loaded.',
                error,
                reportTitle: 'Contact page tool list failed to load',
                reportContext:
                    'The contact page could not populate the tool selector from /api/tools.',
                dedupeKey: 'contact-tools',
            });
        });

    if (!contactForm) {
        return;
    }

    contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            await new Promise((resolve) => grecaptcha.enterprise.ready(resolve));
            const token = await grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, {
                action: RECAPTCHA_ACTION,
            });

            data['g-recaptcha-response'] = token;

            await window.fetchJsonOrThrow('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                errorContext: 'Failed to submit contact form',
            });

            contactForm.reset();
            updateMessageCounter();
        } catch (error) {
            console.error('Error submitting contact form:', error);
            window.showUserErrorPopup({
                title: 'Failed to send message',
                message: 'There was an error sending your message. Please try again later.',
                error,
                reportTitle: 'Contact form submission failed',
                reportContext:
                    'An error occurred while submitting the contact form to /api/contact.',
                dedupeKey: 'contact-submit',
            });
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });
});
