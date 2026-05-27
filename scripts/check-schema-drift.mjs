#!/usr/bin/env node
// Check for schema drift between the SDK and a live Mina node, in two layers:
//
//   1. Introspection diff: compare schema/graphql_schema.json to the live
//      __schema returned by the daemon.
//   2. Live query check: parse src/queries.ts, send each operation with
//      sentinel variables, and classify GraphQL errors as either schema drift
//      (validation/parse) or runtime (auth, value-validation).
//
// Designed for a lightnet-style local daemon (see .github/workflows/schema-drift.yml
// for the CI setup); do not point at a public node by default.
//
// Usage:
//   node scripts/check-schema-drift.mjs --endpoint http://localhost:8080/graphql [--strict] [--branch master]
//
// Exit codes:
//   0 - no drift (or non-strict mode)
//   1 - drift detected in --strict mode
//   2 - connection / introspection error

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, '..', 'schema', 'graphql_schema.json');
const QUERIES_PATH = resolve(__dirname, '..', 'src', 'queries.ts');

// Sentinel addresses — syntactically valid B62q keys. The daemon may not have
// the corresponding accounts, but the schema layer will still validate.
const SENTINEL_SENDER = 'B62qpRzFVjd56FiHnNfxokVbcHMQLT119My1FEdSq8ss7KomLiSZcan';
const SENTINEL_RECEIVER = 'B62qrPN5Y5yq8kGE3FbVKbGTdTAJNdtNtB5sNVpxyRwWGcDEhpMzc8g';

const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        args {
          name
          description
          type {
            kind
            name
            ofType { kind name ofType { kind name ofType { kind name } } }
          }
          defaultValue
        }
        type {
          kind
          name
          ofType { kind name ofType { kind name ofType { kind name } } }
        }
        isDeprecated
        deprecationReason
      }
      inputFields {
        name
        description
        type {
          kind
          name
          ofType { kind name ofType { kind name ofType { kind name } } }
        }
        defaultValue
      }
      interfaces { kind name ofType { kind name } }
      enumValues(includeDeprecated: true) {
        name
        description
        isDeprecated
        deprecationReason
      }
      possibleTypes { kind name }
    }
  }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1: introspection diff
// ─────────────────────────────────────────────────────────────────────────────

// Safe name extractor — guards against `null` / non-object entries that
// occasionally appear in introspection arrays.
function nameOf(item) {
  if (item && typeof item === 'object' && typeof item.name === 'string') return item.name;
  return '';
}

function byName(a, b) {
  return nameOf(a).localeCompare(nameOf(b));
}

// normalizeSchema throws when the response is an error envelope without
// data.__schema, instead of silently returning a fake empty schema.
function normalizeSchema(raw) {
  const data = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const s = data && typeof data === 'object' ? data.__schema : null;
  if (!s || typeof s !== 'object') {
    if (raw && raw.errors) {
      throw new Error(`introspection returned errors envelope (no data.__schema): ${JSON.stringify(raw.errors)}`);
    }
    throw new Error('introspection response missing data.__schema');
  }
  if (!Array.isArray(s.types)) {
    throw new Error(`introspection __schema.types is not a list (got ${typeof s.types})`);
  }
  const types = [...s.types]
    .filter((t) => t && typeof t === 'object')
    .sort(byName)
    .map((t) => {
      const nt = { ...t };
      if (nt.fields) {
        nt.fields = [...nt.fields].sort(byName).map((f) => ({
          ...f,
          args: f && f.args ? [...f.args].sort(byName) : f && f.args,
        }));
      }
      if (nt.inputFields) nt.inputFields = [...nt.inputFields].sort(byName);
      if (nt.enumValues) nt.enumValues = [...nt.enumValues].sort(byName);
      if (nt.interfaces) nt.interfaces = [...nt.interfaces].sort(byName);
      if (nt.possibleTypes) nt.possibleTypes = [...nt.possibleTypes].sort(byName);
      return nt;
    });
  return {
    queryType: s.queryType,
    mutationType: s.mutationType,
    subscriptionType: s.subscriptionType,
    types,
  };
}

function indexBy(arr, key = 'name') {
  const out = new Map();
  for (const item of arr ?? []) {
    if (item && typeof item === 'object' && typeof item[key] === 'string') {
      out.set(item[key], item);
    }
  }
  return out;
}

