# Data & Ethics

## Data source

All records in this demo are harvested from [Openbeelden](https://www.openbeelden.nl/),
the open-access platform operated by the Netherlands Institute for Sound & Vision.
Openbeelden items are published under Creative Commons licenses; the original
license per record is preserved in the `rights` field and shown in the UI and
via the "source" link back to Openbeelden.

- OAI-PMH endpoint: `https://www.openbeelden.nl/feeds/oai/`
- Metadata format used: `oai_oi` (OpenBeelden-specific, richer than Dublin Core)
- Harvest cap: 1,500 records for the demo. The harvester respects the 100-items
  per-page pagination and uses exponential backoff on errors.

When running the harvester, please note Openbeelden's advice against full
database dumps. This demo deliberately limits its footprint.

## Attribution

Each result in the UI links back to its original Openbeelden record. Attribution
strings (`oi:attributionName`, `oi:attributionUrl`) are preserved where
available and surfaced in the detail drawer.

## Responsible-AI notes on the LLM panel

The LLM panel provides two features:

1. **Query expansion** — the model is asked to suggest alternative
   phrasings of the user's query. The user must actively click one to apply it.
2. **Result summarization** — the model is asked to summarize the
   top-10 retrieved descriptions. The prompt constrains the model to cite every
   claim with a numbered reference back to a result card, so the user can
   verify. No generation happens without retrieved context.

The LLM panel is clearly marked as "experimental" in the UI and defaults to a
local open-source model (`qwen2.5:7b-instruct` via Ollama) so researchers can
run it offline without sending queries to a third party. Users may switch to a
smaller model (e.g. `llama3.2:3b-instruct`) for CPU laptops, or to any
OpenAI-compatible API via the `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY`
env vars.

The demo does not train, fine-tune, or retain any user query data. All
interaction happens locally against the indexed sample.
