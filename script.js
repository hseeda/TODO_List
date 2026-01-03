// API Configuration
const API_BASE = '/api/todos';

// Get DOM elements
const taskInput = document.getElementById('task-input');
const timeInput = document.getElementById('time-input');
const priorityInput = document.getElementById('priority-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');
const tabBtns = document.querySelectorAll('.tab-btn');

// App state
let todos = [];
let currentView = 'active'; // 'active' or 'deleted'
let editingId = null;

// Initialize the app
async function init() {
    await fetchTodos();
    
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

// Fetch todos from backend
async function fetchTodos() {
    try {
        const response = await fetch(API_BASE);
        if (!response.ok) throw new Error('Failed to fetch todos');
        todos = await response.json();
        renderTodos();
    } catch (error) {
        console.error('Error:', error);
        todoList.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 40px 0;">Error connecting to server. Please try again later.</div>`;
    }
}

// Add a new todo
async function addTodo() {
    const taskText = taskInput.value.trim();
    
    if (taskText === '') {
        taskInput.focus();
        return;
    }
    
    const newTodo = {
        text: taskText,
        time: timeInput.value || null,
        priority: priorityInput.value
    };
    
    try {
        addBtn.disabled = true;
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTodo)
        });
        
        if (!response.ok) throw new Error('Failed to add todo');
        
        const savedTodo = await response.json();
        todos.unshift(savedTodo); // Add to the beginning
        
        // If we're in deleted view, switch back to active
        if (currentView === 'deleted') {
            currentView = 'active';
            tabBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'active'));
        }
        
        renderTodos();
        
        // Clear inputs
        taskInput.value = '';
        timeInput.value = '';
        priorityInput.value = 'Medium';
        taskInput.focus();
    } catch (error) {
        console.error('Error:', error);
        alert('Could not save your task. Please check your connection.');
    } finally {
        addBtn.disabled = false;
    }
}

// Toggle todo completion
async function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    try {
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: !todo.completed })
        });

        if (!response.ok) throw new Error('Failed to update todo');
        
        todo.completed = !todo.completed;
        renderTodos();
    } catch (error) {
        console.error('Error:', error);
        await fetchTodos(); // Re-sync state
    }
}

// Soft delete a todo
async function deleteTodo(id) {
    try {
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted: true })
        });

        if (!response.ok) throw new Error('Failed to soft delete');
        
        todos = todos.map(t => t.id === id ? { ...t, deleted: true } : t);
        renderTodos();
    } catch (error) {
        console.error('Error:', error);
    }
}

// Restore a deleted todo
async function restoreTodo(id) {
    try {
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted: false })
        });

        if (!response.ok) throw new Error('Failed to restore');
        
        todos = todos.map(t => t.id === id ? { ...t, deleted: false } : t);
        renderTodos();
    } catch (error) {
        console.error('Error:', error);
    }
}

// Permanently delete a todo
async function permanentlyDeleteTodo(id) {
    if (!confirm('Permanently delete this item?')) return;

    try {
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete');
        
        todos = todos.filter(t => t.id !== id);
        renderTodos();
    } catch (error) {
        console.error('Error:', error);
    }
}

// Edit Mode Logic
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
    const newTime = li.querySelector('.edit-time').value || null;
    const newPriority = li.querySelector('.edit-priority').value;

    if (!newText) return;

    try {
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: newText,
                time: newTime,
                priority: newPriority
            })
        });

        if (!response.ok) throw new Error('Failed to update todo');

        todos = todos.map(t => t.id === id ? { ...t, text: newText, time: newTime, priority: newPriority } : t);
        editingId = null;
        renderTodos();
    } catch (error) {
        console.error('Error:', error);
        alert('Could not save changes.');
    }
}

// Format time to 12-hour format
function formatTime(time) {
    if (!time) return null;
    
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    
    return `${displayHour}:${minutes} ${ampm}`;
}

// Render todos based on current view
function renderTodos() {
    todoList.innerHTML = '';
    
    const filteredTodos = todos.filter(todo => 
        currentView === 'active' ? !todo.deleted : todo.deleted
    );

    // Sort: incomplete first, then by priority (High > Medium > Low), then by time
    const priorityMap = { 'High': 3, 'Medium': 2, 'Low': 1 };
    
    const sortedTodos = [...filteredTodos].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        
        const pA = priorityMap[a.priority] || 2;
        const pB = priorityMap[b.priority] || 2;
        if (pA !== pB) return pB - pA;
        
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return 0;
    });
    
    if (sortedTodos.length === 0) {
        const emptyMsg = currentView === 'active' ? 'No active tasks! ✨' : 'No deleted tasks.';
        todoList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">${emptyMsg}</div>`;
        return;
    }

    sortedTodos.forEach(todo => {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.completed ? 'completed' : ''} ${currentView === 'deleted' ? 'deleted-view' : ''} ${editingId === todo.id ? 'editing' : ''}`;
        li.dataset.id = todo.id;
        
        if (editingId === todo.id) {
            li.innerHTML = `
                <div class="edit-inputs">
                    <input type="text" class="edit-text" value="${escapeHtml(todo.text)}">
                    <div style="display: flex; gap: 8px;">
                        <input type="time" class="edit-time" value="${todo.time || ''}" style="flex: 1;">
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
            let actionsHtml = '';
            if (currentView === 'active') {
                actionsHtml = `
                    <div class="action-btns">
                        <button class="edit-btn" onclick="enterEditMode(${todo.id})" title="Edit">✎</button>
                        <button class="delete-btn" onclick="deleteTodo(${todo.id})" title="Delete">×</button>
                    </div>
                `;
            } else {
                actionsHtml = `
                    <div class="action-btns">
                        <button class="restore-btn" onclick="restoreTodo(${todo.id})" title="Restore">↺</button>
                        <button class="delete-btn" onclick="permanentlyDeleteTodo(${todo.id})" title="Delete Permanently">×</button>
                    </div>
                `;
            }

            li.innerHTML = `
                ${currentView === 'active' ? `
                    <input 
                        type="checkbox" 
                        class="todo-checkbox" 
                        ${todo.completed ? 'checked' : ''}
                        onchange="toggleTodo(${todo.id})"
                    >
                ` : ''}
                <div class="todo-content">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div class="todo-text">${escapeHtml(todo.text)}</div>
                        <span class="todo-priority priority-${(todo.priority || 'Medium').toLowerCase()}">${todo.priority || 'Medium'}</span>
                    </div>
                    ${todo.time ? `<div class="todo-time">${formatTime(todo.time)}</div>` : ''}
                </div>
                ${actionsHtml}
            `;
        }
        
        todoList.appendChild(li);
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize the app when DOM is ready
init();


