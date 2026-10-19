// Starter product catalogue for `npm run seed:products`. Every product is
// tagged with the service types it's typically used for, so each of the
// default services (seed.js) ends up with 9–10 relevant products. Image URLs
// live in productImages.json (resolved from Wikimedia Commons by sku).
//
// Prices are INR, tax-inclusive selling prices; `mrp` is the printed price.

const HK = 'Housekeeper'
const HKS = 'Housekeeping Supervisor'
const PANTRY = 'Pantry Boy'
const OFFICE = 'Office Boy'
const HELPER = 'Helper'
const PEON = 'Peon'
const LABOUR = 'Labour'
const PLUMBER = 'Plumber'
const CCTV = 'CCTV Operator'
const ELEC = 'Electrician'
const WTP = 'WTP Operator'
const DG = 'DG Operator'
const STP = 'STP Operator'
const BMS = 'BMS Operator'
const GARDENER = 'Gardener'
const GARDEN_SUP = 'Gardening Supervisor'
const TECH_SUP = 'Technical Supervisor'
const LEADER = 'Group Leader'
const GEN_SUP = 'General Supervisor'
const FM = 'Facility Manager'

// [sku, name, category, brand, unit, packSize, price, mrp, stock, services, description, imageQuery]
const ROWS = [
  // ── Cleaning ──────────────────────────────────────────────────────────────
  ['CLN-001', 'Bleaching Powder', 'Cleaning Supplies', 'CleanMax', 'packet', '1 kg', 85, 99, 400, [HK, WTP], 'Stabilised chlorine bleaching powder for toilets, drains and water disinfection.', 'bleaching powder'],
  ['CLN-002', 'Phenyl Floor Cleaner', 'Cleaning Supplies', 'CleanMax', 'can', '5 L', 450, 520, 150, [HK], 'Concentrated black phenyl for daily floor mopping; dilute 1:20.', 'floor cleaner bottle'],
  ['CLN-003', 'Toilet Bowl Cleaner', 'Cleaning Supplies', 'Harpic', 'bottle', '1 L', 199, 225, 220, [HK], 'Thick liquid cleaner that removes hard-water stains and kills germs.', 'toilet cleaner'],
  ['CLN-004', 'Glass & Surface Cleaner Spray', 'Cleaning Supplies', 'Colin', 'bottle', '500 ml', 120, 140, 180, [HK, OFFICE], 'Streak-free cleaner for glass, mirrors and desks.', 'glass cleaner spray bottle'],
  ['CLN-005', 'Microfiber Cleaning Cloth', 'Cleaning Supplies', 'Gala', 'pack', '5 cloths', 249, 299, 200, [HK], 'Lint-free, washable cloths for dusting and wiping.', 'microfiber cloth'],
  ['CLN-006', 'Spin Mop with Bucket', 'Cleaning Supplies', 'Gala', 'set', '1 set', 1299, 1599, 40, [HK], '360° spin mop with wringer bucket and two refills.', 'spin mop bucket'],
  ['CLN-007', 'Garbage Bags (Large)', 'Cleaning Supplies', 'Ezee', 'roll', '30 bags', 150, 175, 300, [HK], 'Leak-proof 30 × 37 in. black garbage bags.', 'garbage bag roll'],
  ['CLN-008', 'Toilet Scrub Brush', 'Cleaning Supplies', 'Gala', 'piece', '1 pc', 99, 129, 160, [HK], 'Hockey-stick shaped brush for under-rim cleaning.', 'toilet brush'],
  ['CLN-009', 'Air Freshener Spray', 'Cleaning Supplies', 'Odonil', 'can', '240 ml', 225, 250, 150, [HK], 'Long-lasting room freshener for washrooms and lobbies.', 'air freshener spray can'],
  ['CLN-010', 'Disinfectant Surface Cleaner', 'Cleaning Supplies', 'Lizol', 'bottle', '1 L', 299, 339, 180, [HK], 'Kills 99.9% germs on floors, counters and door handles.', 'disinfectant cleaner bottle'],
  ['CLN-011', 'Liquid Hand Wash Refill', 'Cleaning Supplies', 'Dettol', 'can', '5 L', 650, 749, 80, [HKS], 'Bulk refill for washroom soap dispensers.', 'liquid hand soap dispenser'],
  ['CLN-012', 'Housekeeping Service Trolley', 'Cleaning Supplies', 'Prestige Pro', 'piece', '1 unit', 6499, 7499, 10, [HKS], 'Multi-shelf janitorial cart with waste bag holder and mop bucket bay.', 'janitorial cart'],
  ['CLN-013', 'Trigger Spray Bottle', 'Cleaning Supplies', 'Gala', 'piece', '500 ml', 79, 99, 250, [HKS], 'Refillable bottle for diluted chemicals; adjustable nozzle.', 'trigger spray bottle'],
  ['CLN-014', 'Toilet Tissue Rolls', 'Cleaning Supplies', 'Origami', 'pack', '10 rolls', 299, 349, 200, [HKS, OFFICE], '2-ply soft toilet rolls, 200 sheets each.', 'toilet paper rolls'],
  ['CLN-015', 'Housekeeping Apron', 'Cleaning Supplies', 'Uniform Hub', 'piece', '1 pc', 199, 249, 100, [HKS], 'Water-resistant apron with front pockets.', 'apron'],
  ['CLN-016', 'Dishwash Liquid Gel', 'Pantry', 'Vim', 'bottle', '750 ml', 135, 155, 200, [PANTRY], 'Lemon dishwash gel; cuts grease on cups and plates.', 'dishwashing liquid'],
  ['CLN-017', 'Sponge Scrub Pads', 'Pantry', 'Scotch-Brite', 'pack', '6 pads', 90, 110, 250, [PANTRY], 'Dual-sided sponge wipes for utensils.', 'scouring pad sponge'],
  ['CLN-018', 'Bulk Hand Sanitizer', 'Safety & PPE', 'Dettol', 'can', '5 L', 899, 999, 90, [HKS, GEN_SUP, LEADER], '70% alcohol sanitizer for reception and entry points.', 'hand sanitizer'],

  // ── Pantry ────────────────────────────────────────────────────────────────
  ['PAN-001', 'Tea Bags', 'Pantry', 'Tata Tea', 'box', '100 bags', 275, 300, 150, [PANTRY], 'Assam CTC tea bags for office pantry.', 'tea bags'],
  ['PAN-002', 'Instant Coffee', 'Pantry', 'Nescafé', 'jar', '200 g', 499, 560, 100, [PANTRY], 'Pure instant coffee granules.', 'instant coffee jar'],
  ['PAN-003', 'Sugar', 'Pantry', 'Madhur', 'packet', '1 kg', 55, 60, 300, [PANTRY], 'Refined white sugar.', 'sugar granulated'],
  ['PAN-004', 'Paper Cups', 'Pantry', 'EcoServe', 'pack', '100 cups', 120, 140, 300, [PANTRY], '150 ml food-grade paper cups for tea and coffee.', 'paper cups'],
  ['PAN-005', 'Electric Kettle', 'Pantry', 'Prestige', 'piece', '1.5 L', 999, 1295, 25, [PANTRY], 'Stainless steel kettle with auto shut-off.', 'electric kettle'],
  ['PAN-006', 'Dairy Whitener', 'Pantry', 'Amul', 'packet', '400 g', 210, 230, 120, [PANTRY], 'Milk powder for tea and coffee.', 'milk powder'],
  ['PAN-007', 'Stainless Steel Serving Tray', 'Pantry', 'Pigeon', 'piece', '1 pc', 349, 449, 40, [PANTRY], 'Rectangular tray with handles for serving tea.', 'serving tray stainless'],
  ['PAN-008', 'Drinking Water Jar', 'Pantry', 'Bisleri', 'jar', '20 L', 90, 100, 200, [PANTRY, OFFICE], 'Packaged drinking water for dispensers (jar deposit extra).', 'water jar 20 litre'],

  // ── Stationery ────────────────────────────────────────────────────────────
  ['OFF-001', 'A4 Copier Paper', 'Stationery', 'JK Copier', 'ream', '500 sheets', 320, 360, 200, [OFFICE, PEON], '75 GSM A4 paper for printers and copiers.', 'ream of paper'],
  ['OFF-002', 'Ball Pens', 'Stationery', 'Reynolds', 'box', '50 pens', 250, 300, 150, [OFFICE], 'Blue ball pens, smooth writing.', 'ballpoint pens'],
  ['OFF-003', 'Stapler with Pins', 'Stationery', 'Kangaro', 'set', '1 + 1000 pins', 180, 210, 100, [OFFICE, PEON], 'Desk stapler with a box of No.10 pins.', 'stapler'],
  ['OFF-004', 'Plastic File Folders', 'Stationery', 'Solo', 'pack', '10 folders', 220, 260, 120, [OFFICE], 'A4 button folders for documents.', 'file folders'],
  ['OFF-005', 'Sticky Notes', 'Stationery', 'Post-it', 'pack', '5 pads', 99, 120, 150, [OFFICE], '3 × 3 in. repositionable notes.', 'sticky notes'],
  ['OFF-006', 'Packaging Tape', 'Stationery', 'Sellotape', 'pack', '6 rolls', 240, 270, 120, [OFFICE], '2 in. brown BOPP tape for parcels.', 'packing tape roll'],
  ['OFF-007', 'Facial Tissue Box', 'Stationery', 'Origami', 'box', '200 pulls', 85, 99, 200, [OFFICE], '2-ply facial tissues for desks and meeting rooms.', 'tissue box'],
  ['OFF-008', 'Register / Ledger Book', 'Stationery', 'Navneet', 'piece', '200 pages', 150, 180, 150, [PEON, LEADER, GEN_SUP], 'Hard-bound register for visitors, attendance and dispatch logs.', 'ledger book'],
  ['OFF-009', 'Large Umbrella', 'Stationery', 'Citizen', 'piece', '1 pc', 399, 499, 50, [PEON], 'Golf-size umbrella for errands in the rain.', 'umbrella'],
  ['OFF-010', 'Rubber Bands', 'Stationery', 'Kangaro', 'packet', '100 g', 60, 75, 200, [PEON], 'Assorted size rubber bands.', 'rubber bands'],
  ['OFF-011', 'Glue Sticks', 'Stationery', 'Fevistik', 'pack', '6 sticks', 150, 180, 120, [PEON], 'Non-toxic glue sticks for paper.', 'glue stick'],
  ['OFF-012', 'Office Scissors', 'Stationery', 'Kangaro', 'piece', '8 in.', 120, 150, 100, [PEON], 'Stainless steel scissors with soft grip.', 'scissors'],
  ['OFF-013', 'Permanent Markers', 'Stationery', 'Camlin', 'pack', '10 markers', 200, 240, 120, [PEON], 'Black permanent markers for labelling.', 'permanent marker'],
  ['OFF-014', 'Courier Envelopes', 'Stationery', 'Solo', 'pack', '50 envelopes', 250, 290, 100, [PEON], 'Tamper-proof self-seal courier bags, 10 × 12 in.', 'envelopes'],
  ['OFF-015', 'A4 Clipboard', 'Stationery', 'Solo', 'piece', '1 pc', 120, 150, 120, [LEADER, GEN_SUP, HKS], 'Hardboard clipboard for checklists and inspection sheets.', 'clipboard'],

  // ── Tools & general support ───────────────────────────────────────────────
  ['GEN-001', 'Cotton Work Gloves', 'Safety & PPE', 'SafeHands', 'pack', '12 pairs', 199, 240, 200, [HELPER, LABOUR], 'Knitted cotton gloves for handling and loading.', 'work gloves'],
  ['GEN-002', 'Nylon Rope', 'Tools & Equipment', 'Garware', 'roll', '20 m', 249, 299, 80, [HELPER], '10 mm braided rope for tying and lifting.', 'rope coil'],
  ['GEN-003', 'Plastic Bucket', 'Tools & Equipment', 'Cello', 'piece', '20 L', 199, 249, 120, [HELPER], 'Heavy plastic bucket with steel handle.', 'plastic bucket'],
  ['GEN-004', 'Dustpan & Broom Set', 'Tools & Equipment', 'Gala', 'set', '1 set', 249, 299, 100, [HELPER], 'Long-handle dustpan with matching broom.', 'dustpan and brush'],
  ['GEN-005', 'Corrugated Carton Boxes', 'Tools & Equipment', 'PackIt', 'pack', '10 boxes', 450, 520, 60, [HELPER, PEON], '5-ply boxes, 18 × 12 × 12 in., for shifting and storage.', 'cardboard boxes'],
  ['GEN-006', 'Aluminium Step Ladder', 'Tools & Equipment', 'Bathla', 'piece', '5 steps', 3499, 4299, 15, [HELPER, FM], 'Foldable ladder with anti-slip steps, 150 kg load.', 'aluminium step ladder'],
  ['GEN-007', 'Hand Truck Trolley', 'Tools & Equipment', 'Stanley', 'piece', '150 kg', 2999, 3599, 12, [HELPER], 'Two-wheel trolley for moving cartons and cylinders.', 'hand truck'],
  ['GEN-008', 'Cable Ties', 'Tools & Equipment', 'Hellermann', 'pack', '100 ties', 120, 140, 300, [HELPER, CCTV], '200 mm nylon cable ties.', 'cable ties'],
  ['GEN-009', 'Tarpaulin Sheet', 'Tools & Equipment', 'Ganpati', 'piece', '12 × 15 ft', 899, 1099, 30, [HELPER], 'Waterproof HDPE tarpaulin for covering materials.', 'tarpaulin'],
  ['GEN-010', 'Rechargeable LED Torch', 'Tools & Equipment', 'Eveready', 'piece', '1 pc', 399, 499, 80, [HELPER, DG, TECH_SUP, LEADER], 'Bright LED torch with 6-hour backup.', 'flashlight torch'],
  ['GEN-011', 'Claw Hammer', 'Tools & Equipment', 'Taparia', 'piece', '500 g', 299, 349, 50, [LABOUR], 'Forged steel hammer with fibreglass handle.', 'claw hammer'],
  ['GEN-012', 'Measuring Tape', 'Tools & Equipment', 'Stanley', 'piece', '5 m', 149, 199, 100, [LABOUR], 'Steel measuring tape with lock.', 'tape measure'],
  ['GEN-013', 'Crowbar', 'Tools & Equipment', 'Taparia', 'piece', '3 ft', 499, 599, 30, [LABOUR], 'Hardened steel pry bar for demolition and lifting.', 'crowbar'],
  ['GEN-014', 'Shovel with Handle', 'Tools & Equipment', 'Falcon', 'piece', '1 pc', 449, 549, 40, [LABOUR], 'Steel shovel for sand, soil and debris.', 'shovel'],
  ['GEN-015', 'Wheelbarrow', 'Tools & Equipment', 'Falcon', 'piece', '85 L', 3499, 3999, 10, [LABOUR], 'Single-wheel barrow for moving materials on site.', 'wheelbarrow'],

  // ── Safety & PPE ──────────────────────────────────────────────────────────
  ['SAF-001', 'Nitrile Disposable Gloves', 'Safety & PPE', 'SafeHands', 'box', '100 gloves', 549, 649, 150, [HKS, STP], 'Powder-free gloves for chemical cleaning and sludge handling.', 'nitrile gloves'],
  ['SAF-002', '3-Ply Face Masks', 'Safety & PPE', 'SafeHands', 'box', '50 masks', 199, 250, 200, [HKS, LABOUR], 'Disposable masks for dust and odour.', 'surgical face mask'],
  ['SAF-003', 'Wet Floor Caution Sign', 'Safety & PPE', 'SafetyFirst', 'piece', '1 pc', 699, 799, 40, [HKS, GEN_SUP], 'Yellow A-frame "Caution Wet Floor" board.', 'wet floor sign'],
  ['SAF-004', 'Safety Helmet', 'Safety & PPE', 'Karam', 'piece', '1 pc', 249, 299, 100, [LABOUR, TECH_SUP], 'ISI-marked HDPE helmet with ratchet.', 'hard hat safety helmet'],
  ['SAF-005', 'Steel Toe Safety Shoes', 'Safety & PPE', 'Karam', 'pair', 'size 6–11', 1299, 1599, 60, [LABOUR], 'Oil-resistant sole with steel toe cap.', 'safety boots'],
  ['SAF-006', 'Reflective Safety Vest', 'Safety & PPE', 'Karam', 'piece', 'free size', 149, 199, 150, [LABOUR, LEADER], 'High-visibility vest with reflective strips.', 'high visibility vest'],
  ['SAF-007', 'Safety Goggles', 'Safety & PPE', '3M', 'piece', '1 pc', 149, 199, 100, [TECH_SUP], 'Anti-fog polycarbonate goggles.', 'safety goggles'],
  ['SAF-008', 'Heavy-Duty Rubber Gloves', 'Safety & PPE', 'SafeHands', 'pair', '18 in.', 199, 249, 120, [STP], 'Elbow-length gloves for sewage and chemicals.', 'rubber gloves'],
  ['SAF-009', 'PVC Gumboots', 'Safety & PPE', 'Bata', 'pair', 'size 6–11', 549, 649, 60, [STP, GARDEN_SUP], 'Knee-high waterproof boots.', 'rubber boots'],
  ['SAF-010', 'First Aid Kit', 'Safety & PPE', 'St Johns', 'box', '1 kit', 999, 1199, 40, [LEADER, GEN_SUP, FM], 'Wall-mountable kit with bandages, antiseptic and burn gel.', 'first aid kit'],
  ['SAF-011', 'Safety Traffic Cones', 'Safety & PPE', 'SafetyFirst', 'pack', '4 cones', 999, 1199, 30, [GEN_SUP], '750 mm PVC cones with reflective band.', 'traffic cones'],
  ['SAF-012', 'Fire Extinguisher (ABC)', 'Safety & PPE', 'Ceasefire', 'piece', '4 kg', 2499, 2999, 30, [GEN_SUP, FM], 'ISI-marked ABC dry powder extinguisher with wall bracket.', 'fire extinguisher'],
  ['SAF-013', 'Lockout Tagout Kit', 'Safety & PPE', 'Brady', 'set', '1 kit', 2499, 2899, 15, [TECH_SUP], 'Padlocks, hasps and tags for isolating equipment during maintenance.', 'lockout tagout'],

  // ── Plumbing ──────────────────────────────────────────────────────────────
  ['PLB-001', 'PVC Pipe ½ in.', 'Plumbing', 'Supreme', 'length', '3 m', 180, 210, 150, [PLUMBER], 'Pressure-rated PVC pipe for water lines.', 'pvc pipes'],
  ['PLB-002', 'PTFE Teflon Tape', 'Plumbing', 'Astral', 'pack', '10 rolls', 100, 120, 300, [PLUMBER], 'Thread-seal tape for leak-free joints.', 'ptfe tape'],
  ['PLB-003', 'Pipe Wrench', 'Plumbing', 'Taparia', 'piece', '14 in.', 549, 649, 40, [PLUMBER], 'Drop-forged adjustable pipe wrench.', 'pipe wrench'],
  ['PLB-004', 'Brass Bib Cock Tap', 'Plumbing', 'Jaquar', 'piece', '15 mm', 450, 549, 60, [PLUMBER], 'Chrome-plated wall tap for washrooms.', 'water tap faucet'],
  ['PLB-005', 'Ball Valve', 'Plumbing', 'Zoloto', 'piece', '1 in.', 350, 420, 80, [PLUMBER, WTP], 'Forged brass full-bore ball valve.', 'ball valve'],
  ['PLB-006', 'M-Seal Epoxy Compound', 'Plumbing', 'Pidilite', 'packet', '100 g', 60, 70, 250, [PLUMBER], 'Two-part putty for sealing pipe leaks.', 'epoxy putty'],
  ['PLB-007', 'Flexible Connection Hose', 'Plumbing', 'Jaquar', 'piece', '18 in.', 199, 249, 120, [PLUMBER], 'Stainless steel braided hose for basins and geysers.', 'braided hose'],
  ['PLB-008', 'Shower Head', 'Plumbing', 'Hindware', 'piece', '4 in.', 599, 749, 40, [PLUMBER], 'ABS overhead shower with anti-clog nozzles.', 'shower head'],
  ['PLB-009', 'Drain Cleaner Granules', 'Plumbing', 'Drainex', 'packet', '500 g', 199, 230, 120, [PLUMBER], 'Dissolves hair and grease blockages in drains.', 'drain cleaner'],
  ['PLB-010', 'PVC Solvent Cement', 'Plumbing', 'Astral', 'tin', '100 ml', 120, 140, 150, [PLUMBER], 'Bonds PVC and CPVC pipes and fittings.', 'pvc cement glue'],

  // ── Security & CCTV ───────────────────────────────────────────────────────
  ['SEC-001', 'HD Dome Camera 2 MP', 'Security & CCTV', 'Hikvision', 'piece', '1 pc', 1899, 2299, 40, [CCTV], 'Indoor dome camera with 20 m night vision.', 'dome cctv camera'],
  ['SEC-002', 'HD Bullet Camera 2 MP', 'Security & CCTV', 'Hikvision', 'piece', '1 pc', 2199, 2599, 40, [CCTV], 'Weatherproof outdoor bullet camera.', 'bullet cctv camera'],
  ['SEC-003', '8-Channel DVR', 'Security & CCTV', 'CP Plus', 'piece', '8 ch', 5499, 6499, 15, [CCTV], 'Records 8 cameras with mobile app viewing.', 'digital video recorder cctv'],
  ['SEC-004', 'Surveillance Hard Disk', 'Security & CCTV', 'WD Purple', 'piece', '1 TB', 3999, 4599, 20, [CCTV], '24×7 rated drive for DVR/NVR recording.', 'hard disk drive'],
  ['SEC-005', 'CCTV Coaxial Cable 3+1', 'Security & CCTV', 'Polycab', 'roll', '90 m', 1599, 1899, 25, [CCTV], 'Video + power combo cable for analog cameras.', 'coaxial cable'],
  ['SEC-006', 'BNC & DC Connectors', 'Security & CCTV', 'CP Plus', 'pack', '20 pcs', 299, 349, 100, [CCTV], 'Twist-on BNC and DC power connectors.', 'bnc connector'],
  ['SEC-007', 'CCTV Power Supply (SMPS)', 'Security & CCTV', 'CP Plus', 'piece', '12 V 10 A', 799, 999, 40, [CCTV], 'Centralised power supply for up to 8 cameras.', 'switched mode power supply'],
  ['SEC-008', 'CAT6 Ethernet Cable Box', 'Security & CCTV', 'D-Link', 'box', '305 m', 6999, 7999, 10, [CCTV, BMS], 'Copper CAT6 cable for IP cameras and controllers.', 'cat6 cable'],
  ['SEC-009', 'PoE Switch 8-Port', 'Security & CCTV', 'TP-Link', 'piece', '8 port', 4499, 5299, 15, [CCTV, BMS], 'Powers IP cameras and access readers over Ethernet.', 'network switch'],

  // ── Electrical ────────────────────────────────────────────────────────────
  ['ELE-001', 'LED Bulb 9 W', 'Electrical', 'Philips', 'pack', '4 bulbs', 399, 480, 200, [ELEC], 'Cool daylight B22 LED bulbs.', 'led light bulb'],
  ['ELE-002', 'LED Tube Light 20 W', 'Electrical', 'Syska', 'piece', '4 ft', 349, 420, 120, [ELEC], 'Batten tube light for offices and corridors.', 'led tube light'],
  ['ELE-003', 'MCB 32 A Single Pole', 'Electrical', 'Havells', 'piece', '1 pc', 249, 299, 100, [ELEC], 'C-curve miniature circuit breaker.', 'miniature circuit breaker'],
  ['ELE-004', 'FR Electrical Wire 1.5 sq mm', 'Electrical', 'Polycab', 'coil', '90 m', 1799, 2099, 40, [ELEC], 'Flame-retardant copper house wire.', 'electrical wire coil'],
  ['ELE-005', 'PVC Insulation Tape', 'Electrical', 'Anchor', 'pack', '10 rolls', 150, 180, 250, [ELEC], 'Electrical insulation tape, assorted colours.', 'electrical tape'],
  ['ELE-006', 'Modular Switch 6 A', 'Electrical', 'Anchor Roma', 'pack', '10 switches', 450, 520, 80, [ELEC], 'One-way modular switches.', 'light switch'],
  ['ELE-007', 'Extension Board 4-Socket', 'Electrical', 'Havells', 'piece', '3 m cord', 499, 599, 60, [ELEC], 'Surge-protected extension with master switch.', 'power strip extension'],
  ['ELE-008', 'Ceiling Fan Capacitor', 'Electrical', 'Keltron', 'piece', '2.5 µF', 99, 120, 150, [ELEC], 'Replacement capacitor for slow-running fans.', 'capacitor'],
  ['ELE-009', 'Digital Multimeter', 'Electrical', 'Mastech', 'piece', '1 pc', 799, 999, 30, [ELEC], 'Measures AC/DC voltage, current and resistance.', 'digital multimeter'],
  ['ELE-010', 'Screwdriver Line Tester', 'Electrical', 'Taparia', 'piece', '1 pc', 80, 99, 200, [ELEC], 'Neon voltage tester screwdriver.', 'voltage tester screwdriver'],

  // ── Water treatment ───────────────────────────────────────────────────────
  ['WTR-001', 'Alum Powder', 'Water Treatment', 'AquaPure', 'packet', '1 kg', 90, 110, 200, [WTP], 'Coagulant that settles suspended solids.', 'alum'],
  ['WTR-002', 'Chlorine Tablets', 'Water Treatment', 'AquaPure', 'jar', '100 tablets', 699, 799, 80, [WTP], 'Slow-dissolving tablets for tank disinfection.', 'chlorine tablets'],
  ['WTR-003', 'pH Test Kit', 'Water Treatment', 'Hanna', 'set', '1 kit', 399, 499, 50, [WTP, STP], 'Colour-comparison kit for pH 4–10.', 'ph test strips'],
  ['WTR-004', 'Sediment Filter Cartridge', 'Water Treatment', 'Kent', 'piece', '10 in.', 199, 249, 120, [WTP], '5-micron spun filter for pre-filtration.', 'water filter cartridge'],
  ['WTR-005', 'RO Membrane', 'Water Treatment', 'Vontron', 'piece', '80 GPD', 1499, 1799, 30, [WTP], 'Replacement reverse-osmosis membrane.', 'reverse osmosis membrane'],
  ['WTR-006', 'Water Softener Salt', 'Water Treatment', 'Tata', 'bag', '25 kg', 999, 1199, 30, [WTP], 'High-purity salt for softener regeneration.', 'salt pellets'],
  ['WTR-007', 'Digital TDS Meter', 'Water Treatment', 'HM Digital', 'piece', '1 pc', 349, 449, 60, [WTP], 'Pocket meter for total dissolved solids.', 'tds meter'],
  ['WTR-008', 'Multigrade Sand Filter Media', 'Water Treatment', 'AquaPure', 'bag', '25 kg', 1199, 1399, 20, [WTP], 'Graded silica sand for pressure sand filters.', 'silica sand'],

  // ── DG & power ────────────────────────────────────────────────────────────
  ['DG-001', 'Diesel Engine Oil 15W-40', 'DG & Power', 'Castrol CRB', 'can', '5 L', 1899, 2199, 40, [DG], 'Heavy-duty oil for diesel generator engines.', 'motor oil can'],
  ['DG-002', 'DG Oil Filter', 'DG & Power', 'Cummins', 'piece', '1 pc', 499, 599, 50, [DG], 'Spin-on lube oil filter.', 'oil filter'],
  ['DG-003', 'DG Fuel Filter', 'DG & Power', 'Cummins', 'piece', '1 pc', 449, 549, 50, [DG], 'Removes water and dirt from diesel.', 'fuel filter'],
  ['DG-004', 'DG Air Filter', 'DG & Power', 'Cummins', 'piece', '1 pc', 899, 1099, 30, [DG], 'Dry-type intake air filter element.', 'air filter engine'],
  ['DG-005', 'Engine Coolant', 'DG & Power', 'Servo', 'can', '5 L', 799, 899, 40, [DG], 'Ready-to-use radiator coolant.', 'antifreeze coolant'],
  ['DG-006', 'DG Starter Battery 12 V', 'DG & Power', 'Exide', 'piece', '150 Ah', 12999, 14999, 8, [DG], 'Heavy-duty cranking battery for generators.', 'car battery'],
  ['DG-007', 'Lithium Grease', 'DG & Power', 'Servo', 'tin', '1 kg', 349, 399, 60, [DG], 'Multi-purpose grease for bearings.', 'grease lubricant'],
  ['DG-008', 'Battery Distilled Water', 'DG & Power', 'Exide', 'can', '5 L', 150, 180, 80, [DG], 'De-ionised water for topping up batteries.', 'distilled water'],

  // ── STP / wastewater ──────────────────────────────────────────────────────
  ['WWT-001', 'STP Bio Culture', 'Water Treatment', 'BioClean', 'packet', '1 kg', 1299, 1499, 40, [STP], 'Bacterial culture that speeds up sewage digestion.', 'sewage treatment'],
  ['WWT-002', 'Polyelectrolyte Powder', 'Water Treatment', 'AquaPure', 'packet', '1 kg', 450, 520, 50, [STP], 'Flocculant for sludge dewatering.', 'flocculant'],
  ['WWT-003', 'Sodium Hypochlorite 10%', 'Water Treatment', 'AquaPure', 'can', '25 L', 1499, 1699, 20, [STP], 'Disinfectant for treated water outlet.', 'sodium hypochlorite'],
  ['WWT-004', 'Hydrated Lime Powder', 'Water Treatment', 'AquaPure', 'bag', '25 kg', 650, 750, 20, [STP], 'pH correction for wastewater.', 'calcium hydroxide'],
  ['WWT-005', 'Fine Bubble Air Diffuser', 'Water Treatment', 'Aquatec', 'piece', '9 in.', 1199, 1399, 30, [STP], 'EPDM membrane disc diffuser for aeration tanks.', 'aeration diffuser'],
  ['WWT-006', 'Dissolved Oxygen Meter', 'Water Treatment', 'Lutron', 'piece', '1 pc', 8999, 10499, 5, [STP], 'Portable DO meter for aeration control.', 'dissolved oxygen meter'],

  // ── Building automation ───────────────────────────────────────────────────
  ['BMS-001', 'PT100 Temperature Sensor', 'Building Automation', 'Honeywell', 'piece', '1 pc', 899, 1099, 30, [BMS], 'Duct/immersion sensor for HVAC monitoring.', 'temperature sensor'],
  ['BMS-002', 'Smoke Detector', 'Building Automation', 'Honeywell', 'piece', '1 pc', 799, 999, 50, [BMS, FM], 'Photoelectric smoke detector with base.', 'smoke detector'],
  ['BMS-003', 'Humidity Sensor', 'Building Automation', 'Siemens', 'piece', '1 pc', 1299, 1499, 20, [BMS], 'Wall-mount relative humidity transmitter.', 'humidity sensor'],
  ['BMS-004', 'Relay Module 24 V', 'Building Automation', 'Omron', 'piece', '1 pc', 499, 599, 40, [BMS], 'Interface relay for controller outputs.', 'relay module'],
  ['BMS-005', 'RFID Access Cards', 'Building Automation', 'HID', 'pack', '10 cards', 300, 400, 100, [BMS, FM], '13.56 MHz proximity cards for door access.', 'rfid card'],
  ['BMS-006', 'UPS Battery 12 V 7 Ah', 'Building Automation', 'Exide', 'piece', '1 pc', 1199, 1399, 40, [BMS], 'Sealed lead-acid battery for UPS and panels.', 'lead acid battery'],
  ['BMS-007', 'Programmable Thermostat', 'Building Automation', 'Honeywell', 'piece', '1 pc', 2999, 3499, 15, [BMS], 'Digital thermostat for FCU/AHU control.', 'thermostat'],
  ['BMS-008', 'LED Emergency Light', 'Building Automation', 'Philips', 'piece', '1 pc', 899, 1099, 40, [BMS, FM, GEN_SUP], 'Rechargeable light with 4-hour backup during outages.', 'emergency light'],

  // ── Gardening ─────────────────────────────────────────────────────────────
  ['GDN-001', 'Vermicompost', 'Gardening', 'GreenEarth', 'bag', '5 kg', 299, 349, 80, [GARDENER], 'Organic compost for flower beds and pots.', 'compost'],
  ['GDN-002', 'NPK 19:19:19 Fertilizer', 'Gardening', 'IFFCO', 'packet', '1 kg', 249, 299, 100, [GARDENER, GARDEN_SUP], 'Water-soluble balanced fertilizer.', 'fertilizer granules'],
  ['GDN-003', 'Garden Hose Pipe', 'Gardening', 'Kraft', 'roll', '30 m', 1299, 1599, 25, [GARDENER], 'Kink-resistant ½ in. hose with nozzle.', 'garden hose'],
  ['GDN-004', 'Pruning Shears', 'Gardening', 'Falcon', 'piece', '8 in.', 399, 499, 50, [GARDENER], 'Bypass secateurs for trimming plants.', 'pruning shears'],
  ['GDN-005', 'Manual Lawn Mower', 'Gardening', 'Falcon', 'piece', '14 in.', 6999, 7999, 6, [GARDENER, GARDEN_SUP], 'Push reel mower for small lawns.', 'reel lawn mower'],
  ['GDN-006', 'Flower Seeds Kit', 'Gardening', 'Ugaoo', 'pack', '10 varieties', 199, 249, 80, [GARDENER], 'Seasonal flower seeds for landscaped beds.', 'seed packets'],
  ['GDN-007', 'Neem Oil Pesticide', 'Gardening', 'GreenEarth', 'bottle', '1 L', 499, 599, 60, [GARDENER, GARDEN_SUP], 'Organic pest control spray concentrate.', 'neem oil'],
  ['GDN-008', 'Plastic Plant Pots', 'Gardening', 'Ugaoo', 'pack', '5 × 12 in.', 449, 549, 40, [GARDENER], 'UV-stabilised pots with drainage holes.', 'plant pots'],
  ['GDN-009', 'Garden Rake', 'Gardening', 'Falcon', 'piece', '14 teeth', 349, 429, 40, [GARDENER], 'Steel bow rake with wooden handle.', 'garden rake'],
  ['GDN-010', 'Potting Soil Mix', 'Gardening', 'Ugaoo', 'bag', '10 kg', 349, 399, 60, [GARDENER], 'Ready-to-use mix of cocopeat, compost and perlite.', 'potting soil'],
  ['GDN-011', 'Lawn Sprinkler', 'Gardening', 'Kraft', 'piece', '1 pc', 499, 599, 30, [GARDEN_SUP], '360° rotating sprinkler for lawns.', 'lawn sprinkler'],
  ['GDN-012', 'Watering Can', 'Gardening', 'Kraft', 'piece', '10 L', 299, 349, 40, [GARDEN_SUP], 'Plastic can with detachable rose head.', 'watering can'],
  ['GDN-013', 'Gardening Gloves', 'Gardening', 'Kraft', 'pair', '1 pair', 149, 199, 100, [GARDEN_SUP], 'Thorn-resistant gloves with grip.', 'gardening gloves'],
  ['GDN-014', 'Electric Hedge Trimmer', 'Gardening', 'Bosch', 'piece', '500 W', 4999, 5999, 8, [GARDEN_SUP], 'Corded trimmer with 50 cm blade.', 'hedge trimmer'],
  ['GDN-015', 'Lawn Grass Seeds', 'Gardening', 'Ugaoo', 'packet', '1 kg', 699, 799, 30, [GARDEN_SUP], 'Bermuda grass seed for new lawns and patches.', 'grass seed lawn'],
  ['GDN-016', 'Knapsack Sprayer Pump', 'Gardening', 'Kisan Kraft', 'piece', '16 L', 1899, 2199, 15, [GARDEN_SUP], 'Manual backpack sprayer for pesticides and fertilizer.', 'knapsack sprayer'],

  // ── Supervision & management ──────────────────────────────────────────────
  ['TLS-001', 'Mechanic Tool Kit', 'Tools & Equipment', 'Stanley', 'set', '108 pcs', 3499, 4199, 12, [TECH_SUP], 'Sockets, spanners, pliers and screwdrivers in a case.', 'tool kit'],
  ['TLS-002', 'Digital Clamp Meter', 'Tools & Equipment', 'Fluke', 'piece', '1 pc', 1499, 1799, 20, [TECH_SUP], 'Measures current without breaking the circuit.', 'clamp meter'],
  ['TLS-003', 'Infrared Thermometer Gun', 'Tools & Equipment', 'Fluke', 'piece', '1 pc', 1299, 1599, 20, [TECH_SUP], 'Non-contact temperature checks on panels and motors.', 'infrared thermometer'],
  ['TLS-004', 'Laser Distance Meter', 'Tools & Equipment', 'Bosch', 'piece', '40 m', 2499, 2999, 15, [TECH_SUP], 'Instant area and distance measurement for surveys.', 'laser rangefinder'],
  ['TLS-005', 'LED Headlamp', 'Tools & Equipment', 'Wildcraft', 'piece', '1 pc', 349, 449, 50, [TECH_SUP], 'Hands-free light for ducts, shafts and panels.', 'headlamp'],
  ['TLS-006', 'Walkie Talkie (Pair)', 'Tools & Equipment', 'Motorola', 'pair', '2 radios', 2999, 3499, 20, [TECH_SUP, LEADER, GEN_SUP], 'Licence-free two-way radios for site coordination.', 'walkie talkie'],
  ['TLS-007', 'Referee Whistles', 'Tools & Equipment', 'Nivia', 'pack', '5 whistles', 150, 199, 60, [LEADER], 'Loud whistles for drills and crowd control.', 'whistle'],
  ['TLS-008', 'ID Card Holders with Lanyards', 'Stationery', 'Solo', 'pack', '25 sets', 350, 450, 50, [LEADER], 'Badge holders for staff identification.', 'lanyard id badge'],
  ['TLS-009', 'Duty Roster Whiteboard', 'Stationery', 'Asian Boards', 'piece', '2 × 3 ft', 1199, 1499, 15, [LEADER], 'Magnetic whiteboard for shift planning.', 'whiteboard'],
  ['TLS-010', 'Megaphone', 'Tools & Equipment', 'Ahuja', 'piece', '25 W', 1499, 1799, 10, [GEN_SUP], 'Portable loudhailer for announcements and evacuation drills.', 'megaphone'],
  ['TLS-011', 'Heavy-Duty Padlock', 'Tools & Equipment', 'Godrej', 'piece', '65 mm', 399, 499, 60, [FM], 'Hardened shackle padlock for stores and plant rooms.', 'padlock'],
  ['TLS-012', 'Glow-in-Dark Exit Sign', 'Safety & PPE', 'SafetyFirst', 'piece', '1 pc', 449, 549, 40, [FM], 'Photoluminescent exit signage for corridors.', 'exit sign'],
  ['TLS-013', 'HEPA Air Purifier', 'Tools & Equipment', 'Philips', 'piece', '1 unit', 12999, 14999, 6, [FM], 'True HEPA purifier for cabins and meeting rooms.', 'air purifier'],
  ['TLS-014', 'Floor Marking Tape', 'Safety & PPE', '3M', 'roll', '2 in. × 30 m', 299, 349, 50, [FM], 'Yellow/black hazard tape for aisles and parking.', 'hazard tape'],
]

