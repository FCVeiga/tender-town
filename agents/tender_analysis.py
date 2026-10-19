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
    dedupe = lambda xs: [x for x in dict.fromkeys(xs) if len(x) > 15]
    return {"selection": dedupe(selection), "tenderer": dedupe(tenderer), "award": award}


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
