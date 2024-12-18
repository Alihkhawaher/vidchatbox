const express = require('express');
const cors = require('cors');
const captionsRouter = require('./routes/captions');
const chatRouter = require('./routes/chat');

const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Increase the limit for JSON body parser
app.use(express.json({ limit: '50mb' }));

// Serve static files from public directory
app.use(express.static('public'));

// Middleware to log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/api/captions', captionsRouter);
app.use('/api/chat', chatRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message,
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
