const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Call = require('../models/Call');

const router = express.Router();

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'calls.json');
const readFileStore = () => {
  try {
    if (!fs.existsSync(dataFile)) return [];
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[CallStore] Unable to read file store:', error.message);
    return [];
  }
};
const writeFileStore = (calls) => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(calls, null, 2));
};

const memStore = readFileStore();
const COLLECTION_NAME = 'calls';

const isDbReady = () => mongoose.connection.readyState === 1;

const toIsoDate = (value, fallback = new Date()) => {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const cleanText = (value) => {
  if (value == null) return '';
  return typeof value === 'string' ? value.trim() : String(value).trim();
};

const normalizeRole = (role) => {
  const value = cleanText(role).toLowerCase();
  if (['agent', 'assistant', 'bot', 'ai'].includes(value)) return 'agent';
  return 'user';
};

const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((message) => ({
      role: normalizeRole(message.role || message.speaker),
      content: cleanText(message.content || message.text || message.transcript),
      timestamp: toIsoDate(message.timestamp || message.createdAt || message.time),
    }))
    .filter((message) => message.content);
};

const transcriptFromMessages = (messages) =>
  messages
    .map((message) => `${message.role === 'user' ? 'User' : 'Agent'}: ${message.content}`)
    .join('\n');

const normalizeCall = (body = {}) => {
  const messages = normalizeMessages(body.messages);
  const transcript = cleanText(body.transcript) || transcriptFromMessages(messages);
  const now = new Date();

  return {
    callId: cleanText(body.callId || body.call_id),
    chatName: cleanText(body.chatName || body.chat_name) || 'Untitled call',
    agentId: cleanText(body.agentId || body.agent_id),
    callType: body.callType === 'phone' ? 'phone' : 'web',
    status: cleanText(body.status) || 'ended',
    transcript,
    messages,
    recordingUrl: cleanText(body.recordingUrl || body.recording_url),
    durationSeconds: Math.max(0, Math.round(Number(body.durationSeconds || body.duration_seconds || 0))),
    createdAt: toIsoDate(body.createdAt || body.startTimestamp || body.start_timestamp, now),
    endedAt: toIsoDate(body.endedAt || body.endTimestamp || body.end_timestamp, now),
    metadata: body.metadata || {},
  };
};

const getAllCalls = async () => {
  if (isDbReady()) {
    return Call.find().sort({ createdAt: -1 }).lean();
  }

  return memStore.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

router.get('/', async (req, res) => {
  try {
    res.json(await getAllCalls());
  } catch (error) {
    res.status(500).json({ message: 'Unable to fetch calls', error: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const calls = await getAllCalls();
    const totalCalls = calls.length;
    const webCalls = calls.filter((call) => call.callType === 'web').length;
    const phoneCalls = calls.filter((call) => call.callType === 'phone').length;
    const totalDuration = calls.reduce((sum, call) => sum + (call.durationSeconds || 0), 0);
    const averageDuration = totalCalls ? Math.round(totalDuration / totalCalls) : 0;
    const withTranscript = calls.filter((call) => (call.messages || []).length || call.transcript).length;

    res.json({
      totalCalls,
      webCalls,
      phoneCalls,
      averageDuration,
      totalDuration,
      withTranscript,
      collection: COLLECTION_NAME,
      storage: isDbReady() ? 'mongodb' : 'file',
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to compute analytics', error: error.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const connected = isDbReady();
    const count = connected ? await Call.countDocuments() : memStore.length;

    res.json({
      connected,
      storage: connected ? 'mongodb' : 'file',
      database: connected ? mongoose.connection.name : null,
      collection: COLLECTION_NAME,
      fallbackFile: connected ? null : dataFile,
      count,
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to read call storage status', error: error.message });
  }
});

router.patch('/:callId/name', async (req, res) => {
  try {
    const { callId } = req.params;
    const chatName = cleanText(req.body.chatName || req.body.chat_name);
    if (!chatName) return res.status(400).json({ message: 'chatName is required' });

    if (isDbReady()) {
      const filter = mongoose.Types.ObjectId.isValid(callId)
        ? { $or: [{ callId }, { _id: callId }] }
        : { callId };
      const call = await Call.findOneAndUpdate(filter, { chatName }, { new: true, runValidators: true });
      if (!call) return res.status(404).json({ message: 'Call not found' });
      return res.json(call);
    }

    const index = memStore.findIndex((item) => item.callId === callId || item._id === callId);
    if (index < 0) return res.status(404).json({ message: 'Call not found' });

    memStore[index] = { ...memStore[index], chatName };
    writeFileStore(memStore);
    res.json(memStore[index]);
  } catch (error) {
    res.status(400).json({ message: 'Unable to update chat name', error: error.message });
  }
});

router.get('/:callId', async (req, res) => {
  try {
    const { callId } = req.params;

    if (isDbReady()) {
      const call =
        (await Call.findOne({ callId }).lean()) ||
        (mongoose.Types.ObjectId.isValid(callId)
          ? await Call.findById(callId).lean()
          : null);

      if (!call) return res.status(404).json({ message: 'Call not found' });
      return res.json(call);
    }

    const call = memStore.find((item) => item.callId === callId || item._id === callId);
    if (!call) return res.status(404).json({ message: 'Call not found' });
    res.json(call);
  } catch (error) {
    res.status(500).json({ message: 'Unable to fetch call', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = normalizeCall(req.body);

    if (isDbReady()) {
      const filter = payload.callId ? { callId: payload.callId } : { _id: new mongoose.Types.ObjectId() };
      const call = await Call.findOneAndUpdate(filter, payload, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      });
      return res.status(201).json(call);
    }

    const existing = memStore.findIndex((call) => call.callId && call.callId === payload.callId);
    if (existing >= 0) {
      memStore[existing] = { ...memStore[existing], ...payload };
      writeFileStore(memStore);
      return res.status(200).json(memStore[existing]);
    }

    const record = {
      ...payload,
      _id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    memStore.push(record);
    writeFileStore(memStore);
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ message: 'Unable to save call', error: error.message });
  }
});

module.exports = router;
