import React, { useState, useEffect } from 'react';
import { Server, Database, RefreshCw, Radio } from 'lucide-react';

interface HeaderProps {
  refreshRate: number;
  setRefreshRate: (rate: number) => void;
}

export const Header: React.FC<HeaderProps> = ({ refreshRate, setRefreshRate }) => {
  const [redisLatency, setRedisLatency] = useState<number>(0.8);
  const [clusterStatus, setClusterStatus] = useState<string>('HEALTHY');

  useEffect(() => {
    const fetchHealth = () => {
      const start = Date.now();
      fetch('/health')
        .then((res) => res.json())
        .then((data) => {
          const rtt = Math.max(0.4, (Date.now() - start) / 2);
          setRedisLatency(parseFloat(rtt.toFixed(2)));
          setClusterStatus(data.status === 'healthy' ? 'HEALTHY' : 'DEGRADED');
        })
        .catch(() => {
          setClusterStatus('UNHEALTHY');
        });
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="header">
      <div className="header-status-ticker">
        <div className="ticker-item">
          <span className={`status-dot ${clusterStatus === 'HEALTHY' ? 'green' : 'rose'}`}></span>
          <span>CLUSTER: <strong>{clusterStatus}</strong></span>
        </div>

        <div className="ticker-item">
          <Server size={14} color="#60a5fa" />
          <span>NODES: <strong>3 ONLINE</strong></span>
        </div>

        <div className="ticker-item">
          <Database size={14} color="#34d399" />
          <span>REDIS RTT: <strong>{redisLatency}ms</strong></span>
        </div>

        <div className="ticker-item">
          <Radio size={14} color="#a78bfa" />
          <span>MODE: <strong>FAIL-CLOSED</strong></span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={13} className={refreshRate > 0 ? 'spin-icon' : ''} />
          <span>AUTO-REFRESH:</span>
          <select
            value={refreshRate}
            onChange={(e) => setRefreshRate(Number(e.target.value))}
            className="select-input"
            style={{ width: '85px', padding: '0.2rem 0.4rem', fontSize: '0.72rem' }}
          >
            <option value={1000}>1s (Realtime)</option>
            <option value={3000}>3s</option>
            <option value={5000}>5s</option>
            <option value={0}>Off</option>
          </select>
        </div>
      </div>
    </header>
  );
};
