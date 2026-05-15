import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

// ─── Command definitions ───
const COMMANDS = {
  help: {
    syntax: 'help',
    desc: 'Show available commands',
    category: 'general',
  },
  clear: {
    syntax: 'clear / cls',
    desc: 'Clear the terminal screen',
    category: 'general',
  },
  about: {
    syntax: 'about',
    desc: 'About this admin panel',
    category: 'general',
  },
  status: {
    syntax: 'status',
    desc: 'Show server and auto-scrape status',
    category: 'info',
  },
  stats: {
    syntax: 'stats',
    desc: 'Show item and job statistics',
    category: 'info',
  },
  settings: {
    syntax: 'settings',
    desc: 'Show current configuration',
    category: 'info',
  },
  scrape: {
    syntax: 'scrape <url> [source]',
    desc: 'Scrape a URL (source: auto|offerup|facebook)',
    category: 'scraping',
  },
  'scrape-all': {
    syntax: 'scrape-all <url1> <url2> ...',
    desc: 'Scrape multiple URLs at once',
    category: 'scraping',
  },
  items: {
    syntax: 'items [keyword] [source] [minPrice] [maxPrice]',
    desc: 'List scraped items with optional filters',
    category: 'data',
  },
  export: {
    syntax: 'export <json|csv>',
    desc: 'Export all items as JSON or CSV',
    category: 'data',
  },
  'auto-start': {
    syntax: 'auto-start <url1> <url2> ...',
    desc: 'Start auto-scraping on the given URLs',
    category: 'auto',
  },
  'auto-stop': {
    syntax: 'auto-stop',
    desc: 'Stop auto-scraping',
    category: 'auto',
  },
  'auto-status': {
    syntax: 'auto-status',
    desc: 'Show auto-scrape status',
    category: 'auto',
  },
  ai: {
    syntax: 'ai <natural language>',
    desc: 'AI assistant — type what you want in plain English',
    category: 'ai',
  },
  live: {
    syntax: 'live',
    desc: 'Enter live dashboard mode (auto-refreshing stats & items)',
    category: 'ai',
  },
};

const HELP_TEXT = `
╔══════════════════════════════════════════════════════════════╗
║             OFFERUP ADMIN — CMD TERMINAL v2.0               ║
╠══════════════════════════════════════════════════════════════╣
${Object.entries(COMMANDS)
  .map(([cmd, { syntax, desc }]) => `║  ${syntax.padEnd(38)} ${desc.padEnd(20)} ║`)
  .join('\n')}
╚══════════════════════════════════════════════════════════════╝

  💡 Pro tip: Use \x1b[36mai <your request>\x1b[0m to talk naturally.
     e.g. \x1b[36mai find cheap laptops on facebook under $500\x1b[0m
`;

const ABOUT_TEXT = `
OfferUp Admin Panel v2.0
========================
  Scraper engine: Cheerio (OfferUp) + Playwright (Facebook)
  Persistence:    JSON file storage (server/data/)
  Notifications:  Telegram (optional)
  Sources:        OfferUp, Facebook Marketplace
  AI:             Natural language command routing

  Built with React + Vite + Express.
`;

// ─── Color formatters ───
const colors = {
  green: (t) => `\x1b[32m${t}\x1b[0m`,
  red: (t) => `\x1b[31m${t}\x1b[0m`,
  yellow: (t) => `\x1b[33m${t}\x1b[0m`,
  blue: (t) => `\x1b[34m${t}\x1b[0m`,
  cyan: (t) => `\x1b[36m${t}\x1b[0m`,
  magenta: (t) => `\x1b[35m${t}\x1b[0m`,
  gray: (t) => `\x1b[90m${t}\x1b[0m`,
  bold: (t) => `\x1b[1m${t}\x1b[0m`,
  dim: (t) => `\x1b[2m${t}\x1b[0m`,
  blink: (t) => `\x1b[5m${t}\x1b[0m`,
};

