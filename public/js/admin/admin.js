const SESSION_KEY = 'admin-token';

const usernameInput = document.getElementById('admin-username');
const passwordInput = document.getElementById('admin-password');
const adminError = document.getElementById('admin-error');
const adminAuth = document.getElementById('admin-auth');
const adminChangePasswordSection = document.getElementById('admin-change-password');
const dashboard = document.getElementById('dashboard');

function formatTimeAgo(date) {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 2) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
}

async function attemptLogin() {
    adminError.style.display = 'none';

    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim();
    if (!username || !password) return;

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) throw new Error('Invalid credentials');

        const { token, requiresPasswordChange } = await response.json();
        sessionStorage.setItem(SESSION_KEY, token);
        passwordInput.value = '';

        if (requiresPasswordChange) {
            showChangePasswordForm();
            return;
        }

        // If there is a redirect URL (i.e. ?then=status), navigate there instead of showing the dashboard
        const { then } = Object.fromEntries(new URLSearchParams(window.location.search));
        if (then) {
            window.location.href = `/admin/${then}`;
            return;
        }

        const verifyRes = await fetch('/api/admin/verify', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const verifyData = verifyRes.ok ? await verifyRes.json() : {};
        showDashboard(verifyData.role, verifyData.username, verifyData.color);
    } catch (err) {
        adminError.textContent = 'Invalid username or password';
        adminError.style.display = 'block';
        showUserErrorPopup({
            title: 'Login failed',
            message: 'Please check your username and password and try again.',
            error: err,
        });
    }
}

usernameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') passwordInput.focus();
});

passwordInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') await attemptLogin();
});

document.getElementById('admin-login-btn').addEventListener('click', async () => {
    await attemptLogin();
});

function showChangePasswordForm() {
    adminAuth.style.display = 'none';
    adminChangePasswordSection.style.display = 'block';
    dashboard.style.display = 'none';

    const newPasswordInput = document.getElementById('admin-new-password');
    const confirmPasswordInput = document.getElementById('admin-confirm-password');
    const changeBtn = document.getElementById('admin-change-password-btn');
    const changeError = document.getElementById('admin-change-error');

    changeBtn.addEventListener('click', async () => {
        changeError.style.display = 'none';
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword.length < 8) {
            changeError.textContent = 'Password must be at least 8 characters.';
            changeError.style.display = 'block';
            return;
        }

        if (newPassword !== confirmPassword) {
            changeError.textContent = 'Passwords do not match.';
            changeError.style.display = 'block';
            return;
        }

        try {
            const token = sessionStorage.getItem(SESSION_KEY);
            const response = await fetch('/api/admin/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ newPassword }),
            });

            if (!response.ok) throw new Error('Failed to change password');

            adminChangePasswordSection.style.display = 'none';

            const { then } = Object.fromEntries(new URLSearchParams(window.location.search));
            if (then) {
                window.location.href = `/admin/${then}`;
                return;
            }

            // Re-verify to get the role after password change
            try {
                const verifyRes = await fetch('/api/admin/verify', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const verifyData = verifyRes.ok ? await verifyRes.json() : {};
                showDashboard(verifyData.role, verifyData.username, verifyData.color);
            } catch {
                showDashboard();
            }
        } catch {
            changeError.textContent = 'Failed to change password. Please try again.';
            changeError.style.display = 'block';
        }
    });
}

function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    adminAuth.style.display = 'block';
    adminChangePasswordSection.style.display = 'none';
    dashboard.style.display = 'none';
    usernameInput.value = '';
    passwordInput.value = '';
    adminError.style.display = 'none';
}

