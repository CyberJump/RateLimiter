import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './pages/DashboardView';
import { KeysView } from './pages/KeysView';
import { HistoryView } from './pages/HistoryView';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'keys' | 'history'>('dashboard');

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'keys' && <KeysView />}
        {activeTab === 'history' && <HistoryView />}
      </main>
    </div>
  );
};

export default App;
