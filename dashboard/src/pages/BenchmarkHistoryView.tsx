import React, { useState, useEffect } from 'react';
import { History, Download, Trash2, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';

export const BenchmarkHistoryView: React.FC = () => {
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);

  const fetchBenchmarks = () => {
    fetch('/admin/benchmarks')
      .then((res) => res.json())
      .then((data) => setBenchmarks(data.benchmarks || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchBenchmarks();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/admin/benchmarks/${id}`, { method: 'DELETE' });
      if (selectedRun?.id === id) setSelectedRun(null);
      fetchBenchmarks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(benchmarks, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `benchmark_history_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="view-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Benchmark Audit Log & History</h1>
          <p className="page-desc">Persistent history of benchmark runs, enforcement accuracy, and exported reports</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={handleExportJSON}>
            <Download size={14} /> Export History (JSON)
          </button>
        </div>
      </div>

      {/* Audit Log Data Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Algorithm</th>
              <th>Pattern</th>
              <th>Rate / Concurrency</th>
              <th>Actual Throughput</th>
              <th>P95 Latency</th>
              <th>Limiter Accuracy</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {benchmarks.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No saved benchmark runs yet. Run a load test and click "Save Benchmark Report".
                </td>
              </tr>
            ) : (
              benchmarks.map((b) => (
                <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedRun(b)}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{b.timestamp}</td>
                  <td><span className="badge badge-bucket">{b.algorithm}</span></td>
                  <td style={{ textTransform: 'capitalize' }}>{b.pattern}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{b.rateReqSec} req/s ({b.concurrency} VUs)</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa', fontWeight: 600 }}>{b.actualRps} req/s</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{b.p95LatencyMs} ms</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#34d399', fontWeight: 700 }}>{b.limiterAccuracy}%</td>
                  <td>
                    <span className={`badge ${b.status === 'PASS' ? 'badge-success' : b.status === 'WARN' ? 'badge-warning' : 'badge-danger'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.4rem', color: '#f87171' }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Selected Benchmark Detail Modal / Panel */}
      {selectedRun && (
        <div className="card" style={{ border: '1px solid var(--accent-blue)', marginTop: '1rem' }}>
          <div className="card-title">
            <span>Benchmark Run Detailed Analysis: {selectedRun.id}</span>
            <button className="btn btn-secondary" onClick={() => setSelectedRun(null)}>Close</button>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <p><strong>Target Key ID:</strong> {selectedRun.targetKeyId}</p>
            <p><strong>Total Requests Processed:</strong> {selectedRun.totalRequests} ({selectedRun.allowedCount} allowed / {selectedRun.blockedCount} blocked)</p>
            <p><strong>Engineering Summary:</strong> {selectedRun.reportSummary}</p>
          </div>
        </div>
      )}
    </div>
  );
};
