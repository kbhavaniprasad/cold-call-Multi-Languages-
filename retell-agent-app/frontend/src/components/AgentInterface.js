import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { RetellWebClient } from 'retell-client-js-sdk';
import './component.css';

const AgentInterface = ({ onNewCall, apiUrl: propApiUrl }) => {
  const apiUrl = propApiUrl || process.env.REACT_APP_API_URL || 'https://cold-call-multi-languages.onrender.com/api';

  // call state: idle | loading | active | ending | ended | error
  const [callState, setCallState] = useState('idle');
  const [message,   setMessage]  = useState('Your Retell AI agent is ready. Click to start a voice call.');
  const [callId,    setCallId]   = useState(null);

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
  const addMessage = (role, content) => {
    const msg = { role, content, timestamp: new Date().toISOString() };
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
        agentId:         agentIdRef.current || '',
        callType:        'web',
        status:          'ended',
        durationSeconds: duration,
        messages:        messagesRef.current,
        transcript:      messagesRef.current.map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`).join('\n'),
        ...extraData,
      });
    } catch (err) {
      console.error('[saveCallToDb] Failed:', err.message);
    }
  };

  const startWebCall = async () => {
    try {
      setCallState('loading');
      setMessage('Requesting call from Retell AI…');
      setChatMessages([]);
      messagesRef.current = [];

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
      setMessage('Connecting voice…');

      // Step 2: create SDK client + register events
      const retellClient = new RetellWebClient();
      clientRef.current  = retellClient;

      retellClient.on('call_started', () => {
        callStartRef.current = Date.now();
        setCallState('active');
        setMessage('🎙️ Call is live — speak now!');
        console.log('[Retell] call_started');
      });

      retellClient.on('call_ended', async () => {
        setCallState('ended');
        setMessage('📵 Call ended.');
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
        setMessage('🤖 Agent is speaking…');
        console.log('[Retell] agent_start_talking');
      });

      retellClient.on('agent_stop_talking', () => {
        setAgentTalking(false);
        setMessage('🎙️ Your turn — speak now!');
        console.log('[Retell] agent_stop_talking');
      });

      // Real-time transcript updates
      retellClient.on('update', (update) => {
        console.log('[Retell] update:', update);
        if (!update) return;

        // Retell SDK emits transcript as an array of {role, content} objects
        if (Array.isArray(update.transcript)) {
          const newMessages = update.transcript.map((t) => ({
            role:      t.role === 'agent' ? 'agent' : 'user',
            content:   t.content,
            timestamp: new Date().toISOString(),
          }));
          messagesRef.current = newMessages;
          setChatMessages([...newMessages]);
        }

        // Some versions emit delta events with a single utterance
        if (update.turntaking && update.content) {
          addMessage(update.turntaking === 'agent' ? 'agent' : 'user', update.content);
        }
      });

      retellClient.on('error', (err) => {
        console.error('[Retell] SDK error:', err);
        setCallState('error');
        setMessage(`❌ SDK error: ${err?.message || JSON.stringify(err)}`);
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
      setMessage(`❌ ${detail}`);
      console.error('[AgentInterface] startWebCall failed:', error);
    }
  };

  const stopWebCall = async () => {
    if (clientRef.current) {
      setCallState('ending');
      setMessage('Ending call…');
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
        <h2>Agent Voice Interface</h2>

        {/* Live pulse indicator */}
        {isActive && (
          <div className="live-indicator">
            <span className="live-dot" />
            <span>LIVE</span>
          </div>
        )}

        <div className="action-row">
          {!isActive ? (
            <button
              id="start-voice-call-btn"
              onClick={startWebCall}
              disabled={isLoading || isEnding}
              className={`call-btn ${(isLoading || isEnding) ? 'btn-loading' : ''}`}
            >
              {isLoading ? (
                <><span className="spinner" /> Connecting…</>
              ) : isEnding ? (
                <><span className="spinner" /> Ending…</>
              ) : (
                <>📞 Start Voice Call</>
              )}
            </button>
          ) : (
            <button
              id="end-voice-call-btn"
              onClick={stopWebCall}
              className="call-btn call-btn-end"
            >
              📵 End Call
            </button>
          )}
        </div>

        <p className={`status-text status-${callState}`}>{message}</p>

        {callId && (
          <div className="call-info">
            <p><strong>Call ID:</strong> {callId}</p>
          </div>
        )}

        {/* ── Live Chat Transcript ─────────────────────────────── */}
        {showChat && (
          <div className="chat-container">
            <div className="chat-header">
              <span className="chat-title">💬 Live Conversation</span>
              <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                {chatMessages.length > 0 && (
                  <span className="chat-msg-count">{chatMessages.length} msg{chatMessages.length !== 1 ? 's' : ''}</span>
                )}
                {isActive && (
                  <span className={`speaker-badge ${agentTalking ? 'agent-speaking' : userTalking ? 'user-speaking' : ''}`}>
                    {agentTalking ? '🤖 Agent speaking' : '🎙️ Listening…'}
                  </span>
                )}
              </div>
            </div>

            <div className="chat-messages">
              {chatMessages.length === 0 ? (
                <div className="chat-empty">
                  <span>Waiting for conversation to start…</span>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`chat-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-agent'}`}
                  >
                    <span className="bubble-label">
                      {msg.role === 'user' ? '🧑 You' : '🤖 Agent'}
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
              <div className="chat-saved-note">✅ Conversation saved to history</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default AgentInterface;
