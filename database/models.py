"""
SQLAlchemy models for the EUDI Wallet Global Opportunity Radar.

Implements the entities listed in spec section 59:
sources, organisations, countries, queries, candidates, opportunities,
documents, requirements, team_requirements, reference_requirements,
award_criteria, opportunity_snapshots, change_events, programmes,
rollout_states, partners, company_capabilities, requirement_matches,
digest_entries, agent_runs. Plus news_items and tracked_accounts, added
to support the dashboard's News page (LinkedIn/Twitter monitoring).

Recommended engine: PostgreSQL with JSONB for source-specific metadata
(spec section 60). This module targets generic SQLAlchemy types so it
also runs against SQLite for local development/testing — swap the
`JSON_TYPE` below for `postgresql.JSONB` in production.
"""
from datetime import datetime
import enum
import os

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String,
    Text, JSON as JSON_TYPE, create_engine
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

Base = declarative_base()


# --------------------------------------------------------------------------
# Enums
# --------------------------------------------------------------------------

class SourceType(str, enum.Enum):
    PROCUREMENT_PORTAL = "PROCUREMENT_PORTAL"
    FUNDING_PORTAL = "FUNDING_PORTAL"
    DIGITAL_AGENCY = "DIGITAL_AGENCY"
    IDENTITY_AUTHORITY = "IDENTITY_AUTHORITY"
    GOVERNMENT = "GOVERNMENT"
    LSP = "LSP"
    EU_PROGRAMME = "EU_PROGRAMME"
    DEVELOPMENT_BANK = "DEVELOPMENT_BANK"
    STANDARDS_BODY = "STANDARDS_BODY"
    INDUSTRY_SOURCE = "INDUSTRY_SOURCE"
    CONSORTIUM = "CONSORTIUM"
    NEWS = "NEWS"
    SOCIAL_LINKEDIN = "SOCIAL_LINKEDIN"
    SOCIAL_TWITTER = "SOCIAL_TWITTER"
    SOCIAL_REDDIT = "SOCIAL_REDDIT"


class SourceStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"
    RETIRED = "RETIRED"


class NationalStatus(int, enum.Enum):
    UNKNOWN = 0
    POLICY_ANNOUNCED = 1
    RESPONSIBLE_AUTHORITY_IDENTIFIED = 2
    BUDGET_FUNDING_IDENTIFIED = 3
    MARKET_CONSULTATION = 4
    PROCUREMENT_EXPECTED = 5
    PROCUREMENT_OPEN = 6
    AWARDED = 7
    DEVELOPMENT = 8
    CERTIFICATION = 9
    PILOT = 10
    PRODUCTION = 11
    OPERATIONS_MAINTENANCE = 12


class ConfidenceLevel(str, enum.Enum):
    CONFIRMED = "CONFIRMED"
    INFERRED = "INFERRED"
    UNCLEAR = "UNCLEAR"
    NOT_DISCLOSED = "NOT_DISCLOSED"


class MatchStatus(str, enum.Enum):
    MATCH = "MATCH"
    PARTIAL_MATCH = "PARTIAL_MATCH"
    PARTNER_NEEDED = "PARTNER_NEEDED"
    NO_MATCH = "NO_MATCH"
    UNKNOWN = "UNKNOWN"


class ChangeImportance(str, enum.Enum):
    CRITICAL = "CRITICAL"
    MATERIAL = "MATERIAL"
    MINOR = "MINOR"


class ActionPriority(str, enum.Enum):
    P0 = "P0_IMMEDIATE_ACTION"
    P1 = "P1_HIGH_PRIORITY"
    P2 = "P2_REVIEW"
    P3 = "P3_WATCH"
    P4 = "P4_ARCHIVE"


