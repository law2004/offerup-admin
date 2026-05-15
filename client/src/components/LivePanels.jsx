import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function LivePanels() {
  const [health, setHealth] = useState(null);
  const [config, setConfig] = useState(null);
  const [settings, setSettings] = useState(null);
  const [autoStatus, setAutoStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const intervalRef = useRef(null);
  const clockRef = useRef(null);

  // ── Clock ──
  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toLocaleTimeString());
    tick();
    clockRef.current = setInterval(tick, 1000);
    return () => clearInterval(clockRef.current);
  }, []);

  // ── Live data fetching ──
  useEffect(() => {
    const fetchData = async () => {
      const results = await Promise.allSettled([
        api.health(),
        api.config(),
        api.getSettings(),
        api.getStats(),
        api.autoScrapeStatus(),
      ]);
      const [healthR, configR, settingsR, statsR, autoR] = results;
      if (healthR.status === 'fulfilled') setHealth(healthR.value);
      if (configR.status === 'fulfilled') setConfig(configR.value);
      if (settingsR.status === 'fulfilled') setSettings(settingsR.value);
      if (statsR.status === 'fulfilled') setStats(statsR.value);
      if (autoR.status === 'fulfilled') setAutoStatus(autoR.value);
      setLastRefresh(new Date().toLocaleTimeString());
    };

    fetchData();
    intervalRef.current = setInterval(fetchData, 4000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // ── Helpers ──
  const elapsed = (dateStr) => {
    if (!dateStr) return 'never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  };

  const serverOnline = health?.status === 'ok';
  const autoActive = autoStatus?.active || false;
  const hasFbCookies = settings?.facebookCookies && settings.facebookCookies.length > 10;
  const telegramOk = config?.telegramConfigured;

  // ── Render ──
  return (
    <div className="live-panels-container">
      {/* ── Header ── */}
      <div className="live-panels-header">
        <span className="live-panels-title">◈ LIVE MONITOR</span>
        <span className="live-panels-clock">{currentTime}</span>
      </div>

      {/* ── Server Status Panel ── */}
      <div className="lp-panel">
        <div className="lp-panel-header">
          <span className="lp-panel-dot lp-dot-green" />
          <span className="lp-panel-label">SERVER STATUS</span>
          <span className="lp-panel-badge">
            {serverOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <div className="lp-panel-body">
          <div className="lp-row">
            <span className="lp-key">Endpoint</span>
            <span className="lp-val lp-mono">localhost:3001</span>
          </div>
          <div className="lp-row">
            <span className="lp-key">Health</span>
            <span className={`lp-val ${health?.status === 'ok' ? 'lp-green' : 'lp-red'}`}>
              {health ? health.status : '...'}
            </span>
          </div>
          <div className="lp-row">
            <span className="lp-key">Auto-Scrape</span>
            <span className={`lp-val ${autoStatus?.active ? 'lp-green' : 'lp-dim'}`}>
              {autoStatus?.active ? '● Active' : '○ Idle'}
            </span>
          </div>
          <div className="lp-row">
            <span className="lp-key">Interval</span>
            <span className="lp-val lp-cyan">{config?.scrapeIntervalHuman || '...'}</span>
          </div>
          <div className="lp-row">
            <span className="lp-key">Telegram</span>
            <span className={`lp-val ${telegramOk ? 'lp-green' : 'lp-dim'}`}>
              {telegramOk ? '● Configured' : '○ Not set'}
            </span>
          </div>
          <div className="lp-row">
            <span className="lp-key">FB Cookies</span>
            <span className={`lp-val ${hasFbCookies ? 'lp-green' : 'lp-dim'}`}>
              {hasFbCookies ? '● Loaded' : '○ Not set'}
            </span>
          </div>
          <div className="lp-row">
            <span className="lp-key">Items DB</span>
            <span className="lp-val lp-yellow">{stats?.totalItems ?? '...'}</span>
          </div>
          <div className="lp-row">
            <span className="lp-key">Active Jobs</span>
            <span className="lp-val lp-yellow">{stats?.activeJobs ?? '...'}</span>
          </div>
        </div>
      </div>

      {/* ── Auto-Scrape Panel ── */}
      <div className="lp-panel">
        <div className="lp-panel-header">
          <span className={`lp-panel-dot ${autoActive ? 'lp-dot-pulse' : 'lp-dot-dim'}`} />
          <span className="lp-panel-label">AUTO-SCRAPE</span>
          <span className={`lp-panel-badge ${autoActive ? 'lp-badge-active' : 'lp-badge-idle'}`}>
            {autoActive ? 'ACTIVE' : 'IDLE'}
          </span>
        </div>
        <div className="lp-panel-body">
          {!autoStatus || !autoStatus.active ? (
            <div className="lp-empty">
              <span className="lp-dim">No auto-scrape jobs running.</span>
              <span className="lp-dim" style={{ fontSize: '10px' }}>
                Type <span className="lp-yellow">auto-start &lt;url&gt;</span> in the terminal.
              </span>
            </div>
          ) : (
            <>
              <div className="lp-row">
                <span className="lp-key">Jobs</span>
                <span className="lp-val lp-cyan">{autoStatus.urls?.length || 0} URL(s)</span>
              </div>
              <div className="lp-row">
                <span className="lp-key">Interval</span>
                <span className="lp-val lp-cyan">{autoStatus.intervalHuman || '--'}</span>
              </div>
              <div className="lp-divider" />
              <div className="lp-jobs-scroll">
                {autoStatus.urls?.map((job, i) => (
                  <div key={i} className="lp-job-card">
                    <div className="lp-job-header">
                      <span className="lp-job-index">{i + 1}.</span>
                      <span className="lp-job-source lp-magenta">
                        {job.source || 'auto'}
                      </span>
                      <span className="lp-job-count lp-green">
                        {job.listingCount ?? 0} listings
                      </span>
                    </div>
                    <div className="lp-job-url lp-mono" title={escapeHtml(job.url)}>
                      {escapeHtml((job.label || job.url || '').substring(0, 55))}
                    </div>
                    <div className="lp-job-meta">
                      <span className="lp-dim">
                        Last: {job.lastScraped ? new Date(job.lastScraped).toLocaleTimeString() : 'never'}
                      </span>
                      <span className="lp-dim">{elapsed(job.lastScraped)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="lp-panel">
        <div className="lp-panel-header">
          <span className="lp-panel-dot lp-dot-cyan" />
          <span className="lp-panel-label">RECENT ITEMS</span>
          <span className="lp-panel-badge">{stats?.recentItemCount ?? 0} new</span>
        </div>
        <div className="lp-panel-body lp-panel-body-sm">
          {stats?.recentItemCount > 0 ? (
            <div className="lp-row">
              <span className="lp-key">Recent</span>
              <span className="lp-val lp-green">{stats.recentItemCount} items scraped recently</span>
            </div>
          ) : (
            <div className="lp-empty">
              <span className="lp-dim">No recent items.</span>
            </div>
          )}
          <div className="lp-row" style={{ marginTop: 4 }}>
            <span className="lp-key">Refreshed</span>
            <span className="lp-val lp-dim">{lastRefresh || '...'}</span>
          </div>
        </div>
      </div>

      {/* ── Footer hints ── */}
      <div className="lp-footer">
        <span className="lp-dim">Refreshes every 4s</span>
        <span className="lp-dim">·</span>
        <span className="lp-dim">Use left panel → for actions</span>
      </div>
    </div>
  );
}
