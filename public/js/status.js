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
        ${renderKeyValueSection('Peak Traffic (UTC Hour)', logs.peakHours)}
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

    return Object.entries(urls)
        .sort((a, b) => b[1] - a[1])
        .map(([url, count]) => `<li>${url} — ${count}</li>`)
        .join('');
}

function renderKeyValueSection(title, obj, limit = null) {
    if (!obj || Object.keys(obj).length === 0) return '';

    const entries = Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit ?? undefined);

    return `
        <h4>${title}</h4>
        <ul>
            ${entries.map(([key, value]) => `<li>${value} — ${key}</li>`).join('')}
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
