import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Calendar, Filter } from 'lucide-react';

interface HistoryMetric {
  time_bucket: string;
  algorithm: string;
  allowed: number;
  blocked: number;
  total: number;
}

export const HistoryView: React.FC = () => {
  const [data, setData] = useState<HistoryMetric[]>([]);
  const [selectedAlgo, setSelectedAlgo] = useState<string>('');

  const fetchHistory = async () => {
    try {
      const url = selectedAlgo ? `/admin/metrics/history?algorithm=${selectedAlgo}` : '/admin/metrics/history';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setData(json.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch history', e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedAlgo]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Historical Analytics</h1>
          <p className="page-desc">Query traffic volume and rate limiting behavior over time by algorithm</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={16} /> Filter Criteria
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select
            value={selectedAlgo}
            onChange={(e) => setSelectedAlgo(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.4)',
              color: '#fff',
              border: '1px solid var(--bg-card-border)',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              minWidth: 200,
            }}
          >
            <option value="">All Algorithms</option>
            <option value="fixed_window">Fixed Window</option>
            <option value="sliding_window">Sliding Window Log</option>
            <option value="token_bucket">Token Bucket</option>
          </select>

          <button className="btn btn-primary" onClick={fetchHistory}>
            Refresh Query
          </button>
        </div>
      </div>

      {/* Historical Bar Chart */}
      <div className="card">
        <div className="card-title">Request Volume over Time (Grouped by Minute)</div>
        <div style={{ width: '100%', height: 350 }}>
          <ResponsiveContainer>
            <BarChart data={data}>
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
