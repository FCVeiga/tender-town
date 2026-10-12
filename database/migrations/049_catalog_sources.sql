-- Real, monitored sources for each catalog scope, and the portals the pipeline
-- actually searches. TED and the World Bank are APIs (not feeds). Trade press and
-- a few subreddits are RSS. National portals and the other development banks stay
-- listed only: they have no open feed or API this pipeline can read.
-- Select scopes by name. General stays the only is_default scope.

do $$
declare
  n int;
  general uuid := '0559b24a-3207-470d-ad7b-b5837f2e3d7b';
  eudi uuid := '0d315fdb-92b2-402e-a9b9-dd96b6976667';
  fc uuid := '9f90e981-8ae3-47ce-ab6b-128fce8687c2';
begin
  select count(*) into n from scopes where id = general and name = 'General' and is_default
    and search_config->>'mode' = 'generic';
  if n <> 1 then raise exception 'General scope not found (count %)', n; end if;

  select count(*) into n from scopes where id = eudi and name = 'EUDI Wallet' and catalog
    and workspace_id = fc and not is_default;
  if n <> 1 then raise exception 'EUDI Wallet was not where it should be (count %)', n; end if;

  insert into sources (source_id, name, source_type, url, feed_url, handle, method, enabled, check_every_days, status, priority, rss_available) values
    ('CAT-AI-MIT', 'MIT Technology Review — AI', 'NEWS', 'https://www.technologyreview.com/topic/artificial-intelligence/', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-AI-ML', 'r/MachineLearning', 'SOCIAL_REDDIT', 'https://www.reddit.com/r/MachineLearning', 'https://www.reddit.com/r/MachineLearning/.rss', 'r/MachineLearning', 'rss', true, 1, 'ACTIVE', 4, true),
    ('CAT-CY-BLEEP', 'BleepingComputer', 'NEWS', 'https://www.bleepingcomputer.com', 'https://www.bleepingcomputer.com/feed/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-CY-CISA', 'CISA cybersecurity advisories', 'GOVERNMENT', 'https://www.cisa.gov/news-events/cybersecurity-advisories', 'https://www.cisa.gov/cybersecurity-advisories/all.xml', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-CY-KREBS', 'Krebs on Security', 'NEWS', 'https://krebsonsecurity.com', 'https://krebsonsecurity.com/feed/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-CY-REDDIT', 'r/cybersecurity', 'SOCIAL_REDDIT', 'https://www.reddit.com/r/cybersecurity', 'https://www.reddit.com/r/cybersecurity/.rss', 'r/cybersecurity', 'rss', true, 1, 'ACTIVE', 4, true),
    ('CAT-ID-IDENT', 'Biometric Update — identity', 'NEWS', 'https://www.biometricupdate.com/biometric-news/identity', 'https://www.biometricupdate.com/biometric-news/identity/feed', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-HS-DIVE', 'Healthcare Dive', 'NEWS', 'https://www.healthcaredive.com', 'https://www.healthcaredive.com/feeds/news/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-HS-FIERCE', 'Fierce Healthcare', 'NEWS', 'https://www.fiercehealthcare.com', 'https://www.fiercehealthcare.com/rss/xml', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-HS-REDDIT', 'r/healthIT', 'SOCIAL_REDDIT', 'https://www.reddit.com/r/healthIT', 'https://www.reddit.com/r/healthIT/.rss', 'r/healthIT', 'rss', true, 1, 'ACTIVE', 4, true),
    ('CAT-ERP-DIGI', 'Diginomica', 'INDUSTRY_SOURCE', 'https://diginomica.com', 'https://diginomica.com/feed', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-ERP-SAPR', 'r/SAP', 'SOCIAL_REDDIT', 'https://www.reddit.com/r/SAP', 'https://www.reddit.com/r/SAP/.rss', 'r/SAP', 'rss', true, 1, 'ACTIVE', 4, true),
    ('CAT-CL-NEXT', 'The Next Platform', 'NEWS', 'https://www.nextplatform.com', 'https://www.nextplatform.com/feed/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-HW-CW', 'Computerworld', 'NEWS', 'https://www.computerworld.com', 'https://www.computerworld.com/feed/', null, 'rss', true, 1, 'ACTIVE', 3, true),
    ('CAT-HW-DCD', 'Data Center Dynamics', 'NEWS', 'https://www.datacenterdynamics.com', 'https://www.datacenterdynamics.com/en/rss/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-HW-DC', 'r/datacenter', 'SOCIAL_REDDIT', 'https://www.reddit.com/r/datacenter', 'https://www.reddit.com/r/datacenter/.rss', 'r/datacenter', 'rss', true, 1, 'ACTIVE', 4, true),
    ('CAT-HW-REGNET', 'The Register — networks', 'NEWS', 'https://www.theregister.com/on_prem/networks/', 'https://www.theregister.com/on_prem/networks/headlines.atom', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-HW-RNET', 'r/networking', 'SOCIAL_REDDIT', 'https://www.reddit.com/r/networking', 'https://www.reddit.com/r/networking/.rss', 'r/networking', 'rss', true, 1, 'ACTIVE', 4, true),
    ('CAT-MED-MTI', 'Med-Tech Insights', 'NEWS', 'https://med-techinsights.com', 'https://med-techinsights.com/feed/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-ENERGY', 'European Commission — energy', 'EU_PROGRAMME', 'https://energy.ec.europa.eu', 'https://energy.ec.europa.eu/node/2/rss_en', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-PVTECH', 'PV Tech', 'NEWS', 'https://www.pv-tech.org', 'https://www.pv-tech.org/feed/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-SOLAR', 'r/solar', 'SOCIAL_REDDIT', 'https://www.reddit.com/r/solar', 'https://www.reddit.com/r/solar/.rss', 'r/solar', 'rss', true, 1, 'ACTIVE', 4, true),
    ('CAT-GN-W360', 'Waste360', 'NEWS', 'https://www.waste360.com', 'https://www.waste360.com/rss.xml', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-CIRC', 'Circular Online', 'NEWS', 'https://www.circularonline.co.uk', 'https://www.circularonline.co.uk/feed/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-ELEC', 'electrive', 'NEWS', 'https://www.electrive.com', 'https://www.electrive.com/feed/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-COB', 'Circle of Blue', 'NEWS', 'https://www.circleofblue.org', 'https://www.circleofblue.org/feed/', null, 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-ADB', 'Asian Development Bank', 'DEVELOPMENT_BANK', 'https://www.adb.org/news', 'https://www.adb.org/rss/news', null, 'rss', true, 1, 'ACTIVE', 2, true)
  on conflict (source_id) do update set
    name = excluded.name, url = excluded.url, feed_url = excluded.feed_url, handle = excluded.handle,
    method = excluded.method, enabled = excluded.enabled, check_every_days = excluded.check_every_days,
    rss_available = excluded.rss_available;

  -- These two were labels. TED is searched through its API; the World Bank through its procurement API.
  update sources set method = 'ted' where source_id = 'EU-001' and method = 'off';
  update sources set method = 'api' where source_id = 'INTL-027' and method = 'off';

  insert into scope_sources (scope_id, source_id)
  select s.id, x.source_id
  from (values
    ('Artificial Intelligence', 'CAT-AI-MIT'),
    ('Artificial Intelligence', 'CAT-AI-ML'),
    ('Artificial Intelligence', 'GEN-014'),
    ('Cybersecurity', 'CAT-CY-BLEEP'),
    ('Cybersecurity', 'CAT-CY-CISA'),
    ('Cybersecurity', 'CAT-CY-KREBS'),
    ('Cybersecurity', 'CAT-CY-REDDIT'),
    ('Cybersecurity', 'GEN-014'),
    ('Digital ID & Biometrics', 'CAT-ID-IDENT'),
    ('Digital ID & Biometrics', 'GEN-014'),
    ('Healthcare software', 'CAT-HS-DIVE'),
    ('Healthcare software', 'CAT-HS-FIERCE'),
    ('Healthcare software', 'CAT-HS-REDDIT'),
    ('Healthcare software', 'GEN-014'),
    ('Healthcare software', 'CAT-ADB'),
    ('ERP & business software', 'CAT-ERP-DIGI'),
    ('ERP & business software', 'CAT-ERP-SAPR'),
    ('ERP & business software', 'GEN-014'),
    ('Cloud platforms', 'CAT-CL-NEXT'),
    ('Cloud platforms', 'GEN-014'),
    ('EUDI Wallet', 'GEN-014'),
    ('Workplace devices', 'CAT-HW-CW'),
    ('Servers & data centres', 'CAT-HW-DCD'),
    ('Servers & data centres', 'CAT-HW-DC'),
    ('Networks & telecoms', 'CAT-HW-REGNET'),
    ('Networks & telecoms', 'CAT-HW-RNET'),
    ('Networks & telecoms', 'CAT-ADB'),
    ('Medical equipment', 'CAT-MED-MTI'),
    ('Medical equipment', 'CAT-ADB'),
    ('Building energy renovation', 'CAT-GN-ENERGY'),
    ('Building energy renovation', 'CAT-ADB'),
    ('Solar & wind', 'CAT-GN-PVTECH'),
    ('Solar & wind', 'CAT-GN-SOLAR'),
    ('Solar & wind', 'CAT-GN-ENERGY'),
    ('Solar & wind', 'CAT-ADB'),
    ('Waste & recycling', 'CAT-GN-W360'),
    ('Waste & recycling', 'CAT-GN-CIRC'),
    ('Waste & recycling', 'CAT-ADB'),
    ('Electric buses & charging', 'CAT-GN-ELEC'),
    ('Electric buses & charging', 'CAT-GN-ENERGY'),
    ('Water & wastewater', 'CAT-GN-COB'),
    ('Water & wastewater', 'CAT-ADB')
  ) as x(scope_name, source_id)
  join scopes s on s.catalog and s.name = x.scope_name
  on conflict do nothing;

  insert into scope_sources (scope_id, source_id)
  select s.id, p.source_id
  from scopes s
  cross join (values ('EU-001'), ('INTL-027')) as p(source_id)
  where s.catalog
  on conflict do nothing;

  insert into scope_sources (scope_id, source_id)
  select s.id, p.source_id
  from scopes s
  cross join (values ('EU-001'), ('GEN-010')) as p(source_id)
  where s.id = general
  on conflict do nothing;

  update scopes s
  set search_config = s.search_config || jsonb_build_object('wb_queries', v.q)
  from (values
    ('Artificial Intelligence', jsonb_build_array('artificial intelligence')),
    ('Cybersecurity', jsonb_build_array('cybersecurity')),
    ('Digital ID & Biometrics', jsonb_build_array('identification system')),
    ('EUDI Wallet', jsonb_build_array('digital identity')),
    ('Healthcare software', jsonb_build_array('health information')),
    ('ERP & business software', jsonb_build_array('financial management')),
    ('Cloud platforms', jsonb_build_array('cloud computing')),
    ('Workplace devices', jsonb_build_array('computer equipment')),
    ('Servers & data centres', jsonb_build_array('data center')),
    ('Networks & telecoms', jsonb_build_array('telecommunications')),
    ('Medical equipment', jsonb_build_array('medical equipment')),
    ('Building energy renovation', jsonb_build_array('energy efficiency')),
    ('Solar & wind', jsonb_build_array('solar power')),
    ('Waste & recycling', jsonb_build_array('solid waste')),
    ('Electric buses & charging', jsonb_build_array('electric bus')),
    ('Water & wastewater', jsonb_build_array('water supply'))
  ) as v(name, q)
  where s.catalog and s.name = v.name;

  select count(*) into n from sources where source_id in (
    'CAT-AI-MIT','CAT-AI-ML','CAT-CY-BLEEP','CAT-CY-CISA','CAT-CY-KREBS','CAT-CY-REDDIT',
    'CAT-ID-IDENT','CAT-HS-DIVE','CAT-HS-FIERCE','CAT-HS-REDDIT','CAT-ERP-DIGI','CAT-ERP-SAPR',
    'CAT-CL-NEXT','CAT-HW-CW','CAT-HW-DCD','CAT-HW-DC','CAT-HW-REGNET','CAT-HW-RNET','CAT-MED-MTI',
    'CAT-GN-ENERGY','CAT-GN-PVTECH','CAT-GN-SOLAR','CAT-GN-W360','CAT-GN-CIRC','CAT-GN-ELEC',
    'CAT-GN-COB','CAT-ADB') and method = 'rss' and enabled;
  if n <> 27 then raise exception 'new feeds missing (%)', n; end if;

  select count(*) into n from sources where source_id = 'EU-001' and method = 'ted';
  if n <> 1 then raise exception 'TED was not switched to its API'; end if;
  select count(*) into n from sources where source_id = 'INTL-027' and method = 'api';
  if n <> 1 then raise exception 'World Bank was not switched to its API'; end if;

  select count(*) into n from scopes where catalog and jsonb_array_length(search_config->'wb_queries') >= 1;
  if n <> 16 then raise exception 'a catalog scope has no World Bank query (%)', n; end if;

  select count(*) into n from scope_sources ss
    join scopes s on s.id = ss.scope_id and s.catalog
    where ss.source_id in ('EU-001', 'INTL-027');
  if n <> 32 then raise exception 'TED or World Bank is not followed by every catalog scope (%)', n; end if;

  select count(*) into n from scope_sources where scope_id = general and source_id in ('EU-001', 'GEN-010');
  if n <> 2 then raise exception 'General is not following TED and r/procurement (%)', n; end if;

  select count(*) into n from scope_sources ss
    join scopes s on s.id = ss.scope_id and s.catalog and s.name = 'Electric buses & charging'
    where ss.source_id in ('CAT-GN-ELEC', 'CAT-GN-BUS', 'CAT-GN-ENERGY', 'EU-001', 'INTL-027');
  if n <> 5 then raise exception 'electric buses follows changed (%)', n; end if;

  select count(*) into n from scope_sources ss
    join scopes s on s.id = ss.scope_id and s.catalog and s.name = 'Water & wastewater'
    where ss.source_id in ('CAT-GN-H2O', 'CAT-GN-COB', 'CAT-ADB', 'EU-001', 'INTL-027');
  if n <> 5 then raise exception 'water follows changed (%)', n; end if;

  select count(*) into n from scopes where is_default;
  if n <> 1 then raise exception 'expected one default scope, got %', n; end if;
  select count(*) into n from scopes where id = eudi and workspace_id = fc and catalog and not is_default;
  if n <> 1 then raise exception 'EUDI Wallet was moved'; end if;
end $$;
