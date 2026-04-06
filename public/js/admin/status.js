const SESSION_KEY = 'admin-token';

const state = {
    token: null,
    data: null,
    selectedExplorerEntry: null,
    filters: {
        query: '',
        source: 'all',
        minCount: '0',
        sort: 'count-desc',
        detailsSort: 'time-desc',
        limit: '5',
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
        const data = await verify.json();
        state.token = token;
        initAdminNav(data.role, 'status', data.username, data.color);
        createDashboardSkeleton();
        bindDashboardEvents();
        await loadStatus(token);
    } catch {
        redirectToLogin();
    }
});

function redirectToLogin() {
    window.location.href = '/admin?then=status';
}

async function loadStatus(token) {
    const loadingEl = document.getElementById('status-loading');
    const statusReport = document.getElementById('status-report');

    try {
        setStatus('Loading status report...', 'is-saving');

        const response = await fetch('/api/admin/status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) throw new Error('Failed');

        const data = await response.json();
        state.data = data;
        loadingEl.style.display = 'none';
        statusReport.style.display = 'block';
        renderStatus();
        setStatus('Status report updated.', 'is-success');
    } catch {
        loadingEl.textContent = 'Failed to load status data.';
        setStatus('Failed to load status data.', 'is-error');
    }
}

function createDashboardSkeleton() {
    const statusReport = document.getElementById('status-report');
    if (!statusReport) return;

    statusReport.innerHTML = `
        <div class="status-dashboard">
            <section class="card">
                <p id="status-state" class="status-state" aria-live="polite"></p>
                <div class="actions-row">
                    <button id="status-refresh" type="button">Refresh</button>
                </div>
            </section>

            <section class="status-stats" id="status-stats"></section>

            <section class="status-explorer card status-controls">
                <h3>Log Explorer</h3>
                <div class="control-grid">
                    <label>
                        Search logs
                        <input id="status-search" type="search" placeholder="Endpoint, status code, tool, user agent" />
                    </label>

                    <label>
                        Source
                        <select id="status-source">
                            <option value="all">All sources</option>
                            <option value="endpoints">Endpoints</option>
                            <option value="statusCodes">Status codes</option>
                            <option value="methods">HTTP methods</option>
                            <option value="userAgents">User agents</option>
                            <option value="tools">Tools</option>
                            <option value="wcaIds">WCA IDs</option>
                            <option value="peakHours">Peak hours</option>
                        </select>
                    </label>

                    <label>
                        Minimum count
                        <select id="status-min-count">
                            <option value="0">Any</option>
                            <option value="5">5+</option>
                            <option value="10">10+</option>
                            <option value="25">25+</option>
                            <option value="50">50+</option>
                            <option value="100">100+</option>
                        </select>
                    </label>

                    <label>
                        Sort
                        <select id="status-sort">
                            <option value="count-desc">Count (high to low)</option>
                            <option value="count-asc">Count (low to high)</option>
                            <option value="key-asc">Key (A-Z)</option>
                            <option value="key-desc">Key (Z-A)</option>
                        </select>
                    </label>

                    <label>
                        Visible rows
                        <select id="status-limit">
                            <option value="5" selected>5</option>
                            <option value="10">10</option>
                            <option value="25">25</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                            <option value="250">250</option>
                        </select>
                    </label>
                </div>
                <p id="status-explorer-meta" class="status-empty"></p>
                <div class="status-table-wrap">
                    <table class="status-table">
                        <thead>
                            <tr>
                                <th>Source</th>
                                <th>Log key</th>
                                <th>Count</th>
                            </tr>
                        </thead>
                        <tbody id="status-explorer-results"></tbody>
                    </table>
                </div>
            </section>

            <section class="status-log-details card status-controls">
                <h3>Matching Log Entries</h3>
                <div class="control-grid smaller-grid">
                    <label>
                        Search logs
                        <input id="status-details-search" type="search" placeholder="Endpoint, status code, tool, user agent" />
                    </label>

                    <label>
                        Sort
                        <select id="status-details-sort">
                            <option value="time-desc">Time (latest first)</option>
                            <option value="time-asc">Time (earliest first)</option>
                            <option value="key-asc">Endpoint (A-Z)</option>
                            <option value="key-desc">Endpoint (Z-A)</option>
                        </select>
                    </label>

                    <label>
                        Visible rows
                        <select id="status-details-limit">
                            <option value="5" selected>5</option>
                            <option value="10">10</option>
                            <option value="25">25</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                            <option value="250">250</option>
                        </select>
                    </label>
                </div>
                <p id="status-log-details-meta" class="status-empty">Click a row in Log Explorer to inspect full matching log entries.</p>
                <div class="status-table-wrap">
                    <table class="status-table status-details-table">
                        <thead>
                            <tr>
                                <th>Time (UTC)</th>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Status</th>
                                <th>Duration (ms)</th>
                                <th>User Agent</th>
                            </tr>
                        </thead>
                        <tbody id="status-log-details-results"></tbody>
                    </table>
                </div>
            </section>
        </div>
    `;
}

function bindDashboardEvents() {
    document.getElementById('status-refresh')?.addEventListener('click', async () => {
        await loadStatus(state.token);
    });

    document.getElementById('status-search')?.addEventListener('input', (event) => {
        updateSharedFilters({
            query: String(event.target.value || '')
                .trim()
                .toLowerCase(),
        });
    });

    document.getElementById('status-source')?.addEventListener('change', (event) => {
        updateSharedFilters({ source: String(event.target.value || 'all') });
    });

    document.getElementById('status-min-count')?.addEventListener('change', (event) => {
        updateSharedFilters({ minCount: String(event.target.value || '0') });
    });

    document.getElementById('status-sort')?.addEventListener('change', (event) => {
        updateSharedFilters({ sort: String(event.target.value || 'count-desc') });
    });

    document.getElementById('status-limit')?.addEventListener('change', (event) => {
        updateSharedFilters({ limit: String(event.target.value || '') });
    });

    document.getElementById('status-details-search')?.addEventListener('input', (event) => {
        updateSharedFilters({
            query: String(event.target.value || '')
                .trim()
                .toLowerCase(),
        });
    });

    document.getElementById('status-details-source')?.addEventListener('change', (event) => {
        updateSharedFilters({ source: String(event.target.value || 'all') });
    });

    document.getElementById('status-details-min-count')?.addEventListener('change', (event) => {
        updateSharedFilters({ minCount: String(event.target.value || '0') });
    });

    document.getElementById('status-details-sort')?.addEventListener('change', (event) => {
        updateSharedFilters({ detailsSort: String(event.target.value || 'time-desc') });
    });

    document.getElementById('status-details-limit')?.addEventListener('change', (event) => {
        updateSharedFilters({ limit: String(event.target.value || '25') });
    });

    syncSharedFilterInputs();
}

function updateSharedFilters(nextValues) {
    state.filters = {
        ...state.filters,
        ...nextValues,
    };

    syncSharedFilterInputs();
    renderLogExplorer();
}

function syncSharedFilterInputs() {
    const mappings = [
        { ids: ['status-search', 'status-details-search'], value: state.filters.query },
        { ids: ['status-source', 'status-details-source'], value: state.filters.source },
        {
            ids: ['status-min-count', 'status-details-min-count'],
            value: state.filters.minCount,
        },
        { ids: ['status-sort'], value: state.filters.sort },
        { ids: ['status-details-sort'], value: state.filters.detailsSort },
        { ids: ['status-limit', 'status-details-limit'], value: state.filters.limit },
    ];

    mappings.forEach(({ ids, value }) => {
        ids.forEach((id) => {
            const element = document.getElementById(id);
            if (!element) return;
            if (element.value !== value) {
                element.value = value;
            }
        });
    });
}

function renderStatus() {
    if (!state.data) return;

    state.selectedExplorerEntry = null;

    const data = state.data;
    const logs = data.logs || {};
    const uptime = parseFloat(data.uptime) || 0;
    const formatedUptime = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

    const statsEl = document.getElementById('status-stats');

    if (statsEl) {
        statsEl.innerHTML = `
            <article class="stat card"><h3>Uptime</h3><p>${formatedUptime}</p></article>
            <article class="stat card"><h3>Memory Usage</h3><p>${data.memoryUsage || 'N/A'}</p></article>
            <article class="stat card"><h3>Log File Size</h3><p>${data.logFileSize || 'N/A'}</p></article>
            <article class="stat card"><h3>Total Requests</h3><p>${logs.totalRequests ?? 'N/A'}</p></article>
            <article class="stat card"><h3>Error Rate</h3><p>${logs.errorRate ?? 'N/A'}</p></article>
        `;
    }

    renderLogExplorer();
}

function getLogExplorerEntries() {
    const logs = state.data?.logs || {};

    const endpoints = Object.entries(logs.endpoints || {}).map(([key, count]) => ({
        source: 'endpoints',
        key: key.endsWith('/') ? key.slice(0, -1) : key,
        count,
    }));

    const statusCodes = Object.entries(logs.statusCodes || {}).map(([key, count]) => ({
        source: 'statusCodes',
        key,
        count,
    }));

    const methods = Object.entries(logs.methods || {}).map(([key, count]) => ({
        source: 'methods',
        key,
        count,
    }));

    const userAgents = Object.entries(logs.userAgents || {}).map(([key, count]) => ({
        source: 'userAgents',
        key,
        count,
    }));

    const peakHours = Object.entries(logs.peakHours || {}).map(([key, count]) => ({
        source: 'peakHours',
        key: `${String(key).padStart(2, '0')}:00 UTC`,
        count,
    }));

    const tools = {};
    Object.entries(logs.endpoints || {})
        .filter(([key]) => key.toLowerCase().includes('/tools/'))
        .forEach(([key, count]) => {
            const toolName = key.split('/')[2].split('?')[0];
            tools[toolName] = (tools[toolName] || 0) + count;
        });

    const toolEntries = Object.entries(tools).map(([key, count]) => ({
        source: 'tools',
        key,
        count,
    }));

    const wcaIds = {};
    Object.entries(logs.endpoints || {})
        .filter(([key]) => key.toLowerCase().includes('/api/wca/'))
        .forEach(([key, count]) => {
            const wcaId = key.split('/')[3]?.split('?')[0];
            if (!wcaId) return;
            wcaIds[wcaId] = (wcaIds[wcaId] || 0) + count;
        });

    const wcaEntries = Object.entries(wcaIds).map(([key, count]) => ({
        source: 'wcaIds',
        key,
        count,
    }));

    const allEntries = [
        ...endpoints,
        ...statusCodes,
        ...methods,
        ...userAgents,
        ...toolEntries,
        ...wcaEntries,
        ...peakHours,
    ];

    const query = state.filters.query;
    const selectedSource = state.filters.source;
    const minCount = Number.parseInt(state.filters.minCount, 10) || 0;

    const filtered = allEntries.filter((entry) => {
        if (selectedSource !== 'all' && entry.source !== selectedSource) return false;
        if (entry.count < minCount) return false;

        if (!query) return true;

        const haystack = `${entry.source} ${entry.key}`.toLowerCase();
        return haystack.includes(query);
    });

    const sortMode = state.filters.sort;

    return filtered.sort((a, b) => {
        if (sortMode === 'count-asc') return a.count - b.count;
        if (sortMode === 'key-asc') return a.key.localeCompare(b.key);
        if (sortMode === 'key-desc') return b.key.localeCompare(a.key);
        return b.count - a.count;
    });
}

function renderLogExplorer() {
    const bodyEl = document.getElementById('status-explorer-results');
    const metaEl = document.getElementById('status-explorer-meta');
    if (!bodyEl || !metaEl) return;

    bodyEl.textContent = '';

    if (!state.data?.logs) {
        state.selectedExplorerEntry = null;
        metaEl.textContent = 'No log data available.';
        renderSelectedLogEntries();
        return;
    }

    const { allMatches, visible } = getVisibleExplorerRows();
    metaEl.textContent = `Showing ${visible.length} of ${allMatches.length} matching log entries.`;

    if (state.selectedExplorerEntry) {
        const stillVisible = visible.some(
            (entry) =>
                entry.source === state.selectedExplorerEntry.source &&
                entry.key === state.selectedExplorerEntry.key,
        );

        if (!stillVisible) {
            state.selectedExplorerEntry = null;
        }
    }

    if (visible.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 3;
        cell.className = 'status-empty-cell';
        cell.textContent = 'No logs match the current filters.';
        row.appendChild(cell);
        bodyEl.appendChild(row);
        renderSelectedLogEntries();
        return;
    }

    visible.forEach((entry) => {
        const row = document.createElement('tr');
        row.className = 'status-explorer-row';

        const sourceCell = document.createElement('td');
        const keyCell = document.createElement('td');
        const countCell = document.createElement('td');

        row.addEventListener('click', () => {
            state.selectedExplorerEntry = entry;
            renderSelectedLogEntries();
        });

        sourceCell.textContent = formatLogSource(entry.source);
        keyCell.textContent = entry.key;
        keyCell.className = 'status-log-key';
        countCell.textContent = String(entry.count);

        row.append(sourceCell, keyCell, countCell);
        bodyEl.appendChild(row);
    });

    renderSelectedLogEntries();
}

function getVisibleExplorerRows() {
    const allMatches = getLogExplorerEntries();
    const limit = Number.parseInt(state.filters.limit, 10) || 50;
    return {
        allMatches,
        visible: allMatches.slice(0, limit),
    };
}

function renderSelectedLogEntries() {
    const bodyEl = document.getElementById('status-log-details-results');
    const metaEl = document.getElementById('status-log-details-meta');
    if (!bodyEl || !metaEl) return;

    bodyEl.textContent = '';

    const selected = state.selectedExplorerEntry;
    if (!selected) {
        metaEl.textContent = 'Click a row in Log Explorer to inspect full matching log entries.';
        return;
    }

    const entries = getFilteredMatchingLogEntries(selected);
    metaEl.textContent = `Showing ${entries.length} entries for ${formatLogSource(selected.source)}: ${selected.key} (with current filters).`;

    if (entries.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'status-empty-cell';
        cell.textContent = 'No detailed log entries found for this selection.';
        row.appendChild(cell);
        bodyEl.appendChild(row);
        return;
    }

    entries.forEach((entry) => {
        const row = document.createElement('tr');

        row.appendChild(createDetailsCell(formatLocalTime(entry.time)));
        row.appendChild(createDetailsCell(entry.method || 'N/A'));
        row.appendChild(createDetailsCell(entry.url || 'N/A', 'status-log-key'));
        row.appendChild(createDetailsCell(String(entry.status ?? 'N/A')));
        row.appendChild(createDetailsCell(String(entry.durationMs ?? 'N/A')));
        row.appendChild(createDetailsCell(entry.userAgent || 'N/A', 'status-log-key'));

        bodyEl.appendChild(row);
    });
}

function createDetailsCell(text, className = '') {
    const cell = document.createElement('td');
    cell.textContent = text;
    if (className) cell.className = className;
    return cell;
}

function getMatchingLogEntries(selected) {
    const entries = Array.isArray(state.data?.logEntries) ? state.data.logEntries : [];
    return entries.filter((entry) => doesEntryMatchSelection(entry, selected));
}

function getFilteredMatchingLogEntries(selected) {
    const matches = getMatchingLogEntries(selected);

    const selectedSource = state.filters.source;
    if (selectedSource !== 'all' && selectedSource !== selected.source) {
        return [];
    }

    const minCount = Number.parseInt(state.filters.minCount, 10) || 0;
    if ((selected.count || 0) < minCount) {
        return [];
    }

    const query = String(state.filters.query || '')
        .trim()
        .toLowerCase();

    const filtered = matches.filter((entry) => {
        if (!query) return true;

        const haystack = [
            selected.source,
            selected.key,
            entry.time,
            entry.method,
            entry.url,
            entry.status,
            entry.durationMs,
            entry.userAgent,
        ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');

        return haystack.includes(query);
    });

    const sortMode = state.filters.detailsSort;

    filtered.sort((a, b) => {
        if (sortMode === 'time-asc') {
            return compareByTime(a.time, b.time);
        }

        if (sortMode === 'key-asc') {
            return String(a.url || '').localeCompare(String(b.url || ''));
        }

        if (sortMode === 'key-desc') {
            return String(b.url || '').localeCompare(String(a.url || ''));
        }

        return compareByTime(b.time, a.time);
    });

    const limit = Number.parseInt(state.filters.limit, 10) || 50;
    return filtered.slice(0, limit);
}

function compareByTime(a, b) {
    const aTs = Date.parse(a || '') || 0;
    const bTs = Date.parse(b || '') || 0;
    return aTs - bTs;
}

function doesEntryMatchSelection(entry, selected) {
    const source = selected.source;
    const selectedKey = String(selected.key || '');

    if (source === 'endpoints') {
        return normalizeEndpoint(entry.url) === normalizeEndpoint(selectedKey);
    }

    if (source === 'statusCodes') {
        return String(entry.status ?? '') === selectedKey;
    }

    if (source === 'methods') {
        return String(entry.method || '') === selectedKey;
    }

    if (source === 'userAgents') {
        return String(entry.userAgent || '') === selectedKey;
    }

    if (source === 'tools') {
        return extractToolName(entry.url) === selectedKey;
    }

    if (source === 'wcaIds') {
        return extractWcaId(entry.url) === selectedKey;
    }

    if (source === 'peakHours') {
        const date = new Date(entry.time || '');
        if (Number.isNaN(date.getTime())) return false;
        return `${String(date.getUTCHours()).padStart(2, '0')}:00 UTC` === selectedKey;
    }

    return false;
}

function normalizeEndpoint(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    return value.endsWith('/') ? value.slice(0, -1) : value;
}

function extractToolName(url) {
    const value = String(url || '');
    if (!value.toLowerCase().includes('/tools/')) return '';
    return value.split('/')[2]?.split('?')[0] || '';
}

function extractWcaId(url) {
    const value = String(url || '');
    if (!value.toLowerCase().includes('/api/wca/')) return '';
    return value.split('/')[3]?.split('?')[0] || '';
}

function formatLocalTime(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    });
}

