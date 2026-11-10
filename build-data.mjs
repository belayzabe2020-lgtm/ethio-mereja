// Ethio Mereja - publishes the PUBLIC data (services, branches, announcements, logo) as one static file: data.json
// Needs Node 18+. It only reads data that every visitor can already read, so no secret key is used.
import { readFile, writeFile } from 'node:fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://evhpagctvamqtbljzkuq.supabase.co';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_rN0x9BxAJlin3WJY32TuCg_Jl7uZvoH';

async function get(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: KEY } });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

const [services, branches, notifications, settings] = await Promise.all([
  get('services?select=id,title,icon,color&order=created_at.asc'),
  get('branches?select=id,category,name,location,phone&order=created_at.asc'),
  get('notifications?select=id,title,body,time,created_at&order=created_at.desc&limit=30'),
  get('app_settings?select=content_version,logo_url,logo_data_url&id=eq.1'),
]);

if (!services.length || !branches.length) {
  throw new Error('Refusing to publish: services or branches came back empty (keeps the last good data.json).');
}

const s = settings[0] || {};
const body = { services, branches, notifications, logo_url: s.logo_url || '', logo_data_url: s.logo_data_url || '' };
const hash = [...JSON.stringify(body)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const data = { version: s.content_version != null ? Number(s.content_version) : Math.abs(hash), ...body };

let old = null;
try { old = JSON.parse(await readFile('data.json', 'utf8')); } catch {}
if (old && JSON.stringify(old) === JSON.stringify(data)) { console.log('No change - nothing to publish.'); process.exit(0); }

await writeFile('data.json', JSON.stringify(data));
console.log(`Published version ${data.version}: ${services.length} services, ${branches.length} branches, ${notifications.length} announcements.`);
