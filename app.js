require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();
const port = 3000;
const { reconcilePendingContainers } = require('./services/startupSync');

// Global rate limiter: 100 requests per 15 minutes per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' }
});

app.use(limiter);
app.use(bodyParser.json());
app.use(cors());

// Serve static frontend files
app.use(express.static('public'));

const routes = require('./routes');
app.use('/api', routes);

app.listen(port, () => {
    console.log(`Backend server is running on port ${port}`);
});
