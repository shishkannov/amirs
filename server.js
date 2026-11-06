const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'amirs_secret_key_2024';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database('./database.db');

// --- ИНИЦИАЛИЗАЦИЯ ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inNum TEXT,
        date TEXT,
        caseNum TEXT,
        sender TEXT,
        defendant TEXT,
        docType TEXT,
        summary TEXT,
        status TEXT DEFAULT 'Ознакомление',
        author TEXT,
        judge TEXT,
        category TEXT
    )`);
    
    // Автоматически добавляем недостающие колонки
    db.all(`PRAGMA table_info(cases)`, [], (err, columns) => {
        if (!err && columns) {
            const columnNames = columns.map(col => col.name);
            
            if (!columnNames.includes('defendant')) {
                db.run(`ALTER TABLE cases ADD COLUMN defendant TEXT`, (err) => {
                    if (!err) console.log('✅ Добавлена колонка defendant');
                });
            }
            
            if (!columnNames.includes('judge')) {
                db.run(`ALTER TABLE cases ADD COLUMN judge TEXT`, (err) => {
                    if (!err) console.log('✅ Добавлена колонка judge');
                });
            }
            
            if (!columnNames.includes('category')) {
                db.run(`ALTER TABLE cases ADD COLUMN category TEXT`, (err) => {
                    if (!err) console.log('✅ Добавлена колонка category');
                });
            }
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caseId INTEGER,
        role TEXT,
        fullName TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        FOREIGN KEY (caseId) REFERENCES cases(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS civil_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caseNum TEXT,
        plaintiff TEXT,
        defendant TEXT,
        category TEXT,
        dateOpened TEXT,
        judge TEXT,
        status TEXT DEFAULT 'Возбуждено'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS admin_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caseNum TEXT,
        violator TEXT,
        article TEXT,
        authority TEXT,
        dateOpened TEXT,
        judge TEXT,
        status TEXT DEFAULT 'Возбуждено'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS criminal_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caseNum TEXT,
        accused TEXT,
        article TEXT,
        category TEXT,
        dateOpened TEXT,
        judge TEXT,
        status TEXT DEFAULT 'Возбуждено'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS hearings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caseId INTEGER,
        caseNum TEXT,
        judge TEXT,
        date TEXT,
        time TEXT,
        room TEXT,
        note TEXT,
        FOREIGN KEY (caseId) REFERENCES cases(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        action TEXT,
        caseId INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.get(`SELECT * FROM users WHERE username = 'admin'`, (err, row) => {
        if (!row) {
            const hash = bcrypt.hashSync('admin', 10);
            db.run(`INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')`, [hash]);
            console.log('✅ Создан админ: admin / admin');
        }
    });
});

function logAction(username, action, caseId = null) {
    db.run(`INSERT INTO logs (username, action, caseId) VALUES (?, ?, ?)`, [username, action, caseId]);
}

