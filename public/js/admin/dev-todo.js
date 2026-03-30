const SESSION_KEY = 'admin-token';

const state = {
    token: null,
    lines: [],
    sections: [],
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
        await loadTodos(token);
    } catch {
        redirectToLogin();
    }
});

function redirectToLogin() {
    window.location.href = '/admin';
}

async function loadTodos(token) {
    const loadingEl = document.getElementById('todo-loading');

    try {
        const response = await fetch('/api/admin/todos', {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error('Failed');

        const { content } = await response.json();
        state.lines = normalizeLineEndings(content).split('\n');
        state.sections = parseSections(state.lines);

        renderTodos();
        loadingEl.style.display = 'none';
        document.getElementById('todo-content').style.display = 'block';
    } catch {
        loadingEl.textContent = 'Failed to load todo list.';
    }
}

function normalizeLineEndings(value) {
    return String(value || '').replace(/\r\n/g, '\n');
}

function parseSections(lines) {
    const headingRe = /^##\s+(.+)$/;
    const todoRe = /^- \[( |x|X)\] (.+)$/;
    const sections = [];
    let current = null;

    lines.forEach((line, idx) => {
        const headingMatch = line.match(headingRe);
        if (headingMatch) {
            current = {
                title: headingMatch[1].trim(),
                startLine: idx,
                items: [],
            };
            sections.push(current);
            return;
        }

        if (!current) return;

        const todoMatch = line.match(todoRe);
        if (todoMatch) {
            current.items.push({
                lineIndex: idx,
                checked: todoMatch[1].toLowerCase() === 'x',
                text: todoMatch[2],
            });
        }
    });

    return sections;
}

function renderTodos() {
    const todoContent = document.getElementById('todo-content');
    todoContent.textContent = '';

    state.sections.forEach((section, sectionIndex) => {
        const sectionEl = document.createElement('section');
        sectionEl.className = 'todo-section';

        const headerEl = document.createElement('div');
        headerEl.className = 'todo-section-header';

        const heading = document.createElement('h2');
        heading.textContent = section.title;

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'todo-add-btn';
        addBtn.setAttribute('aria-label', `Add todo to ${section.title}`);
        addBtn.textContent = '+';
        addBtn.addEventListener('click', () => onAddTodo(sectionIndex));

        headerEl.append(heading, addBtn);

        const list = document.createElement('ul');
        list.className = 'todo-list';

        if (section.items.length === 0) {
            const emptyEl = document.createElement('p');
            emptyEl.className = 'todo-section-empty';
            emptyEl.textContent = 'No tasks yet in this section.';
            sectionEl.append(headerEl, emptyEl);
            todoContent.appendChild(sectionEl);
            return;
        }

        section.items.forEach((item) => {
            const itemEl = document.createElement('li');
            itemEl.className = `todo-item${item.checked ? ' todo-done' : ''}`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.checked;
            checkbox.setAttribute('aria-label', `Toggle todo: ${item.text}`);
            checkbox.addEventListener('change', () =>
                onToggleTodo(item.lineIndex, checkbox.checked),
            );

            const textEl = document.createElement('span');
            textEl.className = 'todo-item-label';
            textEl.textContent = item.text;

            itemEl.append(checkbox, textEl);
            list.appendChild(itemEl);
        });

        sectionEl.append(headerEl, list);
        todoContent.appendChild(sectionEl);
    });
}

async function onToggleTodo(lineIndex, isChecked) {
    const previousLines = state.lines.slice();
    const line = state.lines[lineIndex] || '';
    const match = line.match(/^- \[( |x|X)\] (.+)$/);
    if (!match) return;

    state.lines[lineIndex] = `- [${isChecked ? 'x' : ' '}] ${match[2]}`;
    await persistAndRerender(previousLines);
}

async function onAddTodo(sectionIndex) {
    const section = state.sections[sectionIndex];
    if (!section) return;

    const value = window.prompt(`New TODO for "${section.title}"`);
    if (value === null) return;
    const text = value.trim();
    if (!text) return;

    const previousLines = state.lines.slice();
    const insertAt = getInsertLineForSection(sectionIndex);
    state.lines.splice(insertAt, 0, `- [ ] ${text}`);
    await persistAndRerender(previousLines);
}

function getInsertLineForSection(sectionIndex) {
    const section = state.sections[sectionIndex];
    const nextSection = state.sections[sectionIndex + 1];

    if (section.items.length > 0) {
        return section.items[section.items.length - 1].lineIndex + 1;
    }

    const sectionEnd = nextSection ? nextSection.startLine : state.lines.length;
    for (let i = section.startLine + 1; i < sectionEnd; i += 1) {
        if (state.lines[i].trim() === '') {
            return i;
        }
    }

    return section.startLine + 1;
}

function setStatus(message, type) {
    const statusEl = document.getElementById('todo-status');
    statusEl.textContent = message;
    statusEl.className = 'todo-status';
    if (type) statusEl.classList.add(type);
}

async function persistAndRerender(previousLines) {
    setStatus('Saving changes…', 'is-saving');

    try {
        await saveTodos(state.lines.join('\n'));
        state.sections = parseSections(state.lines);
        renderTodos();
        setStatus('Saved.', 'is-success');
    } catch {
        if (Array.isArray(previousLines)) {
            state.lines = previousLines;
            state.sections = parseSections(state.lines);
            renderTodos();
        }
        setStatus('Failed to save TODO changes.', 'is-error');
    }
}

async function saveTodos(content) {
    const response = await fetch('/api/admin/todos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`,
        },
        body: JSON.stringify({ content }),
    });

    if (response.status === 401) {
        redirectToLogin();
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        throw new Error('Save failed');
    }
}
