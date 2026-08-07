import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Key, Check, Copy } from 'lucide-react';

interface Tier {
  id: string;
  name: string;
  algorithm: string;
  limit: number;
  windowSecs: number;
  burstCapacity: number | null;
}

interface ApiKey {
  id: string;
  tierId: string;
  tierName: string;
  algorithm: string;
  createdAt: string;
  revokedAt: string | null;
}

export const KeysView: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [newCreatedKey, setNewCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/admin/keys');
      if (res.ok) {
        const json = await res.json();
        setKeys(json.keys || []);
      }
    } catch (e) {
      console.error('Failed to fetch keys', e);
    }
  };

  const fetchTiers = async () => {
    try {
      const res = await fetch('/admin/tiers');
      if (res.ok) {
        const json = await res.json();
        setTiers(json.tiers || []);
        if (json.tiers && json.tiers.length > 0) {
          setSelectedTierId(json.tiers[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch tiers', e);
    }
  };

  useEffect(() => {
    fetchKeys();
    fetchTiers();
  }, []);

  const handleCreateKey = async () => {
    if (!selectedTierId) return;

    try {
      const res = await fetch('/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId: selectedTierId }),
      });

      if (res.ok) {
        const json = await res.json();
        setNewCreatedKey(json.key.apiKey);
        fetchKeys();
      }
    } catch (e) {
      console.error('Failed to create key', e);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key?')) return;

    try {
      const res = await fetch(`/admin/keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchKeys();
      }
    } catch (e) {
      console.error('Failed to revoke key', e);
    }
  };

  const handleCopyKey = () => {
    if (newCreatedKey) {
      navigator.clipboard.writeText(newCreatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">API Keys & Tier Management</h1>
          <p className="page-desc">Issue API keys, assign rate-limiting tiers, and manage key revocations</p>
        </div>
      </div>

      {/* Created Key Banner */}
      {newCreatedKey && (
        <div className="card" style={{ marginBottom: '2rem', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.08)' }}>
          <div className="card-title" style={{ color: '#34d399' }}>
            <span>API Key Created Successfully!</span>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Store this key securely now</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
            <span className="code-block" style={{ fontSize: '1rem', padding: '0.5rem 1rem', color: '#34d399' }}>
              {newCreatedKey}
            </span>
            <button className="btn btn-primary" onClick={handleCopyKey}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button className="btn" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }} onClick={() => setNewCreatedKey(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create Key Card */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-title">Issue New API Key</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select
            value={selectedTierId}
            onChange={(e) => setSelectedTierId(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.4)',
              color: '#fff',
              border: '1px solid var(--bg-card-border)',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              minWidth: 240,
            }}
          >
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name.toUpperCase()} — {t.algorithm} ({t.limit} req / {t.windowSecs}s)
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleCreateKey}>
            <Plus size={16} />
            Issue API Key
          </button>
        </div>
      </div>

      {/* Keys Table */}
      <div className="card">
        <div className="card-title">Issued API Keys</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Key ID</th>
                <th>Tier</th>
                <th>Algorithm</th>
                <th>Created At</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="code-block">{k.id}</td>
                  <td style={{ fontWeight: 600 }}>{k.tierName}</td>
                  <td>
                    <span className={`badge badge-${k.algorithm === 'fixed_window' ? 'fixed' : k.algorithm === 'sliding_window' ? 'sliding' : 'bucket'}`}>
                      {k.algorithm}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    {new Date(k.createdAt).toLocaleString()}
                  </td>
                  <td>
                    {k.revokedAt ? (
                      <span className="badge" style={{ background: 'rgba(244,63,94,0.15)', color: '#fb7185' }}>Revoked</span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>Active</span>
                    )}
                  </td>
                  <td>
                    {!k.revokedAt && (
                      <button className="btn btn-danger" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleRevokeKey(k.id)}>
                        <Trash2 size={14} />
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
