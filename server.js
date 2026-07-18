const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const captionsRouter = require('./routes/captions');
const chatRouter = require('./routes/chat');
const audioRouter = require('./routes/audio');

const app = express();

// Load environment variables
require('dotenv').config();

// Trust proxy for accurate IP detection behind reverse proxy
app.set('trust proxy', 1);

// Configure CORS based on environment
const isProd = process.env.NODE_ENV === 'production';
// Configure CORS
app.use(cors({
    origin: true, // Allow all origins
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: '*',
    exposedHeaders: ['Access-Control-Allow-Origin'],
    credentials: true
}));

// Add security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Configure rate limiting based on environment
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProd ? 50 : 100, // Stricter limits in production
    message: {
        error: 'Too many requests, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS' // Skip rate limiting for OPTIONS requests
});

// Apply rate limiting to API routes only
app.use('/api', limiter);

// Increase the limit for JSON body parser
app.use(express.json({ limit: '50mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Sanitize input middleware
app.use((req, res, next) => {
    if (req.body) {
        // Sanitize request body
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();
            }
        });
    }
    next();
});

// API Routes
app.use('/api/captions', captionsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/audio', audioRouter);
app.use('/api/providers/claude', require('./providers/claude').router);
app.use('/api/providers/google', require('./providers/google').router);

// Serve index.html for all non-API routes to support client-side routing
app.get('*', (req, res, next) => {
    // Skip API routes and static files
    if (req.url.startsWith('/api/') || path.extname(req.url)) {
        next();
        return;
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    
    // Don't expose internal error details in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.status(err.status || 500).json({
        error: isProduction ? 'Internal server error' : err.message,
        timestamp: new Date().toISOString()
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle SIGTERM signal
process.on('SIGTERM', () => {
    console.log('Received SIGTERM signal. Performing graceful shutdown...');
    process.exit(0);
});

// Handle SIGINT signal
process.on('SIGINT', () => {
    console.log('Received SIGINT signal. Performing graceful shutdown...');
    process.exit(0);
});

let server;

// Start the server if we're not in production or being imported
if (require.main === module) {
    const port = process.env.PORT || 3005;
    server = app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on port ${port}`);
        console.log('Ready to process YouTube video captions');
        // Send ready signal to PM2
        if (process.send) {
            process.send('ready');
        }
    });

    // Handle server errors
    server.on('error', (error) => {
        if (error.syscall !== 'listen') {
            console.error('Server error (non-listen):', error);
            throw error;
        }

        switch (error.code) {
            case 'EACCES':
                console.error(`Port ${port} requires elevated privileges`);
                process.exit(1);
                break;
            case 'EADDRINUSE':
                console.error(`Port ${port} is already in use. Details:`, error);
                // Try to get more information about what's using the port
                require('child_process').exec(`netstat -ano | findstr :${port}`, (err, stdout, stderr) => {
                    if (stdout) console.error(`Process using port ${port}:`, stdout);
                    if (stderr) console.error('Error checking port:', stderr);
                });
                process.exit(1);
                break;
            default:
                console.error('Unknown server error:', error);
                throw error;
        }
    });
}

// Export the Express app for serverless deployment
module.exports = app;
