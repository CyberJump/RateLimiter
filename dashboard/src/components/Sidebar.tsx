import React from 'react';
import { Activity, Key, BarChart3, ShieldAlert } from 'lucide-react';

interface SidebarProps {
  activeTab: 'dashboard' | 'keys' | 'history';
  setActiveTab: (tab: 'dashboard' | 'keys' | 'history') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <ShieldAlert size={18} />
        </div>
        <span>RateLimiter</span>
      </div>

      <ul className="nav-menu">
        <li className="nav-item">
          <button
            className={activeTab === 'dashboard' ? 'active' : ''}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={18} />
            <span>Live Monitor</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            className={activeTab === 'keys' ? 'active' : ''}
            onClick={() => setActiveTab('keys')}
          >
            <Key size={18} />
            <span>API Keys & Tiers</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            className={activeTab === 'history' ? 'active' : ''}
            onClick={() => setActiveTab('history')}
          >
            <BarChart3 size={18} />
            <span>Historical Data</span>
          </button>
        </li>
      </ul>
    </div>
  );
};
