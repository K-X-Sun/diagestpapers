/**
 * Paper Digest CLI - WebSearch/WebFetch Mode with Multi-Source Support
 * Supports both WebSearch/WebFetch (primary) and Playwright (fallback)
 * Features: Multi-dimensional filtering (innovation, quality, team credibility, relevance)
 *
 * Usage:
 *   node auto-digest.mjs "为我查找autoresearch领域的文章和repo"
 *   node auto-digest.mjs "find papers for machine learning"
 *   node auto-digest.mjs --topic autoresearch --source all --count 20
 *   node auto-digest.mjs --phase 2  # After WebSearch execution
 *   node auto-digest.mjs --phase 3  # After WebFetch execution
 *
 * Options:
 *   --topic <topic>         Research topic to search for (default: Machine Learning)
 *   --source <source>       Data source: all, arxiv, github, blogs, conferences (default: all)
 *   --count <num>           Number of items to return (default: 20)
 *   --format <format>       Output format: html, markdown, json (default: html)
 *   --phase <num>           Phase: 1 (search), 2 (aggregate), 3 (merge)
 *   --min_innovation <n>    Minimum innovation score (0-1, default: 0.5)
 *   --min_quality <n>       Minimum quality score (0-1, default: 0.5)
 *   --min_relevance <n>     Minimum relevance score (0-1, default: 0.5)
 *   --repo_count <n>        Number of repositories to include (default: 5)
 *   --include_repos         Include GitHub repositories (default: true)
 */

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSearchAdapter } from './sources/websearch-adapter.mjs';
import { WebFetchAdapter } from './sources/webfetch-adapter.mjs';
import { PlaywrightAdapter } from './sources/playwright-adapter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Output directory - automatically use digests/ relative to script location
const OUTPUT_DIR = process.env.DIGESTPAPERS_OUTPUT_DIR || join(dirname(__dirname), 'digests');
const TEMP_DIR = join(OUTPUT_DIR, 'temp');

// Load config
const configPath = join(__dirname, 'config.json');
const CONFIG = JSON.parse(readFileSync(configPath, 'utf-8'));

/**
 * Extract topic from natural language message
 */
