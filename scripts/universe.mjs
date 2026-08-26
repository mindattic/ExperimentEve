#!/usr/bin/env node
// EVE universe mini-CLI: query the interchange file locally today, and speak
// to Prose (import/sync) once Prose grows its universe subsystem.
//
//   npm run universe -- validate
//   npm run universe -- list [type]
//   npm run universe -- get <id>
//   npm run universe -- search <text>
//   npm run universe -- stats
//   npm run universe -- pull        (Prose Hub -> universe/eve.prose-snapshot.json)
//   npm run universe -- push        (this file -> Prose Hub POST /api/universes/EVE/import)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HUB = 'http://127.0.0.1:5900';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'universe', 'eve.universe.json');
const data = JSON.parse(readFileSync(file, 'utf8'));

const [cmd = 'stats', ...args] = process.argv.slice(2);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

switch (cmd) {
  case 'validate': {
    const errs = [];
    const ids = new Set();
    if (!data.universe?.id) errs.push('universe.id missing');
    for (const e of data.entities ?? []) {
      for (const k of ['id', 'type', 'name', 'summary']) {
        if (!e[k]) errs.push(`entity missing ${k}: ${JSON.stringify(e).slice(0, 60)}`);
      }
      if (ids.has(e.id)) errs.push(`duplicate id: ${e.id}`);
      ids.add(e.id);
    }
    const dangling = [];
    for (const e of data.entities ?? []) {
      for (const r of e.relations ?? []) {
        if (!ids.has(r.to)) dangling.push(`${e.id} -[${r.kind}]-> ${r.to}`);
      }
    }
    if (errs.length) fail('INVALID:\n  ' + errs.join('\n  '));
    console.log(`OK: ${ids.size} entities, universe '${data.universe.id}'.`);
    if (dangling.length) {
      console.log(`Dangling relations (allowed — future work):\n  ${dangling.join('\n  ')}`);
    }
    break;
  }
  case 'list': {
    const type = args[0];
    for (const e of data.entities) {
      if (!type || e.type === type) console.log(`${e.type.padEnd(10)} ${e.id.padEnd(24)} ${e.name}`);
    }
    break;
  }
  case 'get': {
    const e = data.entities.find((x) => x.id === args[0]);
    if (!e) fail(`no entity '${args[0]}'`);
    console.log(JSON.stringify(e, null, 2));
    break;
  }
  case 'search': {
    const q = args.join(' ').toLowerCase();
    if (!q) fail('search needs text');
    for (const e of data.entities) {
      const hay = `${e.id} ${e.name} ${e.summary} ${(e.tags ?? []).join(' ')}`.toLowerCase();
      if (hay.includes(q)) console.log(`${e.type.padEnd(10)} ${e.id.padEnd(24)} ${e.name}`);
    }
    break;
  }
  case 'stats': {
    const byType = {};
    for (const e of data.entities) byType[e.type] = (byType[e.type] ?? 0) + 1;
    console.log(`Universe: ${data.universe.name} (${data.universe.id}) — ${data.entities.length} entities`);
    for (const [t, n] of Object.entries(byType).sort()) console.log(`  ${t.padEnd(12)} ${n}`);
    break;
  }
  case 'pull': {
    try {
      // scope=all: default scope omits generic-Edges-table universes' nodes.
      // Note: per-node edgeCount is unreliable (pre-existing Hub bug); the
      // top-level edges array is correct — consume that.
      const res = await fetch(`${HUB}/api/universes/EVE/snapshot?scope=all`);
      if (!res.ok) fail(`Hub answered ${res.status} — has /eve run in the Prose CLI yet?`);
      const snap = await res.json();
      const out = join(here, '..', 'universe', 'eve.prose-snapshot.json');
      writeFileSync(out, JSON.stringify(snap, null, 2));
      console.log(`Pulled Prose snapshot -> ${out} (${snap.nodes?.length ?? '?'} nodes, ${snap.edges?.length ?? '?'} edges)`);
    } catch (e) {
      fail(`Prose Hub not reachable at ${HUB} (${e.message}). Start it, or run /eve in the Prose CLI first.`);
    }
    break;
  }
  case 'push': {
    // Pushes go THROUGH Prose Hub — never the CLI direct (house rule).
    // RFC 0007 §5: POST the interchange JSON to the Hub's import endpoint.
    try {
      const res = await fetch(`${HUB}/api/universes/EVE/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: readFileSync(file, 'utf8'),
      });
      const r = await res.json().catch(() => null);
      if (!res.ok || !r) {
        fail(`Hub import failed (${res.status}): ${r ? JSON.stringify(r.errors ?? r) : 'no body'}`);
      }
      console.log(`[universe-import via Hub] universe: ${data.universe.id}`);
      console.log(`  entities created : ${r.entitiesCreated}`);
      console.log(`  entities updated : ${r.entitiesUpdated}`);
      console.log(`  stubs created    : ${r.stubsCreated}`);
      console.log(`  stubs promoted   : ${r.stubsPromoted}`);
      console.log(`  edges created    : ${r.edgesCreated}`);
    } catch (e) {
      fail(`Prose Hub not reachable at ${HUB} (${e.message}). Start it — pushes only go through the Hub.`);
    }
    break;
  }
  default:
    fail(`unknown command '${cmd}' (validate | list [type] | get <id> | search <text> | stats | pull | push)`);
}