class DocumentType(str, enum.Enum):
    CONTRACT_NOTICE = "CONTRACT_NOTICE"
    PROGRAMME = "PROGRAMME"
    TENDER_SPECIFICATIONS = "TENDER_SPECIFICATIONS"
    TERMS_OF_REFERENCE = "TERMS_OF_REFERENCE"
    TECHNICAL_SPECIFICATIONS = "TECHNICAL_SPECIFICATIONS"
    SELECTION_CRITERIA = "SELECTION_CRITERIA"
    AWARD_CRITERIA = "AWARD_CRITERIA"
    FINANCIAL_PROPOSAL = "FINANCIAL_PROPOSAL"
    CONTRACT = "CONTRACT"
    ANNEX = "ANNEX"
    CLARIFICATION = "CLARIFICATION"
    CORRIGENDUM = "CORRIGENDUM"
    Q_AND_A = "Q_AND_A"
    FORM = "FORM"
    OTHER = "OTHER"


REQUIREMENT_CATEGORIES = [
    "LEGAL", "FINANCIAL", "TURNOVER", "INSURANCE", "CERTIFICATION",
    "COMPANY_EXPERIENCE", "REFERENCE", "TEAM", "CV", "EDUCATION",
    "PERSONAL_CERTIFICATION", "SECURITY_CLEARANCE", "LANGUAGE", "FTE",
    "LOCAL_PRESENCE", "TECHNICAL", "SECURITY", "PRIVACY", "EIDAS", "EUDI",
    "INTEROPERABILITY", "HOSTING", "SLA", "IMPLEMENTATION", "CONSORTIUM",
    "SUBCONTRACTING", "EVIDENCE", "AWARD",
]

CHANGE_EVENT_TYPES = [
    "deadline_changed", "document_added", "document_modified",
    "corrigendum_published", "clarification_published", "qanda_published",
    "budget_changed", "selection_criterion_changed",
    "award_criterion_changed", "status_changed", "procedure_cancelled",
    "award_announced", "new_lot_added",
]


# --------------------------------------------------------------------------
# Core reference tables
# --------------------------------------------------------------------------

class Country(Base):
    __tablename__ = "countries"
    code = Column(String(4), primary_key=True)   # ISO country code
    name = Column(String(128), nullable=False)
    region = Column(String(64))
    national_procurement_portal = Column(String(512))
    digital_ministry = Column(String(256))
    digital_agency = Column(String(256))
    eid_authority = Column(String(256))
    eudi_wallet_authority = Column(String(256))
    cybersecurity_authority = Column(String(256))
    trust_services_supervisor = Column(String(256))
    national_funding_agency = Column(String(256))
    national_rd_portal = Column(String(512))
    status_code = Column(Integer, default=0)  # NationalStatus
    last_verified = Column(DateTime)

    # Populated from external trackers (e.g. iGrant.io) — see config/countries.yaml
    wallet_name = Column(String(256))
    wallet_status_raw = Column(String(512))   # verbatim source wording, not our own classification
    assurance_level = Column(String(16))       # low / substantial / high
    launch_date = Column(String(16))
    official_url = Column(String(512))
    country_url = Column(String(512))          # link to the tracker page / primary source
    status_source = Column(String(512))        # citation for the above fields

    rollout_states = relationship("RolloutState", back_populates="country")