function extractTopic(message) {
  const patterns = [
    /find\s+(?:latest\s+)?papers?\s+(?:on|for|about)?\s*(.+)/i,
    /search\s+(?:for|about)?\s*(.+)/i,
    /digest\s+(?:for|of)?\s*(.+)/i,
    /summarize\s+(?:papers?|research)?\s*(?:on|about)?\s*(.+)/i,
    /show\s+(?:me\s+)?(papers?|repos?)\s+(?:for|on|about)?\s*(.+)/i,
    /查找\s*(?:最新的)?(.+)?领域/i,
    /为我\s*(?:查找|总结)?(.+)/i,
    /(.+?)领域/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      let topic = match[1]?.trim();
      if (topic && topic.length > 2) {
        topic = topic.replace(/[的了吗呢啊吧吗]/g, '').trim();
        if (/[\u4e00-\u9fa5]/.test(topic)) {
          return topic;
        }
        return topic.charAt(0).toUpperCase() + topic.slice(1);
      }
    }
  }

  // If no pattern matched but message is not empty, use it directly as topic
  const trimmed = message?.trim();
  if (trimmed && trimmed.length > 2 && !trimmed.startsWith("--")) {
    const cleaned = trimmed.replace(/[的了吗呢啊吧吗]/g, "").trim();
    if (/[一-龥]/.test(cleaned)) {
      return cleaned;
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return CONFIG.search_topics[0] || 'Machine Learning';
}

/**
 * Scrape papers from arXiv using Playwright - REVISED FOR NEW DOM STRUCTURE
 */
async function scrapeArxivPlaywright() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const papers = [];

  try {
    await page.goto('https://arxiv.org/list/cs.AI/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Get the HTML content
    const content = await page.evaluate(() => document.documentElement.outerHTML);
    const $ = cheerio.load(content);

    // Parse each paper entry - arXiv uses dl#articles > dt + dd structure
    // Note: $('#articles') returns 3 dl elements, so we iterate through all dt/dd pairs
    $('#articles dt').each((_, dt) => {
      const dd = $(dt).next('dd'); // dd is the next sibling of dt
      
      if (!dd || dd.length === 0) return;
      
      // Get arXiv ID from dt
      const arxivIdElement = $(dt).find('a[href^="/abs/"]').first();
      const arxivHref = arxivIdElement.attr('href');
      const arxivId = arxivHref ? arxivHref.replace('/abs/', '') : '';
      
      // Get title from dd - div.list-title.mathjax contains the title
      const titleElement = dd.find('div.list-title.mathjax').first();
      let title = titleElement.text().trim();
      
      // Remove "Title:" prefix and clean up
      title = title
        .replace(/^Title:\s*/, '')
        .replace(/^arXiv:\d+\.\d+ \[cs\.\w+\]\s*/, '')
        .replace(/["]+/g, '')
        .trim();
      
      // Get authors from dd
      const authorsList = [];
      dd.find('a[href^="https://arxiv.org/search/cs?searchtype=author"]').each((_, authorLink) => {
        const authorName = $(authorLink).text().trim();
        if (authorName) {
          authorsList.push(authorName);
        }
      });
      const authors = authorsList.join(', ');
      
      // Get abstract from dd - first p contains the abstract (no "Abstract:" prefix)
      let abstract = dd.find('p').first().text().trim();
      
      // Get link
      const link = arxivId ? `https://arxiv.org/abs/${arxivId}` : '';

      if (title && title.length > 10 && link) {
        papers.push({
          title: title,
          link: link,
          abstract: abstract,
          source: 'arXiv AI Papers'
        });
      }
    });
  } catch (error) {
    console.error('Error scraping arXiv with Playwright:', error.message);
  } finally {
    await browser.close();
  }

  return papers;
}

/**
 * Scrape trending repos from GitHub using Playwright
 */
async function scrapeGitHubPlaywright() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const repos = [];

  try {
    // Scrape multiple pages to get more repos
    const categories = ['', 'software', 'websites', 'scripts', 'learning'];
    
    for (const category of categories) {
      const url = category ? `https://github.com/trending/${category}` : 'https://github.com/trending';
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);

        const content = await page.evaluate(() => document.documentElement.outerHTML);
        const $ = cheerio.load(content);

        $('article.Box-row').each((_, el) => {
          const titleElement = $(el).find('h2 a').first();
          const title = titleElement.text().trim().replace(/\n/g, ' ');
          const link = titleElement.attr('href');

          if (title && link) {
            const description = $(el).find('p').first().text().trim();
            repos.push({
              title,
              link: `https://github.com${link}`,
              abstract: description,
              source: 'GitHub Trending'
            });
          }
        });
      } catch (err) {
        console.log(`Skipped category ${category}: ${err.message}`);
      }
    }
  } catch (error) {
    console.error('Error scraping GitHub with Playwright:', error.message);
  } finally {
    await browser.close();
  }

  // Remove duplicates and limit
  const uniqueRepos = [];
  const seen = new Set();
  for (const repo of repos) {
    if (!seen.has(repo.link)) {
      seen.add(repo.link);
      uniqueRepos.push(repo);
    }
  }

  return uniqueRepos.slice(0, 25);
}

/**
 * Check if browser-use is available
 */
