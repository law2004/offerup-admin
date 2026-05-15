import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

export default function AutoScrape() {
  const { addToast, autoActive, setAutoActive, refreshStatus, settings } = useApp();
  const [urlEntries, setUrlEntries] = useState([{ id: 1, url: '', label: '', source: 'auto' }]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const nextId = useRef(2);

  useEffect(() => {
    if (autoActive) loadStatus();
  }, [autoActive]);

  async function loadStatus() {
    try {
      const data = await api.autoScrapeStatus();
      setStatus(data);
    } catch { /* ok */ }
  }

  function addUrlEntry() {
    setUrlEntries(prev => [...prev, { id: nextId.current++, url: '', label: '', source: 'auto' }]);
  }

  function removeUrlEntry(id) {
    setUrlEntries(prev => prev.filter(e => e.id !== id));
  }

  function updateUrlEntry(id, field, value) {
    setUrlEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  }

  async function handleStart() {
    const valid = urlEntries.filter(e => e.url.trim());
    if (valid.length === 0) {
      addToast('Add at least one valid OfferUp URL', 'warning');
      return;
    }
    setLoading(true);
    try {
      await api.autoScrapeStart(valid.map(e => ({ url: e.url.trim(), label: e.label.trim(), source: e.source || 'auto' })));
      setAutoActive(true);
      addToast(`Auto-scrape started with ${valid.length} URL(s)`, 'success');
      await loadStatus();
      refreshStatus();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    try {
      await api.autoScrapeStop();
      setAutoActive(false);
      setStatus(null);
      addToast('Auto-scrape stopped', 'success');
      refreshStatus();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const telegramOk = settings?.telegramConfigured;

  return (
    <div className="page">
      <div className="main-header">
        <h2>Auto Scrape</h2>
        <p>Automatically monitor OfferUp URLs at regular intervals</p>
      </div>

      <div className="auto-status-panel">
        <div className="auto-status-indicator">
          <div className={`auto-dot${autoActive ? ' pulsing' : ''}`} />
          <div>
            <strong>{autoActive ? 'Auto-scrape is running' : 'Auto-scrape is idle'}</strong>
            <p>
              {autoActive
                ? `Monitoring ${status?.urls?.length || 0} URL(s) every ${status?.intervalHuman || '5m'}`
                : 'Configure URLs below and start monitoring'}
            </p>
          </div>
        </div>

        {!telegramOk && (
          <div className="telegram-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Telegram is not configured. You won't receive notifications. <Link to="/settings">Configure Telegram →</Link></span>
          </div>
        )}
      </div>

      <div className="multi-url-section">
        {urlEntries.map(entry => (
          <div key={entry.id} className="url-entry-row">
            <input
              type="text"
              value={entry.label}
              onChange={e => updateUrlEntry(entry.id, 'label', e.target.value)}
              className="url-label-input"
              placeholder="Label (e.g. Laptops)"
              disabled={autoActive}
            />
            <input
              type="text"
              value={entry.url}
              onChange={e => updateUrlEntry(entry.id, 'url', e.target.value)}
              className="url-input-compact"
              placeholder="https://offerup.com/search?q=..."
              disabled={autoActive}
            />
            <select
              className="source-select-compact"
              value={entry.source || 'auto'}
              onChange={e => updateUrlEntry(entry.id, 'source', e.target.value)}
              disabled={autoActive}
            >
              <option value="auto">Auto</option>
              <option value="offerup">OfferUp</option>
              <option value="facebook">Facebook</option>
            </select>
            {urlEntries.length > 1 && !autoActive && (
              <button className="url-remove-btn" onClick={() => removeUrlEntry(entry.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        ))}
        {!autoActive && (
          <button className="add-url-btn" onClick={addUrlEntry}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add URL
          </button>
        )}
      </div>

      <div className="auto-btn-group">
        {!autoActive ? (
          <button className="scrape-btn auto-start-btn" onClick={handleStart} disabled={loading}>
            {loading ? <span className="spinner" /> : '▶️'} {loading ? 'Starting...' : 'Start Auto Scrape'}
          </button>
        ) : (
          <button className="scrape-btn auto-stop-btn" onClick={handleStop} disabled={loading}>
            {loading ? <span className="spinner" /> : '⏹️'} {loading ? 'Stopping...' : 'Stop Auto Scrape'}
          </button>
        )}
      </div>

      {status && status.urls && status.urls.length > 0 && (
        <div className="auto-url-status">
          <h3>Monitored URLs</h3>
          {status.urls.map((u, i) => (
            <div key={i} className="auto-url-row">
              <span className="auto-url-label">{u.label || u.url}</span>
              <span className="auto-url-count">{u.listingCount} listings</span>
              <span className="auto-url-time">{u.lastScraped ? new Date(u.lastScraped).toLocaleTimeString() : 'Pending...'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
