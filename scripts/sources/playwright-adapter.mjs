/**
 * Playwright 备选适配器
 * 仅在 WebSearch/WebFetch 失败时使用
 * 复用现有的 scrapeArxivPlaywright 和 scrapeGitHubPlaywright
 */

import { scrapeArxivPlaywright, scrapeGitHubPlaywright } from '../auto-digest.mjs';

export class PlaywrightAdapter {
  async scrapeArxiv() {
    console.log('[Playwright] Fallback: Scraping arXiv with Playwright...');
    return await scrapeArxivPlaywright();
  }

  async scrapeGitHub() {
    console.log('[Playwright] Fallback: Scraping GitHub with Playwright...');
    return await scrapeGitHubPlaywright();
  }
}
