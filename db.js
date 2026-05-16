const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, process.env.DB_FILE || 'pekoe.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to PëKœ SQLite database.');
        initializeSchema();
    }
});

function initializeSchema() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT,
            password TEXT,
            peks INTEGER DEFAULT 100,
            avatar_color TEXT,
            streak INTEGER DEFAULT 1,
            last_login TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Circles Table
        db.run(`CREATE TABLE IF NOT EXISTS circles (
            id TEXT PRIMARY KEY,
            name TEXT,
            icon TEXT,
            description TEXT,
            members_count INTEGER DEFAULT 0,
            posts_count INTEGER DEFAULT 0,
            accent TEXT
        )`);

        // Posts Table
        db.run(`CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            username TEXT,
            avatar_color TEXT,
            type TEXT,
            circle_id TEXT,
            title TEXT,
            body TEXT,
            votes INTEGER DEFAULT 0,
            dn INTEGER DEFAULT 0,
            verified TEXT,
            flagged INTEGER DEFAULT 0,
            sideA TEXT,
            sideB TEXT,
            votesA INTEGER DEFAULT 0,
            votesB INTEGER DEFAULT 0,
            poll_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // User Circles (Joins)
        db.run(`CREATE TABLE IF NOT EXISTS user_circles (
            user_id INTEGER,
            circle_id TEXT,
            PRIMARY KEY(user_id, circle_id)
        )`);

        // Votes
        db.run(`CREATE TABLE IF NOT EXISTS post_votes (
            user_id INTEGER,
            post_id TEXT,
            type TEXT,
            PRIMARY KEY(user_id, post_id)
        )`);

        // Comments
        db.run(`CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id TEXT,
            user_id INTEGER,
            username TEXT,
            text TEXT,
            avatar_color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Peks History
        db.run(`CREATE TABLE IF NOT EXISTS peks_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amt INTEGER,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Badges
        db.run(`CREATE TABLE IF NOT EXISTS user_badges (
            user_id INTEGER,
            badge_id TEXT,
            PRIMARY KEY(user_id, badge_id)
        )`);

        // Poll Votes
        db.run(`CREATE TABLE IF NOT EXISTS poll_votes (
            user_id INTEGER,
            post_id TEXT,
            option_index INTEGER,
            PRIMARY KEY(user_id, post_id)
        )`);

        // Seed Circles if empty
        db.get("SELECT COUNT(*) as count FROM circles", (err, row) => {
            if (row && row.count === 0) {
                const circles = [
                    ['ipl', 'r/IPL2025', '🏏', 'Cricket, match threads, and live debates', 284201, 1482, '#E8531F'],
                    ['upsc', 'r/UPSC2026', '📚', 'PrepHub for UPSC aspirants nationwide', 421840, 924, '#7C3AED'],
                    ['bwood', 'r/Bollywood', '🎬', 'Cinema, reviews, and box-office takes', 718240, 2104, '#F5A623'],
                    ['dalal', 'r/DalalStreet', '💹', 'Markets, stocks, and financial hot takes', 148200, 564, '#10B981'],
                    ['tech', 'r/TechBlr', '💻', 'Tech, startups, and jobs', 82400, 318, '#2563EB'],
                    ['local', 'r/LocalPulse', '📍', 'Hyperlocal news and neighbourhood alerts', 62100, 882, '#0D9488'],
                    ['health', 'r/SageHealth', '🩺', 'Health Q&A with verified Scholars', 204100, 428, '#00C9B1'],
                    ['pol', 'r/PoliticsIndia', '🏛️', 'Policy, governance, and civic debates', 312480, 1240, '#EF4444']
                ];
                const stmt = db.prepare("INSERT INTO circles (id, name, icon, description, members_count, posts_count, accent) VALUES (?, ?, ?, ?, ?, ?, ?)");
                circles.forEach(c => stmt.run(c));
                stmt.finalize();

                // Seed some posts
                const posts = [
                    ['p1', 0, 'RohanV', '#E8531F', 'regular', 'ipl', "Rohit Sharma's captaincy is tactically underrated.", "His strike rate in powerplay as captain is 142 — 18 points above the next best.", 4281, 312],
                    ['p2', 0, 'DrMeeraK', '#0D9488', 'sage', 'health', 'Why does altitude affect COVID-19 recovery?', 'As a pulmonologist, the lower partial pressure of oxygen at altitude is the key factor.', 2940, 48],
                    ['p3', 0, 'TechRiya', '#F5A623', 'townhall', 'tech', 'Bengaluru Metro Phase 3 vs Mumbai Metro Expansion', 'Full debate on ridership projections and execution risk.', 6820, 210]
                ];
                const pStmt = db.prepare("INSERT INTO posts (id, user_id, username, avatar_color, type, circle_id, title, body, votes, dn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                posts.forEach(p => pStmt.run(p));
                pStmt.finalize();
            }
        });
    });
}

module.exports = db;