class Source(Base):
    __tablename__ = "sources"
    source_id = Column(String(64), primary_key=True)
    name = Column(String(256), nullable=False)
    country = Column(String(4), ForeignKey("countries.code"), nullable=True)
    region = Column(String(64))
    source_type = Column(Enum(SourceType), nullable=False)
    url = Column(String(512))
    search_url = Column(String(512))
    api_available = Column(Boolean, default=False)
    rss_available = Column(Boolean, default=False)
    priority = Column(Integer, default=3)
    languages = Column(JSON_TYPE, default=list)
    keywords = Column(JSON_TYPE, default=list)
    last_checked = Column(DateTime)
    last_successful_check = Column(DateTime)
    status = Column(Enum(SourceStatus), default=SourceStatus.ACTIVE)

    # health monitoring (spec section 69)
    response_status = Column(String(32))
    number_results_last_run = Column(Integer)
    parser_status = Column(String(32))

    # How the radar monitors it (agents/source_monitor.py); edited from the
    # site's Following sidebar. method: ted | rss | site_search | off
    method = Column(String(16), nullable=False, default="off")
    feed_url = Column(Text)
    handle = Column(Text)              # social handle, e.g. @EU_Commission, r/digitalidentity
    enabled = Column(Boolean, nullable=False, default=True)
    check_every_days = Column(Integer, nullable=False, default=7)
    last_error = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class SourceActivity(Base):
    """What a source published or what a site search found on it: shown in
    the site's Live activity panel and turned into pipeline candidates."""
    __tablename__ = "source_activity"
    id = Column(Integer, primary_key=True, autoincrement=True)
    source_id = Column(String(64), ForeignKey("sources.source_id"), nullable=False)
    external_id = Column(Text, nullable=False)
    title = Column(Text)
    url = Column(Text)
    summary = Column(Text)
    published_at = Column(DateTime)
    fetched_at = Column(DateTime, default=datetime.utcnow)
    ingested = Column(Boolean, nullable=False, default=False)
    relevant = Column(Boolean)         # set after triage; site-search finds show only when true
    title_en = Column(Text)            # English title from triage
    kind = Column(String(32))          # what triage found it to be: TENDER, RFI, GRANT, NEWS_ONLY…


class Organisation(Base):
    __tablename__ = "organisations"
    org_id = Column(String(64), primary_key=True)
    name = Column(String(256), nullable=False)
    country = Column(String(4), ForeignKey("countries.code"))
    capabilities = Column(JSON_TYPE, default=list)
    known_eudi_projects = Column(JSON_TYPE, default=list)
    lsp_membership = Column(JSON_TYPE, default=list)
    tender_participation = Column(JSON_TYPE, default=list)
    relationship_status = Column(String(64))
    potential_partner_role = Column(String(128))


class Programme(Base):
    """LSPs and equivalent multi-country programmes (spec section 35)."""
    __tablename__ = "programmes"
    programme_id = Column(String(64), primary_key=True)
    name = Column(String(128), nullable=False)
    coordinator = Column(String(256))
    partners = Column(JSON_TYPE, default=list)
    countries = Column(JSON_TYPE, default=list)
    budget = Column(Float)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    use_cases = Column(JSON_TYPE, default=list)
    open_calls = Column(JSON_TYPE, default=list)
    procurements = Column(JSON_TYPE, default=list)
    partner_searches = Column(JSON_TYPE, default=list)
    subcontracting = Column(JSON_TYPE, default=list)
    news = Column(JSON_TYPE, default=list)
    funding_source = Column(String(128))


class RolloutState(Base):
    """National EUDI rollout tracker row (spec section 31-33)."""
    __tablename__ = "rollout_states"
    id = Column(Integer, primary_key=True, autoincrement=True)
    country_code = Column(String(4), ForeignKey("countries.code"))
    wallet_provider = Column(String(256))
    development_status = Column(String(64))
    procurement_status = Column(String(64))
    procurement_reference = Column(String(128))
    architecture_status = Column(String(64))
    pid_provider = Column(String(256))
    certification_body = Column(String(256))
    certification_status = Column(String(64))
    expected_launch = Column(DateTime)
    known_budget = Column(Float)
    funding_source = Column(String(128))
    lsp_participation = Column(JSON_TYPE, default=list)
    known_technology_partners = Column(JSON_TYPE, default=list)
    last_material_update = Column(DateTime)
    next_expected_event = Column(String(256))
    opportunity_probability = Column(Float)
    status_code = Column(Integer, default=0)
    recorded_at = Column(DateTime, default=datetime.utcnow)

    country = relationship("Country", back_populates="rollout_states")


# --------------------------------------------------------------------------
# Discovery -> Candidate -> Opportunity pipeline
# --------------------------------------------------------------------------

class Query(Base):
    __tablename__ = "queries"
    query_id = Column(Integer, primary_key=True, autoincrement=True)
    query_pack = Column(String(64))
    query_text = Column(Text, nullable=False)
    country = Column(String(4))
    language = Column(String(8))
    executed_at = Column(DateTime, default=datetime.utcnow)
    results_count = Column(Integer, default=0)
    source_id = Column(String(64), ForeignKey("sources.source_id"))


