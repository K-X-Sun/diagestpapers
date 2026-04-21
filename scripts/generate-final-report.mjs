/**
 * Generate HTML Digest from Claude LLM Analysis Result
 * Professional, minimalist white style with table format for core content
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load analysis result from Claude
// Try analysis-result.json first (priority), otherwise fall back to manual-filter.json
let analysis;
const analysisPath = join(__dirname, 'digests', 'analysis-result.json');
try {
  analysis = JSON.parse(readFileSync(analysisPath, 'utf-8'));
  console.log('Using analysis-result.json for analysis');
} catch (error) {
  const fallbackPath = join(__dirname, 'digests', 'manual-filter.json');
  analysis = JSON.parse(readFileSync(fallbackPath, 'utf-8'));
  console.log('Using manual-filter.json for analysis');
}

// Load original scraped data for statistics
const scrapedPath = join(__dirname, 'digests', 'scraped-data.json');
const scrapedData = JSON.parse(readFileSync(scrapedPath, 'utf-8'));
const originalTopic = scrapedData.topic || 'digest';

// Get topic from analysis - use scraped-data.json topic field if available
function extractTopic(items) {
  if (!items || items.length === 0) return 'digest';
  const scrapedPath = join(__dirname, 'digests', 'scraped-data.json');
  try {
    const sd = JSON.parse(readFileSync(scrapedPath, 'utf-8'));
    if (sd.topic && sd.topic.length > 2) return sd.topic.toLowerCase().replace(/\s+/g, '-');
  } catch (e) {}
  const text = JSON.stringify(items).toLowerCase();
  if (text.includes('multiagent') || text.includes('multi-agent')) return 'multiagent';
  if (text.includes('autoresearch') || text.includes('auto-research')) return 'autoresearch';
  if (text.includes('machine learning') || text.includes('ml')) return 'ml';
  if (text.includes('llm') || text.includes('large language')) return 'llm';
  if (text.includes('rag') || text.includes('retrieval-augmented')) return 'rag';
  return 'digest';
}

// Extract key insights from analysis for Key Trends section - professional analysis
function extractKeyTrends(items) {
  const trends = [];

  // Dynamic trends based on actual paper content
  const hasFramework = items.some(i =>
    i.title.toLowerCase().includes('framework') ||
    i.title.toLowerCase().includes('architecture') ||
    i.title.toLowerCase().includes('design')
  );
  if (hasFramework) {
    trends.push({
      icon: '🏗️',
      title: 'The Rise of Automated MAS Design',
      desc: 'Moving beyond manual configuration, researchers are developing automated frameworks like ABSTRAL that use evolutionary strategies and graph neural networks to discover optimal multi-agent architectures.'
    });
  }

  const hasBenchmark = items.some(i =>
    i.title.toLowerCase().includes('benchmark') ||
    i.title.toLowerCase().includes('comparative') ||
    i.title.toLowerCase().includes('study')
  );
  if (hasBenchmark) {
    trends.push({
      icon: '📊',
      title: 'Benchmarking Becomes Critical',
      desc: 'As the field matures, comprehensive evaluations across diverse scenarios (financial docs, medical records, logistics) are essential for understanding real-world performance tradeoffs.'
    });
  }

  const hasVLA = items.some(i =>
    i.title.toLowerCase().includes('vision-language') ||
    i.title.toLowerCase().includes('vl') ||
    i.title.toLowerCase().includes('multimodal')
  );
  if (hasVLA) {
    trends.push({
      icon: '👁️',
      title: 'Multimodal Perception is Key',
      desc: 'Integrating vision, language, and action models enables agents to better understand complex environments—CoMaTrack demonstrates this with game-theoretic tracking.'
    });
  }

  const hasMemory = items.some(i =>
    i.title.toLowerCase().includes('memory') ||
    i.title.toLowerCase().includes('affective')
  );
  if (hasMemory) {
    trends.push({
      icon: '🧠',
      title: 'Memory & Emotion Matter',
      desc: 'Long-term relationship building between agents and users requires sophisticated memory systems with emotional awareness—Memory Bear AI leads this direction.'
    });
  }

  const hasWorkflow = items.some(i =>
    i.title.toLowerCase().includes('workflow') ||
    i.title.toLowerCase().includes('runtime') ||
    i.title.toLowerCase().includes('optimization')
  );
  if (hasWorkflow) {
    trends.push({
      icon: '⚡',
      title: 'Dynamic Workflows Replace Static Templates',
      desc: 'The field is shifting from rigid workflows to dynamic runtime graphs that can adapt to complex multi-agent coordination needs in real-time.'
    });
  }

  const hasGameTheory = items.some(i =>
    i.title.toLowerCase().includes('game') ||
    i.title.toLowerCase().includes('theoretic')
  );
  if (hasGameTheory) {
    trends.push({
      icon: '♟️',
      title: 'Game Theory Enters Multi-Agent Systems',
      desc: 'Formal game-theoretic approaches enable agents to predict adversarial behavior and make optimal decisions in competitive environments.'
    });
  }

  // If we have few trends, add some general ones
  if (trends.length < 3) {
    trends.push({
      icon: '🚀',
      title: 'Rapid Field Growth',
      desc: 'The multi-agent systems field is expanding rapidly with diverse applications from healthcare to logistics.'
    });
  }

  return trends.slice(0, 5);
}

// Group items by source
function groupBySource(items, scrapedData = []) {
  const papers = items.filter(i => i.source.includes('arXiv'));
  let repos = items.filter(i => i.source.includes('GitHub'));

  // Ensure at least 5 repos in the report by adding from scraped data if needed
  if (repos.length < 5 && scrapedData.length > 0) {
    const additionalRepos = scrapedData
      .filter(s => s.source === 'GitHub Trending')
      .filter(s => !repos.some(r => r.link === s.link))
      .slice(0, 5 - repos.length);
    repos = repos.concat(additionalRepos);
  }

  return { papers, repos };
}

/**
 * Generate HTML report
 */
