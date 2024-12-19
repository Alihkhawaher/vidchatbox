const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const captionsRouter = require('./routes/captions');
const chatRouter = require('./routes/chat');

const app = express();

// Load environment variables
require('dotenv').config();

// Configure CORS based on environment
const isProd = process.env.NODE_ENV === 'production';
const corsOptions = {
    origin: isProd ? 'https://youtube-summarizer.vercel.app' : 'http://localhost:3005',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'x-api-key',
        'X-Requested-With',
        'Accept',
        'Accept-Version',
        'Content-Length',
        'Content-MD5',
        'Date',
        'X-Api-Version'
    ],
    credentials: true
};

app.use(cors(corsOptions));

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
app.use(express.static('public'));

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

// Start the server if we're not in production or being imported
if (require.main === module) {
    const port = process.env.PORT || 3005;
    app.listen(port, () => {
        console.log(`${new Date().toISOString()} - Server running at http://localhost:${port}`);
        console.log('Ready to process YouTube video captions');
    });
}

// Export the Express app for serverless deployment
module.exports = app;