class Candidate(Base):
    """Raw discovery object (spec section 16). Store everything pre-triage."""
    __tablename__ = "candidates"
    candidate_id = Column(String(64), primary_key=True)
    discovered_at = Column(DateTime, default=datetime.utcnow)
    source_id = Column(String(64), ForeignKey("sources.source_id"))
    source_url = Column(String(1024))
    title = Column(Text)
    description = Column(Text)
    publication_date = Column(DateTime)
    country = Column(String(4))
    language = Column(String(8))
    raw_text = Column(Text)
    discovery_query = Column(Text)
    potential_categories = Column(JSON_TYPE, default=list)
    processed = Column(Boolean, default=False)

    # Triage output (spec section 17)
    relevance = Column(Integer)
    opportunity_probability = Column(Float)
    eudi_relevance = Column(String(32))
    commercial_relevance = Column(String(32))
    candidate_type = Column(String(64))
    triage_reason = Column(Text)
    deep_analysis_required = Column(Boolean, default=False)
    triage_output = Column(JSON_TYPE)   # full LLM triage JSON, for re-promotion without re-calling


class Opportunity(Base):
    """Opportunity master record (spec section 22)."""
    __tablename__ = "opportunities"
    opportunity_id = Column(String(64), primary_key=True)
    title = Column(Text, nullable=False)       # as published, in the original language
    title_en = Column(Text)                    # English title from triage
    language = Column(String(8))               # ISO 639-1 of the original
    reference = Column(String(128))
    country = Column(String(4))
    authority = Column(String(256))
    authority_en = Column(Text)            # official name + English rendering when not English
    opportunity_type = Column(String(64))
    status = Column(String(64))
    publication_date = Column(DateTime)
    deadline = Column(DateTime)
    estimated_value = Column(Float, nullable=True)
    currency = Column(String(8))
    value_source = Column(String(16))  # summary, when the figure was read from the written record
    duration_months = Column(Integer, nullable=True)
    funding_rate = Column(Float, nullable=True)
    official_url = Column(String(1024))
    summary = Column(Text)
    verified_at = Column(DateTime)      # last time status was checked against the source
    status_evidence = Column(Text)      # quote / fact the status rests on
    first_detected = Column(DateTime, default=datetime.utcnow)
    last_checked = Column(DateTime)
    last_change = Column(DateTime)
    relevance_score = Column(Integer, default=0)
    go_nogo_score = Column(Integer, default=0)

    # Prioritisation (spec sections 47-49) — stored separately per spec section 46
    opportunity_relevance_score = Column(Integer)   # 0-100, section 47
    bid_readiness_score = Column(Integer)            # 0-100, section 48
    action_priority = Column(Enum(ActionPriority))
    lang = Column(JSON_TYPE, default=dict)           # {column: language} of displayed text (migration 017)
    tender_summary = Column(Text)                    # agents/tender_analysis.py
    tender_analysed_at = Column(DateTime)
    evaluation = Column(JSON_TYPE)                   # Evaluation Report Agent (webapp)
    evaluated_at = Column(DateTime)
    evaluation_started_at = Column(DateTime)
    evaluation_error = Column(Text)
    proposal_brief = Column(Text)                    # Proposal Manager Agent (webapp), Markdown
    proposal_at = Column(DateTime)
    proposal_started_at = Column(DateTime)
    proposal_error = Column(Text)

    documents = relationship("Document", back_populates="opportunity")
    requirements = relationship("Requirement", back_populates="opportunity")
    snapshots = relationship("OpportunitySnapshot", back_populates="opportunity")
    change_events = relationship("ChangeEvent", back_populates="opportunity")


