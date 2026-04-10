const SESSION_KEY = 'admin-token';

const state = {
    token: null,
    role: null,
    users: [],
    currentUsername: null,
    currentColor: null,
};

document.addEventListener('DOMContentLoaded', async () => {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) {
        redirectToLogin();
        return;
    }

    try {
        const verify = await fetch('/api/admin/verify', {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!verify.ok) {
            redirectToLogin();
            return;
        }

        const data = await verify.json();

        if (data.role !== 'admin' && data.role !== 'operator') {
            document.getElementById('users-loading').textContent =
                'Access denied. Operator or admin role required.';
            return;
        }

        state.token = token;
        state.currentUsername = data.username;
        state.currentColor = data.color || null;
        state.role = data.role;
        initAdminNav(data.role, 'users', data.username, data.color);
        buildDashboard();
        await loadUsers();
    } catch {
        redirectToLogin();
    }
});

function redirectToLogin() {
    window.location.href = '/admin?then=users';
}

function buildDashboard() {
    const dashboard = document.getElementById('users-dashboard');
    const isAdmin = state.role === 'admin';
    dashboard.innerHTML = `
        <div class="users-dashboard">
            ${
                isAdmin
                    ? `<section class="users-controls card">
                <p id="users-status" class="users-status" aria-live="polite"></p>
                <form id="users-add-form" class="users-add-form">
                    <label>
                        Username
                        <input id="users-new-username" type="text" placeholder="e.g. johndoe" required autocomplete="off" />
                    </label>
                    <label>
                        Role
                        <select id="users-new-role">
                            <option value="operator">Operator</option>
                            <option value="tester">Tester</option>
                            <option value="admin">Admin</option>
                        </select>
                    </label>
                    <button type="submit">Add User</button>
                </form>
            </section>`
                    : `<section class="users-controls card">
                <p id="users-status" class="users-status" aria-live="polite"></p>
            </section>`
            }

            <section class="users-table-wrap card">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Color</th>
                            <th>Role</th>
                            <th>First Login</th>
                            <th>Last Login</th>
                            ${isAdmin ? '<th>Actions</th>' : ''}
                        </tr>
                    </thead>
                    <tbody id="users-tbody"></tbody>
                </table>
            </section>
        </div>
    `;

    if (isAdmin) {
        document.getElementById('users-add-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = document.getElementById('users-new-username').value.trim();
            const role = document.getElementById('users-new-role').value;
            if (!username) return;
            await addUser(username, role);
            document.getElementById('users-new-username').value = '';
        });
    }

    document.getElementById('users-loading').style.display = 'none';
    document.getElementById('users-dashboard').style.display = 'block';
}

async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: { Authorization: `Bearer ${state.token}` },
        });

        if (response.status === 401 || response.status === 403) {
            redirectToLogin();
            return;
        }

        if (!response.ok) throw new Error('Failed to load users');

        const data = await response.json();
        state.users = Array.isArray(data.users) ? data.users : [];
        renderTable();
        setStatus(`Loaded ${state.users.length} user(s).`, 'is-success');
        if (state.role === 'admin') loadTaskPanel();
    } catch {
        setStatus('Failed to load users.', 'is-error');
    }
}

