const passwordInput = document.getElementById('admin-password');
const statusReport = document.getElementById('status-report');
const statusError = document.getElementById('status-error');

passwordInput.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;

    statusError.style.display = 'none';
    statusReport.style.display = 'none';
    statusReport.innerHTML = '';

    const password = passwordInput.value.trim();
    if (!password) return;

    try {
        const response = await fetch('/api/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });

        if (!response.ok) {
            throw new Error('Invalid password');
        }

        const data = await response.json();
        renderStatus(data);

        passwordInput.value = '';
        statusReport.style.display = 'block';
    } catch (err) {
        statusError.textContent = 'Unauthorized or server error';
        statusError.style.display = 'block';
    }
});

function renderStatus(data) {
    const logs = data.logs || {};

    const uptime = parseFloat(data.uptime) || 0;
    const formatedUptime = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

    statusReport.innerHTML = `
        <h2>Server Overview</h2>

        <ul>
            <li><strong>Uptime:</strong> ${formatedUptime}</li>
            <li><strong>Memory Usage:</strong> ${data.memoryUsage}</li>
            <li><strong>Log File Size:</strong> ${data.logFileSize}</li>
        </ul>

        <h3>Log Statistics</h3>

        <ul>
            <li><strong>Total Requests:</strong> ${logs.totalRequests ?? 'N/A'}</li>
            <li><strong>Error Rate:</strong> ${logs.errorRate ?? 'N/A'}</li>
        </ul>

        ${renderKeyValueSection('HTTP Methods', logs.methods)}
        ${renderKeyValueSection('Top Endpoints', logs.endpoints, 10)}
        ${renderExpandableStatusCodes(logs.statusCodes, logs.statusCodeUrls)}
        ${renderKeyValueSection('User Agents', logs.userAgents, 10)}
        ${renderTopWcaIds('Top WCA IDs', logs.endpoints, 10)}
        ${renderTopTools('Top Tools', logs.endpoints, 10)}
        ${renderPeakTimeTraffic('Peak Traffic (UTC Hour)', logs.peakHours)}
    `;
}

function renderExpandableStatusCodes(statusCodes, statusCodeUrls) {
    if (!statusCodes) return '';

    return `
        <h4>Status Codes</h4>
        <ul>
            ${Object.entries(statusCodes)
                .sort((a, b) => b[1] - a[1])
                .map(
                    ([code, count]) => `
                    <li>
                        <span class="status-code"
                              data-code="${code}"
                              style="cursor:pointer; text-decoration:underline;">
                            ${code}: ${count}
                        </span>
                        <ul class="status-details"
                            id="status-${code}"
                            style="display:none; margin-left:1em;">
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

function renderKeyValueSection(title, obj, limit = null) {
    if (!obj || Object.keys(obj).length === 0) return '';

    // Sort by value, remove trailing "/" if present, and limit results
    const entries = Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => [key.endsWith('/') ? key.slice(0, -1) : key, value])
        .slice(0, limit ?? undefined);

    return `
        <h4>${title}</h4>
        <ul>
            ${entries.map(([key, value]) => `<li>${value} (${((value / entries.reduce((sum, [_, val]) => sum + val, 0)) * 100).toFixed(2)}%) — ${key}</li>`).join('')}
        </ul>
    `;
}

function renderPeakTimeTraffic(title, obj, limit = null) {
    if (!obj || Object.keys(obj).length === 0) return '';

    // Sort by hour (key) instead of value
    const entries = Object.entries(obj)
        .sort((a, b) => a[0] - b[0])
        .slice(0, limit ?? undefined);

    const counts = entries.map(([_, value]) => value);
    const minTraffic = Math.min(...counts);
    const maxTraffic = Math.max(...counts);

    return `
        <h4>${title}</h4>
        <ul>
            ${entries.map(([key, value]) => `<li style="color: hsl(${((value - minTraffic) / (maxTraffic - minTraffic || 1)) * 120}, 100%, 50%);">${key}: ${value} (${((value / entries.reduce((sum, [_, val]) => sum + val, 0)) * 100).toFixed(2)}%)</li>`).join('')}
        </ul>
    `;
}

function renderTopTools(title, obj, limit = null) {
    if (!obj || Object.keys(obj).length === 0) return '';

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

    return `
        <h4>${title}</h4>
        <ul>
            ${entries.map(([key, value]) => `<li>${value} (${((value / entries.reduce((sum, [_, val]) => sum + val, 0)) * 100).toFixed(2)}%) — ${key}</li>`).join('')}
        </ul>
    `;
}

function renderTopWcaIds(title, obj, limit = null) {
    if (!obj || Object.keys(obj).length === 0) return '';

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

    return `
        <h4>${title}</h4>
        <ul>
            ${entries.map(([key, value]) => `<li>${value} (${((value / entries.reduce((sum, [_, val]) => sum + val, 0)) * 100).toFixed(2)}%) — ${key}</li>`).join('')}
        </ul>
    `;
}

document.addEventListener('click', (event) => {
    const target = event.target;

    if (!target.classList.contains('status-code')) return;

    const code = target.dataset.code;
    const details = document.getElementById(`status-${code}`);

    if (!details) return;

    details.style.display = details.style.display === 'none' ? 'block' : 'none';
});