// ─── HTML escaping ───
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── ANSI → HTML converter ───
function ansiToHtml(text) {
  const colorMap = {
    '32': 'ansi-green',
    '31': 'ansi-red',
    '33': 'ansi-yellow',
    '34': 'ansi-blue',
    '36': 'ansi-cyan',
    '35': 'ansi-magenta',
    '90': 'ansi-gray',
    '1': 'ansi-bold',
    '2': 'ansi-dim',
    '5': 'ansi-blink',
  };
  const parts = [];
  let lastIdx = 0;
  const re = /\x1b\[(\d+)m/g;
  let match;
  const openTags = [];
  while ((match = re.exec(text)) !== null) {
    parts.push(escapeHtml(text.slice(lastIdx, match.index)));
    lastIdx = match.index + match[0].length;
    const code = match[1];
    if (code === '0') {
      while (openTags.length) {
        parts.push('</span>');
        openTags.pop();
      }
    } else if (colorMap[code]) {
      openTags.push(code);
      parts.push(`<span class="${colorMap[code]}">`);
    }
  }
  parts.push(escapeHtml(text.slice(lastIdx)));
  while (openTags.length) {
    parts.push('</span>');
    openTags.pop();
  }
  return parts.join('');
}

// ═══════════════════════════════════════════════
//  AI NATURAL LANGUAGE COMMAND PARSER
// ═══════════════════════════════════════════════
function parseAICommand(input) {
  const text = input.toLowerCase().trim();

  const extractUrls = (str) => {
    const urls = str.match(/https?:\/\/[^\s]+/g);
    return urls || [];
  };

  const urls = extractUrls(input);

  // Detect source
  let source = 'auto';
  if (text.includes('facebook') || text.includes('fb ')) source = 'facebook';
  else if (text.includes('offerup')) source = 'offerup';

  // ── Export ──
  if (text.includes('export') || text.includes('save') || text.includes('download')) {
    const format = text.includes('csv') ? 'csv' : 'json';
    return { command: 'export', args: [format], response: `Exporting all items as ${format.toUpperCase()}...` };
  }

  // ── Auto-stop ──
  if ((text.includes('stop') || text.includes('pause') || text.includes('cancel')) &&
      (text.includes('auto') || text.includes('scrap') || text.includes('monitor'))) {
    return { command: 'auto-stop', args: [], response: 'Stopping auto-scrape...' };
  }

  // ── Auto-start ──
  if ((text.includes('start') || text.includes('begin')) &&
      (text.includes('auto') || text.includes('monitor') || text.includes('watching'))) {
    if (urls.length > 0) {
      return { command: 'auto-start', args: urls, response: `Starting auto-scrape on ${urls.length} URL(s)...` };
    }
    return { command: null, args: [], response: 'I need URLs to start monitoring. Try: auto-start <url1> <url2> ...' };
  }

  // ── Combined status ──
  if (text.includes("what's going on") || text.includes("whats going on") ||
      text.includes('overview') || text.includes('dashboard') || text.includes('tell me everything')) {
    return { command: 'status', args: ['--full'], response: 'Fetching full system overview...' };
  }

  // ── Live mode ──
  if (text.includes('live') || text.includes('monitor on') || text.includes('watch')) {
    return { command: 'live', args: [], response: 'Entering live dashboard mode...' };
  }

  // ── Individual status ──
  if (text === 'status' || text.includes('server status')) return { command: 'status', args: [], response: 'Checking server status...' };
  if (text === 'stats' || text.includes('statistics')) return { command: 'stats', args: [], response: 'Fetching statistics...' };
  if (text.includes('auto') && text.includes('status')) return { command: 'auto-status', args: [], response: 'Checking auto-scrape status...' };

  // ── Settings ──
  if (text.includes('setting') || text.includes('config')) return { command: 'settings', args: [], response: 'Loading settings...' };

  // ── Clear ──
  if (text.includes('clear') || text.includes('clean screen')) return { command: 'clear', args: [], response: '' };

  // ── About ──
  if (text.includes('about') || text.includes('who are you') || text.includes('version')) return { command: 'about', args: [], response: '' };

  // ── Search / Query items ──
  if (text.includes('show') || text.includes('list') || text.includes('find') || text.includes('search') || text.includes('look')) {
    let keyword = '';
    let minPrice = '';
    let maxPrice = '';

    const underMatch = text.match(/under\s*\$?(\d+)/);
    if (underMatch) maxPrice = underMatch[1];

    const overMatch = text.match(/over\s*\$?(\d+)/);
    if (overMatch) minPrice = overMatch[1];

    const betweenMatch = text.match(/between\s*\$?(\d+)\s*(and|to|\-)\s*\$?(\d+)/);
    if (betweenMatch) { minPrice = betweenMatch[1]; maxPrice = betweenMatch[3]; }

    if (text.includes('cheap') && !maxPrice) maxPrice = '100';

    const stopWords = new Set(['find', 'me', 'show', 'all', 'cheap', 'listings', 'under', 'over',
      'for', 'on', 'from', 'facebook', 'offerup', 'fb', 'items', 'the', 'a', 'an', 'in',
      'search', 'look', 'looking', 'get', 'display', 'any', 'some', 'recent', 'latest',
      'between', 'and', 'to', 'with', 'that', 'are', 'is', 'price', 'priced', 'cost']);
    const words = text.split(/\s+/);
    const potentialKeywords = words.filter(w =>
      !stopWords.has(w) && !w.startsWith('$') && isNaN(w) && w.length > 1
    );

    if (potentialKeywords.length > 0) {
      keyword = potentialKeywords[0];
    }

    return {
      command: 'items',
      args: [keyword, source !== 'auto' ? source : '', minPrice, maxPrice].filter(Boolean),
      response: `Searching for ${keyword || 'items'}${source !== 'auto' ? ` on ${source}` : ''}${maxPrice ? ` under $${maxPrice}` : ''}${minPrice ? ` over $${minPrice}` : ''}...`
    };
  }

  // ── Scrape ──
  if (text.includes('scrape') || text.includes('fetch') || text.includes('grab')) {
    if (urls.length > 1) {
      return { command: 'scrape-all', args: urls, response: `Scraping ${urls.length} URLs...` };
    }
    if (urls.length === 1) {
      return { command: 'scrape', args: [urls[0], source], response: `Scraping: ${urls[0]} [${source}]` };
    }
    // No URL — generate a search URL
    const kwMatch = text.match(/for\s+([a-zA-Z0-9 _-]+?)(\s|$)/);
    const kw = kwMatch ? kwMatch[1].trim() : 'items';
    const searchUrl = source === 'facebook'
      ? `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(kw)}`
      : `https://offerup.com/search/?q=${encodeURIComponent(kw)}`;
    return { command: 'scrape', args: [searchUrl, source], response: `Scraping ${source} for "${kw}"...` };
  }

  // ── Help fallback ──
  return {
    command: 'help',
    args: [],
    response: `I didn't catch that. Here are the available commands. Tip: try \x1b[36mai find cheap laptops\x1b[0m`
  };
}

// ═══════════════════════════════════════════════
//  PROGRESS BAR COMPONENT
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
//  DIVIDER
// ═══════════════════════════════════════════════
const DIVIDER = '─'.repeat(60);

// ═══════════════════════════════════════════════
//  MAIN TERMINAL COMPONENT
// ═══════════════════════════════════════════════
export default function Terminal({ embedded = false }) {
  const { addToast, serverOnline, autoActive } = useApp();
  const [history, setHistory] = useState([]); // { type: 'input'|'output', text, isHtml?, isLive? }
  const [input, setInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [liveData, setLiveData] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const inputRef = useRef(null);
  const outputRef = useRef(null);
  const liveIntervalRef = useRef(null);
  const clockIntervalRef = useRef(null);

  // ── Clock ──
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString());
    };
    tick();
    clockIntervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(clockIntervalRef.current);
  }, []);

  // ── Autofocus ──
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Scroll to bottom ──
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
  }, [history]);

  // ── Live mode effect ──
  useEffect(() => {
    if (liveMode) {
      const fetchLiveData = async () => {
        try {
          const [health, stats, autoStatus, itemData] = await Promise.all([
            api.health().catch(() => ({ status: 'offline' })),
            api.getStats().catch(() => ({ totalItems: '?', activeJobs: '?', recentItemCount: '?' })),
            api.autoScrapeStatus().catch(() => ({ active: false, urls: [] })),
            api.getItems({}).catch(() => ({ items: [], total: 0 })),
          ]);
          setLiveData({ health, stats, autoStatus, items: itemData.items || [], total: itemData.total || 0 });
        } catch (e) {
          // silently fail in live mode
        }
      };
      fetchLiveData();
      liveIntervalRef.current = setInterval(fetchLiveData, 4000);
      return () => clearInterval(liveIntervalRef.current);
    } else {
      setLiveData(null);
    }
  }, [liveMode]);

  // ── Cleanup live mode on unmount ──
  useEffect(() => {
    return () => clearInterval(liveIntervalRef.current);
  }, []);

  // ── Handlers ──
  const focusInput = () => {
    if (!liveMode) inputRef.current?.focus();
  };

  function addOutput(text, isHtml = false) {
    setHistory(prev => [...prev, { type: 'output', text, isHtml }]);
  }

  function addInput(text) {
    setHistory(prev => [...prev, { type: 'input', text }]);
  }

  // ── Command handlers (unchanged from original) ──
  const handleClear = useCallback(() => {
    setHistory([]);
  }, []);

  const handleHelp = useCallback(() => {
    addOutput(HELP_TEXT);
  }, []);

  const handleAbout = useCallback(() => {
    addOutput(ABOUT_TEXT);
  }, []);

  const handleStatus = useCallback(async (args) => {
    const full = args.includes('--full');
    addOutput(colors.dim('⏳ Fetching system status...'));
    try {
      const health = await api.health();
      const config = await api.config();

      let out = `${colors.bold('╔══════════════════════ SYSTEM STATUS ══════════════════════╗')}
║  Server:   ${serverOnline ? colors.green('● Online') : colors.red('● Offline')}${' '.repeat(45)}║
║  Backend:  ${colors.cyan('http://localhost:3001')}${' '.repeat(32)}║
║  Health:   ${colors.green(JSON.stringify(health))}${' '.repeat(Math.max(0, 52 - JSON.stringify(health).length))}║
║  Telegram: ${config.telegramConfigured ? colors.green('Configured') : colors.yellow('Not configured')}${' '.repeat(37)}║
║  Interval: ${colors.blue(config.scrapeIntervalHuman)}${' '.repeat(30)}║
║  Auto:     ${autoActive ? colors.green('Active') : colors.dim('Inactive')}${' '.repeat(40)}║
╚══════════════════════════════════════════════════════════════╝`;

      if (full) {
        out += '\n' + colors.dim('⏳ Fetching additional stats...');
        try {
          const stats = await api.getStats();
          out += '\n\n' + colors.bold('╔══════════════════════ STATISTICS ═════════════════════════╗')
            + `\n║  Total Items:   ${colors.cyan(String(stats.totalItems)).padEnd(45)}║`
            + `\n║  Active Jobs:   ${colors.yellow(String(stats.activeJobs)).padEnd(45)}║`
            + `\n║  Recent Items:  ${colors.green(String(stats.recentItemCount)).padEnd(45)}║`
            + '\n╚══════════════════════════════════════════════════════════════╝';
        } catch (_) {}

        try {
          const as = await api.autoScrapeStatus();
          if (as.active) {
            out += '\n\n' + colors.bold('╔════════════════════ AUTO-SCRAPE ═════════════════════════╗')
              + `\n║  Status:    ${colors.green('ACTIVE')}${' '.repeat(50)}║`
              + `\n║  URLs:      ${String(as.urls.length)}${' '.repeat(50)}║`
              + `\n║  Interval:  ${as.intervalHuman}${' '.repeat(40)}║`;
            as.urls.forEach((u, i) => {
              out += `\n║  [${i + 1}] ${(u.label || u.url).substring(0, 46).padEnd(46)}║`;
            });
            out += '\n╚══════════════════════════════════════════════════════════════╝';
          }
        } catch (_) {}
      }

      addOutput(out);
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, [serverOnline, autoActive]);

  const handleStats = useCallback(async () => {
    addOutput(colors.dim('⏳ Fetching stats...'));
    try {
      const stats = await api.getStats();
      addOutput(
        `${colors.bold('Statistics')}\n` +
        `  Total Items:   ${colors.cyan(stats.totalItems)}\n` +
        `  Active Jobs:   ${colors.yellow(stats.activeJobs)}\n` +
        `  Recent Items:  ${colors.green(stats.recentItemCount)}`
      );
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, []);

  const handleSettings = useCallback(async () => {
    addOutput(colors.dim('⏳ Fetching settings...'));
    try {
      const s = await api.getSettings();
      addOutput(
        `${colors.bold('Current Settings')}\n` +
        `  Telegram Bot:   ${s.telegramBotToken ? colors.green('✓ Set') : colors.yellow('✗ Not set')}\n` +
        `  Telegram Chat:  ${s.telegramChatId ? colors.green('✓ Set') : colors.yellow('✗ Not set')}\n` +
        `  Interval:       ${colors.blue(s.scrapeIntervalMs + 'ms')} (${Math.round(s.scrapeIntervalMs / 60000)}min)\n` +
        `  Min Price:      ${s.minPrice || colors.dim('none')}\n` +
        `  Max Price:      ${s.maxPrice || colors.dim('none')}\n` +
        `  Blacklist:      ${s.keywordBlacklist || colors.dim('none')}\n` +
        `  FB Cookies:     ${s.facebookCookies && s.facebookCookies.length > 10 ? colors.green('✓ Configured') : colors.yellow('✗ Not set')}`
      );
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, []);

  const handleScrape = useCallback(async (args) => {
    if (args.length < 1) {
      addOutput(colors.red('Usage: scrape <url> [source]\n  source: auto (default) | offerup | facebook'));
      return;
    }
    const url = args[0];
    const source = args[1] || 'auto';
    addOutput(colors.dim(`⏳ Scraping [${source}]: ${url}`));
    try {
      const data = await api.scrape(url, source);
      if (data.listings.length === 0) {
        addOutput(colors.yellow(`⚠ No listings found (source: ${data.source})`));
      } else {
        addOutput(colors.green(`✓ Found ${data.total} listing(s) [source: ${data.source}]`));
        data.listings.slice(0, 5).forEach((l, i) => {
          addOutput(
            `  ${colors.cyan((i + 1).toString())}. ${colors.bold(l.title.substring(0, 70))}\n` +
            `     ${colors.green(l.price || 'N/A')}  ${colors.dim(l.location || '')}  ${colors.blue(l.url)}`,
            true
          );
        });
        if (data.listings.length > 5) {
          addOutput(colors.dim(`  ... and ${data.listings.length - 5} more`));
        }
      }
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, []);

  const handleScrapeAll = useCallback(async (args) => {
    if (args.length < 1) {
      addOutput(colors.red('Usage: scrape-all <url1> <url2> ...'));
      return;
    }
    const urls = args.map((url, i) => ({ url, label: `URL #${i + 1}`, source: 'auto' }));
    addOutput(colors.dim(`⏳ Scraping ${urls.length} URLs...`));
    try {
      const data = await api.scrapeAll(urls);
      data.results.forEach((r) => {
        if (r.success) {
          addOutput(colors.green(`✓ ${r.label || r.url}: ${r.total} listings [${r.source}]`));
        } else {
          addOutput(colors.red(`✗ ${r.label || r.url}: ${r.error}`));
        }
      });
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, []);

  const handleItems = useCallback(async (args) => {
    const filters = {};
    if (args[0]) filters.keyword = args[0];
    if (args[1]) filters.source = args[1];
    if (args[2]) filters.minPrice = args[2];
    if (args[3]) filters.maxPrice = args[3];
    addOutput(colors.dim(`⏳ Fetching items${filters.keyword ? ' matching "' + filters.keyword + '"' : ''}...`));
    try {
      const data = await api.getItems(filters);
      if (data.items.length === 0) {
        addOutput(colors.yellow('⚠ No items found.'));
      } else {
        addOutput(colors.green(`✓ ${data.total} item(s) found`));
        addOutput(colors.dim(DIVIDER));
        data.items.slice(0, 10).forEach((item, i) => {
          addOutput(
            `  ${colors.cyan((i + 1).toString().padStart(2))}. ${colors.bold(item.title?.substring(0, 55) || 'N/A')}\n` +
            `      ${colors.green((item.price || 'N/A').padEnd(12))} ${colors.dim((item.location || '').substring(0, 20).padEnd(22))} ${colors.magenta((item.source || 'offerup').padEnd(10))} ${colors.blue(item.url)}`,
            true
          );
        });
        addOutput(colors.dim(DIVIDER));
        if (data.items.length > 10) {
          addOutput(colors.dim(`  ... and ${data.items.length - 10} more items. Use items command to see more.`));
        }
      }
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, []);

  const handleExport = useCallback(async (args) => {
    if (!args[0] || !['json', 'csv'].includes(args[0])) {
      addOutput(colors.red('Usage: export <json|csv>'));
      return;
    }
    const format = args[0];
    addOutput(colors.dim(`⏳ Exporting as ${format.toUpperCase()}...`));
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
      addOutput(colors.green(`✓ Exported and downloaded as ${format.toUpperCase()}`));
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, []);

  const handleAutoStart = useCallback(async (args) => {
    if (args.length < 1) {
      addOutput(colors.red('Usage: auto-start <url1> <url2> ...'));
      return;
    }
    const urls = args.map((url, i) => ({ url, label: `Job #${i + 1}`, source: 'auto' }));
    addOutput(colors.dim(`⏳ Starting auto-scrape on ${urls.length} URL(s)...`));
    try {
      const data = await api.autoScrapeStart(urls);
      addOutput(colors.green(`✓ Auto-scrape started — ${data.count} URL(s), every ${data.intervalMs}ms`));
      addToast('Auto-scrape started', 'success');
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, [addToast]);

  const handleAutoStop = useCallback(async () => {
    addOutput(colors.dim('⏳ Stopping auto-scrape...'));
    try {
      await api.autoScrapeStop();
      addOutput(colors.yellow('● Auto-scrape stopped.'));
      addToast('Auto-scrape stopped', 'info');
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, [addToast]);

  const handleAutoStatus = useCallback(async () => {
    addOutput(colors.dim('⏳ Fetching auto-scrape status...'));
    try {
      const as = await api.autoScrapeStatus();
      if (!as.active) {
        addOutput(colors.dim('● Auto-scrape is not active.'));
      } else {
        addOutput(colors.green(`● Auto-scrape active — ${as.urls.length} URL(s), every ${as.intervalHuman}`));
        as.urls.forEach((u, i) => {
          addOutput(
            `  ${colors.cyan((i + 1).toString())}. ${u.label || u.url}\n` +
            `     ${colors.green(u.listingCount + ' listings')}  ${colors.dim('Last: ' + (u.lastScraped ? new Date(u.lastScraped).toLocaleTimeString() : 'never'))}  ${colors.magenta(u.source || 'auto')}`,
            true
          );
        });
      }
    } catch (e) {
      addOutput(colors.red(`✗ Error: ${e.message}`));
    }
  }, []);

  // ── Live Mode Handler ──
  const handleLive = useCallback(() => {
    if (liveMode) {
      // Exit live mode
      setLiveMode(false);
      addOutput(colors.yellow('● Exited live dashboard mode.'));
      return;
    }
    setLiveMode(true);
    addOutput(colors.green('● Entering live dashboard mode... (press Escape or type "exit" to leave)'));
    addOutput(colors.dim('  Auto-refreshing every 4 seconds.'));
  }, [liveMode]);

  // ── Exit live mode ──
  const exitLiveMode = useCallback(() => {
    if (liveMode) {
      setLiveMode(false);
      addOutput(colors.yellow('● Exited live dashboard mode.'));
      inputRef.current?.focus();
    }
  }, [liveMode]);

  // ── AI Handler ──
  const handleAI = useCallback(async (args) => {
    const query = args.join(' ').trim();
    if (!query) {
      addOutput(colors.red('Usage: ai <your request in plain English>'));
      addOutput(colors.dim('  Example: ai find cheap laptops on facebook under $500'));
      addOutput(colors.dim('  Example: ai export everything as csv'));
      addOutput(colors.dim('  Example: ai show me recent facebook listings'));
      return;
    }
    const parsed = parseAICommand(query);
    addOutput(colors.cyan(`🤖 AI: ${parsed.response}`));
    if (!parsed.command) return;

    // Route to the appropriate handler
    switch (parsed.command) {
      case 'help': handleHelp(); break;
      case 'clear': handleClear(); break;
      case 'about': handleAbout(); break;
      case 'status': await handleStatus(parsed.args); break;
      case 'stats': await handleStats(); break;
      case 'settings': await handleSettings(); break;
      case 'scrape': await handleScrape(parsed.args); break;
      case 'scrape-all': await handleScrapeAll(parsed.args); break;
      case 'items': await handleItems(parsed.args); break;
      case 'export': await handleExport(parsed.args); break;
      case 'auto-start': await handleAutoStart(parsed.args); break;
      case 'auto-stop': await handleAutoStop(); break;
      case 'auto-status': await handleAutoStatus(); break;
      case 'live': handleLive(); break;
      default: addOutput(colors.red(`Unknown AI-routed command: ${parsed.command}`));
    }
  }, [handleHelp, handleClear, handleAbout, handleStatus, handleStats, handleSettings,
      handleScrape, handleScrapeAll, handleItems, handleExport, handleAutoStart,
      handleAutoStop, handleAutoStatus, handleLive]);

  // ── Command router ──
  const executeCommand = useCallback(async (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    // In live mode, handle special keys
    if (liveMode) {
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        exitLiveMode();
        setInput('');
        return;
      }
      // Allow commands even in live mode
    }

    addInput(`C:\\offerup-admin> ${trimmed}`);
    setBusy(true);

    const parts = trimmed.match(/("[^"]*"|'[^']*'|\S+)/g) || [];
    const cmd = (parts[0] || '').toLowerCase();
    const args = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''));

    try {
      switch (cmd) {
        case 'help': handleHelp(); break;
        case 'clear': case 'cls': handleClear(); break;
        case 'about': handleAbout(); break;
        case 'status': await handleStatus(args); break;
        case 'stats': await handleStats(); break;
        case 'settings': await handleSettings(); break;
        case 'scrape': await handleScrape(args); break;
        case 'scrape-all': await handleScrapeAll(args); break;
        case 'items': await handleItems(args); break;
        case 'export': await handleExport(args); break;
        case 'auto-start': await handleAutoStart(args); break;
        case 'auto-stop': await handleAutoStop(); break;
        case 'auto-status': await handleAutoStatus(); break;
        case 'ai': case 'ask': await handleAI(args); break;
        case 'live': handleLive(); break;
        default:
          addOutput(colors.red(`Unknown command: '${cmd}'.`));
          addOutput(colors.dim(`  Type ${colors.cyan('help')} for available commands or ${colors.cyan(`ai ${trimmed}`)} to try natural language.`));
      }
    } catch (e) {
      addOutput(colors.red(`✗ Unexpected error: ${e.message}`));
    } finally {
      setBusy(false);
    }
  }, [handleHelp, handleClear, handleAbout, handleStatus, handleStats, handleSettings,
      handleScrape, handleScrapeAll, handleItems, handleExport, handleAutoStart,
      handleAutoStop, handleAutoStatus, handleAI, handleLive, exitLiveMode, liveMode]);

  // ── Keyboard handling ──
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (liveMode) {
        e.preventDefault();
        exitLiveMode();
        setInput('');
        return;
      }
    }

    if (busy && !liveMode) return;

    if (e.key === 'Enter') {
      const cmd = input.trim();
      if (cmd) {
        setCmdHistory(prev => [...prev, cmd]);
        setHistoryIdx(-1);
      }
      executeCommand(input);
      setInput('');
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const newIdx = historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(newIdx);
      setInput(cmdHistory[newIdx] || '');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const newIdx = historyIdx + 1;
      if (newIdx >= cmdHistory.length) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        setHistoryIdx(newIdx);
        setInput(cmdHistory[newIdx] || '');
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const word = input.trim().split(/\s+/)[0]?.toLowerCase() || '';
      const matches = Object.keys(COMMANDS).filter(c => c.startsWith(word));
      if (matches.length === 1 && input.trim().split(/\s+/).length === 1) {
        setInput(matches[0] + ' ');
      } else if (matches.length > 0) {
        addOutput(colors.dim(matches.join('  ')));
      }
      return;
    }

    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      handleClear();
      return;
    }
  };

  // ── Live dashboard render ──
  const renderLiveDashboard = () => {
    if (!liveData) {
      return (
        <div className="terminal-live-loading">
          <span className="ansi-blink">⏳</span> Loading live data...
        </div>
      );
    }

    const { health, stats, autoStatus, items } = liveData;
    const recentItems = items.slice(0, 6);

    return (
      <div className="terminal-live-dashboard">
        {/* ── Row 1: Status panels ── */}
        <div className="live-panels">
          <div className="live-panel live-panel-status">
            <div className="live-panel-title">● SERVER</div>
            <div className="live-panel-body">
              <span className={serverOnline ? 'ansi-green' : 'ansi-red'}>
                {serverOnline ? '● ONLINE' : '● OFFLINE'}
              </span>
              <span className="ansi-dim"> :3001</span>
            </div>
          </div>
          <div className="live-panel live-panel-stats">
            <div className="live-panel-title">● STATS</div>
            <div className="live-panel-body">
              <span className="ansi-cyan">{stats.totalItems}</span>
              <span className="ansi-dim"> items </span>
              <span className="ansi-yellow">{stats.activeJobs}</span>
              <span className="ansi-dim"> active</span>
            </div>
          </div>
          <div className="live-panel live-panel-auto">
            <div className="live-panel-title">● AUTO-SCRAPE</div>
            <div className="live-panel-body">
              {autoStatus.active ? (
                <span className="ansi-green">● RUNNING ({autoStatus.urls.length} URLs)</span>
              ) : (
                <span className="ansi-dim">● IDLE</span>
              )}
            </div>
          </div>
          <div className="live-panel live-panel-time">
            <div className="live-panel-title">● TIME</div>
            <div className="live-panel-body">
              <span className="ansi-cyan">{currentTime}</span>
            </div>
          </div>
        </div>

        {/* ── Row 2: Auto-scrape details ── */}
        {autoStatus.active && autoStatus.urls.length > 0 && (
          <div className="live-panel live-panel-wide">
            <div className="live-panel-title">
              ● AUTO-SCRAPE JOBS <span className="ansi-dim">({autoStatus.intervalHuman})</span>
            </div>
            <div className="live-panel-body">
              {autoStatus.urls.map((u, i) => (
                <div key={i} className="live-job-row">
                  <span className="ansi-cyan">{i + 1}.</span>
                  <span className="ansi-dim">{(u.label || u.url).substring(0, 50)}</span>
                  <span className="ansi-green">{u.listingCount} listings</span>
                  <span className="ansi-dim">
                    Last: {u.lastScraped ? new Date(u.lastScraped).toLocaleTimeString() : 'never'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Row 3: Recent items ── */}
        <div className="live-panel live-panel-wide">
          <div className="live-panel-title">● RECENT ITEMS <span className="ansi-dim">(latest {Math.min(recentItems.length, 6)})</span></div>
          <div className="live-panel-body">
            {recentItems.length === 0 ? (
              <span className="ansi-dim">No items scraped yet.</span>
            ) : (
              recentItems.map((item, i) => (
                <div key={i} className="live-item-row">
                  <span className="ansi-cyan">{i + 1}.</span>
                  <span className="ansi-bold">{(item.title || 'N/A').substring(0, 40)}</span>
                  <span className="ansi-green">{item.price || 'N/A'}</span>
                  <span className="ansi-magenta">{item.source || 'offerup'}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Row 4: Controls hint ── */}
        <div className="live-controls-hint">
          <span className="ansi-dim">Press </span>
          <span className="ansi-yellow">Esc</span>
          <span className="ansi-dim"> or type </span>
          <span className="ansi-yellow">exit</span>
          <span className="ansi-dim"> or </span>
          <span className="ansi-yellow">quit</span>
          <span className="ansi-dim"> to leave live mode. Refreshes every 4s.</span>
        </div>
      </div>
    );
  };

  // ── Render ──
  return (
    <div className={`terminal-page${embedded ? ' terminal-page-embedded' : ''}`} onClick={focusInput}>
      <div className={`terminal-window${embedded ? ' terminal-window-embedded' : ''} ${liveMode ? 'terminal-window-live' : ''}`}>
        {/* Titlebar */}
        <div className="terminal-titlebar">
          <span className="terminal-dot terminal-dot-red" />
          <span className="terminal-dot terminal-dot-yellow" />
          <span className="terminal-dot terminal-dot-green" />
          <span className="terminal-title">
            OfferUp Admin — Command Prompt {liveMode ? '— LIVE MODE' : ''}
          </span>
          <span className="terminal-titlebar-time">{currentTime}</span>
        </div>

        {/* Body */}
        <div className="terminal-body" ref={outputRef}>
          {/* Welcome banner */}
          {history.length === 0 && !liveMode && (
            <div className="terminal-welcome">
              <pre className="terminal-ascii">
{`  ██████╗  █████╗ ███████╗██╗   ██╗██████╗ ██╗   ██╗██████╗
  ██╔═══██╗██╔══██╗██╔════╝██║   ██║██╔═══██╗██║   ██║██╔══██╗
  ██║   ██║██║  ██║█████╗  ██║   ██║██║   ██║██║   ██║██████╔╝
  ██║   ██║██║  ██║██╔══╝  ██║   ██║██║   ██║██║   ██║██╔═══╝
  ╚██████╔╝╚█████╔╝██║     ╚██████╔╝╚██████╔╝╚██████╔╝██║
   ╚═════╝  ╚════╝ ╚═╝      ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝`}
              </pre>
              <div className="terminal-welcome-text">
                <span className="ansi-green">Admin Panel v2.0</span> — OfferUp + Facebook Marketplace Scraper
                <br />
                Type <span className="ansi-cyan">help</span> for commands, or <span className="ansi-cyan">ai &lt;request&gt;</span> to use natural language.
                <br />
                Try: <span className="ansi-yellow">ai find cheap laptops on facebook under $500</span>
                <br />
                <span className="ansi-dim">↑↓ history · Tab autocomplete · Ctrl+L clear · Esc to cancel</span>
              </div>
            </div>
          )}

          {/* History output */}
          {history.map((entry, i) => (
            <div key={i} className={`terminal-line terminal-${entry.type}`}>
              {entry.type === 'input' ? (
                <span>{entry.text}</span>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: ansiToHtml(entry.text) }} />
              )}
            </div>
          ))}

          {/* Live dashboard */}
          {liveMode && (
            <div className="terminal-live-section">
              {renderLiveDashboard()}
            </div>
          )}

          {/* Input line (hidden in live mode unless typing) */}
          {!liveMode && (
            <div className="terminal-input-line">
              <span className="terminal-prompt">C:\offerup-admin&gt;&nbsp;</span>
              <input
                ref={inputRef}
                type="text"
                className="terminal-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
              {busy && <span className="terminal-spinner">⏳</span>}
              <span className="terminal-cursor">█</span>
            </div>
          )}

          {liveMode && (
            <div className="terminal-input-line terminal-live-input-line">
              <span className="terminal-prompt">C:\offerup-admin&gt;&nbsp;</span>
              <input
                ref={inputRef}
                type="text"
                className="terminal-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
                placeholder="exit to leave live mode..."
              />
              <span className="terminal-cursor">█</span>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="terminal-statusbar">
          <span className="statusbar-left">
            <span className={serverOnline ? 'ansi-green' : 'ansi-red'}>
              {serverOnline ? '● CONNECTED' : '● OFFLINE'}
            </span>
            <span className="ansi-dim"> | </span>
            <span className={autoActive ? 'ansi-green' : 'ansi-dim'}>
              {autoActive ? 'AUTO:ON' : 'AUTO:OFF'}
            </span>
            <span className="ansi-dim"> | </span>
            <span className="ansi-dim">{liveMode ? 'LIVE MODE' : 'READY'}</span>
          </span>
          <span className="statusbar-right">
            <span className="ansi-dim">F1:help</span>
            <span className="ansi-dim"> | </span>
            <span className="ansi-dim">Esc:exit</span>
            <span className="ansi-dim"> | </span>
            <span className="ansi-dim">{currentTime}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
