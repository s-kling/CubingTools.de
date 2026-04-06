const SESSION_KEY = 'admin-token';

const state = {
    token: null,
    role: null,
    username: null,
    color: null,
    messages: [],
    users: [],
    bans: { emails: [], ips: [] },
    selectedBan: null,
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
        const verifyData = await verify.json();
        state.token = token;
        state.role = verifyData.role || null;
        state.username = verifyData.username || null;
        state.color = verifyData.color || null;
        initAdminNav(state.role, 'messages', state.username, state.color);
        createDashboardSkeleton();
        bindDashboardEvents();
        await loadMessages();
    } catch {
        redirectToLogin();
    }
});

function redirectToLogin() {
    window.location.href = '/admin?then=messages';
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
                            <option value="appeal-pending">Appeal pending</option>
                            <option value="banned-email">Banned by email</option>
                            <option value="banned-ip">Banned by IP hash</option>
                            <option value="high-risk">High risk score (&lt; 0.75)</option>
                            <option value="unscored">No score</option>
                            <option value="assigned">Assigned to me</option>
                            <option value="done">Done</option>
                            <option value="not-done">Not done</option>
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
                    ${state.role === 'admin' ? '<button id="messages-delete-selected" type="button">Delete selected</button>' : ''}
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
                            <th>Assigned</th>
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

                <div id="messages-ban-console" class="ban-console" aria-live="polite">
                    <p class="ban-empty">Select a ban entry to inspect details and actions.</p>
                </div>

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
        const visible = getFilteredMessages().filter((message) => message.rowType !== 'appeal');
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

        try {
            const usersRes = await fetch('/api/admin/users/names', {
                headers: { Authorization: `Bearer ${state.token}` },
            });
            if (usersRes.ok) {
                const usersData = await usersRes.json();
                state.users = Array.isArray(usersData.users) ? usersData.users : [];
            }
        } catch {}

        loadingEl.style.display = 'none';
        messagesReport.style.display = 'block';
        renderDashboard();
        setStatus(
            `Loaded ${state.messages.length} message(s) and ${getAppealRows().length} appeal row(s).`,
            'is-success',
        );
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

function getAppealRows() {
    const rows = [];

    state.bans.emails.forEach((entry) => {
        if (!entry?.appeal_pending || !entry?.appeal) {
            return;
        }

        rows.push({
            id: `appeal:email:${entry.value}`,
            rowType: 'appeal',
            banningUser: entry.user || 'unknown',
            appealType: 'email',
            banValue: entry.value,
            confirmed: false,
            name: entry.appeal.name || 'N/A',
            message: entry.appeal.message || '',
            tool: entry.appeal.tool || 'Other',
            recaptcha_score: entry.appeal.recaptcha_score,
            timestamp: entry.appeal.requestedAt || entry.createdAt || null,
            email: entry.appeal.email || entry.value || 'N/A',
            secured_ip: 'N/A',
        });
    });

    state.bans.ips.forEach((entry) => {
        if (!entry?.appeal_pending || !entry?.appeal) {
            return;
        }

        rows.push({
            id: `appeal:ip:${entry.value}`,
            rowType: 'appeal',
            banningUser: entry.user || 'unknown',
            appealType: 'ip',
            banValue: entry.value,
            confirmed: false,
            name: entry.appeal.name || 'N/A',
            message: entry.appeal.message || '',
            tool: entry.appeal.tool || 'Other',
            recaptcha_score: entry.appeal.recaptcha_score,
            timestamp: entry.appeal.requestedAt || entry.createdAt || null,
            email: entry.appeal.email || 'N/A',
            secured_ip: entry.value || 'N/A',
        });
    });

    return rows;
}

function getAllTableRows() {
    return [
        ...state.messages.map((message) => ({ ...message, rowType: 'message' })),
        ...getAppealRows(),
    ];
}

function getFilteredMessages() {
    const bannedEmails = new Set(state.bans.emails.map((entry) => entry.value));
    const bannedIps = new Set(state.bans.ips.map((entry) => entry.value));
    const appealEmails = new Set(
        state.bans.emails
            .filter((entry) => entry?.appeal_pending)
            .map((entry) => normalizeEmail(entry?.appeal?.email || entry?.value)),
    );
    const appealIps = new Set(
        state.bans.ips
            .filter((entry) => entry?.appeal_pending)
            .map((entry) => normalizeIp(entry?.value)),
    );
    const query = state.filters.query;

    const filtered = getAllTableRows().filter((message) => {
        const email = normalizeEmail(message.email);
        const ip = normalizeIp(message.secured_ip);
        const score = parseFloat(message.recaptcha_score);
        const isAppeal = message.rowType === 'appeal';

        if (state.filters.category === 'banned-email' && !bannedEmails.has(email)) return false;
        if (state.filters.category === 'banned-ip' && !bannedIps.has(ip)) return false;
        if (state.filters.category === 'appeal-pending') {
            const hasPendingAppeal = appealEmails.has(email) || appealIps.has(ip);
            if (!hasPendingAppeal) return false;
        }
        if (state.filters.category === 'confirmed' && isAppeal) return false;
        if (state.filters.category === 'unconfirmed' && isAppeal) return false;
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

        if (state.filters.category === 'assigned') {
            if (isAppeal || message.assignedTo !== state.username) return false;
        }

        if (state.filters.category === 'done' && (isAppeal || message.status !== 'done'))
            return false;
        if (state.filters.category === 'not-done' && (isAppeal || message.status === 'done'))
            return false;

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
    const appeals = getAppealRows();
    const uniqueEmails = new Set(state.messages.map((msg) => normalizeEmail(msg.email))).size;
    const uniqueIps = new Set(state.messages.map((msg) => normalizeIp(msg.secured_ip))).size;
    const confirmedCount = state.messages.filter((msg) => msg.confirmed).length;
    const unconfirmedCount = state.messages.length - confirmedCount;
    const appealPendingCount =
        state.bans.emails.filter((entry) => entry?.appeal_pending).length +
        state.bans.ips.filter((entry) => entry?.appeal_pending).length;

    statsEl.innerHTML = `
        <article class="stat card"><h3>Total messages</h3><p>${state.messages.length}</p></article>
        <article class="stat card"><h3>Visible</h3><p>${visible.length}</p></article>
        <article class="stat card"><h3>Confirmed</h3><p>${confirmedCount}</p></article>
        <article class="stat card"><h3>Pending</h3><p>${unconfirmedCount}</p></article>
        <article class="stat card"><h3>Appeal rows</h3><p>${appeals.length}</p></article>
        <article class="stat card"><h3>Unique emails</h3><p>${uniqueEmails}</p></article>
        <article class="stat card"><h3>Unique IP hashes</h3><p>${uniqueIps}</p></article>
        <article class="stat card"><h3>Banned emails</h3><p>${state.bans.emails.length}</p></article>
        <article class="stat card"><h3>Banned IP hashes</h3><p>${state.bans.ips.length}</p></article>
        <article class="stat card"><h3>Appeals pending</h3><p>${appealPendingCount}</p></article>
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
        cell.colSpan = 11;
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
        const isAppeal = message.rowType === 'appeal';

        if (bannedEmails.has(normalizedEmail) || bannedIps.has(normalizedIp)) {
            row.classList.add('is-banned');
        }

        if (isAppeal) {
            row.classList.add('is-appeal');
        }

        if (isAppeal) {
            row.classList.add('is-unconfirmed');
        } else if (message.status === 'done') {
            row.classList.add('is-done');
        } else if (message.confirmed) {
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
        if (Number.isFinite(Number.parseFloat(message.recaptcha_score))) {
            scoreCell.style.color = `hsl(${hue}, 80%, 50%)`;
        }

        row.appendChild(createSelectCell(message));
        row.appendChild(createStatusCell(message));
        row.appendChild(createAssignedCell(message));
        row.appendChild(createCell(message.name || 'N/A'));
        row.appendChild(createMessageCell(message.message));
        row.appendChild(createCell(message.tool || 'Other'));
        row.appendChild(scoreCell);
        row.appendChild(createCell(formatDate(message.timestamp)));
        row.appendChild(createCell(message.email || 'N/A'));
        row.appendChild(createIpCell(message.secured_ip));
        if (message.status !== 'done') {
            row.appendChild(isAppeal ? createAppealActionCell(message) : createActionCell(message));
        } else {
            // If the message is marked as done, only display the undone button
            row.appendChild(createUndoneActionCell(message));
        }
        tbody.appendChild(row);
    });

    updateSelectAllCheckbox(visible);
}

function createSelectCell(message) {
    const cell = document.createElement('td');

    if (message.rowType === 'appeal') {
        cell.textContent = '-';
        return cell;
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedIds.has(message.id);
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            state.selectedIds.add(message.id);
        } else {
            state.selectedIds.delete(message.id);
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

    const displayValue = getCompactHashDisplay(rawValue);

    cell.textContent = displayValue;
    cell.title = rawValue;
    return cell;
}

function createAssignedCell(message) {
    const cell = document.createElement('td');
    if (message.rowType === 'appeal' || !message.assignedTo) {
        cell.textContent = '\u2014';
        return cell;
    }
    const badge = document.createElement('span');
    badge.className = 'assigned-badge';
    applyUserColorStyles(badge, getUserColor(message.assignedTo));
    badge.textContent = message.assignedTo;
    cell.appendChild(badge);
    return cell;
}

function getCompactHashDisplay(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
        return 'N/A';
    }

    const isLongHash = rawValue.length > 18;
    return isLongHash ? `${rawValue.slice(0, 10)}...${rawValue.slice(-6)}` : rawValue;
}

function getBanEntryHoverText(entry) {
    const reason = String(entry?.reason || '').trim();
    return reason ? `Reason: ${reason}` : '';
}

function getBanEntry(type, value) {
    const key = type === 'email' ? 'emails' : 'ips';
    return (
        state.bans[key].find((entry) => String(entry?.value || '') === String(value || '')) || null
    );
}

function getUserColor(user) {
    const found = state.users.find((u) => u.username === user);
    return found?.color || '#888888';
}

function getSelectedBanEntry() {
    const selected = state.selectedBan;
    if (!selected) {
        return null;
    }

    const entry = getBanEntry(selected.type, selected.value);
    if (!entry) {
        state.selectedBan = null;
        return null;
    }

    return {
        type: selected.type,
        value: selected.value,
        entry,
    };
}

function renderBanConsole() {
    const consoleEl = document.getElementById('messages-ban-console');
    if (!consoleEl) return;

    const selected = getSelectedBanEntry();
    consoleEl.textContent = '';

    if (!selected) {
        const empty = document.createElement('p');
        empty.className = 'ban-empty';
        empty.textContent = 'Select a ban entry to inspect details and actions.';
        consoleEl.appendChild(empty);
        return;
    }

    const { type, value, entry } = selected;
    const table = document.createElement('table');
    table.className = 'messages-table ban-console-table';

    const tbody = document.createElement('tbody');

    const addRow = (label, rowValue) => {
        const row = document.createElement('tr');
        const th = document.createElement('th');
        const td = document.createElement('td');

        th.textContent = label;
        td.textContent = String(rowValue || 'N/A');

        row.append(th, td);
        tbody.appendChild(row);
    };

    addRow('Type', type === 'email' ? 'Email' : 'IP hash');
    addRow('Value', type === 'ip' ? getCompactHashDisplay(value) : value);
    addRow('Full value', value);
    addRow('Banned by', entry.user || 'N/A');
    addRow('Created', formatDate(entry.createdAt));
    addRow('Reason', entry.reason || 'N/A');
    addRow('Appeal pending', entry.appeal_pending ? 'Yes' : 'No');

    if (entry.appeal) {
        addRow('Appeal requested', formatDate(entry.appeal.requestedAt));
        addRow('Appeal sender', entry.appeal.name || 'N/A');
        addRow('Appeal email', entry.appeal.email || 'N/A');
        addRow('Appeal score', formatScore(entry.appeal.recaptcha_score));
        addRow('Appeal host', entry.appeal.requestHost || 'N/A');
        addRow('Appeal message', entry.appeal.message || 'N/A');
    }

    table.appendChild(tbody);
    consoleEl.appendChild(table);

    const actions = document.createElement('div');
    actions.className = 'actions-row';

    if (entry.appeal_pending) {
        const resolveButton = document.createElement('button');
        resolveButton.type = 'button';
        resolveButton.textContent = 'Resolve';
        resolveButton.addEventListener('click', async () => {
            const reason = prompt('Reason for resolving this appeal (optional):', '');
            await resolveAppeal(type, value, false, reason);
        });

        const approveButton = document.createElement('button');
        approveButton.type = 'button';
        approveButton.textContent = 'Approve & unban';
        approveButton.addEventListener('click', async () => {
            await resolveAppeal(type, value, true);
        });

        actions.append(resolveButton, approveButton);
    }

    const unbanButton = document.createElement('button');
    unbanButton.type = 'button';
    unbanButton.textContent = 'Unban';
    unbanButton.addEventListener('click', async () => {
        await removeBan(type, value);
    });

    actions.appendChild(unbanButton);
    consoleEl.appendChild(actions);
}

function createStatusCell(message) {
    const cell = document.createElement('td');
    const badge = document.createElement('span');
    if (message.rowType === 'appeal') {
        badge.className = 'appeal-badge';
        badge.textContent = 'Appeal';
    } else if (message.status === 'done') {
        badge.className = 'done-badge';
        badge.textContent = 'Done';
    } else {
        badge.className = message.confirmed ? 'confirmed-badge' : 'unconfirmed-badge';
        badge.textContent = message.confirmed ? 'Confirmed' : 'Pending';
    }
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

    if (state.role === 'admin') {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', async () => {
            await deleteMessage(message.id);
        });
        cell.appendChild(deleteButton);
    }

    const banSelect = document.createElement('select');
    banSelect.className = 'ban-prefill-select';
    [
        ['', 'Ban'],
        ['email', 'Ban Email'],
        ['ip', 'Ban IP hash'],
    ].forEach(([val, label]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        banSelect.appendChild(opt);
    });
    banSelect.addEventListener('change', () => {
        const banType = banSelect.value;
        if (!banType) return;
        const banValue =
            banType === 'email' ? normalizeEmail(message.email) : normalizeIp(message.secured_ip);
        prefillBanForm(banType, banValue, `Banned from message ${message.id}`);
        banSelect.value = '';
    });

    const assignSelect = document.createElement('select');
    assignSelect.className = 'assign-select';
    const unassignOpt = document.createElement('option');
    unassignOpt.value = '';
    unassignOpt.textContent = '\u2014 Assign to \u2014';
    assignSelect.appendChild(unassignOpt);
    state.users.forEach((uname) => {
        const opt = document.createElement('option');
        opt.value = uname.username;
        opt.textContent = uname.username;
        if (uname.username === message.assignedTo) opt.selected = true;
        assignSelect.appendChild(opt);
    });

    const assignBtn = document.createElement('button');
    assignBtn.type = 'button';
    assignBtn.textContent = message.assignedTo ? 'Reassign' : 'Assign';
    assignBtn.addEventListener('click', async () => {
        await assignMessage(message.id, assignSelect.value || null);
    });

    cell.append(banSelect, assignSelect, assignBtn);

    const canMarkDone = state.role === 'admin' || message.assignedTo === state.username;
    if (canMarkDone) {
        const isDone = message.status === 'done';
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.textContent = 'Mark done';
        doneBtn.addEventListener('click', async () => {
            await markMessageDone(message.id, !isDone);
        });
        cell.appendChild(doneBtn);
    }

    return cell;
}

function createUndoneActionCell(message) {
    const cell = document.createElement('td');
    cell.className = 'row-actions';

    const undoneButton = document.createElement('button');
    undoneButton.type = 'button';
    undoneButton.textContent = 'Mark not done';
    undoneButton.addEventListener('click', async () => {
        await markMessageDone(message.id, false);
    });

    cell.appendChild(undoneButton);
    return cell;
}

function createAppealActionCell(message) {
    const cell = document.createElement('td');
    cell.className = 'row-actions';

    const resolveButton = document.createElement('button');
    resolveButton.type = 'button';
    resolveButton.textContent = 'Resolve';
    resolveButton.addEventListener('click', async () => {
        const reason = prompt('Reason for resolving this appeal (optional):', '');
        if (reason === null) {
            return;
        }

        await resolveAppeal(message.appealType, message.banValue, false, reason);
    });

    const approveButton = document.createElement('button');
    approveButton.type = 'button';
    approveButton.textContent = 'Approve & unban';
    approveButton.addEventListener('click', async () => {
        await resolveAppeal(message.appealType, message.banValue, true);
    });

    cell.append(resolveButton, approveButton);
    return cell;
}

function updateSelectAllCheckbox(visibleMessages) {
    const selectAll = document.getElementById('messages-select-all');
    if (!selectAll) return;

    const selectableMessages = visibleMessages.filter((message) => message.rowType !== 'appeal');

    if (selectableMessages.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }

    const selectedVisible = selectableMessages.filter((message) =>
        state.selectedIds.has(message.id),
    );
    selectAll.checked = selectedVisible.length === selectableMessages.length;
    selectAll.indeterminate = selectedVisible.length > 0 && !selectAll.checked;
}

function renderBans() {
    const emailsEl = document.getElementById('messages-banned-emails');
    const ipsEl = document.getElementById('messages-banned-ips');
    if (!emailsEl || !ipsEl) return;

    renderBanConsole();
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
        const labelText = document.createElement('span');

        const value = String(entry.value || '');
        const hasAppeal = Boolean(entry?.appeal_pending);
        const displayValue = type === 'ip' ? getCompactHashDisplay(value) : value || 'N/A';
        const hoverText = getBanEntryHoverText(entry);

        li.classList.add('ban-item');
        li.setAttribute('role', 'button');
        li.tabIndex = 0;

        const isSelected =
            state.selectedBan?.type === type && String(state.selectedBan?.value || '') === value;
        if (isSelected) {
            li.classList.add('is-selected');
        }

        const selectEntry = () => {
            state.selectedBan = { type, value };
            renderBans();
        };

        li.addEventListener('click', selectEntry);
        li.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }
            event.preventDefault();
            selectEntry();
        });

        label.className = 'ban-label';
        labelText.textContent = displayValue;
        label.appendChild(labelText);

        if (hoverText) {
            label.title = hoverText;
        }

        if (hasAppeal) {
            const appealBadge = document.createElement('span');
            appealBadge.className = 'appeal-badge';
            appealBadge.textContent = 'Appeal';
            label.appendChild(appealBadge);
        }

        li.appendChild(label);
        container.appendChild(li);
    });
}

async function resolveAppeal(type, value, unban, reason = '') {
    try {
        const response = await fetch('/api/admin/messages/appeal/resolve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            },
            body: JSON.stringify({ type, value, unban, reason }),
        });

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) throw new Error('Failed to resolve appeal');

        const data = await response.json();
        state.bans = normalizeBans(data.bans);
        renderDashboard();
        setStatus(
            unban ? 'Appeal approved and sender unbanned.' : 'Appeal marked as resolved.',
            'is-success',
        );
    } catch {
        setStatus('Failed to resolve appeal.', 'is-error');
    }
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

function prefillBanForm(type, value, reason = '') {
    const typeEl = document.getElementById('messages-ban-type');
    const valueEl = document.getElementById('messages-ban-value');
    const reasonEl = document.getElementById('messages-ban-reason');
    if (typeEl) typeEl.value = type;
    if (valueEl) valueEl.value = value;
    if (reasonEl) reasonEl.value = reason;
    document
        .querySelector('.messages-ban-manager')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function markMessageDone(id, done) {
    try {
        const response = await fetch(`/api/admin/messages/${encodeURIComponent(id)}/done`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            },
            body: JSON.stringify({ done }),
        });

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) throw new Error('Failed');

        const msg = state.messages.find((m) => m.id === id);
        if (msg) msg.status = done ? 'done' : null;
        renderDashboard();
        setStatus(done ? 'Marked as done.' : 'Marked as not done.', 'is-success');
    } catch {
        setStatus('Failed to update done status.', 'is-error');
    }
}

async function assignMessage(id, username) {
    try {
        const response = await fetch(`/api/admin/messages/${encodeURIComponent(id)}/assign`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            },
            body: JSON.stringify({ assignedTo: username || null }),
        });

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) throw new Error('Failed');

        const msg = state.messages.find((m) => m.id === id);
        if (msg) msg.assignedTo = username || null;
        renderDashboard();
        setStatus(username ? `Assigned to ${username}.` : 'Assignment removed.', 'is-success');
    } catch {
        setStatus('Failed to assign message.', 'is-error');
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
