const RECAPTCHA_SITE_KEY = '6LcbEp8sAAAAAKlVITh_cHrU2TXrtshRLqQG03oC';
const RECAPTCHA_ACTION = 'contact_submit';
const contactForm = document.getElementById('contact-form');
const submitButton = contactForm?.querySelector('button[type="submit"]');
const messageField = document.getElementById('message');
const messageCounter = document.getElementById('message-counter');
let isAppeal = false;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');

    updateMessageCounter();
    messageField?.addEventListener('input', updateMessageCounter);

    if (window.location.pathname === '/contact/appeal') {
        isAppeal = true;
        handleAppealPage();
    } else {
        if (status === 'confirmed') {
            window.showUserFeedbackPopup({
                variant: 'success',
                eyebrow: 'Message confirmed',
                title: 'Message confirmed',
                message:
                    'Thank you for confirming your message. We will get back to you as soon as possible.',
            });
        } else if (status === 'invalid') {
            window.showUserErrorPopup({
                title: 'Invalid confirmation link',
                messageHtml:
                    'The confirmation link is invalid or has already been used. If you believe this is a mistake, please contact us directly at <a href="mailto:info@cubingtools.de">info@cubingtools.de</a>.',
            });
        }

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
    }
});

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

document.getElementById('contact-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.originalLabel = submitButton.textContent || 'Submit';
        submitButton.textContent = 'Sending...';
    }

    try {
        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());

        await new Promise((resolve) => grecaptcha.enterprise.ready(resolve));
        const token = await grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, {
            action: RECAPTCHA_ACTION,
        });

        data['g-recaptcha-response'] = token;
        data['isAppeal'] = isAppeal;

        if (localStorage.getItem('cookies_accepted') !== 'false') {
            data['visits'] = Number.parseInt(localStorage.getItem('visits') || '0', 10);
        }

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
        if (!isAppeal) {
            window.showUserFeedbackPopup({
                variant: 'success',
                eyebrow: 'Message sent',
                title: 'Check your inbox',
                message: `We sent a confirmation email to ${data.email}. Please confirm your message there so we can reply.`,
                dedupeKey: `contact-submit-success:${data.email}`,
            });
        } else {
            window.showUserFeedbackPopup({
                variant: 'success',
                eyebrow: 'Appeal submitted',
                title: 'Ban appeal submitted',
                message: `Your ban appeal has been submitted. We will review your case and get back to you as soon as possible.`,
                dedupeKey: `appeal-submit-success:${data.email}`,
            });
        }
    } catch (error) {
        console.error('Error submitting contact form:', error);
        // 403 Error code -> banned User
        const link = `${window.location.origin}/contact/appeal`;
        if (error?.status === 403) {
            window.showUserFeedbackPopup({
                title: 'Message blocked',
                messageHtml: `Your Email or IP address has been blacklisted. If you wish to appeal this decision, please refer to <a href="${link}">this page</a> for more information.`,
            });
        } else if (error?.status === 409 && isAppeal) {
            window.showUserFeedbackPopup({
                title: 'Appeal already pending',
                message:
                    'An appeal for this ban is already pending review. Please wait for our response.',
                dedupeKey: 'appeal-pending',
            });
        } else {
            window.showUserErrorPopup({
                title: 'Failed to send message',
                message: 'There was an error sending your message. Please try again later.',
                error,
                reportTitle: 'Contact form submission failed',
                reportContext:
                    'An error occurred while submitting the contact form to /api/contact.',
                dedupeKey: 'contact-submit',
            });
        }
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = submitButton.dataset.originalLabel || 'Submit';
        }
    }
});

function handleAppealPage() {
    // Replace the form with an appeal form
    const title = document.getElementById('title');
    title.textContent = 'Ban Appeal';

    const toolsDropdown = document.getElementById('tool');
    const toolsLabel = document.querySelector('label[for="tool"]');

    if (toolsDropdown && toolsLabel) {
        toolsDropdown.remove();
        toolsLabel.remove();
    }

    const reasonField = document.getElementById('message');
    if (reasonField) {
        const reason = new URLSearchParams(window.location.search).get('reason');

        reasonField.placeholder =
            'Please explain why you believe the ban was a mistake, and we will review your case.';

        if (reason && !reasonField.value) {
            reasonField.value = `Ban reason context: ${reason}\n\nMy appeal:`;
        }
    }
}
