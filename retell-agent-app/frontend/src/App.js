import React, { useEffect, useState, useCallback } from 'react';
import AgentInterface from './components/AgentInterface';
import CallHistory from './components/CallHistory';
import CallAnalytics from './components/CallAnalytics';
import './App.css';

function App() {
  const [activeTab,  setActiveTab]  = useState('agent');
  const [calls,      setCalls]      = useState([]);
  const [analytics,  setAnalytics]  = useState(null);

  const apiUrl = process.env.REACT_APP_API_URL || 'https://cold-call-multi-languages.onrender.com/api';

  const fetchCalls = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/calls`);
      const data = await response.json();
      setCalls(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching calls:', error);
    }
  }, [apiUrl]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/calls/analytics`);
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  }, [apiUrl]);

  const refreshData = useCallback(() => {
    fetchCalls();
    fetchAnalytics();
  }, [fetchCalls, fetchAnalytics]);

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
      <main className="app-main">
        {activeTab === 'agent'     && <AgentInterface onNewCall={refreshData} apiUrl={apiUrl} />}
        {activeTab === 'history'   && <CallHistory calls={calls} onRefresh={refreshData} />}
        {activeTab === 'analytics' && <CallAnalytics analytics={analytics} calls={calls} />}
      </main>
    </div>
  );
}

export default App;
