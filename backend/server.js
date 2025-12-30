require('./tracing');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const Task = require('./models/Task');
const { startTelemetryCron } = require('./chronos');

const app = express();
const PORT = process.env.PORT || 3000;

const { Worker } = require('worker_threads');
const path = require('path');

// Environment validation
if (!process.env.MONGO_URI && process.env.NODE_ENV === 'production') {
    console.error('FATAL: MONGO_URI environment variable is required in production');
    process.exit(1);
}

// Security Middleware
app.use(helmet());
app.use(compression());

// CORS Configuration for Railway
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests from Railway frontend or no origin (same-origin)
        const allowedOrigins = [
            'https://frontend-production-0d0e.up.railway.app',
            /\.railway\.app$/  // Allow any Railway subdomain
        ];

        if (!origin || allowedOrigins.some(allowed =>
            typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
        )) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all for now, can restrict later
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Custom Body Parsing Middleware
const parseBody = (req, res, next) => {
    // Check if content-type is json
    if (req.headers['content-type'] !== 'application/json') {
        return next();
    }

    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const LIMIT_30MB = 30 * 1024 * 1024; // 30MB

    // Small payload: Use standard express.json()
    if (contentLength < LIMIT_30MB) {
        return express.json()(req, res, next);
    }

    // Large payload: Buffer and use Worker Thread
    console.log(`Large payload detected (${contentLength} bytes). Offloading to Worker Thread...`);

    let fragments = [];
    req.on('data', (chunk) => {
        fragments.push(chunk);
    });

    req.on('end', () => {
        const buffer = Buffer.concat(fragments);
        const rawBody = buffer.toString();

        const worker = new Worker(path.join(__dirname, 'json-worker.js'), {
            workerData: rawBody
        });

        worker.on('message', (message) => {
            if (message.success) {
                req.body = message.data;
                console.log(`Worker parsed JSON in ${message.duration}ms`);
                next();
            } else {
                res.status(400).json({ error: 'Invalid JSON', details: message.error });
            }
        });

        worker.on('error', (err) => {
            console.error('Worker error:', err);
            res.status(500).json({ error: 'Internal Server Error during parsing' });
        });

        worker.on('exit', (code) => {
            if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
        });
    });
};

app.use(parseBody);

// Database Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tasks-db')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Routes

// GET all tasks
app.get('/api/tasks', async (req, res) => {
    const { user } = req.query;
    console.log('GET /api/tasks called', { query: req.query });
    try {
        const filter = user ? { user } : {};
        const tasks = await Task.find(filter).sort({ createdAt: -1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new task (With Validation)
app.post('/api/tasks', async (req, res) => {
    try {
        const { title, user } = req.body;
        console.log('Backend received POST /api/tasks:', req.body);
        if (!user || typeof user !== 'string' || user.trim().length === 0) {
            return res.status(400).json({ error: 'User is required and must be a non-empty string.' });
        }
        // --- Validation Step ---
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({
                error: 'Validation Failed: "title" is required and must be a non-empty string.'
            });
        }
        // Reject SSN patterns (e.g., 123-45-6789 or 123456789)
        const ssnRegex = /^(\d{3}-\d{2}-\d{4}|\d{9})$/;
        // Reject credit card patterns (16 digits, optionally spaced)
        const ccRegex = /^(?:\d{4}[- ]?){3}\d{4}$/;
        if (ssnRegex.test(title.replace(/\s+/g, '')) || ccRegex.test(title.replace(/\s+/g, ''))) {
            return res.status(400).json({
                error: 'Validation Failed: title cannot contain SSN or credit card numbers.',
                critical: true
            });
        }
        // Check if task with same title exists
        const existingTask = await Task.findOne({ title, user });
        if (existingTask) {
            // Atomically update only the updatedAt field, preserving createdAt
            const updatedTask = await Task.findOneAndUpdate(
                { _id: existingTask._id },
                { $set: { updatedAt: Date.now() } },
                { new: true }
            );
            console.log('Task exists, updatedAt set to', updatedTask.updatedAt);

            // Fetch all tasks for this user to return
            const allTasks = await Task.find({ user }).sort({ createdAt: -1 });
            return res.json({ task: updatedTask, allTasks });
        }
        // Create new task
        const newTask = new Task({ title, user });
        const savedTask = await newTask.save();

        // Fetch all tasks for this user to return
        const allTasks = await Task.find({ user }).sort({ createdAt: -1 });

        res.status(201).json({ task: savedTask, allTasks });
        // -----------------------


    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE a task by ID
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req.query;
        console.log('Backend received DELETE /api/tasks/:id', { id, user });
        const task = await Task.findById(id);
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (user && task.user !== user) {
            return res.status(403).json({ error: 'Not authorized to delete this task' });
        }
        await Task.findByIdAndDelete(id);

        // Return updated list for the user
        // Note: 'user' should be passed in query param for DELETE as well to know whose tasks to fetch
        const filter = user ? { user } : {};
        const allTasks = await Task.find(filter).sort({ createdAt: -1 });

        res.json({ success: true, allTasks });
    } catch (err) {
        console.error('Delete task error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    startTelemetryCron();
});

