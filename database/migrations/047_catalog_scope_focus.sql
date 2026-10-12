-- Sharpen the shared catalog scopes, and add hardware and green-economy ones.
-- Select scopes by id. General stays the only default. EUDI stays on its workspace.
-- Agents stay on (no scope_agent_settings row means on). The triage bands live in
-- search_config so a cybersecurity tender is no longer scored as a wallet tender.

do $$
declare
  n int;
  platform uuid := 'adfd1ad4-e071-4097-a57f-4eadad891e13';
  general uuid := '0559b24a-3207-470d-ad7b-b5837f2e3d7b';
  eudi uuid := '0d315fdb-92b2-402e-a9b9-dd96b6976667';
  fc uuid := '9f90e981-8ae3-47ce-ab6b-128fce8687c2';
begin
  select count(*) into n from scopes where id = general and name = 'General' and is_default and search_config->>'mode' = 'generic';
  if n <> 1 then raise exception 'General scope not found (count %)', n; end if;
  select count(*) into n from scopes where id = eudi and name = 'EUDI Wallet' and catalog and workspace_id = fc and not is_default;
  if n <> 1 then raise exception 'EUDI Wallet not on its workspace (count %)', n; end if;

  update scopes set instructions = $ai$Tenders and grants for companies that build or integrate artificial intelligence for public bodies: models, platforms and AI features inside software.

Go for: developing, integrating or running AI and machine-learning systems, large language models, generative AI, and AI pilots a software company could bid for.

Out of scope: a passing mention of AI, AI policy with no system to build, and hardware with no software.$ai$,
    search_config = jsonb_build_object(
      'topic', 'Artificial Intelligence',
      'site_query', 'artificial intelligence machine learning public tender Europe',
      'ted_phrases', jsonb_build_array(
        'artificial intelligence', 'machine learning', 'large language model', 'generative AI',
        'künstliche Intelligenz', 'maschinelles Lernen', 'intelligence artificielle', 'aprendizaje automático',
        'inteligencia artificial', 'intelligenza artificiale'),
      'news_queries', jsonb_build_array(
        'government artificial intelligence contract Europe', 'EU AI public tender software',
        'machine learning procurement public sector', 'generative AI government contract Europe'),
      'web_queries', jsonb_build_array(
        'artificial intelligence software tender Europe', 'large language model government contract',
        'machine learning system public sector procurement', 'AI platform public tender'),
      'relevance_rubric', $ai_r$## Task
Score relevance 0-100 for a company that builds or integrates AI software for the public sector.
- 90-100: a tender, grant or pilot to build, integrate or run an AI, machine-learning or large-language-model system.
- 75-89: a public body buying AI features inside a software system, or a funded AI pilot a vendor could join.
- 60-74: a concrete plan to procure AI, with a buyer and a system, but no open call yet.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
AI mentioned in passing, strategy papers with no system, hardware-only supply, staffing with no build, academic papers, conference announcements, job postings.$ai_r$,
      'importance_rubric', $ai_i$`importance` (0-100) is how much an AI software vendor should care.
- 85-100: a national or EU AI system procurement, or a large grant to build one.
- 60-84: a ministry, hospital or city committing to buy or pilot AI software.
- 30-59: useful context — regulation, surveys, smaller pilots.
- 0-29: opinion and explainers.$ai_i$),
    search_status = 'applied', updated_at = now()
  where id = '766e772c-8fd6-42e8-84f0-bdd5745c465b' and name = 'Artificial Intelligence';

  update scopes set instructions = $cy$Tenders and grants for cybersecurity firms: security operations, application security, penetration testing and the software behind them.

Go for: security operations centres, monitoring, application and cloud security, incident response, NIS2 system work, and security software a company would build or run.

Out of scope: locks, cameras and guards, staffing-only contracts, cyber insurance, and hardware-only firewalls with no service.$cy$,
    search_config = jsonb_build_object(
      'topic', 'Cybersecurity',
      'site_query', 'cybersecurity security operations centre penetration testing tender',
      'ted_phrases', jsonb_build_array(
        'cybersecurity', 'cyber security', 'security operations centre', 'penetration testing',
        'Cybersicherheit', 'cybersécurité', 'ciberseguridad', 'sicurezza informatica',
        'cyberbezpieczeństwo', 'security operations center'),
      'news_queries', jsonb_build_array(
        'cybersecurity contract awarded Europe', 'NIS2 cybersecurity procurement',
        'security operations centre government Europe', 'penetration testing public sector contract'),
      'web_queries', jsonb_build_array(
        'cybersecurity software tender Europe', 'SOC procurement public sector',
        'penetration testing government contract', 'cybersecurity monitoring tender'),
      'relevance_rubric', $cy_r$## Task
Score relevance 0-100 for a cybersecurity company that delivers software and services.
- 90-100: a tender or grant to run a SOC, monitor, test or build security software for a public body.
- 75-89: application security, incident response, or NIS2 technical work a firm could bid.
- 60-74: a buyer preparing that kind of procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Physical security, cameras and locks, insurance, staffing with no system, a passing mention of cyber, job postings, conferences.$cy_r$,
      'importance_rubric', $cy_i$`importance` (0-100) is how much a cybersecurity firm should care.
- 85-100: a national SOC, a large security-software framework, or a new EU security scheme that creates tenders.
- 60-84: a ministry or operator buying monitoring, testing or incident response.
- 30-59: regulation and smaller regional deals.
- 0-29: generic breach news with no buyer.$cy_i$),
    search_status = 'applied', updated_at = now()
  where id = '728ee3ba-8485-4939-9dcd-9014d7a46b0a' and name = 'Cybersecurity';

  update scopes set instructions = $id$Tenders and grants for digital identity besides the EUDI Wallet: biometrics, onboarding, KYC, identity proofing and fraud detection.

