const RECAPTCHA_SITE_KEY = '6LcbEp8sAAAAAKlVITh_cHrU2TXrtshRLqQG03oC';
const RECAPTCHA_ACTION = 'contact_submit';

document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contact-form');
    const submitButton = contactForm?.querySelector('button[type="submit"]');

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