class Document(Base):
    __tablename__ = "documents"
    document_id = Column(String(64), primary_key=True)
    opportunity_id = Column(String(64), ForeignKey("opportunities.opportunity_id"))
    name = Column(String(512))
    name_en = Column(Text)              # English name (agents/translator.py)
    document_type = Column(Enum(DocumentType))
    url = Column(String(1024))
    version = Column(String(32))
    publication_date = Column(DateTime)
    hash = Column(String(128))          # for change detection, spec section 21
    storage_path = Column(String(512))  # see storage/ layout, spec section 61
    downloaded_at = Column(DateTime)

    opportunity = relationship("Opportunity", back_populates="documents")


class Requirement(Base):
    """Individual extracted requirement (spec section 23). Never prose-only."""
    __tablename__ = "requirements"
    requirement_id = Column(String(64), primary_key=True)
    opportunity_id = Column(String(64), ForeignKey("opportunities.opportunity_id"))
    category = Column(String(64))       # must be in REQUIREMENT_CATEGORIES
    requirement_group = Column(String(32))  # ELIGIBILITY | REFERENCES | HUMAN_RESOURCES | TECHNICAL
    subcategory = Column(String(128))
    requirement_text = Column(Text)
    mandatory = Column(Boolean, default=True)
    threshold = Column(String(256))
    applies_to = Column(String(128))
    evidence_required = Column(Text)
    phase = Column(String(64))
    document = Column(String(512))
    section = Column(String(128))
    page = Column(Integer, nullable=True)
    source_url = Column(String(1024))
    confidence = Column(Enum(ConfidenceLevel), default=ConfidenceLevel.UNCLEAR)

    opportunity = relationship("Opportunity", back_populates="requirements")
    match = relationship("RequirementMatch", back_populates="requirement", uselist=False)


class TeamRequirement(Base):
    """Individual required person/profile (spec section 25)."""
    __tablename__ = "team_requirements"
    id = Column(Integer, primary_key=True, autoincrement=True)
    opportunity_id = Column(String(64), ForeignKey("opportunities.opportunity_id"))
    role = Column(String(128))
    number_required = Column(Integer, default=1)
    education = Column(String(256))
    certifications = Column(JSON_TYPE, default=list)
    general_experience_years = Column(Integer, default=0)
    specific_experience_years = Column(Integer, default=0)
    required_project_types = Column(JSON_TYPE, default=list)
    technologies = Column(JSON_TYPE, default=list)
    languages = Column(JSON_TYPE, default=list)
    security_clearance = Column(String(64))
    allocation_percent = Column(Float, nullable=True)
    onsite_requirement = Column(String(64))
    mandatory = Column(Boolean, default=True)


class ReferenceRequirement(Base):
    """Individual reference requirement (spec section 26)."""
    __tablename__ = "reference_requirements"
    id = Column(Integer, primary_key=True, autoincrement=True)
    opportunity_id = Column(String(64), ForeignKey("opportunities.opportunity_id"))
    number_of_references = Column(Integer, default=0)
    minimum_contract_value = Column(Float, nullable=True)
    currency = Column(String(8))
    minimum_duration = Column(Integer, nullable=True)
    reference_period = Column(String(64))
    sector = Column(String(128))
    technology = Column(String(256))
    geography = Column(String(128))
    minimum_users = Column(Integer, nullable=True)
    minimum_countries = Column(Integer, nullable=True)
    large_scale_required = Column(Boolean, default=False)
    public_sector_required = Column(Boolean, default=False)
    cross_border_required = Column(Boolean, default=False)
    evidence_required = Column(Text)


class AwardCriterion(Base):
    """Kept strictly separate from eligibility requirements (spec section 28)."""
    __tablename__ = "award_criteria"
    id = Column(Integer, primary_key=True, autoincrement=True)
    opportunity_id = Column(String(64), ForeignKey("opportunities.opportunity_id"))
    criterion = Column(String(256))
    weight = Column(Float)
    subcriteria = Column(JSON_TYPE, default=list)


# --------------------------------------------------------------------------
# Memory / change detection (Agent 6)
# --------------------------------------------------------------------------

