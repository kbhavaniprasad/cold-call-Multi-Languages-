import React, { useEffect, useState, useCallback } from 'react';
import AgentInterface from './components/AgentInterface';
import CallHistory from './components/CallHistory';
import CallAnalytics from './components/CallAnalytics';
import './App.css';

function App() {
  const [activeTab,  setActiveTab]  = useState('agent');
  const [calls,      setCalls]      = useState([]);
  const [analytics,  setAnalytics]  = useState(null);
  const [dataError,  setDataError]  = useState('');

  const apiUrl = process.env.REACT_APP_API_URL || 'https://cold-call-multi-languages.onrender.com/api';

  const fetchCalls = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/calls`);
      if (!response.ok) throw new Error(`Calls request failed with status ${response.status}`);
      const data = await response.json();
      setCalls(Array.isArray(data) ? data : []);
      setDataError('');
    } catch (error) {
      console.error('Error fetching calls:', error);
      setDataError(error.message || 'Unable to fetch call history');
    }
  }, [apiUrl]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/calls/analytics`);
      if (!response.ok) throw new Error(`Analytics request failed with status ${response.status}`);
      const data = await response.json();
      setAnalytics(data);
      setDataError('');
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setDataError(error.message || 'Unable to fetch analytics');
    }
  }, [apiUrl]);

  const refreshData = useCallback(() => {
    fetchCalls();
    fetchAnalytics();
  }, [fetchCalls, fetchAnalytics]);

  const updateCallName = useCallback(async (call, chatName) => {
    const id = call.callId || call._id || call.id;
    if (!id || !chatName.trim()) return;

    const response = await fetch(`${apiUrl}/calls/${id}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatName: chatName.trim() }),
    });
    if (!response.ok) throw new Error(`Rename request failed with status ${response.status}`);

    setCalls((currentCalls) =>
      currentCalls.map((item) =>
        (item.callId || item._id || item.id) === id
          ? { ...item, chatName: chatName.trim() }
          : item
      )
    );
    fetchAnalytics();
  }, [apiUrl, fetchAnalytics]);

  // Load on mount
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Re-fetch when switching to history / analytics tab
  useEffect(() => {
    if (activeTab === 'history' || activeTab === 'analytics') {
      refreshData();
    }
  }, [activeTab, refreshData]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Retell AI Agent Interface</h1>
          <p>Voice call management for AI agents with history and analytics.</p>
        </div>
        <nav>
          <button onClick={() => setActiveTab('agent')} className={activeTab === 'agent' ? 'active' : ''}>
            Voice Call
          </button>
          <button onClick={() => setActiveTab('history')} className={activeTab === 'history' ? 'active' : ''}>
            Call History
          </button>
          <button onClick={() => setActiveTab('analytics')} className={activeTab === 'analytics' ? 'active' : ''}>
            Analytics
          </button>
        </nav>
      </header>
      {dataError && (
        <div className="data-error">
          History/analytics could not refresh: {dataError}
        </div>
      )}
      <main className="app-main">
        {activeTab === 'agent'     && <AgentInterface onNewCall={refreshData} apiUrl={apiUrl} />}
        {activeTab === 'history'   && <CallHistory calls={calls} onRefresh={refreshData} onRename={updateCallName} />}
        {activeTab === 'analytics' && <CallAnalytics analytics={analytics} calls={calls} />}
      </main>
    </div>
  );
}

export default App;
