---
name: digestpapers
description: A standardized skill for searching, analyzing, and generating weekly reports for research papers and GitHub repositories.
---


## Usage

```
/digestpapers <topic>
```

The skill runs in **5 phases** with WebSearch/WebFetch integration (primary) and Playwright fallback:

```bash
# Phase 1: Generate WebSearch queries
node scripts/auto-digest.mjs "autoresearch"

# [Claude executes WebSearch queries automatically]

# Phase 2: Generate WebFetch queries
node scripts/auto-digest.mjs --phase 2

# [Claude executes WebFetch queries automatically]

# Phase 3: Merge content and deduplicate
node scripts/auto-digest.mjs --phase 3
node scripts/deduplicate.mjs

# Phase 4: Claude analyzes and filters items
# [Claude reads digests/scraped-data.json and writes digests/analysis-result.json]

# Phase 5: Generate reports
node scripts/generate-final-report.mjs      # HTML report
```

### Examples

```bash
# Search for papers on autoresearch
/digestpapers "autoresearch"

# Search for harness engineering (all sources)
/digestpapers "harness engineering" --source all --count 20

# Search Chinese topic
/digestpapers "为我查找多智能体系统的文章"

# Search with custom thresholds
/digestpapers "AI agents" --min_innovation 0.7 --min_quality 0.6

# With deduplication settings
/digestpapers "autoresearch" --deduplicate --recent-only 7
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `topic` | string | Yes | - | Research topic (e.g., "autoresearch", "machine learning") |
| `source` | string | No | "all" | Data source: "all", "arxiv", "github", "blogs", "conferences", "pwc" |
| `count` | integer | No | 20 | Number of items per source (max 50) |
| `phase` | integer | No | 1 | Execution phase: 1 (search), 2 (aggregate), 3 (merge) |
| `format` | string | No | "html" | Output format: "html", "markdown", or "json" |
| `min_innovation` | float | No | 0.5 | Minimum innovation score (0-1) |
| `min_quality` | float | No | 0.5 | Minimum quality score (0-1) |
| `min_relevance` | float | No | 0.5 | Minimum relevance score (0-1) |
| `deduplicate` | boolean | No | true | Enable deduplication against history |
| `recent_only` | integer | No | 0 | Only keep items from last N days (0 = disabled) |
| `similarity` | float | No | 0.95 | Title similarity threshold for deduplication |

> **Multi-Source Architecture with Fallback**
> - **Primary Method**: WebSearch/WebFetch for fast, flexible data collection
> - **Fallback Method**: Playwright for JavaScript-rendered content when needed
> - **Data Sources**: arXiv, GitHub, Papers With Code, Tech Blogs (Medium, dev.to), Conferences (NeurIPS, ICML, etc.)

## How It Works

### Phase 1: Multi-Source Search (WebSearch Primary)
1. **Extract Topic** - Parse natural language query to identify research topic
2. **Generate WebSearch Queries** - Create search queries for multiple sources:
   - **arXiv**: Academic papers (`site:arxiv.org "topic" 2026`)
   - **GitHub**: Trending repos (`site:github.com "topic" stars:>100`)
   - **Papers With Code**: Papers with implementations (`site:paperswithcode.com "topic"`)
   - **Tech Blogs**: Medium, dev.to, TowardsDataScience
   - **Conferences**: NeurIPS, ICML, ICLR, CVPR, ACL
3. **Execute WebSearch** - Claude automatically executes search queries
4. **Fallback to Playwright** - If WebSearch unavailable, use Playwright scraper
5. **Save Search Results** - Store in `digests/temp/sources_*.json`

### Phase 2: Content Extraction (WebFetch Primary)
1. **Aggregate Search Results** - Read all `sources_*.json` files
2. **Generate WebFetch Queries** - Create content extraction queries for each URL:
   - **arXiv**: Extract title, authors, abstract, main content
   - **GitHub**: Extract README description and features
   - **Articles**: Extract title, author, summary, main content
3. **Execute WebFetch** - Claude automatically extracts content
4. **Fallback to Playwright** - If WebFetch fails, use Playwright content extraction
5. **Save Extracted Content** - Store in `digests/temp/content_*.json`

### Phase 3: Content Merging & Deduplication
1. **Merge Content** - Combine search results with fetched content
2. **Unify Data Structure** - Standardize all items to common format
3. **Save Merged Data** - Write to `digests/scraped-data.json`
4. **Run Deduplication** - Execute `deduplicate.mjs` to remove duplicates:
   - **URL Matching**: Skip items with duplicate URLs
   - **Content Fingerprinting**: MD5 hash of title + authors + abstract
   - **Title Similarity**: Levenshtein distance >= 0.95 threshold
   - **Recency Filtering** (optional): Only keep items from last N days
5. **Update History** - Append new items to `digests/history.json`

### Phase 4: Claude Analysis (in conversation context)
1. **Load Data** - `Read digests/scraped-data.json`
2. **Filter & Rank** - Evaluate items across multiple dimensions:
   - **Innovation**: Novelty of approach, unique contributions
   - **Quality**: Methodological rigor, clarity
   - **Team Credibility**: Author/institution reputation
   - **Relevance**: Alignment with topic
3. **Generate Summaries** - Create 2-3 sentence summaries for each item
4. **Save Analysis** - `Write digests/analysis-result.json`

### Phase 5: Report Generation
1. **HTML Report** - Run `node scripts/generate-final-report.mjs`
   - Professional white theme with responsive design
   - Key trends section (dynamically extracted)
   - Separate sections for Papers/Repositories/Articles
2. **Markdown Report** (optional) - Run `node scripts/generate-markdown-report.mjs`
   - Clean, structured format for sharing
   - GitHub-flavored markdown

## Files

```
digestpapers/
├── SKILL.md                     # This file - main documentation
├── skill.json                   # Skill metadata and configuration
├── scripts/
│   ├── auto-digest.mjs          # Main script with multi-source support
│   ├── deduplicate.mjs          # Deduplication module
│   ├── generate-final-report.mjs  # HTML report generator
│   └── sources/
│       ├── websearch-adapter.mjs  # WebSearch query generator (primary)
│       ├── webfetch-adapter.mjs   # WebFetch content extractor (primary)
│       └── playwright-adapter.mjs # Playwright fallback scraper
└── digests/                     # Output directory
    ├── temp/                    # Temporary data (intermediate files)
    │   ├── sources_*.json       # WebSearch results
    │   └── content_*.json       # WebFetch extracted content
    ├── scraped-data.json        # Final merged & deduplicated data
    ├── analysis-result.json     # Claude's filtered results
    ├── history.json             # Deduplication history
    └── digest-*.html            # Final HTML report
