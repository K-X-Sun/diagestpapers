/**
 * Deduplication Module for DigestPapers
 *
 * Prevents duplicate content across daily digests by maintaining a history of seen items.
 * Uses multiple strategies: URL matching, content fingerprinting, and title similarity.
 *
 * Usage:
 *   node deduplicate.mjs [--days 30] [--similarity 0.85] [--recent-only 7]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Output directory - automatically use digests/ relative to script location
const OUTPUT_DIR = process.env.DIGESTPAPERS_OUTPUT_DIR ||
  join(dirname(__dirname), 'digests');

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(s1, s2);
  return 1 - (distance / maxLen);
}

/**
 * Check if two titles are similar
 */
function areTitlesSimilar(title1, title2, threshold = 0.85) {
  const similarity = calculateSimilarity(title1, title2);
  return similarity >= threshold;
}

/**
 * Generate content fingerprint for an item
 */
function generateFingerprint(item) {
  // Use title + authors + first 100 chars of abstract
  const abstractSnippet = (item.abstract || '').substring(0, 100);
  const content = `${item.title}|${item.authors || ''}|${abstractSnippet}`;
  return crypto.createHash('md5').update(content.toLowerCase()).digest('hex');
}

/**
 * Extract publish date from item (if available)
 */
function extractPublishDate(item) {
  // Try to extract from link (e.g., arxiv.org/abs/2603.05344 -> March 2026)
  if (item.link && item.link.includes('arxiv.org/abs/')) {
    const match = item.link.match(/\/abs\/(\d{2})(\d{2})\./);
    if (match) {
      const year = 2000 + parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      return new Date(year, month, 1).getTime();
    }
  }

  // Fallback to fetched_at
  if (item.fetched_at) {
    return new Date(item.fetched_at).getTime();
  }

  // Default to current time
  return Date.now();
}

/**
 * Load history from file
 */
function loadHistory(historyPath) {
  if (!existsSync(historyPath)) {
    console.log('📝 No history file found. Starting fresh.');
    return [];
  }

  try {
    const history = JSON.parse(readFileSync(historyPath, 'utf-8'));
    console.log(`📚 Loaded ${history.length} items from history`);
    return history;
  } catch (error) {
    console.error(`⚠️  Error loading history: ${error.message}`);
    return [];
  }
}

/**
 * Save history to file
 */
function saveHistory(historyPath, history) {
  try {
    writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    console.log(`💾 Saved ${history.length} items to history`);
  } catch (error) {
    console.error(`❌ Error saving history: ${error.message}`);
  }
}

/**
 * Clean up old history entries
 */
function cleanupHistory(history, daysToKeep = 30) {
  const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

  const cleaned = history.filter(item => {
    const itemDate = new Date(item.seen_at || item.fetched_at || 0).getTime();
    return itemDate > cutoffDate;
  });

  const removed = history.length - cleaned.length;
  if (removed > 0) {
    console.log(`🗑️  Removed ${removed} old entries (older than ${daysToKeep} days)`);
  }

  return cleaned;
}

/**
 * Main deduplication function
 */
