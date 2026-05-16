require('dotenv').config({ override: true });
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const db = require('./db');


if (!db) {
    console.error("CRITICAL: Database client not initialized. Check your .env file.");
    // We let the process stay alive so nodemon doesn't loop-crash, 
    // but the app won't function correctly.
}

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
    
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Session expired. Please login again.' });
        
        // Verify user exists in Supabase
        const { data: user, error } = await db.from('users').select('id').eq('id', decoded.id).single();
        if (error || !user) {
            return res.status(401).json({ error: 'User not found. Please log in again.' });
        }
        req.userId = decoded.id;
        req.username = decoded.username;
        next();
    });
};

// API ROUTES

// Auth: Login / Register
app.post('/api/auth/login', async (req, res) => {
    const { username, email } = req.body;
    if (!username || username.length < 2) return res.status(400).json({ error: 'Valid username required' });

    const { data: user, error } = await db.from('users').select('*').eq('username', username).maybeSingle();
    if (error) return res.status(500).json({ error: 'Database error' });

    if (user) {
        const today = new Date().toISOString().split('T')[0];
        let newStreak = user.streak;
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];

        if (user.last_login !== today) {
            if (user.last_login === yesterday) newStreak++;
            else newStreak = 1;
            await db.from('users').update({ streak: newStreak, last_login: today }).eq('id', user.id);
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { ...user, streak: newStreak } });
    } else {
        const avatarColor = ['#E8531F', '#7C3AED', '#0D9488', '#2563EB', '#10B981', '#F5A623', '#EF4444', '#00C9B1'][Math.floor(Math.random() * 8)];
        const today = new Date().toISOString().split('T')[0];
        
        const { data: newUser, error: insertError } = await db.from('users').insert([
            { username, email: email || '', peks: 100, avatar_color: avatarColor, streak: 1, last_login: today }
        ]).select().single();

        if (insertError) return res.status(500).json({ error: 'Failed to create user' });
        
        await db.from('user_badges').insert([{ user_id: newUser.id, badge_id: 'founder' }]);
        await db.from('peks_history').insert([{ user_id: newUser.id, amt: 100, reason: 'Welcome bonus — Founder! 🌟' }]);
        
        const token = jwt.sign({ id: newUser.id, username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { ...newUser } });
    }
});

// Posts: Get all with sort and type filtering
app.get('/api/posts', async (req, res) => {
    const { sort, type } = req.query;
    const token = req.headers['authorization'];
    let userId = null;
    
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.id;
        } catch(e) {}
    }

    let query = db.from('posts').select(`
        *,
        post_votes!left(type)
    `);

    if (type) {
        query = query.eq('type', type);
    }

    if (sort === 'top') {
        query = query.order('votes', { ascending: false });
    } else if (sort === 'hot') {
        // Simple hot sort for demo: votes - dn
        // Note: Real "hot" logic usually involves time decay
        query = query.order('votes', { ascending: false });
    } else {
        query = query.order('created_at', { ascending: false });
    }

    // Filters for user_vote separately if userId exists
    // Supabase can do joins, but to get a specific user's vote we often need a separate filter or a complex join.
    // For simplicity, we'll fetch posts and then map user votes if needed.
    const { data: posts, error } = await query.limit(100);

    if (error) {
        console.error("Fetch Error:", error.message);
        return res.status(500).json({ error: 'Failed to fetch posts' });
    }

    // If userId, fetch their votes for these posts
    let userVotes = {};
    if (userId && posts.length > 0) {
        const postIds = posts.map(p => p.id);
        const { data: votes } = await db.from('post_votes')
            .select('post_id, type')
            .eq('user_id', userId)
            .in('post_id', postIds);
        
        if (votes) {
            votes.forEach(v => { userVotes[v.post_id] = v.type; });
        }
    }

    res.json(posts.map(p => ({ 
        ...p, 
        poll_data: typeof p.poll_data === 'string' ? JSON.parse(p.poll_data) : p.poll_data,
        user_vote: userVotes[p.id] || null
    })));
});