function computeSchemaDiff(local, remote) {
  const diffs = [];
  const lt = indexBy(local.types);
  const rt = indexBy(remote.types);

  for (const n of [...lt.keys()].filter((n) => !rt.has(n)).sort()) diffs.push(`REMOVED type: ${n}`);
  for (const n of [...rt.keys()].filter((n) => !lt.has(n)).sort()) diffs.push(`ADDED type: ${n}`);

  for (const name of [...lt.keys()].filter((n) => rt.has(n)).sort()) {
    const l = lt.get(name);
    const r = rt.get(name);
    // Only flag kind change when both sides set it — otherwise a partial
    // local dump emits a spurious "<undefined> -> OBJECT" per type.
    if (l.kind != null && r.kind != null && l.kind !== r.kind) {
      diffs.push(`CHANGED ${name}: kind ${l.kind} -> ${r.kind}`);
    }

    const lf = indexBy(l.fields);
    const rf = indexBy(r.fields);
    for (const fn of [...lf.keys()].filter((n) => !rf.has(n)).sort()) diffs.push(`REMOVED field: ${name}.${fn}`);
    for (const fn of [...rf.keys()].filter((n) => !lf.has(n)).sort()) diffs.push(`ADDED field: ${name}.${fn}`);
    for (const fn of [...lf.keys()].filter((n) => rf.has(n)).sort()) {
      const lField = lf.get(fn);
      const rField = rf.get(fn);
      if (JSON.stringify(lField.type) !== JSON.stringify(rField.type)) {
        diffs.push(`CHANGED field type: ${name}.${fn}`);
      }
      const la = indexBy(lField.args);
      const ra = indexBy(rField.args);
      for (const an of [...la.keys()].filter((n) => !ra.has(n)).sort()) diffs.push(`REMOVED arg: ${name}.${fn}(${an})`);
      for (const an of [...ra.keys()].filter((n) => !la.has(n)).sort()) diffs.push(`ADDED arg: ${name}.${fn}(${an})`);
      // Compare arg types for shared keys — a scalar swap like
      // account(token: UInt64 -> TokenId) is invisible without this.
      for (const an of [...la.keys()].filter((n) => ra.has(n)).sort()) {
        if (JSON.stringify(la.get(an).type) !== JSON.stringify(ra.get(an).type)) {
          diffs.push(`CHANGED arg type: ${name}.${fn}(${an})`);
        }
      }
    }

    const li = indexBy(l.inputFields);
    const ri = indexBy(r.inputFields);
    for (const fn of [...li.keys()].filter((n) => !ri.has(n)).sort()) diffs.push(`REMOVED inputField: ${name}.${fn}`);
    for (const fn of [...ri.keys()].filter((n) => !li.has(n)).sort()) diffs.push(`ADDED inputField: ${name}.${fn}`);
    // Compare inputField types for shared keys.
    for (const fn of [...li.keys()].filter((n) => ri.has(n)).sort()) {
      if (JSON.stringify(li.get(fn).type) !== JSON.stringify(ri.get(fn).type)) {
        diffs.push(`CHANGED inputField type: ${name}.${fn}`);
      }
    }

    const le = new Set((l.enumValues ?? []).map((e) => e.name));
    const re = new Set((r.enumValues ?? []).map((e) => e.name));
    for (const en of [...le].filter((n) => !re.has(n)).sort()) diffs.push(`REMOVED enumValue: ${name}.${en}`);
    for (const en of [...re].filter((n) => !le.has(n)).sort()) diffs.push(`ADDED enumValue: ${name}.${en}`);
  }

  return diffs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2: live query check
// ─────────────────────────────────────────────────────────────────────────────

const OPERATION_START_RE = /^\s*(query|mutation|subscription)\b/i;

function parseQueries(src) {
  // Matches: export const NAME = `...`;
  const re = /export\s+const\s+(\w+)\s*=\s*`([\s\S]*?)`\s*;/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const body = m[2];
    // Filter out non-operation backtick consts (e.g. snippet strings in the
    // same file). A real GraphQL op starts with one of the operation keywords.
    if (!OPERATION_START_RE.test(body)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, body });
  }
  return out;
}

function parseVariableDecls(body) {
  // Anchor at the start of the body — otherwise this regex binds to inner
  // field-argument parens like `bestChain(maxLength: 1)`.
  const m = body.match(/^\s*(?:query|mutation|subscription)(?:\s+\w+)?\s*\(([^)]*)\)/s);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((decl) => {
      const mm = decl.match(/^\$(\w+)\s*:\s*([\w!\[\]]+)/);
      if (!mm) return null;
      return { name: mm[1], type: mm[2] };
    })
    .filter(Boolean);
}

// Marker returned by `sentinelForType` when no sentinel is known. We can't
// use `null`, since `null` is a legitimate sentinel for nullable variables.
const NO_SENTINEL = Symbol('NO_SENTINEL');

