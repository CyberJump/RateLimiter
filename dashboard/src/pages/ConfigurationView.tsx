import React, { useState } from 'react';
import { Sliders, ShieldCheck, Database, Server, Cpu, Check, AlertCircle } from 'lucide-react';

export const ConfigurationView: React.FC = () => {
  const [configState, setConfigState] = useState({
    defaultAlgo: 'token_bucket',
    defaultCapacity: 10,
    defaultWindowSecs: 60,
    redisPoolMax: 50,
    redisTimeoutMs: 200,
    failStrategy: 'fail-closed',
    enableAuditLogging: true,
    clusterSyncMs: 500,
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="view-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Control Plane Configuration</h1>
          <p className="page-desc">Global policy definitions, Redis cluster parameters, and failover behavior</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Sliders size={14} /> {savedSuccess ? 'Changes Applied!' : 'Apply Policy Changes'}
        </button>
      </div>

      <div className="grid-2">
        {/* Gateway Defaults */}
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Server size={15} color="#3b82f6" /> Gateway Policy Defaults
            </span>
            <span className="badge badge-success">HEALTHY</span>
          </div>

          <div className="form-group">
            <label>Default Algorithm Strategy</label>
            <select
              value={configState.defaultAlgo}
              onChange={(e) => setConfigState({ ...configState, defaultAlgo: e.target.value })}
              className="select-input"
            >
              <option value="token_bucket">Token Bucket (Continuous Refill)</option>
              <option value="sliding_window">Sliding Window Log (Exact Rolling)</option>
              <option value="fixed_window">Fixed Window Counter (INCR + TTL)</option>
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
              Recommended: Token Bucket for microservices & public APIs
            </span>
          </div>

          <div className="form-group">
            <label>Token Bucket Capacity (Tokens)</label>
            <input
              type="number"
              value={configState.defaultCapacity}
              onChange={(e) => setConfigState({ ...configState, defaultCapacity: Number(e.target.value) })}
              className="text-input"
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
              Recommended: 10 | Current: {configState.defaultCapacity} | Impact: Burst tolerance
            </span>
          </div>

          <div className="form-group">
            <label>Window Duration (Seconds)</label>
            <input
              type="number"
              value={configState.defaultWindowSecs}
              onChange={(e) => setConfigState({ ...configState, defaultWindowSecs: Number(e.target.value) })}
              className="text-input"
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
              Recommended: 60s | Current: {configState.defaultWindowSecs}s
            </span>
          </div>
        </div>

        {/* Redis Cluster Config */}
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Database size={15} color="#34d399" /> Redis Cluster Connection Settings
            </span>
            <span className="badge badge-bucket">CONNECTED</span>
          </div>

          <div className="form-group">
            <label>Connection Pool Max Connections</label>
            <input
              type="number"
              value={configState.redisPoolMax}
              onChange={(e) => setConfigState({ ...configState, redisPoolMax: Number(e.target.value) })}
              className="text-input"
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
              Recommended: 50 | Current: {configState.redisPoolMax} | Prevents socket exhaustion
            </span>
          </div>

          <div className="form-group">
            <label>Command Timeout (ms)</label>
            <input
              type="number"
              value={configState.redisTimeoutMs}
              onChange={(e) => setConfigState({ ...configState, redisTimeoutMs: Number(e.target.value) })}
              className="text-input"
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
              Recommended: 200ms | Max latency cap before fallback
            </span>
          </div>

          <div className="form-group">
            <label>Cluster Clock Synchronization Interval (ms)</label>
            <input
              type="number"
              value={configState.clusterSyncMs}
              onChange={(e) => setConfigState({ ...configState, clusterSyncMs: Number(e.target.value) })}
              className="text-input"
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
              Uses Redis TIME microsecond synchronization
            </span>
          </div>
        </div>
      </div>

      {/* Advanced Resiliency & Audit Config */}
      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={15} color="#a78bfa" /> High-Availability & Resilience Policies
          </span>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>Redis Failure Fallback Strategy</label>
            <select
              value={configState.failStrategy}
              onChange={(e) => setConfigState({ ...configState, failStrategy: e.target.value })}
              className="select-input"
            >
              <option value="fail-closed">Fail Closed (Block requests on Redis outage - Security standard)</option>
              <option value="fail-open">Fail Open (Allow requests on Redis outage - High availability)</option>
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', marginTop: '0.2rem' }}>
              Impact: Fail-closed protects downstream servers from cascading traffic spikes during Redis downtime.
            </span>
          </div>

          <div className="form-group">
            <label>Audit Log Persistence</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
              <input
                type="checkbox"
                checked={configState.enableAuditLogging}
                onChange={(e) => setConfigState({ ...configState, enableAuditLogging: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--accent-blue)' }}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Enable asynchronous PostgreSQL request logging for audit trails
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
