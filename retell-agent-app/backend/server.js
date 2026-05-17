const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const agentRoutes = require('./routes/agent');
const callRoutes = require('./routes/calls');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI;
if (mongoUri && !mongoUri.includes('<username>')) {
  mongoose
    .connect(mongoUri)
    .then(() => console.log('[MongoDB] Connected successfully'))
    .catch((err) => console.error('[MongoDB] Connection error:', err.message));
} else {
  console.warn('[MongoDB] MONGO_URI not configured — call history will use in-memory storage only.');
}

app.use('/api/agent', agentRoutes);
app.use('/api/calls', callRoutes);

app.get('/', (req, res) => {
  res.send({ message: 'Retell AI Agent Interface backend is running.' });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
