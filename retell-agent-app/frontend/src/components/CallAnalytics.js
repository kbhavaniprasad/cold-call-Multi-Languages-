import React from 'react';
import './component.css';

const StatCard = ({ label, value, icon, color }) => (
  <div className={`analytics-card analytics-card-${color}`}>
    <div className="analytics-icon">{icon}</div>
    <strong className="analytics-value">{value}</strong>
    <p className="analytics-label">{label}</p>
  </div>
);

const CallAnalytics = ({ analytics, calls, liveAnalytics = {} }) => {
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
  const activeCalls = liveAnalytics.activeCalls || 0;
  const completedCalls = totalCalls;
  const userSpeakingTime = liveAnalytics.userSpeakingSeconds || 0;
  const aiSpeakingTime = liveAnalytics.aiSpeakingSeconds || 0;
  const engagementScore = liveAnalytics.engagementScore || analytics?.engagementScore || 0;
  const successRate = analytics?.successRate ?? (
    completedCalls ? Math.round((calls.filter((c) => c.status === 'ended').length / completedCalls) * 100) : 0
  );

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
        <StatCard icon="LIVE" label="Active Calls" value={activeCalls} color="teal" />
        <StatCard icon="DONE" label="Completed Calls" value={completedCalls} color="purple" />
        <StatCard icon="AVG" label="Avg Duration" value={formatDuration(averageDuration)} color="orange" />
        <StatCard icon="YOU" label="User Speaking" value={formatDuration(userSpeakingTime)} color="blue" />
        <StatCard icon="AI" label="AI Speaking" value={formatDuration(aiSpeakingTime)} color="green" />
        <StatCard icon="ENG" label="Engagement" value={`${engagementScore}%`} color="teal" />
        <StatCard icon="OK" label="Success Rate" value={`${successRate}%`} color="green" />
        <StatCard icon="SUM" label="Total Duration" value={formatDuration(totalDuration)} color="orange" />
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