// --- РЕГИСТРАЦИЯ (только для админа) ---
app.post('/api/register', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Только администратор может регистрировать пользователей' });
    }
    
    const { username, password } = req.body;
    if (!username || !password || username.length < 3 || password.length < 3) {
        return res.status(400).json({ error: 'Логин и пароль минимум 3 символа' });
    }
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
        if (row) return res.status(400).json({ error: 'Логин занят' });
        const hash = bcrypt.hashSync(password, 10);
        db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, 'user')`, [username, hash], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAction(req.user.username, `Создал пользователя ${username}`);
            res.json({ success: true, userId: this.lastID });
        });
    });
});

// --- ЛОГИН ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Неверный логин или пароль' });
        const isValid = bcrypt.compareSync(password, user.password);
        if (!isValid) return res.status(401).json({ error: 'Неверный логин или пароль' });
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '8h' });
        logAction(user.username, 'Вход в систему');
        res.json({ token, username: user.username, role: user.role });
    });
});

// --- MIDDLEWARE ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещен' });
    next();
}

// --- ДЕЛА ---
app.get('/api/cases', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM cases ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/cases', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretary') {
        return res.status(403).json({ error: 'Только секретарь или администратор может создавать дела' });
    }

    const { inNum, date, caseNum, sender, defendant, docType, summary, judge, category } = req.body;
    const author = req.user.username;

    db.get(`SELECT * FROM cases WHERE caseNum = ?`, [caseNum], (err, row) => {
        if (row) return res.status(400).json({ error: 'Дело с таким номером уже существует' });
        
        // Создаем запись во входящей корреспонденции с категорией
        db.run(`INSERT INTO cases (inNum, date, caseNum, sender, defendant, docType, summary, author, judge, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [inNum, date, caseNum, sender, defendant || null, docType, summary, author, judge || null, category || null],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                const caseId = this.lastID;
                
                // Если указана категория, создаем дело в соответствующей таблице
                if (category === 'civil') {
                    db.run(`INSERT INTO civil_cases (caseNum, plaintiff, defendant, category, dateOpened, judge, status) VALUES (?, ?, ?, ?, ?, ?, 'Возбуждено')`,
                        [caseNum, sender, defendant || 'Не указан', summary, date, judge || null]);
                } else if (category === 'admin') {
                    db.run(`INSERT INTO admin_cases (caseNum, violator, article, authority, dateOpened, judge, status) VALUES (?, ?, ?, ?, ?, ?, 'Возбуждено')`,
                        [caseNum, sender, summary, docType, date, judge || null]);
                } else if (category === 'criminal') {
                    db.run(`INSERT INTO criminal_cases (caseNum, accused, article, category, dateOpened, judge, status) VALUES (?, ?, ?, ?, ?, ?, 'Возбуждено')`,
                        [caseNum, sender, summary, docType, date, judge || null]);
                }
                
                logAction(author, `Создал дело ${caseNum}${category ? ' (' + category + ')' : ''}`, caseId);
                res.json({ id: caseId, inNum, date, caseNum, sender, defendant, docType, summary, status: 'Ознакомление', author, judge, category });
            }
        );
    });
});

app.put('/api/cases/:id', authenticateToken, (req, res) => {
    const { status } = req.body;
    const caseId = req.params.id;
    const username = req.user.username;
    const role = req.user.role;

    db.get(`SELECT * FROM cases WHERE id = ?`, [caseId], (err, currentCase) => {
        if (err || !currentCase) return res.status(404).json({ error: 'Дело не найдено' });

        if (role === 'secretary' && status !== 'Подготовка') {
            return res.status(403).json({ error: 'Секретарь не может менять статус на этот' });
        }
        if (role === 'judge' && currentCase.judge !== username) {
            return res.status(403).json({ error: 'Вы не назначены судьей на это дело' });
        }

        db.run(`UPDATE cases SET status = ? WHERE id = ?`, [status, caseId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAction(username, `Изменил статус на "${status}"`, caseId);
            res.json({ success: true });
        });
    });
});

app.delete('/api/cases/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Только администратор может удалять дела' });
    }
    const caseId = req.params.id;
    db.run(`DELETE FROM cases WHERE id = ?`, [caseId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user.username, `Удалил дело`, null);
        res.json({ success: true });
    });
});

// --- ЛОГИ ---
app.get('/api/logs/:caseId', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM logs WHERE caseId = ? ORDER BY id DESC`, [req.params.caseId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/logs', authenticateToken, isAdmin, (req, res) => {
    db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 100`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- ПОЛЬЗОВАТЕЛИ ---
app.get('/api/users', authenticateToken, isAdmin, (req, res) => {
    db.all(`SELECT id, username, role FROM users`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
    const { role } = req.body;
    const targetId = req.params.id;
    db.get(`SELECT * FROM users WHERE id = ?`, [targetId], (err, user) => {
        if (user && user.username === 'admin') {
            return res.status(400).json({ error: 'Нельзя менять роль системного администратора' });
        }
        db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, targetId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAction(req.user.username, `Изменил роль пользователя ${user?.username || targetId} на "${role}"`);
            res.json({ success: true });
        });
    });
});

app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
    const targetId = req.params.id;
    db.get(`SELECT * FROM users WHERE id = ?`, [targetId], (err, user) => {
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        if (user.username === 'admin') {
            return res.status(400).json({ error: 'Нельзя удалить системного администратора' });
        }
        db.run(`DELETE FROM users WHERE id = ?`, [targetId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAction(req.user.username, `Удалил пользователя ${user.username}`);
            res.json({ success: true });
        });
    });
});

