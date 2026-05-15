import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

export default function Dashboard() {
  const { addToast, serverOnline, autoActive } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);
      const data = await api.getStats();
      setStats(data);
    } catch {
      // stats endpoint may not be available yet
      setStats({ totalItems: 0, totalScrapes: 0, activeJobs: autoActive ? 1 : 0 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="main-header">
        <h2>Dashboard</h2>
        <p>Overview of your OfferUp monitoring</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-value">{loading ? '...' : stats?.totalItems ?? 0}</div>
          <div className="stat-label">Items Tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔍</div>
          <div className="stat-value">{loading ? '...' : stats?.totalScrapes ?? 0}</div>
          <div className="stat-label">Total Scrapes</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔄</div>
          <div className="stat-value">{autoActive ? 'Active' : 'Idle'}</div>
          <div className="stat-label">Auto Scrape</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">{serverOnline ? '🟢' : '🔴'}</div>
          <div className="stat-value">{serverOnline ? 'Online' : 'Offline'}</div>
          <div className="stat-label">Server Status</div>
        </div>
      </div>

      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-cards">
          <Link to="/scrape" className="action-card">
            <span className="action-icon">🔍</span>
            <span className="action-label">Quick Scrape</span>
            <span className="action-desc">Scrape a single OfferUp URL</span>
          </Link>
          <Link to="/auto" className="action-card">
            <span className="action-icon">🔄</span>
            <span className="action-label">Auto Scrape</span>
            <span className="action-desc">Set up automatic monitoring</span>
          </Link>
          <Link to="/items" className="action-card">
            <span className="action-icon">📦</span>
            <span className="action-label">View Items</span>
            <span className="action-desc">Browse all scraped listings</span>
          </Link>
          <Link to="/settings" className="action-card">
            <span className="action-icon">⚙️</span>
            <span className="action-label">Settings</span>
            <span className="action-desc">Configure Telegram & defaults</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
