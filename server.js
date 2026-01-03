const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'todos.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve frontend files

// Database Initialization
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                time TEXT,
                priority TEXT DEFAULT 'Medium',
                completed BOOLEAN DEFAULT 0,
                deleted BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            // Check if priority column exists (for existing databases)
            db.all("PRAGMA table_info(todos)", (err, columns) => {
                if (!err && !columns.some(col => col.name === 'priority')) {
                    db.run("ALTER TABLE todos ADD COLUMN priority TEXT DEFAULT 'Medium'");
                }
            });
        });
    }
});

// API Endpoints

// Get all todos
app.get('/api/todos', (req, res) => {
    db.all('SELECT * FROM todos ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        // Convert sqlite boolean (0/1) to true/false
        const todos = rows.map(row => ({
            ...row,
            completed: !!row.completed,
            deleted: !!row.deleted
        }));
        res.json(todos);
    });
});

// Create a new todo
app.post('/api/todos', (req, res) => {
    const { text, time, priority } = req.body;
    if (!text) {
        res.status(400).json({ error: 'Text is required' });
        return;
    }
    const sql = 'INSERT INTO todos (text, time, priority) VALUES (?, ?, ?)';
    db.run(sql, [text, time, priority || 'Medium'], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({
            id: this.lastID,
            text,
            time,
            priority: priority || 'Medium',
            completed: false,
            deleted: false
        });
    });
});

// Update a todo (completion, soft-delete, restore, or edit content)
app.put('/api/todos/:id', (req, res) => {
    const { id } = req.params;
    const { completed, deleted, text, time, priority } = req.body;
    
    // Build update query dynamically based on provided fields
    let updates = [];
    let params = [];
    
    if (completed !== undefined) { updates.push('completed = ?'); params.push(completed ? 1 : 0); }
    if (deleted !== undefined) { updates.push('deleted = ?'); params.push(deleted ? 1 : 0); }
    if (text !== undefined) { updates.push('text = ?'); params.push(text); }
    if (time !== undefined) { updates.push('time = ?'); params.push(time); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    
    if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
    }
    
    params.push(id);
    const sql = `UPDATE todos SET ${updates.join(', ')} WHERE id = ?`;
    
    db.run(sql, params, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Todo updated successfully', changes: this.changes });
    });
});

// Permanently delete a todo
app.delete('/api/todos/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM todos WHERE id = ?', id, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Todo permanently deleted', changes: this.changes });
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
});