// Posts: Create new
app.post('/api/posts', authenticate, async (req, res) => {
    const { id, type, circle_id, title, body, sideA, sideB, poll_data } = req.body;
    const userId = req.userId;
    const username = req.username;

    const { data: user, error: userError } = await db.from('users').select('avatar_color').eq('id', userId).single();
    if (userError || !user) {
        return res.status(401).json({ error: 'User profile not found. Please log in again.' });
    }

    const avatarColor = user.avatar_color || '#E8531F';
    const { error: insertError } = await db.from('posts').insert([
        { id, user_id: userId, username, avatar_color: avatarColor, type, circle_id, title, body: body || '', sideA: sideA || null, sideB: sideB || null, poll_data: poll_data || null }
    ]);

    if (insertError) {
        console.error("Insert Error:", insertError.message);
        return res.status(500).json({ error: 'Failed to publish post: ' + insertError.message });
    }
    
    // Broadcast new post
    const newPost = { id, user_id: userId, username, avatar_color: avatarColor, type, circle_id, title, body, sideA, sideB, poll_data: poll_data || null, created_at: new Date().toISOString(), votes: 0, dn: 0 };
    io.emit('newPost', newPost);

    await db.rpc('increment_peks', { user_id_param: userId, amount: 5 });
    await db.from('peks_history').insert([{ user_id: userId, amt: 5, reason: 'Created a post ✍️' }]);
    res.json({ success: true });
});

// Posts: Vote
app.post('/api/posts/:id/vote', authenticate, async (req, res) => {
    const postId = req.params.id;
    const { type } = req.body; // 'up' or 'down'
    const userId = req.userId;

    const { data: existingVote } = await db.from('post_votes').select('type').eq('user_id', userId).eq('post_id', postId).maybeSingle();
    const existingType = existingVote ? existingVote.type : null;

    const updateCounts = async () => {
        const { data: post } = await db.from('posts').select('votes, dn, user_id').eq('id', postId).single();
        if (post) {
            if (type === 'up' && existingType !== 'up') {
                await db.rpc('increment_peks', { user_id_param: post.user_id, amount: 3 });
                await db.from('peks_history').insert([{ user_id: post.user_id, amt: 3, reason: `Someone upvoted your post! ▲` }]);
            }
            io.emit('voteUpdate', { postId, votes: post.votes, dn: post.dn });
            res.json({ success: true, votes: post.votes, dn: post.dn, userVote: existingType === type ? null : type });
        } else {
            res.status(404).json({ error: 'Post not found' });
        }
    };

    if (existingType) {
        if (existingType === type) {
            await db.from('post_votes').delete().eq('user_id', userId).eq('post_id', postId);
            if (type === 'up') await db.rpc('decrement_votes', { post_id_param: postId });
            else await db.rpc('decrement_dn', { post_id_param: postId });
            await updateCounts();
        } else {
            await db.from('post_votes').update({ type }).eq('user_id', userId).eq('post_id', postId);
            if (type === 'up') {
                await db.rpc('increment_votes', { post_id_param: postId });
                await db.rpc('decrement_dn', { post_id_param: postId });
            } else {
                await db.rpc('increment_dn', { post_id_param: postId });
                await db.rpc('decrement_votes', { post_id_param: postId });
            }
            await updateCounts();
        }
    } else {
        await db.from('post_votes').insert([{ user_id: userId, post_id: postId, type }]);
        if (type === 'up') await db.rpc('increment_votes', { post_id_param: postId });
        else await db.rpc('increment_dn', { post_id_param: postId });
        await updateCounts();
    }
});

// Posts: Comment
app.post('/api/posts/:id/comment', authenticate, async (req, res) => {
    const postId = req.params.id;
    const { text } = req.body;
    const userId = req.userId;
    const username = req.username;

    const { data: user } = await db.from('users').select('avatar_color').eq('id', userId).single();
    if (!user) return res.status(401).json({ error: 'User profile not found' });

    const { data: comment, error } = await db.from('comments').insert([
        { post_id: postId, user_id: userId, username, text, avatar_color: user.avatar_color }
    ]).select().single();

    if (error) return res.status(500).json({ error: 'Failed to post comment' });
    
    io.emit('newComment', comment);

    await db.rpc('increment_peks', { user_id_param: userId, amount: 2 });
    await db.from('peks_history').insert([{ user_id: userId, amt: 2, reason: 'Commented on a post 💬' }]);
    res.json(comment);
});

