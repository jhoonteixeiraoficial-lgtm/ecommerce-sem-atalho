const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const env = {};
for (const l of lines) {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}
const { createClient } = require('@supabase/supabase-js');
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
s.from('assertive_listings').select('id,ml_item_id,published_at,created_at,updated_at,attributes').eq('ml_item_id','MLB5202962925').then(r => {
  console.log(JSON.stringify(r.data, null, 2));
  process.exit(0);
});
