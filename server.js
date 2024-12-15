const express = require('express');
const cors = require('cors');
const captionsRouter = require('./routes/captions');
const chatRouter = require('./routes/chat');
const videoInfoRouter = require('./routes/video-info');

const app = express();
const port = 3001;

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Increase the limit for JSON body parser
app.use(express.json({ limit: '50mb' }));

app.use(express.static('.'));

// Middleware to log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/api/captions', captionsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/video-info', videoInfoRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message,
        timestamp: new Date().toISOString()
    });
});

// Start server
const server = app.listen(port, () => {
    console.log(`${new Date().toISOString()} - Server running at http://localhost:${port}`);
    console.log('Ready to process YouTube video captions');
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please try a different port or close the application using this port.`);
    }
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});
