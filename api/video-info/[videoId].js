const express = require('express');
const router = express.Router();
const videoInfoRouter = require('../../routes/video-info');

// Create a new express app instance for the API route
const app = express();
app.use(express.json());
app.use('/api/video-info', videoInfoRouter);

module.exports = (req, res) => {
    // Forward the request to the router
    return app(req, res);
};
