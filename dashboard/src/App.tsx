import React, { useState } from 'react';
import { Sidebar, TabType } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './pages/DashboardView';
import { AnalyticsView } from './pages/AnalyticsView';
import { LiveMonitoringView } from './pages/LiveMonitoringView';
import { LoadTestingView } from './pages/LoadTestingView';
import { ConfigurationView } from './pages/ConfigurationView';
import { KeysView } from './pages/KeysView';
import { AlgorithmsView } from './pages/AlgorithmsView';
import { ClusterHealthView } from './pages/ClusterHealthView';
import { RedisObservabilityView } from './pages/RedisObservabilityView';
import { BenchmarkHistoryView } from './pages/BenchmarkHistoryView';
import { SettingsView } from './pages/SettingsView';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [refreshRate, setRefreshRate] = useState<number>(1000);

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="content-wrapper">
        <Header refreshRate={refreshRate} setRefreshRate={setRefreshRate} />
        <main className="main-content">
          {activeTab === 'overview' && <DashboardView />}
          {activeTab === 'analytics' && <AnalyticsView />}
          {activeTab === 'live-monitoring' && <LiveMonitoringView />}
          {activeTab === 'load-testing' && <LoadTestingView />}
          {activeTab === 'configuration' && <ConfigurationView />}
          {activeTab === 'keys' && <KeysView />}
          {activeTab === 'algorithms' && <AlgorithmsView />}
          {activeTab === 'cluster-health' && <ClusterHealthView />}
          {activeTab === 'redis-observability' && <RedisObservabilityView />}
          {activeTab === 'benchmark-history' && <BenchmarkHistoryView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
};

export default App;