function showDashboard(role, username, color) {
    adminAuth.style.display = 'none';
    adminChangePasswordSection.style.display = 'none';
    dashboard.style.display = 'block';

    const usersCard =
        role === 'admin' || role === 'operator'
            ? `<a href="/admin/users" class="admin-card">
                <h3>Users</h3>
                <p>${role === 'admin' ? 'Manage admin and operator accounts.' : 'View admin and operator accounts.'}</p>
            </a>`
            : '';

    const messagesCard =
        role !== 'tester'
            ? `<a href="/admin/messages" class="admin-card">
                <h3>Messages</h3>
                <p>View and manage user messages.</p>
            </a>`
            : '';

    dashboard.innerHTML = `
        <h2>Admin Dashboard</h2>
        <div class="admin-cards">
            <a href="/admin/status" class="admin-card">
                <h3>Server Status</h3>
                <p>Uptime, memory usage, and log statistics.</p>
            </a>
            ${messagesCard}
            <a href="/admin/dev-todo" class="admin-card">
                <h3>Developer Todo</h3>
                <p>Track development tasks and project progress.</p>
            </a>
            ${usersCard}
        </div>
    `;

    // Remove any existing admin subnav before re-rendering
    document.querySelector('.admin-subnav')?.remove();
    initAdminNav(role, 'dashboard', username, color);

    if (username) {
        appendColorPicker(role, username, color);
        loadAssignedNotifications(username);
    }

    if (role === 'admin') appendErrorThresholdSlider();

    if (role) loadPeriodicTasks(role, username);
    const _dashToken = sessionStorage.getItem(SESSION_KEY);
    if (_dashToken) loadDashboardBadges(_dashToken);
}

function appendColorPicker(role, username, currentColor) {
    const token = sessionStorage.getItem(SESSION_KEY);
    const section = document.createElement('section');
    section.className = 'admin-color-section card';

    const label = document.createElement('label');
    label.className = 'admin-color-label';
    label.textContent = 'Your color';

    const colorBadge = document.createElement('span');
    colorBadge.className = 'admin-subnav__user';
    colorBadge.textContent = username;
    if (currentColor) applyUserColorStyles(colorBadge, currentColor);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = currentColor || '#888888';
    colorInput.className = 'users-color-input';
    colorInput.title = 'Change your color';

    const colorInputButton = document.createElement('button');
    colorInputButton.type = 'button';
    colorInputButton.id = 'colorInputButton';
    colorInputButton.textContent = 'Save';
    colorInputButton.className = 'admin-color-save-btn';

    const statusEl = document.createElement('span');
    statusEl.className = 'admin-color-status';

    colorInput.addEventListener('input', () => {
        applyUserColorStyles(colorBadge, colorInput.value);
    });

    colorInputButton.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/admin/users/me/color', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ color: colorInput.value }),
            });
            const data = await res.json();
            if (!res.ok) {
                statusEl.textContent = data.error || 'Failed to update color.';
                return;
            }
            statusEl.textContent = 'Saved.';
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);
            document.querySelector('.admin-subnav')?.remove();
            initAdminNav(role, 'dashboard', username, colorInput.value);
        } catch {
            statusEl.textContent = 'Failed to update color.';
        }
    });

    label.append(colorBadge, colorInput, colorInputButton, statusEl);
    section.appendChild(label);
    dashboard.appendChild(section);
}

async function appendErrorThresholdSlider() {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) return;

    let currentThreshold = 1;
    try {
        const res = await fetch('/api/admin/config/error-rate-threshold', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const data = await res.json();
            currentThreshold = data.threshold ?? 1;
        }
    } catch {}

    const section = document.createElement('section');
    section.className = 'admin-color-section card';

    const label = document.createElement('label');
    label.className = 'admin-color-label';
    label.textContent = 'Error rate threshold';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '25';
    slider.step = '0.5';
    slider.value = String(currentThreshold);
    slider.className = 'admin-threshold-slider';
    slider.title = 'Error rate alert threshold (%)';

    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = '0';
    numberInput.max = '25';
    numberInput.step = '0.5';
    numberInput.value = String(currentThreshold);
    numberInput.className = 'admin-threshold-number';
    numberInput.title = 'Error rate alert threshold (%)';

    const percentLabel = document.createElement('span');
    percentLabel.className = 'admin-threshold-value';
    percentLabel.textContent = '%';

    const statusEl = document.createElement('span');
    statusEl.className = 'admin-color-status';

    function syncAndSave(value) {
        const clamped = Math.min(25, Math.max(0, parseFloat(value) || 0));
        slider.value = String(clamped);
        numberInput.value = String(clamped);

        clearTimeout(syncAndSave._timeout);
        syncAndSave._timeout = setTimeout(async () => {
            statusEl.textContent = 'Saving…';
            try {
                const res = await fetch('/api/admin/config/error-rate-threshold', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ threshold: clamped }),
                });
                if (!res.ok) throw new Error();
                statusEl.textContent = 'Saved.';
                setTimeout(() => {
                    statusEl.textContent = '';
                }, 2000);
            } catch {
                statusEl.textContent = 'Failed to save.';
            }
        }, 300);
    }

    slider.addEventListener('input', () => {
        numberInput.value = slider.value;
    });
    slider.addEventListener('change', () => syncAndSave(slider.value));

    numberInput.addEventListener('input', () => {
        slider.value = numberInput.value;
    });
    numberInput.addEventListener('change', () => syncAndSave(numberInput.value));

    label.append(slider, numberInput, percentLabel, statusEl);
    section.appendChild(label);
    dashboard.appendChild(section);
}

