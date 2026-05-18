import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { RetellWebClient } from 'retell-client-js-sdk';
import './component.css';

const AgentInterface = ({ onNewCall, apiUrl: propApiUrl }) => {
  const apiUrl = propApiUrl || process.env.REACT_APP_API_URL || 'https://cold-call-multi-languages.onrender.com/api';
  const storedUserName = localStorage.getItem('retellUserName') || 'User';

  const buildAutoChatName = (name = storedUserName, date = new Date()) => {
    const user = String(name || '').trim() || 'User';
    const stamp = date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${user} - ${stamp}`;
  };

  // call state: idle | loading | active | ending | ended | error
  const [callState, setCallState] = useState('idle');
  const [message,   setMessage]  = useState('Your Retell AI agent is ready. Click to start a voice call.');
  const [callId,    setCallId]   = useState(null);
  const [userName,  setUserName] = useState(storedUserName);
  const [chatName,  setChatName] = useState(buildAutoChatName(storedUserName));
  const [chatNameEdited, setChatNameEdited] = useState(false);

  // Chat transcript
  const [chatMessages, setChatMessages] = useState([]);
  const [agentTalking, setAgentTalking] = useState(false);
  const [userTalking,  setUserTalking]  = useState(false);

  // Timing
  const callStartRef   = useRef(null);
  const clientRef      = useRef(null);
  const chatEndRef     = useRef(null);
  const callIdRef      = useRef(null);
  const agentIdRef     = useRef(null);
  const messagesRef    = useRef([]);
  const chatNameRef    = useRef(buildAutoChatName(storedUserName));
  const userNameRef    = useRef(storedUserName);

  // Auto-scroll chat to bottom whenever messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        try { clientRef.current.stopCall(); } catch (_) {}
      }
    };
  }, []);

  // Helper: add a message to the live chat
  const normalizeRole = (role) => {
    const value = String(role || '').toLowerCase();
    return ['agent', 'assistant', 'bot', 'ai'].includes(value) ? 'agent' : 'user';
  };

  const normalizeTranscript = (transcript) => {
    if (!Array.isArray(transcript)) return [];

    return transcript
      .map((item) => ({
        role: normalizeRole(item.role || item.speaker),
        content: String(item.content || item.text || item.transcript || '').trim(),
        timestamp: item.timestamp || item.createdAt || new Date().toISOString(),
      }))
      .filter((item) => item.content);
  };

  const messageKey = (message) =>
    `${message.role}|${String(message.content || '').trim().toLowerCase()}`;

  const mergeMessages = (incomingMessages) => {
    if (!incomingMessages.length) return;

    const current = messagesRef.current;
    const looksLikeFullTranscript =
      !current.length ||
      messageKey(incomingMessages[0]) === messageKey(current[0]);

    if (looksLikeFullTranscript && incomingMessages.length >= current.length) {
      messagesRef.current = incomingMessages;
      setChatMessages([...incomingMessages]);
      return;
    }

    const seen = new Set(current.map(messageKey));
    const additions = incomingMessages.filter((item) => !seen.has(messageKey(item)));
    if (!additions.length) return;

    messagesRef.current = [...current, ...additions];
    setChatMessages([...messagesRef.current]);
  };

  const updateChatName = (value) => {
    setChatName(value);
    chatNameRef.current = value;
  };

  const updateUserName = (value) => {
    setUserName(value);
    userNameRef.current = value;
    localStorage.setItem('retellUserName', value);

    if (!chatNameEdited && callState === 'idle') {
      updateChatName(buildAutoChatName(value));
    }
  };

  const addMessage = (role, content) => {
    const text = String(content || '').trim();
    if (!text) return;

    const msg = { role: normalizeRole(role), content: text, timestamp: new Date().toISOString() };
    if (messagesRef.current.some((item) => messageKey(item) === messageKey(msg))) return;
    messagesRef.current = [...messagesRef.current, msg];
    setChatMessages([...messagesRef.current]);
  };

  // Save completed call to backend DB
  const saveCallToDb = async (extraData = {}) => {
    try {
      const duration = callStartRef.current
        ? Math.round((Date.now() - callStartRef.current) / 1000)
        : 0;

      await axios.post(`${apiUrl}/calls`, {
        callId:          callIdRef.current,
        chatName:        chatNameRef.current.trim() || buildAutoChatName(userNameRef.current),
        agentId:         agentIdRef.current || '',
        callType:        'web',
        status:          'ended',
        durationSeconds: duration,
        messages:        messagesRef.current,
        transcript:      messagesRef.current.map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`).join('\n'),
        metadata:         {
          savedFrom: 'retell-web-client',
          userName: userNameRef.current,
          messageCount: messagesRef.current.length,
        },
        ...extraData,
      });
    } catch (err) {
      console.error('[saveCallToDb] Failed:', err.message);
    }
  };

  const startWebCall = async () => {
    try {
      setCallState('loading');
      setMessage('Requesting call from Retell AI...');
      setChatMessages([]);
      messagesRef.current = [];
      setChatNameEdited(false);
      updateChatName(buildAutoChatName(userNameRef.current));

      // Step 1: get access_token from backend
      const { data } = await axios.post(`${apiUrl}/agent/create-web-call`);
      const accessToken = data.access_token;
      const newCallId   = data.call_id;

      if (!accessToken) {
        throw new Error('No access_token returned from backend. Check RETELL_API_KEY and RETELL_AGENT_ID in .env');
      }

      callIdRef.current  = newCallId;
      agentIdRef.current = data.agent_id || process.env.REACT_APP_AGENT_ID || '';
      setCallId(newCallId);
      setMessage('Connecting voice...');

      // Step 2: create SDK client + register events
      const retellClient = new RetellWebClient();
      clientRef.current  = retellClient;

      retellClient.on('call_started', () => {
        callStartRef.current = Date.now();
        setCallState('active');
        setMessage('Call is live. Speak now.');
        console.log('[Retell] call_started');
      });

      retellClient.on('call_ended', async () => {
        setCallState('ended');
        setMessage('Call ended. Conversation saved to history.');
        clientRef.current = null;
        setAgentTalking(false);
        setUserTalking(false);
        await saveCallToDb();
        onNewCall?.();
        console.log('[Retell] call_ended');
      });

      retellClient.on('agent_start_talking', () => {
        setAgentTalking(true);
        setUserTalking(false);
        setMessage('Agent is speaking.');
        console.log('[Retell] agent_start_talking');
      });

      retellClient.on('agent_stop_talking', () => {
        setAgentTalking(false);
        setMessage('Your turn. Speak now.');
        console.log('[Retell] agent_stop_talking');
      });

      // Real-time transcript updates
      retellClient.on('update', (update) => {
        console.log('[Retell] update:', update);
        if (!update) return;

        if (Array.isArray(update.transcript)) {
          const newMessages = normalizeTranscript(update.transcript);
          mergeMessages(newMessages);
        }

        const singleContent = update.content || update.text || update.transcript_delta;
        const singleRole = update.turntaking || update.role || update.speaker;
        if (singleContent) {
          addMessage(singleRole, singleContent);
          setUserTalking(normalizeRole(singleRole) === 'user');
        }
      });

      retellClient.on('error', (err) => {
        console.error('[Retell] SDK error:', err);
        setCallState('error');
        setMessage(`SDK error: ${err?.message || JSON.stringify(err)}`);
        clientRef.current = null;
      });

      // Step 3: start WebRTC session
      await retellClient.startCall({ accessToken });

    } catch (error) {
      setCallState('error');
      const detail =
        error.response?.data?.details?.message ||
        error.response?.data?.message ||
        error.message ||
        'Unknown error';
      setMessage(detail);
      console.error('[AgentInterface] startWebCall failed:', error);
    }
  };

  const stopWebCall = async () => {
    if (clientRef.current) {
      setCallState('ending');
      setMessage('Ending call...');
      try { clientRef.current.stopCall(); } catch (_) {}
      clientRef.current = null;
    }
  };

  const isActive  = callState === 'active';
  const isLoading = callState === 'loading';
  const isEnding  = callState === 'ending';
  const isEnded   = callState === 'ended';
  const showChat  = chatMessages.length > 0 || isActive;

  return (
    <section className="agent-panel">
      <div className="agent-card">
        <div className="agent-heading">
          <div>
            <p className="eyebrow">Retell web call</p>
            <h2>Voice Workspace</h2>
          </div>

          <div className={`call-state-pill pill-${callState}`}>
            {isActive && <span className="live-dot" />}
            <span>{callState}</span>
          </div>
        </div>

        <div className="call-setup-grid">
          <label className="chat-name-field">
            <span>User name</span>
            <input
              value={userName}
              onChange={(event) => updateUserName(event.target.value)}
              placeholder="Enter user name"
            />
          </label>

          <label className="chat-name-field">
            <span>Chat name</span>
            <input
              value={chatName}
              onChange={(event) => {
                setChatNameEdited(true);
                updateChatName(event.target.value);
              }}
              placeholder={buildAutoChatName(userName)}
            />
          </label>
        </div>

        <div className="action-row">
          {!isActive ? (
            <button
              id="start-voice-call-btn"
              onClick={startWebCall}
              disabled={isLoading || isEnding}
              className={`call-btn ${(isLoading || isEnding) ? 'btn-loading' : ''}`}
            >
              {isLoading ? (
                <><span className="spinner" /> Connecting...</>
              ) : isEnding ? (
                <><span className="spinner" /> Ending...</>
              ) : (
                <>Start Voice Call</>
              )}
            </button>
          ) : (
            <button
              id="end-voice-call-btn"
              onClick={stopWebCall}
              className="call-btn call-btn-end"
            >
              End Call
            </button>
          )}
        </div>

        <p className={`status-text status-${callState}`}>{message}</p>

        {callId && (
          <div className="call-info">
            <p><strong>Name:</strong> {chatName.trim() || 'Untitled call'}</p>
            <p><strong>Call ID:</strong> {callId}</p>
          </div>
        )}

        {/* ── Live Chat Transcript ─────────────────────────────── */}
        {showChat && (
          <div className="chat-container">
            <div className="chat-header">
              <span className="chat-title">Live Conversation</span>
              <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                {chatMessages.length > 0 && (
                  <span className="chat-msg-count">{chatMessages.length} msg{chatMessages.length !== 1 ? 's' : ''}</span>
                )}
                {isActive && (
                  <span className={`speaker-badge ${agentTalking ? 'agent-speaking' : userTalking ? 'user-speaking' : ''}`}>
                    {agentTalking ? 'Agent speaking' : 'Listening'}
                  </span>
                )}
              </div>
            </div>

            <div className="chat-messages">
              {chatMessages.length === 0 ? (
                <div className="chat-empty">
                  <span>Waiting for conversation to start...</span>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`chat-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-agent'}`}
                  >
                    <span className="bubble-label">
                      {msg.role === 'user' ? 'You' : 'Agent'}
                      {msg.timestamp && (
                        <span className="bubble-time">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                    </span>
                    <p className="bubble-text">{msg.content}</p>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {isEnded && chatMessages.length > 0 && (
              <div className="chat-saved-note">Conversation saved to history</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default AgentInterface;
