// API Configuration
const API_BASE = 'api.php';

// DOM Elements
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const userDisplay = document.getElementById('user-display');

const taskInput = document.getElementById('task-input');
const timeInput = document.getElementById('time-input');
const priorityInput = document.getElementById('priority-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');
const tabBtns = document.querySelectorAll('.tab-btn');

// App State
let todos = [];
let currentView = 'active';
let editingId = null;
let currentUser = null;
let currentGroupId = null; // null = Personal
let groups = [];

// Initialization
async function init() {
    await checkAuth();

    // Event listeners
    addBtn.addEventListener('click', addTodo);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentView = btn.dataset.view;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTodos();
        });
    });
}

// --- Group Logic ---

async function fetchGroups() {
    try {
        const res = await fetch(`${API_BASE}?action=get-groups`);
        if (res.ok) {
            groups = await res.json();
            renderGroupList();
        }
    } catch (e) {
        console.error('Failed to fetch groups', e);
    }
}

function renderGroupList() {
    const list = document.getElementById('group-list');
    list.innerHTML = '';

    // Personal Item styling
    const personalItem = document.getElementById('group-personal');
    if (personalItem) {
        if (currentGroupId === null) {
            personalItem.classList.add('active');
        } else {
            personalItem.classList.remove('active');
        }
    }

    groups.forEach(g => {
        const li = document.createElement('li');
        li.className = `group-item ${currentGroupId == g.id ? 'active' : ''}`;
        li.onclick = () => switchGroup(g.id);
        li.innerHTML = `
            <span>👥</span> ${escapeHtml(g.name)}
            <span style="margin-left:auto; font-size:0.7em; background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:4px;" title="Share Code">${g.share_code}</span>
        `;
        list.appendChild(li);
    });
}

async function switchGroup(groupId) {
    currentGroupId = groupId;
    renderGroupList();
    await fetchTodos();
}

async function showCreateGroup() {
    const name = prompt("Enter Group Name:");
    if (!name) return;

    try {
        const res = await fetch(`${API_BASE}?action=create-group`, {
            method: 'POST',
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (res.ok) {
            groups.push(data.group);
            switchGroup(data.group.id);
        } else {
            alert(data.error);
        }
    } catch (e) { alert('Error creating group'); }
}

async function showJoinGroup() {
    const code = prompt("Enter 6-character Share Code:");
    if (!code) return;

    try {
        const res = await fetch(`${API_BASE}?action=join-group`, {
            method: 'POST',
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (res.ok) {
            if (!groups.find(g => g.id === data.group.id)) {
                groups.push(data.group);
            }
            switchGroup(data.group.id);
        } else {
            alert(data.error || data.message);
        }
    } catch (e) { alert('Error joining group'); }
}

// --- Authentication Logic ---

async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}?action=check-auth`);
        const data = await res.json();

        if (res.ok && data.authenticated) {
            showApp();
            fetchGroups();
            fetchTodos();
        } else {
            showAuth();
        }
    } catch (e) {
        showAuth();
    }
}

function showAuth() {
    authView.classList.remove('hidden');
    appView.classList.add('hidden');
    loginForm.style.display = 'block';
    registerForm.classList.add('hidden');
}

function showApp() {
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
}

function toggleAuth(view) {
    authError.classList.add('hidden');
    if (view === 'register') {
        loginForm.style.display = 'none';
        registerForm.classList.remove('hidden');
    } else {
        registerForm.classList.add('hidden');
        loginForm.style.display = 'block';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_BASE}?action=login`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            currentUser = data.user;
            if (currentUser && currentUser.username) {
                userDisplay.textContent = `Hi, ${currentUser.username}`;
            }
            showApp();
            fetchGroups();
            fetchTodos();
        } else {
            showError(data.error || 'Login failed');
        }
    } catch (e) {
        showError('Network error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;

    try {
        const res = await fetch(`${API_BASE}?action=register`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            alert('Account created! Please log in.');
            toggleAuth('login');
        } else {
            showError(data.error || 'Registration failed');
        }
    } catch (e) {
        showError('Network error');
    }
}

async function handleLogout() {
    await fetch(`${API_BASE}?action=logout`);
    window.location.reload();
}

function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
}

// --- Todo Logic ---

async function fetchTodos() {
    try {
        let url = API_BASE;
        if (currentGroupId) {
            url += `?group_id=${currentGroupId}`;
        }

        const res = await fetch(url);
        if (res.ok) {
            todos = await res.json();
            renderTodos();
        }
    } catch (e) {
        console.error(e);
    }
}

async function addTodo() {
    const text = taskInput.value.trim();
    if (!text) return;

    const newTodo = {
        text,
        time: timeInput.value || null,
        priority: priorityInput.value,
        group_id: currentGroupId // Include group ID
    };

    addBtn.disabled = true;
    try {
        const res = await fetch(API_BASE, {
            method: 'POST',
            body: JSON.stringify(newTodo)
        });

        if (res.ok) {
            const saved = await res.json();
            todos.unshift(saved);

            if (currentView === 'deleted') {
                currentView = 'active';
                tabBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'active'));
            }

            renderTodos();
            taskInput.value = '';
            timeInput.value = '';
            priorityInput.value = 'Medium';
        } else {
            const err = await res.json();
            alert('Failed to add task: ' + (err.error || 'Unknown error'));
        }
    } finally {
        addBtn.disabled = false;
        taskInput.focus();
    }
}

async function toggleTodo(id) {
    const todo = todos.find(t => t.id == id);
    if (!todo) return;
    const updatedStatus = !todo.completed;

    try {
        await fetch(`${API_BASE}?id=${id}`, {
            method: 'PUT',
            body: JSON.stringify({ completed: updatedStatus })
        });
        todo.completed = updatedStatus;
        renderTodos();
    } catch (e) { fetchTodos(); }
}

