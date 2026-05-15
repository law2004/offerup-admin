const { scrapeFBMarketplace } = require('./fbMarketplaceScraper');

// The existing OfferUp scraper lives in index.js — we inline it here for decoupling,
// but in a larger refactor it'd be in its own service file.
// For now, we reference the scrape function from index context.

/**
 * Unified scraper that detects source from URL or explicit source param.
 * Returns standardized listing objects.
 *
 * @param {string} url
 * @param {string} source - 'auto', 'facebook', or 'offerup'
 * @param {Array} cookies - Facebook cookies for authenticated scraping
 */
async function scrapeBySource(url, source = 'auto', cookies = []) {
  // Auto-detect source from URL
  let detectedSource = source;
  if (source === 'auto') {
    if (url.includes('facebook.com/marketplace')) {
      detectedSource = 'facebook';
    } else if (url.includes('offerup.com')) {
      detectedSource = 'offerup';
    } else {
      // Default to offerup for generic URLs
      detectedSource = 'offerup';
    }
  }

  switch (detectedSource) {
    case 'facebook':
      return await scrapeFBMarketplace(url, cookies);
    case 'offerup':
    default:
      throw new Error('USE_OFFERUP_SCRAPER'); // handled by caller
  }
}

module.exports = { scrapeBySource };
