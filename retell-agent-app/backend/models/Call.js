const mongoose = require('mongoose');

// Individual transcript message
const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'agent'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const CallSchema = new mongoose.Schema({
  callId: { type: String, unique: true, sparse: true },
  chatName: { type: String, default: 'Untitled call' },
  agentId: { type: String, default: '' },
  callType: { type: String, enum: ['web', 'phone'], default: 'web' },
  status: { type: String, default: 'ended' },
  transcript: { type: String, default: '' },
  messages: { type: [MessageSchema], default: [] },
  recordingUrl: { type: String, default: '' },
  durationSeconds: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
  metadata: { type: mongoose.Schema.Types.Mixed },
});

module.exports = mongoose.model('Call', CallSchema, 'calls');
