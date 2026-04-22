# BeeldenSearch

A compact search-and-discovery demo over Dutch audio-visual heritage data from
[Openbeelden](https://www.openbeelden.nl/) (Sound & Vision's open archive),
inspired by the CLARIAH
[Media Suite – Single Search](https://mediasuite.clariah.nl/tool/single-search)
tool, with extensions for multimodal retrieval, entity networks, and open-source
LLM-assisted exploration.

Built as a proof-of-concept for the **Research Engineer – Multimodal Media
Analytical Toolbox** role at ASCoR, University of Amsterdam.

## What's inside

- **Lexical search** over ~1,500 harvested Openbeelden records — boolean,
  wildcards, phrase, field-cluster queries. Powered by OpenSearch.
- **Faceted filtering** — media type, date, creator, subject, rights.
- **Timeline + term charts** — document frequency over time, term distribution.
- **Multimodal (CLIP) cross-modal retrieval** — natural-language → image
  thumbnails, "more like this" image search.
- **Entity co-occurrence network** — spaCy NL NER + interactive force graph.
- **LLM panel** — query expansion and result summarization via an open-source
  model (Ollama / llama3.2 by default, switchable via `litellm`).

## Architecture

See [DESIGN.md](DESIGN.md) for the detailed design document.

## Quick start

```bash
# 1. Harvest data (uses Openbeelden OAI-PMH — respect their rate limits)
pip install -e ".[dev]"
python -m data_pipeline.harvest --limit 1500

# 2. Start OpenSearch + backend + frontend + Ollama
docker compose up -d

# 3. Enrich + index
python -m data_pipeline.download_thumbnails
python -m data_pipeline.enrich_ner
python -m data_pipeline.embed_clip
python -m data_pipeline.index_opensearch

# 4. Open the UI
open http://localhost:3000
```

## Development

```bash
# Lint, typecheck, test
ruff check .
ruff format --check .
mypy backend data_pipeline
pytest
```

## Data & ethics

All harvested data is CC-licensed from Openbeelden. See
[DATA_ETHICS.md](DATA_ETHICS.md) for attribution, licensing, and responsible-AI
notes about the LLM features.