async function loadAssignedNotifications(username) {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) return;

    try {
        const res = await fetch('/api/admin/messages', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        const assigned = (Array.isArray(data.messages) ? data.messages : []).filter(
            (m) => m.assignedTo === username,
        );

        // Filter out messages with status done
        const filteredAssigned = assigned.filter((m) => m.status !== 'done');

        if (!filteredAssigned.length) return;

        const notifSection = document.createElement('section');
        notifSection.className = 'admin-notifications card';

        const heading = document.createElement('h3');
        heading.textContent = `Assigned to you (${filteredAssigned.length})`;
        notifSection.appendChild(heading);

        filteredAssigned.forEach((msg) => {
            const card = document.createElement('div');
            card.className = 'admin-notification-card';

            const name = document.createElement('strong');
            name.textContent = msg.name || 'N/A';

            const tool = document.createElement('span');
            tool.className = 'admin-notification-tool';
            tool.textContent = `${msg.tool?.toUpperCase() || 'Other'}`;

            const preview = document.createElement('p');
            preview.textContent = String(msg.message || '');

            card.append(tool, name, preview);

            if (msg.email) {
                const replyLink = document.createElement('a');
                replyLink.href = `mailto:${msg.email}`;
                replyLink.className = 'admin-reply-link';
                replyLink.textContent = `Reply to ${msg.email}`;
                card.appendChild(replyLink);
            }

            notifSection.appendChild(card);
        });

        dashboard.appendChild(notifSection);
    } catch {}
}

function setCardBadge(pageId, value) {
    const card = document.querySelector(`.admin-card[href="/admin/${pageId}"]`);
    if (!card) return;
    card.querySelector('.admin-badge')?.remove();
    if (!value && value !== 0) return;
    const badge = document.createElement('span');
    badge.className = 'admin-badge admin-badge--card';
    badge.setAttribute('aria-label', `${value} pending`);
    badge.textContent = typeof value === 'number' && value > 99 ? '99+' : String(value);
    card.appendChild(badge);
}

