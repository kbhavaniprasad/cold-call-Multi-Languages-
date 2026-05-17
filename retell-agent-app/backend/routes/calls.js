const express = require('express');
const mongoose = require('mongoose');
const Call = require('../models/Call');

const router = express.Router();

// In-memory fallback when MongoDB is not connected
const memStore = [];

const isDbReady = () => mongoose.connection.readyState === 1;

// ── GET /api/calls — list all calls (newest first) ──────────────────────────
router.get('/', async (req, res) => {
  try {
    if (isDbReady()) {
      const calls = await Call.find().sort({ createdAt: -1 }).lean();
      return res.json(calls);
    }
    return res.json(memStore.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (error) {
    res.status(500).json({ message: 'Unable to fetch calls', error: error.message });
  }
});

// ── GET /api/calls/analytics — aggregated stats ──────────────────────────────
router.get('/analytics', async (req, res) => {
  try {
    let calls;
    if (isDbReady()) {
      calls = await Call.find().lean();
    } else {
      calls = memStore;
    }

    const totalCalls = calls.length;
    const webCalls = calls.filter((c) => c.callType === 'web').length;
    const phoneCalls = calls.filter((c) => c.callType === 'phone').length;
    const totalDuration = calls.reduce((s, c) => s + (c.durationSeconds || 0), 0);
    const averageDuration = totalCalls ? Math.round(totalDuration / totalCalls) : 0;

    res.json({ totalCalls, webCalls, phoneCalls, averageDuration, totalDuration });
  } catch (error) {
    res.status(500).json({ message: 'Unable to compute analytics', error: error.message });
  }
});

// ── GET /api/calls/:callId — single call ────────────────────────────────────
router.get('/:callId', async (req, res) => {
  try {
    if (isDbReady()) {
      const call =
        (await Call.findOne({ callId: req.params.callId }).lean()) ||
        (await Call.findById(req.params.callId).lean().catch(() => null));
      if (!call) return res.status(404).json({ message: 'Call not found' });
      return res.json(call);
    }
    const call = memStore.find(
      (c) => c.callId === req.params.callId || c._id === req.params.callId
    );
    if (!call) return res.status(404).json({ message: 'Call not found' });
    res.json(call);
  } catch (error) {
    res.status(500).json({ message: 'Unable to fetch call', error: error.message });
  }
});

// ── POST /api/calls — save a completed call ──────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const payload = {
      ...req.body,
      endedAt: req.body.endedAt || new Date().toISOString(),
      status: req.body.status || 'ended',
    };

    if (isDbReady()) {
      // Upsert by callId so repeated saves don't create duplicates
      const filter = payload.callId ? { callId: payload.callId } : { _id: new mongoose.Types.ObjectId() };
      const call = await Call.findOneAndUpdate(filter, payload, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      });
      return res.status(201).json(call);
    }

    // In-memory fallback
    const existing = memStore.findIndex((c) => c.callId && c.callId === payload.callId);
    if (existing >= 0) {
      memStore[existing] = { ...memStore[existing], ...payload };
      return res.status(200).json(memStore[existing]);
    }
    const record = { ...payload, _id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString() };
    memStore.push(record);
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ message: 'Unable to save call', error: error.message });
  }
});

module.exports = router;
