require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const TelegramBot = require("node-telegram-bot-api");
const storage = require("./storage");
const { scrapeBySource } = require("./services/scraperFactory");
const { analyzeBatch } = require("./services/dealAnalyzer");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Load settings from storage (with .env fallback)
let dynamicSettings = storage.getSettings();
const getSetting = (key) => dynamicSettings[key] || process.env[key] || null;
const getTelegramToken = () => getSetting('telegramBotToken') || process.env.TELEGRAM_BOT_TOKEN;
const getTelegramChatId = () => getSetting('telegramChatId') || process.env.TELEGRAM_CHAT_ID;
const getScrapeInterval = () => parseInt(getSetting('scrapeIntervalMs') || process.env.SCRAPE_INTERVAL_MS || '300000');

// Telegram init
let telegramBot = null;
function initTelegram() {
  const token = getTelegramToken();
  const chatId = getTelegramChatId();
  if (token && token.length > 5) {
    try {
      telegramBot = new TelegramBot(token, { polling: false });
      console.log("Telegram bot initialized");
      return true;
    } catch (e) {
      console.error("Telegram bot init error:", e.message);
    }
  }
  return false;
}
initTelegram();

// Reload settings periodically (every 30s)
setInterval(() => {
  dynamicSettings = storage.getSettings();
}, 30000);

// Path to the Facebook cookies JSON file (exported from browser)
const FB_COOKIES_FILE = path.join(__dirname, '..', 'www_facebook_com_cookies.json');

function getParsedFBCookies() {
  // 1. Try loading from the cookie file (auto-exported from browser)
  try {
    if (fs.existsSync(FB_COOKIES_FILE)) {
      const fileRaw = fs.readFileSync(FB_COOKIES_FILE, 'utf-8');
      const fileCookies = JSON.parse(fileRaw);
      if (Array.isArray(fileCookies) && fileCookies.length > 0) {
        console.log(`[FB] Auto-loaded ${fileCookies.length} cookies from www_facebook_com_cookies.json`);
        return fileCookies;
      }
    }
  } catch (e) {
    console.warn(`[FB] Failed to load cookies file: ${e.message}`);
  }

  // 2. Fall back to settings textarea
  const raw = dynamicSettings.facebookCookies || '';
  if (!raw || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      if (parsed.name && parsed.value) return [parsed];
      const entries = Object.entries(parsed);
      if (entries.length > 0 && entries.every(([, v]) => typeof v === 'string')) {
        return entries.map(([name, value]) => ({ name, value, domain: '.facebook.com', path: '/' }));
      }
    }
    console.warn('[FB] Cookies JSON is not in expected format. Use an array of {name, value, domain} objects.');
    return [];
  } catch {
    console.warn('[FB] Failed to parse facebookCookies JSON. Check your cookie format in Settings.');
    return [];
  }
}

function getListingId(listing) {
  return listing.url || listing.title || "";
}

async function sendTelegramNotification(sourceUrl, sourceLabel, newListings) {
  const token = getTelegramToken();
  const chatId = getTelegramChatId();
  if (!token || !chatId || newListings.length === 0) return;
  if (!telegramBot) initTelegram();
  if (!telegramBot) return;
  try {
    let msg = `<b>🔔 New OfferUp Listings!</b>\n\n`;
    if (sourceLabel) msg += `<b>Source:</b> ${sourceLabel}\n`;
    msg += `<code>${sourceUrl}</code>\n\n`;
    newListings.slice(0, 5).forEach((l, i) => {
      msg += `<b>${i + 1}. ${l.title}</b>\n`;
      if (l.price) msg += `💰 ${l.price}\n`;
      if (l.location) msg += `📍 ${l.location}\n`;
      if (l.url) msg += `<a href="${l.url}">View Listing</a>\n\n`;
    });
    await telegramBot.sendMessage(chatId, msg, { parse_mode: "HTML" });
    console.log(`Telegram: sent ${newListings.length} new listings`);
  } catch (e) {
    console.error("Telegram send error:", e.message);
  }
}

// ===== Auto-scrape state =====
let autoScrapeInterval = null;
let autoScrapeEntries = [];

// Restore jobs from storage on startup
const savedJobs = storage.getJobs();
if (savedJobs.length > 0) {
  autoScrapeEntries = savedJobs;
  startAutoScraper();
  console.log(`Restored ${savedJobs.length} auto-scrape jobs from storage`);
}

function startAutoScraper() {
  if (autoScrapeInterval) clearInterval(autoScrapeInterval);
  if (autoScrapeEntries.length === 0) return;
  const interval = getScrapeInterval();
  console.log(`Auto-scraper started: ${autoScrapeEntries.length} URLs, every ${interval}ms`);
  autoScrapeInterval = setInterval(runAutoScrape, interval);
  runAutoScrape();
}