app.get('/api/posts/:id/comments', async (req, res) => {
    const { data: comments, error } = await db.from('comments').select('*').eq('post_id', req.params.id).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to fetch comments' });
    res.json(comments);
});

app.post('/api/posts/:id/poll-vote', authenticate, async (req, res) => {
    const postId = req.params.id;
    const { optionIndex } = req.body;
    const userId = req.userId;

    const { data: post } = await db.from('posts').select('*').eq('id', postId).single();
    if (!post || post.type !== 'poll') return res.status(404).json({ error: 'Poll not found' });
    
    const pollData = (typeof post.poll_data === 'string' ? JSON.parse(post.poll_data) : post.poll_data) || { options: [] };
    
    const { data: existingVote } = await db.from('poll_votes').select('option_index').eq('user_id', userId).eq('post_id', postId).maybeSingle();
    if (existingVote) return res.status(400).json({ error: 'You have already voted in this poll' });

    const { error: voteError } = await db.from('poll_votes').insert([{ user_id: userId, post_id: postId, option_index: optionIndex }]);
    if (voteError) return res.status(500).json({ error: 'Failed to cast vote' });
    
    // Update poll data in DB
    if (pollData.options[optionIndex]) {
        pollData.options[optionIndex].votes = (pollData.options[optionIndex].votes || 0) + 1;
        pollData.totalVotes = (pollData.totalVotes || 0) + 1;
    }

    await db.from('posts').update({ poll_data: pollData }).eq('id', postId);
    await db.rpc('increment_peks', { user_id_param: userId, amount: 8 });
    await db.from('peks_history').insert([{ user_id: userId, amt: 8, reason: 'Voted in a poll 📊' }]);
    
    io.emit('pollUpdate', { postId, pollData });
    res.json({ success: true, pollData });
});

// Circles
app.get('/api/circles', async (req, res) => {
    const { data: circles, error } = await db.from('circles').select('*');
    if (error) return res.status(500).json({ error: 'Failed to fetch circles' });
    res.json(circles);
});

app.post('/api/circles/join', authenticate, async (req, res) => {
    const { circle_id } = req.body;
    const userId = req.userId;

    const { error, count } = await db.from('user_circles').insert([{ user_id: userId, circle_id }], { count: 'exact', ignoreDuplicates: true });
    
    // insert in Supabase with ignoreDuplicates doesn't return count of 'new' items easily in one go
    // we'll check if it was new by doing a count or just assuming success if no error
    if (!error) {
        await db.rpc('increment_peks', { user_id_param: userId, amount: 5 });
        await db.from('peks_history').insert([{ user_id: userId, amt: 5, reason: 'Joined a circle 🏘️' }]);
        await db.rpc('increment_circle_members', { circle_id_param: circle_id });
    }
    res.json({ success: true });
});

// User Profile & Stats
app.get('/api/user/profile', authenticate, async (req, res) => {
    const userId = req.userId;
    const { data: user, error: userError } = await db.from('users').select('id, username, email, peks, avatar_color, streak, last_login, created_at').eq('id', userId).single();
    if (userError) return res.status(500).json({ error: 'Failed to fetch profile' });

    const { data: circles } = await db.from('user_circles').select('circle_id').eq('user_id', userId);
    const { data: history } = await db.from('peks_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    const { data: badges } = await db.from('user_badges').select('badge_id').eq('user_id', userId);

    res.json({ 
        user: { ...user, joinedCircles: circles ? circles.map(c => c.circle_id) : [] },
        history: history || [],
        badges: badges ? badges.map(b => b.badge_id) : []
    });
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    const { data: rows, error } = await db.from('users').select('username, peks, avatar_color').order('peks', { ascending: false }).limit(12);
    if (error) return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    res.json(rows.map(r => ({ name: r.username, peks: r.peks, av: r.avatar_color })));
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
