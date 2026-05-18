import React, { useEffect, useState } from 'react';
import './component.css';

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
};

const CallHistory = ({ calls, onRefresh, onRename }) => {
  const [expanded, setExpanded] = useState(null);
  const [draftNames, setDraftNames] = useState({});
  const [savingId, setSavingId] = useState(null);

  const toggle = (id) => setExpanded((prev) => (prev === id ? null : id));

  useEffect(() => {
    const nextDrafts = {};
    calls.forEach((call) => {
      const id = call._id || call.callId || call.id;
      nextDrafts[id] = call.chatName || 'Untitled call';
    });
    setDraftNames(nextDrafts);
  }, [calls]);

  const formatDuration = (seconds) => {
    if (!seconds) return '0s';
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
  };

  const saveName = async (event, call, id) => {
    event.stopPropagation();
    const nextName = (draftNames[id] || '').trim() || 'Untitled call';
    if (nextName === (call.chatName || 'Untitled call')) return;

    try {
      setSavingId(id);
      await onRename?.(call, nextName);
    } catch (error) {
      console.error('Unable to rename chat:', error);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="history-panel">
      <div className="history-header">
        <h2>Call History <span className="call-count-badge">{calls.length}</span></h2>
        <button className="refresh-btn" onClick={onRefresh} title="Refresh">Refresh</button>
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
                <div className="history-card-top" onClick={() => toggle(id)}>
                  <div className="history-name-row">
                    <input
                      className="history-name-input"
                      value={draftNames[id] ?? call.chatName ?? 'Untitled call'}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setDraftNames((current) => ({ ...current, [id]: event.target.value }))
                      }
                      onBlur={(event) => saveName(event, call, id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                      aria-label="Chat name"
                    />
                    {savingId === id && <span className="saving-name">Saving...</span>}
                  </div>

                  <div className="history-card-meta">
                    <span className={`call-type-badge badge-${call.callType || 'web'}`}>
                      {call.callType === 'phone' ? 'Phone' : 'Web'} Call
                    </span>
                    <span className={`status-badge status-${call.status}`}>{call.status || 'ended'}</span>
                    {messages.length > 0 && (
                      <span className="msg-count-badge">{messages.length} messages</span>
                    )}
                  </div>

                  <div className="history-card-info">
                    <span>{new Date(call.createdAt).toLocaleString()}</span>
                    <span>{formatDuration(call.durationSeconds)}</span>
                    {call.callId && <span className="call-id-text">ID: {call.callId.slice(0, 18)}...</span>}
                  </div>

                  {hasTranscript && (
                    <div className="expand-hint">
                      {isOpen ? 'Hide full transcript' : 'View full transcript'}
                    </div>
                  )}
                </div>

                {isOpen && hasTranscript && (
                  <div className="history-transcript">
                    {messages.length > 0 ? (
                      <>
                        <div className="transcript-msg-count">
                          {messages.length} message{messages.length !== 1 ? 's' : ''} in this conversation
                        </div>
                        {messages.map((msg, i) => (
                          <div
                            key={`${msg.role}-${i}-${msg.timestamp || ''}`}
                            className={`chat-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-agent'}`}
                          >
                            <span className="bubble-label">
                              {msg.role === 'user' ? 'You' : 'Agent'}
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