async function runAutoScrape() {
  console.log(`Auto-scrape cycle: ${autoScrapeEntries.length} URLs`);
  for (const entry of autoScrapeEntries) {
    try {
      let listings;
      if (entry.source === 'facebook') {
        listings = await scrapeBySource(entry.url, 'facebook', getParsedFBCookies());
      } else {
        listings = await scrapeOfferUp(entry.url);
      }
      const prevIds = new Set((entry.previousListings || []).map(getListingId));
      const newListings = listings.filter(l => !prevIds.has(getListingId(l)));
      if (newListings.length > 0) {
        console.log(`New listings for ${entry.url}: ${newListings.length}`);
        await sendTelegramNotification(entry.url, entry.label, newListings);
      }
      // Persist items to storage
      if (listings.length > 0) {
        const enriched = listings.map(l => ({ ...l, source: entry.source || 'offerup', sourceUrl: entry.url, sourceLabel: entry.label, scrapedAt: new Date().toISOString() }));
        storage.addItems(enriched);
        analyzeBatch(listings).then(analyzed => {
          const all = storage.getItems();
          const analyzedUrls = new Set(analyzed.map(a => a.url));
          const updated = all.map(item =>
            analyzedUrls.has(item.url)
              ? { ...item, ...analyzed.find(a => a.url === item.url), source: item.source }
              : item
          );
          storage.saveItems(updated);
        }).catch(e => console.error('[AI] Auto-scrape analysis error:', e.message));
      }
      entry.previousListings = listings;
      entry.lastScraped = new Date().toISOString();
      entry.lastListings = listings;
    } catch (e) {
      console.error(`Auto-scrape error for ${entry.url}:`, e.message);
    }
  }
}

// ===== OfferUp Scraper =====
async function scrapeOfferUp(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    timeout: 15000,
  });

  const html = response.data;
  const $ = cheerio.load(html);
  const listings = [];

  const cardSelectors = [
    'a[data-testid="search-item"]',
    '[data-testid="listing-card"]',
    "a[href*='/item/']",
    '[class*="listing"] a[href*="/item/"]',
    "a.MuiCard-root",
    '[class*="SearchListItem"]',
    "a[href*='/detail/']",
    'a[href*="/item/detail/"]',
  ];

  let $cards = null;
  for (const selector of cardSelectors) {
    $cards = $(selector);
    if ($cards.length > 0) break;
  }

  if (!$cards || $cards.length === 0) {
    $cards = $('a[href*="/item/"]');
  }

  $cards.each((i, el) => {
    if (listings.length >= 5) return false;
    const $card = $(el);
    const href = $card.attr("href") || "";
    const fullUrl = href.startsWith("http") ? href : `https://offerup.com${href}`;
    const title =
      $card.find('[data-testid="listing-title"]').text().trim() ||
      $card.find('span[class*="title"], p[class*="title"], [class*="Title"]').text().trim() ||
      $card.find("img").attr("alt") ||
      $card.text().trim().substring(0, 80);
    const price =
      $card.find('[data-testid="listing-price"]').text().trim() ||
      $card.find('span[class*="price"], p[class*="price"], [class*="Price"]').text().trim() || "";
    const image =
      $card.find("img").attr("src") || $card.find("img").attr("data-src") ||
      $card.find("img").attr("srcset")?.split(" ")[0] || "";
    const location =
      $card.find('[data-testid="listing-location"]').text().trim() ||
      $card.find('span[class*="location"], p[class*="location"], [class*="Location"]').text().trim() || "";
    const description =
      $card.find('[data-testid="listing-description"]').text().trim() ||
      $card.find('p[class*="description"], span[class*="description"], [class*="Description"]').text().trim() || "";
    if (title && title.length > 0) {
      listings.push({ id: i + 1, title, price, image, location, description, url: fullUrl });
    }
  });

  if (listings.length === 0) {
    const scriptData = extractFromScriptTags($, html);
    if (scriptData.length > 0) return scriptData;
  }
  return listings;
}