function sentinelForType(typeName, varName) {
  const base = typeName.replace(/[\[\]!]/g, '');
  switch (base) {
    case 'PublicKey':
      return SENTINEL_SENDER;
    case 'UInt32':
    case 'UInt64':
    case 'Fee':
    case 'Balance':
      return '1000000000';
    case 'Int':
      return 1;
    case 'String':
    case 'TokenId':
    case 'ID':
      return '1';
    case 'Boolean':
      return true;
    case 'SendPaymentInput':
      return { from: SENTINEL_SENDER, to: SENTINEL_RECEIVER, amount: '1000000000', fee: '1000000000' };
    case 'SendDelegationInput':
      return { from: SENTINEL_SENDER, to: SENTINEL_RECEIVER, fee: '1000000000' };
    case 'SetSnarkWorkerInput':
      return { publicKey: SENTINEL_SENDER };
    case 'SetSnarkWorkFee':
      return { fee: '1000000000' };
    case 'SignatureInput':
      // Optional in mutations — daemon signs with its own key when null.
      return null;
    default:
      return NO_SENTINEL;
  }
}

function buildVariables(decls) {
  const vars = {};
  for (const d of decls) {
    const v = sentinelForType(d.type, d.name);
    if (v === NO_SENTINEL) return null;
    vars[d.name] = v;
  }
  return vars;
}

// Case-insensitive substrings that uniquely identify schema-level errors
// emitted by Mina's GraphQL surface (graphql-ppx / OCaml). We deliberately
// omit bare "expected type" because it appears in both real drift and in
// value-coercion runtime errors; VALUE_COERCION_RE below catches the runtime
// variant explicitly.
const DRIFT_PATTERNS = [
  'cannot query field',
  'unknown argument',
  'unknown type',
  'is not defined',
  'is not a subtype',
  'is required',
  'but not provided',
  'used in position expecting type',
  'must have a sub selection',
  'did you mean',
  'unknown directive',
];

// Matches Mina's "Argument X of type Y expected on field Z, found <value>"
// — value validation, not schema drift.
const VALUE_COERCION_RE = /expected on field .* found /i;

// classifyError decides whether a GraphQL error reflects schema drift or
// runtime failure. Message-pattern match takes priority over `path` — Mina
// attaches `path` to many validation errors, so a path-first short-circuit
// silently drops real drift to the runtime bucket.
function classifyError(err) {
  const msg = err.message || '';
  const lc = msg.toLowerCase();
  if (DRIFT_PATTERNS.some((p) => lc.includes(p))) return 'drift';
  if (VALUE_COERCION_RE.test(msg)) return 'runtime';
  if (err.path && err.path.length > 0) return 'runtime';
  // Unknown error shape — surface as drift so silent breakage is visible in
  // --strict at least.
  return 'drift';
}

