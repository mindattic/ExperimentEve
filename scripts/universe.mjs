#!/usr/bin/env node
// EVE universe mini-CLI: query the interchange file locally today, and speak
// to Prose (import/sync) once Prose grows its universe subsystem.
//
//   npm run universe -- validate
//   npm run universe -- list [type]
//   npm run universe -- get <id>
//   npm run universe -- search <text>
//   npm run universe -- stats

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
  default:
    fail(`unknown command '${cmd}' (validate | list [type] | get <id> | search <text> | stats)`);
}
