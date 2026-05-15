const { chromium } = require('playwright');

// Realistic User-Agent strings (Chrome 125-130 on Windows/macOS)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
];

// Common viewport sizes (human-like variety)
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
];

// Common languages
const LANGUAGES = [
  ['en-US', 'en'],
  ['en-US', 'en', 'es'],
  ['en-US', 'en-GB', 'en'],
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Scrape Facebook Marketplace for listings.
 * Uses Playwright with comprehensive anti-detection:
 *  - Randomized viewport, UA, and Accept-Language per session
 *  - Navigator property overrides (webdriver, plugins, permissions, hardware, chrome object)
 *  - Canvas/WebGL fingerprint evasion
 *  - Progressive human-like scrolling with random pauses
 *  - Random mouse movements before interactions
 *  - Realistic timing jitter between actions
 *  - Aggressive browser automation flag suppression
 *  - Cookie-based authentication (bypass login wall)
 *
 * @param {string} url - Facebook Marketplace URL
 * @param {Array} cookies - Array of cookie objects [{name, value, domain, path, ...}]
 */
async function scrapeFBMarketplace(url, cookies = []) {
  if (!url.includes('facebook.com/marketplace')) {
    throw new Error('Please provide a valid Facebook Marketplace URL');
  }

  let browser = null;
  try {
    const browserArgs = [
      // --- Automation suppression ---
      '--disable-blink-features=AutomationControlled',
      '--disable-features=OptimizationGuideModelDownloading,OptimizationHintsFetching,OptimizationTargetPrediction,OptimizationHints',
      '--disable-field-trial-config',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--disable-translate',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-keychain',

      // --- Stability & performance ---
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-webgl',
    ];

    browser = await chromium.launch({
      headless: true,
      args: browserArgs,
      // Don't use a persistent user-data-dir — use ephemeral context with injected cookies
    });

    const viewport = pickRandom(VIEWPORTS);
    const userAgent = pickRandom(USER_AGENTS);
    const languages = pickRandom(LANGUAGES);

    console.log(`[FB] Session: ${viewport.width}x${viewport.height}, UA: Chrome/${userAgent.match(/Chrome\/(\d+)/)?.[1] || '?'}`);

    const context = await browser.newContext({
      userAgent,
      viewport,
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      geolocation: { latitude: 34.0522, longitude: -118.2437 }, // Los Angeles
      permissions: ['geolocation'],
      colorScheme: 'light',
      deviceScaleFactor: Math.random() > 0.5 ? 1 : 2,
      isMobile: false,
      hasTouch: false,
    });

    // === Comprehensive anti-detection script ===
    await context.addInitScript(() => {
      // 1. Override navigator.webdriver (primary bot signal)
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // 2. Fake plugins array (real browsers have plugins)
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [1, 2, 3, 4, 5];
          plugins.item = () => null;
          plugins.namedItem = () => null;
          plugins.refresh = () => {};
          return plugins;
        },
      });

      // 3. Fake mimeTypes
      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => {
          const mimeTypes = [1, 2, 3];
          mimeTypes.item = () => null;
          mimeTypes.namedItem = () => null;
          return mimeTypes;
        },
      });

      // 4. Navigator languages (varies by user)
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'es'],
      });

      // 5. Hardware concurrency (most real machines have 4-16 cores)
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => [4, 8, 12, 16][Math.floor(Math.random() * 4)],
      });

      // 6. Device memory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => [4, 8, 16][Math.floor(Math.random() * 3)],
      });

      // 7. Override permissions API
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, onchange: null });
        }
        return originalQuery(parameters);
      };

      // 8. Ensure window.chrome exists (real Chrome has this)
      if (!window.chrome) {
        window.chrome = {
          runtime: {},
          loadTimes: function () {},
          csi: function () { return {}; },
          app: {},
        };
      }

      // 9. Override getBattery (some bot detection checks this)
      if (navigator.getBattery) {
        const origGetBattery = navigator.getBattery.bind(navigator);
        navigator.getBattery = () =>
          origGetBattery().catch(() => ({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1,
          }));
      }

      // 10. Override screen properties for consistency
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

      // 11. Connection info (simulate real network)
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
          type: 'wifi',
        }),
      });

      // 12. Fake touch support (desktop = no touch)
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });

      // 13. Canvas fingerprint evasion — add subtle noise to canvas reads
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (type) {
        const context = this.getContext('2d');
        if (context && this.width > 0 && this.height > 0) {
          try {
            const imageData = context.getImageData(0, 0, this.width, this.height);
            if (imageData && imageData.data && imageData.data.length > 0) {
              imageData.data[0] = imageData.data[0] ^ 1;
              context.putImageData(imageData, 0, 0);
            }
          } catch (_) {
            // Tainted canvas (cross-origin) or zero-size — skip noise injection
          }
        }
        return originalToDataURL.apply(this, [type]);
      };
    });

    const page = await context.newPage();

    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': languages.join(',') + ';q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    });

    // Load Facebook cookies for authentication
    if (cookies && cookies.length > 0) {
      // Map browser-exported sameSite values to Playwright's expected enum
      const sameSiteMap = {
        no_restriction: 'None',
        unspecified: 'Lax',
        strict: 'Strict',
        lax: 'Lax',
        none: 'None',
        Strict: 'Strict',
        Lax: 'Lax',
        None: 'None',
      };

      const normalized = cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '.facebook.com',
        path: c.path || '/',
        httpOnly: c.httpOnly || false,
        secure: c.secure !== undefined ? c.secure : true,
        sameSite: sameSiteMap[c.sameSite] || 'Lax',
        // Preserve expiry if available
        ...(c.expirationDate ? { expires: Math.round(c.expirationDate) } : {}),
      }));
      await context.addCookies(normalized);
      console.log(`[FB] Loaded ${normalized.length} cookies for authentication`);
    } else {
      console.log('[FB] No cookies provided — may hit login wall');
    }

    console.log(`[FB] Navigating to: ${url}`);

    // Navigate with longer timeout and wait for network to settle
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    // Human-like initial pause (simulating reading/reaction time)
    await page.waitForTimeout(randomDelay(1500, 3500));

    // Check for login wall (skip if cookies provided)
    if (!cookies || cookies.length === 0) {
      const loginButton = await page.$(
        'a[href*="login"], button:has-text("Log In"), [aria-label*="log in" i], form[action*="login"]'
      );
      if (loginButton) {
        console.log('[FB] Login wall detected — add cookies in Settings or place www_facebook_com_cookies.json in project root.');
        return [];
      }
    }

    // === Progressive human-like scrolling ===
    // Simulate a real user slowly scanning the page
    await page.evaluate(async () => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));

      // Small initial scroll
      window.scrollBy(0, 150 + Math.random() * 100);
      await delay(400 + Math.random() * 600);

      // Medium scroll
      window.scrollBy(0, 250 + Math.random() * 150);
      await delay(500 + Math.random() * 800);

      // Pause (simulating looking at items)
      await delay(800 + Math.random() * 1200);

      // Another scroll
      window.scrollBy(0, 300 + Math.random() * 200);
      await delay(400 + Math.random() * 700);

      // Scroll further
      window.scrollBy(0, 350 + Math.random() * 200);
      await delay(600 + Math.random() * 1000);

      // Final scroll
      window.scrollBy(0, 200 + Math.random() * 150);
    });

    // Wait for lazy-loaded content
    await page.waitForTimeout(randomDelay(1500, 2500));

    // Extract listings
    const listings = await page.evaluate(() => {
      const results = [];
      const seenUrls = new Set();

      // FB Marketplace uses a link-based card structure
      // Try multiple selector strategies
      const allLinks = document.querySelectorAll(
        'a[href*="/marketplace/item/"], a[href*="/share/marketplace/item/"]'
      );

      const cards =
        allLinks.length > 0
          ? allLinks
          : document.querySelectorAll('div[role="article"] a[href*="marketplace"]');

      function extractFromLink(link, index) {
        const href = link.getAttribute('href') || '';
        if (!href || seenUrls.has(href)) return null;
        seenUrls.add(href);

        const fullUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;

        const card =
          link.closest('div[role="article"]') ||
          link.closest('[class*="x1"]') ||
          link.parentElement?.parentElement;

        // Extract title
        let title = '';
        if (card) {
          const img = card.querySelector('img');
          title = img?.getAttribute('aria-label') || img?.getAttribute('alt') || '';
          if (!title) {
            const spans = Array.from(card.querySelectorAll('span'));
            const textSpans = spans.filter((s) => {
              const t = s.textContent.trim();
              return t.length > 10 && t.length < 200 && !t.startsWith('$') && !t.startsWith('Sponsored');
            });
            if (textSpans.length > 0) {
              title = textSpans[0].textContent.trim();
            }
          }
        }
        if (!title) title = link.textContent.trim().substring(0, 100) || 'Untitled Listing';

        // Extract price (using browser-compatible selectors only)
        let price = '';
        if (card) {
          const allSpans = Array.from(card.querySelectorAll('span'));
          const priceSpan = allSpans.find((s) => /^\$[\d,]+/.test(s.textContent.trim()));
          if (priceSpan) {
            price = priceSpan.textContent.trim();
          } else {
            // Fallback: search all text for a price pattern
            const allText = card.textContent;
            const priceMatch = allText.match(/\$[\d,]+(\.[\d]{2})?/);
            price = priceMatch ? priceMatch[0] : '';
          }
        }
        if (!price) {
          const allText = link.textContent;
          const priceMatch = allText.match(/\$[\d,]+(\.[\d]{2})?/);
          price = priceMatch ? priceMatch[0] : '';
        }

        // Extract image
        let image = '';
        if (card) {
          const img = card.querySelector('img');
          image = img?.getAttribute('src') || '';
        }

        // Extract location
        let location = '';
        if (card) {
          const spans = Array.from(card.querySelectorAll('span'));
          const locSpan = spans.find((s) => {
            const t = s.textContent.trim();
            return (
              t.length > 3 &&
              t.length < 60 &&
              !t.includes('$') &&
              !t.includes('Sponsored') &&
              t !== title.substring(0, t.length) &&
              !t.includes('·') &&
              !t.includes('•')
            );
          });
          if (locSpan) location = locSpan.textContent.trim();
        }

        return {
          id: index + 1,
          title: title.substring(0, 120),
          price,
          image,
          location,
          description: '',
          url: fullUrl,
          source: 'facebook',
        };
      }

      const items = Array.from(cards).slice(0, 12);
      for (let i = 0; i < items.length; i++) {
        if (results.length >= 12) break;
        const link = items[i].tagName === 'A' ? items[i] : items[i].querySelector('a');
        if (link) {
          const listing = extractFromLink(link, i);
          if (listing && listing.title && listing.title.length > 2) {
            results.push(listing);
          }
        }
      }

      return results;
    });

    console.log(`[FB] Found ${listings.length} listings`);
    if (listings.length === 0 && cookies && cookies.length > 0) {
      console.warn(
        '[FB] Loaded cookies but got 0 listings — cookies may be expired, or FB may have served a different layout. Try refreshing your cookie export.'
      );
    }
    return listings;
  } catch (e) {
    console.error('[FB] Scrape error:', e.message);
    throw e;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = { scrapeFBMarketplace };
