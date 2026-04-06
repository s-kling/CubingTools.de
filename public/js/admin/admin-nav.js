/**
 * Shared admin secondary navigation.
 * Call initAdminNav(role, currentPage, username, color) after a successful session verify.
 *
 * currentPage values: 'dashboard' | 'status' | 'messages' | 'dev-todo' | 'users'
 */

// Shared color utilities used across all admin pages.
function parseHexColor(hex) {
    const result = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
    return result
        ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
        : null;
}

function applyUserColorStyles(element, color) {
    const rgb = parseHexColor(color);
    if (rgb) {
        element.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`;
        element.style.color = color;
        element.style.border = `1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
    } else {
        element.style.backgroundColor = color;
    }
}

function initAdminNav(role, currentPage, username, color) {
    const SESSION_KEY = 'admin-token';

    const pages = [
        { id: 'status', label: 'Status', href: '/admin/status' },
        { id: 'messages', label: 'Messages', href: '/admin/messages' },
        { id: 'dev-todo', label: 'Dev Todo', href: '/admin/dev-todo' },
        { id: 'users', label: 'Users', href: '/admin/users', adminOnly: true },
    ];

    const nav = document.createElement('nav');
    nav.className = 'admin-subnav';
    nav.setAttribute('aria-label', 'Admin navigation');

    const linksWrap = document.createElement('div');
    linksWrap.className = 'admin-subnav__links';

    // Dashboard home link
    const homeLink = document.createElement('a');
    homeLink.href = '/admin';
    homeLink.className =
        'admin-subnav__link admin-subnav__home' + (currentPage === 'dashboard' ? ' is-active' : '');
    homeLink.setAttribute('aria-current', currentPage === 'dashboard' ? 'page' : undefined);
    homeLink.textContent = 'Console';
    linksWrap.appendChild(homeLink);

    // Separator
    const sep = document.createElement('span');
    sep.className = 'admin-subnav__sep';
    sep.setAttribute('aria-hidden', 'true');
    linksWrap.appendChild(sep);

    pages.forEach((page) => {
        if (page.adminOnly && role !== 'admin') return;

        const a = document.createElement('a');
        a.href = page.href;
        a.className = 'admin-subnav__link' + (currentPage === page.id ? ' is-active' : '');
        if (currentPage === page.id) a.setAttribute('aria-current', 'page');
        a.textContent = page.label;
        linksWrap.appendChild(a);
    });

    nav.appendChild(linksWrap);

    // Right side: role badge + optional username badge + logout
    const actions = document.createElement('div');
    actions.className = 'admin-subnav__actions';

    if (username) {
        const userBadge = document.createElement('span');
        userBadge.className = 'admin-subnav__user';
        userBadge.textContent = username;
        if (color) {
            applyUserColorStyles(userBadge, color);
        }
        actions.appendChild(userBadge);
    }

    const badge = document.createElement('span');
    badge.className = 'admin-subnav__role';
    badge.textContent = role === 'admin' ? 'Admin' : 'Operator';
    actions.appendChild(badge);

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'admin-subnav__logout';
    logoutBtn.textContent = 'Log out';
    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.href = '/admin';
    });
    actions.appendChild(logoutBtn);

    nav.appendChild(actions);

    // Insert as the first child of .heading so it sits inside the flex column
    const heading = document.querySelector('main .heading');
    if (heading) {
        heading.insertBefore(nav, heading.firstChild);
    } else {
        const main = document.querySelector('main');
        if (main) main.prepend(nav);
    }
}
