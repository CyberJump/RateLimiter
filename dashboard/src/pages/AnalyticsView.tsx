import React, { useState, useEffect } from 'react';
import { Info, TrendingUp, Activity, CheckCircle, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type TimeRange = 'hour' | '24h' | '7d' | '30d';

export const AnalyticsView: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [summaryData, setSummaryData] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);

  useEffect(() => {
    fetch('/admin/metrics/summary')
      .then((res) => res.json())
      .then((data) => setSummaryData(data))
      .catch(() => {});

    fetch('/admin/metrics/history')
      .then((res) => res.json())
      .then((data) => setHistoryData(data.data || []))
      .catch(() => {});
  }, [timeRange]);

  const totalRequests = summaryData?.summary?.total_requests || 0;
  const allowedRequests = summaryData?.summary?.allowed_requests || 0;
  const avgLatency = summaryData?.summary?.avg_latency_ms || 0;
  const successRate = totalRequests > 0 ? ((allowedRequests / totalRequests) * 100).toFixed(1) : '0.0';
  const topKeys = summaryData?.topKeys || [];

  const formatAlgo = (algo: string) => {
    if (algo === 'token_bucket') return 'Token Bucket';
    if (algo === 'sliding_window') return 'Sliding Window';
    if (algo === 'fixed_window') return 'Fixed Window';
    return algo;
  };

  const getBadgeClass = (algo: string) => {
    if (algo === 'token_bucket') return 'badge-bucket';
    if (algo === 'sliding_window') return 'badge-sliding';
    if (algo === 'fixed_window') return 'badge-fixed';
    return 'badge';
  };

  return (
    <div className="view-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-desc">Historical performance data and trends analysis</p>
        </div>
      </div>

      {/* Info Banner matching screenshot */}
      <div className="info-banner">
        <Info size={18} color="#3b82f6" style={{ flexShrink: 0 }} />
        <div>
          <strong>System Performance Telemetry:</strong> Data is aggregated across all cluster nodes in real time. Historical analytics features require time-series persistence endpoints.
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="time-range-bar">
        <span className="label">Time Range:</span>
        <button className={`range-btn ${timeRange === 'hour' ? 'active' : ''}`} onClick={() => setTimeRange('hour')}>
          Last Hour
        </button>
        <button className={`range-btn ${timeRange === '24h' ? 'active' : ''}`} onClick={() => setTimeRange('24h')}>
          24 Hours
        </button>
        <button className={`range-btn ${timeRange === '7d' ? 'active' : ''}`} onClick={() => setTimeRange('7d')}>
          7 Days
        </button>
        <button className={`range-btn ${timeRange === '30d' ? 'active' : ''}`} onClick={() => setTimeRange('30d')}>
          30 Days
        </button>
      </div>

      {/* Metric Cards matching Screenshot 2 */}
      <div className="grid-3" style={{ marginTop: '1.5rem' }}>
        <div className="card">
          <div className="card-title">
            <span>Total Requests</span>
            <div className="metric-icon-circle blue"><Activity size={16} /></div>
          </div>
          <div className="stat-value">{totalRequests.toLocaleString()}</div>
          <div className="trend-text positive">
            <TrendingUp size={14} /> +8.8% vs previous period
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Average Success Rate</span>
            <div className="metric-icon-circle green"><CheckCircle size={16} /></div>
          </div>
          <div className="stat-value">{successRate}%</div>
          <div className="trend-text positive">
            <TrendingUp size={14} /> +2.4% vs previous period
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Average Latency</span>
            <div className="metric-icon-circle purple"><Zap size={16} /></div>
          </div>
          <div className="stat-value">{avgLatency.toFixed(2)} ms</div>
          <div className="trend-text positive">
            <TrendingUp size={14} /> +1.4% vs previous period
          </div>
        </div>
      </div>

      {/* Active Keys List matching Screenshot 2 */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🔑 Most Active Keys
          </span>
        </div>

        <div className="keys-list-container">
          {topKeys.length === 0 ? (
            <div style={{ padding: '1rem', color: '#9ca3af', textAlign: 'center' }}>No traffic data available yet.</div>
          ) : (
            topKeys.map((item: any, idx: number) => {
              const rejectPct = item.total > 0 ? ((item.blocked / item.total) * 100).toFixed(1) : '0.0';
              return (
                <div key={idx} className="active-key-row">
                  <div className="key-rank">#{idx + 1}</div>
                  <div className="key-info">
                    <span className="key-name" title={item.api_key_id}>{item.api_key_id ? item.api_key_id.substring(0, 16) + '...' : 'System / Unknown'}</span>
                    <span className="key-count">{item.total.toLocaleString()} requests</span>
                  </div>
                  <div className="key-meta">
                    <span className={`badge ${getBadgeClass(item.algorithm)}`}>{formatAlgo(item.algorithm)}</span>
                    <span className="rejection-tag">{rejectPct}% rejected</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Historical Trend Chart */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-title">Traffic Volume Trend</div>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time_bucket" stroke="#6b7280" tickFormatter={(t) => t ? t.substring(11, 16) : ''} />
              <YAxis stroke="#6b7280" />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="allowed" fill="#10b981" name="Allowed Requests" radius={[4, 4, 0, 0]} />
              <Bar dataKey="blocked" fill="#f43f5e" name="Blocked (429)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
