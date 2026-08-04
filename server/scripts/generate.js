/**
 * Deterministic topology generator.
 *
 * Pure data generation — this module never touches the database. Keeping it
 * separate means the dataset can be inspected, diffed and reasoned about
 * without a live instance, and the seed script stays a thin writer.
 *
 * The output models a small service-provider network with three tiers:
 *
 *     core  <-> core          partial mesh (ring plus chords)
 *     dist  ->  core          usually dual-homed, deliberately not always
 *     access -> dist          usually dual-homed, deliberately not always
 *
 * The "deliberately not always" is the point. A network where everything is
 * dual-homed has no single points of failure and makes for a boring demo. A
 * realistic network has pockets of single-homed kit that nobody got round to
 * fixing, and finding them is exactly what this application is for.
 */

// ---------------------------------------------------------------------------
// Deterministic pseudo-random number generator
// ---------------------------------------------------------------------------
// Math.random() would produce a different graph on every seed run, so screenshots
// in the README would not match the deployed instance. mulberry32 is small,
// fast, and good enough for topology shaping.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandom(seed) {
  const rand = mulberry32(seed);
  return {
    /** Float in [0, 1). */
    next: rand,
    /** Integer in [min, max] inclusive. */
    int: (min, max) => min + Math.floor(rand() * (max - min + 1)),
    /** Uniform pick from an array. */
    pick: (items) => items[Math.floor(rand() * items.length)],
    /** True with probability p. */
    chance: (p) => rand() < p,
    /** Fisher-Yates shuffle of a copy. */
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    /** `count` distinct items from an array. */
    sample: (items, count) => {
      const copy = [...items];
      const out = [];
      for (let i = 0; i < count && copy.length > 0; i += 1) {
        out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/**
 * Sites and their tier counts.
 *
 * Six sites are full POPs with local core routers. Two are *spur* sites:
 * regional aggregation points with no local core, whose distribution routers
 * reach the backbone through a single designated gateway core router. That is
 * a pattern real networks accumulate — a regional POP that was stood up on one
 * uplink and never got its second — and it is what gives the SPOF audit a
 * finding worth acting on.
 */
const SITES = [
  { id: 'site-mum', code: 'mum', name: 'Mumbai POP', city: 'Mumbai', region: 'West', cores: 2, dist: 5, access: 20 },
  { id: 'site-del', code: 'del', name: 'Delhi POP', city: 'Delhi', region: 'North', cores: 2, dist: 5, access: 20 },
  { id: 'site-blr', code: 'blr', name: 'Bengaluru POP', city: 'Bengaluru', region: 'South', cores: 1, dist: 5, access: 20 },
  { id: 'site-maa', code: 'maa', name: 'Chennai POP', city: 'Chennai', region: 'South', cores: 1, dist: 5, access: 20 },
  { id: 'site-hyd', code: 'hyd', name: 'Hyderabad POP', city: 'Hyderabad', region: 'South', cores: 1, dist: 5, access: 20 },
  { id: 'site-pnq', code: 'pnq', name: 'Pune POP', city: 'Pune', region: 'West', cores: 1, dist: 5, access: 20 },
  { id: 'site-cok', code: 'cok', name: 'Kochi Regional', city: 'Kochi', region: 'South', cores: 0, dist: 3, access: 14, gatewayCore: 'core-blr-01' },
  { id: 'site-amd', code: 'amd', name: 'Ahmedabad Regional', city: 'Ahmedabad', region: 'West', cores: 0, dist: 3, access: 14, gatewayCore: 'core-mum-01' },
];

const PLATFORMS = {
  core: [
    { vendor: 'Cisco', model: 'ASR 9010' },
    { vendor: 'Juniper', model: 'MX960' },
    { vendor: 'Nokia', model: '7750 SR-12' },
  ],
  distribution: [
    { vendor: 'Arista', model: '7280R3' },
    { vendor: 'Juniper', model: 'MX204' },
    { vendor: 'Cisco', model: 'NCS 5501' },
  ],
  access: [
    { vendor: 'Cisco', model: 'NCS 540' },
    { vendor: 'Juniper', model: 'ACX7100' },
    { vendor: 'Nokia', model: '7250 IXR-e' },
  ],
};

const LINK_CAPACITY = { 'core-core': 400, 'dist-core': 100, 'access-dist': 25 };

const SERVICE_TYPES = [
  { type: 'internet', label: 'Dedicated Internet Access', sla: ['gold', 'silver', 'bronze'] },
  { type: 'mpls-vpn', label: 'MPLS L3VPN', sla: ['platinum', 'gold', 'silver'] },
  { type: 'voice', label: 'SIP Trunk', sla: ['gold', 'silver'] },
  { type: 'video', label: 'Managed Video Backhaul', sla: ['platinum', 'gold'] },
];

const CUSTOMER_PREFIXES = [
  'Meridian', 'Northwind', 'Blue Harbour', 'Sarvodaya', 'Trellis', 'Kestrel',
  'Ironwood', 'Vantage', 'Calico', 'Lakeview', 'Orchid', 'Redstone', 'Kaveri',
  'Silverline', 'Peninsula', 'Anvil', 'Fernbank', 'Highgate', 'Solstice', 'Tamarind',
];

const CUSTOMER_SUFFIXES = [
  'Logistics', 'Health', 'Retail', 'Bank', 'Media', 'Manufacturing', 'Foods',
  'Systems', 'Textiles', 'Energy', 'Labs', 'Networks', 'Hotels', 'Motors',
];

const SEGMENTS = [
  { segment: 'enterprise', mrrMin: 4000, mrrMax: 28000, weight: 0.22 },
  { segment: 'smb', mrrMin: 400, mrrMax: 3500, weight: 0.43 },
  { segment: 'residential', mrrMin: 20, mrrMax: 180, weight: 0.35 },
];

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Builds the full dataset.
 *
 * Entities carry foreign keys (`siteId`, `deviceId`, `circuitId`, ...) rather
 * than nested objects. The seed script turns those into relationships with
 * `UNWIND ... MATCH ... MERGE`, which keeps both halves simple.
 *
 * @param {{ seed?: number }} [options]
 */
export function generateTopology({ seed = 20260803 } = {}) {
  const random = makeRandom(seed);

  const sites = SITES.map(({ code, ...rest }) => ({ ...rest, code }));

  const devices = [];
  const interfaces = [];
  const circuits = [];
  const services = [];
  const customers = [];
  const links = [];

  let interfaceSeq = 0;
  let circuitSeq = 0;

  const nextInterface = (deviceId, speedGbps, label) => {
    interfaceSeq += 1;
    const id = `if-${String(interfaceSeq).padStart(5, '0')}`;
    const iface = {
      id,
      name: label,
      speedGbps,
      status: random.chance(0.97) ? 'up' : 'down',
      deviceId,
      circuitId: null,
    };
    interfaces.push(iface);
    return iface;
  };

  const nextCircuit = (type, capacityGbps, name) => {
    circuitSeq += 1;
    const id = `ckt-${String(circuitSeq).padStart(5, '0')}`;
    const circuit = {
      id,
      name,
      type,
      capacityGbps,
      status: random.chance(0.98) ? 'active' : 'degraded',
    };
    circuits.push(circuit);
    return circuit;
  };

  // -- Devices -------------------------------------------------------------

  const byRole = { core: [], distribution: [], access: [] };

  const addDevice = (role, site, index) => {
    const platform = random.pick(PLATFORMS[role]);
    const shortRole = role === 'distribution' ? 'dist' : role === 'access' ? 'acc' : 'core';
    const device = {
      id: `${shortRole}-${site.code}-${String(index).padStart(2, '0')}`,
      name: `${shortRole}-${site.code}-${String(index).padStart(2, '0')}`,
      role,
      vendor: platform.vendor,
      model: platform.model,
      // Deterministic management address, one /16 per tier.
      mgmtIp: `10.${role === 'core' ? 0 : role === 'distribution' ? 1 : 2}.${
        SITES.findIndex((s) => s.code === site.code) + 1
      }.${index}`,
      status: random.chance(0.98) ? 'up' : 'maintenance',
      siteId: site.id,
      siteName: site.name,
    };
    devices.push(device);
    byRole[role].push(device);
    return device;
  };

  for (const site of sites) {
    for (let i = 1; i <= site.cores; i += 1) addDevice('core', site, i);
    for (let i = 1; i <= site.dist; i += 1) addDevice('distribution', site, i);
    for (let i = 1; i <= site.access; i += 1) addDevice('access', site, i);
  }

  // -- Physical links ------------------------------------------------------
  // Each link produces: one circuit, two interfaces terminating it, and one
  // LINKED_TO edge. LINKED_TO is the denormalised device adjacency the
  // traversal queries actually walk; see the design doc for why.

  const linkKey = (a, b) => [a, b].sort().join('::');
  const seenLinks = new Set();

  const connect = (a, b, kind) => {
    const key = linkKey(a.id, b.id);
    if (a.id === b.id || seenLinks.has(key)) return null;
    seenLinks.add(key);

    const capacity = LINK_CAPACITY[kind];
    const circuit = nextCircuit(
      kind === 'access-dist' ? 'access' : 'backbone',
      capacity,
      `${a.name} <-> ${b.name}`,
    );

    const ifaceA = nextInterface(a.id, capacity, portName(a.role, capacity, interfaceSeq));
    const ifaceB = nextInterface(b.id, capacity, portName(b.role, capacity, interfaceSeq));
    ifaceA.circuitId = circuit.id;
    ifaceB.circuitId = circuit.id;

    links.push({
      aDeviceId: a.id,
      bDeviceId: b.id,
      circuitId: circuit.id,
      capacityGbps: capacity,
      kind,
    });
    return circuit;
  };

  // Core ring, so the backbone is always connected, plus a few chords for
  // realistic redundancy.
  const cores = byRole.core;
  for (let i = 0; i < cores.length; i += 1) {
    connect(cores[i], cores[(i + 1) % cores.length], 'core-core');
  }
  for (const [x, y] of [[0, 3], [1, 5], [2, 6], [4, 7]]) {
    if (cores[x] && cores[y]) connect(cores[x], cores[y], 'core-core');
  }

  // Distribution -> core.
  //
  // Full POPs: dual-homed 80% of the time, to a local core plus an alternate.
  // Spur sites: every distribution router homes to the one designated gateway
  // core and nothing else, so that gateway is a cut vertex for the whole site.
  const siteById = new Map(sites.map((s) => [s.id, s]));

  for (const dist of byRole.distribution) {
    const site = siteById.get(dist.siteId);

    if (site.gatewayCore) {
      const gateway = cores.find((c) => c.id === site.gatewayCore);
      if (gateway) connect(dist, gateway, 'dist-core');
      continue;
    }

    const localCores = cores.filter((c) => c.siteId === dist.siteId);
    const remoteCores = cores.filter((c) => c.siteId !== dist.siteId);
    const primary = localCores.length > 0 ? random.pick(localCores) : random.pick(cores);
    connect(dist, primary, 'dist-core');

    if (random.chance(0.8)) {
      const alternatives = [...localCores.filter((c) => c.id !== primary.id), ...remoteCores];
      if (alternatives.length > 0) connect(dist, random.pick(alternatives), 'dist-core');
    }
  }

  // Access -> distribution, same site. Again a deliberate minority is
  // single-homed.
  for (const access of byRole.access) {
    const siteDist = byRole.distribution.filter((d) => d.siteId === access.siteId);
    if (siteDist.length === 0) continue;
    const primary = random.pick(siteDist);
    connect(access, primary, 'access-dist');

    if (random.chance(0.62)) {
      const alternatives = siteDist.filter((d) => d.id !== primary.id);
      if (alternatives.length > 0) connect(access, random.pick(alternatives), 'access-dist');
    }
  }

  // -- Services and customers ---------------------------------------------
  // Customer-facing services hang off access routers via a service circuit.
  // Core and distribution routers therefore have no directly attached
  // customers: their impact is entirely reachability-driven, which is what
  // makes the two blast-radius queries complementary rather than redundant.

  let serviceSeq = 0;
  let customerSeq = 0;

  const pickSegment = () => {
    const roll = random.next();
    let acc = 0;
    for (const segment of SEGMENTS) {
      acc += segment.weight;
      if (roll <= acc) return segment;
    }
    return SEGMENTS[SEGMENTS.length - 1];
  };

  for (const access of byRole.access) {
    // One or two service circuits per access router.
    const serviceCount = random.int(1, 2);
    for (let s = 0; s < serviceCount; s += 1) {
      serviceSeq += 1;
      const spec = random.pick(SERVICE_TYPES);
      const serviceId = `svc-${String(serviceSeq).padStart(4, '0')}`;

      const circuit = nextCircuit('access', random.pick([1, 10, 10, 25]), `Service circuit ${serviceId}`);
      const iface = nextInterface(access.id, circuit.capacityGbps, portName('access', circuit.capacityGbps, interfaceSeq));
      iface.circuitId = circuit.id;

      services.push({
        id: serviceId,
        name: `${spec.label} — ${access.name}`,
        type: spec.type,
        slaTier: random.pick(spec.sla),
        status: random.chance(0.96) ? 'active' : 'impaired',
        circuitId: circuit.id,
      });

      // Each service serves a handful of customers.
      const customerCount = random.int(2, 8);
      for (let c = 0; c < customerCount; c += 1) {
        customerSeq += 1;
        const segment = pickSegment();
        customers.push({
          id: `cust-${String(customerSeq).padStart(5, '0')}`,
          name: `${random.pick(CUSTOMER_PREFIXES)} ${random.pick(CUSTOMER_SUFFIXES)}`,
          segment: segment.segment,
          mrr: random.int(segment.mrrMin, segment.mrrMax),
          serviceId,
        });
      }
    }
  }

  return {
    meta: {
      seed,
      generatedFrom: 'server/scripts/generate.js',
      counts: {
        sites: sites.length,
        devices: devices.length,
        interfaces: interfaces.length,
        circuits: circuits.length,
        services: services.length,
        customers: customers.length,
        links: links.length,
      },
    },
    sites,
    devices,
    interfaces,
    circuits,
    services,
    customers,
    links,
  };
}

/** Vendor-flavoured interface names, purely so the UI reads like real kit. */
function portName(role, speedGbps, seq) {
  const unit = seq % 48;
  if (speedGbps >= 400) return `et-0/0/${unit}`;
  if (speedGbps >= 100) return `HundredGigE0/0/0/${unit}`;
  if (speedGbps >= 25) return `TwentyFiveGigE0/0/${unit}`;
  if (speedGbps >= 10) return `xe-0/0/${unit}`;
  return `ge-0/0/${unit}`;
}

// Allow `node scripts/generate.js` to print a summary without a database.
if (import.meta.url === `file://${process.argv[1]}`) {
  const data = generateTopology();
  console.log(JSON.stringify(data.meta, null, 2));
}
