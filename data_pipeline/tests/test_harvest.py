"""Tests for the Openbeelden OAI-PMH harvester parser."""

from __future__ import annotations

import textwrap

from lxml import etree

from data_pipeline.harvest import NS, _extract_year, _parse_record, _resolve_thumbnail

SAMPLE_RECORD = textwrap.dedent(
    """\
    <record xmlns="http://www.openarchives.org/OAI/2.0/">
      <header>
        <identifier>oai:openimages.eu:1480524</identifier>
        <datestamp>2024-12-14T06:00:38Z</datestamp>
        <setSpec>beeldengeluid</setSpec>
      </header>
      <metadata>
        <oai_oi:oi xmlns:oai_oi="http://www.openbeelden.nl/feeds/oai/"
                   xmlns:oi="http://www.openbeelden.nl/oai/">
          <oi:title xml:lang="nl">Opening nieuwe passage-arm in Den Haag</oi:title>
          <oi:creator xml:lang="nl">Haghefilm / Willy Mullens</oi:creator>
          <oi:subject xml:lang="nl">bioscopen</oi:subject>
          <oi:subject xml:lang="nl">openingen</oi:subject>
          <oi:description xml:lang="nl">Kort filmfragment over de opening.</oi:description>
          <oi:abstract xml:lang="nl">00.01 Gevel. 00.45 EINDE.</oi:abstract>
          <oi:publisher xml:lang="nl">Nederlands Instituut voor Beeld en Geluid</oi:publisher>
          <oi:date>1929-11-01</oi:date>
          <oi:type>Moving Image</oi:type>
          <oi:extent>PT46S</oi:extent>
          <oi:medium format="hd">https://www.openbeelden.nl/files/foo.mp4</oi:medium>
          <oi:medium format="thumbnail">/images/1483704/Opening.png</oi:medium>
          <oi:identifier xml:lang="nl">PGM25775</oi:identifier>
          <oi:attributionName xml:lang="nl">Willy Mullens</oi:attributionName>
          <oi:attributionURL>/media/1480524</oi:attributionURL>
          <oi:license>https://creativecommons.org/publicdomain/mark/1.0/</oi:license>
        </oai_oi:oi>
      </metadata>
    </record>
    """
)


def test_parse_record_extracts_core_fields() -> None:
    elem = etree.fromstring(SAMPLE_RECORD.encode("utf-8"))
    record = _parse_record(elem)
    assert record is not None
    assert record.identifier == "oai:openimages.eu:1480524"
    assert record.title == "Opening nieuwe passage-arm in Den Haag"
    assert record.set_spec == "beeldengeluid"
    assert record.date == "1929-11-01"
    assert record.year == 1929
    assert record.type_ == "Moving Image"
    assert record.subject == ["bioscopen", "openingen"]
    assert record.source_url == "https://www.openbeelden.nl/media/1480524"
    assert record.attribution_url == "https://www.openbeelden.nl/media/1480524"
    assert record.archive_id == "PGM25775"
    assert record.thumbnail_url == "https://www.openbeelden.nl/images/1483704/Opening.png"
    assert len(record.media) == 2
    assert any(m["format"] == "hd" for m in record.media)
    assert record.license.startswith("https://creativecommons.org/")


def test_parse_record_returns_none_for_deleted() -> None:
    deleted = textwrap.dedent(
        """\
        <record xmlns="http://www.openarchives.org/OAI/2.0/">
          <header status="deleted">
            <identifier>oai:openimages.eu:gone</identifier>
            <datestamp>2024-01-01T00:00:00Z</datestamp>
          </header>
        </record>
        """
    )
    elem = etree.fromstring(deleted.encode("utf-8"))
    assert _parse_record(elem) is None


def test_extract_year_handles_edge_cases() -> None:
    assert _extract_year("") is None
    assert _extract_year("not-a-date") is None
    assert _extract_year("1929-11-01") == 1929
    assert _extract_year("2023") == 2023


def test_resolve_thumbnail_variants() -> None:
    assert _resolve_thumbnail("/images/foo.png") == "https://www.openbeelden.nl/images/foo.png"
    assert _resolve_thumbnail("https://x.com/a.png") == "https://x.com/a.png"
    assert _resolve_thumbnail("images/foo.png") == "https://www.openbeelden.nl/images/foo.png"


def test_namespace_constants_are_defined() -> None:
    # guard rail — if these drift, all parsing breaks silently
    assert "oai" in NS
    assert "oi" in NS
    assert NS["oai_oi"] == "http://www.openbeelden.nl/feeds/oai/"
