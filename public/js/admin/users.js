const SESSION_KEY = 'admin-token';

const state = {
    token: null,
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

        if (data.role !== 'admin') {
            document.getElementById('users-loading').textContent =
                'Access denied. Admin role required.';
            return;
        }

        state.token = token;
        state.currentUsername = data.username;
        state.currentColor = data.color || null;
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
    dashboard.innerHTML = `
        <div class="users-dashboard">
            <section class="users-controls card">
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
                            <option value="admin">Admin</option>
                        </select>
                    </label>
                    <button type="submit">Add User</button>
                </form>
            </section>

            <section class="users-table-wrap card">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Color</th>
                            <th>Role</th>
                            <th>First Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="users-tbody"></tbody>
                </table>
            </section>
        </div>
    `;

    document.getElementById('users-add-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('users-new-username').value.trim();
        const role = document.getElementById('users-new-role').value;
        if (!username) return;
        await addUser(username, role);
        document.getElementById('users-new-username').value = '';
    });

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
    } catch {
        setStatus('Failed to load users.', 'is-error');
    }
}

function renderTable() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.textContent = '';

    if (state.users.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
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

        const roleCell = document.createElement('td');
        const roleSelect = document.createElement('select');
        roleSelect.disabled = isSelf;
        roleSelect.title = isSelf ? 'Cannot change your own role' : '';
        ['admin', 'operator'].forEach((r) => {
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

        const firstLoginCell = document.createElement('td');
        firstLoginCell.textContent = user.firstLogin ? 'Yes' : 'No';
        firstLoginCell.className = user.firstLogin ? 'users-first-login' : '';

        const actionsCell = document.createElement('td');
        actionsCell.className = 'users-actions';

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
        row.append(usernameCell, colorCell, roleCell, firstLoginCell, actionsCell);
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
            initAdminNav('admin', 'users', state.currentUsername, color);
        }
    } catch {
        setStatus('Failed to update color.', 'is-error');
    }
}

function setStatus(message, type) {
    const el = document.getElementById('users-status');
    if (!el) return;
    el.textContent = message;
    el.className = `users-status ${type || ''}`.trim();
}
