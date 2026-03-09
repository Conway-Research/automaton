/**
 * RSS/Atom Feed Scanner
 *
 * Discovers bounties from RSS/Atom feeds of bounty platforms and job boards.
 * Parses XML feeds and extracts entries with bounty-related keywords.
 * All HTTP routed through Moat Gateway.
 */

import type { BountyOpportunity } from "../types.js";
import { moatFetch } from "./moat-fetch.js";

export interface FeedSource {
  name: string;
  url: string;
  type: "rss" | "atom";
  category: "web2" | "web3";
  evMultiplier: number; // Confidence multiplier for EV scoring
}

const DEFAULT_FEED_SOURCES: FeedSource[] = [
  {
    name: "HackerOne Hacktivity",
    url: "https://hackerone.com/hacktivity.rss",
    type: "rss",
    category: "web2",
    evMultiplier: 0.25,
  },
  {
    name: "Bugcrowd Programs",
    url: "https://bugcrowd.com/programs.atom",
    type: "atom",
    category: "web2",
    evMultiplier: 0.25,
  },
  {
    name: "Immunefi Blog",
    url: "https://immunefi.com/blog/rss",
    type: "rss",
    category: "web3",
    evMultiplier: 0.3,
  },
  {
    name: "Code4rena Contests",
    url: "https://code4rena.com/contests.rss",
    type: "rss",
    category: "web3",
    evMultiplier: 0.15,
  },
];

// Bounty-related keywords for relevance scoring
const BOUNTY_KEYWORDS = [
  "bounty", "reward", "bug bounty", "vulnerability",
  "audit", "contest", "prize", "payout", "compensation",
  "critical", "high severity", "medium severity",
];

// Dollar amount extraction patterns
const DOLLAR_PATTERNS = [
  /\$\s*([\d,]+(?:\.\d+)?)/,
  /([\d,]+)\s*(?:USD|USDC|USDT)/i,
  /up\s+to\s+\$?\s*([\d,]+)/i,
  /reward[s]?\s*(?:up\s+to\s+)?\$?\s*([\d,]+)/i,
  /bounty[:\s]+\$?\s*([\d,]+)/i,
  /prize[s]?\s*(?:pool)?[:\s]+\$?\s*([\d,]+)/i,
];

// Errors collected during scanning
const rssScanErrors: string[] = [];

/**
 * Extract dollar amount from text. Returns cents, or 0 if not found.
 */
function extractAmount(text: string): number {
  for (const pattern of DOLLAR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (amount > 0 && amount < 10_000_000) {
        return Math.round(amount * 100);
      }
    }
  }
  return 0;
}

/**
 * Calculate relevance score based on keyword matches.
 * Returns 0-1 score.
 */
function keywordRelevance(text: string): number {
  const lower = text.toLowerCase();
  let matches = 0;
  for (const kw of BOUNTY_KEYWORDS) {
    if (lower.includes(kw)) matches++;
  }
  return Math.min(matches / 3, 1); // Cap at 1.0, 3 keywords = max
}

/**
 * Minimal XML tag content extractor.
 * Extracts content between <tag> and </tag>.
 * Does NOT handle attributes, namespaces, or CDATA (simple is fine for feeds).
 */
function extractTagContent(xml: string, tag: string): string[] {
  const results: string[] = [];
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;
  let pos = 0;

  while (pos < xml.length) {
    const start = xml.indexOf(openTag, pos);
    if (start === -1) break;

    // Find end of opening tag (handle attributes)
    const tagEnd = xml.indexOf(">", start + openTag.length);
    if (tagEnd === -1) break;

    // Check for self-closing tag
    if (xml[tagEnd - 1] === "/") {
      pos = tagEnd + 1;
      continue;
    }

    const contentStart = tagEnd + 1;
    const end = xml.indexOf(closeTag, contentStart);
    if (end === -1) break;

    let content = xml.slice(contentStart, end).trim();
    // Strip CDATA wrapper if present
    if (content.startsWith("<![CDATA[") && content.endsWith("]]>")) {
      content = content.slice(9, -3).trim();
    }
    // Strip HTML tags for plain text
    content = content.replace(/<[^>]+>/g, "").trim();
    results.push(content);
    pos = end + closeTag.length;
  }

  return results;
}

/**
 * Extract href from Atom link tags: <link href="..." />
 */
