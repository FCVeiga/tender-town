from __future__ import annotations

"""
Award criteria for the opportunity pages, read from the notice XML.

The daily job stores the weights (price, quality, cost) and does not call a
model. The summary and the requirement list are written on the site, when
someone runs Tender Evaluation (webapp/lib/tenderAnalysis.ts).
"""
import json
import re

from sqlalchemy import text


def _clean(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def notice_criteria(xml: str) -> dict:
    """Selection criteria, tenderer requirements and award criteria from eForms XML."""
    selection = [_clean(d) for b in re.findall(r"<efac:SelectionCriteria>(.*?)</efac:SelectionCriteria>", xml, re.S)
                 for d in re.findall(r"<cbc:Description[^>]*>(.*?)</cbc:Description>", b, re.S)]
    tenderer = [_clean(d) for b in re.findall(r"<cac:SpecificTendererRequirement>(.*?)</cac:SpecificTendererRequirement>", xml, re.S)
                for d in re.findall(r"<cbc:Description[^>]*>(.*?)</cbc:Description>", b, re.S)]
    award = []
    for b in re.findall(r"<cac:SubordinateAwardingCriterion>(.*?)</cac:SubordinateAwardingCriterion>", xml, re.S):
        kind = re.search(r"<cbc:AwardingCriterionTypeCode[^>]*>([^<]+)<", b)
        weight = re.search(r"<efbc:ParameterNumeric>([\d.]+)<", b)
        name = re.search(r"<cbc:Name[^>]*>(.*?)</cbc:Name>", b, re.S)
        desc = re.search(r"<cbc:Description[^>]*>(.*?)</cbc:Description>", b, re.S)
        award.append({"type": kind.group(1) if kind else None, "weight": float(weight.group(1)) if weight else None,
                      "name": _clean(name.group(1)) if name else None, "description": _clean(desc.group(1)) if desc else None})
    if not award:
        award = expressed_award(xml)
    dedupe = lambda xs: [x for x in dict.fromkeys(xs) if len(x) > 15]
    return {"selection": dedupe(selection), "tenderer": dedupe(tenderer), "award": award}


_WEIGHT = re.compile(r"([^:;]{2,80}?)\s+(\d+(?:[.,]\d+)?)\s*%")
_PRICE = re.compile(r"\b(prix|price|preis|prezzo|precio|cena|hind)\b", re.I)
_COST = re.compile(r"\b(co[uû]t|cost|kosten|costo|coste)\b", re.I)


def expressed_award(xml: str) -> list:
    """Award weights written as a sentence, when the notice has no structured criteria.

    French notices often put 'prix 50 % ; valeur technique 30 %' in
    CalculationExpression, once per lot, instead of SubordinateAwardingCriterion.
    """
    import html as html_lib
    award = []
    lots = re.findall(r"<cac:ProcurementProjectLot\b.*?</cac:ProcurementProjectLot>", xml or "", re.S)
    for block in lots or [xml or ""]:
        names = [_clean(n) for n in re.findall(r"<cbc:Name\b[^>]*>(.*?)</cbc:Name>", block, re.S)]
        lot = next((n for n in names if " " in n), "")
        for raw in re.findall(r"<cbc:CalculationExpression\b[^>]*>(.*?)</cbc:CalculationExpression>", block, re.S):
            text = _clean(html_lib.unescape(raw))
            if len(text) < 15:
                continue
            rows = []
            for label, num in _WEIGHT.findall(text):
                label = re.split(r"[:;]", label)[-1].strip(" -–—;,.")
                if len(label) < 2 or len(label) > 80:
                    continue
                kind = "price" if _PRICE.search(label) else "cost" if _COST.search(label) else "quality"
                rows.append({"type": kind, "weight": float(num.replace(",", ".")),
                             "name": f"{lot} — {label}" if lot else label, "description": text})
            award.extend(rows or [{"type": None, "weight": None, "name": lot or "Award criteria", "description": text}])
    return award


def _same_weight(left, right) -> bool:
    if left is None or right is None:
        return left is None and right is None
    try:
        return abs(float(left) - float(right)) < 0.001
    except (TypeError, ValueError):
        return False


def store_award_criteria(session, opportunity_id: str, award: list) -> int:
    """Replace the opportunity's award criteria with the notice's.

    English names written by a Tender Evaluation stay, matched on type,
    weight and the notice name.
    """
    if not award:
        return 0
    previous = []
    for row in session.execute(text("select weight, subcriteria from award_criteria where opportunity_id = :o"),
                               {"o": opportunity_id}).fetchall():
        sub = row.subcriteria
        if isinstance(sub, str):
            try:
                sub = json.loads(sub)
            except json.JSONDecodeError:
                sub = None
        if isinstance(sub, dict) and (sub.get("name_en") or sub.get("description_en")):
            previous.append((row.weight, sub))
    session.execute(text("delete from award_criteria where opportunity_id = :o"), {"o": opportunity_id})
    for a in award:
        label = {"price": "Price", "cost": "Cost", "quality": "Quality"}.get(a["type"] or "", (a["type"] or "Criterion").title())
        payload = {"type": a["type"], "name": a["name"], "description": a["description"]}
        for weight, sub in previous:
            if sub.get("type") == a["type"] and _same_weight(weight, a["weight"]) and sub.get("name") == a["name"]:
                if sub.get("name_en"):
                    payload["name_en"] = sub["name_en"]
                if sub.get("description_en"):
                    payload["description_en"] = sub["description_en"]
                break
        session.execute(text("insert into award_criteria (opportunity_id, criterion, weight, subcriteria) values (:o, :c, :w, cast(:s as jsonb))"),
                        {"o": opportunity_id, "c": label, "w": a["weight"], "s": json.dumps(payload)})
    session.commit()
    return len(award)


def backfill_expressed_award(session) -> dict:
    """Store award weights for TED notices that had none, including sentence-form criteria."""
    from agents.tender_documents import _notice_xml
    rows = session.execute(text("""select opportunity_id, official_url from opportunities
            where official_url like '%ted.europa.eu%'
              and status in ('OPEN', 'SIGNAL')
              and not exists (select 1 from award_criteria a where a.opportunity_id = opportunities.opportunity_id)""")).fetchall()
    stats = {"checked": 0, "stored": 0, "rows": 0, "errors": 0}
    for o in rows:
        pub = (o.official_url or "").rstrip("/").split("/")[-1]
        if not pub or pub in ("detail", "xml", "pdf"):
            continue
        stats["checked"] += 1
        try:
            award = notice_criteria(_notice_xml(pub))["award"]
        except Exception:
            session.rollback()
            stats["errors"] += 1
            continue
        if not award:
            continue
        before = session.execute(text("select count(*) from award_criteria where opportunity_id = :o"),
                                 {"o": o.opportunity_id}).scalar()
        if before:
            continue
        written = store_award_criteria(session, o.opportunity_id, award)
        after = session.execute(text("select count(*) from award_criteria where opportunity_id = :o"),
                                {"o": o.opportunity_id}).scalar()
        if after != written or before != 0:
            raise RuntimeError(f"award backfill for {o.opportunity_id} wrote {after}, expected {written}")
        stats["stored"] += 1
        stats["rows"] += written
    return stats


def clear_unread_summaries(session) -> int:
    """Drop analyses that reported the notice body as missing. The page then shows the pipeline summary."""
    rows = session.execute(text("""select opportunity_id from opportunities
            where tender_summary ilike '%does not include the content of the notice%'
               or tender_summary ilike '%sources do not state what is being procured%'
               or tender_summary ilike '%document texts were not supplied%'
               or tender_summary ilike '%tender documents were not supplied%'
               or tender_summary ilike '%not among the files read%'""")).fetchall()
    ids = [r.opportunity_id for r in rows]
    if not ids:
        return 0
    for opp in ids:
        session.execute(text("""update opportunities set tender_summary = null, tender_analysed_at = null
                                where opportunity_id = :o"""), {"o": opp})
    left = session.execute(text("""select count(*) from opportunities
            where tender_summary ilike '%does not include the content of the notice%'
               or tender_summary ilike '%sources do not state what is being procured%'
               or tender_summary ilike '%document texts were not supplied%'
               or tender_summary ilike '%tender documents were not supplied%'
               or tender_summary ilike '%not among the files read%'""")).scalar()
    if left != 0 or len(ids) == 0:
        session.rollback()
        raise RuntimeError(f"unread summaries left {left} of {len(ids)}")
    session.commit()
    return len(ids)


def analyse_tenders(session, errors: list) -> dict:
    """Award criteria from each TED notice's XML."""
    import requests
    opps = session.execute(text("""select opportunity_id, official_url, reference from opportunities
            where official_url like '%ted.europa.eu%' or reference like 'TED:%'""")).fetchall()
    done = {"award": 0}
    for o in opps:
        pub = o.official_url.rstrip("/").split("/")[-1] if "ted.europa.eu" in (o.official_url or "") else None
        if not pub and (o.reference or "").startswith("TED:"):
            from agents.tender_documents import _procedure_notices
            notices = _procedure_notices(o.reference[4:])
            pub = notices[-1]["publication-number"] if notices else None
        if not pub:
            continue
        try:
            xml = requests.get(f"https://ted.europa.eu/en/notice/{pub}/xml", timeout=40,
                               headers={"User-Agent": "Mozilla/5.0 TenderTown/1.0"}).text
        except Exception as e:
            errors.append(f"tender analysis {o.opportunity_id}: {e}"[:200]); continue
        done["award"] += store_award_criteria(session, o.opportunity_id, notice_criteria(xml)["award"])
    return done
