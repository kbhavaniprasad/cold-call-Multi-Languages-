const express = require('express');
const axios = require('axios');

const router = express.Router();

// Build a Retell axios client — allow per-request API key override
const getRetellClient = (apiKeyOverride) => {
  const apiKey = apiKeyOverride || process.env.RETELL_API_KEY;
  const baseUrl = 'https://api.retellai.com';

  if (!apiKey) {
    throw new Error('Missing RETELL_API_KEY. Provide it in the request body or set the environment variable.');
  }

  return axios.create({
    baseURL: baseUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
};

// ── Specific POST routes MUST come before the wildcard GET /:agentId ──

router.post('/create-web-call', async (req, res) => {
  try {
    const agentId = req.body.agentId || process.env.RETELL_AGENT_ID;
    const apiKey  = req.body.apiKey  || process.env.RETELL_API_KEY;

    if (!agentId) {
      return res.status(400).json({ message: 'Missing agentId. Provide it in the request body or set RETELL_AGENT_ID.' });
    }
    if (!apiKey) {
      return res.status(400).json({ message: 'Missing apiKey. Provide it in the request body or set RETELL_API_KEY.' });
    }

    const client = getRetellClient(apiKey);

    // Retell v2 endpoint: POST /v2/create-web-call
    const response = await client.post('/v2/create-web-call', {
      agent_id: agentId,
    });

    res.status(201).json(response.data);
  } catch (error) {
    console.error('[create-web-call] error:', error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status || 500).json({
        message: 'Retell API error',
        details: error.response.data,
      });
    }
    res.status(500).json({ message: 'Unable to create web call', error: error.message });
  }
});

router.post('/register-call', async (req, res) => {
  try {
    const agentId   = req.body.agentId   || process.env.RETELL_AGENT_ID;
    const apiKey    = req.body.apiKey    || process.env.RETELL_API_KEY;
    const phoneNumber = req.body.phoneNumber;

    if (!agentId) {
      return res.status(400).json({ message: 'Missing agent ID in request body or RETELL_AGENT_ID environment variable' });
    }

    const client = getRetellClient(apiKey);
    const response = await client.post(`/agents/${agentId}/calls`, {
      phone_number: phoneNumber,
      metadata: req.body.metadata || {},
    });
    res.status(201).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status || 500).json({ message: 'Retell API error', details: error.response.data });
    }
    res.status(500).json({ message: 'Unable to register call', error: error.message });
  }
});

// ── Wildcard GET MUST be last to avoid shadowing the routes above ──

router.get('/:agentId', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const apiKey  = req.query.apiKey || process.env.RETELL_API_KEY;
    const client  = getRetellClient(apiKey);
    const response = await client.get(`/v2/get-agent/${agentId}`);
    res.json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status || 500).json({ message: 'Retell API error', details: error.response.data });
    }
    res.status(500).json({ message: 'Unable to load agent details', error: error.message });
  }
});

module.exports = router;