function formatLogSource(source) {
    if (source === 'statusCodes') return 'Status Codes';
    if (source === 'userAgents') return 'User Agents';
    if (source === 'peakHours') return 'Peak Hours';
    if (source === 'wcaIds') return 'WCA IDs';
    if (source === 'methods') return 'HTTP Methods';
    if (source === 'tools') return 'Tools';
    if (source === 'endpoints') return 'Endpoints';
    return source;
}

function renderExpandableStatusCodes(statusCodes, statusCodeUrls) {
    if (!statusCodes || Object.keys(statusCodes).length === 0)
        return '<p class="status-empty">No data.</p>';

    return `
        <ul class="status-list">
            ${Object.entries(statusCodes)
                .sort((a, b) => b[1] - a[1])
                .map(
                    ([code, count]) => `
                    <li>
                        <span class="status-code"
                              data-code="${code}"
                              role="button"
                              tabindex="0">
                            ${code}: ${count}
                        </span>
                        <ul class="status-details"
                            id="status-${code}"
                            style="display:none;">
                            ${renderStatusUrls(code, statusCodeUrls)}
                        </ul>
                    </li>
                `,
                )
                .join('')}
        </ul>
    `;
}

function renderStatusUrls(code, statusCodeUrls) {
    const urls = statusCodeUrls?.[code];

    if (!urls) return '<li>No data</li>';

    // Ensure no /404 entries are shown in the details to avoid cluttering the report with missing page requests
    return Object.entries(urls)
        .filter(([url]) => !url.includes('/404'))
        .sort((a, b) => b[1] - a[1])
        .map(([url, count]) => `<li>${count}: ${url}</li>`)
        .join('');
}

