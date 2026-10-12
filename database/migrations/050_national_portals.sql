-- Portals the pipeline can search without a key: Contracts Finder, Find a Tender,
-- Public Contracts Scotland, BOAMP, TenderNed, and the EBRD notice index.
-- Italy, Ireland, Denmark, EIB, AfDB and IDB stay listed only.
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

  select count(*) into n from countries where code in ('UK', 'FR', 'NL');
  if n <> 3 then raise exception 'UK, FR or NL missing from countries (%)', n; end if;

  insert into sources (source_id, name, source_type, url, country, method, enabled, check_every_days, status, priority, rss_available, api_available) values
    ('UK-001', 'Contracts Finder', 'PROCUREMENT_PORTAL', 'https://www.contractsfinder.service.gov.uk', 'UK', 'api', true, 1, 'ACTIVE', 1, false, true),
    ('UK-002', 'Public Contracts Scotland', 'PROCUREMENT_PORTAL', 'https://www.publiccontractsscotland.gov.uk', 'UK', 'api', true, 1, 'ACTIVE', 2, false, true)
  on conflict (source_id) do update set
    name = excluded.name, url = excluded.url, country = excluded.country,
    method = excluded.method, enabled = excluded.enabled, api_available = excluded.api_available;

  update sources set method = 'api', api_available = true, country = 'UK'
    where source_id = 'EU-024';
  update sources set method = 'api', api_available = true, country = 'FR'
    where source_id = 'EU-023';
  update sources set method = 'api', api_available = true, country = 'NL'
    where source_id = 'EU-022';
  update sources set method = 'api', api_available = true
    where source_id = 'INTL-029';

  update scopes s set search_config = jsonb_set(s.search_config, '{nl_queries}', v.q, true)
  from (values
    ('Artificial Intelligence', jsonb_build_array('kunstmatige intelligentie')),
    ('Cybersecurity', jsonb_build_array('cyberbeveiliging')),
    ('Digital ID & Biometrics', jsonb_build_array('biometrische identificatie')),
    ('Healthcare software', jsonb_build_array('zorginformatiesysteem')),
    ('EUDI Wallet', jsonb_build_array('digitale identiteit')),
    ('ERP & business software', jsonb_build_array('bedrijfssoftware')),
    ('Cloud platforms', jsonb_build_array('cloudcomputing')),
    ('Workplace devices', jsonb_build_array('computers')),
    ('Servers & data centres', jsonb_build_array('datacenter')),
    ('Networks & telecoms', jsonb_build_array('telecommunicatie')),
    ('Medical equipment', jsonb_build_array('medische apparatuur')),
    ('Building energy renovation', jsonb_build_array('energiebesparing')),
    ('Solar & wind', jsonb_build_array('zonne-energie')),
    ('Waste & recycling', jsonb_build_array('afvalinzameling')),
    ('Electric buses & charging', jsonb_build_array('elektrische bus')),
    ('Water & wastewater', jsonb_build_array('drinkwater'))
  ) as v(name, q)
  where s.catalog and s.name = v.name;

  insert into scope_sources (scope_id, source_id)
  select s.id, p.source_id
  from scopes s
  cross join (values ('UK-001'), ('UK-002'), ('EU-022'), ('EU-023'), ('EU-024'), ('INTL-029')) as p(source_id)
  where s.catalog
  on conflict do nothing;

  select count(*) into n from sources
    where source_id in ('UK-001', 'UK-002', 'EU-022', 'EU-023', 'EU-024', 'INTL-029') and method = 'api' and enabled;
  if n <> 6 then raise exception 'portal was not switched to its API (%)', n; end if;

  select count(*) into n from sources
    where source_id in ('EU-021', 'EU-025', 'EU-026', 'INTL-028', 'INTL-031', 'INTL-032') and method = 'off';
  if n <> 6 then raise exception 'a portal without a feed was switched on (%)', n; end if;

  select count(*) into n from scopes where catalog and jsonb_array_length(search_config->'nl_queries') >= 1;
  if n <> 16 then raise exception 'a catalog scope has no Dutch query (%)', n; end if;

  select count(*) into n from scope_sources ss
    join scopes s on s.id = ss.scope_id and s.catalog
    where ss.source_id in ('UK-001', 'UK-002', 'EU-022', 'EU-023', 'EU-024', 'INTL-029');
  if n <> 96 then raise exception 'a catalog scope is not following the portals (%)', n; end if;

  select count(*) into n from scopes where id = general and is_default and search_config->>'mode' = 'generic';
  if n <> 1 then raise exception 'General was changed'; end if;
  select count(*) into n from scopes where is_default;
  if n <> 1 then raise exception 'expected one default scope, got %', n; end if;
  select count(*) into n from scopes where id = eudi and workspace_id = fc and catalog and not is_default;
  if n <> 1 then raise exception 'EUDI Wallet was moved'; end if;
end $$;