class OpportunitySnapshot(Base):
    __tablename__ = "opportunity_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    opportunity_id = Column(String(64), ForeignKey("opportunities.opportunity_id"))
    checked_at = Column(DateTime, default=datetime.utcnow)
    deadline = Column(DateTime)
    status = Column(String(64))
    value = Column(String(64))
    document_hashes = Column(JSON_TYPE, default=list)
    requirements_hash = Column(String(128))

    opportunity = relationship("Opportunity", back_populates="snapshots")


class ChangeEvent(Base):
    __tablename__ = "change_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    opportunity_id = Column(String(64), ForeignKey("opportunities.opportunity_id"))
    event_type = Column(String(64))   # one of CHANGE_EVENT_TYPES
    importance = Column(Enum(ChangeImportance))
    description = Column(Text)
    detected_at = Column(DateTime, default=datetime.utcnow)
    notice_url = Column(Text)          # the notice that brought the change
    note_source = Column(Text)         # what that notice says changed, original language
    note = Column(Text)                # English comment shown under the opportunity

    opportunity = relationship("Opportunity", back_populates="change_events")


# --------------------------------------------------------------------------
# Bid match engine (Agent 5)
# --------------------------------------------------------------------------

class RequirementMatch(Base):
    __tablename__ = "requirement_matches"
    id = Column(Integer, primary_key=True, autoincrement=True)
    requirement_id = Column(String(64), ForeignKey("requirements.requirement_id"))
    match_status = Column(Enum(MatchStatus), default=MatchStatus.UNKNOWN)
    matched_evidence = Column(Text)
    notes = Column(Text)

    requirement = relationship("Requirement", back_populates="match")


class Partner(Base):
    __tablename__ = "partners"
    id = Column(Integer, primary_key=True, autoincrement=True)
    organisation_id = Column(String(64), ForeignKey("organisations.org_id"))
    role_needed = Column(String(64))
    opportunity_id = Column(String(64), ForeignKey("opportunities.opportunity_id"))
    status = Column(String(64))


class CompanyCapability(Base):
    """Mirrors config/company_profile.yaml — verified info only, never
    written to by inference (spec section 37)."""
    __tablename__ = "company_capabilities"
    id = Column(Integer, primary_key=True, autoincrement=True)
    field_name = Column(String(128))
    value = Column(JSON_TYPE)
    verified_at = Column(DateTime)
    source = Column(String(512))


class NewsItem(Base):
    """
    Regulation / government-decision / tracked-social-post items for the
    News page. Distinct from Opportunity — this is informational/monitoring
    content, not a tender/grant/pilot to bid on.
    """
    __tablename__ = "news_items"
    news_id = Column(String(64), primary_key=True)
    title = Column(Text, nullable=False)
    title_en = Column(Text)
    language = Column(String(8))
    category = Column(String(32))  # regulation | govdecision | linkedin | twitter
    region = Column(String(64))
    country = Column(String(4))
    published_date = Column(DateTime)
    source_name = Column(String(256))
    source_url = Column(String(1024))
    excerpt = Column(Text)
    summary = Column(Text)
    impact_note = Column(Text)  # the "Biometrid Impact Note" — agent-written
    relevance_score = Column(Integer)  # triage "importance", 0-100 — ranks the home feed
    image_url = Column(Text)           # share image of the source page (og:image)
    image_checked_at = Column(DateTime)
    lang = Column(JSON_TYPE, default=dict)  # {column: language} of displayed text (migration 017)
    summary_long = Column(Text)        # News Report Agent: complete summary of the story
    key_facts = Column(JSON_TYPE)
    analysis = Column(JSON_TYPE)       # News Report Agent: {verdict, take, actions: [...]}
    analysed_at = Column(DateTime)
    report_started_at = Column(DateTime)  # News Report Agent run lock
    report_error = Column(Text)
    unverified = Column(Boolean, default=False)  # true for social-sourced items
    created_at = Column(DateTime, default=datetime.utcnow)