function extractFromScriptTags($, html) {
  const listings = [];
  const nextDataScript = $("#__NEXT_DATA__");
  if (nextDataScript.length > 0) {
    try {
      const data = JSON.parse(nextDataScript.html());
      const props = data?.props?.pageProps;
      if (props) {
        const items = props.searchResults?.items || props.listings || props.items || props.feedItems || [];
        items.slice(0, 5).forEach((item, i) => {
          listings.push({
            id: i + 1, title: item.title || item.name || "",
            price: item.price ? `$${item.price}` : item.priceDisplay || "",
            image: item.image || item.thumbnail || item.photo || "",
            location: item.location || item.city || "",
            description: item.description || "",
            url: item.url ? `https://offerup.com${item.url}` : item.id ? `https://offerup.com/item/detail/${item.id}` : "",
          });
        });
      }
    } catch (e) {}
  }

  const scriptTags = $("script");
  scriptTags.each((i, script) => {
    if (listings.length >= 5) return false;
    const content = $(script).html() || "";
    if (content.includes("window.__APOLLO_STATE__") || content.includes("__APOLLO_STATE__")) {
      try {
        const match = content.match(/window\.__APOLLO_STATE__\s*=\s*({.*?});/s);
        if (match) {
          const apolloState = JSON.parse(match[1]);
          for (const key of Object.keys(apolloState)) {
            if (listings.length >= 5) break;
            const entry = apolloState[key];
            if (entry && entry.__typename && (entry.__typename.includes("Item") || entry.__typename.includes("Listing") || entry.__typename.includes("FeedItem"))) {
              listings.push({
                id: listings.length + 1, title: entry.title || entry.name || "",
                price: entry.price ? `$${entry.price}` : "",
                image: entry.image || entry.thumbnail || entry.photo || "",
                location: entry.location || entry.city || "",
                description: entry.description || "",
                url: entry.id ? `https://offerup.com/item/detail/${entry.id}` : "",
              });
            }
          }
        }
      } catch (e) {}
    }
  });
  return listings;
}

// ===== Routes =====

// Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", autoScrapeActive: !!autoScrapeInterval });
});

// Config
app.get("/api/config", (req, res) => {
  const token = getTelegramToken();
  const chatId = getTelegramChatId();
  res.json({
    telegramConfigured: !!(token && chatId && token.length > 5 && chatId.length > 3),
    scrapeIntervalMs: getScrapeInterval(),
    scrapeIntervalHuman: `${getScrapeInterval() / 60000}min`,
  });
});

// Scrape single URL
app.post("/api/scrape", async (req, res) => {
  const { url, source } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  // Detect source from URL or explicit param (resolve 'auto')
  let detectedSource = source;
  if (!detectedSource || detectedSource === 'auto') {
    detectedSource = url.includes('facebook.com/marketplace') ? 'facebook' : 'offerup';
  }

  if (detectedSource === 'offerup' && !url.includes("offerup.com") && !url.includes("facebook.com")) {
    return res.status(400).json({ error: "Please provide a valid OfferUp or Facebook Marketplace URL" });
  }

  try {
    console.log(`Scraping [${detectedSource}]: ${url}`);
    let listings;
    if (detectedSource === 'facebook') {
      listings = await scrapeBySource(url, 'facebook', getParsedFBCookies());
    } else {
      listings = await scrapeOfferUp(url);
    }
    console.log(`Found ${listings.length} listings`);
    if (listings.length > 0) {
      const enriched = listings.map(l => ({ ...l, source: detectedSource, sourceUrl: url, scrapedAt: new Date().toISOString() }));
      storage.addItems(enriched);
      // Run AI deal analysis in background (non-blocking)
      analyzeBatch(listings).then(analyzed => {
        const all = storage.getItems();
        const analyzedUrls = new Set(analyzed.map(a => a.url));
        const updated = all.map(item =>
          analyzedUrls.has(item.url)
            ? { ...item, ...analyzed.find(a => a.url === item.url), source: item.source }
            : item
        );
        storage.saveItems(updated);
        console.log(`[AI] Analyzed ${analyzed.length} new listings for deals`);
      }).catch(e => console.error('[AI] Background analysis error:', e.message));
    }
    res.json({ success: true, total: listings.length, listings, source: detectedSource });
  } catch (error) {
    console.error("Scraping error:", error.message);
    let msg = "Failed to scrape. ";
    if (error.response?.status === 403) msg += "Blocked by the site (403).";
    else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") msg += "Request timed out.";
    else msg += error.message;
    res.status(500).json({ success: false, error: msg, listings: [] });
  }
});

// Scrape all URLs
app.post("/api/scrape-all", async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Provide an array of URL objects: [{ url, label, source }]" });
  }
  const results = [];
  for (const entry of urls) {
    try {
      let src = entry.source;
      if (!src || src === 'auto') {
        src = entry.url.includes('facebook.com/marketplace') ? 'facebook' : 'offerup';
      }
      let listings;
      if (src === 'facebook') {
        listings = await scrapeBySource(entry.url, 'facebook', getParsedFBCookies());
      } else {
        listings = await scrapeOfferUp(entry.url);
      }
      if (listings.length > 0) {
        const enriched = listings.map(l => ({ ...l, source: src, sourceUrl: entry.url, sourceLabel: entry.label, scrapedAt: new Date().toISOString() }));
        storage.addItems(enriched);
        analyzeBatch(listings).then(analyzed => {
          const all = storage.getItems();
          const analyzedUrls = new Set(analyzed.map(a => a.url));
          const updated = all.map(item =>
            analyzedUrls.has(item.url)
              ? { ...item, ...analyzed.find(a => a.url === item.url), source: item.source }
              : item
          );
          storage.saveItems(updated);
        }).catch(e => console.error('[AI] Background scrape-all analysis error:', e.message));
      }
      results.push({ url: entry.url, label: entry.label || "", source: src, success: true, total: listings.length, listings });
    } catch (e) {
      results.push({ url: entry.url, label: entry.label || "", success: false, error: e.message, listings: [] });
    }
  }
  res.json({ success: true, results });
});