async function loadPeriodicTasks(role, username) {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) return;

    let tasks = [];
    let completions = {};

    try {
        const [tasksRes, completionsRes] = await Promise.all([
            fetch('/api/admin/tasks', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/admin/tasks/completions', {
                headers: { Authorization: `Bearer ${token}` },
            }),
        ]);
        if (tasksRes.ok) tasks = (await tasksRes.json()).tasks || [];
        if (completionsRes.ok) completions = (await completionsRes.json()).completions || {};
    } catch {
        return;
    }

    const relevant = tasks.filter(
        (t) => (t.role === 'both' || t.role === role) && t.applicable !== false && isDue(t),
    );
    if (!relevant.length) return;

    function isDue(task) {
        const history = completions[task.id];
        if (!Array.isArray(history) || !history.length) return true;
        const diffDays = (Date.now() - new Date(history[0].completedAt).getTime()) / 86_400_000;
        if (task.frequency === 'daily') return diffDays >= 1;
        if (task.frequency === 'weekly') return diffDays >= 7;
        if (task.frequency === 'monthly') return diffDays >= 30;
        return true;
    }

    const dueTasks = relevant.filter(isDue);
    document.querySelector('.admin-tasks')?.remove();

    const section = document.createElement('section');
    section.className = 'admin-tasks card';

    const header = document.createElement('div');
    header.className = 'admin-tasks__header';

    const heading = document.createElement('h3');
    heading.className = 'admin-tasks__title';
    heading.textContent = 'Periodic Tasks';
    header.appendChild(heading);

    if (relevant.length > 0) {
        const badge = document.createElement('span');
        badge.className = 'admin-badge';
        badge.textContent = String(relevant.length);
        badge.setAttribute('aria-label', `${relevant.length} tasks due`);
        header.appendChild(badge);
    }

    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'admin-task-list';

    const sorted = [...relevant].sort((a, b) => Number(!isDue(a)) - Number(!isDue(b)));

    sorted.forEach((task) => {
        const due = isDue(task);
        const history = completions[task.id];
        const latest = Array.isArray(history) && history.length ? history[0] : null;

        const card = document.createElement('div');
        card.className = `admin-task-card${due ? ' admin-task-card--due' : ' admin-task-card--done'}`;

        const body = document.createElement('div');
        body.className = 'admin-task-card__body';

        const title = document.createElement('div');
        title.className = 'admin-task-card__title';
        title.textContent = task.title;

        const desc = document.createElement('p');
        desc.className = 'admin-task-card__desc';
        desc.textContent = task.description;

        const tags = document.createElement('div');
        tags.className = 'admin-task-card__tags';

        const freqTag = document.createElement('span');
        freqTag.className = `admin-task-tag admin-task-tag--${task.frequency}`;
        freqTag.textContent = task.frequency;

        const catTag = document.createElement('span');
        catTag.className = 'admin-task-tag';
        catTag.textContent = task.category;

        const roleMap = { admin: 'Admin', operator: 'Operator', both: 'All' };
        const roleTag = document.createElement('span');
        roleTag.className = 'admin-task-tag';
        roleTag.textContent = roleMap[task.role] || task.role;

        tags.append(freqTag, catTag, roleTag);
        body.append(title, desc, tags);

        const action = document.createElement('button');
        action.type = 'button';

        if (!due && latest) {
            action.className = 'admin-task-card__action admin-task-card__action--done';
            action.textContent = `Done ${formatTimeAgo(new Date(latest.completedAt))} by ${latest.username}`;
            action.disabled = true;
        } else {
            action.className = 'admin-task-card__action';
            action.textContent = 'Mark done';
            action.addEventListener('click', async () => {
                action.disabled = true;
                action.textContent = 'Saving…';
                try {
                    const res = await fetch(
                        `/api/admin/tasks/${encodeURIComponent(task.id)}/complete`,
                        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
                    );
                    if (res.ok) await loadPeriodicTasks(role, username);
                } catch {
                    action.disabled = false;
                    action.textContent = 'Mark done';
                }
            });
        }

        card.append(body, action);
        list.appendChild(card);
    });

    section.appendChild(list);
    dashboard.appendChild(section);
}

async function loadDashboardBadges(token) {
    // Messages card: badge with count of non-done messages
    try {
        const res = await fetch('/api/admin/messages', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const data = await res.json();
            const pending = (Array.isArray(data.messages) ? data.messages : []).filter(
                (m) => m.status !== 'done',
            ).length;
            if (pending > 0) setCardBadge('messages', pending);
        }
    } catch {}

    // Status card: flag elevated error rate
    try {
        const [statusRes, threshRes] = await Promise.all([
            fetch('/api/admin/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({}),
            }),
            fetch('/api/admin/config/error-rate-threshold', {
                headers: { Authorization: `Bearer ${token}` },
            }),
        ]);
        let threshold = 1;
        if (threshRes.ok) {
            const td = await threshRes.json();
            threshold = td.threshold ?? 1;
        }
        if (statusRes.ok) {
            const data = await statusRes.json();
            const errorRate = parseFloat(data.logs?.errorRate) || 0;
            if (errorRate > threshold) setCardBadge('status', '!');
        }
    } catch {}
}

document.addEventListener('DOMContentLoaded', async () => {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) return;

    try {
        const response = await fetch('/api/admin/verify', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;

        const data = await response.json();
        if (data.requiresPasswordChange) {
            showChangePasswordForm();
            return;
        }

        showDashboard(data.role, data.username, data.color);
    } catch {
        // Not authenticated — show login form
    }
});
