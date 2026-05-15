const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    ensureDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[storage] Failed to write ${filePath}:`, e.message);
  }
}

// Items
function getItems() {
  return readJSON(ITEMS_FILE, []);
}

function addItems(newItems) {
  const existing = getItems();
  const existingIds = new Set(existing.map(i => i.url));
  const toAdd = newItems.filter(i => !existingIds.has(i.url));
  if (toAdd.length > 0) {
    const merged = [...toAdd, ...existing].slice(0, 10000); // cap at 10k
    writeJSON(ITEMS_FILE, merged);
  }
  return toAdd;
}

function filterItems(filters = {}) {
  let items = getItems();
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    items = items.filter(i => (i.title || '').toLowerCase().includes(kw) || (i.description || '').toLowerCase().includes(kw));
  }
  if (filters.minPrice) {
    const min = parseFloat(filters.minPrice);
    if (!isNaN(min)) items = items.filter(i => extractPrice(i.price) >= min);
  }
  if (filters.maxPrice) {
    const max = parseFloat(filters.maxPrice);
    if (!isNaN(max)) items = items.filter(i => extractPrice(i.price) <= max);
  }
  if (filters.source && filters.source !== 'all') {
    items = items.filter(i => (i.source || 'offerup') === filters.source);
  }
  return items;
}

function extractPrice(priceStr) {
  if (!priceStr) return 0;
  const match = priceStr.match(/[\d,.]+/);
  return match ? parseFloat(match[0].replace(/,/g, '')) : 0;
}

function exportItems(format) {
  const items = getItems();
  if (format === 'csv') {
    const header = 'Title,Price,Location,Description,URL\n';
    const rows = items.map(i => `"${(i.title || '').replace(/"/g, '""')}","${(i.price || '').replace(/"/g, '""')}","${(i.location || '').replace(/"/g, '""')}","${(i.description || '').replace(/"/g, '""')}","${i.url || ''}"`).join('\n');
    return header + rows;
  }
  return JSON.stringify(items, null, 2);
}

// Settings
function getSettings() {
  return readJSON(SETTINGS_FILE, {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    scrapeIntervalMs: parseInt(process.env.SCRAPE_INTERVAL_MS) || 300000,
    minPrice: '',
    maxPrice: '',
    keywordBlacklist: '',
    facebookCookies: '',
  });
}

function saveSettings(newSettings) {
  const current = getSettings();
  const merged = { ...current, ...newSettings };
  writeJSON(SETTINGS_FILE, merged);
  return merged;
}

// Jobs (auto-scrape)
function getJobs() {
  return readJSON(JOBS_FILE, []);
}

function saveJobs(jobs) {
  writeJSON(JOBS_FILE, jobs);
  return jobs;
}

// Stats
function getStats() {
  const items = getItems();
  const jobs = getJobs();
  return {
    totalItems: items.length,
    totalScrapes: 0, // would need counter tracking
    activeJobs: jobs.length,
    recentItemCount: items.length,
  };
}

module.exports = {
  getItems, addItems, filterItems, exportItems,
  getSettings, saveSettings,
  getJobs, saveJobs,
  getStats,
};
