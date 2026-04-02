const SESSION_KEY = 'admin-token';

const state = {
    token: null,
    messages: [],
    bans: { emails: [], ips: [] },
    selectedIds: new Set(),
    filters: {
        query: '',
        category: 'all',
        sort: 'newest',
    },
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
        state.token = token;
        createDashboardSkeleton();
        bindDashboardEvents();
        await loadMessages();
    } catch {
        redirectToLogin();
    }
});

function redirectToLogin() {
    window.location.href = '/admin';
}

function createDashboardSkeleton() {
    const messagesReport = document.getElementById('messages-report');
    if (!messagesReport) return;

    messagesReport.innerHTML = `
        <div class="messages-dashboard">
            <section class="messages-controls card">
                <p id="messages-status" class="messages-status" aria-live="polite"></p>
                <div class="control-grid">
                    <label>
                        Search
                        <input id="messages-search" type="search" placeholder="Name, email, tool, text, IP hash" />
                    </label>

                    <label>
                        Filter
                        <select id="messages-filter">
                            <option value="all">All</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="unconfirmed">Unconfirmed</option>
                            <option value="banned-email">Banned by email</option>
                            <option value="banned-ip">Banned by IP hash</option>
                            <option value="high-risk">High risk score (&lt; 0.75)</option>
                            <option value="unscored">No score</option>
                        </select>
                    </label>

                    <label>
                        Sort
                        <select id="messages-sort">
                            <option value="newest">Newest first</option>
                            <option value="oldest">Oldest first</option>
                            <option value="score-low">Score ascending</option>
                            <option value="score-high">Score descending</option>
                            <option value="name">Sender name A-Z</option>
                        </select>
                    </label>
                </div>

                <div class="actions-row">
                    <button id="messages-refresh" type="button">Refresh</button>
                    <button id="messages-delete-selected" type="button">Delete selected</button>
                    <button id="messages-ban-email-selected" type="button">Ban selected emails</button>
                    <button id="messages-ban-ip-selected" type="button">Ban selected IP hashes</button>
                    <button id="messages-clear-selection" type="button">Clear selection</button>
                </div>
            </section>

            <section class="messages-stats" id="messages-stats"></section>

            <section class="messages-table-wrap card">
                <table class="messages-table">
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="messages-select-all" aria-label="Select all visible messages" /></th>
                            <th>Status</th>
                            <th>Sender</th>
                            <th>Message</th>
                            <th>Tool</th>
                            <th>Score</th>
                            <th>Created</th>
                            <th>Email</th> 
                            <th>IP hash</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="messages-tbody"></tbody>
                </table>
            </section>

            <section class="messages-ban-manager card">
                <h3>Ban Manager</h3>
                <form id="messages-ban-form" class="ban-form">
                    <label>
                        Type
                        <select id="messages-ban-type">
                            <option value="email">Email</option>
                            <option value="ip">IP hash</option>
                        </select>
                    </label>

                    <label>
                        Value
                        <input id="messages-ban-value" type="text" placeholder="name@example.com or hashed IP" required />
                    </label>

                    <label>
                        Reason (optional)
                        <input id="messages-ban-reason" type="text" placeholder="Spam, abuse, etc." />
                    </label>

                    <button type="submit">Add ban</button>
                </form>

                <div class="ban-lists">
                    <div>
                        <h4>Banned Emails</h4>
                        <ul id="messages-banned-emails" class="ban-list"></ul>
                    </div>
                    <div>
                        <h4>Banned IP Hashes</h4>
                        <ul id="messages-banned-ips" class="ban-list"></ul>
                    </div>
                </div>
            </section>
        </div>
    `;
}

