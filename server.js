const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const db = require('./db');
require('dotenv').config();

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env");
    process.exit(1);
}

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for demo/simplicity if needed, or configure properly
}));
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to verify JWT
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Session expired. Please login again.' });
        
        // Verify user exists in DB (especially after DB reset)
        db.get("SELECT id FROM users WHERE id = ?", [decoded.id], (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'User not found. Please log in again.' });
            }
            req.userId = decoded.id;
            req.username = decoded.username;
            next();
        });
    });
};

// API ROUTES

// Auth: Login / Register
app.post('/api/auth/login', (req, res) => {
    const { username, email } = req.body;
    if (!username || username.length < 2) return res.status(400).json({ error: 'Valid username required' });

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        if (user) {
            const today = new Date().toDateString();
            let newStreak = user.streak;
            const yesterday = new Date(Date.now() - 86400000).toDateString();

            if (user.last_login !== today) {
                if (user.last_login === yesterday) newStreak++;
                else newStreak = 1;
                db.run("UPDATE users SET streak = ?, last_login = ? WHERE id = ?", [newStreak, today, user.id]);
            }

            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
            res.json({ token, user: { ...user, streak: newStreak } });
        } else {
            const avatarColor = ['#E8531F', '#7C3AED', '#0D9488', '#2563EB', '#10B981', '#F5A623', '#EF4444', '#00C9B1'][Math.floor(Math.random() * 8)];
            const today = new Date().toDateString();
            db.run("INSERT INTO users (username, email, peks, avatar_color, streak, last_login) VALUES (?, ?, ?, ?, ?, ?)",
                [username, email || '', 100, avatarColor, 1, today],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Failed to create user' });
                    const userId = this.lastID;
                    db.run("INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)", [userId, 'founder']);
                    db.run("INSERT INTO peks_history (user_id, amt, reason) VALUES (?, ?, ?)", [userId, 100, 'Welcome bonus — Founder! 🌟']);
                    
                    const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '30d' });
                    res.json({ token, user: { id: userId, username, peks: 100, avatar_color: avatarColor, streak: 1, last_login: today } });
                }
            );
        }
    });
});

// Posts: Get all with sort and type filtering
app.get('/api/posts', (req, res) => {
    const { sort, type } = req.query;
    const token = req.headers['authorization'];
    let userId = null;
    
    // Optional auth to get user vote state
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.id;
        } catch(e) {}
    }

    let orderBy = "created_at DESC";
    if (sort === 'top') orderBy = "votes DESC";
    else if (sort === 'hot') orderBy = "(votes - dn) DESC";

    let query = "SELECT p.*, (SELECT type FROM post_votes WHERE user_id = ? AND post_id = p.id) as user_vote FROM posts p";
    let params = [userId];

    if (type) {
        query += " WHERE p.type = ?";
        params.push(type);
    }
    
    query += ` ORDER BY ${orderBy} LIMIT 100`;

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error("Fetch Error:", err.message);
            return res.status(500).json({ error: 'Failed to fetch posts' });
        }
        res.json(rows.map(r => ({ ...r, poll_data: r.poll_data ? JSON.parse(r.poll_data) : null })));
    });
});