Go for: face, fingerprint and voice identification, citizen and customer onboarding, KYC and identity proofing, and fraud or deepfake detection a software company would deliver.

Out of scope: the EUDI Wallet and national EUDI wallet rollouts, payment cards, and printing physical ID cards.$id$,
    search_config = jsonb_build_object(
      'topic', 'Digital ID & Biometrics',
      'site_query', 'biometric identification KYC identity verification tender',
      'ted_phrases', jsonb_build_array(
        'biometric identification', 'facial recognition', 'fingerprint identification', 'identity verification',
        'know your customer', 'digital onboarding', 'Gesichtserkennung', 'reconnaissance faciale',
        'reconocimiento facial', 'riconoscimento facciale'),
      'news_queries', jsonb_build_array(
        'biometric identity tender Europe', 'KYC onboarding public sector contract',
        'facial recognition procurement government', 'identity verification software tender'),
      'web_queries', jsonb_build_array(
        'biometrics identity verification procurement Europe', 'KYC digital onboarding government',
        'fingerprint identification system tender', 'fraud detection identity software contract'),
      'relevance_rubric', $id_r$## Task
Score relevance 0-100 for a company that sells biometrics, KYC or identity-proofing software. The EUDI Wallet is a different scope.
- 90-100: a tender or grant for biometric identification, identity proofing, KYC or onboarding software.
- 75-89: fraud or deepfake detection tied to identifying a person, for a public buyer.
- 60-74: a buyer preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
EUDI Wallet and national EUDI rollouts, payment cards, physical ID-card production, generic cybersecurity with no identity check, job postings.$id_r$,
      'importance_rubric', $id_i$`importance` (0-100) is how much a biometrics or KYC vendor should care.
- 85-100: a national biometric or identity-proofing system going to tender.
- 60-84: a border, police, bank-supervisor or city buyer committing to biometrics or KYC software.
- 30-59: standards and smaller pilots.
- 0-29: wallet news with no biometric system to sell.$id_i$),
    search_status = 'applied', updated_at = now()
  where id = '7875a7ef-d77c-49f0-b9ea-133a103ff009' and name = 'Digital ID & Biometrics';

  update scopes set instructions = $hs$Software tenders for hospitals and health services: clinical systems, records and the software around them.

Go for: hospital information systems, electronic health records, patient administration, laboratory and imaging software, and health-data platforms a software company would build or implement.

Out of scope: medicines, scanners and other medical devices with no software to implement, hospital construction, and staffing.$hs$,
    search_config = jsonb_build_object(
      'topic', 'Healthcare software',
      'site_query', 'hospital information system electronic health record software tender',
      'ted_phrases', jsonb_build_array(
        'hospital information system', 'electronic health record', 'patient administration system', 'laboratory information system',
        'Krankenhausinformationssystem', 'dossier patient informatisé', 'historia clínica electrónica',
        'cartella clinica elettronica', 'elektronische Patientenakte', 'système d''information hospitalier'),
      'news_queries', jsonb_build_array(
        'hospital information system tender Europe', 'electronic health record procurement',
        'health software contract awarded Europe', 'laboratory information system tender'),
      'web_queries', jsonb_build_array(
        'hospital information system procurement Europe', 'electronic patient record software tender',
        'laboratory information system contract', 'patient administration system tender'),
      'relevance_rubric', $hs_r$## Task
Score relevance 0-100 for a company that implements clinical and health-record software.
- 90-100: a tender or grant to build or run a hospital system, electronic health record, patient administration or laboratory system.
- 75-89: imaging or health-data software a vendor would implement, not the scanner itself.
- 60-74: a hospital preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Medicines, medical devices and imaging hardware with no software, construction, staffing, job postings.$hs_r$,
      'importance_rubric', $hs_i$`importance` (0-100) is how much a health-software vendor should care.
- 85-100: a national or large hospital-group clinical system going to tender.
- 60-84: a hospital buying records, laboratory or patient-administration software.
- 30-59: digital-health policy and smaller pilots.
- 0-29: device news and general health policy.$hs_i$),
    search_status = 'applied', updated_at = now()
  where id = 'ab506178-f22e-49f0-bfa4-c91f1198cd21' and name = 'Healthcare software';

  update scopes set instructions = $erp$Large software tenders for the systems public bodies run on: ERP, finance, HR and case management.

