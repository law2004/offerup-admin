import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import ListingsGrid from '../components/ListingsGrid';

export default function Scrape() {
  const { addToast } = useApp();
  const [url, setUrl] = useState('');
  const [source, setSource] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('single');

  // Multi-scrape state
  const [urlEntries, setUrlEntries] = useState([{ id: 1, url: '', label: '' }]);
  const [multiLoading, setMultiLoading] = useState(false);
  const [multiResults, setMultiResults] = useState(null);

  const nextId = useRef(2);

  async function handleScrape(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const data = await api.scrape(url.trim(), source);
      setResults(data);
      addToast(`Found ${data.total} listing(s)`, 'success');
    } catch (err) {
      setError(err.message);
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
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

  async function handleMultiScrape() {
    const valid = urlEntries.filter(e => e.url.trim());
    if (valid.length === 0) {
      addToast('Add at least one valid OfferUp URL', 'warning');
      return;
    }
    setMultiLoading(true);
    setMultiResults(null);
    try {
      const data = await api.scrapeAll(valid.map(e => ({ url: e.url.trim(), label: e.label.trim(), source: e.source || 'auto' })));
      setMultiResults(data);
      addToast(`Scraped ${data.results.length} URL(s)`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setMultiLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="main-header">
        <h2>Scrape</h2>
        <p>Search OfferUp listings by URL</p>
      </div>

      <div className="tab-bar">
        <button className={`tab ${activeTab === 'single' ? 'tab-active' : ''}`} onClick={() => setActiveTab('single')}>
          🔍 Quick Scrape
        </button>
        <button className={`tab ${activeTab === 'multi' ? 'tab-active' : ''}`} onClick={() => setActiveTab('multi')}>
          📋 Multi Scrape
        </button>
      </div>

      {activeTab === 'single' ? (
        <>
          <form className="scrape-form" onSubmit={handleScrape}>
            <div className="input-group">
              <span className="input-icon">🔗</span>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://offerup.com/search?q=laptop..."
                className="url-input"
                disabled={loading}
              />
            </div>
            <select
              className="source-select"
              value={source}
              onChange={e => setSource(e.target.value)}
              disabled={loading}
            >
              <option value="auto">Auto-detect</option>
              <option value="offerup">OfferUp</option>
              <option value="facebook">Facebook</option>
            </select>
            <button type="submit" className="scrape-btn" disabled={loading || !url.trim()}>
              {loading ? <span className="spinner" /> : '🔍'} {loading ? 'Scraping...' : 'Scrape'}
            </button>
          </form>

          {error && (
            <div className="error-banner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          )}

          {results && (
            <div className="results">
              <div className="results-header">
                <h3>{results.total} Listing{results.total !== 1 ? 's' : ''} Found</h3>
              </div>
              <ListingsGrid listings={results.listings} />
            </div>
          )}

          {!results && !error && !loading && (
            <div className="empty-state">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <h3>Start Scraping</h3>
              <p>Enter an OfferUp search URL above and click Scrape to find listings.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="multi-url-section">
            {urlEntries.map(entry => (
              <div key={entry.id} className="url-entry-row">
                <input
                  type="text"
                  value={entry.label}
                  onChange={e => updateUrlEntry(entry.id, 'label', e.target.value)}
                  className="url-label-input"
                  placeholder="Label (e.g. Laptops)"
                  disabled={multiLoading}
                />
                <input
                  type="text"
                  value={entry.url}
                  onChange={e => updateUrlEntry(entry.id, 'url', e.target.value)}
                  className="url-input-compact"
                  placeholder="https://offerup.com/search?q=..."
                  disabled={multiLoading}
                />
                <select
                  className="source-select-compact"
                  value={entry.source || 'auto'}
                  onChange={e => updateUrlEntry(entry.id, 'source', e.target.value)}
                  disabled={multiLoading}
                >
                  <option value="auto">Auto</option>
                  <option value="offerup">OfferUp</option>
                  <option value="facebook">Facebook</option>
                </select>
                {urlEntries.length > 1 && (
                  <button className="url-remove-btn" onClick={() => removeUrlEntry(entry.id)} disabled={multiLoading}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button className="add-url-btn" onClick={addUrlEntry} disabled={multiLoading}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add URL
            </button>
            <button className="scrape-btn multi-scrape-btn" onClick={handleMultiScrape} disabled={multiLoading}>
              {multiLoading ? <span className="spinner" /> : '📋'} {multiLoading ? 'Scraping...' : 'Scrape All URLs'}
            </button>
          </div>

          {multiResults && (
            <div className="multi-results">
              {multiResults.results.map((r, i) => (
                <div key={i} className={`url-result-group${!r.success ? ' result-error' : ''}`}>
                  <div className="url-result-header">
                    <h4>{r.label || r.url}</h4>
                    <span className="result-count">
                      {r.success ? `${r.listings?.length || 0} found` : 'Error'}
                    </span>
                  </div>
                  {r.success && r.listings?.length > 0 && <ListingsGrid listings={r.listings} />}
                  {r.success && (!r.listings || r.listings.length === 0) && (
                    <div className="no-listings-note">No listings found for this URL</div>
                  )}
                  {!r.success && <div className="error-note">{r.error}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
