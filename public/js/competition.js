document.addEventListener('DOMContentLoaded', function () {
    const openDate = new Date('2025-01-11T16:40:00Z');
    const userTimeZoneDate = new Date(
        openDate.toLocaleString('en-US', {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
    );
    const now = new Date();
    const timeDiff = userTimeZoneDate - now;

    document.getElementById('registration-open-date').textContent = userTimeZoneDate.toLocaleString(
        'en-GB',
        {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }
    );

    function updateCountdown() {
        const now = new Date();
        const timeDiff = userTimeZoneDate - now;
        let timeUntilOpen;

        if (timeDiff > 24 * 60 * 60 * 1000) {
            const daysUntilOpen = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            const hoursUntilOpen = Math.floor(
                (timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
            );
            timeUntilOpen = `${daysUntilOpen} days and ${hoursUntilOpen} hours from now`;
        } else if (timeDiff > 60 * 60 * 1000) {
            const hoursUntilOpen = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutesUntilOpen = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            timeUntilOpen = `${hoursUntilOpen} hours and ${minutesUntilOpen} minutes from now`;
        } else if (timeDiff > 60 * 1000) {
            const minutesUntilOpen = Math.floor(timeDiff / (1000 * 60));
            const secondsUntilOpen = Math.floor((timeDiff % (1000 * 60)) / 1000);
            timeUntilOpen = `${minutesUntilOpen} minutes and ${secondsUntilOpen} seconds from now`;
        } else {
            const secondsUntilOpen = Math.floor(timeDiff / 1000);
            timeUntilOpen = `${secondsUntilOpen} seconds from now`;
        }

        document.getElementById('time-until-open').textContent = `(${timeUntilOpen})`;

        if (timeDiff <= 0) {
            document.getElementById('registration-form').style.display = 'block';
            document.getElementById('countdown').style.display = 'none';
            if (countdownInterval) clearInterval(countdownInterval);
        }
    }

    updateCountdown();
    const countdownInterval = setInterval(updateCountdown, 1000);

    document.getElementById('time-until-open').textContent = `(${timeUntilOpen})`;

    if (timeDiff <= 0) {
        document.getElementById('registration-form').style.display = 'block';
        document.getElementById('countdown').style.display = 'none';
    }
});

const privacyPolicyCheckbox = document.getElementById('privacy-policy');
const cookiesAccepted = localStorage.getItem('cookies_accepted');

if (cookiesAccepted === 'true') {
    privacyPolicyCheckbox.checked = true;
    privacyPolicyCheckbox.parentElement.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function () {
    const eventCheckboxes = document.querySelectorAll('.event-checkbox');

    eventCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener('click', () => {
            checkbox.classList.toggle('checked');
            checkbox.classList.toggle('unchecked');

            if (checkbox.classList.contains('checked')) {
                checkbox.innerHTML = `<p>${checkbox.innerText} (Selected)</p>`;
            } else {
                checkbox.innerHTML = `<p>${checkbox.innerText.replace(' (Selected)', '')}</p>`;
            }
        });
    });
});

document.getElementById('registration-form').addEventListener('submit', async function (event) {
    event.preventDefault();

    if (!privacyPolicyCheckbox.checked) {
        event.preventDefault();
        document.getElementById('submission-message').textContent =
            'You must accept the privacy policy to register.';
        return;
    }
    localStorage.setItem('cookies_accepted', 'true');

    const fullName = document.getElementById('full-name').value;
    const email = document.getElementById('email').value;
    const wcaId = document.getElementById('wca-id').value;
    const events = Array.from(document.querySelectorAll('.event-checkbox.checked')).map(
        (el) => el.id
    );
    const competitionName = 'What Time Is It In Rüppurr 2025';

    if (events.length === 0) {
        document.getElementById('submission-message').textContent =
            'Please select at least one event.';
        return;
    }

    const formData = {
        fullName,
        email,
        wcaId,
        events,
        competitionName,
    };

    const response = await fetch('/submit-registration', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
    });

    if (response.ok) {
        document.getElementById('submission-message').textContent = 'Registration successful!';
        alert('Registration successful! Please check your email for a confirmation message.');
    } else {
        const result = await response.json();
        document.getElementById('submission-message').textContent = result.message;
    }
});