// Auto-scrape start
app.post("/api/auto-scrape/start", (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Provide an array of URL objects: [{ url, label, source }]" });
  }
  autoScrapeEntries = urls.map(u => ({
    url: u.url,
    label: u.label || "",
    source: (u.source && u.source !== 'auto') ? u.source : (u.url.includes('facebook.com/marketplace') ? 'facebook' : 'offerup'),
    previousListings: [],
    lastScraped: null,
    lastListings: [],
  }));
  storage.saveJobs(autoScrapeEntries);
  startAutoScraper();
  res.json({ success: true, count: urls.length, intervalMs: getScrapeInterval() });
});

// Auto-scrape stop
app.post("/api/auto-scrape/stop", (req, res) => {
  if (autoScrapeInterval) { clearInterval(autoScrapeInterval); autoScrapeInterval = null; }
  autoScrapeEntries = [];
  storage.saveJobs([]);
  res.json({ success: true });
});

// Auto-scrape status
app.get("/api/auto-scrape/status", (req, res) => {
  res.json({
    active: !!autoScrapeInterval,
    urls: autoScrapeEntries.map(e => ({ url: e.url, label: e.label, source: e.source || 'offerup', lastScraped: e.lastScraped, listingCount: e.lastListings?.length || 0 })),
    intervalMs: getScrapeInterval(),
    intervalHuman: `${getScrapeInterval() / 1000}s`,
  });
});

// Settings (NEW)
app.get("/api/settings", (req, res) => {
  res.json(storage.getSettings());
});

app.post("/api/settings", (req, res) => {
  const saved = storage.saveSettings(req.body);
  dynamicSettings = saved;
  initTelegram(); // re-init telegram with new settings
  // Restart auto-scraper with new interval if active
  if (autoScrapeInterval) {
    clearInterval(autoScrapeInterval);
    const interval = getScrapeInterval();
    autoScrapeInterval = setInterval(runAutoScrape, interval);
  }
  res.json({ success: true, settings: saved });
});

// Items (NEW)
app.post("/api/items", (req, res) => {
  const filters = req.body || {};
  const items = storage.filterItems(filters);
  res.json({ success: true, total: items.length, items });
});

// Items export (NEW)
app.get("/api/items/export", (req, res) => {
  const format = req.query.format || 'json';
  const data = storage.exportItems(format);
  const contentType = format === 'csv' ? 'text/csv' : 'application/json';
  const filename = `offerup-items-${new Date().toISOString().slice(0,10)}.${format}`;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(data);
});

// Stats (NEW)
app.get("/api/stats", (req, res) => {
  res.json(storage.getStats());
});

// Deals — get items sorted by deal score
app.get("/api/deals", (req, res) => {
  const all = storage.getItems();
  const scored = all.filter(i => i.dealScore != null);
  const sorted = scored.sort((a, b) => (b.dealScore || 0) - (a.dealScore || 0));
  const unscored = all.filter(i => i.dealScore == null).length;
  res.json({ success: true, total: sorted.length, unscored, deals: sorted.slice(0, 50) });
});

// Analyze all unscored items (batch command)
app.post("/api/analyze-deals", async (req, res) => {
  const all = storage.getItems();
  const unscored = all.filter(i => i.dealScore == null);
  if (unscored.length === 0) {
    return res.json({ success: true, message: "All items already scored.", analyzed: 0 });
  }
  console.log(`[AI] Batch analyzing ${unscored.length} unscored items...`);
  try {
    const analyzed = await analyzeBatch(unscored);
    const analyzedUrls = new Set(analyzed.map(a => a.url));
    const updated = all.map(item =>
      analyzedUrls.has(item.url)
        ? { ...item, ...analyzed.find(a => a.url === item.url), source: item.source }
        : item
    );
    storage.saveItems(updated);
    console.log(`[AI] Batch analyzed ${analyzed.length} items`);
    res.json({ success: true, analyzed: analyzed.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Start
app.listen(PORT, () => {
  console.log(`OfferUp scraper server running on http://localhost:${PORT}`);
  const token = getTelegramToken();
  const chatId = getTelegramChatId();
  if (token && chatId) console.log("Telegram notifications: enabled");
  else console.log("Telegram notifications: not configured (set in Settings page or .env)");
  if (autoScrapeEntries.length > 0) console.log(`Auto-scrape active: ${autoScrapeEntries.length} URLs`);
});
