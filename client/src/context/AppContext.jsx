import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [autoActive, setAutoActive] = useState(false);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const [health, config, autoStatus] = await Promise.all([
        api.health(), api.config(), api.autoScrapeStatus()
      ]);
      setServerOnline(true);
      setAutoActive(autoStatus.active);
      setSettings(prev => ({ ...prev, ...config, telegramConfigured: config.telegramConfigured }));
    } catch {
      setServerOnline(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      setSettings(prev => ({ ...prev, ...data }));
    } catch { /* server may not support settings yet */ }
  }, []);

  useEffect(() => {
    refreshStatus();
    loadSettings();
    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshStatus, loadSettings]);

  const value = {
    toasts, addToast, removeToast,
    settings, setSettings, loadSettings,
    serverOnline, autoActive, setAutoActive,
    refreshStatus,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