function generateReport(items, topics, date, topic, scrapedCount, filteredCount) {
  const { papers, repos } = groupBySource(items);
  const keyTrends = extractKeyTrends(items);

  // Render papers as a professional table
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

  // Render repos as a professional table
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

  // Render Key Trends as a professional text section
  const trendsHtml = keyTrends.map(trend => `
    <div class="trend-item">
      <span class="trend-icon">${trend.icon}</span>
      <div class="trend-content">
        <h4>${trend.title}</h4>
        <p>${trend.desc}</p>
      </div>
    </div>
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

    /* Key Trends Section */
    .key-trends-section { margin-bottom: 40px; }
    .key-trends-container { background: #f8fafc; border-radius: 16px; padding: 28px 32px; border: 1px solid #e2e8f0; }
    .key-trends-header { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
    .trends-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.3em; }
    .key-trends-title { font-size: 1.4em; color: #1e293b; font-weight: 600; }
    .trend-list { display: flex; flex-wrap: wrap; gap: 16px; }
    .trend-item { background: #fff; border-radius: 16px; padding: 20px 24px; border: 1px solid #e2e8f0; display: flex; align-items: flex-start; gap: 16px; transition: all 0.3s; }
    .trend-item:hover { transform: translateY(-4px); box-shadow: 0 8px 25px rgba(99, 102, 241, 0.15); border-color: #c7d2fe; }
    .trend-icon { font-size: 1.8em; }
    .trend-content h4 { color: #1e293b; font-size: 1.05em; font-weight: 600; margin: 0 0 6px 0; line-height: 1.4; }
    .trend-content p { color: #64748b; font-size: 0.95em; line-height: 1.6; margin: 0; }

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
          <span class="stat-number">${scrapedCount}</span>
          <span class="stat-label">Scraped</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${filteredCount}</span>
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

    ${keyTrends.length > 0 ? `
    <section class="key-trends-section">
      <div class="key-trends-container">
        <div class="key-trends-header">
          <div class="trends-icon">🔬</div>
          <h2 class="key-trends-title">Key Trends & Insights</h2>
        </div>
        <div class="trend-list">
          ${trendsHtml}
        </div>
      </div>
    </section>
    ` : ''}

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

// Main
function main(topicOverride = null) {
  const date = new Date().toISOString().split('T')[0];

  // Determine topic - use override if provided, otherwise extract from items
  const items = analysis.filtered_items;
  const topic = topicOverride || extractTopic(items);

  // Generate topic tags based on actual topic
  let topics = ['AI', 'Research'];
  if (topic === 'autoresearch') {
    topics = ['AutoResearch', 'AI', 'Autonomous Agents'];
  } else if (topic === 'multiagent') {
    topics = ['Multiagent', 'AI', 'Multi-Agent Systems'];
  } else if (topic === 'ml') {
    topics = ['Machine Learning', 'AI', 'ML'];
  } else if (topic === 'llm') {
    topics = ['LLM', 'AI', 'Large Language Models'];
  } else if (topic.includes('multimodal') || topic.includes('multimodal llm')) {
    topics = ['Multimodal LLM', 'AI', 'Multimodal Models'];
  } else if (topic.includes('agenticmemory') || topic.includes('agent memory')) {
    topics = ['Agentic Memory', 'AI', 'Autonomous Agents'];
  }

  // Count original scraped items
  const { papers, repos } = groupBySource(items, scrapedData);
  const totalScraped = papers.length + repos.length;

  // Generate report
  const html = generateReport(items, topics, date, topic, totalScraped, items.length);

  // Output path with topic and date
  const outputFilename = `digest-${topic}-${date}.html`;
  const outputPath = join(__dirname, 'digests', outputFilename);

  // Ensure directory exists
  const dir = dirname(resolve(outputPath));
  mkdirSync(dir, { recursive: true });

  // Write file
  writeFileSync(outputPath, html, 'utf-8');

  console.log(`Report generated: ${outputPath}`);
  console.log(`Total items: ${items.length}`);
}

// Parse command line argument for topic override
const topicArg = process.argv[2] || null;
main(topicArg);