function bindDashboardEvents() {
    const searchEl = document.getElementById('messages-search');
    const filterEl = document.getElementById('messages-filter');
    const sortEl = document.getElementById('messages-sort');

    searchEl?.addEventListener('input', (event) => {
        state.filters.query = String(event.target.value || '')
            .trim()
            .toLowerCase();
        renderDashboard();
    });

    filterEl?.addEventListener('change', (event) => {
        state.filters.category = String(event.target.value || 'all');
        renderDashboard();
    });

    sortEl?.addEventListener('change', (event) => {
        state.filters.sort = String(event.target.value || 'newest');
        renderDashboard();
    });

    document.getElementById('messages-refresh')?.addEventListener('click', async () => {
        await loadMessages();
    });

    document.getElementById('messages-clear-selection')?.addEventListener('click', () => {
        state.selectedIds.clear();
        renderDashboard();
    });

    document.getElementById('messages-delete-selected')?.addEventListener('click', async () => {
        await deleteSelectedMessages();
    });

    document
        .getElementById('messages-ban-email-selected')
        ?.addEventListener('click', async () => await banSelected('email'));

    document
        .getElementById('messages-ban-ip-selected')
        ?.addEventListener('click', async () => await banSelected('ip'));

    document.getElementById('messages-select-all')?.addEventListener('change', (event) => {
        const visible = getFilteredMessages();
        const checked = Boolean(event.target.checked);

        if (checked) {
            visible.forEach((message) => state.selectedIds.add(message.id));
        } else {
            visible.forEach((message) => state.selectedIds.delete(message.id));
        }

        renderDashboard();
    });

    document.getElementById('messages-ban-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const type = document.getElementById('messages-ban-type')?.value;
        const value = document.getElementById('messages-ban-value')?.value;
        const reason = document.getElementById('messages-ban-reason')?.value;

        await addBan(type, value, reason);

        const valueInput = document.getElementById('messages-ban-value');
        const reasonInput = document.getElementById('messages-ban-reason');
        if (valueInput) valueInput.value = '';
        if (reasonInput) reasonInput.value = '';
    });
}

async function loadMessages() {
    const loadingEl = document.getElementById('messages-loading');
    const messagesReport = document.getElementById('messages-report');

    try {
        const response = await fetch('/api/admin/messages', {
            headers: { Authorization: `Bearer ${state.token}` },
        });

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) throw new Error('Failed');

        const data = await response.json();
        state.messages = Array.isArray(data.messages) ? data.messages : [];
        state.bans = normalizeBans(data.bans);
        cleanupSelection();

        loadingEl.style.display = 'none';
        messagesReport.style.display = 'block';
        renderDashboard();
        setStatus(`Loaded ${state.messages.length} message(s).`, 'is-success');
    } catch {
        loadingEl.textContent = 'Failed to load messages data.';
    }
}

function normalizeBans(bans) {
    const safe = bans && typeof bans === 'object' ? bans : {};
    return {
        emails: Array.isArray(safe.emails) ? safe.emails : [],
        ips: Array.isArray(safe.ips) ? safe.ips : [],
    };
}

function cleanupSelection() {
    const idSet = new Set(state.messages.map((message) => message.id));
    Array.from(state.selectedIds).forEach((id) => {
        if (!idSet.has(id)) {
            state.selectedIds.delete(id);
        }
    });
}

