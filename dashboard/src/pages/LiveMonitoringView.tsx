import React, { useState, useEffect } from 'react';
import { Activity, Clock, ShieldAlert, Cpu, Radio, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const LiveMonitoringView: React.FC = () => {
  const [streamData, setStreamData] = useState<any[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<any>({
    currentRps: 42,
    allowedRps: 35,
    blockedRps: 7,
    avgLatencyMs: 1.85,
    p50Ms: 1.1,
    p90Ms: 2.3,
    p95Ms: 3.4,
    p99Ms: 5.8,
    tokenBucketOccupancyPercent: 82,
    slidingWindowUsagePercent: 64,
  });

  useEffect(() => {
    const fetchStream = () => {
      fetch('/admin/telemetry/live-stream')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.timestamp) {
            setCurrentMetrics(data);
            setStreamData((prev) => {
              const updated = [...prev, {
                time: data.timestamp.substring(11, 19),
                total: data.currentRps,
                allowed: data.allowedRps,
                blocked: data.blockedRps,
                p95: data.p95Ms,
                p99: data.p99Ms,
              }];
              return updated.slice(-20); // Keep last 20 seconds
            });
          }
        })
        .catch(() => {});
    };

    fetchStream();
    const interval = setInterval(fetchStream, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="view-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Real-Time Monitoring</h1>
          <p className="page-desc">1-Second streaming telemetry & latency quantile distribution</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="status-dot green"></span>
          <span className="badge badge-success">STREAMING 1000ms</span>
        </div>
      </div>

      {/* Real-time KPI summary bar */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">CURRENT THROUGHPUT <Activity size={14} color="#3b82f6" /></div>
          <div className="kpi-value">{currentMetrics.currentRps} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>req/s</span></div>
          <div className="kpi-sub" style={{ color: '#10b981' }}>{currentMetrics.allowedRps} allowed / {currentMetrics.blockedRps} blocked</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">LATENCY P50 <Clock size={14} color="#34d399" /></div>
          <div className="kpi-value" style={{ color: '#34d399' }}>{currentMetrics.p50Ms} ms</div>
          <div className="kpi-sub">Median check time</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">LATENCY P95 <Clock size={14} color="#f59e0b" /></div>
          <div className="kpi-value" style={{ color: '#fbbf24' }}>{currentMetrics.p95Ms} ms</div>
          <div className="kpi-sub">95th percentile SLA</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">LATENCY P99 <Clock size={14} color="#f43f5e" /></div>
          <div className="kpi-value" style={{ color: '#f87171' }}>{currentMetrics.p99Ms} ms</div>
          <div className="kpi-sub">Tail latency bound</div>
        </div>
      </div>

      {/* Streaming Charts */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            <span>Live Throughput Stream (req/s)</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>UPDATES EVERY 1s</span>
          </div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={streamData.length > 0 ? streamData : mockStream}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)' }} />
                <Line type="monotone" dataKey="allowed" stroke="#10b981" strokeWidth={2} dot={false} name="Allowed req/s" />
                <Line type="monotone" dataKey="blocked" stroke="#f43f5e" strokeWidth={2} dot={false} name="Blocked req/s" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Live Quantile Latency (ms)</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>P95 vs P99</span>
          </div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={streamData.length > 0 ? streamData : mockStream}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)' }} />
                <Line type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={2} dot={false} name="P95 Latency" />
                <Line type="monotone" dataKey="p99" stroke="#f43f5e" strokeWidth={2} dot={false} name="P99 Latency" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Internal State Visualizer Gauges */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">Token Bucket State Telemetry</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                <span>Token Bucket Occupancy</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#60a5fa' }}>
                  {currentMetrics.tokenBucketOccupancyPercent || 85}%
                </span>
              </div>
              <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${currentMetrics.tokenBucketOccupancyPercent || 85}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
                    borderRadius: 5,
                    transition: 'width 0.5s ease',
                  }}
                ></div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Refill Rate: <strong>10 tokens/sec</strong></span>
              <span>Capacity: <strong>20 tokens</strong></span>
              <span>Refill Resolution: <strong>Redis TIME (μs)</strong></span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Sliding Window Log Occupancy</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                <span>Window Sorted Set Utilization</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#a78bfa' }}>
                  {currentMetrics.slidingWindowUsagePercent || 64}%
                </span>
              </div>
              <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${currentMetrics.slidingWindowUsagePercent || 64}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                    borderRadius: 5,
                    transition: 'width 0.5s ease',
                  }}
                ></div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Rolling Window: <strong>60s</strong></span>
              <span>Log Expiry: <strong>Automatic ZREMRANGEBYSCORE</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const mockStream = [
  { time: '12:00:01', total: 40, allowed: 32, blocked: 8, p95: 2.8, p99: 4.5 },
  { time: '12:00:02', total: 45, allowed: 38, blocked: 7, p95: 3.1, p99: 5.2 },
  { time: '12:00:03', total: 50, allowed: 40, blocked: 10, p95: 3.4, p99: 5.8 },
  { time: '12:00:04', total: 42, allowed: 35, blocked: 7, p95: 2.9, p99: 4.8 },
];
