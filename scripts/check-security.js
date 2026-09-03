/* eslint-disable @typescript-eslint/no-require-imports */
const https = require('https');

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'ifcmeziumkctejqbyxdo.supabase.co',
      path,
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function check() {
  console.log('=== VERIFICANDO SEGURANCA ===\n');

  // 1. Listar todos os usuarios
  console.log('1. Todos os usuarios:');
  const users = await makeRequest('/auth/v1/admin/users');
  console.log('   Total:', users.users?.length || 0);
  users.users?.forEach(u => {
    console.log('   -', u.email, '(' + u.id + ')');
  });

  // 2. Verificar profiles
  console.log('\n2. Todos os profiles:');
  const profiles = await makeRequest('/rest/v1/profiles?select=id,email,role');
  console.log('   Total:', profiles?.length || 0);
  profiles?.forEach(p => {
    console.log('   -', p.email, '- role:', p.role);
  });

  // 3. Verificar subscriptions
  console.log('\n3. Todas as subscriptions:');
  const subs = await makeRequest('/rest/v1/subscriptions?select=user_id,status,plan');
  console.log('   Total:', subs?.length || 0);
  subs?.forEach(s => {
    console.log('   - User:', s.user_id, '- Status:', s.status, '- Plan:', s.plan);
  });
}

check();