function getFilteredMessages() {
    const bannedEmails = new Set(state.bans.emails.map((entry) => entry.value));
    const bannedIps = new Set(state.bans.ips.map((entry) => entry.value));
    const query = state.filters.query;

    const filtered = state.messages.filter((message) => {
        const email = normalizeEmail(message.email);
        const ip = normalizeIp(message.secured_ip);
        const score = parseFloat(message.recaptcha_score);

        if (state.filters.category === 'banned-email' && !bannedEmails.has(email)) return false;
        if (state.filters.category === 'banned-ip' && !bannedIps.has(ip)) return false;
        if (state.filters.category === 'confirmed' && !message.confirmed) return false;
        if (state.filters.category === 'unconfirmed' && message.confirmed) return false;
        if (state.filters.category === 'high-risk' && !(Number.isFinite(score) && score < 0.75)) {
            return false;
        }
        if (
            state.filters.category === 'unscored' &&
            (Number.isFinite(score) || message.recaptcha_score === 0)
        ) {
            return false;
        }

        if (!query) return true;

        const haystack = [
            message.name,
            message.email,
            message.tool,
            message.message,
            message.secured_ip,
            message.id,
        ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');

        return haystack.includes(query);
    });

    return filtered.sort((a, b) => sortMessages(a, b, state.filters.sort));
}

function sortMessages(a, b, mode) {
    const aTs = Date.parse(a.timestamp || 0) || 0;
    const bTs = Date.parse(b.timestamp || 0) || 0;
    const aScore = Number.parseFloat(a.recaptcha_score);
    const bScore = Number.parseFloat(b.recaptcha_score);

    if (mode === 'oldest') return aTs - bTs;
    if (mode === 'score-low') return safeScore(aScore) - safeScore(bScore);
    if (mode === 'score-high') return safeScore(bScore) - safeScore(aScore);
    if (mode === 'name') {
        return String(a.name || '').localeCompare(String(b.name || ''));
    }

    return bTs - aTs;
}

function safeScore(score) {
    return Number.isFinite(score) ? score : Number.POSITIVE_INFINITY;
}

function renderDashboard() {
    renderStats();
    renderTable();
    renderBans();
}

function renderStats() {
    const statsEl = document.getElementById('messages-stats');
    if (!statsEl) return;

    const visible = getFilteredMessages();
    const uniqueEmails = new Set(state.messages.map((msg) => normalizeEmail(msg.email))).size;
    const uniqueIps = new Set(state.messages.map((msg) => normalizeIp(msg.secured_ip))).size;
    const confirmedCount = state.messages.filter((msg) => msg.confirmed).length;
    const unconfirmedCount = state.messages.length - confirmedCount;

    statsEl.innerHTML = `
        <article class="stat card"><h3>Total messages</h3><p>${state.messages.length}</p></article>
        <article class="stat card"><h3>Visible</h3><p>${visible.length}</p></article>
        <article class="stat card"><h3>Confirmed</h3><p>${confirmedCount}</p></article>
        <article class="stat card"><h3>Pending</h3><p>${unconfirmedCount}</p></article>
        <article class="stat card"><h3>Unique emails</h3><p>${uniqueEmails}</p></article>
        <article class="stat card"><h3>Unique IP hashes</h3><p>${uniqueIps}</p></article>
        <article class="stat card"><h3>Banned emails</h3><p>${state.bans.emails.length}</p></article>
        <article class="stat card"><h3>Banned IP hashes</h3><p>${state.bans.ips.length}</p></article>
        <article class="stat card"><h3>Selected</h3><p>${state.selectedIds.size}</p></article>
    `;
}

function renderTable() {
    const tbody = document.getElementById('messages-tbody');
    if (!tbody) return;

    const visible = getFilteredMessages();
    tbody.textContent = '';

    if (visible.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 10;
        cell.className = 'messages-empty';
        cell.textContent = 'No messages match the current filters.';
        row.appendChild(cell);
        tbody.appendChild(row);
        updateSelectAllCheckbox(visible);
        return;
    }

    const bannedEmails = new Set(state.bans.emails.map((entry) => entry.value));
    const bannedIps = new Set(state.bans.ips.map((entry) => entry.value));

    visible.forEach((message) => {
        const row = document.createElement('tr');
        const normalizedEmail = normalizeEmail(message.email);
        const normalizedIp = normalizeIp(message.secured_ip);

        if (bannedEmails.has(normalizedEmail) || bannedIps.has(normalizedIp)) {
            row.classList.add('is-banned');
        }

        if (message.confirmed) {
            row.classList.add('is-confirmed');
        } else {
            row.classList.add('is-unconfirmed');
        }

        // Score will always be >0.5
        // It needs to be put in relation to a scale from 0.5 to 1
        // So we remap the score to a 0-1 scale where 0.5 becomes 0 and 1 stays 1
        const percentageUsed = Math.max(0, Math.min(1, (message.recaptcha_score - 0.5) * 2));
        const hue = 120 * percentageUsed;
        const scoreCell = createCell(formatScore(message.recaptcha_score));
        scoreCell.style.color = `hsl(${hue}, 80%, 50%)`;

        row.appendChild(createSelectCell(message.id));
        row.appendChild(createStatusCell(message.confirmed));
        row.appendChild(createCell(message.name || 'N/A'));
        row.appendChild(createMessageCell(message.message));
        row.appendChild(createCell(message.tool || 'Other'));
        row.appendChild(scoreCell);
        row.appendChild(createCell(formatDate(message.timestamp)));
        row.appendChild(createCell(message.email || 'N/A'));
        row.appendChild(createIpCell(message.secured_ip));
        row.appendChild(createActionCell(message));
        tbody.appendChild(row);
    });

    updateSelectAllCheckbox(visible);
}

function createSelectCell(id) {
    const cell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedIds.has(id);
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            state.selectedIds.add(id);
        } else {
            state.selectedIds.delete(id);
        }
        renderStats();
        updateSelectAllCheckbox(getFilteredMessages());
    });

    cell.appendChild(checkbox);
    return cell;
}