class FeedPost(Base):
    """A post on the home feed, written by the feed-writer agent. One per
    event: a new opportunity, an update to one (deadline moved, awarded),
    or a news story. Ranked like Reddit's "hot" with the AI score as votes."""
    __tablename__ = "feed_posts"
    post_id = Column(String(80), primary_key=True)   # opp:<id> | chg:<change id> | news:<id>
    kind = Column(String(16))          # opportunity | news
    event = Column(String(32))         # new_opportunity | deadline_change | awarded | news
    opportunity_id = Column(String(64))
    news_id = Column(String(64))
    change_event_id = Column(Integer)
    category = Column(String(32))      # rfp | rfi | grant | signal | regulation | industry | market
    country = Column(String(4))
    headline = Column(Text)
    body = Column(Text)
    score = Column(Integer)            # AI relevance / importance, 0-100
    posted_at = Column(DateTime)       # when the event happened: drives novelty
    created_at = Column(DateTime, default=datetime.utcnow)
    rank = Column(Integer)             # position at the last pipeline run
    prev_rank = Column(Integer)        # position at the run before: drives the ▲/▼
    ranked_at = Column(DateTime)
    plain = Column(Boolean, default=False)  # written from the facts (LLM unavailable); rewritten when it's back


class TrackedAccount(Base):
    """LinkedIn/Twitter accounts monitored for the News page — mirrors
    config/tracked_accounts.yaml, persisted so the dashboard can query it."""
    __tablename__ = "tracked_accounts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    platform = Column(String(16))  # linkedin | twitter
    handle_or_url = Column(String(512))
    display_name = Column(String(256))
    category = Column(String(64))
    active = Column(Boolean, default=False)


# --------------------------------------------------------------------------
# Digest / audit
# --------------------------------------------------------------------------

class DigestEntry(Base):
    __tablename__ = "digest_entries"
    id = Column(Integer, primary_key=True, autoincrement=True)
    digest_date = Column(DateTime, default=datetime.utcnow)
    digest_type = Column(String(16))   # DAILY / WEEKLY
    opportunity_id = Column(String(64), ForeignKey("opportunities.opportunity_id"), nullable=True)
    section = Column(String(64))       # e.g. NEW_OPPORTUNITY, ROLLOUT_CHANGE, EARLY_SIGNAL
    content = Column(Text)


class AgentRun(Base):
    """Research audit trail (spec section 73)."""
    __tablename__ = "agent_runs"
    run_id = Column(String(64), primary_key=True)
    agent_name = Column(String(64))
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    query = Column(Text)
    url = Column(String(1024))
    retrieved_content_ref = Column(String(512))  # pointer to stored raw content
    model = Column(String(64))
    prompt_version = Column(String(32))
    analysis_version = Column(String(32))
    status = Column(String(32), default="RUNNING")
    error = Column(Text, nullable=True)


# --------------------------------------------------------------------------
# Engine helper
# --------------------------------------------------------------------------

def get_engine(db_url: str = None):
    """
    Defaults to the DATABASE_URL environment variable (set this to your
    Supabase Postgres connection string in deployment) — falls back to a
    local SQLite file only if DATABASE_URL isn't set, for local dev/testing.
    """
    if db_url is None:
        db_url = os.environ.get("DATABASE_URL", "sqlite:///eudi_radar.db")
    # Supabase hands out postgres://, postgresql:// and postgresql+psycopg://
    # variants; only psycopg2 is installed, so pin every Postgres URL to it.
    db_url = db_url.strip()
    for prefix in ("postgres://", "postgresql://", "postgresql+psycopg://"):
        if db_url.startswith(prefix):
            db_url = "postgresql+psycopg2://" + db_url[len(prefix):]
            break
    return create_engine(db_url, echo=False, future=True)


def init_db(db_url: str = None):
    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
    return engine


def get_session(engine):
    return sessionmaker(bind=engine)()


if __name__ == "__main__":
    engine = init_db()
    print(f"Initialised schema with {len(Base.metadata.tables)} tables:")
    for t in sorted(Base.metadata.tables):
        print(f"  - {t}")