Go for: enterprise resource planning, finance and HR suites, case management and registries, and the implementation work around them.

Out of scope: hardware-only supply, body-shopping with no system, and construction.$erp$,
    search_config = jsonb_build_object(
      'topic', 'ERP & business software',
      'site_query', 'ERP enterprise resource planning finance system public tender',
      'ted_phrases', jsonb_build_array(
        'enterprise resource planning', 'ERP system', 'SAP S/4HANA', 'case management system',
        'Finanzwesen ERP', 'progiciel de gestion', 'planificación de recursos empresariales',
        'sistema gestionale ERP', 'system ERP', 'human resources information system'),
      'news_queries', jsonb_build_array(
        'ERP contract public sector Europe', 'government finance system tender',
        'SAP implementation public sector Europe', 'case management system procurement'),
      'web_queries', jsonb_build_array(
        'enterprise resource planning tender Europe', 'ERP implementation government contract',
        'finance system software procurement', 'HR information system public tender'),
      'relevance_rubric', $erp_r$## Task
Score relevance 0-100 for a company that implements ERP, finance, HR or case-management software.
- 90-100: a tender to supply or implement an ERP, finance, HR or case-management platform.
- 75-89: a framework for that implementation, including a named product such as SAP.
- 60-74: a buyer preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Hardware-only supply, contractors with no system, construction, a passing mention of software, job postings.$erp_r$,
      'importance_rubric', $erp_i$`importance` (0-100) is how much an ERP implementer should care.
- 85-100: a ministry or national agency replacing its finance or ERP core.
- 60-84: a city, hospital or agency buying case management or HR software.
- 30-59: vendor news and smaller upgrades.
- 0-29: generic digital-government stories.$erp_i$),
    search_status = 'applied', updated_at = now()
  where id = '596df943-f208-4838-a42c-d8a6312f4bd8' and name = 'ERP & business software';

  update scopes set instructions = $cl$Software tenders for cloud platforms and the move onto them.

Go for: government and sovereign cloud, cloud platforms, migration of information systems, and platform engineering a software company would deliver.

