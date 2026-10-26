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


# Words that show up in every notice. Sharing them does not make two purchases
# the same. A scheme name that is rare in that country does.
_BOILER = _STOP | {
    "software", "services", "service", "development", "framework", "agreement",
    "information", "systems", "system", "package", "packages", "custom", "support",
    "maintenance", "application", "applications", "national", "digital", "public",
    "infrastructure", "platform", "solutions", "solution", "implementation",
    "water", "waste", "energy", "solar", "plant", "plants", "electric", "buses",
    "million", "billion", "contract", "project", "projects", "planned", "consult",
    "consultation", "funding", "grant", "programme", "program", "market",
    "building", "renovation", "upgrade", "cloud", "government", "federal",
    "imaging", "research", "health", "healthcare", "medical", "clinical",
}


# Country and place names. Two notices in one city are not one purchase.
_PLACES = _COUNTRIES | {
    "bangladesh", "swiss", "switzerland", "california", "arizona", "sofia",
    "philippines", "samoa", "cape", "town", "india", "paris", "london", "berlin",
    "spain", "portugal", "united", "states", "africa", "brazil",
}


def content_tokens(title: str) -> set:
    return {word for word in tokens(title) if word not in _BOILER and word not in _PLACES and len(word) >= 5}


def capitalised_tokens(title: str) -> set:
    """Names written with a capital, so a scheme name matches and a common noun does not."""
    return {word.lower() for word in re.findall(r"\b[A-Z][A-Za-z0-9]{3,}", title or "")
            if word.lower() not in _BOILER and word.lower() not in _PLACES
            and word.lower() not in _STOP and len(word) >= 4}


def capitalised_bigrams(title: str) -> set:
    """Adjacent capitalised words, so 'Government Cloud' matches and 'water plant' does not."""
    words = [word.lower() for word in re.findall(r"\b[A-Z][A-Za-z0-9]{3,}", title or "")]
    return {(left, right) for left, right in zip(words, words[1:])
            if left not in _PLACES and right not in _PLACES}


def content_stems(title: str) -> set:
    """Word stems, so 'charging' and 'charger' meet. Places and boilerplate are left out."""
    text = (title or "").lower().replace("-", " ")
    stems = set()
    for word in re.findall(r"[a-z0-9]{4,}", text):
        if word in _BOILER or word in _PLACES or word in _STOP:
            continue
        for suffix in ("ing", "ers", "er", "ed", "es"):
            if word.endswith(suffix) and len(word) - len(suffix) >= 4:
                word = word[: -len(suffix)]
                break
        if len(word) >= 4:
            stems.add(word)
    return stems


def _authority_key(authority: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", (authority or "").lower())[:6])


def _national_id(title: str) -> bool:
    text = (title or "").lower()
    return "national" in text and "digital" in text and bool(re.search(r"\bid\b|identity", text))


def conflicting_references(ref_a: str, ref_b: str) -> bool:
    """Two different TED procedures are two purchases, whatever the titles do."""
    left, right = (ref_a or ""), (ref_b or "")
    if left.startswith("TED:") and right.startswith("TED:"):
        return _normalise(left) != _normalise(right)
    return False


def same_notice(title_a: str, title_b: str, country_a: str, country_b: str,
                ref_a: str = None, ref_b: str = None,
                authority_a: str = "", authority_b: str = "",
                rare_tokens: set = None, rare_bigrams: set = None,
                rare_stems: set = None) -> bool:
    """True when two active cards are one purchase described twice.

    Different TED procedure ids never match. A TED notice and a write-up only
    match through the title or the story checks above, not a shared programme
    name: one programme can have several contracts. A shared scheme name, a
    shared two-word name, or the same buyer's national digital ID do match.
    """
    if conflicting_references(ref_a, ref_b):
        return False
    if same_procurement(title_a, title_b, ref_a, ref_b) or same_story(title_a, title_b):
        return True
    if (country_a or "") != (country_b or ""):
        return False
    one_ted = (ref_a or "").startswith("TED:") ^ (ref_b or "").startswith("TED:")
    if not one_ted:
        shared = capitalised_tokens(title_a) & capitalised_tokens(title_b)
        if rare_tokens is not None:
            shared &= rare_tokens
        if shared:
            return True
        phrases = capitalised_bigrams(title_a) & capitalised_bigrams(title_b)
        if rare_bigrams is not None:
            phrases &= rare_bigrams
        if phrases:
            return True
        shared_stems = content_stems(title_a) & content_stems(title_b)
        if rare_stems is not None:
            shared_stems &= rare_stems
        if len(shared_stems) >= 2:
            return True
    left_auth, right_auth = _authority_key(authority_a), _authority_key(authority_b)
    if _national_id(title_a) and _national_id(title_b) and left_auth and left_auth == right_auth:
        return True
    return False
