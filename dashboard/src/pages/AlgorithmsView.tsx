import React, { useState, useEffect } from 'react';
import { Cpu, Zap, Activity, Clock, ShieldCheck, Play, Pause, RefreshCw } from 'lucide-react';

export const AlgorithmsView: React.FC = () => {
  const [activeSimAlgo, setActiveSimAlgo] = useState<'token_bucket' | 'sliding_window' | 'fixed_window'>('token_bucket');
  const [tokens, setTokens] = useState<number>(10);
  const maxCapacity = 20;
  const refillRate = 2; // 2 tokens per sec
  const [isSimulating, setIsSimulating] = useState<boolean>(true);

  // Live simulation tick
  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(() => {
      setTokens((prev) => Math.min(maxCapacity, prev + refillRate));
    }, 1000);
    return () => clearInterval(interval);
  }, [isSimulating]);

  const handleFireSimRequest = () => {
    if (activeSimAlgo === 'token_bucket') {
      if (tokens >= 1) {
        setTokens((prev) => prev - 1);
      }
    }
  };

  return (
    <div className="view-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Algorithm Engineering Suite</h1>
          <p className="page-desc">Computer science tradeoffs, state complexities, and interactive step-by-step simulations</p>
        </div>
        <span className="badge badge-bucket">CS ARCHITECTURE ANALYZER</span>
      </div>

      {/* CS Analysis Comparison Cards */}
      <div className="grid-3">
        {/* Token Bucket */}
        <div className={`card ${activeSimAlgo === 'token_bucket' ? 'selected-card' : ''}`} style={{ border: activeSimAlgo === 'token_bucket' ? '1px solid var(--accent-blue)' : undefined }}>
          <div className="card-title">
            <span>Token Bucket Algorithm</span>
            <span className="badge badge-bucket">Recommended</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
            Tokens are added to the bucket at a constant rate. Requests consume tokens atomically via Redis Lua script.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            <div>Time Complexity: <strong style={{ color: '#34d399' }}>O(1)</strong></div>
            <div>Space Complexity: <strong style={{ color: '#34d399' }}>O(1) per key</strong></div>
            <div>Redis Ops / Check: <strong style={{ color: '#60a5fa' }}>1 Eval (HGET/HSET)</strong></div>
            <div>Burst Handling: <strong style={{ color: '#34d399' }}>FULL (Up to capacity)</strong></div>
            <div>Memory Overhead: <strong style={{ color: '#34d399' }}>~64 Bytes</strong></div>
          </div>
        </div>

        {/* Sliding Window Log */}
        <div className={`card ${activeSimAlgo === 'sliding_window' ? 'selected-card' : ''}`} style={{ border: activeSimAlgo === 'sliding_window' ? '1px solid var(--accent-violet)' : undefined }}>
          <div className="card-title">
            <span>Sliding Window Log</span>
            <span className="badge badge-sliding">Exact Rolling</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
            Stores timestamps in Redis Sorted Sets (ZSET). Evicts expired logs using ZREMRANGEBYSCORE and counts ZCARD.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            <div>Time Complexity: <strong style={{ color: '#f59e0b' }}>O(log N + M)</strong></div>
            <div>Space Complexity: <strong style={{ color: '#f43f5e' }}>O(N) (N = req count)</strong></div>
            <div>Redis Ops / Check: <strong style={{ color: '#a78bfa' }}>1 Eval (ZSET)</strong></div>
            <div>Burst Handling: <strong style={{ color: '#f59e0b' }}>Strict Window</strong></div>
            <div>Memory Overhead: <strong style={{ color: '#f43f5e' }}>High (Varies with N)</strong></div>
          </div>
        </div>

        {/* Fixed Window */}
        <div className={`card ${activeSimAlgo === 'fixed_window' ? 'selected-card' : ''}`} style={{ border: activeSimAlgo === 'fixed_window' ? '1px solid var(--accent-cyan)' : undefined }}>
          <div className="card-title">
            <span>Fixed Window Counter</span>
            <span className="badge badge-fixed">Fastest INCR</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
            Increments a counter in atomic Redis INCR command with TTL. Extremely fast but prone to boundary spikes.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            <div>Time Complexity: <strong style={{ color: '#34d399' }}>O(1)</strong></div>
            <div>Space Complexity: <strong style={{ color: '#34d399' }}>O(1)</strong></div>
            <div>Redis Ops / Check: <strong style={{ color: '#22d3ee' }}>1 (INCR + EXPIRE)</strong></div>
            <div>Boundary Spike Vulnerability: <strong style={{ color: '#f43f5e' }}>Up to 2x Limit</strong></div>
            <div>Memory Overhead: <strong style={{ color: '#34d399' }}>~32 Bytes</strong></div>
          </div>
        </div>
      </div>

      {/* Interactive State Simulation Canvas */}
      <div className="card">
        <div className="card-title">
          <span>🎮 Interactive State Simulation Visualizer</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className={`btn ${activeSimAlgo === 'token_bucket' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveSimAlgo('token_bucket')}>
              Token Bucket
            </button>
            <button className={`btn ${activeSimAlgo === 'sliding_window' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveSimAlgo('sliding_window')}>
              Sliding Window
            </button>
            <button className={`btn ${activeSimAlgo === 'fixed_window' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveSimAlgo('fixed_window')}>
              Fixed Window
            </button>
          </div>
        </div>

        {activeSimAlgo === 'token_bucket' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Bucket Token Fill Gauge: </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 800, color: '#60a5fa' }}>
                  {tokens} / {maxCapacity} Tokens Available
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setIsSimulating(!isSimulating)}>
                  {isSimulating ? <Pause size={14} /> : <Play size={14} />} {isSimulating ? 'Pause Refill' : 'Resume Refill'}
                </button>
                <button className="btn btn-primary" onClick={handleFireSimRequest}>
                  <Zap size={14} /> Fire Request (-1 Token)
                </button>
              </div>
            </div>

            {/* Visual Token Fill Containers */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              {Array.from({ length: maxCapacity }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 32,
                    height: 45,
                    borderRadius: 4,
                    background: i < tokens ? 'linear-gradient(180deg, #60a5fa, #2563eb)' : 'rgba(255,255,255,0.04)',
                    border: i < tokens ? '1px solid #3b82f6' : '1px dashed var(--border-color)',
                    transition: 'all 0.25s ease',
                  }}
                ></div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Architectural Matrix Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Time Complexity</th>
              <th>Space Complexity</th>
              <th>Redis Memory</th>
              <th>Boundary Spike Protection</th>
              <th>Ideal Use Case</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="badge badge-bucket">Token Bucket</span></td>
              <td style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>O(1)</td>
              <td style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>O(1)</td>
              <td>~64 Bytes</td>
              <td><span className="badge badge-success">High</span></td>
              <td>Public REST APIs, Payment Gateways</td>
            </tr>
            <tr>
              <td><span className="badge badge-sliding">Sliding Window Log</span></td>
              <td style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>O(log N + M)</td>
              <td style={{ fontFamily: 'var(--font-mono)', color: '#f87171' }}>O(N)</td>
              <td>High (ZSET logs)</td>
              <td><span className="badge badge-success">Exact 100%</span></td>
              <td>Financial Transfers, Authentication Logins</td>
            </tr>
            <tr>
              <td><span className="badge badge-fixed">Fixed Window</span></td>
              <td style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>O(1)</td>
              <td style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>O(1)</td>
              <td>~32 Bytes</td>
              <td><span className="badge badge-danger">Low (2x Spike)</span></td>
              <td>Internal Microservices, High RPS Services</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