export const PRODUCT_CATALOG = ROWS.map(
  ([sku, name, category, brand, unit, packSize, price, mrp, stock, services, description, imageQuery]) => ({
    sku,
    name,
    category,
    brand,
    unit,
    packSize,
    price,
    mrp,
    stock,
    services,
    description,
    imageQuery,
  }),
)

// Default package per service: the visit charge plus the consumables the
// admin usually sends along. [sku, quantity]
export const SERVICE_PACKAGES = {
  [HK]: { serviceCharge: 1200, description: 'Deep cleaning of floors, washrooms and common areas.', items: [['CLN-001', 5], ['CLN-002', 1], ['CLN-003', 2], ['CLN-007', 2]] },
  [HKS]: { serviceCharge: 1800, description: 'Supervised housekeeping round with quality checklist.', items: [['SAF-001', 1], ['CLN-011', 1], ['CLN-014', 2]] },
  [PANTRY]: { serviceCharge: 800, description: 'Pantry upkeep, tea/coffee service and utensil cleaning.', items: [['PAN-001', 1], ['PAN-003', 2], ['PAN-004', 2], ['CLN-016', 1]] },
  [OFFICE]: { serviceCharge: 700, description: 'Desk upkeep, document runs and meeting-room setup.', items: [['OFF-001', 2], ['OFF-007', 3], ['PAN-008', 2]] },
  [HELPER]: { serviceCharge: 600, description: 'General help for shifting, loading and site support.', items: [['GEN-001', 1], ['GEN-005', 1]] },
  [PEON]: { serviceCharge: 600, description: 'Dispatch, courier and file movement.', items: [['OFF-014', 1], ['OFF-008', 1]] },
  [LABOUR]: { serviceCharge: 900, description: 'Manual labour for civil and shifting jobs, with PPE.', items: [['GEN-001', 1], ['SAF-002', 1], ['SAF-004', 2]] },
  [PLUMBER]: { serviceCharge: 500, description: 'Leak repair, tap/valve replacement and drain clearing.', items: [['PLB-002', 1], ['PLB-006', 2], ['PLB-004', 1]] },
  [CCTV]: { serviceCharge: 1500, description: 'Camera health check, cabling and DVR maintenance.', items: [['SEC-006', 1], ['GEN-008', 1]] },
  [ELEC]: { serviceCharge: 500, description: 'Fault finding, wiring, switch and fixture replacement.', items: [['ELE-001', 1], ['ELE-005', 1], ['ELE-006', 1]] },
  [WTP]: { serviceCharge: 2000, description: 'Water treatment plant operation and media/filter checks.', items: [['WTR-001', 4], ['WTR-002', 1], ['WTR-004', 2]] },
  [DG]: { serviceCharge: 2500, description: 'DG set servicing: oil, filters and battery check.', items: [['DG-001', 2], ['DG-002', 1], ['DG-003', 1], ['DG-008', 1]] },
  [STP]: { serviceCharge: 2500, description: 'Sewage treatment plant operation and dosing.', items: [['WWT-001', 1], ['WWT-002', 2], ['SAF-001', 1]] },
  [BMS]: { serviceCharge: 2000, description: 'BMS sensor calibration and panel health check.', items: [['BMS-004', 1], ['BMS-006', 1]] },
  [GARDENER]: { serviceCharge: 700, description: 'Lawn mowing, pruning, watering and manuring.', items: [['GDN-001', 2], ['GDN-002', 1], ['GDN-007', 1]] },
  [GARDEN_SUP]: { serviceCharge: 1200, description: 'Landscape supervision and seasonal planning.', items: [['GDN-002', 1], ['GDN-015', 1]] },
  [TECH_SUP]: { serviceCharge: 2500, description: 'Technical audit of MEP systems with report.', items: [['SAF-007', 1]] },
  [LEADER]: { serviceCharge: 1500, description: 'Team lead for shift coordination and drills.', items: [['OFF-008', 1]] },
  [GEN_SUP]: { serviceCharge: 1500, description: 'Site supervision and safety walk-through.', items: [['SAF-003', 1], ['CLN-018', 1]] },
  [FM]: { serviceCharge: 5000, description: 'Facility manager visit: audit, planning and client review.', items: [['SAF-010', 1]] },
}
