const ollama = require('ollama');

const MODEL = 'llama3.2:3b';

/**
 * Analyze a single scraped listing for deal quality, scams, and market value.
 *
 * @param {Object} item - Scraped listing { title, price, location, description?, source, url }
 * @returns {Object} { dealScore, redFlags, marketAssessment, summary }
 */
const OLLAMA_TIMEOUT_MS = 60_000; // 60 seconds per item

async function analyzeListing(item) {
  const prompt = buildDealPrompt(item);

  let timer;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('OLLAMA_TIMEOUT')), OLLAMA_TIMEOUT_MS);
    });

    const response = await Promise.race([
      ollama.chat({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a marketplace deal analyzer. Your job is to evaluate listings from OfferUp and Facebook Marketplace and determine if they are good deals.

You MUST respond with ONLY valid JSON in this exact format — no other text, no markdown, no code fences:
{
  "dealScore": <number 1-10, where 10 is an incredible steal>,
  "redFlags": [<list of scam/suspicion indicators - empty array if none>],
  "marketAssessment": "<brief comparison to fair market value>",
  "summary": "<one-sentence verdict on whether it's worth pursuing>"
}

Scoring guidelines:
- 1-2: Obvious scam or wildly overpriced
- 3-4: Overpriced, not worth it
- 5-6: Fair market price, average deal
- 7-8: Good deal, below market value
- 9-10: Incredible steal, must-buy

Red flags to watch for:
- Price too good to be true (e.g., $100 for a $1000 item)
- Generic stock photos or no real photos mentioned
- Vague descriptions with no details
- Urgency language ("must sell today", "moving tomorrow")
- Requests for payment outside the platform
- Listing in a different city/state than the item
- Recently joined / no profile history
- Duplicate listings with different accounts
- Price anomalies for the category`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 300,
      },
    }),
      timeoutPromise,
    ]);

    clearTimeout(timer);
    const text = response.message.content.trim();
    return parseAnalysisResponse(text, item);
  } catch (error) {
    if (timer) clearTimeout(timer);
    console.error(`[dealAnalyzer] LLM error for "${item.title}":`, error.message);
    const isTimeout = error.message === 'OLLAMA_TIMEOUT';
    return {
      dealScore: null,
      redFlags: [],
      marketAssessment: isTimeout ? 'Analysis timed out' : 'Analysis unavailable',
      summary: isTimeout ? 'LLM timeout — item not scored.' : `LLM analysis failed: ${error.message}`,
    };
  }
}

/**
 * Analyze multiple listings in parallel.
 * @param {Object[]} items - Array of listing objects
 * @returns {Object[]} - Items with deal fields added
 */
async function analyzeBatch(items) {
  if (!items || items.length === 0) return [];

  const results = [];
  // Process in batches of 3 to avoid overwhelming the LLM
  for (let i = 0; i < items.length; i += 3) {
    const batch = items.slice(i, i + 3);
    const batchResults = await Promise.allSettled(
      batch.map((item) => analyzeListing(item))
    );
    batchResults.forEach((result, j) => {
      if (result.status === 'fulfilled') {
        results.push({ ...batch[j], ...result.value });
      } else {
        results.push({
          ...batch[j],
          dealScore: null,
          redFlags: [],
          marketAssessment: 'Analysis failed',
          summary: result.reason?.message || 'Unknown error',
        });
      }
    });
  }
  return results;
}

/**
 * Build a structured prompt from the listing data.
 */
function buildDealPrompt(item) {
  const price = item.price || 'Unknown';
  const title = item.title || 'Unknown item';
  const location = item.location || 'Unknown';
  const source = item.source || 'unknown';
  const description = item.description || '';

  return `Analyze this ${source} marketplace listing for deal quality and scam potential:

TITLE: ${title}
PRICE: ${price}
LOCATION: ${location}
SOURCE: ${source}
${description ? `DESCRIPTION: ${description.substring(0, 300)}` : ''}

Evaluate this listing and return your JSON analysis.`;
}

/**
 * Parse the LLM response into structured data with validation.
 */
function parseAnalysisResponse(text, item) {
  // Try to extract JSON from the response (handle markdown code fences)
  let jsonStr = text;

  // Remove markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1];
  }

  // Try to find a JSON object in the text
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    return {
      dealScore: clampScore(parsed.dealScore),
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.slice(0, 5) : [],
      marketAssessment: String(parsed.marketAssessment || 'No assessment provided').substring(0, 200),
      summary: String(parsed.summary || 'No summary').substring(0, 200),
    };
  } catch {
    // If JSON parsing fails, extract what we can from the text
    return fallbackParse(text);
  }
}

function clampScore(score) {
  const num = Number(score);
  if (isNaN(num)) return null;
  return Math.max(1, Math.min(10, Math.round(num)));
}

function fallbackParse(text) {
  const scoreMatch = text.match(/dealScore["\s:]+(\d+)/i);
  const score = scoreMatch ? clampScore(scoreMatch[1]) : null;

  return {
    dealScore: score,
    redFlags: [],
    marketAssessment: text.substring(0, 200),
    summary: text.substring(0, 200),
  };
}

module.exports = { analyzeListing, analyzeBatch };
