const { execSync } = require('child_process');
const deploys = [
  'iz805jluj', 'gxoiavsq7', '6tz58e6mt', 'fx30sko8l', '7hlhlb7hb',
  'qsl0bn6xg', 'c40sk1jbh', 'pfykpc5hb', '4ep9pjans', '7trsiw92s',
  'e8ri40xg0', 'l6yzrcfxf', 'cxtz4jxhi', '3kc7yfybb', '8y4jz2s36'
];
for (const d of deploys) {
  try {
    const out = execSync(`cmd /c "npx vercel inspect ${d} --scope jhoonteixeiraoficial-7398 2>&1"`, { encoding: 'utf8', timeout: 15000 });
    const gitMatch = out.match(/Git\s*[:]\s*([a-f0-9]+)/i);
    const createdMatch = out.match(/Created\s*[:]\s*(.+)/i);
    const git = gitMatch ? gitMatch[1].substring(0, 7) : '???';
    const created = createdMatch ? createdMatch[1].trim() : '???';
    console.log(`${d}  git=${git}  created=${created}`);
  } catch (e) {
    console.log(`${d}  ERROR`);
  }
}
