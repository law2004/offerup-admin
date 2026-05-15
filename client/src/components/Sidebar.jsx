import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/scrape', label: 'Scrape', icon: '🔍' },
  { path: '/auto', label: 'Auto Scrape', icon: '🔄' },
  { path: '/items', label: 'Items', icon: '📦' },
  { path: '/terminal', label: 'Terminal', icon: '⬛' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const { serverOnline, autoActive } = useApp();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">📱</div>
        <div className="brand-text">
          <h1>OfferUp</h1>
          <span>Admin Panel</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="status-row">
          <span className={`status-dot ${serverOnline ? 'online' : 'offline'}`} />
          <span>Server: {serverOnline ? 'Online' : 'Offline'}</span>
        </div>
        {autoActive && (
          <div className="status-row auto-badge">
            <span className="pulse-dot" />
            <span>Auto-scrape active</span>
          </div>
        )}
      </div>
    </aside>
  );
}