function renderTable() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.textContent = '';
    const isAdmin = state.role === 'admin';

    if (state.users.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = isAdmin ? 6 : 5;
        cell.className = 'users-empty';
        cell.textContent = 'No users found.';
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
    }

    state.users.forEach((user) => {
        const row = document.createElement('tr');
        const isSelf = user.username === state.currentUsername;

        const usernameCell = document.createElement('td');
        usernameCell.textContent = user.username;
        if (isSelf) {
            const badge = document.createElement('span');
            badge.className = 'users-self-badge';
            badge.textContent = ' (you)';
            usernameCell.appendChild(badge);
        }

        const colorCell = document.createElement('td');
        const colorBadge = document.createElement('span');
        colorBadge.className = 'users-color-badge';
        colorBadge.textContent = user.username;
        applyUserColorStyles(colorBadge, user.color || '#888888');
        colorCell.appendChild(colorBadge);

        if (isAdmin) {
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = user.color || '#888888';
            colorInput.className = 'users-color-input';
            colorInput.title = 'Change color';
            colorInput.addEventListener('input', () => {
                applyUserColorStyles(colorBadge, colorInput.value);
            });
            colorInput.addEventListener('change', async () => {
                await updateColor(user.username, colorInput.value);
            });
            colorCell.appendChild(colorInput);
        }

        const roleCell = document.createElement('td');
        if (isAdmin) {
            const roleSelect = document.createElement('select');
            roleSelect.disabled = isSelf;
            roleSelect.title = isSelf ? 'Cannot change your own role' : '';
            ['admin', 'operator', 'tester'].forEach((r) => {
                const opt = document.createElement('option');
                opt.value = r;
                opt.textContent = r.charAt(0).toUpperCase() + r.slice(1);
                opt.selected = user.role === r;
                roleSelect.appendChild(opt);
            });
            roleSelect.addEventListener('change', async () => {
                await updateRole(user.username, roleSelect.value);
            });
            roleCell.appendChild(roleSelect);
        } else {
            roleCell.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
        }

        const firstLoginCell = document.createElement('td');
        firstLoginCell.textContent = user.firstLogin ? 'Yes' : 'No';
        firstLoginCell.className = user.firstLogin ? 'users-first-login' : '';

        const lastLoginCell = document.createElement('td');
        if (user.lastLogin) {
            const date = new Date(user.lastLogin);
            lastLoginCell.textContent = date.toLocaleString('de-DE');
            lastLoginCell.title = date.toISOString();
            lastLoginCell.style.color = getLastLoginColor(user.lastLogin);
        } else {
            lastLoginCell.textContent = 'Never';
            lastLoginCell.className = 'users-first-login';
        }

        const actionsCell = document.createElement('td');
        actionsCell.className = 'users-actions';

        if (isAdmin) {
            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.textContent = 'Reset Password';
            resetBtn.addEventListener('click', async () => {
                if (!confirm(`Reset password for "${user.username}" to the default?`)) return;
                await resetPassword(user.username);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'users-delete-btn';
            deleteBtn.disabled = isSelf;
            deleteBtn.title = isSelf ? 'Cannot delete your own account' : '';
            deleteBtn.addEventListener('click', async () => {
                if (!confirm(`Delete user "${user.username}" permanently?`)) return;
                await deleteUser(user.username);
            });

            actionsCell.append(resetBtn, deleteBtn);
        }

        row.append(usernameCell, colorCell, roleCell, firstLoginCell, lastLoginCell);
        if (isAdmin) row.appendChild(actionsCell);
        tbody.appendChild(row);
    });
}

async function addUser(username, role) {
    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            },
            body: JSON.stringify({ username, role }),
        });

        const data = await response.json();
        if (!response.ok) {
            setStatus(data.error || 'Failed to add user.', 'is-error');
            return;
        }

        setStatus(`User "${username}" added with default password "cubingtools".`, 'is-success');
        await loadUsers();
    } catch {
        setStatus('Failed to add user.', 'is-error');
    }
}

async function deleteUser(username) {
    try {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${state.token}` },
        });

        const data = await response.json();
        if (!response.ok) {
            setStatus(data.error || 'Failed to delete user.', 'is-error');
            return;
        }

        setStatus(`User "${username}" deleted.`, 'is-success');
        await loadUsers();
    } catch {
        setStatus('Failed to delete user.', 'is-error');
    }
}

async function updateRole(username, role) {
    try {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(username)}/role`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            },
            body: JSON.stringify({ role }),
        });

        const data = await response.json();
        if (!response.ok) {
            setStatus(data.error || 'Failed to update role.', 'is-error');
            await loadUsers();
            return;
        }

        setStatus(`Role for "${username}" updated to "${role}".`, 'is-success');
        await loadUsers();
    } catch {
        setStatus('Failed to update role.', 'is-error');
    }
}

