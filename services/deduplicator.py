"""Canonical opportunity fingerprinting (spec section 42)."""
import hashlib
import re


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def fingerprint(country: str, authority: str, reference, title: str) -> str:
    if reference:
        key = f"{_normalise(country)}|{_normalise(reference)}"
    else:
        key = f"{_normalise(country)}|{_normalise(authority)}|{_normalise(title)}"
    return hashlib.sha256(key.encode()).hexdigest()[:20]


def likely_duplicate(a_reference, b_reference, a_title: str, b_title: str,
                      title_similarity_fn=None) -> bool:
    if a_reference and b_reference:
        return _normalise(a_reference) == _normalise(b_reference)
    if title_similarity_fn:
        return title_similarity_fn(a_title, b_title) > 0.85
    return _normalise(a_title) == _normalise(b_title)


# Words that describe the procedure, not what is being bought. Kept out of the
# overlap so "tender for a wallet" still matches "procurement of a wallet".
_STOP = {
    "a", "an", "the", "of", "for", "and", "or", "to", "in", "on", "with", "its", "from", "by",
    "at", "as", "is", "are", "be", "this", "that", "into", "over", "about", "how", "what", "who",
    "when", "where", "which", "will", "has", "have", "been", "was", "were", "their", "they",
    "tender", "implementation", "procurement", "services", "fully", "compliant", "supporting",
    "seeks", "partner", "build", "new", "national", "must", "offer", "under", "after", "before",
    "public", "launches", "launch", "launched", "unveils", "unveiled",
}
# A word that says WHICH contract this is. Two wallet tenders that name different
# ones (an adapter, a pentest, a certification) are not the same procurement.
_OBJECTS = (
    "adapter", "penetration", "pentest", "certification", "kiosk", "biometric",
    "framework", "backend", "ecosystem", "tooling", "consultation", "bpo", "contact",
)
_COUNTRIES = {
    "austria", "belgium", "bulgaria", "croatia", "cyprus", "czechia", "czech", "denmark",
    "estonia", "finland", "france", "germany", "greece", "hungary", "ireland", "italy",
    "latvia", "lithuania", "luxembourg", "malta", "netherlands", "poland", "portugal",
    "romania", "slovakia", "slovenia", "spain", "sweden", "norway", "iceland",
    "moldova", "ukraine", "malawi", "kingdom",
}


def _prep(title: str) -> str:
    t = (title or "").lower()
    kept = " ".join(re.findall(r"\(([a-z0-9-]{3,})\)", t))
    t = re.sub(r"\([^)]*\)", " ", t) + " " + kept
    return t.replace("eudiw", "eudi").replace("d-you", "dyou").replace("d you", "dyou")


def tokens(title: str) -> set:
    words = {w for w in re.findall(r"[a-z0-9]{3,}", _prep(title)) if w not in _STOP}
    if "eudi" not in words and "identity" in words and ("digital" in words or "european" in words):
        words.add("eudi")
    return words


def headline_key(title: str) -> str:
    """The story, ignoring punctuation, so a syndicated headline matches across sites."""
    return re.sub(r"[^a-z0-9]+", " ", _prep(title)).strip()


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _objects(words: set) -> set:
    return {o for o in _OBJECTS if o in words}


def procurement_score(title_a: str, title_b: str, ref_a: str = None, ref_b: str = None) -> float:
    """How sure we are that two records are one purchase. 0 means they are not.

    Two TED notices with different procedure references never match. Two titles
    that name different objects (an adapter and a penetration test, a tooling
    contract and a contact centre) never match, even in the same country.
    """
    if ref_a and ref_b and _normalise(ref_a) != _normalise(ref_b):
        return 0.0
    ta, tb = tokens(title_a), tokens(title_b)
    oa, ob = _objects(ta), _objects(tb)
    if oa and ob and not (oa & ob):
        return 0.0
    score = _jaccard(ta, tb)
    if score >= 0.55:
        return score
    shared = ta & tb
    wallet = "wallet" in shared and ("eudi" in shared or "dyou" in shared or "identity" in shared)
    return score if wallet and score >= 0.22 else 0.0


def same_procurement(title_a: str, title_b: str, ref_a: str = None, ref_b: str = None) -> bool:
    """True when two records are the same purchase described twice (the notice
    and a write-up of it), not two different purchases in one country."""
    return procurement_score(title_a, title_b, ref_a, ref_b) > 0


def same_story(title_a: str, title_b: str) -> bool:
    """True when two articles are one event: the same headline, or the same
    named product. A roundup that name-checks several countries stays separate."""
    if not title_a or not title_b:
        return False
    if headline_key(title_a) == headline_key(title_b):
        return True
    if _roundup(title_a) or _roundup(title_b):
        return False
    ta, tb = tokens(title_a), tokens(title_b)
    if "dyou" in ta and "dyou" in tb:
        return True
    # "Germany to launch its digital ID app in 2027" is the d-you launch
    # even when the write-up never prints the product name.
    if ("dyou" in ta) ^ ("dyou" in tb):
        other = tb if "dyou" in ta else ta
        years = {w for w in (ta | tb) if w.isdigit() and len(w) == 4}
        return "germany" in other and years and bool(years & other) and bool(other & {"app", "wallet", "smartphone", "smartphones"})
    return False


def _roundup(title: str) -> bool:
    return len(tokens(title) & _COUNTRIES) >= 2
