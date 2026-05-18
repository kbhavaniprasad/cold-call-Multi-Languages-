import React from 'react';
import './component.css';

const StatCard = ({ label, value, icon, color }) => (
  <div className={`analytics-card analytics-card-${color}`}>
    <div className="analytics-icon">{icon}</div>
    <strong className="analytics-value">{value}</strong>
    <p className="analytics-label">{label}</p>
  </div>
);

const CallAnalytics = ({ analytics, calls }) => {
  // Use pre-computed analytics from backend if available, otherwise derive from calls array
  const totalCalls      = analytics?.totalCalls      ?? calls.length;
  const webCalls        = analytics?.webCalls        ?? calls.filter((c) => c.callType === 'web').length;
  const phoneCalls      = analytics?.phoneCalls      ?? calls.filter((c) => c.callType === 'phone').length;
  const averageDuration = analytics?.averageDuration ?? (
    totalCalls
      ? Math.round(calls.reduce((s, c) => s + (c.durationSeconds || 0), 0) / totalCalls)
      : 0
  );
  const totalDuration   = analytics?.totalDuration   ?? calls.reduce((s, c) => s + (c.durationSeconds || 0), 0);

  const formatDuration = (s) => {
    if (!s) return '0s';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <section className="analytics-panel">
      <h2>Analytics Dashboard</h2>
      <p className="analytics-subtitle">
        Persistent stats from the {analytics?.storage || 'configured'} store
        {analytics?.collection ? ` (${analytics.collection} collection)` : ''}.
      </p>

      <div className="analytics-grid">
        <StatCard icon="ALL" label="Total Calls"    value={totalCalls}                    color="purple" />
        <StatCard icon="WEB" label="Web Calls"      value={webCalls}                      color="blue"   />
        <StatCard icon="TEL" label="Phone Calls"    value={phoneCalls}                    color="green"  />
        <StatCard icon="AVG" label="Avg Duration"   value={formatDuration(averageDuration)} color="orange" />
        <StatCard icon="SUM" label="Total Duration" value={formatDuration(totalDuration)}  color="teal"   />
      </div>

      {totalCalls > 0 && (
        <div className="analytics-breakdown">
          <h3>Call Type Breakdown</h3>
          <div className="breakdown-bar-wrap">
            <div
              className="breakdown-bar-fill breakdown-web"
              style={{ width: `${totalCalls ? (webCalls / totalCalls) * 100 : 0}%` }}
            />
            <div
              className="breakdown-bar-fill breakdown-phone"
              style={{ width: `${totalCalls ? (phoneCalls / totalCalls) * 100 : 0}%` }}
            />
          </div>
          <div className="breakdown-legend">
            <span className="legend-web">Web {webCalls}</span>
            <span className="legend-phone">Phone {phoneCalls}</span>
          </div>
        </div>
      )}

      {totalCalls === 0 && (
        <p className="empty-state">No call data yet. Complete a voice call to see analytics.</p>
      )}
    </section>
  );
};

export default CallAnalytics;