function deduplicateItems(newItems, history, options = {}) {
  const {
    titleSimilarityThreshold = 0.85,
    onlyRecent = false,
    recentDays = 7
  } = options;

  console.log('\n========================================');
  console.log('DEDUPLICATION IN PROGRESS');
  console.log('========================================\n');

  console.log(`📥 Input: ${newItems.length} items`);
  console.log(`📚 History: ${history.length} items`);
  console.log(`🎯 Title similarity threshold: ${titleSimilarityThreshold}`);
  if (onlyRecent) {
    console.log(`📅 Only keeping items from last ${recentDays} days`);
  }
  console.log('');

  // Build lookup structures from history
  const seenUrls = new Set();
  const seenFingerprints = new Set();
  const seenTitles = [];

  history.forEach(h => {
    if (h.link) seenUrls.add(h.link);
    if (h.fingerprint) seenFingerprints.add(h.fingerprint);
    if (h.title) seenTitles.push(h.title);
  });

  // Deduplication statistics
  const stats = {
    total: newItems.length,
    duplicateUrl: 0,
    duplicateFingerprint: 0,
    duplicateTitle: 0,
    tooOld: 0,
    kept: 0
  };

  const deduplicated = [];

  for (const item of newItems) {
    // Check URL
    if (item.link && seenUrls.has(item.link)) {
      stats.duplicateUrl++;
      console.log(`❌ Duplicate URL: ${item.title}`);
      continue;
    }

    // Generate and check fingerprint
    const fingerprint = generateFingerprint(item);
    if (seenFingerprints.has(fingerprint)) {
      stats.duplicateFingerprint++;
      console.log(`❌ Duplicate content: ${item.title}`);
      continue;
    }

    // Check title similarity
    let hasSimilarTitle = false;
    for (const seenTitle of seenTitles) {
      if (areTitlesSimilar(item.title, seenTitle, titleSimilarityThreshold)) {
        stats.duplicateTitle++;
        console.log(`❌ Similar title: "${item.title}" ≈ "${seenTitle}"`);
        hasSimilarTitle = true;
        break;
      }
    }
    if (hasSimilarTitle) continue;

    // Check publish date (if only recent items requested)
    if (onlyRecent) {
      const publishDate = extractPublishDate(item);
      const daysSincePublish = (Date.now() - publishDate) / (1000 * 60 * 60 * 24);
      if (daysSincePublish > recentDays) {
        stats.tooOld++;
        console.log(`⏰ Too old (${Math.floor(daysSincePublish)} days): ${item.title}`);
        continue;
      }
    }

    // Item passed all checks
    stats.kept++;
    console.log(`✅ Kept: ${item.title}`);

    // Add to result and update lookups
    const enrichedItem = {
      ...item,
      fingerprint,
      seen_at: new Date().toISOString()
    };
    deduplicated.push(enrichedItem);
    seenUrls.add(item.link);
    seenFingerprints.add(fingerprint);
    seenTitles.push(item.title);
  }

  console.log('\n========================================');
  console.log('DEDUPLICATION SUMMARY');
  console.log('========================================');
  console.log(`📊 Total items: ${stats.total}`);
  console.log(`❌ Removed:`);
  console.log(`   - Duplicate URL: ${stats.duplicateUrl}`);
  console.log(`   - Duplicate content: ${stats.duplicateFingerprint}`);
  console.log(`   - Similar title: ${stats.duplicateTitle}`);
  if (onlyRecent) {
    console.log(`   - Too old: ${stats.tooOld}`);
  }
  console.log(`✅ Kept: ${stats.kept}`);
  console.log('========================================\n');

  return {
    items: deduplicated,
    stats,
    updatedHistory: [...history, ...deduplicated]
  };
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    daysToKeep: 30,
    titleSimilarityThreshold: 0.85,
    onlyRecent: false,
    recentDays: 7
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      options.daysToKeep = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--similarity' && args[i + 1]) {
      options.titleSimilarityThreshold = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--recent-only' && args[i + 1]) {
      options.onlyRecent = true;
      options.recentDays = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n=== DigestPapers Deduplication Tool ===\n');

  const options = parseArgs();

  console.log('⚙️  Configuration:');
  console.log(`   - History retention: ${options.daysToKeep} days`);
  console.log(`   - Title similarity threshold: ${options.titleSimilarityThreshold}`);
  if (options.onlyRecent) {
    console.log(`   - Only recent items: ${options.recentDays} days`);
  }
  console.log('');

  // File paths
  const scrapedDataPath = join(OUTPUT_DIR, 'scraped-data.json');
  const historyPath = join(OUTPUT_DIR, 'history.json');
  const deduplicatedPath = join(OUTPUT_DIR, 'scraped-data-deduplicated.json');

  // Check if scraped-data.json exists
  if (!existsSync(scrapedDataPath)) {
    console.error('❌ scraped-data.json not found!');
    console.error('   Please run Phase 3 (merge content) first.');
    process.exit(1);
  }

  // Load data
  console.log('📖 Loading data...\n');
  const newItems = JSON.parse(readFileSync(scrapedDataPath, 'utf-8'));
  let history = loadHistory(historyPath);

  // Clean up old history
  history = cleanupHistory(history, options.daysToKeep);

  // Deduplicate
  const result = deduplicateItems(newItems, history, options);

  // Save results
  console.log('💾 Saving results...\n');

  // Save deduplicated data
  writeFileSync(
    deduplicatedPath,
    JSON.stringify(result.items, null, 2),
    'utf-8'
  );
  console.log(`✅ Deduplicated data saved to: scraped-data-deduplicated.json`);

  // Save updated history
  saveHistory(historyPath, result.updatedHistory);

  // Overwrite original scraped-data.json with deduplicated version
  writeFileSync(
    scrapedDataPath,
    JSON.stringify(result.items, null, 2),
    'utf-8'
  );
  console.log(`✅ Original scraped-data.json updated with deduplicated content`);

  console.log('\n✨ Deduplication complete!\n');
  console.log('Next steps:');
  console.log('  1. Review scraped-data.json (now deduplicated)');
  console.log('  2. Run Claude analysis (Phase 4)');
  console.log('  3. Generate reports (Phase 5)');
  console.log('');
}

// Run if executed directly
if (process.argv[1]?.endsWith('deduplicate.mjs')) {
  main().catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
}

export {
  deduplicateItems,
  generateFingerprint,
  calculateSimilarity,
  areTitlesSimilar,
  cleanupHistory,
  loadHistory,
  saveHistory
};
