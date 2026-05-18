const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const agentRoutes = require('./routes/agent');
const callRoutes = require('./routes/calls');
const Call = require('./models/Call');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

const migrateLegacyMessagesCollection = async () => {
  const legacyExists = await mongoose.connection.db
    .listCollections({ name: 'messages' })
    .hasNext();

  if (!legacyExists) return;

  const legacyDocs = await mongoose.connection.db.collection('messages').find({}).toArray();
  if (!legacyDocs.length) return;

  const operations = legacyDocs.map((doc) => ({
    updateOne: {
      filter: doc.callId ? { callId: doc.callId } : { _id: doc._id },
      update: { $setOnInsert: doc },
      upsert: true,
    },
  }));

  const result = await mongoose.connection.db.collection('calls').bulkWrite(operations, { ordered: false });
  console.log(`[MongoDB] Migrated ${result.upsertedCount || 0} legacy call record(s) from "messages" to "calls".`);
};

const mongoUri = process.env.MONGO_URI;
if (mongoUri && !mongoUri.includes('<username>')) {
  mongoose
    .connect(mongoUri)
    .then(async () => {
      await Call.init();
      await migrateLegacyMessagesCollection();
      console.log(`[MongoDB] Connected successfully. Using database "${mongoose.connection.name}" and collection "calls".`);
    })
    .catch((err) => console.error('[MongoDB] Connection error:', err.message));
} else {
  console.warn('[MongoDB] MONGO_URI not configured - call history will use in-memory storage only.');
}

app.use('/api/agent', agentRoutes);
app.use('/api/calls', callRoutes);

app.get('/', (req, res) => {
  res.send({ message: 'Retell AI Agent Interface backend is running.' });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
