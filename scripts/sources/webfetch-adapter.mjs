/**
 * WebFetch 内容提取适配器
 * 从 URL 提取论文/文章的详细内容
 */

export class WebFetchAdapter {
  /**
   * 提取 arXiv 论文详情
   */
  async fetchArxivPaper(url) {
    const prompt = `Extract paper details from this arXiv page.

REQUIREMENTS:
1. Extract: title, authors (comma-separated), abstract
2. If HTML version exists, extract from there (not PDF)
3. Output as JSON: { "title": "...", "authors": "...", "abstract": "..." }
4. Do NOT add commentary, ONLY return JSON

URL: ${url}`;

    console.log(`\n📄 REQUIRED ACTION: Please run WebFetch tool:`);
    console.log(JSON.stringify({ url, prompt }, null, 2));
    console.log(`💾 Save result to: digests/temp/content_${this._slugify(url)}.json\n`);

    return { url, status: 'pending' };
  }

  /**
   * 提取 GitHub 仓库详情
   */
  async fetchGitHubRepo(url) {
    // 转换为 raw README URL
    const readmeUrl = url.replace('github.com', 'raw.githubusercontent.com') + '/main/README.md';

    const prompt = `Extract repository information.

REQUIREMENTS:
1. Extract from README: title/name, description (first paragraph), key features
2. Output as JSON: { "title": "...", "description": "...", "features": ["...", "..."] }
3. Keep description under 200 words
4. Do NOT add commentary, ONLY return JSON`;

    console.log(`\n💻 REQUIRED ACTION: Please run WebFetch tool:`);
    console.log(JSON.stringify({ url: readmeUrl, prompt }, null, 2));
    console.log(`💾 Save result to: digests/temp/content_${this._slugify(url)}.json\n`);

    return { url, status: 'pending' };
  }

  /**
   * 提取技术文章详情
   */
  async fetchArticle(url) {
    const prompt = `Extract article content.

REQUIREMENTS:
1. Extract: title, author (if available), summary (2-3 sentences capturing core idea)
2. Focus on technical content, ignore navigation/ads
3. Output as JSON: { "title": "...", "author": "...", "summary": "..." }
4. Do NOT add commentary, ONLY return JSON`;

    console.log(`\n📝 REQUIRED ACTION: Please run WebFetch tool:`);
    console.log(JSON.stringify({ url, prompt }, null, 2));
    console.log(`💾 Save result to: digests/temp/content_${this._slugify(url)}.json\n`);

    return { url, status: 'pending' };
  }

  /**
   * 将 URL 转换为文件名安全的 slug
   */
  _slugify(url) {
    return url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
  }
}