function renderKeyValueSection(obj, limit = null) {
    if (!obj || Object.keys(obj).length === 0) return '<p class="status-empty">No data.</p>';

    // Sort by value, remove trailing "/" if present, and limit results
    const entries = Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => [key.endsWith('/') ? key.slice(0, -1) : key, value])
        .slice(0, limit ?? undefined);

    const total = entries.reduce((sum, [_, value]) => sum + value, 0);

    return `
        <ul class="status-list">
            ${entries.map(([key, value]) => `<li>${value} (${total > 0 ? ((value / total) * 100).toFixed(2) : '0.00'}%) — ${key}</li>`).join('')}
        </ul>
    `;
}

function renderPeakTimeTraffic(obj, limit = null) {
    if (!obj || Object.keys(obj).length === 0) return '<p class="status-empty">No data.</p>';

    // Sort by hour (key) instead of value
    const entries = Object.entries(obj)
        .sort((a, b) => a[0] - b[0])
        .slice(0, limit ?? undefined);

    const counts = entries.map(([_, value]) => value);
    const minTraffic = Math.min(...counts);
    const maxTraffic = Math.max(...counts);
    const total = entries.reduce((sum, [_, value]) => sum + value, 0);

    return `
        <ul class="status-list status-peak-list">
            ${entries.map(([key, value]) => `<li style="color: hsl(${((value - minTraffic) / (maxTraffic - minTraffic || 1)) * 120}, 100%, 50%);">${key}: ${value} (${total > 0 ? ((value / total) * 100).toFixed(2) : '0.00'}%)</li>`).join('')}
        </ul>
    `;
}