async function fetchJson(endpoint, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resp.ok) {
      let snippet = '';
      try {
        snippet = await resp.text();
        if (snippet.length > 200) snippet = snippet.slice(0, 200) + '…';
      } catch {}
      throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${snippet}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function missingSentinelTypes(decls) {
  const seen = new Set();
  const out = [];
  for (const d of decls) {
    if (sentinelForType(d.type, d.name) === NO_SENTINEL && !seen.has(d.type)) {
      seen.add(d.type);
      out.push(d.type);
    }
  }
  return out;
}

async function runQueryLayer(endpoint) {
  /** @type {{ok:number, runtime:number, drift:string[], skipped:string[], failures:string[]}} */
  const stats = { ok: 0, runtime: 0, drift: [], skipped: [], failures: [] };

  let src;
  try {
    src = readFileSync(QUERIES_PATH, 'utf8');
  } catch (err) {
    console.log(`FAIL: cannot read ${QUERIES_PATH}: ${err.message}`);
    stats.failures.push(`read queries module: ${err.message}`);
    return stats;
  }
  const ops = parseQueries(src);
  if (ops.length === 0) {
    console.log('WARN: no operations parsed from src/queries.ts');
    stats.failures.push('no operations parsed from src/queries.ts');
    return stats;
  }

  for (const op of ops) {
    const decls = parseVariableDecls(op.body);
    const vars = buildVariables(decls);
    if (vars === null) {
      const missing = missingSentinelTypes(decls);
      console.log(`SKIP  ${op.name} (no sentinel for: ${missing.join(', ')})`);
      stats.skipped.push(`${op.name}: missing sentinel for ${missing.join(', ')}`);
      continue;
    }

    let json;
    try {
      json = await fetchJson(endpoint, { query: op.body, variables: vars });
    } catch (err) {
      console.log(`FAIL  ${op.name}: ${err.message}`);
      stats.failures.push(`${op.name}: ${err.message}`);
      continue;
    }

    const errors = json.errors ?? [];
    if (errors.length === 0) {
      console.log(`OK    ${op.name}`);
      stats.ok++;
      continue;
    }

    const classified = errors.map((e) => ({ error: e, kind: classifyError(e) }));
    const driftErrors = classified.filter((c) => c.kind === 'drift');
    if (driftErrors.length > 0) {
      const msgs = driftErrors.map((c) => c.error.message).join('; ');
      console.log(`DRIFT ${op.name}: ${msgs}`);
      stats.drift.push(`${op.name}: ${msgs}`);
    } else {
      const msgs = classified.map((c) => c.error.message).join('; ');
      console.log(`RUNTIME ${op.name}: ${msgs}`);
      stats.runtime++;
    }
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    options: {
      endpoint: { type: 'string', default: 'http://127.0.0.1:8080/graphql' },
      strict: { type: 'boolean', default: false },
      branch: { type: 'string', default: 'unknown' },
      'skip-schema': { type: 'boolean', default: false },
      'skip-queries': { type: 'boolean', default: false },
    },
  });

  let schemaDrift = [];

  if (!values['skip-schema']) {
    console.log(`\n── Layer 1: schema introspection (${values.branch}) ──`);
    let localRaw;
    try {
      localRaw = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    } catch (err) {
      console.error(`ERROR: Cannot load local schema from ${SCHEMA_PATH}: ${err.message}`);
      process.exit(2);
    }

    let remoteRaw;
    try {
      console.log(`Fetching introspection from ${values.endpoint}...`);
      remoteRaw = await fetchJson(values.endpoint, { query: INTROSPECTION_QUERY });
    } catch (err) {
      console.error(`ERROR: Cannot fetch remote schema: ${err.message}`);
      process.exit(2);
    }

    let local, remote;
    try {
      local = normalizeSchema(localRaw);
      remote = normalizeSchema(remoteRaw);
    } catch (err) {
      console.error(`ERROR: malformed schema: ${err.message}`);
      process.exit(2);
    }
    schemaDrift = computeSchemaDiff(local, remote);
    if (schemaDrift.length === 0) {
      console.log('OK: local schema matches node schema');
    } else {
      console.log(`Schema drift: ${schemaDrift.length} difference(s)`);
      for (const d of schemaDrift) console.log(`  ${d}`);
    }
  }

  let queryResult = { ok: 0, drift: [], runtime: 0, skipped: [], failures: [] };
  if (!values['skip-queries']) {
    console.log(`\n── Layer 2: live query check (${values.branch}) ──`);
    queryResult = await runQueryLayer(values.endpoint);
    console.log(
      `\nResults: ${queryResult.ok} ok, ${queryResult.drift.length} drift, ` +
        `${queryResult.runtime} runtime, ${queryResult.skipped.length} skipped, ` +
        `${queryResult.failures.length} infra-failures`,
    );
  }

  console.log(`\n── Summary (${values.branch}) ──`);
  if (values['skip-schema']) {
    console.log('Schema diffs:   SKIPPED');
  } else {
    console.log(`Schema diffs:    ${schemaDrift.length}`);
  }
  if (values['skip-queries']) {
    console.log('Query drift:    SKIPPED');
  } else {
    console.log(`Query drift:     ${queryResult.drift.length}`);
    console.log(`Skipped (cov):   ${queryResult.skipped.length}`);
    console.log(`Infra failures:  ${queryResult.failures.length}`);
  }

  // Infra failures always fail — we can't trust the result if we couldn't
  // talk to the daemon.
  if (queryResult.failures.length > 0) {
    console.log('FAIL: infrastructure errors prevented a clean check');
    process.exit(1);
  }

  const totalDrift = schemaDrift.length + queryResult.drift.length;
  if (totalDrift === 0 && queryResult.skipped.length === 0) {
    console.log('OK: no drift detected');
    process.exit(0);
  }
  if (values.strict) {
    // In strict mode, skipped ops are also a failure: we can't claim the SDK
    // is in sync if we couldn't probe parts of it.
    console.log('FAIL: drift or coverage gap detected in --strict mode');
    process.exit(1);
  }
  console.log(`WARN: drift or coverage gap differs from ${values.branch} (non-blocking).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`UNEXPECTED: ${err.stack || err.message}`);
  process.exit(2);
});
