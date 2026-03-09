/**
 * Reddit Scanner
 *
 * Discovers freelance/bounty posts from relevant subreddits.
 * Uses Reddit's public JSON API — no OAuth required for read-only public posts.
 * All HTTP routed through Moat Gateway.
 */

import type { BountyOpportunity } from "../types.js";
import { moatFetch } from "./moat-fetch.js";

// Subreddits to monitor for work opportunities
const DEFAULT_SUBREDDITS = [
  "forhire",           // Freelance job posts ([Hiring] flair)
  "freelance",         // Freelance opportunities
  "bounty",            // General bounties
  "ethdev",            // Ethereum dev work/bounties
  "solidity",          // Solidity contract work
  "cryptocurrency",    // Web3 opportunities
  "defi",              // DeFi opportunities
  "opensource",         // OSS contribution bounties
  "remotejs",          // Remote JS dev work
  "remotepython",      // Remote Python dev work
];

// Search queries for finding paid work
const DEFAULT_QUERIES = [
  "bounty",
  "hiring developer",
  "smart contract audit",
  "bug bounty",
  "paid issue",
  "looking for developer",
];

// Errors collected during scanning
const redditScanErrors: string[] = [];

// Regex patterns for extracting dollar amounts
const DOLLAR_PATTERNS = [
  /\$\s*([\d,]+(?:\.\d{2})?)/,
  /([\d,]+)\s*(?:USD|USDC|USDT|DAI)/i,
  /([\d,]+)\s*(?:dollars)/i,
  /budget[:\s]*\$?\s*([\d,]+)/i,
  /reward[:\s]*\$?\s*([\d,]+)/i,
  /bounty[:\s]*\$?\s*([\d,]+)/i,
  /pay(?:ing|ment)?[:\s]*\$?\s*([\d,]+)/i,
];

// Payment-related keywords — post must mention money/payment
const PAYMENT_KEYWORDS = [
  "pay", "paid", "payment", "budget", "compensation",
  "bounty", "reward", "$", "usd", "usdc", "usdt",
  "dai", "eth", "salary", "rate", "hourly", "fixed price",
  "contract", "freelance", "hire", "hiring",
];

/**
 * Extract dollar amount from text using regex patterns.
 * Returns amount in cents, or 0 if no amount found.
 */
export function extractDollarAmount(text: string): number {
  for (const pattern of DOLLAR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (amount > 0 && amount < 1_000_000) {
        return Math.round(amount * 100);
      }
    }
  }
  return 0;
}

/**
 * Check if text mentions payment/money.
 */
function mentionsPayment(text: string): boolean {
  const lower = text.toLowerCase();
  return PAYMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Scan a single subreddit for bounty/work posts.
 */
async function scanSubreddit(
  subreddit: string,
  query: string,
): Promise<BountyOpportunity[]> {
  const bounties: BountyOpportunity[] = [];

  try {
    const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&sort=new&limit=25&restrict_sr=on&t=week`;
    const result = await moatFetch(url, {
      headers: {
        "User-Agent": "automaton-landscape-scanner/1.0",
        Accept: "application/json",
      },
    });

    if (!result.ok) {
      redditScanErrors.push(`Reddit(r/${subreddit}): HTTP ${result.status_code}`);
      return [];
    }

    const data = result.body as any;
    const posts = data?.data?.children || [];

    for (const child of posts) {
      const post = child?.data;
      if (!post) continue;

      const fullText = `${post.title || ""} ${post.selftext || ""}`;

      // Filter: must mention money/payment/bounty
      if (!mentionsPayment(fullText)) continue;

      // Extract dollar amount from post
      const rewardCents = extractDollarAmount(fullText);

      // EV scoring for Reddit posts
      let evScore: number | undefined;
      if (rewardCents > 0) {
        evScore = Math.round(rewardCents * 0.2); // 20% confidence — Reddit less reliable
      } else {
        evScore = Math.round(5000 * 0.15); // Default $50 * 15% low confidence
      }

      bounties.push({
        source: "reddit" as BountyOpportunity["source"],
        title: post.title || "Untitled",
        url: `https://www.reddit.com${post.permalink || ""}`,
        rewardCents: rewardCents || 5000, // Default $50 if no amount found
        currency: "USD",
        repo: "",
        labels: [
          `r/${subreddit}`,
          post.link_flair_text || "",
          query,
        ].filter(Boolean),
        createdAt: post.created_utc
          ? new Date(post.created_utc * 1000).toISOString()
          : new Date().toISOString(),
        evScore,
      });
    }
  } catch (err: any) {
    redditScanErrors.push(`Reddit(r/${subreddit}): ${err.message}`);
  }

  return bounties;
}

/**
 * Scan all configured subreddits for bounty/work opportunities.
 * Deduplication is handled by bounty_memory (keyed by URL).
 */
export async function scanReddit(
  subreddits: string[] = DEFAULT_SUBREDDITS,
  queries: string[] = DEFAULT_QUERIES,
): Promise<BountyOpportunity[]> {
  // Clear errors from previous scan
  redditScanErrors.length = 0;

  const allBounties: BountyOpportunity[] = [];
  const seenUrls = new Set<string>();

  // Scan each subreddit with each query (rate-limit friendly — sequential)
  for (const subreddit of subreddits) {
    // Use first 2 queries per subreddit to avoid rate limiting
    const limitedQueries = queries.slice(0, 2);
    for (const query of limitedQueries) {
      const bounties = await scanSubreddit(subreddit, query);
      for (const b of bounties) {
        if (!seenUrls.has(b.url)) {
          seenUrls.add(b.url);
          allBounties.push(b);
        }
      }
    }
  }

  return allBounties;
}

/**
 * Get errors from the last Reddit scan run.
 */
export function getRedditScanErrors(): string[] {
  return [...redditScanErrors];
}