// --- СТАТИСТИКА (только для админа) ---
app.get('/api/stats', authenticateToken, isAdmin, (req, res) => {
    const stats = {};

    db.get(`SELECT COUNT(*) as total FROM cases`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.total = row.total;

        db.all(`SELECT status, COUNT(*) as count FROM cases GROUP BY status`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.byStatus = rows;

            db.all(`SELECT judge, COUNT(*) as count FROM cases WHERE judge IS NOT NULL GROUP BY judge`, [], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                stats.byJudge = rows;

                db.all(`SELECT author, COUNT(*) as count FROM cases GROUP BY author`, [], (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });
                    stats.byAuthor = rows;

                    db.all(`SELECT username, action, timestamp FROM logs ORDER BY id DESC LIMIT 10`, [], (err, rows) => {
                        if (err) return res.status(500).json({ error: err.message });
                        stats.recentLogs = rows;
                        
                        // Additional statistics
                        db.get(`SELECT COUNT(*) as total FROM civil_cases`, [], (err, civilRow) => {
                            stats.civilTotal = civilRow ? civilRow.total : 0;
                            db.get(`SELECT COUNT(*) as total FROM admin_cases`, [], (err, adminRow) => {
                                stats.adminTotal = adminRow ? adminRow.total : 0;
                                db.get(`SELECT COUNT(*) as total FROM criminal_cases`, [], (err, criminalRow) => {
                                    stats.criminalTotal = criminalRow ? criminalRow.total : 0;
                                    db.get(`SELECT COUNT(*) as total FROM participants`, [], (err, partRow) => {
                                        stats.participantsTotal = partRow ? partRow.total : 0;
                                        res.json(stats);
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// --- УЧАСТНИКИ ДЕЛА ---
app.get('/api/cases/:caseId/participants', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM participants WHERE caseId = ?`, [req.params.caseId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/cases/:caseId/participants', authenticateToken, (req, res) => {
    const { role, fullName, phone, email, address } = req.body;
    const caseId = req.params.caseId;
    
    if (!role || !fullName) {
        return res.status(400).json({ error: 'Роль и ФИО обязательны' });
    }
    
    db.run(`INSERT INTO participants (caseId, role, fullName, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)`,
        [caseId, role, fullName, phone || null, email || null, address || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAction(req.user.username, `Добавил участника "${fullName}" (${role})`, caseId);
            res.json({ id: this.lastID, caseId, role, fullName, phone, email, address });
        }
    );
});

app.delete('/api/participants/:id', authenticateToken, (req, res) => {
    const participantId = req.params.id;
    db.run(`DELETE FROM participants WHERE id = ?`, [participantId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user.username, `Удалил участника`);
        res.json({ success: true });
    });
});

// --- ПОИСК УЧАСТНИКОВ ---
app.get('/api/participants/search', authenticateToken, (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);
    
    const searchPattern = `%${query}%`;
    db.all(`SELECT p.*, c.caseNum FROM participants p 
            LEFT JOIN cases c ON p.caseId = c.id 
            WHERE p.fullName LIKE ? OR p.phone LIKE ? OR p.email LIKE ? 
            ORDER BY p.id DESC LIMIT 50`,
        [searchPattern, searchPattern, searchPattern],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// --- ГРАЖДАНСКИЕ ДЕЛА ---
app.get('/api/civil-cases', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM civil_cases ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- АДМИНИСТРАТИВНЫЕ ДЕЛА ---
app.get('/api/admin-cases', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM admin_cases ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- УГОЛОВНЫЕ ДЕЛА ---
app.get('/api/criminal-cases', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM criminal_cases ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- ЗАСЕДАНИЯ ---
app.get('/api/hearings', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM hearings ORDER BY date, time`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/hearings', authenticateToken, (req, res) => {
    const { caseId, caseNum, judge, date, time, room, note } = req.body;
    
    if (!caseId || !date || !time) {
        return res.status(400).json({ error: 'Укажите дело, дату и время' });
    }
    
    db.run(`INSERT INTO hearings (caseId, caseNum, judge, date, time, room, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [caseId, caseNum, judge || null, date, time, room || null, note || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAction(req.user.username, `Назначил заседание по делу ${caseNum} на ${date} ${time}`);
            res.json({ id: this.lastID, caseId, caseNum, judge, date, time, room, note });
        }
    );
});

app.delete('/api/hearings/:id', authenticateToken, (req, res) => {
    const hearingId = req.params.id;
    db.run(`DELETE FROM hearings WHERE id = ?`, [hearingId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user.username, `Отменил заседание`);
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
});