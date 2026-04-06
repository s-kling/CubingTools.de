const SESSION_KEY = 'admin-token';

const usernameInput = document.getElementById('admin-username');
const passwordInput = document.getElementById('admin-password');
const adminError = document.getElementById('admin-error');
const adminAuth = document.getElementById('admin-auth');
const adminChangePasswordSection = document.getElementById('admin-change-password');
const dashboard = document.getElementById('dashboard');

async function attemptLogin() {
    adminError.style.display = 'none';

    const username = usernameInput.value.trim();
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
    } catch {
        adminError.textContent = 'Invalid username or password';
        adminError.style.display = 'block';
    }
}

usernameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') passwordInput.focus();
});

passwordInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') await attemptLogin();
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
        role === 'admin'
            ? `<a href="/admin/users" class="admin-card">
                <h3>Users</h3>
                <p>Manage admin and operator accounts.</p>
            </a>`
            : '';

    dashboard.innerHTML = `
        <h2>Admin Dashboard</h2>
        <div class="admin-cards">
            <a href="/admin/status" class="admin-card">
                <h3>Server Status</h3>
                <p>Uptime, memory usage, and log statistics.</p>
            </a>
            <a href="/admin/messages" class="admin-card">
                <h3>Messages</h3>
                <p>View and manage user messages.</p>
            </a>
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

    const statusEl = document.createElement('span');
    statusEl.className = 'admin-color-status';

    colorInput.addEventListener('input', () => {
        applyUserColorStyles(colorBadge, colorInput.value);
    });

    colorInput.addEventListener('change', async () => {
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

    label.append(colorBadge, colorInput, statusEl);
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
        if (!assigned.length) return;

        const notifSection = document.createElement('section');
        notifSection.className = 'admin-notifications card';

        const heading = document.createElement('h3');
        heading.textContent = `Assigned to you (${assigned.length})`;
        notifSection.appendChild(heading);

        assigned.forEach((msg) => {
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
