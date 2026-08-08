import React from 'react';
import {
  LayoutDashboard,
  BarChart3,
  Activity,
  Zap,
  Sliders,
  Key,
  Cpu,
  Server,
  Database,
  History,
  Settings,
} from 'lucide-react';

export type TabType =
  | 'overview'
  | 'analytics'
  | 'live-monitoring'
  | 'load-testing'
  | 'configuration'
  | 'keys'
  | 'algorithms'
  | 'cluster-health'
  | 'redis-observability'
  | 'benchmark-history'
  | 'settings';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const primaryMenu: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { id: 'analytics', label: 'Gateway Analytics', icon: <BarChart3 size={16} /> },
    { id: 'live-monitoring', label: 'Live Monitoring', icon: <Activity size={16} /> },
    { id: 'load-testing', label: 'Load Testing', icon: <Zap size={16} /> },
  ];

  const controlPlaneMenu: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'configuration', label: 'Configuration', icon: <Sliders size={16} /> },
    { id: 'keys', label: 'API Keys & Policies', icon: <Key size={16} /> },
    { id: 'algorithms', label: 'Algorithms', icon: <Cpu size={16} /> },
  ];

  const infrastructureMenu: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'cluster-health', label: 'Cluster Health', icon: <Server size={16} /> },
    { id: 'redis-observability', label: 'Redis Diagnostics', icon: <Database size={16} /> },
    { id: 'benchmark-history', label: 'Benchmark History', icon: <History size={16} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
  ];

  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Zap size={18} />
        </div>
        <div>
          <div className="brand-title">GATEWAY CONTROL</div>
          <div className="brand-sub">OBSERVABILITY v2.4</div>
        </div>
      </div>

      <ul className="nav-menu">
        <div className="nav-section-title">Telemetry & Monitoring</div>
        {primaryMenu.map((item) => (
          <li key={item.id} className="nav-item">
            <button
              className={activeTab === item.id ? 'active' : ''}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          </li>
        ))}

        <div className="nav-section-title" style={{ marginTop: '0.6rem' }}>
          Control Plane
        </div>
        {controlPlaneMenu.map((item) => (
          <li key={item.id} className="nav-item">
            <button
              className={activeTab === item.id ? 'active' : ''}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          </li>
        ))}

        <div className="nav-section-title" style={{ marginTop: '0.6rem' }}>
          Infrastructure
        </div>
        {infrastructureMenu.map((item) => (
          <li key={item.id} className="nav-item">
            <button
              className={activeTab === item.id ? 'active' : ''}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
