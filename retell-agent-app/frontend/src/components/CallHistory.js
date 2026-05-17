import React, { useState } from 'react';
import './component.css';

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
};

const CallHistory = ({ calls, onRefresh }) => {
  const [expanded, setExpanded] = useState(null);

  const toggle = (id) => setExpanded((prev) => (prev === id ? null : id));

  const formatDuration = (s) => {
    if (!s) return '—';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <section className="history-panel">
      <div className="history-header">
        <h2>Call History <span className="call-count-badge">{calls.length}</span></h2>
        <button className="refresh-btn" onClick={onRefresh} title="Refresh">↻ Refresh</button>
      </div>

      {calls.length === 0 ? (
        <p className="empty-state">No calls found yet. Start a voice call to populate history.</p>
      ) : (
        <div className="history-list">
          {calls.map((call) => {
            const id = call._id || call.callId || call.id;
            const isOpen = expanded === id;
            const messages = call.messages || [];
            const hasTranscript = messages.length > 0 || call.transcript;

            return (
              <article key={id} className={`history-card ${isOpen ? 'history-card-open' : ''}`}>
                {/* ── Card header ── */}
                <div className="history-card-top" onClick={() => toggle(id)}>
                  <div className="history-card-meta">
                    <span className={`call-type-badge badge-${call.callType || 'web'}`}>
                      {call.callType === 'phone' ? '📞 Phone' : '🌐 Web'} Call
                    </span>
                    <span className={`status-badge status-${call.status}`}>{call.status || 'ended'}</span>
                    {messages.length > 0 && (
                      <span className="msg-count-badge">💬 {messages.length} messages</span>
                    )}
                  </div>
                  <div className="history-card-info">
                    <span>🕐 {new Date(call.createdAt).toLocaleString()}</span>
                    <span>⏱ {formatDuration(call.durationSeconds)}</span>
                    {call.callId && <span className="call-id-text">ID: {call.callId.slice(0, 18)}…</span>}
                  </div>
                  {hasTranscript && (
                    <div className="expand-hint">
                      {isOpen ? '▲ Hide full transcript' : '▼ View full transcript'}
                    </div>
                  )}
                </div>

                {/* ── Full transcript (no height limit) ── */}
                {isOpen && hasTranscript && (
                  <div className="history-transcript">
                    {messages.length > 0 ? (
                      <>
                        <div className="transcript-msg-count">
                          {messages.length} message{messages.length !== 1 ? 's' : ''} in this conversation
                        </div>
                        {messages.map((msg, i) => (
                          <div
                            key={i}
                            className={`chat-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-agent'}`}
                          >
                            <span className="bubble-label">
                              {msg.role === 'user' ? '🧑 You' : '🤖 Agent'}
                              {msg.timestamp && (
                                <span className="bubble-time">{formatTime(msg.timestamp)}</span>
                              )}
                            </span>
                            <p className="bubble-text">{msg.content}</p>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="transcript-msg-count">Raw transcript</div>
                        <pre className="raw-transcript">{call.transcript}</pre>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default CallHistory;
