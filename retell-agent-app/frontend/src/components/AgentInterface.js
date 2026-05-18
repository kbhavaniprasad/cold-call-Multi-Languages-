import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { RetellWebClient } from 'retell-client-js-sdk';
import './component.css';

const AgentInterface = ({ onNewCall, onLiveAnalytics, apiUrl: propApiUrl }) => {
  const apiUrl = propApiUrl || process.env.REACT_APP_API_URL || 'https://cold-call-multi-languages.onrender.com/api';

  const [callState, setCallState] = useState('idle');
  const [message, setMessage] = useState('Your Retell AI agent is ready. Click to start a voice call.');
  const [callId, setCallId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [agentTalking, setAgentTalking] = useState(false);
  const [userTalking, setUserTalking] = useState(false);

  const callStartRef = useRef(null);
  const clientRef = useRef(null);
  const chatEndRef = useRef(null);
  const callIdRef = useRef(null);
  const agentIdRef = useRef(null);
  const messagesRef = useRef([]);
  const pendingMessageRef = useRef(null);
  const metricsRef = useRef({
    activeCalls: 0,
    userSpeakingSeconds: 0,
    aiSpeakingSeconds: 0,
    engagementScore: 0,
  });
  const userSpeakingStartRef = useRef(null);
  const agentSpeakingStartRef = useRef(null);

  function publishLiveAnalytics() {
    const now = Date.now();
    const activeDuration = callStartRef.current ? Math.round((now - callStartRef.current) / 1000) : 0;
    const liveUserSeconds = userSpeakingStartRef.current
      ? Math.round((now - userSpeakingStartRef.current) / 1000)
      : 0;
    const liveAgentSeconds = agentSpeakingStartRef.current
      ? Math.round((now - agentSpeakingStartRef.current) / 1000)
      : 0;
    const userSpeakingSeconds = metricsRef.current.userSpeakingSeconds + liveUserSeconds;
    const aiSpeakingSeconds = metricsRef.current.aiSpeakingSeconds + liveAgentSeconds;
    const finalizedMessages = messagesRef.current.length;
    const engagementScore = Math.min(100, Math.round((finalizedMessages * 12) + (userSpeakingSeconds * 1.5)));

    onLiveAnalytics?.({
      activeCalls: callState === 'active' ? 1 : 0,
      activeDuration,
      userSpeakingSeconds,
      aiSpeakingSeconds,
      engagementScore,
      liveFinalMessages: finalizedMessages,
      hasLiveTranscript: Boolean(pendingMessageRef.current),
    });
  }

  const stopUserSpeakingTimer = () => {
    if (!userSpeakingStartRef.current) return;
    metricsRef.current.userSpeakingSeconds += Math.round((Date.now() - userSpeakingStartRef.current) / 1000);
    userSpeakingStartRef.current = null;
  };

  const stopAgentSpeakingTimer = () => {
    if (!agentSpeakingStartRef.current) return;
    metricsRef.current.aiSpeakingSeconds += Math.round((Date.now() - agentSpeakingStartRef.current) / 1000);
    agentSpeakingStartRef.current = null;
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        try { clientRef.current.stopCall(); } catch (_) {}
      }
    };
  }, []);

  useEffect(() => {
    if (callState !== 'active') return undefined;

    const timer = setInterval(() => {
      publishLiveAnalytics();
    }, 1000);

    return () => clearInterval(timer);
  }, [callState]);

  const normalizeRole = (role) => {
    const value = String(role || '').toLowerCase();
    return ['agent', 'assistant', 'bot', 'ai'].includes(value) ? 'agent' : 'user';
  };

  const cleanContent = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\b(\w+)(\s+\1\b)+/gi, '$1')
      .trim();

  const fillerWords = new Set([
    'yeah',
    'yea',
    'yes',
    'yep',
    'uh',
    'um',
    'umm',
    'hmm',
    'ah',
    'oh',
    'okay',
    'ok',
    'like',
  ]);

  const stripFillers = (value) =>
    cleanContent(value)
      .split(/\s+/)
      .filter((word) => !fillerWords.has(word.toLowerCase().replace(/[^a-z]/g, '')))
      .join(' ')
      .trim();

  const isFillerOnly = (value) => !stripFillers(value);

  const messageKey = (message) =>
    `${message.role}|${cleanContent(message.content).toLowerCase()}`;

  const renderMessages = () => {
    const pending = pendingMessageRef.current;
    setChatMessages(pending ? [...messagesRef.current, { ...pending, pending: true }] : [...messagesRef.current]);
  };

  const commitMessage = (message) => {
    const content = cleanContent(message.content);
    if (!content || isFillerOnly(content)) return;

    const next = {
      role: normalizeRole(message.role),
      content,
      timestamp: message.timestamp || new Date().toISOString(),
    };

    const current = messagesRef.current;
    const last = current[current.length - 1];
    if (last && last.role === next.role) {
      const lastText = cleanContent(last.content).toLowerCase();
      const nextText = content.toLowerCase();

      if (lastText === nextText) return;
      if (nextText.startsWith(lastText)) {
        messagesRef.current = [...current.slice(0, -1), next];
        return;
      }
      if (lastText.startsWith(nextText)) return;
    }

    if (current.some((item) => messageKey(item) === messageKey(next))) return;
    messagesRef.current = [...current, next];
  };

  const commitPendingMessage = () => {
    if (!pendingMessageRef.current) return;

    commitMessage(pendingMessageRef.current);
    pendingMessageRef.current = null;
    renderMessages();
  };

  const updatePartialMessage = (role, content, timestamp) => {
    const text = cleanContent(content);
    if (!text) return;

    const normalizedRole = normalizeRole(role);
    if (pendingMessageRef.current && pendingMessageRef.current.role !== normalizedRole) {
      commitPendingMessage();
    }

    pendingMessageRef.current = {
      role: normalizedRole,
      content: text,
      timestamp: timestamp || pendingMessageRef.current?.timestamp || new Date().toISOString(),
    };
    renderMessages();
  };

  const handleTranscriptMessage = (role, content, options = {}) => {
    const text = cleanContent(content);
    if (!text) return;

    const normalizedRole = normalizeRole(role);
    if (options.final) {
      if (pendingMessageRef.current?.role === normalizedRole) {
        pendingMessageRef.current = null;
      }
      commitMessage({ role: normalizedRole, content: text, timestamp: options.timestamp });
      if (normalizedRole === 'user') stopUserSpeakingTimer();
      if (normalizedRole === 'agent') stopAgentSpeakingTimer();
      renderMessages();
      publishLiveAnalytics();
      return;
    }

    updatePartialMessage(normalizedRole, text, options.timestamp);
    if (normalizedRole === 'user') {
      setUserTalking(true);
      if (!userSpeakingStartRef.current) userSpeakingStartRef.current = Date.now();
    } else {
      setAgentTalking(true);
      if (!agentSpeakingStartRef.current) agentSpeakingStartRef.current = Date.now();
    }
    publishLiveAnalytics();
  };

  const isFinalTranscript = (item = {}, update = {}) =>
    item.is_final === true ||
    item.final === true ||
    item.isFinal === true ||
    update.is_final === true ||
    update.final === true ||
    update.transcript_final === true ||
    update.status === 'final';

  const normalizeTranscript = (transcript) => {
    if (!Array.isArray(transcript)) return [];

    return transcript
      .map((item) => ({
        role: normalizeRole(item.role || item.speaker),
        content: cleanContent(item.content || item.text || item.transcript),
        timestamp: item.timestamp || item.createdAt || new Date().toISOString(),
        final: item.is_final === true || item.final === true || item.isFinal === true,
      }))
      .filter((item) => item.content);
  };

  const cleanSavedContent = (value) => {
    const withoutFragments = cleanContent(value)
      .replace(/\b(i|a)\s*\.\s*/gi, '')
      .replace(/\b(yeah|uh|um|umm|hmm|ah|oh|okay|ok)[,.]?\s*/gi, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .replace(/([,.!?]){2,}/g, '$1')
      .trim();

    if (!withoutFragments) return '';
    return withoutFragments.charAt(0).toUpperCase() + withoutFragments.slice(1);
  };

  const cleanFinalMessages = (messages) => {
    const cleaned = [];

    messages.forEach((message) => {
      const content = cleanSavedContent(message.content);
      if (!content || isFillerOnly(content)) return;

      const next = { ...message, content };
      const last = cleaned[cleaned.length - 1];
      if (last && last.role === next.role) {
        const lastText = cleanContent(last.content).toLowerCase();
        const nextText = cleanContent(next.content).toLowerCase();

        if (lastText === nextText) return;
        if (nextText.startsWith(lastText)) {
          cleaned[cleaned.length - 1] = next;
          return;
        }
        if (lastText.startsWith(nextText)) return;
      }

      cleaned.push(next);
    });

    return cleaned;
  };

  const handleTranscriptArray = (transcript, update) => {
    const messages = normalizeTranscript(transcript);
    if (!messages.length) return;

    messages.forEach((item, index) => {
      const isLast = index === messages.length - 1;
      handleTranscriptMessage(item.role, item.content, {
        timestamp: item.timestamp,
        final: item.final || (!isLast && messages.length > 1) || isFinalTranscript(item, update),
      });
    });
  };

  const extractUserName = (messages) => {
    const userText = messages
      .filter((item) => item.role === 'user')
      .map((item) => cleanSavedContent(item.content))
      .join(' ');

    const patterns = [
      /\bmy name is\s+([^.,!?]+)/i,
      /\bthis is\s+([^.,!?]+)/i,
      /\bi am\s+([^.,!?]+)/i,
      /\bi'm\s+([^.,!?]+)/i,
    ];

    for (const pattern of patterns) {
      const match = userText.match(pattern);
      if (match?.[1]) {
        const candidate = stripFillers(match[1])
          .split(/\s+/)
          .filter((word) => /^[a-z.'-]+$/i.test(word))
          .slice(0, 2)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        if (candidate) return candidate;
      }
    }

    return 'User';
  };

  const generateChatTitle = (messages, userName, date) => {
    const fallbackTopic = messages
      .filter((item) => item.role === 'user')
      .map((item) => stripFillers(item.content))
      .find((content) => content.length > 8) || 'Voice call';
    const subject = userName && userName !== 'User'
      ? userName
      : fallbackTopic.split(/\s+/).slice(0, 5).join(' ');
    const stamp = date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${subject} - ${stamp}`;
  };

  const saveCallToDb = async () => {
    try {
      commitPendingMessage();
      stopUserSpeakingTimer();
      stopAgentSpeakingTimer();
      const finalMessages = cleanFinalMessages(messagesRef.current);
      messagesRef.current = finalMessages;
      renderMessages();
      const endedAt = new Date();
      const duration = callStartRef.current
        ? Math.round((Date.now() - callStartRef.current) / 1000)
        : 0;
      const userName = extractUserName(finalMessages);
      const chatName = generateChatTitle(finalMessages, userName, endedAt);
      const analyticsSummary = {
        userSpeakingSeconds: metricsRef.current.userSpeakingSeconds,
        aiSpeakingSeconds: metricsRef.current.aiSpeakingSeconds,
        engagementScore: Math.min(100, Math.round((finalMessages.length * 12) + (metricsRef.current.userSpeakingSeconds * 1.5))),
        sentiment: finalMessages.length >= 4 ? 'engaged' : 'neutral',
        success: finalMessages.length > 0,
      };

      await axios.post(`${apiUrl}/calls`, {
        callId: callIdRef.current,
        chatName,
        userName,
        agentId: agentIdRef.current || '',
        callType: 'web',
        status: 'ended',
        durationSeconds: duration,
        createdAt: callStartRef.current ? new Date(callStartRef.current).toISOString() : endedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        callDate: endedAt.toLocaleDateString(),
        callTime: endedAt.toLocaleTimeString(),
        messages: finalMessages,
        transcript: finalMessages.map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`).join('\n'),
        analyticsSummary,
        metadata: {
          savedFrom: 'retell-web-client',
          userName,
          chatName,
          messageCount: finalMessages.length,
          analyticsSummary,
          savedAt: endedAt.toISOString(),
        },
      });
      onLiveAnalytics?.({ activeCalls: 0 });
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
      pendingMessageRef.current = null;
      metricsRef.current = {
        activeCalls: 1,
        userSpeakingSeconds: 0,
        aiSpeakingSeconds: 0,
        engagementScore: 0,
      };
      userSpeakingStartRef.current = null;
      agentSpeakingStartRef.current = null;

      const { data } = await axios.post(`${apiUrl}/agent/create-web-call`);
      const accessToken = data.access_token;
      const newCallId = data.call_id;

      if (!accessToken) {
        throw new Error('No access_token returned from backend. Check RETELL_API_KEY and RETELL_AGENT_ID in .env');
      }

      callIdRef.current = newCallId;
      agentIdRef.current = data.agent_id || process.env.REACT_APP_AGENT_ID || '';
      setCallId(newCallId);
      setMessage('Connecting voice...');

      const retellClient = new RetellWebClient();
      clientRef.current = retellClient;

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
        stopUserSpeakingTimer();
        if (!agentSpeakingStartRef.current) agentSpeakingStartRef.current = Date.now();
        setAgentTalking(true);
        setUserTalking(false);
        setMessage('Agent is speaking.');
        publishLiveAnalytics();
      });

      retellClient.on('agent_stop_talking', () => {
        stopAgentSpeakingTimer();
        setAgentTalking(false);
        setMessage('Your turn. Speak now.');
        publishLiveAnalytics();
      });

      retellClient.on('update', (update) => {
        console.log('[Retell] update:', update);
        if (!update) return;

        if (Array.isArray(update.transcript)) {
          handleTranscriptArray(update.transcript, update);
        }

        const singleContent = update.content || update.text || update.transcript_delta;
        if (singleContent) {
          handleTranscriptMessage(update.turntaking || update.role || update.speaker, singleContent, {
            final: isFinalTranscript({}, update),
            timestamp: update.timestamp || update.createdAt,
          });
        }
      });

      retellClient.on('error', (err) => {
        console.error('[Retell] SDK error:', err);
        setCallState('error');
        setMessage(`SDK error: ${err?.message || JSON.stringify(err)}`);
        clientRef.current = null;
      });

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
      commitPendingMessage();
      try { clientRef.current.stopCall(); } catch (_) {}
      clientRef.current = null;
    }
  };

  const isActive = callState === 'active';
  const isLoading = callState === 'loading';
  const isEnding = callState === 'ending';
  const isEnded = callState === 'ended';
  const showChat = chatMessages.length > 0 || isActive;

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
            <p><strong>Call ID:</strong> {callId}</p>
          </div>
        )}

        {showChat && (
          <div className="chat-container">
            <div className="chat-header">
              <span className="chat-title">Live Conversation</span>
              <div className="chat-header-tools">
                {chatMessages.length > 0 && (
                  <span className="chat-msg-count">
                    {messagesRef.current.length} saved
                    {pendingMessageRef.current ? ' + live' : ''}
                  </span>
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
                    key={`${msg.role}-${idx}-${msg.pending ? 'pending' : 'final'}`}
                    className={`chat-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-agent'} ${msg.pending ? 'bubble-pending' : ''}`}
                  >
                    <span className="bubble-label">
                      {msg.role === 'user' ? 'You' : 'Agent'}
                      {msg.pending && <span className="pending-label">live</span>}
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
