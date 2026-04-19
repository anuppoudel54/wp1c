require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());

// Serve static frontend files
app.use(express.static('public'));

const routes = require('./routes');
app.use('/api', routes);

app.listen(port, () => {
    console.log(`Backend server is running on port ${port}`);
});
