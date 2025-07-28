/**
 * Updated version of the course bot app
 * - Stores user and course data in CSV files
 * - Fixes session persistence
 * - Adds working dashboard, login, and course purchasing
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_API = process.env.OLLAMA_API || 'http://localhost:11434/api/chat';

const USERS_FILE = './users.csv';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
    secret: 'guvi-secret',
    resave: false,
    saveUninitialized: true
}));

const allCourses = ['Python Basics', 'Full Stack Web Dev', 'AI for Beginners', 'Data Science Pro'];

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) return {};
    const lines = fs.readFileSync(USERS_FILE, 'utf-8').trim().split('\n');
    const users = {};
    for (const line of lines) {
        // Use regex to split only on commas not inside brackets (for JSON)
        // This assumes the CSV format: email,name,preferences,orders,courses
        // where orders is always a JSON array (may contain commas)
        // and preferences/courses are pipe-separated
        const match = line.match(/^([^,]*),([^,]*),([^,]*),(\[.*\]),(.*)$/);
        if (!match) continue;
        const [, email, name, preferences, orders, courses] = match;
        users[email] = {
            email,
            name,
            preferences: preferences ? preferences.split('|') : [],
            orders: orders ? JSON.parse(orders) : [],
            courses: courses ? courses.split('|') : []
        };
    }
    return users;
}

function saveUsers(users) {
    const lines = Object.values(users).map(u => (
        `${u.email},${u.name},${u.preferences.join('|')},${JSON.stringify(u.orders)},${u.courses.join('|')}`
    ));
    fs.writeFileSync(USERS_FILE, lines.join('\n'));
}

const users = loadUsers();

function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email } = req.body;
    if (!users[email]) {
        users[email] = {
            email,
            name: email.split('@')[0],
            preferences: ['AI', 'Web Dev'],
            orders: [],
            courses: []
        };
    }
    req.session.user = users[email];
    saveUsers(users);
    res.redirect('/dashboard');
});

app.get('/dashboard', requireLogin, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});

app.get('/order', requireLogin, (req, res) => {
    res.render('order', { user: req.session.user, courses: allCourses });
});

app.post('/order', requireLogin, (req, res) => {
    const { course, simulateSuccess, error } = req.body;
    const user = req.session.user;

    const orderId = uuidv4().slice(0, 8);
    const success = simulateSuccess === 'true';

    const order = {
        id: orderId,
        course,
        status: success ? 'Confirmed' : 'Failed',
        reason: success ? null : (error || 'Unknown error')
    };

    user.orders.push(order);
    if (success && !user.courses.includes(course)) user.courses.push(course);

    users[user.email] = user;
    saveUsers(users);
    req.session.user = user;
    res.redirect('/dashboard');
});

app.get('/chat', requireLogin, (req, res) => {
    res.render('chat', { user: req.session.user });
});

app.post('/chat', requireLogin, async (req, res) => {
    const user = req.session.user;
    const { prompt, history } = req.body;

    const userDetails = `\n\n[USER DATA]\nName: ${user.name}\nCourses: ${user.courses.join(', ') || 'None'}\nOrders: ${user.orders.map(o => `${o.course} (${o.status})`).join(', ') || 'None'}\nPreferences: ${user.preferences.join(', ')}`;

    try {
        const systemMessage = {
            role: 'system',
            content: `You are a helpful and friendly GUVI AI assistant that helps customers ONLY with information about GUVI, such as courses, account, purchases, and support-related queries. Do NOT answer or recommend anything unrelated to GUVI, and do NOT direct customers to other platforms. Always answer as a friendly, knowledgeable assistant. The user details are attached in the prompt; use them to personalize your responses and help with course, order, or account questions. If you do not know the answer, say "please contact us at info@guvi.in for further assistance". I can help you with other questions related to GUVI courses or orders." DO NOT greet the user again if message history exists`
        };

        const ollamaRes = await fetch(OLLAMA_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' // Bypass ngrok browser warning screen
            },
            body: JSON.stringify({
                model: 'anjanafinetune:latest',
                messages: [
                    systemMessage,
                    ...history,
                    { role: 'user', content: prompt + userDetails }
                ],
                stream: true,
                options: { temperature: 0.7, top_p: 0.9 }
            })
        });

        res.setHeader('Content-Type', 'text/event-stream');
        for await (const chunk of ollamaRes.body) {
            res.write(chunk);
        }
        res.end();
    } catch (err) {
        res.status(500).json({ error: 'Streaming failed', details: err.message });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('Could not log out');
        res.redirect('/login');
    });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
