import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import ListingsGrid from '../components/ListingsGrid';

export default function Items() {
  const { addToast } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [filters, setFilters] = useState({ keyword: '', minPrice: '', maxPrice: '', source: 'all' });

  async function loadItems() {
    setLoading(true);
    try {
      const data = await api.getItems(filters);
      setItems(data.items || []);
      setLoaded(true);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(format) {
    try {
      const data = await api.exportItems(format);
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data)], {
        type: format === 'csv' ? 'text/csv' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `offerup-items.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      addToast(`Exported as ${format.toUpperCase()}`, 'success');
    } catch {
      addToast('Export failed', 'error');
    }
  }

  return (
    <div className="page">
      <div className="main-header">
        <h2>Items</h2>
        <p>Browse all scraped listings</p>
      </div>

      <div className="items-toolbar">
        <div className="filter-row">
          <input
            type="text"
            value={filters.keyword}
            onChange={e => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
            placeholder="Filter by keyword..."
            className="filter-input"
          />
          <input
            type="number"
            value={filters.minPrice}
            onChange={e => setFilters(prev => ({ ...prev, minPrice: e.target.value }))}
            placeholder="Min $"
            className="filter-input filter-input-sm"
          />
          <input
            type="number"
            value={filters.maxPrice}
            onChange={e => setFilters(prev => ({ ...prev, maxPrice: e.target.value }))}
            placeholder="Max $"
            className="filter-input filter-input-sm"
          />
          <select
            className="source-filter-select"
            value={filters.source || 'all'}
            onChange={e => setFilters(prev => ({ ...prev, source: e.target.value }))}
          >
            <option value="all">All Sources</option>
            <option value="offerup">OfferUp</option>
            <option value="facebook">Facebook</option>
          </select>
          <button className="scrape-btn" onClick={loadItems} disabled={loading}>
            {loading ? <span className="spinner" /> : '🔍'} {loading ? 'Loading...' : 'Search'}
          </button>
        </div>
        <div className="view-toolbar">
          <div className="view-toggle">
            <button className={`view-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button className={`view-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
          <div className="export-btns">
            <button className="scrape-btn export-btn" onClick={() => handleExport('json')} title="Export JSON">
              📥 JSON
            </button>
            <button className="scrape-btn export-btn" onClick={() => handleExport('csv')} title="Export CSV">
              📥 CSV
            </button>
          </div>
        </div>
      </div>

      {loaded && viewMode === 'grid' && <ListingsGrid listings={items} emptyMessage="No items match your filters." />}
      {loaded && viewMode === 'list' && (
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th>Image</th><th>Title</th><th>Price</th><th>Location</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan="5" className="table-empty">No items found</td></tr>
              ) : items.map((item, i) => (
                <tr key={item.id || i}>
                  <td className="td-img">
                    {item.image ? <img src={item.image} alt="" /> : <span className="no-img">—</span>}
                  </td>
                  <td className="td-title">{item.title}</td>
                  <td className="td-price">{item.price || '—'}</td>
                  <td className="td-location">{item.location || '—'}</td>
                  <td className="td-actions">
                    {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="card-link">View</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loaded && !loading && (
        <div className="empty-state">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <h3>Load Items</h3>
          <p>Click Search to load scraped listings from the database.</p>
        </div>
      )}
    </div>
  );
}
