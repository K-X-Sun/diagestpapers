# DigestPapers Skill

A comprehensive skill for searching, analyzing, and generating weekly reports for research papers and GitHub repositories.

##  Features

- **Multi-Source Search**: arXiv, GitHub, Papers With Code, Tech Blogs, Conferences
- **Smart Deduplication**: URL matching, content fingerprinting, title similarity
- **Dual-Mode Scraping**: WebSearch/WebFetch (primary) + Playwright (fallback)
- **LLM-Powered Analysis**: Innovation, quality, credibility, relevance scoring
- **Beautiful Reports**: Professional HTML reports with embedded styling

##  Quick Start

```bash
# Install dependencies
cd scripts
npm install

# Run the skill
/digestpapers "autoresearch"
```

## 📋 Workflow

### Phase 1: Multi-Source Search
```bash
node scripts/auto-digest.mjs "autoresearch"
```
- Generates WebSearch queries for multiple sources
- Claude executes searches automatically
- Falls back to Playwright if WebSearch unavailable
- Saves results to `digests/temp/sources_*.json`

### Phase 2: Content Extraction
```bash
node scripts/auto-digest.mjs --phase 2
```
- Generates WebFetch queries for each URL
- Claude extracts content automatically
- Falls back to Playwright if WebFetch fails
- Saves content to `digests/temp/content_*.json`

### Phase 3: Merge & Deduplicate
```bash
node scripts/auto-digest.mjs --phase 3
node scripts/deduplicate.mjs
```
- Merges search results with extracted content
- Removes duplicates using:
  - **URL matching**: Exact URL comparison
  - **Content fingerprinting**: MD5 hash of title+authors+abstract
  - **Title similarity**: Levenshtein distance (threshold: 0.85)
- Updates `digests/history.json` with new items
- Saves to `digests/scraped-data.json`

### Phase 4: Claude Analysis
Claude reads `scraped-data.json` and:
- Filters items by innovation, quality, credibility, relevance
- Generates 2-3 sentence summaries for each item
- Saves analysis to `digests/analysis-result.json`

### Phase 5: Generate Reports
```bash
node scripts/generate-final-report.mjs
```
- Creates professional HTML report
- Includes key trends section
- Separate sections for papers/repos/articles
- Saves to `digests/digest-<topic>-<date>.html`

## Configuration

### Basic Usage
```bash
/digestpapers "machine learning"
/digestpapers "为我查找多智能体系统的文章"
```

### Advanced Options
```bash
# Custom source and count
/digestpapers "AI agents" --source arxiv --count 10

# With deduplication settings
/digestpapers "autoresearch" --similarity 0.9 --recent-only 7

# Custom quality thresholds
/digestpapers "ML research" --min_innovation 0.7 --min_quality 0.6
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `topic` | string | required | Research topic |
| `source` | string | "all" | Data source: all, arxiv, github, blogs, conferences, pwc |
| `count` | integer | 20 | Items per source (max 50) |
| `phase` | integer | 1 | Execution phase (1-3) |
| `format` | string | "html" | Output format: html, markdown, json |
| `deduplicate` | boolean | true | Enable deduplication |
| `recent_only` | integer | 0 | Only keep items from last N days (0=disabled) |
| `similarity` | float | 0.85 | Title similarity threshold (0-1) |
| `min_innovation` | float | 0.5 | Min innovation score |
| `min_quality` | float | 0.5 | Min quality score |
| `min_relevance` | float | 0.5 | Min relevance score |

## Directory Structure

```
digestpapers/
├── SKILL.md                     # Skill documentation
├── skill.json                   # Skill configuration
├── README.md                    # This file
├── scripts/
│   ├── auto-digest.mjs          # Main script
│   ├── deduplicate.mjs          # Deduplication module
│   ├── generate-final-report.mjs # HTML report generator
│   ├── config.json              # Configuration
│   └── sources/
│       ├── websearch-adapter.mjs  # WebSearch adapter (primary)
│       ├── webfetch-adapter.mjs   # WebFetch adapter (primary)
│       └── playwright-adapter.mjs # Playwright adapter (fallback)
└── digests/                     # Output directory
    ├── temp/                    # Temporary files
    │   ├── sources_*.json       # Search results
    │   └── content_*.json       # Extracted content
    ├── scraped-data.json        # Merged & deduplicated data
    ├── analysis-result.json     # Claude's analysis
    ├── history.json             # Deduplication history
    └── digest-*.html            # Final reports
```

## 🔧 Deduplication

The deduplication module prevents duplicate content using three strategies:

### 1. URL Matching
Exact URL comparison - fastest method

### 2. Content Fingerprinting
MD5 hash of `title + authors + abstract (first 100 chars)`

### 3. Title Similarity
Levenshtein distance with configurable threshold (default 0.85)

### Usage
```bash
# Standard deduplication
node scripts/deduplicate.mjs

# Custom settings
node scripts/deduplicate.mjs --days 30 --similarity 0.85 --recent-only 7

# Options:
#   --days <n>         Keep history for N days (default: 30)
#   --similarity <n>   Title similarity threshold 0-1 (default: 0.85)
#   --recent-only <n>  Only keep items from last N days
```

## Report Output

### HTML Report
- Professional white theme with responsive design
- Embedded CSS styling
- Key trends section (auto-extracted)
- Separate sections for papers/repos/articles
- Direct links to all sources

### JSON Output
```json
{
  "generated_at": "2026-04-22T...",
  "topic": "autoresearch",
  "total_scraped": 334,
  "filtered_count": 20,
  "papers": [
    {
      "title": "Paper Title",
      "authors": "Author Name",
      "abstract": "...",
      "link": "https://...",
      "summary": "2-3 sentence summary...",
      "source": "arXiv AI Papers",
      "fingerprint": "a1b2c3d4...",
      "seen_at": "2026-04-22T00:00:00Z",
      "scores": {
        "innovation": 0.9,
        "quality": 0.85,
        "team_credibility": 0.75,
        "relevance": 0.95
      }
    }
  ]
}
```

## Troubleshooting

### WebSearch/WebFetch unavailable?
The skill automatically falls back to Playwright scraping.

### Duplicates still appearing?
Adjust similarity threshold:
```bash
node scripts/deduplicate.mjs --similarity 0.9  # Stricter
```

### Too many old papers?
Filter by recency:
```bash
/digestpapers "topic" --recent-only 7  # Last 7 days only
```

### Need more papers?
Increase count per source:
```bash
/digestpapers "topic" --count 50  # Max 50 per source
```

## Requirements

- Node.js >= 18.0.0
- cheerio (for HTML parsing)
- playwright (optional, for fallback scraping)

```bash
cd scripts
npm install
```

## License

MIT

## Contributing

This skill integrates:
- Multi-source web scraping (WebSearch/WebFetch + Playwright)
- Smart deduplication (URL + fingerprint + similarity)
- LLM-powered analysis (Claude)
- Professional report generation

For issues or improvements, check the SKILL.md documentation.