function renderTopTools(obj, limit = null) {
    if (!obj || Object.keys(obj).length === 0) return '<p class="status-empty">No data.</p>';

    const tools = {};
    Object.entries(obj)
        .filter(([key]) => key.toLowerCase().includes('/tools/'))
        .forEach(([key, value]) => {
            const toolName = key.split('/')[2].split('?')[0];
            tools[toolName] = (tools[toolName] || 0) + value;
        });

    const entries = Object.entries(tools)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit ?? undefined);

    const total = entries.reduce((sum, [_, value]) => sum + value, 0);

    return `
        <ul class="status-list">
            ${entries.map(([key, value]) => `<li>${value} (${total > 0 ? ((value / total) * 100).toFixed(2) : '0.00'}%) — ${key}</li>`).join('')}
        </ul>
    `;
}

function renderTopWcaIds(obj, limit = null) {
    if (!obj || Object.keys(obj).length === 0) return '<p class="status-empty">No data.</p>';

    const wcaIds = {};
    Object.entries(obj)
        .filter(([key]) => key.toLowerCase().includes('/api/wca/'))
        .forEach(([key, value]) => {
            const wcaId = key.split('/')[3];
            wcaIds[wcaId] = (wcaIds[wcaId] || 0) + value;
        });

    const entries = Object.entries(wcaIds)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit ?? undefined);

    const total = entries.reduce((sum, [_, value]) => sum + value, 0);

    return `
        <ul class="status-list">
            ${entries.map(([key, value]) => `<li>${value} (${total > 0 ? ((value / total) * 100).toFixed(2) : '0.00'}%) — <a href="https://www.worldcubeassociation.org/persons/${key}" target="_blank" rel="noopener noreferrer">${key}</a></li>`).join('')}
        </ul>
    `;
}

function setStatus(message, type) {
    const statusEl = document.getElementById('status-state');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = 'status-state';
    if (type) statusEl.classList.add(type);
}

document.addEventListener('click', (event) => {
    const target = event.target;

    if (!target.classList.contains('status-code')) return;

    const code = target.dataset.code;
    const details = document.getElementById(`status-${code}`);

    if (!details) return;

    details.style.display = details.style.display === 'none' ? 'block' : 'none';
});

document.addEventListener('keydown', (event) => {
    const target = event.target;

    if (!target.classList.contains('status-code')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();

    const code = target.dataset.code;
    const details = document.getElementById(`status-${code}`);

    if (!details) return;

    details.style.display = details.style.display === 'none' ? 'block' : 'none';
});
