const BASE = '';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  health: () => request('GET', '/api/health'),
  config: () => request('GET', '/api/config'),
  scrape: (url, source) => request('POST', '/api/scrape', { url, source: source || 'auto' }),
  scrapeAll: (urls) => request('POST', '/api/scrape-all', { urls }),
  autoScrapeStart: (urls) => request('POST', '/api/auto-scrape/start', { urls }),
  autoScrapeStop: () => request('POST', '/api/auto-scrape/stop'),
  autoScrapeStatus: () => request('GET', '/api/auto-scrape/status'),
  saveSettings: (settings) => request('POST', '/api/settings', settings),
  getSettings: () => request('GET', '/api/settings'),
  getStats: () => request('GET', '/api/stats'),
  getItems: (filters) => request('POST', '/api/items', filters || {}),
  exportItems: async (format) => {
    const res = await fetch(`/api/items/export?format=${format || 'json'}`);
    if (!res.ok) throw new Error('Export failed');
    return format === 'csv' ? res.text() : res.json();
  },
};