async function resetPassword(username) {
    try {
        const response = await fetch(
            `/api/admin/users/${encodeURIComponent(username)}/reset-password`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${state.token}` },
            },
        );

        const data = await response.json();
        if (!response.ok) {
            setStatus(data.error || 'Failed to reset password.', 'is-error');
            return;
        }

        setStatus(
            `Password for "${username}" reset to default. They will be prompted to change it on next login.`,
            'is-success',
        );
        await loadUsers();
    } catch {
        setStatus('Failed to reset password.', 'is-error');
    }
}

async function updateColor(username, color) {
    try {
        const isSelf = username === state.currentUsername;
        const url = isSelf
            ? '/api/admin/users/me/color'
            : `/api/admin/users/${encodeURIComponent(username)}/color`;
        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            },
            body: JSON.stringify({ color }),
        });

        const data = await response.json();
        if (!response.ok) {
            setStatus(data.error || 'Failed to update color.', 'is-error');
            return;
        }

        state.currentColor = isSelf ? color : state.currentColor;
        setStatus('Color updated.', 'is-success');

        if (isSelf) {
            // Refresh nav to reflect new color
            document.querySelector('.admin-subnav')?.remove();
            initAdminNav(state.role, 'users', state.currentUsername, color);
        }
    } catch {
        setStatus('Failed to update color.', 'is-error');
    }
}

function getLastLoginColor(lastLogin) {
    const days = (Date.now() - new Date(lastLogin).getTime()) / 86_400_000;
    const t = 1 / (1 + days / 14);
    // Interpolate: t=1 (today) → neutral gray, t→0 (old) → red (#f07167)
    const r = Math.round(170 * t + 240 * (1 - t));
    const g = Math.round(170 * t + 113 * (1 - t));
    const b = Math.round(170 * t + 103 * (1 - t));
    return `rgb(${r}, ${g}, ${b})`;
}

function setStatus(message, type) {
    const el = document.getElementById('users-status');
    if (!el) return;
    el.textContent = message;
    el.className = `users-status ${type || ''}`.trim();
}

async function loadTaskPanel() {
    const token = state.token;
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

    if (!tasks.length) return;

    function isDue(task) {
        const history = completions[task.id];
        if (!Array.isArray(history) || !history.length) return true;
        const diffDays = (Date.now() - new Date(history[0].completedAt).getTime()) / 86_400_000;
        if (task.frequency === 'daily') return diffDays >= 1;
        if (task.frequency === 'weekly') return diffDays >= 7;
        if (task.frequency === 'monthly') return diffDays >= 30;
        return true;
    }

    function timeAgo(iso) {
        if (!iso) return '';
        const diffMs = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diffMs / 60000);
        if (m < 2) return 'just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }

    const dashboard = document.getElementById('users-dashboard');
    if (!dashboard) return;

    // Remove stale panel
    document.querySelector('.users-task-panel')?.remove();

    const dueTasks = tasks.filter(isDue);
    const sorted = [...tasks].sort((a, b) => Number(!isDue(a)) - Number(!isDue(b)));

    const panel = document.createElement('section');
    panel.className = 'users-task-panel card';

    const header = document.createElement('div');
    header.className = 'users-task-panel__header';

    const title = document.createElement('h3');
    title.className = 'users-task-panel__title';
    title.textContent = 'Periodic Task Status';
    header.appendChild(title);

    if (dueTasks.length > 0) {
        const badge = document.createElement('span');
        badge.className = 'admin-badge';
        badge.textContent = String(dueTasks.length);
        badge.title = `${dueTasks.length} task${dueTasks.length !== 1 ? 's' : ''} currently due`;
        header.appendChild(badge);
    }

    panel.appendChild(header);

    const table = document.createElement('table');
    table.className = 'users-task-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>
        <th>Task</th>
        <th>Freq</th>
        <th>Category</th>
        <th>Status</th>
        <th>Last completion</th>
        <th>History</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    sorted.forEach((task) => {
        const due = isDue(task);
        const history = Array.isArray(completions[task.id]) ? completions[task.id] : [];
        const latest = history[0] || null;

        const tr = document.createElement('tr');
        tr.className = due ? 'users-task-row--due' : 'users-task-row--done';

        // Task name
        const nameCell = document.createElement('td');
        nameCell.className = 'users-task-name';
        const nameText = document.createElement('span');
        nameText.textContent = task.title;
        const roleLabel =
            task.role === 'both' ? 'All' : task.role === 'admin' ? 'Admin' : 'Operator';
        const roleTag = document.createElement('span');
        roleTag.className = 'admin-task-tag';
        roleTag.style.marginLeft = '6px';
        roleTag.textContent = roleLabel;
        nameCell.append(nameText, roleTag);

        // Frequency
        const freqCell = document.createElement('td');
        const freqTag = document.createElement('span');
        freqTag.className = `admin-task-tag admin-task-tag--${task.frequency}`;
        freqTag.textContent = task.frequency;
        freqCell.appendChild(freqTag);

        // Category
        const catCell = document.createElement('td');
        catCell.textContent = task.category;
        catCell.className = 'users-task-category';

        // Status
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = due
            ? 'users-task-status users-task-status--due'
            : 'users-task-status users-task-status--done';
        statusBadge.textContent = due ? 'Due' : 'Done';
        statusCell.appendChild(statusBadge);

        // Last completion
        const lastCell = document.createElement('td');
        if (latest) {
            const userBadge = document.createElement('span');
            userBadge.className = 'users-task-user';
            const user = state.users.find(
                (u) => u.username.toLowerCase() === latest.username.toLowerCase(),
            );
            if (user?.color) applyUserColorStyles(userBadge, user.color);
            userBadge.textContent = latest.username;

            const when = document.createElement('span');
            when.className = 'users-task-when';
            when.textContent = timeAgo(latest.completedAt);
            when.title = new Date(latest.completedAt).toLocaleString('de-DE');

            lastCell.append(userBadge, ' ', when);
        } else {
            lastCell.textContent = '—';
            lastCell.className = 'users-task-none';
        }

        // Recent completions (up to 4 unique users, latest per user)
        const histCell = document.createElement('td');
        histCell.className = 'users-task-hist';
        const seenUsers = new Set();
        const recentPerUser = [];
        for (const entry of history) {
            if (seenUsers.has(entry.username)) continue;
            seenUsers.add(entry.username);
            recentPerUser.push(entry);
            if (recentPerUser.length >= 4) break;
        }
        recentPerUser.forEach((entry) => {
            const chip = document.createElement('span');
            chip.className = 'users-task-chip';
            const user = state.users.find(
                (u) => u.username.toLowerCase() === entry.username.toLowerCase(),
            );
            if (user?.color) applyUserColorStyles(chip, user.color);
            chip.textContent = entry.username;
            chip.title = `${entry.username} — ${new Date(entry.completedAt).toLocaleString('de-DE')}`;
            histCell.appendChild(chip);
        });
        if (!recentPerUser.length) {
            histCell.textContent = '—';
            histCell.className = 'users-task-none';
        }

        tr.append(nameCell, freqCell, catCell, statusCell, lastCell, histCell);
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    panel.appendChild(table);
    dashboard.appendChild(panel);
}