function checkBrowserUse() {
  try {
    const browserUse = require.resolve('browser-use');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Try to use browser-use if available, fallback to Playwright
 */
async function scrapeArxiv() {
  const hasBrowserUse = checkBrowserUse();

  if (hasBrowserUse) {
    console.log('Using browser-use for scraping...');
    return scrapeArxivPlaywright();
  }

  return scrapeArxivPlaywright();
}

async function scrapeGitHub() {
  const hasBrowserUse = checkBrowserUse();

  if (hasBrowserUse) {
    console.log('Using browser-use for scraping...');
    return scrapeGitHubPlaywright();
  }

  return scrapeGitHubPlaywright();
}

/**
 * Extract topic from items for report
 */
function extractTopicFromItems(items) {
  if (!items || items.length === 0) return 'digest';
  const text = JSON.stringify(items).toLowerCase();
  if (text.includes('multiagent') || text.includes('multi-agent')) return 'multiagent';
  if (text.includes('autoresearch') || text.includes('auto-research')) return 'autoresearch';
  if (text.includes('machine learning') || text.includes('ml')) return 'ml';
  if (text.includes('llm') || text.includes('large language')) return 'llm';
  return 'digest';
}

/**
 * Generate HTML report with white theme and table format
 */
function generateReport(items, topics, date, topic) {
  // Group papers and repos
  const papers = items.filter(i => i.source.includes('arXiv'));
  const repos = items.filter(i => i.source.includes('GitHub'));

  // Render papers as table rows
  const papersHtml = papers.map((item, index) => `
    <tr class="paper-row">
      <td class="paper-num">${index + 1}</td>
      <td class="paper-title">
        <a href="${item.link}" target="_blank" rel="noopener" class="paper-title-link">${item.title}</a>
        ${item.authors ? `<div class="paper-authors">${item.authors}</div>` : ''}
      </td>
      <td class="paper-content">${item.summary.replace(/\n/g, '<br>')}</td>
      <td class="paper-link">
        <a href="${item.link}" target="_blank" rel="noopener" class="link-btn">Read &rarr;</a>
      </td>
    </tr>
  `).join('');

  // Render repos as table rows
  const reposHtml = repos.map((item, index) => `
    <tr class="paper-row">
      <td class="paper-num">${papers.length + index + 1}</td>
      <td class="paper-title">
        <a href="${item.link}" target="_blank" rel="noopener" class="paper-title-link">${item.title}</a>
        ${item.authors ? `<div class="paper-authors">${item.authors}</div>` : ''}
      </td>
      <td class="paper-content">${item.summary.replace(/\n/g, '<br>')}</td>
      <td class="paper-link">
        <a href="${item.link}" target="_blank" rel="noopener" class="link-btn">View &rarr;</a>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paper Digest - ${topic} - ${date}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #ffffff; min-height: 100vh; padding: 40px 20px; color: #333; }
    .container { max-width: 1600px; margin: 0 auto; }

    /* Header */
    header { text-align: center; margin-bottom: 40px; }
    h1 { font-size: 2.8em; font-weight: 700; color: #1e293b; margin-bottom: 12px; letter-spacing: -0.5px; }
    .subtitle { font-size: 1.1em; color: #64748b; font-weight: 400; }
    .topics { display: flex; justify-content: center; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
    .topic-tag { background: #e0e7ff; color: #4338ca; padding: 6px 16px; border-radius: 20px; font-size: 0.85em; font-weight: 600; }

    /* Stats Bar */
    .stats-bar { display: flex; justify-content: center; gap: 60px; margin-top: 35px; flex-wrap: wrap; }
    .stat-item { text-align: center; }
    .stat-number { font-size: 2em; font-weight: 700; color: #1e293b; display: block; }
    .stat-label { font-size: 0.8em; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; display: block; }

    /* Paper Tables */
    .paper-section { margin-bottom: 40px; }
    .section-title { font-size: 1.4em; color: #1e293b; margin-bottom: 20px; padding-left: 12px; border-left: 3px solid #6366f1; font-weight: 600; }
    .section-count { background: #6366f1; color: #fff; padding: 4px 12px; border-radius: 12px; font-size: 0.8em; font-weight: 600; margin-left: 10px; }

    .paper-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .paper-table th { background: #f8fafc; padding: 14px 16px; text-align: left; font-size: 0.75em; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
    .paper-table td { padding: 18px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .paper-table tr:last-child td { border-bottom: none; }
    .paper-table tr:hover td { background: #f8fafc; }

    .paper-num { font-size: 0.9em; font-weight: 700; color: #6366f1; min-width: 40px; }
    .paper-title { font-size: 1em; color: #1e293b; font-weight: 600; line-height: 1.5; }
    .paper-title-link { color: #1e293b; text-decoration: none; }
    .paper-title-link:hover { color: #6366f1; text-decoration: underline; }
    .paper-authors { font-size: 0.85em; color: #64748b; margin-top: 4px; font-weight: 400; }
    .paper-content { font-size: 0.95em; color: #475569; line-height: 1.7; }
    .paper-link { text-align: right; min-width: 100px; }
    .link-btn { color: #6366f1; text-decoration: none; font-size: 0.88em; font-weight: 600; padding: 6px 14px; border: 2px solid #6366f1; border-radius: 8px; transition: all 0.2s; display: inline-block; }
    .link-btn:hover { background: #6366f1; color: #fff; text-decoration: none; transform: translateY(-1px); }

    /* Footer */
    footer { text-align: center; margin-top: 50px; padding: 30px 20px; color: #94a3b8; font-size: 0.9em; border-top: 1px solid #e2e8f0; }

    /* Responsive */
    @media (max-width: 1000px) { .paper-table th:nth-child(4), .paper-table td:nth-child(4) { display: none; } }
    @media (max-width: 768px) { .paper-table th, .paper-table td { display: block; width: 100%; } .paper-table tr { display: flex; flex-direction: column; } .paper-table tr td { border-bottom: 1px solid #e2e8f0; } .paper-table tr:last-child td { border-bottom: none; } .paper-link { text-align: left; margin-top: 12px; } .link-btn { width: 100%; text-align: center; } .stats-bar { gap: 25px; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Paper Digest</h1>
      <p class="subtitle">Curated research papers and repositories</p>
      <div class="topics">${topics.map(t => `<span class="topic-tag">${t}</span>`).join('')}</div>

      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-number">${items.length}</span>
          <span class="stat-label">Selected</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${papers.length}</span>
          <span class="stat-label">Papers</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${repos.length}</span>
          <span class="stat-label">Repositories</span>
        </div>
      </div>
    </header>

    ${papers.length > 0 ? `
    <section class="paper-section">
      <h2 class="section-title">Academic Papers <span class="section-count">${papers.length}</span></h2>
      <table class="paper-table">
        <thead>
          <tr>
            <th width="5%">No.</th>
            <th width="30%">Title</th>
            <th width="50%">Core Content</th>
            <th width="15%">Link</th>
          </tr>
        </thead>
        <tbody>
          ${papersHtml}
        </tbody>
      </table>
    </section>
    ` : ''}

    ${repos.length > 0 ? `
    <section class="paper-section">
      <h2 class="section-title">Trending Repositories <span class="section-count">${repos.length}</span></h2>
      <table class="paper-table">
        <thead>
          <tr>
            <th width="5%">No.</th>
            <th width="30%">Title</th>
            <th width="50%">Core Content</th>
            <th width="15%">Link</th>
          </tr>
        </thead>
        <tbody>
          ${reposHtml}
        </tbody>
      </table>
    </section>
    ` : ''}

    <footer>
      <p>Generated on ${date} | Topic: ${topic} | Curated by Claude AI</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Phase 1: Search planning with WebSearch
 */
async function phase1_searchPlanning(message, options = {}) {
  const {
    source = 'all',
    count = 20,
    minInnovation = 0.5,
    minQuality = 0.5,
    minRelevance = 0.5,
    repoCount = 5
  } = options;

  console.log('=== Paper Digest Generator (WebSearch + WebFetch Mode) ===\n');

  // Extract topic from message
  const topic = extractTopic(message);
  console.log(`📌 Topic extracted: ${topic}\n`);
  console.log(`📊 Source: ${source}, Count: ${count}\n`);
  console.log(`🔍 Filtering thresholds: Innovation>=${minInnovation}, Quality>=${minQuality}, Relevance>=${minRelevance}\n`);

  // Initialize adapters
  const webSearchAdapter = new WebSearchAdapter({ maxResults: count });

  // Data collection phase
  console.log('\n========================================');
  console.log('PHASE 1: DATA COLLECTION');
  console.log('========================================\n');

  const searchTasks = [];

  if (source === 'all' || source === 'arxiv') {
    searchTasks.push(await webSearchAdapter.searchArxivPapers(topic));
  }

  if (source === 'all' || source === 'github') {
    searchTasks.push(await webSearchAdapter.searchGitHubRepos(topic));
  }

  if (source === 'all' || source === 'blogs') {
    searchTasks.push(await webSearchAdapter.searchTechBlogs(topic));
  }

  if (source === 'all' || source === 'conferences') {
    searchTasks.push(await webSearchAdapter.searchConferences(topic));
  }

  if (source === 'all' || source === 'pwc') {
    searchTasks.push(await webSearchAdapter.searchPapersWithCode(topic));
  }

  // Save search task configuration
  const taskConfig = {
    topic,
    source,
    count,
    searchTasks,
    minInnovation,
    minQuality,
    minRelevance,
    repoCount,
    timestamp: new Date().toISOString()
  };

  // Create directories
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  writeFileSync(
    join(TEMP_DIR, 'search-tasks.json'),
    JSON.stringify(taskConfig, null, 2)
  );

  console.log('\n========================================');
  console.log('⏸️  WAITING FOR WEBSEARCH EXECUTION');
  console.log('========================================');
  console.log('Please execute the WebSearch queries listed above.');
  console.log('💾 Save WebSearch results to: digests/temp/sources_*.json');
  console.log('After all searches complete, run:');
  console.log('  node auto-digest.mjs --phase 2');
  console.log('========================================\n');
}

/**
 * Phase 2: Aggregate search results and plan content extraction
 */
async function phase2_aggregateResults() {
  console.log('\n========================================');
  console.log('PHASE 2: CONTENT EXTRACTION PLANNING');
  console.log('========================================\n');

  // Read all sources_*.json files from temp directory
  const sourceFiles = readdirSync(TEMP_DIR)
    .filter(f => f.startsWith('sources_') && f.endsWith('.json'));

  if (sourceFiles.length === 0) {
    console.error('❌ No source files found. Please run Phase 1 first and execute WebSearch queries.');
    return;
  }

  console.log(`📂 Found ${sourceFiles.length} source files\n`);

  const allItems = [];
  const webFetchAdapter = new WebFetchAdapter();

  for (const file of sourceFiles) {
    const filePath = join(TEMP_DIR, file);
    const results = JSON.parse(readFileSync(filePath, 'utf-8'));

    console.log(`Processing ${file} (${results.length} items)...`);

    // Generate WebFetch instructions for each result
    for (const result of results) {
      if (result.url.includes('arxiv.org')) {
        await webFetchAdapter.fetchArxivPaper(result.url);
      } else if (result.url.includes('github.com')) {
        await webFetchAdapter.fetchGitHubRepo(result.url);
      } else {
        await webFetchAdapter.fetchArticle(result.url);
      }

      // Add to aggregated list
      allItems.push({
        url: result.url,
        title: result.title || 'Unknown',
        snippet: result.snippet || '',
        source: file.replace('sources_', '').replace('.json', '')
      });
    }
  }

  // Save aggregated results to temp directory
  writeFileSync(
    join(TEMP_DIR, 'aggregated-items.json'),
    JSON.stringify(allItems, null, 2)
  );

  console.log(`\n✅ Aggregated ${allItems.length} items`);
  console.log(`💾 Saved to: digests/temp/aggregated-items.json\n`);

  console.log('========================================');
  console.log('⏸️  WAITING FOR WEBFETCH EXECUTION');
  console.log('========================================');
  console.log('Please execute the WebFetch queries listed above.');
  console.log('💾 Save WebFetch results to: digests/temp/content_*.json');
  console.log('After all fetches complete, run:');
  console.log('  node auto-digest.mjs --phase 3');
  console.log('========================================\n');
}

/**
 * Phase 3: Merge content and prepare for Claude analysis
 */
async function phase3_mergeContent() {
  console.log('\n========================================');
  console.log('PHASE 3: MERGING CONTENT');
  console.log('========================================\n');

  // Read aggregated items from temp directory
  const aggregatedPath = join(TEMP_DIR, 'aggregated-items.json');
  if (!existsSync(aggregatedPath)) {
    console.error('❌ aggregated-items.json not found. Please run Phase 2 first.');
    return;
  }

  const aggregated = JSON.parse(readFileSync(aggregatedPath, 'utf-8'));

  // Read all content_*.json files from temp directory
  const contentFiles = readdirSync(TEMP_DIR)
    .filter(f => f.startsWith('content_') && f.endsWith('.json'));

  if (contentFiles.length === 0) {
    console.error('❌ No content files found. Please execute WebFetch queries first.');
    return;
  }

  console.log(`📂 Found ${contentFiles.length} content files\n`);

  const mergedItems = [];

  for (const item of aggregated) {
    const slug = item.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const contentFile = `content_${slug}.json`;

    if (contentFiles.includes(contentFile)) {
      const content = JSON.parse(
        readFileSync(join(TEMP_DIR, contentFile), 'utf-8')
      );

      mergedItems.push({
        title: content.title || item.title,
        link: item.url,
        abstract: content.abstract || content.description || content.summary || item.snippet,
        authors: content.authors || content.author || '',
        source: mapSource(item.source),
        fetched_at: new Date().toISOString()
      });
    } else {
      console.log(`⚠️  Missing content for: ${item.url}`);
    }
  }

  // Save final scraped data to OUTPUT_DIR (not temp, this is used by reports)
  writeFileSync(
    join(OUTPUT_DIR, 'scraped-data.json'),
    JSON.stringify(mergedItems, null, 2)
  );

  console.log(`\n✅ Merged ${mergedItems.length} items`);
  console.log(`💾 Saved to: digests/scraped-data.json\n`);

  // Read task config to get topic
  const taskConfigPath = join(TEMP_DIR, 'search-tasks.json');
  const taskConfig = existsSync(taskConfigPath)
    ? JSON.parse(readFileSync(taskConfigPath, 'utf-8'))
    : { topic: 'research', minInnovation: 0.5, minQuality: 0.5, minRelevance: 0.5, count: 20 };

  // Output Claude analysis instructions
  console.log('========================================');
  console.log('FOR CLAUDE ANALYSIS - MULTI-DIMENSIONAL FILTERING:');
  console.log('========================================');
  console.log(`I have collected ${mergedItems.length} papers/articles/repos related to "${taskConfig.topic}".`);
  console.log('\n📖 Please analyze them using Read tool:');
  console.log('   Read digests/scraped-data.json');
  console.log('\n📊 Then filter based on:');
  console.log('1. INNOVATION (0-1): Novelty of approach, unique contributions');
  console.log('2. QUALITY (0-1): Methodological rigor, clarity');
  console.log('3. TEAM_CREDIBILITY (0-1): Author/institution reputation');
  console.log('4. RELEVANCE (0-1): Alignment with topic');
  console.log(`\n🎯 Minimum thresholds:`);
  console.log(`   - Innovation: >= ${taskConfig.minInnovation}`);
  console.log(`   - Quality: >= ${taskConfig.minQuality}`);
  console.log(`   - Relevance: >= ${taskConfig.minRelevance}`);
  console.log(`\n✨ Select top ${taskConfig.count} items and provide 2-3 sentence summaries.`);
  console.log('\n💾 Save your analysis as: digests/analysis-result.json');
  console.log('\n📋 Expected JSON format:');
  console.log('{');
  console.log('  "filtered_items": [');
  console.log('    {');
  console.log('      "title": "...",');
  console.log('      "link": "...",');
  console.log('      "authors": "...",');
  console.log('      "summary": "2-3 sentence summary",');
  console.log('      "source": "arXiv Papers" | "GitHub Trending" | "Tech Blogs" | ...,');
  console.log('      "scores": {');
  console.log('        "innovation": 0.9,');
  console.log('        "quality": 0.85,');
  console.log('        "team_credibility": 0.75,');
  console.log('        "relevance": 0.95');
  console.log('      }');
  console.log('    }');
  console.log('  ]');
  console.log('}');
  console.log('========================================\n');
}

/**
 * Map source code to display name
 */
function mapSource(rawSource) {
  const mapping = {
    'arxiv': 'arXiv Papers',
    'github': 'GitHub Trending',
    'blog': 'Tech Blogs',
    'pwc': 'Papers With Code',
    'conf': 'Conference Papers'
  };

  // Handle prefixed sources like "blog_medium", "conf_neurips"
  for (const [key, value] of Object.entries(mapping)) {
    if (rawSource.startsWith(key)) {
      return value;
    }
  }

  return 'Web Articles';
}

/**
 * Main execution (legacy support)
 */
async function main(message, options = {}) {
  // Default to Phase 1 for backward compatibility
  return phase1_searchPlanning(message, options);

  // Check if analysis result exists and generate HTML report
  const analysisPath = join(__dirname, 'digests', 'analysis-result.json');
  const fallbackPath = join(__dirname, 'digests', 'manual-filter.json');

  if (existsSync(analysisPath) || existsSync(fallbackPath)) {
    let analysis;
    try {
      analysis = JSON.parse(readFileSync(analysisPath, 'utf-8'));
      console.log('\nFound analysis-result.json, generating HTML report...');
    } catch (error) {
      analysis = JSON.parse(readFileSync(fallbackPath, 'utf-8'));
      console.log('\nFound manual-filter.json, generating HTML report...');
    }

    // Get items from analysis
    const items = analysis.filtered_items || [];

    if (items.length > 0) {
      // Extract topic from items
      const topic = extractTopicFromItems(items);

      // Generate topic tags
      let topics = ['AI', 'Research'];
      if (topic === 'autoresearch') {
        topics = ['AutoResearch', 'AI', 'Autonomous Agents'];
      } else if (topic === 'multiagent') {
        topics = ['Multiagent', 'AI', 'Multi-Agent Systems'];
      } else if (topic === 'ml') {
        topics = ['Machine Learning', 'AI', 'ML'];
      } else if (topic === 'llm') {
        topics = ['LLM', 'AI', 'Large Language Models'];
      }

      const date = new Date().toISOString().split('T')[0];
      const html = generateReport(items, topics, date, topic);

      // Save HTML report
      const outputFilename = `digest-${topic}-${date}.html`;
      const outputPath = join(__dirname, 'digests', outputFilename);
      writeFileSync(outputPath, html, 'utf-8');

      console.log(`\nHTML report generated: ${outputPath}`);
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    topic: null,
    source: 'all',
    count: 20,
    format: 'html',
    query: null,
    phase: 1,
    minInnovation: 0.5,
    minQuality: 0.5,
    minRelevance: 0.5,
    includeRepos: true,
    repoCount: 5
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1]) {
      options.topic = args[i + 1];
      i++;
    } else if (args[i] === '--source' && args[i + 1]) {
      options.source = args[i + 1];
      i++;
    } else if (args[i] === '--count' && args[i + 1]) {
      options.count = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1];
      i++;
    } else if (args[i] === '--phase' && args[i + 1]) {
      options.phase = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--min_innovation' && args[i + 1]) {
      options.minInnovation = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--min_quality' && args[i + 1]) {
      options.minQuality = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--min_relevance' && args[i + 1]) {
      options.minRelevance = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--repo_count' && args[i + 1]) {
      options.repoCount = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--include_repos' && args[i + 1]) {
      options.includeRepos = args[i + 1].toLowerCase() === 'true';
      i++;
    } else if (!args[i].startsWith('--')) {
      options.query = args[i];
    }
  }

  return options;
}

// Run if executed directly
if (process.argv[1]?.endsWith('auto-digest.mjs')) {
  const options = parseArgs();

  // Route to appropriate phase
  if (options.phase === 2) {
    phase2_aggregateResults().catch(console.error);
  } else if (options.phase === 3) {
    phase3_mergeContent().catch(console.error);
  } else {
    // Phase 1: Search planning
    let message = options.query || '';
    if (!message && options.topic) {
      message = `find papers for ${options.topic}`;
    } else if (!message) {
      message = 'Machine Learning';
    }

    phase1_searchPlanning(message, options).catch(console.error);
  }
}

export { main, extractTopic, extractTopicFromItems, scrapeArxivPlaywright, scrapeGitHubPlaywright, parseArgs };
