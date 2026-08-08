import React, { useState } from 'react';
import { Settings, Save, Sliders, ShieldCheck, Database } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState({
    pollingIntervalMs: 1000,
    slaP95ThresholdMs: 5.0,
    slaP99ThresholdMs: 15.0,
    exportFormat: 'json',
    compactMode: true,
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="view-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Observability Platform Settings</h1>
          <p className="page-desc">Telemetry polling preferences, SLA alert thresholds, and export formats</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={14} /> {saved ? 'Settings Saved' : 'Save Preferences'}
        </button>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Telemetry & Polling Controls</div>

          <div className="form-group">
            <label>Real-Time Streaming Interval (ms)</label>
            <select
              value={settings.pollingIntervalMs}
              onChange={(e) => setSettings({ ...settings, pollingIntervalMs: Number(e.target.value) })}
              className="select-input"
            >
              <option value={1000}>1000ms (1 Second Realtime)</option>
              <option value={3000}>3000ms (3 Seconds)</option>
              <option value={5000}>5000ms (5 Seconds)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Default Export Format</label>
            <select
              value={settings.exportFormat}
              onChange={(e) => setSettings({ ...settings, exportFormat: e.target.value })}
              className="select-input"
            >
              <option value="json">JSON Benchmark Export</option>
              <option value="csv">CSV Audit Export</option>
            </select>
          </div>
        </div>

        <div className="card">
          <div className="card-title">SLA Alert Thresholds</div>

          <div className="form-group">
            <label>P95 Latency SLA Warning Cap (ms)</label>
            <input
              type="number"
              step="0.5"
              value={settings.slaP95ThresholdMs}
              onChange={(e) => setSettings({ ...settings, slaP95ThresholdMs: Number(e.target.value) })}
              className="text-input"
            />
          </div>

          <div className="form-group">
            <label>P99 Latency SLA Warning Cap (ms)</label>
            <input
              type="number"
              step="0.5"
              value={settings.slaP99ThresholdMs}
              onChange={(e) => setSettings({ ...settings, slaP99ThresholdMs: Number(e.target.value) })}
              className="text-input"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