function extractAtomLinks(xml: string): string[] {
  const links: string[] = [];
  const regex = /<link[^>]*href="([^"]+)"[^>]*\/?>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const href = match[1];
    // Skip self/alternate/edit type links unless they're HTTP
    if (href.startsWith("http")) {
      links.push(href);
    }
  }
  return links;
}

/**
 * Parse an RSS feed and extract bounty entries.
 */
function parseRSSFeed(
  xml: string,
  source: FeedSource,
): BountyOpportunity[] {
  const bounties: BountyOpportunity[] = [];

  const titles = extractTagContent(xml, "title");
  const links = extractTagContent(xml, "link");
  const descriptions = extractTagContent(xml, "description");
  const pubDates = extractTagContent(xml, "pubDate");

  // Skip first title/link (channel-level)
  for (let i = 1; i < titles.length; i++) {
    const title = titles[i] || "";
    const link = links[i] || "";
    const description = descriptions[i] || "";
    const pubDate = pubDates[i] || "";
    const fullText = `${title} ${description}`;

    const relevance = keywordRelevance(fullText);
    if (relevance < 0.33) continue; // Skip low-relevance entries

    const rewardCents = extractAmount(fullText);
    const baseReward = rewardCents || 10000; // Default $100 for known bounty platforms
    const evScore = Math.round(baseReward * source.evMultiplier * relevance);

    bounties.push({
      source: "rss-feed" as BountyOpportunity["source"],
      title: title || source.name,
      url: link,
      rewardCents: rewardCents || 10000,
      currency: "USD",
      repo: "",
      labels: [source.name, source.category, "rss"],
      createdAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      evScore,
    });
  }

  return bounties;
}

/**
 * Parse an Atom feed and extract bounty entries.
 */
function parseAtomFeed(
  xml: string,
  source: FeedSource,
): BountyOpportunity[] {
  const bounties: BountyOpportunity[] = [];

  const titles = extractTagContent(xml, "title");
  const links = extractAtomLinks(xml);
  const summaries = extractTagContent(xml, "summary");
  const contents = extractTagContent(xml, "content");
  const updateds = extractTagContent(xml, "updated");

  // Skip first title (feed-level)
  for (let i = 1; i < titles.length; i++) {
    const title = titles[i] || "";
    const link = links[i] || "";
    const summary = summaries[i - 1] || contents[i - 1] || "";
    const updated = updateds[i] || "";
    const fullText = `${title} ${summary}`;

    const relevance = keywordRelevance(fullText);
    if (relevance < 0.33) continue;

    const rewardCents = extractAmount(fullText);
    const baseReward = rewardCents || 10000;
    const evScore = Math.round(baseReward * source.evMultiplier * relevance);

    bounties.push({
      source: "rss-feed" as BountyOpportunity["source"],
      title: title || source.name,
      url: link,
      rewardCents: rewardCents || 10000,
      currency: "USD",
      repo: "",
      labels: [source.name, source.category, "atom"],
      createdAt: updated ? new Date(updated).toISOString() : new Date().toISOString(),
      evScore,
    });
  }

  return bounties;
}

/**
 * Scan a single feed source for bounties.
 */
async function scanFeed(source: FeedSource): Promise<BountyOpportunity[]> {
  try {
    const result = await moatFetch(source.url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "User-Agent": "automaton-landscape-scanner/1.0",
      },
    });

    if (!result.ok) {
      rssScanErrors.push(`RSS(${source.name}): HTTP ${result.status_code}`);
      return [];
    }

    const xml = typeof result.body === "string"
      ? result.body
      : JSON.stringify(result.body);

    if (source.type === "atom") {
      return parseAtomFeed(xml, source);
    }
    return parseRSSFeed(xml, source);
  } catch (err: any) {
    rssScanErrors.push(`RSS(${source.name}): ${err.message}`);
    return [];
  }
}

/**
 * Scan all configured RSS/Atom feeds for bounty opportunities.
 */
export async function scanRSSFeeds(
  sources: FeedSource[] = DEFAULT_FEED_SOURCES,
): Promise<BountyOpportunity[]> {
  // Clear errors from previous scan
  rssScanErrors.length = 0;

  const results = await Promise.allSettled(
    sources.map((source) => scanFeed(source)),
  );

  const allBounties: BountyOpportunity[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allBounties.push(...result.value);
    }
  }

  return allBounties;
}

/**
 * Get errors from the last RSS scan run.
 */
export function getRSSScanErrors(): string[] {
  return [...rssScanErrors];
}
