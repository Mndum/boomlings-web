// Runs automatically before every `wrangler deploy` (see [build] in wrangler.toml): stamps a new build id into version.json.
// The game checks that file in the background and tells players to refresh when the id changes.
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../version.json', import.meta.url), JSON.stringify({ v: Date.now().toString(36) }) + '\n');
console.log('version.json stamped');
