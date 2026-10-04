// משווה את מבנה מסד הבדיקות למסד החי. קריאה בלבד משני הצדדים; בלי נתונים — רק מבנה.
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import pg from 'pg';

const sql = readFileSync('scripts/schema-fingerprint.sql', 'utf8');
const env = Object.fromEntries(readFileSync('C:/tmp/work/salary-schools/.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const c = new pg.Client({ host: 'aws-0-eu-central-1.pooler.supabase.com', port: 5432, user: 'postgres.rvkjfjokdhkwiigorysr', password: env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query('set default_transaction_read_only = on');
const live = (await c.query(sql)).rows[0].fp;
await c.end();

const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--project-ref', 'dovgircrzeputtkgxdsv', '--output-format', 'json', '-f', 'scripts/schema-fingerprint.sql'],
  { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
let test = j.rows[0].fp;
if (typeof test === 'string') test = JSON.parse(test);

const report = {};
let total = 0;
for (const k of Object.keys(live)) {
  const L = live[k] || {}, T = test[k] || {};
  const missing = Object.keys(L).filter(x => !(x in T));
  const extra = Object.keys(T).filter(x => !(x in L));
  const differ = Object.keys(L).filter(x => x in T && JSON.stringify(L[x]) !== JSON.stringify(T[x]));
  report[k] = { live: Object.keys(L).length, test: Object.keys(T).length, missing, extra, differ };
  total += missing.length + extra.length + differ.length;
  console.log(`${k}: חי ${Object.keys(L).length} · בדיקות ${Object.keys(T).length} · חסר ${missing.length} · עודף ${extra.length} · שונה ${differ.length}`);
  for (const [label, arr] of [['חסר בבדיקות', missing], ['עודף בבדיקות', extra], ['שונה', differ]]) {
    if (arr.length) console.log(`   ${label}: ${arr.slice(0, 40).join(' ; ')}${arr.length > 40 ? ' …' : ''}`);
  }
}
writeFileSync('_tmp/schema-compare.json', JSON.stringify({ report, live, test }, null, 1));
console.log(`\nסה"כ הבדלים: ${total}`);
