const SESSION_KEY = 'admin-token';

const passwordInput = document.getElementById('admin-password');
const adminError = document.getElementById('admin-error');
const adminAuth = document.getElementById('admin-auth');
const dashboard = document.getElementById('dashboard');

passwordInput.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;

    adminError.style.display = 'none';

    const password = passwordInput.value.trim();
    if (!password) return;

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });

        if (!response.ok) throw new Error('Invalid password');

        const { token } = await response.json();
        sessionStorage.setItem(SESSION_KEY, token);
        passwordInput.value = '';
        showDashboard();
    } catch {
        adminError.textContent = 'Unauthorized or server error';
        adminError.style.display = 'block';
    }
});

function showDashboard() {
    adminAuth.style.display = 'none';
    dashboard.style.display = 'block';
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
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', async () => {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) return;

    try {
        const response = await fetch('/api/admin/verify', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) showDashboard();
    } catch {
        // Not authenticated — show login form
    }
});