Out of scope: telecom circuits, buying laptops or servers on their own, and a passing mention of cloud.$cl$,
    search_config = jsonb_build_object(
      'topic', 'Cloud platforms',
      'site_query', 'government cloud sovereign cloud platform migration tender',
      'ted_phrases', jsonb_build_array(
        'cloud platform', 'government cloud', 'sovereign cloud', 'cloud migration',
        'Cloud-Plattform', 'souveräne Cloud', 'informatique en nuage', 'nube soberana',
        'cloud souverain', 'piattaforma cloud'),
      'news_queries', jsonb_build_array(
        'government cloud contract Europe', 'sovereign cloud procurement',
        'cloud platform public sector Europe', 'cloud migration government contract'),
      'web_queries', jsonb_build_array(
        'government cloud platform tender', 'sovereign cloud procurement Europe',
        'cloud migration information system tender', 'public cloud framework agreement'),
      'relevance_rubric', $cl_r$## Task
Score relevance 0-100 for a company that builds or migrates cloud platforms for the public sector.
- 90-100: a tender for a cloud platform, sovereign cloud, or migration of information systems onto the cloud.
- 75-89: platform engineering or a cloud framework a software company would deliver.
- 60-74: a buyer preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Circuits and connectivity only, laptops and servers with no platform, a passing mention of cloud, job postings.$cl_r$,
      'importance_rubric', $cl_i$`importance` (0-100) is how much a cloud-platform vendor should care.
- 85-100: a national sovereign-cloud or government-cloud framework.
- 60-84: an agency migrating its systems or buying a platform.
- 30-59: cloud policy and smaller deals.
- 0-29: product launches with no public buyer.$cl_i$),
    search_status = 'applied', updated_at = now()
  where id = '07543fc3-0106-4921-9064-0a3bbea814cd' and name = 'Cloud platforms';

  update scopes set
    search_config = coalesce(search_config, '{}'::jsonb) || jsonb_build_object(
      'site_query', 'EUDI wallet digital identity wallet eIDAS tender procurement',
      'relevance_rubric', $eu_r$## Task
Score relevance 0-100 for a company that builds, certifies or connects the European Digital Identity Wallet.
- 90-100: direct procurement or funding for the EUDI Wallet, a national wallet, wallet certification, a PID issuer, or national wallet infrastructure.
- 75-89: issuer or relying-party infrastructure, QEAA, mDL, or identity proofing for the wallet.
- 60-74: national digital identity, mobile ID, PKI or digital signatures that sit next to a wallet programme.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Cryptocurrency and payment wallets, password managers, generic IAM with no wallet, pure document scanning, pure cybersecurity with no identity angle, physical ID-card production, biometrics with no wallet, academic papers, conferences, job postings.$eu_r$,
      'importance_rubric', $eu_i$`importance` (0-100) is how much a wallet vendor should care.
- 85-100: a national wallet launch or procurement, or a new certification scheme.
- 60-84: a ministry, bank or regulator committing to the EUDI Wallet.
- 30-59: standards, surveys and smaller pilots.
- 0-29: generic explainers.$eu_i$),
    updated_at = now()
  where id = eudi and name = 'EUDI Wallet';

  insert into scopes (name, instructions, active, is_default, catalog, workspace_id, owner_id, search_config, search_status)
  select v.name, v.instructions, true, false, true, platform, null::uuid, v.search_config, 'applied'
  from (values
    ('Workplace devices',
     $hw1$Tenders for the computers people are issued at work: laptops, desktops, monitors and the frameworks resellers bid for.

Go for: notebooks, desktop PCs, monitors, docking stations and workplace-device frameworks.

Out of scope: servers, network equipment, software licences on their own, and phones with no computer.$hw1$,
     jsonb_build_object(
       'topic', 'Workplace devices',
       'site_query', 'laptop notebook desktop computer public tender framework',
       'ted_phrases', jsonb_build_array('portable computers', 'notebook computer', 'laptop computer', 'desktop computer', 'ordinateur portable', 'ordenador portátil', 'Notebooks', 'komputery przenośne', 'personal computers', 'computer hardware'),
       'news_queries', jsonb_build_array('laptop framework agreement government Europe', 'public sector PC tender awarded', 'notebook computer procurement Europe'),
       'web_queries', jsonb_build_array('laptop tender public sector Europe', 'desktop computer framework agreement', 'notebook procurement government'),
       'relevance_rubric', $hw1r$## Task
Score relevance 0-100 for a company that supplies workplace computers.
- 90-100: a tender or framework for laptops, desktops, monitors or docking stations.
- 75-89: a refresh of end-user devices for a ministry, school system or hospital group.
- 60-74: a buyer preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Servers and storage, network equipment, software-only licences, mobile phones alone, job postings.$hw1r$,
       'importance_rubric', $hw1i$`importance` (0-100) is how much a workplace-device supplier should care.
- 85-100: a national or central-purchasing framework for PCs or laptops.
- 60-84: a large employer of public staff refreshing devices.
- 30-59: smaller lots.
- 0-29: consumer gadget news.$hw1i$)),
    ('Servers & data centres',
     $hw2$Tenders for the machines in the computer room: servers, storage and data-centre equipment.

Go for: servers, storage arrays, hyperconverged systems and data-centre hardware a supplier or integrator would deliver.

Out of scope: laptops, cloud services with no equipment, and software licences on their own.$hw2$,
     jsonb_build_object(
       'topic', 'Servers & data centres',
       'site_query', 'server storage data centre equipment public tender',
       'ted_phrases', jsonb_build_array('computer servers', 'data centre', 'data center', 'storage system', 'serveurs informatiques', 'Rechenzentrum', 'centro de datos', 'disk array', 'hyperconverged', 'server hardware'),
       'news_queries', jsonb_build_array('government server tender Europe', 'data centre equipment procurement', 'public sector storage contract awarded'),
       'web_queries', jsonb_build_array('server hardware tender Europe', 'data centre equipment procurement', 'storage array public sector contract'),
       'relevance_rubric', $hw2r$## Task
Score relevance 0-100 for a company that supplies servers and data-centre equipment.
- 90-100: a tender for servers, storage or data-centre hardware.
- 75-89: a refresh or expansion of a public computer room, including the equipment.
- 60-74: a buyer preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Laptops and desktops, cloud subscriptions with no hardware, software-only, construction of the building with no IT equipment, job postings.$hw2r$,
       'importance_rubric', $hw2i$`importance` (0-100) is how much a server vendor should care.
- 85-100: a national data-centre or server framework.
- 60-84: an agency buying a storage or server lot.
- 30-59: smaller refreshes.
- 0-29: cloud opinion with no equipment.$hw2i$)),
    ('Networks & telecoms',
     $hw3$Tenders for the network itself: switches, Wi-Fi, routers and telecom equipment.

Go for: LAN and Wi-Fi, routers, optical and radio equipment, and the hardware a network supplier would deliver.

Out of scope: cybersecurity software with no equipment, mobile-phone fleets, and pure connectivity contracts with no gear.$hw3$,
     jsonb_build_object(
       'topic', 'Networks & telecoms',
       'site_query', 'network switch Wi-Fi router telecom equipment tender',
       'ted_phrases', jsonb_build_array('network equipment', 'network switch', 'wireless network', 'local area network', 'équipements de réseau', 'Netzwerkausrüstung', 'equipos de red', 'Wi-Fi', 'router', 'telecommunications equipment'),
       'news_queries', jsonb_build_array('network equipment tender government Europe', 'public sector Wi-Fi procurement', 'telecom equipment contract awarded Europe'),
       'web_queries', jsonb_build_array('network switch tender public sector', 'Wi-Fi procurement government Europe', 'router framework agreement public'),
       'relevance_rubric', $hw3r$## Task
Score relevance 0-100 for a company that supplies network and telecom equipment.
- 90-100: a tender for switches, Wi-Fi, routers or telecom equipment.
- 75-89: a campus or nationwide network refresh that buys that equipment.
- 60-74: a buyer preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Security software with no equipment, mobile handsets, leased lines with no gear, job postings.$hw3r$,
       'importance_rubric', $hw3i$`importance` (0-100) is how much a network-equipment supplier should care.
- 85-100: a national or campus-wide network framework.
- 60-84: a city, university or operator buying LAN or radio equipment.
- 30-59: smaller lots.
- 0-29: telecom policy with no purchase.$hw3i$)),
    ('Medical equipment',
     $hw4$Tenders for the devices hospitals buy: imaging, monitors and other medical equipment. Not the software that runs the hospital.

Go for: scanners, X-ray, monitoring, laboratory instruments and other medical devices manufacturers and distributors bid for.

Out of scope: hospital information systems, electronic health records, medicines, and hospital construction.$hw4$,
     jsonb_build_object(
       'topic', 'Medical equipment',
       'site_query', 'medical imaging scanner patient monitor equipment tender',
       'ted_phrases', jsonb_build_array('medical imaging', 'magnetic resonance', 'computed tomography', 'patient monitor', 'imagerie médicale', 'Medizintechnik', 'equipo médico', 'diagnostic imaging', 'X-ray equipment', 'ultrasound scanner'),
       'news_queries', jsonb_build_array('hospital imaging equipment tender Europe', 'MRI scanner procurement', 'medical device contract awarded public hospital'),
       'web_queries', jsonb_build_array('medical imaging tender Europe', 'CT scanner procurement hospital', 'patient monitor framework agreement'),
       'relevance_rubric', $hw4r$## Task
Score relevance 0-100 for a company that supplies medical devices.
- 90-100: a tender for imaging, monitors, laboratory instruments or other medical devices.
- 75-89: a hospital equipping a ward or radiology department.
- 60-74: a buyer preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Hospital software and electronic records, medicines, construction, staffing, job postings.$hw4r$,
       'importance_rubric', $hw4i$`importance` (0-100) is how much a medical-device supplier should care.
- 85-100: a national imaging framework or a large hospital capital buy.
- 60-84: a hospital tendering scanners or monitors.
- 30-59: smaller device lots.
- 0-29: clinical research with no purchase.$hw4i$)),
    ('Building energy renovation',
     $g1$The busiest green market: renovating public buildings so they use less energy. Many contractors bid on every lot.

Go for: insulation, windows, heat pumps, HVAC and energy-performance contracts for schools, offices and housing.

Out of scope: new power plants, waste collection, and software with no works.$g1$,
     jsonb_build_object(
       'topic', 'Building energy renovation',
       'site_query', 'building energy renovation heat pump insulation tender',
       'ted_phrases', jsonb_build_array('energy performance contract', 'thermal insulation', 'heat pump', 'building renovation', 'Wärmedämmung', 'pompe à chaleur', 'aislamiento térmico', 'riqualificazione energetica', 'energy efficiency renovation', 'Wärmepumpe'),
       'news_queries', jsonb_build_array('building energy renovation tender Europe', 'heat pump public buildings contract', 'energy performance contract awarded Europe'),
       'web_queries', jsonb_build_array('energy efficiency renovation tender Europe', 'heat pump school procurement', 'thermal insulation public building contract'),
       'relevance_rubric', $g1r$## Task
Score relevance 0-100 for a contractor that renovates buildings for energy performance.
- 90-100: a tender for insulation, windows, heat pumps, HVAC or an energy-performance contract on buildings.
- 75-89: a renovation programme for schools, housing or offices where those works are the job.
- 60-74: a buyer preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Power plants, waste, vehicles, software-only, new construction with no energy scope, job postings.$g1r$,
       'importance_rubric', $g1i$`importance` (0-100) is how much an energy-renovation contractor should care.
- 85-100: a national or city-wide renovation framework.
- 60-84: a school or housing stock going to tender for insulation or heat pumps.
- 30-59: smaller buildings.
- 0-29: climate policy with no works.$g1i$)),
    ('Solar & wind',
     $g2$Tenders to build renewable generation: solar on public roofs and land, and wind. Installers and developers compete hard for these.

Go for: photovoltaic plants and rooftop solar, wind turbines, and the installation contracts around them.

Out of scope: building insulation with no generation, fossil plants, and electricity supply contracts with no assets to build.$g2$,
     jsonb_build_object(
       'topic', 'Solar & wind',
       'site_query', 'photovoltaic solar wind turbine public tender',
       'ted_phrases', jsonb_build_array('photovoltaic', 'solar power plant', 'wind turbine', 'renewable energy', 'Photovoltaikanlage', 'énergie solaire', 'energía fotovoltaica', 'impianto fotovoltaico', 'éolienne', 'solar panels'),
       'news_queries', jsonb_build_array('photovoltaic tender public sector Europe', 'wind farm procurement Europe', 'rooftop solar government contract'),
       'web_queries', jsonb_build_array('photovoltaic installation tender Europe', 'wind turbine procurement public', 'solar power plant public contract'),
       'relevance_rubric', $g2r$## Task
Score relevance 0-100 for a company that builds solar or wind generation.
- 90-100: a tender to install photovoltaic systems or wind turbines.
- 75-89: a public rooftop or land programme whose works are solar or wind.
- 60-74: a buyer preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Insulation and heat pumps with no generation, fossil generation, power-supply contracts with no plant, waste, job postings.$g2r$,
       'importance_rubric', $g2i$`importance` (0-100) is how much a solar or wind developer should care.
- 85-100: a utility or national solar or wind tender.
- 60-84: a city or public landlord covering roofs with solar.
- 30-59: smaller installations.
- 0-29: technology explainers.$g2i$)),
    ('Waste & recycling',
     $g3$Municipal waste is one of the most competed public markets: collection, sorting and recycling, tendered again and again.

Go for: waste collection, sorting plants, recycling and circular-economy services a contractor would run.

Out of scope: water treatment, energy generation, and one-off litter picks with no contract.$g3$,
     jsonb_build_object(
       'topic', 'Waste & recycling',
       'site_query', 'waste collection recycling circular economy tender',
       'ted_phrases', jsonb_build_array('waste collection', 'waste management', 'recycling', 'circular economy', 'Abfallentsorgung', 'collecte des déchets', 'recogida de residuos', 'raccolta rifiuti', 'waste treatment', 'tri des déchets'),
       'news_queries', jsonb_build_array('waste collection contract awarded Europe', 'recycling plant tender municipal', 'circular economy procurement Europe'),
       'web_queries', jsonb_build_array('waste collection tender Europe', 'recycling services municipal contract', 'waste management procurement public'),
       'relevance_rubric', $g3r$## Task
Score relevance 0-100 for a waste and recycling contractor.
- 90-100: a tender for waste collection, a sorting plant, or recycling services.
- 75-89: a municipal circular-economy contract an operator would run.
- 60-74: a city preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Water and wastewater, power plants, building works, software-only, job postings.$g3r$,
       'importance_rubric', $g3i$`importance` (0-100) is how much a waste contractor should care.
- 85-100: a large city or regional collection or treatment contract.
- 60-84: a municipality retendering recycling or collection.
- 30-59: smaller lots.
- 0-29: lifestyle recycling tips.$g3i$)),
    ('Electric buses & charging',
     $g4$Tenders for clean public transport: electric buses and the chargers they need. A handful of manufacturers and charging firms bid on almost every lot.

Go for: battery-electric buses, trolley and electric bus fleets, and depot or public charging infrastructure.

Out of scope: diesel buses, private cars, rail rolling stock, and electricity supply with no vehicles or chargers.$g4$,
     jsonb_build_object(
       'topic', 'Electric buses & charging',
       'site_query', 'electric bus charging station public transport tender',
       'ted_phrases', jsonb_build_array('electric bus', 'battery electric bus', 'charging station', 'electric vehicle charging', 'Elektrobus', 'bus électrique', 'autobús eléctrico', 'autobus elettrico', 'charging infrastructure', 'borne de recharge'),
       'news_queries', jsonb_build_array('electric bus tender Europe', 'public charging infrastructure procurement', 'battery electric bus contract awarded'),
       'web_queries', jsonb_build_array('electric bus procurement Europe', 'depot charging tender public transport', 'electric vehicle charging framework'),
       'relevance_rubric', $g4r$## Task
Score relevance 0-100 for a company that supplies electric buses or charging equipment.
- 90-100: a tender for electric buses or for charging stations and depot charging.
- 75-89: a city converting a bus fleet, including the vehicles or the chargers.
- 60-74: a transport authority preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Diesel-only fleets, cars, trains, power contracts with no charger or vehicle, job postings.$g4r$,
       'importance_rubric', $g4i$`importance` (0-100) is how much an electric-bus or charging supplier should care.
- 85-100: a capital or national zero-emission bus framework.
- 60-84: a city buying a fleet or a depot charging system.
- 30-59: smaller pilots.
- 0-29: passenger-car news.$g4i$)),
    ('Water & wastewater',
     $g5$Tenders for drinking water and sewage: treatment plants, networks and the operating contracts. Specialist contractors bid on these continuously.

Go for: wastewater treatment, drinking-water plants, sewers and water-network works an operator or contractor would deliver.

Out of scope: solid waste, building renovation, and software with no plant or network.$g5$,
     jsonb_build_object(
       'topic', 'Water & wastewater',
       'site_query', 'wastewater treatment drinking water plant tender',
       'ted_phrases', jsonb_build_array('wastewater treatment', 'sewage treatment', 'drinking water', 'water treatment plant', 'Abwasserbehandlung', 'traitement des eaux usées', 'tratamiento de aguas residuales', 'depurazione delle acque', 'sewer network', 'eau potable'),
       'news_queries', jsonb_build_array('wastewater treatment tender Europe', 'drinking water plant procurement', 'sewage contract awarded municipality'),
       'web_queries', jsonb_build_array('wastewater treatment plant tender', 'drinking water infrastructure procurement Europe', 'sewer rehabilitation contract'),
       'relevance_rubric', $g5r$## Task
Score relevance 0-100 for a water and wastewater contractor.
- 90-100: a tender for a treatment plant, a sewer or drinking-water network, or operating one.
- 75-89: rehabilitation of water infrastructure a contractor would build.
- 60-74: a utility preparing that procurement.
- below 60: still return the record.

## Automatic suppression (return relevance=0)
Solid waste, building energy works, bottled water, software-only, job postings.$g5r$,
       'importance_rubric', $g5i$`importance` (0-100) is how much a water contractor should care.
- 85-100: a city or utility tendering a treatment plant or a long operating contract.
- 60-84: network rehabilitation or a smaller plant.
- 30-59: maintenance lots.
- 0-29: water-quality explainers.$g5i$))
  ) as v(name, instructions, search_config)
  where not exists (select 1 from scopes s where s.catalog and s.name = v.name);

  insert into sources (source_id, name, source_type, url, feed_url, method, enabled, check_every_days, status, priority, rss_available) values
    ('CAT-AI-REG', 'The Register — AI', 'NEWS', 'https://www.theregister.com/software/ai_ml/', 'https://www.theregister.com/software/ai_ml/headlines.atom', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-AI-EC', 'European Commission — AI policy', 'EU_PROGRAMME', 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai', null, 'site_search', true, 2, 'ACTIVE', 2, false),
    ('CAT-CY-REG', 'The Register — security', 'NEWS', 'https://www.theregister.com/security/', 'https://www.theregister.com/security/headlines.atom', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-CY-ENISA', 'ENISA', 'STANDARDS_BODY', 'https://www.enisa.europa.eu', null, 'site_search', true, 2, 'ACTIVE', 2, false),
    ('CAT-ID-BIO', 'Biometric Update', 'NEWS', 'https://www.biometricupdate.com', 'https://www.biometricupdate.com/rss', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-ID-HA', 'European Commission — home affairs information systems', 'EU_PROGRAMME', 'https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/eu-information-systems_en', null, 'site_search', true, 2, 'ACTIVE', 2, false),
    ('CAT-HS-EC', 'European Commission — digital health', 'EU_PROGRAMME', 'https://health.ec.europa.eu/ehealth-digital-health-and-care_en', null, 'site_search', true, 2, 'ACTIVE', 2, false),
    ('CAT-ERP-SAP', 'SAP News', 'INDUSTRY_SOURCE', 'https://news.sap.com', 'https://news.sap.com/feed/', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-CL-REG', 'The Register — cloud and off-prem', 'NEWS', 'https://www.theregister.com/off_prem/', 'https://www.theregister.com/off_prem/headlines.atom', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-CL-EC', 'European Commission — cloud policy', 'EU_PROGRAMME', 'https://digital-strategy.ec.europa.eu/en/policies/cloud-computing', null, 'site_search', true, 2, 'ACTIVE', 2, false),
    ('CAT-HW-PC', 'The Register — personal tech', 'NEWS', 'https://www.theregister.com/on_prem/personal_tech/', 'https://www.theregister.com/on_prem/personal_tech/headlines.atom', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-HW-SRV', 'The Register — on-prem', 'NEWS', 'https://www.theregister.com/on_prem/', 'https://www.theregister.com/on_prem/headlines.atom', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-HW-NET', 'Light Reading', 'NEWS', 'https://www.lightreading.com', 'https://www.lightreading.com/rss.xml', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-HW-MED', 'MedTech Dive', 'NEWS', 'https://www.medtechdive.com', 'https://www.medtechdive.com/feeds/news/', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-BLD', 'Construction Enquirer', 'NEWS', 'https://www.constructionenquirer.com', 'https://www.constructionenquirer.com/feed/', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-BLD-EC', 'European Commission — energy efficient buildings', 'EU_PROGRAMME', 'https://energy.ec.europa.eu/topics/energy-efficiency/energy-efficient-buildings_en', null, 'site_search', true, 2, 'ACTIVE', 2, false),
    ('CAT-GN-RES', 'pv magazine', 'NEWS', 'https://www.pv-magazine.com', 'https://www.pv-magazine.com/feed/', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-RES-EC', 'European Commission — renewable energy', 'EU_PROGRAMME', 'https://energy.ec.europa.eu/topics/renewable-energy_en', null, 'site_search', true, 2, 'ACTIVE', 2, false),
    ('CAT-GN-WST', 'Letsrecycle', 'NEWS', 'https://www.letsrecycle.com', 'https://www.letsrecycle.com/feed/', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-WST-EC', 'European Commission — waste and recycling', 'EU_PROGRAMME', 'https://environment.ec.europa.eu/topics/waste-and-recycling_en', null, 'site_search', true, 2, 'ACTIVE', 2, false),
    ('CAT-GN-BUS', 'Sustainable Bus', 'NEWS', 'https://www.sustainable-bus.com', 'https://www.sustainable-bus.com/feed/', 'rss', true, 1, 'ACTIVE', 2, true),
    ('CAT-GN-H2O', 'Water News Europe', 'NEWS', 'https://www.waternewseurope.com', 'https://www.waternewseurope.com/feed/', 'rss', true, 1, 'ACTIVE', 2, true)
  on conflict (source_id) do update set
    name = excluded.name, url = excluded.url, feed_url = excluded.feed_url,
    method = excluded.method, enabled = excluded.enabled, check_every_days = excluded.check_every_days,
    rss_available = excluded.rss_available;

  insert into scope_sources (scope_id, source_id)
  select s.id, x.source_id
  from (values
    ('Artificial Intelligence', 'CAT-AI-REG'),
    ('Artificial Intelligence', 'CAT-AI-EC'),
    ('Cybersecurity', 'CAT-CY-REG'),
    ('Cybersecurity', 'CAT-CY-ENISA'),
    ('Digital ID & Biometrics', 'CAT-ID-BIO'),
    ('Digital ID & Biometrics', 'CAT-ID-HA'),
    ('Healthcare software', 'CAT-HS-EC'),
    ('ERP & business software', 'CAT-ERP-SAP'),
    ('Cloud platforms', 'CAT-CL-REG'),
    ('Cloud platforms', 'CAT-CL-EC'),
    ('EUDI Wallet', 'CAT-ID-BIO'),
    ('Workplace devices', 'CAT-HW-PC'),
    ('Servers & data centres', 'CAT-HW-SRV'),
    ('Networks & telecoms', 'CAT-HW-NET'),
    ('Medical equipment', 'CAT-HW-MED'),
    ('Building energy renovation', 'CAT-GN-BLD'),
    ('Building energy renovation', 'CAT-GN-BLD-EC'),
    ('Solar & wind', 'CAT-GN-RES'),
    ('Solar & wind', 'CAT-GN-RES-EC'),
    ('Waste & recycling', 'CAT-GN-WST'),
    ('Waste & recycling', 'CAT-GN-WST-EC'),
    ('Electric buses & charging', 'CAT-GN-BUS'),
    ('Water & wastewater', 'CAT-GN-H2O')
  ) as x(scope_name, source_id)
  join scopes s on s.catalog and s.name = x.scope_name
  on conflict do nothing;

  select count(*) into n from scopes where is_default;
  if n <> 1 then raise exception 'expected one default scope, got %', n; end if;
  select count(*) into n from scopes where id = eudi and workspace_id = fc and catalog and not is_default;
  if n <> 1 then raise exception 'EUDI Wallet was moved'; end if;
  select count(*) into n from scopes where catalog and name in (
    'Artificial Intelligence', 'Cybersecurity', 'Digital ID & Biometrics', 'EUDI Wallet',
    'Healthcare software', 'ERP & business software', 'Cloud platforms',
    'Workplace devices', 'Servers & data centres', 'Networks & telecoms', 'Medical equipment',
    'Building energy renovation', 'Solar & wind', 'Waste & recycling', 'Electric buses & charging', 'Water & wastewater');
  if n <> 16 then raise exception 'expected 16 catalog scopes, got %', n; end if;
  select count(*) into n from scopes where catalog and name <> 'General' and id <> general
    and name in ('Artificial Intelligence','Cybersecurity','Digital ID & Biometrics','Healthcare software','ERP & business software','Cloud platforms')
    and jsonb_array_length(search_config->'ted_phrases') >= 8
    and coalesce(search_config->>'relevance_rubric','') like '%## Task%';
  if n <> 6 then raise exception 'a software catalog scope was not retuned (%)', n; end if;
  select count(*) into n from scope_sources ss join scopes s on s.id = ss.scope_id
    where s.catalog and s.name <> 'EUDI Wallet';
  if n < 22 then raise exception 'catalog follows missing (%)', n; end if;
  select count(*) into n from scope_sources where scope_id = eudi;
  if n < 35 then raise exception 'EUDI follows dropped (%)', n; end if;
  select count(*) into n from workspace_scope_picks p
    join scopes s on s.id = p.scope_id
    where s.name in (
      'Workplace devices', 'Servers & data centres', 'Networks & telecoms', 'Medical equipment',
      'Building energy renovation', 'Solar & wind', 'Waste & recycling', 'Electric buses & charging', 'Water & wastewater');
  if n <> 0 then raise exception 'new scopes were turned on (%)', n; end if;
  select count(*) into n from scopes where id = general and is_default and search_config->>'mode' = 'generic';
  if n <> 1 then raise exception 'General was changed'; end if;
end $$;
