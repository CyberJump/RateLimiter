import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Activity, CheckCircle, XCircle, Clock } from 'lucide-react';

interface LiveMetric {
  time_bucket: string;
  allowed: number;
  blocked: number;
  total: number;
  avg_latency: number;
}

interface SummaryData {
  summary: {
    total_requests: number;
    allowed_requests: number;
    blocked_requests: number;
    avg_latency_ms: number;
  };
  byAlgorithm: Array<{
    algorithm: string;
    total: number;
    allowed: number;
    blocked: number;
  }>;
  topKeys: Array<{
    api_key_id: string;
    tier_name: string;
    algorithm: string;
    total: number;
    allowed: number;
    blocked: number;
  }>;
}

export const DashboardView: React.FC = () => {
  const [liveData, setLiveData] = useState<LiveMetric[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);

  const fetchLive = async () => {
    try {
      const res = await fetch('/admin/metrics/live');
      if (res.ok) {
        const json = await res.json();
        setLiveData(json.data || []);
      }
    } catch (e) {
      console.error('Error fetching live metrics', e);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch('/admin/metrics/summary');
      if (res.ok) {
        const json = await res.json();
        setSummary(json);
      }
    } catch (e) {
      console.error('Error fetching summary', e);
    }
  };

  useEffect(() => {
    fetchLive();
    fetchSummary();

    const liveInterval = setInterval(fetchLive, 2000);
    const summaryInterval = setInterval(fetchSummary, 5000);

    return () => {
      clearInterval(liveInterval);
      clearInterval(summaryInterval);
    };
  }, []);

  const pieColors: Record<string, string> = {
    fixed_window: '#3b82f6',
    sliding_window: '#8b5cf6',
    token_bucket: '#10b981',
  };

  const pieData = (summary?.byAlgorithm || []).map((item) => ({
    name: item.algorithm,
    value: item.total,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Rate Limiting Monitor</h1>
          <p className="page-desc">Real-time throughput, enforcement status, and algorithm breakdown</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-3">
        <div className="card">
          <div className="card-title">
            <span>Total Requests</span>
            <Activity size={18} color="#3b82f6" />
          </div>
          <div className="stat-value">{summary?.summary?.total_requests || 0}</div>
          <div className="stat-sub">Lifetime requests processed</div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Allowed vs Blocked</span>
            <CheckCircle size={18} color="#10b981" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.75rem' }}>
            <span style={{ color: '#10b981' }}>{summary?.summary?.allowed_requests || 0}</span>
            <span style={{ color: '#6b7280', margin: '0 0.5rem' }}>/</span>
            <span style={{ color: '#f43f5e' }}>{summary?.summary?.blocked_requests || 0}</span>
          </div>
          <div className="stat-sub">Allowed / Rate-Limited (429)</div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Average Latency</span>
            <Clock size={18} color="#8b5cf6" />
          </div>
          <div className="stat-value">
            {summary?.summary?.avg_latency_ms ? `${Math.round(summary.summary.avg_latency_ms)} ms` : '0 ms'}
          </div>
          <div className="stat-sub">Proxy overhead</div>
        </div>
      </div>

      {/* Live Chart */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-title">
          <span>Throughput (Requests / Sec — Last 60s)</span>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
            <span style={{ color: '#10b981' }}>● Allowed</span>
            <span style={{ color: '#f43f5e' }}>● Blocked</span>
          </div>
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={liveData}>
              <defs>
                <linearGradient id="colorAllowed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time_bucket" stroke="#6b7280" tickFormatter={(t) => t ? t.substring(11, 19) : ''} />
              <YAxis stroke="#6b7280" />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              <Area type="monotone" dataKey="allowed" stroke="#10b981" fillOpacity={1} fill="url(#colorAllowed)" />
              <Area type="monotone" dataKey="blocked" stroke="#f43f5e" fillOpacity={1} fill="url(#colorBlocked)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        {/* Algorithm Distribution */}
        <div className="card">
          <div className="card-title">Volume by Algorithm</div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={pieColors[entry.name] || '#3b82f6'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top API Keys */}
        <div className="card">
          <div className="card-title">Top Active API Keys</div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>API Key ID</th>
                  <th>Tier</th>
                  <th>Algorithm</th>
                  <th>Allowed</th>
                  <th>Blocked</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.topKeys || []).map((k) => (
                  <tr key={k.api_key_id}>
                    <td className="code-block">{k.api_key_id ? k.api_key_id.substring(0, 8) + '...' : 'Anonymous'}</td>
                    <td>{k.tier_name || 'N/A'}</td>
                    <td>
                      <span className={`badge badge-${k.algorithm === 'fixed_window' ? 'fixed' : k.algorithm === 'sliding_window' ? 'sliding' : 'bucket'}`}>
                        {k.algorithm || 'unknown'}
                      </span>
                    </td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>{k.allowed}</td>
                    <td style={{ color: '#f43f5e', fontWeight: 600 }}>{k.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
