const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'metrics.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS metrics (
        username TEXT PRIMARY KEY,
        games_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        role_auditor_count INTEGER DEFAULT 0,
        role_employee_count INTEGER DEFAULT 0
    )`);
});

const updateMetrics = (username, win, role) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM metrics WHERE username = ?', [username], (err, row) => {
            if (err) return reject(err);
            
            const isAuditor = role === 'Auditor';
            if (row) {
                db.run(`UPDATE metrics SET 
                    games_played = games_played + 1,
                    wins = wins + ?,
                    losses = losses + ?,
                    role_auditor_count = role_auditor_count + ?,
                    role_employee_count = role_employee_count + ?
                    WHERE username = ?`,
                    [win ? 1 : 0, !win ? 1 : 0, isAuditor ? 1 : 0, !isAuditor ? 1 : 0, username],
                    (updateErr) => {
                        if (updateErr) reject(updateErr);
                        else resolve();
                    });
            } else {
                db.run(`INSERT INTO metrics (username, games_played, wins, losses, role_auditor_count, role_employee_count) 
                        VALUES (?, 1, ?, ?, ?, ?)`,
                    [username, win ? 1 : 0, !win ? 1 : 0, isAuditor ? 1 : 0, !isAuditor ? 1 : 0],
                    (insertErr) => {
                        if (insertErr) reject(insertErr);
                        else resolve();
                    });
            }
        });
    });
};

const getLeaderboard = () => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM metrics ORDER BY wins DESC, games_played ASC LIMIT 50', (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

const deleteMetrics = (username) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM metrics WHERE username = ?', [username], (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
};

module.exports = {
    updateMetrics,
    getLeaderboard,
    deleteMetrics
};