function createCell(value) {
    const cell = document.createElement('td');
    cell.textContent = value;
    return cell;
}

function createIpCell(value) {
    const rawValue = String(value || '').trim();
    const cell = document.createElement('td');
    cell.className = 'ip-cell';

    if (!rawValue) {
        cell.textContent = 'N/A';
        return cell;
    }

    const isLongHash = rawValue.length > 18;
    const displayValue = isLongHash ? `${rawValue.slice(0, 10)}...${rawValue.slice(-6)}` : rawValue;

    cell.textContent = displayValue;
    cell.title = rawValue;
    return cell;
}

function createStatusCell(confirmed) {
    const cell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = confirmed ? 'confirmed-badge' : 'unconfirmed-badge';
    badge.textContent = confirmed ? 'Confirmed' : 'Pending';
    cell.appendChild(badge);
    return cell;
}

function createMessageCell(value) {
    const cell = document.createElement('td');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const content = document.createElement('pre');

    const text = String(value || '');
    const preview = text.length > 90 ? `${text.slice(0, 90)}...` : text;

    summary.textContent = preview || 'Open message';
    content.textContent = text || 'No message content';

    details.append(summary, content);
    cell.appendChild(details);
    return cell;
}

function createActionCell(message) {
    const cell = document.createElement('td');
    cell.className = 'row-actions';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
        await deleteMessage(message.id);
    });

    const banEmailButton = document.createElement('button');
    banEmailButton.type = 'button';
    banEmailButton.textContent = 'Ban Email';
    banEmailButton.addEventListener('click', async () => {
        await addBan('email', message.email, `Banned from message ${message.id}`);
    });

    const banIpButton = document.createElement('button');
    banIpButton.type = 'button';
    banIpButton.textContent = 'Ban IP';
    banIpButton.addEventListener('click', async () => {
        await addBan('ip', message.secured_ip, `Banned from message ${message.id}`);
    });

    cell.append(deleteButton, banEmailButton, banIpButton);
    return cell;
}

function updateSelectAllCheckbox(visibleMessages) {
    const selectAll = document.getElementById('messages-select-all');
    if (!selectAll) return;

    if (visibleMessages.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }

    const selectedVisible = visibleMessages.filter((message) => state.selectedIds.has(message.id));
    selectAll.checked = selectedVisible.length === visibleMessages.length;
    selectAll.indeterminate = selectedVisible.length > 0 && !selectAll.checked;
}

function renderBans() {
    const emailsEl = document.getElementById('messages-banned-emails');
    const ipsEl = document.getElementById('messages-banned-ips');
    if (!emailsEl || !ipsEl) return;

    renderBanList(emailsEl, state.bans.emails, 'email');
    renderBanList(ipsEl, state.bans.ips, 'ip');
}

function renderBanList(container, entries, type) {
    container.textContent = '';

    if (!entries.length) {
        const li = document.createElement('li');
        li.className = 'ban-empty';
        li.textContent = 'No bans yet.';
        container.appendChild(li);
        return;
    }

    entries.forEach((entry) => {
        const li = document.createElement('li');
        const label = document.createElement('span');
        const button = document.createElement('button');

        const value = String(entry.value || '');
        const reason = String(entry.reason || '').trim();
        label.textContent = reason ? `${value} (${reason})` : value;

        button.type = 'button';
        button.textContent = 'Unban';
        button.addEventListener('click', async () => {
            await removeBan(type, value);
        });

        li.append(label, button);
        container.appendChild(li);
    });
}

