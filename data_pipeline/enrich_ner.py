"""
Run spaCy NL NER over harvested records and add an ``entities`` field.

Emits a new JSONL with per-document entity lists of the form
``[{"text": "Den Haag", "label": "GPE"}, ...]``.

Supports the four interesting labels: PERSON, GPE, ORG, LOC.

Example
-------
    python -m data_pipeline.enrich_ner \\
        --input data/raw/openbeelden-20260422.jsonl \\
        --output data/enriched/openbeelden-20260422.jsonl
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from tqdm import tqdm

log = logging.getLogger("enrich_ner")

KEEP_LABELS = {"PERSON", "PER", "GPE", "LOC", "ORG"}


def _extract_entities(nlp: object, text: str) -> list[dict[str, str]]:
    if not text:
        return []
    doc = nlp(text)  # type: ignore[operator]
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, str]] = []
    for ent in doc.ents:  # type: ignore[attr-defined]
        label = ent.label_
        if label not in KEEP_LABELS:
            continue
        # Normalize PER → PERSON for display consistency
        norm_label = "PERSON" if label == "PER" else label
        text_norm = ent.text.strip()
        if not text_norm or (text_norm, norm_label) in seen:
            continue
        seen.add((text_norm, norm_label))
        out.append({"text": text_norm, "label": norm_label})
    return out


def _load_spacy(model: str) -> object:
    import spacy  # type: ignore[import-not-found]

    try:
        return spacy.load(model, disable=["parser", "lemmatizer"])
    except OSError as e:
        log.error(
            "spaCy model %s not found. Install with: python -m spacy download %s",
            model,
            model,
        )
        raise SystemExit(2) from e


def enrich(input_path: Path, output_path: Path, model: str) -> tuple[int, int]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    nlp = _load_spacy(model)

    docs_written, entities_total = 0, 0
    with (
        input_path.open("r", encoding="utf-8") as fin,
        output_path.open("w", encoding="utf-8") as fout,
    ):
        for line in tqdm(fin, desc="ner"):
            if not line.strip():
                continue
            rec = json.loads(line)
            combined = " ".join(
                str(x) for x in (rec.get("title"), rec.get("description"), rec.get("abstract")) if x
            )
            entities = _extract_entities(nlp, combined)
            rec["entities"] = entities
            entities_total += len(entities)
            fout.write(json.dumps(rec, ensure_ascii=False) + "\n")
            docs_written += 1

    return docs_written, entities_total


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default="nl_core_news_md")
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    docs, ents = enrich(args.input, args.output, args.model)
    log.info("wrote %d docs with %d entities → %s", docs, ents, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
