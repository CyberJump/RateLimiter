import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Search, Filter, ShieldCheck, RefreshCw } from 'lucide-react';

export const KeysView: React.FC = () => {
  const [keys, setKeys] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTierFilter, setSelectedTierFilter] = useState('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTierForNewKey, setSelectedTierForNewKey] = useState('');
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null);

  const fetchKeys = () => {
    fetch('/admin/keys')
      .then((res) => res.json())
      .then((data) => setKeys(data.keys || []))
      .catch(() => {});

    fetch('/admin/tiers')
      .then((res) => res.json())
      .then((data) => {
        setTiers(data.tiers || []);
        if (data.tiers && data.tiers.length > 0) {
          setSelectedTierForNewKey(data.tiers[0].id);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async () => {
    if (!selectedTierForNewKey) return;
    try {
      const res = await fetch('/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId: selectedTierForNewKey }),
      });
      const data = await res.json();
      if (data.key?.apiKey) {
        setNewKeyResult(data.key.apiKey);
        fetchKeys();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      await fetch(`/admin/keys/${id}`, { method: 'DELETE' });
      fetchKeys();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredKeys = keys.filter((k) => {
    const matchesSearch = k.id.toLowerCase().includes(search.toLowerCase()) || (k.tierName && k.tierName.toLowerCase().includes(search.toLowerCase()));
    const matchesTier = selectedTierFilter === 'ALL' || k.tierName === selectedTierFilter;
    return matchesSearch && matchesTier;
  });

  return (
    <div className="view-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Enterprise API Keys & Rate Limit Policies</h1>
          <p className="page-desc">Provision keys, assign tier algorithms, and inspect key traffic metrics</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowCreateModal(true); setNewKeyResult(null); }}>
          <Plus size={15} /> Issue New API Key
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={14} color="#9ca3af" style={{ position: 'absolute', left: 10, top: 10 }} />
            <input
              type="text"
              placeholder="Search key ID or tier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-input"
              style={{ paddingLeft: '2rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={14} color="#9ca3af" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TIER:</span>
            <select
              value={selectedTierFilter}
              onChange={(e) => setSelectedTierFilter(e.target.value)}
              className="select-input"
              style={{ width: '130px' }}
            >
              <option value="ALL">All Tiers</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Showing <strong>{filteredKeys.length}</strong> active keys
        </span>
      </div>

      {/* Enterprise Data Grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>API Key ID</th>
              <th>Tier</th>
              <th>Algorithm Strategy</th>
              <th>Issued At</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No API keys found matching criteria.
                </td>
              </tr>
            ) : (
              filteredKeys.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#60a5fa' }}>
                    {k.id}
                  </td>
                  <td>
                    <span className="badge badge-bucket">{k.tierName || 'Standard Tier'}</span>
                  </td>
                  <td style={{ textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {k.algorithm || 'token_bucket'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    {k.createdAt ? new Date(k.createdAt).toLocaleDateString() : 'Active'}
                  </td>
                  <td>
                    {k.revokedAt ? (
                      <span className="badge badge-danger">REVOKED</span>
                    ) : (
                      <span className="badge badge-success">● ACTIVE</span>
                    )}
                  </td>
                  <td>
                    {!k.revokedAt && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: '#f87171' }}
                        onClick={() => handleRevokeKey(k.id)}
                      >
                        <Trash2 size={12} /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Key Creation Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: '420px', border: '1px solid var(--accent-blue)' }}>
            <div className="card-title">
              <span>Issue Enterprise API Key</span>
            </div>

            {newKeyResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ background: 'rgba(16,185,129,0.1)', padding: '0.85rem', borderRadius: 6, border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', fontSize: '0.8rem' }}>
                  <strong>Key Generated Successfully!</strong> Store this key securely — it will not be displayed again.
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', background: '#000', padding: '0.75rem', borderRadius: 6, color: '#60a5fa', wordBreak: 'break-all', fontSize: '0.85rem' }}>
                  {newKeyResult}
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreateModal(false)}>
                  Close
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label>Select Rate Limiting Tier</label>
                  <select
                    value={selectedTierForNewKey}
                    onChange={(e) => setSelectedTierForNewKey(e.target.value)}
                    className="select-input"
                  >
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.algorithm} - {t.limit} req / {t.windowSecs}s)
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleCreateKey}>
                    Generate API Key
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