async function deleteTodo(id) {
    try {
        await fetch(`${API_BASE}?id=${id}`, {
            method: 'PUT',
            body: JSON.stringify({ deleted: true })
        });
        todos = todos.map(t => t.id == id ? { ...t, deleted: true } : t);
        renderTodos();
    } catch (e) { console.error(e); }
}

async function restoreTodo(id) {
    try {
        await fetch(`${API_BASE}?id=${id}`, {
            method: 'PUT',
            body: JSON.stringify({ deleted: false })
        });
        todos = todos.map(t => t.id == id ? { ...t, deleted: false } : t);
        renderTodos();
    } catch (e) { console.error(e); }
}

async function permanentlyDeleteTodo(id) {
    if (!confirm('Permanently delete?')) return;
    try {
        await fetch(`${API_BASE}?id=${id}`, { method: 'DELETE' });
        todos = todos.filter(t => t.id != id);
        renderTodos();
    } catch (e) { console.error(e); }
}

// Edit Mode
function enterEditMode(id) {
    editingId = id;
    renderTodos();
}

function cancelEdit() {
    editingId = null;
    renderTodos();
}

async function saveEdit(id) {
    const li = document.querySelector(`li[data-id="${id}"]`);
    const newText = li.querySelector('.edit-text').value.trim();
    const newTime = li.querySelector('.edit-time').value;
    const newPriority = li.querySelector('.edit-priority').value;

    if (!newText) return;

    try {
        await fetch(`${API_BASE}?id=${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                text: newText,
                time: newTime,
                priority: newPriority
            })
        });

        todos = todos.map(t => t.id == id ? { ...t, text: newText, time: newTime, priority: newPriority } : t);
        editingId = null;
        renderTodos();
    } catch (e) { alert('Save failed'); }
}


// --- Rendering ---
function renderTodos() {
    todoList.innerHTML = '';

    // Filter locally based on loaded todos (which are already filtered by fetchTodos to group/personal)
    const filtered = todos.filter(t => {
        const isDeleted = t.deleted == 1 || t.deleted === true;
        return currentView === 'active' ? !isDeleted : isDeleted;
    });

    const priorityMap = { 'High': 3, 'Medium': 2, 'Low': 1 };

    filtered.sort((a, b) => {
        const aComp = a.completed == 1;
        const bComp = b.completed == 1;
        if (aComp !== bComp) return aComp ? 1 : -1;

        const pA = priorityMap[a.priority] || 2;
        const pB = priorityMap[b.priority] || 2;
        if (pA !== pB) return pB - pA;

        if (a.time && b.time) return a.time.localeCompare(b.time);
        return 0;
    });

    if (filtered.length === 0) {
        todoList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">No tasks found.</div>`;
        return;
    }

    filtered.forEach(todo => {
        const isCompleted = todo.completed == 1 || todo.completed === true;
        const li = document.createElement('li');
        li.className = `todo-item ${isCompleted ? 'completed' : ''} ${currentView === 'deleted' ? 'deleted-view' : ''} ${editingId == todo.id ? 'editing' : ''}`;
        li.dataset.id = todo.id;

        if (editingId == todo.id) {
            li.innerHTML = `
                <div class="edit-inputs">
                    <input type="text" class="edit-text" value="${escapeHtml(todo.text)}">
                    <div style="display: flex; gap: 8px;">
                        <input type="datetime-local" class="edit-time" value="${todo.time || ''}" style="flex: 1;">
                        <select class="edit-priority" style="flex: 1;">
                            <option value="Low" ${todo.priority === 'Low' ? 'selected' : ''}>Low</option>
                            <option value="Medium" ${todo.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                            <option value="High" ${todo.priority === 'High' ? 'selected' : ''}>High</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">
                        <button class="cancel-btn" onclick="cancelEdit()">Cancel</button>
                        <button class="save-btn" onclick="saveEdit(${todo.id})">Save</button>
                    </div>
                </div>
            `;
        } else {
            let actionsHtml = currentView === 'active' ? `
                <div class="action-btns">
                    <button class="edit-btn" onclick="enterEditMode(${todo.id})" title="Edit">✎</button>
                    <button class="delete-btn" onclick="deleteTodo(${todo.id})" title="Delete">×</button>
                </div>
            ` : `
                <div class="action-btns">
                    <button class="restore-btn" onclick="restoreTodo(${todo.id})" title="Restore">↺</button>
                    <button class="delete-btn" onclick="permanentlyDeleteTodo(${todo.id})" title="Delete Permanently">×</button>
                </div>
            `;

            li.innerHTML = `
                ${currentView === 'active' ? `
                    <input 
                        type="checkbox" 
                        class="todo-checkbox" 
                        ${isCompleted ? 'checked' : ''}
                        onchange="toggleTodo(${todo.id})"
                    >
                ` : ''}
                <div class="todo-content">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div class="todo-text">${escapeHtml(todo.text)}</div>
                        <span class="todo-priority priority-${(todo.priority || 'Medium').toLowerCase()}">${todo.priority || 'Medium'}</span>
                        ${todo.time ? `<div class="todo-time">${formatTime(todo.time)}</div>` : ''}
                    </div>
                </div>
                ${actionsHtml}
            `;
        }
        todoList.appendChild(li);
    });
}

function formatTime(timeString) {
    if (!timeString) return null;
    const date = new Date(timeString);
    if (isNaN(date.getTime())) return timeString; // Fallback

    const options = {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    };
    return date.toLocaleString('en-US', options);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

init();