```

## Deduplication

The deduplication module prevents duplicate content across daily digests by maintaining a history of seen items.

**Features:**
- **URL Matching**: Exact URL comparison
- **Content Fingerprinting**: MD5 hash of title + authors + abstract snippet
- **Title Similarity**: Levenshtein distance with configurable threshold (default 0.85)
- **Recency Filtering**: Optionally only keep items from last N days
- **History Management**: Automatically cleans up entries older than 30 days

**Usage:**
```bash
# Standard deduplication (after Phase 3)
node scripts/deduplicate.mjs

# Custom settings
node scripts/deduplicate.mjs --days 30 --similarity 0.85 --recent-only 7
```

## Output

### HTML Report (Default)
- Professional white theme with responsive design
- Key trends section (dynamically extracted from content)
- Separate sections for Papers/Repositories/Articles
- Direct links to all papers/repos
- Self-contained HTML file with embedded CSS styles

### JSON Data Structure
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

### Filtering Criteria
Items are filtered and ranked based on:
- **Innovation** (novelty of approach)
- **Quality** (methodological rigor)
- **Team Credibility** (author/institution reputation)
- **Relevance** (alignment with search topic)

Only items meeting minimum thresholds are included in the final report.

## Requirements

- Node.js >= 18.0.0
- cheerio (for HTML parsing)
- playwright (optional, for fallback scraping)

## Examples

| Query | Description |
|-------|-------------|
| `/digestpapers autoresearch` | Top 20 autoresearch papers + repos in HTML format (deduplicated) |
| `/digestpapers --source arxiv --count 10` | Top 10 arXiv papers only in HTML format |
| `/digestpapers "multi-agent systems" --format markdown` | Filtered results as Markdown |
| `/digestpapers "autoresearch" --recent-only 7` | Only items from last 7 days (deduplicated) |
| `/digestpapers "AI agents" --similarity 0.9` | Stricter deduplication (90% title similarity) |

## License

MIT
