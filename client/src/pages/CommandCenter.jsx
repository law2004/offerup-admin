import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

const SOURCES = [
  { value: 'auto', label: 'Auto Detect' },
  { value: 'offerup', label: 'OfferUp' },
  { value: 'facebook', label: 'Facebook' },
];

export default function CommandCenter() {
  const { addToast, serverOnline, autoActive } = useApp();

  // ── State ──
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [autoStatus, setAutoStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [deals, setDeals] = useState([]);
  const [currentTime, setCurrentTime] = useState('');

  // Scrape form
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeSource, setScrapeSource] = useState('auto');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);

  // Bulk scrape
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkUrls, setBulkUrls] = useState([{ url: '', label: '' }]);
  const [bulkResult, setBulkResult] = useState(null);

  // Search
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchSource, setSearchSource] = useState('all');
  const [searchMinPrice, setSearchMinPrice] = useState('');
  const [searchMaxPrice, setSearchMaxPrice] = useState('');
  const [searching, setSearching] = useState(false);

  // Deals
  const [analyzing, setAnalyzing] = useState(false);

  // Auto-scrape
  const [autoUrl, setAutoUrl] = useState('');
  const [autoStarting, setAutoStarting] = useState(false);
  const [autoStopping, setAutoStopping] = useState(false);

  // Settings
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const clockRef = useRef(null);
  const refreshRef = useRef(null);

  // ── Clock ──
  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toLocaleTimeString());
    tick();
    clockRef.current = setInterval(tick, 1000);
    return () => clearInterval(clockRef.current);
  }, []);

  // ── Data loading ──
  const loadAll = useCallback(async () => {
    try {
      const [h, s, a, d] = await Promise.allSettled([
        api.health(),
        api.getStats(),
        api.autoScrapeStatus(),
        api.getDeals(),
      ]);
      if (h.status === 'fulfilled') setHealth(h.value);
      if (s.status === 'fulfilled') setStats(s.value);
      if (a.status === 'fulfilled') setAutoStatus(a.value);
      if (d.status === 'fulfilled') setDeals(d.value?.deals || []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadAll();
    refreshRef.current = setInterval(loadAll, 8000);
    return () => clearInterval(refreshRef.current);
  }, [loadAll]);

  async function loadSettings() {
    try {
      const s = await api.getSettings();
      setSettings(s);
    } catch (_) {}
  }

  // ── Scrape ──
  const handleScrape = useCallback(async (e) => {
    e?.preventDefault();
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setScrapeResult(null);
    try {
      const data = await api.scrape(scrapeUrl.trim(), scrapeSource);
      setScrapeResult(data);
      if (data.listings?.length > 0) {
        addToast(`Scraped ${data.total} listings [${data.source}]`, 'success');
      } else {
        addToast('No listings found', 'warning');
      }
      loadAll();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setScraping(false);
    }
  }, [scrapeUrl, scrapeSource, addToast, loadAll]);

  // ── Bulk Scrape ──
  const addBulkRow = () => setBulkUrls(prev => [...prev, { url: '', label: '' }]);
  const removeBulkRow = (i) => setBulkUrls(prev => prev.filter((_, idx) => idx !== i));
  const updateBulkRow = (i, field, value) => {
    setBulkUrls(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const handleBulkScrape = useCallback(async () => {
    const valid = bulkUrls.filter(r => r.url.trim());
    if (valid.length === 0) return;
    setScraping(true);
    setBulkResult(null);
    try {
      const urls = valid.map((r, i) => ({ url: r.url.trim(), label: r.label.trim() || `URL #${i + 1}`, source: 'auto' }));
      const data = await api.scrapeAll(urls);
      setBulkResult(data);
      const succeeded = data.results?.filter(r => r.success).length || 0;
      addToast(`${succeeded}/${data.results?.length || 0} URLs scraped`, succeeded > 0 ? 'success' : 'warning');
      loadAll();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setScraping(false);
    }
  }, [bulkUrls, addToast, loadAll]);

  // ── Search ──
  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    setSearching(true);
    try {
      const filters = {};
      if (searchKeyword.trim()) filters.keyword = searchKeyword.trim();
      if (searchSource !== 'all') filters.source = searchSource;
      if (searchMinPrice) filters.minPrice = searchMinPrice;
      if (searchMaxPrice) filters.maxPrice = searchMaxPrice;
      const data = await api.getItems(filters);
      setItems(data.items || []);
      addToast(`Found ${data.total || 0} items`, 'info');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSearching(false);
    }
  }, [searchKeyword, searchSource, searchMinPrice, searchMaxPrice, addToast]);

  // ── Deals ──
  const handleAnalyzeDeals = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await api.analyzeDeals();
      addToast(`${result.analyzed} items analyzed`, 'success');
      const d = await api.getDeals();
      setDeals(d?.deals || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [addToast]);

  // ── Auto-Scrape ──
  const handleAutoStart = useCallback(async () => {
    if (!autoUrl.trim()) return;
    setAutoStarting(true);
    try {
      const urls = [{ url: autoUrl.trim(), label: 'Job #1', source: 'auto' }];
      await api.autoScrapeStart(urls);
      addToast('Auto-scrape started', 'success');
      setAutoUrl('');
      loadAll();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAutoStarting(false);
    }
  }, [autoUrl, addToast, loadAll]);

  const handleAutoStop = useCallback(async () => {
    setAutoStopping(true);
    try {
      await api.autoScrapeStop();
      addToast('Auto-scrape stopped', 'info');
      loadAll();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAutoStopping(false);
    }
  }, [addToast, loadAll]);

  // ── Export ──
  const handleExport = useCallback(async (format) => {
    try {
      const data = await api.exportItems(format);
      const blob = new Blob(
        [typeof data === 'string' ? data : JSON.stringify(data, null, 2)],
        { type: format === 'csv' ? 'text/csv' : 'application/json' }
      );
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `offerup-items-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
      addToast(`Exported as ${format.toUpperCase()}`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  }, [addToast]);

  // ── Settings ──
  const settingsLoaded = settings !== null;
  const handleSettingsClick = useCallback(() => {
    const opening = !showSettings;
    if (opening && !settings) loadSettings();
    setShowSettings(prev => !prev);
  }, [showSettings, settings]);

  const handleSaveSettings = useCallback(async (e) => {
    e?.preventDefault();
    try {
      await api.saveSettings(settings);
      addToast('Settings saved', 'success');
      setShowSettings(false);
    } catch (err) {
      addToast(err.message, 'error');
    }
  }, [settings, addToast]);

  // ── Derived ──
  const serverOk = health?.status === 'ok';
  const autoOn = autoStatus?.active || false;
  const scoredDeals = (deals || []).filter(d => d.dealScore != null).sort((a, b) => (b.dealScore || 0) - (a.dealScore || 0));
  const unscoredDeals = (deals || []).filter(d => d.dealScore == null);

  return (
    <div className="command-center">
      {/* ── Header ── */}
      <div className="cc-header">
        <div className="cc-header-left">
          <div className="cc-logo">◈</div>
          <div>
            <h1 className="cc-title">OfferUp Admin</h1>
            <span className="cc-subtitle">Scraper &amp; Deal Analyzer</span>
          </div>
        </div>
        <div className="cc-header-right">
          <span className={`cc-status-dot ${serverOk ? 'cc-online' : 'cc-offline'}`} />
          <span className="cc-status-text">{serverOk ? 'Online' : 'Offline'}</span>
          <span className="cc-clock">{currentTime}</span>
        </div>
      </div>

      <div className="cc-body">
        {/* ── Stats Row ── */}
        <div className="cc-stats-row">
          <div className="cc-stat-card">
            <div className="cc-stat-value">{stats?.totalItems ?? '...'}</div>
            <div className="cc-stat-label">Items Tracked</div>
          </div>
          <div className="cc-stat-card">
            <div className="cc-stat-value">{stats?.activeJobs ?? '...'}</div>
            <div className="cc-stat-label">Active Jobs</div>
          </div>
          <div className="cc-stat-card">
            <div className="cc-stat-value" style={{ color: autoOn ? '#22c55e' : '#6b7280' }}>{autoOn ? 'Active' : 'Idle'}</div>
            <div className="cc-stat-label">Auto Scrape</div>
          </div>
          <div className="cc-stat-card">
            <div className="cc-stat-value" style={{ color: serverOk ? '#22c55e' : '#ef4444' }}>{serverOk ? 'Online' : 'Offline'}</div>
            <div className="cc-stat-label">Server</div>
          </div>
        </div>

        {/* ── Quick Scrape ── */}
        <div className="cc-section">
          <div className="cc-section-header">
            <h3>🔍 Quick Scrape</h3>
            <button
              className="cc-link-btn"
              onClick={() => setBulkMode(!bulkMode)}
            >
              {bulkMode ? 'Single URL' : 'Bulk Scrape'}
            </button>
          </div>

          {!bulkMode ? (
            <form className="cc-scrape-form" onSubmit={handleScrape}>
              <input
                type="url"
                className="cc-input cc-input-url"
                placeholder="Paste OfferUp or Facebook Marketplace URL..."
                value={scrapeUrl}
                onChange={e => setScrapeUrl(e.target.value)}
                disabled={scraping}
              />
              <select
                className="cc-select"
                value={scrapeSource}
                onChange={e => setScrapeSource(e.target.value)}
                disabled={scraping}
              >
                {SOURCES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <button type="submit" className="cc-btn cc-btn-primary" disabled={scraping || !scrapeUrl.trim()}>
                {scraping ? 'Scraping...' : 'Scrape'}
              </button>
            </form>
          ) : (
            <div className="cc-bulk-section">
              {bulkUrls.map((row, i) => (
                <div key={i} className="cc-bulk-row">
                  <input
                    type="text"
                    className="cc-input cc-input-sm"
                    placeholder="Label"
                    value={row.label}
                    onChange={e => updateBulkRow(i, 'label', e.target.value)}
                    disabled={scraping}
                  />
                  <input
                    type="url"
                    className="cc-input cc-input-url"
                    placeholder="URL"
                    value={row.url}
                    onChange={e => updateBulkRow(i, 'url', e.target.value)}
                    disabled={scraping}
                  />
                  {bulkUrls.length > 1 && (
                    <button type="button" className="cc-btn-icon cc-btn-remove" onClick={() => removeBulkRow(i)} title="Remove">
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <div className="cc-bulk-actions">
                <button type="button" className="cc-link-btn" onClick={addBulkRow}>+ Add URL</button>
                <button
                  type="button"
                  className="cc-btn cc-btn-primary"
                  onClick={handleBulkScrape}
                  disabled={scraping || bulkUrls.every(r => !r.url.trim())}
                >
                  {scraping ? 'Scraping...' : `Scrape All (${bulkUrls.filter(r => r.url.trim()).length})`}
                </button>
              </div>
            </div>
          )}

          {/* Scrape result */}
          {scrapeResult && (
            <div className="cc-result">
              <div className="cc-result-header">
                <span className={scrapeResult.listings?.length > 0 ? 'cc-text-success' : 'cc-text-warning'}>
                  {scrapeResult.listings?.length > 0
                    ? `✓ ${scrapeResult.total} listing(s) found [${scrapeResult.source}]`
                    : '⚠ No listings found'}
                </span>
              </div>
              <div className="cc-result-items">
                {scrapeResult.listings?.slice(0, 5).map((l, i) => (
                  <div key={i} className="cc-result-item">
                    <span className="cc-result-title">{l.title?.substring(0, 60) || 'Untitled'}</span>
                    <span className="cc-result-price">{l.price || 'N/A'}</span>
                    <span className="cc-result-location">{l.location || ''}</span>
                  </div>
                ))}
                {scrapeResult.listings?.length > 5 && (
                  <div className="cc-result-more">...and {scrapeResult.listings.length - 5} more</div>
                )}
              </div>
            </div>
          )}

          {/* Bulk result */}
          {bulkResult && (
            <div className="cc-result">
              {bulkResult.results?.map((r, i) => (
                <div key={i} className={`cc-result-item ${!r.success ? 'cc-result-error' : ''}`}>
                  <span className={r.success ? 'cc-text-success' : 'cc-text-error'}>
                    {r.success ? '✓' : '✗'}
                  </span>
                  <span className="cc-result-title">{r.label || r.url}</span>
                  <span className="cc-result-price">{r.success ? `${r.total} items` : r.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Search Items ── */}
        <div className="cc-section">
          <div className="cc-section-header">
            <h3>📦 Search Items</h3>
            <div className="cc-export-btns">
              <button className="cc-btn cc-btn-sm" onClick={() => handleExport('json')}>Export JSON</button>
              <button className="cc-btn cc-btn-sm" onClick={() => handleExport('csv')}>Export CSV</button>
            </div>
          </div>
          <form className="cc-search-form" onSubmit={handleSearch}>
            <input
              type="text"
              className="cc-input"
              placeholder="Keyword (e.g. laptop, couch)..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
            />
            <select
              className="cc-select cc-select-sm"
              value={searchSource}
              onChange={e => setSearchSource(e.target.value)}
            >
              <option value="all">All Sources</option>
              <option value="offerup">OfferUp</option>
              <option value="facebook">Facebook</option>
            </select>
            <input
              type="number"
              className="cc-input cc-input-price"
              placeholder="Min $"
              value={searchMinPrice}
              onChange={e => setSearchMinPrice(e.target.value)}
            />
            <input
              type="number"
              className="cc-input cc-input-price"
              placeholder="Max $"
              value={searchMaxPrice}
              onChange={e => setSearchMaxPrice(e.target.value)}
            />
            <button type="submit" className="cc-btn cc-btn-primary" disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {/* Items list */}
          {items.length > 0 && (
            <div className="cc-items-list">
              {items.slice(0, 12).map((item, i) => (
                <div key={i} className="cc-item-card">
                  <div className="cc-item-main">
                    <span className="cc-item-title" title={item.title}>{item.title || 'Untitled'}</span>
                    <div className="cc-item-meta">
                      <span className="cc-item-price">{item.price || 'N/A'}</span>
                      <span className={`cc-item-source cc-source-${item.source || 'offerup'}`}>
                        {item.source || 'offerup'}
                      </span>
                      {item.location && <span className="cc-item-location">{item.location.substring(0, 20)}</span>}
                      {item.dealScore != null && (
                        <span className={`cc-deal-badge ${item.dealScore >= 8 ? 'cc-deal-high' : item.dealScore >= 6 ? 'cc-deal-mid' : 'cc-deal-low'}`}>
                          {item.dealScore}/10
                        </span>
                      )}
                    </div>
                  </div>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="cc-item-link">
                    ↗
                  </a>
                </div>
              ))}
            </div>
          )}
          {items.length === 0 && !searching && (
            <div className="cc-empty">Search for items to see results here.</div>
          )}
        </div>

        {/* ── AI Deal Analyzer ── */}
        <div className="cc-section">
          <div className="cc-section-header">
            <h3>🤖 AI Deal Analyzer</h3>
            <span className="cc-section-badge">{scoredDeals.length} scored</span>
          </div>

          <div className="cc-deal-controls">
            <p className="cc-deal-desc">
              Uses llama3.2:3b via Ollama to detect scams, compare prices, and score deals.
              {unscoredDeals.length > 0 && (
                <span className="cc-text-warning"> {unscoredDeals.length} items waiting for analysis.</span>
              )}
            </p>
            <button
              className="cc-btn cc-btn-accent"
              onClick={handleAnalyzeDeals}
              disabled={analyzing}
            >
              {analyzing ? 'Analyzing...' : 'Analyze All Deals'}
            </button>
          </div>

          {scoredDeals.length > 0 && (
            <div className="cc-deals-list">
              {scoredDeals.slice(0, 10).map((item, i) => (
                <div key={i} className="cc-deal-card">
                  <div className="cc-deal-score-wrap">
                    <span className={`cc-deal-score ${
                      item.dealScore >= 8 ? 'cc-score-high' :
                      item.dealScore >= 6 ? 'cc-score-mid' : 'cc-score-low'
                    }`}>
                      {item.dealScore}/10
                    </span>
                  </div>
                  <div className="cc-deal-info">
                    <div className="cc-deal-title" title={item.title}>
                      {item.title || (item.url?.length > 60 ? item.url.substring(0, 57) + '...' : item.url) || 'Untitled'}
                    </div>
                    <div className="cc-deal-meta">
                      <span className="cc-item-price">${item.price || '?'}</span>
                      <span className={`cc-item-source cc-source-${item.source || 'offerup'}`}>
                        {item.source || 'offerup'}
                      </span>
                      {item.redFlags?.length > 0 && (
                        <span className="cc-red-flags" title={item.redFlags.join(', ')}>
                          ⚠ {item.redFlags.length} flag{item.redFlags.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {item.summary && (
                        <span className="cc-deal-summary">{item.summary.substring(0, 80)}</span>
                      )}
                    </div>
                  </div>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="cc-item-link">
                    ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Auto-Scrape ── */}
        <div className="cc-section">
          <div className="cc-section-header">
            <h3>🔄 Auto-Scrape</h3>
            <span className={`cc-auto-badge ${autoOn ? 'cc-auto-active' : 'cc-auto-idle'}`}>
              {autoOn ? '● Active' : '○ Idle'}
            </span>
          </div>

          {autoOn && autoStatus?.urls?.length > 0 && (
            <div className="cc-auto-jobs">
              {autoStatus.urls.map((job, i) => (
                <div key={i} className="cc-auto-job">
                  <span className="cc-auto-job-label">{(job.label || job.url).substring(0, 45)}</span>
                  <span className="cc-auto-job-count">{job.listingCount ?? 0} listings</span>
                  <span className="cc-auto-job-time">Last: {job.lastScraped ? new Date(job.lastScraped).toLocaleTimeString() : 'never'}</span>
                </div>
              ))}
              <div className="cc-auto-interval">Interval: {autoStatus.intervalHuman || '--'}</div>
            </div>
          )}

          <div className="cc-auto-controls">
            <input
              type="url"
              className="cc-input cc-input-url"
              placeholder="Add URL to auto-scrape..."
              value={autoUrl}
              onChange={e => setAutoUrl(e.target.value)}
            />
            <button
              className="cc-btn cc-btn-primary"
              onClick={handleAutoStart}
              disabled={autoStarting || !autoUrl.trim() || autoOn}
            >
              {autoStarting ? 'Starting...' : 'Start Auto'}
            </button>
            {autoOn && (
              <button
                className="cc-btn cc-btn-danger"
                onClick={handleAutoStop}
                disabled={autoStopping}
              >
                {autoStopping ? 'Stopping...' : 'Stop Auto'}
              </button>
            )}
          </div>
        </div>

        {/* ── Settings (Collapsible) ── */}
        <div className="cc-section">
          <div className="cc-section-header">
            <h3>⚙️ Settings</h3>
            <button className="cc-link-btn" onClick={handleSettingsClick}>
              {showSettings && settingsLoaded ? 'Hide' : 'Show'}
            </button>
          </div>
          {showSettings && settings && (
            <form className="cc-settings-form" onSubmit={handleSaveSettings}>
              <div className="cc-setting-group">
                <label>Scrape Interval (minutes)</label>
                <input
                  type="number"
                  className="cc-input"
                  value={Math.round((settings.scrapeIntervalMs || 300000) / 60000)}
                  onChange={e => setSettings(prev => ({ ...prev, scrapeIntervalMs: parseInt(e.target.value || '5') * 60000 }))}
                  min="1"
                  max="1440"
                />
              </div>
              <div className="cc-setting-group">
                <label>Min Price Filter ($)</label>
                <input
                  type="number"
                  className="cc-input"
                  value={settings.minPrice || ''}
                  onChange={e => setSettings(prev => ({ ...prev, minPrice: e.target.value }))}
                  placeholder="No minimum"
                />
              </div>
              <div className="cc-setting-group">
                <label>Max Price Filter ($)</label>
                <input
                  type="number"
                  className="cc-input"
                  value={settings.maxPrice || ''}
                  onChange={e => setSettings(prev => ({ ...prev, maxPrice: e.target.value }))}
                  placeholder="No maximum"
                />
              </div>
              <div className="cc-setting-group">
                <label>Keyword Blacklist (comma separated)</label>
                <input
                  type="text"
                  className="cc-input"
                  value={settings.keywordBlacklist || ''}
                  onChange={e => setSettings(prev => ({ ...prev, keywordBlacklist: e.target.value }))}
                  placeholder="e.g. spam, fake"
                />
              </div>
              <button type="submit" className="cc-btn cc-btn-primary">Save Settings</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