async function deleteMessage(id) {
    if (!window.confirm('Delete this message permanently?')) return;

    try {
        const response = await fetch(`/api/admin/messages/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${state.token}` },
        });

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) throw new Error('Failed to delete message');

        state.messages = state.messages.filter((message) => message.id !== id);
        state.selectedIds.delete(id);
        renderDashboard();
        setStatus('Message deleted.', 'is-success');
    } catch {
        setStatus('Failed to delete message.', 'is-error');
    }
}

async function deleteSelectedMessages() {
    const ids = Array.from(state.selectedIds);
    if (!ids.length) {
        setStatus('No messages selected.', 'is-error');
        return;
    }

    if (!window.confirm(`Delete ${ids.length} selected message(s)?`)) return;

    setStatus('Deleting selected messages...', 'is-saving');
    let failed = 0;

    for (const id of ids) {
        try {
            const response = await fetch(`/api/admin/messages/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${state.token}` },
            });

            if (response.status === 401) {
                redirectToLogin();
                return;
            }

            if (!response.ok) {
                failed += 1;
                continue;
            }

            state.messages = state.messages.filter((message) => message.id !== id);
            state.selectedIds.delete(id);
        } catch {
            failed += 1;
        }
    }

    renderDashboard();
    if (failed > 0) {
        setStatus(`${failed} message operation(s) failed.`, 'is-error');
    } else {
        setStatus('Selected messages deleted.', 'is-success');
    }
}

async function banSelected(type) {
    const ids = Array.from(state.selectedIds);
    if (!ids.length) {
        setStatus('No messages selected.', 'is-error');
        return;
    }

    const selectedMessages = state.messages.filter((message) => state.selectedIds.has(message.id));
    const values = new Set(
        selectedMessages
            .map((message) =>
                type === 'email' ? normalizeEmail(message.email) : normalizeIp(message.secured_ip),
            )
            .filter(Boolean),
    );

    if (!values.size) {
        setStatus('No valid values found for selected messages.', 'is-error');
        return;
    }

    setStatus(`Applying ${type} bans...`, 'is-saving');

    for (const value of values) {
        await addBan(type, value, `Bulk ban from selected messages`, false);
    }

    setStatus(`Applied ${values.size} ${type} ban(s).`, 'is-success');
    renderDashboard();
}

async function addBan(type, value, reason, showStatus = true) {
    const normalizedType = String(type || '')
        .trim()
        .toLowerCase();
    const normalizedValue = normalizedType === 'email' ? normalizeEmail(value) : normalizeIp(value);

    if (!['email', 'ip'].includes(normalizedType) || !normalizedValue) {
        if (showStatus) setStatus('Invalid ban value.', 'is-error');
        return;
    }

    try {
        const response = await fetch('/api/admin/messages/ban', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            },
            body: JSON.stringify({ type: normalizedType, value: normalizedValue, reason }),
        });

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) throw new Error('Failed to add ban');

        const data = await response.json();
        state.bans = normalizeBans(data.bans);
        renderDashboard();
        if (showStatus)
            setStatus(`${normalizedType.toUpperCase()} banned successfully.`, 'is-success');
    } catch {
        if (showStatus) setStatus('Failed to add ban.', 'is-error');
    }
}

async function removeBan(type, value) {
    try {
        const response = await fetch('/api/admin/messages/unban', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            },
            body: JSON.stringify({ type, value }),
        });

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) throw new Error('Failed to remove ban');

        const data = await response.json();
        state.bans = normalizeBans(data.bans);
        renderDashboard();
        setStatus('Ban removed.', 'is-success');
    } catch {
        setStatus('Failed to remove ban.', 'is-error');
    }
}

function normalizeEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase();
}

function normalizeIp(ip) {
    return String(ip || '')
        .trim()
        .toLowerCase();
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatScore(value) {
    const score = Number.parseFloat(value);
    return Number.isFinite(score) ? score.toFixed(2) : 'N/A';
}

function setStatus(message, type) {
    const statusEl = document.getElementById('messages-status');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = 'messages-status';
    if (type) statusEl.classList.add(type);
}