// Posts: Create new
app.post('/api/posts', authenticate, (req, res) => {
    const { id, type, circle_id, title, body, sideA, sideB, poll_data } = req.body;
    const userId = req.userId;
    const username = req.username;

    db.get("SELECT avatar_color FROM users WHERE id = ?", [userId], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'User profile not found. Please log in again.' });
        }
        const avatarColor = user.avatar_color || '#E8531F';
        db.run(`INSERT INTO posts (id, user_id, username, avatar_color, type, circle_id, title, body, sideA, sideB, poll_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, userId, username, avatarColor, type, circle_id, title, body || '', sideA || null, sideB || null, JSON.stringify(poll_data || null)],
            function(err) {
                if (err) {
                    console.error("Insert Error:", err.message);
                    return res.status(500).json({ error: 'Failed to publish post: ' + err.message });
                }
                
                // Broadcast new post
                const newPost = { id, user_id: userId, username, avatar_color: avatarColor, type, circle_id, title, body, sideA, sideB, poll_data: poll_data || null, created_at: new Date().toISOString(), votes: 0, dn: 0 };
                io.emit('newPost', newPost);

                db.run("UPDATE users SET peks = peks + 5 WHERE id = ?", [userId]);
                db.run("INSERT INTO peks_history (user_id, amt, reason) VALUES (?, ?, ?)", [userId, 5, 'Created a post ✍️']);
                res.json({ success: true });
            }
        );
    });
});

// Posts: Vote
app.post('/api/posts/:id/vote', authenticate, (req, res) => {
    const postId = req.params.id;
    const { type } = req.body; // 'up' or 'down'
    const userId = req.userId;

    db.get("SELECT type FROM post_votes WHERE user_id = ? AND post_id = ?", [userId, postId], (err, row) => {
        const existingType = row ? row.type : null;
        
        const updateCounts = () => {
            db.get("SELECT votes, dn, user_id FROM posts WHERE id = ?", [postId], (err, post) => {
                if (post) {
                    // Reward the poster for an upvote
                    if (type === 'up' && existingType !== 'up') {
                        db.run("UPDATE users SET peks = peks + 3 WHERE id = ?", [post.user_id]);
                        db.run("INSERT INTO peks_history (user_id, amt, reason) VALUES (?, ?, ?)", [post.user_id, 3, `Someone upvoted your post! ▲`]);
                    }
                    // Broadcast live update
                    io.emit('voteUpdate', { postId, votes: post.votes, dn: post.dn });
                    res.json({ success: true, votes: post.votes, dn: post.dn, userVote: existingType === type ? null : type });
                } else {
                    res.status(404).json({ error: 'Post not found' });
                }
            });
        };

        if (existingType) {
            if (existingType === type) {
                // Remove vote
                db.run("DELETE FROM post_votes WHERE user_id = ? AND post_id = ?", [userId, postId], () => {
                    db.run(`UPDATE posts SET ${type === 'up' ? 'votes = votes - 1' : 'dn = dn - 1'} WHERE id = ?`, [postId], updateCounts);
                });
            } else {
                // Switch vote
                db.run("UPDATE post_votes SET type = ? WHERE user_id = ? AND post_id = ?", [type, userId, postId], () => {
                    db.run(`UPDATE posts SET ${type === 'up' ? 'votes = votes + 1, dn = dn - 1' : 'dn = dn + 1, votes = votes - 1'} WHERE id = ?`, [postId], updateCounts);
                });
            }
        } else {
            // New vote
            db.run("INSERT INTO post_votes (user_id, post_id, type) VALUES (?, ?, ?)", [userId, postId, type], () => {
                db.run(`UPDATE posts SET ${type === 'up' ? 'votes = votes + 1' : 'dn = dn + 1'} WHERE id = ?`, [postId], updateCounts);
            });
        }
    });
});

// Posts: Comment
app.post('/api/posts/:id/comment', authenticate, (req, res) => {
    const postId = req.params.id;
    const { text } = req.body;
    const userId = req.userId;
    const username = req.username;

    db.get("SELECT avatar_color FROM users WHERE id = ?", [userId], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'User profile not found. Please log in again.' });
        }
        db.run("INSERT INTO comments (post_id, user_id, username, text, avatar_color) VALUES (?, ?, ?, ?, ?)",
            [postId, userId, username, text, user.avatar_color],
            function(err) {
                if (err) return res.status(500).json({ error: 'Failed to post comment' });
                
                const newComment = { id: this.lastID, post_id: postId, username, avatar_color: user.avatar_color, text, created_at: new Date().toISOString() };
                io.emit('newComment', newComment);

                db.run("UPDATE users SET peks = peks + 2 WHERE id = ?", [userId]);
                db.run("INSERT INTO peks_history (user_id, amt, reason) VALUES (?, ?, ?)", [userId, 2, 'Commented on a post 💬']);
                res.json({ id: this.lastID, username, avatar_color: user.avatar_color, text, created_at: new Date().toISOString() });
            }
        );
    });
});

app.get('/api/posts/:id/comments', (req, res) => {
    db.all("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at DESC", [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch comments' });
        res.json(rows);
    });
});

app.post('/api/posts/:id/poll-vote', authenticate, (req, res) => {
    const postId = req.params.id;
    const { optionIndex } = req.body;
    const userId = req.userId;

    db.get("SELECT * FROM posts WHERE id = ?", [postId], (err, post) => {
        if (!post || post.type !== 'poll') return res.status(404).json({ error: 'Poll not found' });
        
        const pollData = JSON.parse(post.poll_data || '{"options":[]}');
        
        db.get("SELECT option_index FROM poll_votes WHERE user_id = ? AND post_id = ?", [userId, postId], (err, row) => {
            if (row) return res.status(400).json({ error: 'You have already voted in this poll' });

            db.run("INSERT INTO poll_votes (user_id, post_id, option_index) VALUES (?, ?, ?)", [userId, postId, optionIndex], function(err) {
                if (err) return res.status(500).json({ error: 'Failed to cast vote' });
                
                // Update post data
                if (pollData.options[optionIndex]) {
                    pollData.options[optionIndex].votes = (pollData.options[optionIndex].votes || 0) + 1;
                    pollData.totalVotes = (pollData.totalVotes || 0) + 1;
                }

                db.run("UPDATE posts SET poll_data = ? WHERE id = ?", [JSON.stringify(pollData), postId], () => {
                    db.run("UPDATE users SET peks = peks + 8 WHERE id = ?", [userId]);
                    db.run("INSERT INTO peks_history (user_id, amt, reason) VALUES (?, ?, ?)", [userId, 8, 'Voted in a poll 📊']);
                    io.emit('pollUpdate', { postId, pollData });
                    res.json({ success: true, pollData });
                });
            });
        });
    });
});

// Circles
app.get('/api/circles', (req, res) => {
    db.all("SELECT * FROM circles", (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch circles' });
        res.json(rows);
    });
});

app.post('/api/circles/join', authenticate, (req, res) => {
    const { circle_id } = req.body;
    const userId = req.userId;

    db.run("INSERT OR IGNORE INTO user_circles (user_id, circle_id) VALUES (?, ?)", [userId, circle_id], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to join circle' });
        if (this.changes > 0) {
            db.run("UPDATE users SET peks = peks + 5 WHERE id = ?", [userId]);
            db.run("INSERT INTO peks_history (user_id, amt, reason) VALUES (?, ?, ?)", [userId, 5, 'Joined a circle 🏘️']);
            db.run("UPDATE circles SET members_count = members_count + 1 WHERE id = ?", [circle_id]);
        }
        res.json({ success: true });
    });
});

// User Profile & Stats
app.get('/api/user/profile', authenticate, (req, res) => {
    const userId = req.userId;
    db.get("SELECT id, username, email, peks, avatar_color, streak, last_login, created_at FROM users WHERE id = ?", [userId], (err, user) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch profile' });
        db.all("SELECT circle_id FROM user_circles WHERE user_id = ?", [userId], (err, circles) => {
            db.all("SELECT * FROM peks_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [userId], (err, history) => {
                db.all("SELECT badge_id FROM user_badges WHERE user_id = ?", [userId], (err, badges) => {
                    res.json({ 
                        user: { ...user, joinedCircles: circles.map(c => c.circle_id) },
                        history,
                        badges: badges.map(b => b.badge_id)
                    });
                });
            });
        });
    });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
    db.all("SELECT username as name, peks, avatar_color as av FROM users ORDER BY peks DESC LIMIT 12", (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch leaderboard' });
        res.json(rows);
    });
});

// Fallback to SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('A user connected');
});

http.listen(PORT, () => {
    console.log(`PëKœ Live Server running on port ${PORT}`);
});
