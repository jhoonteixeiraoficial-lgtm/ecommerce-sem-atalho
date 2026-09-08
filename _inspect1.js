const { execSync } = require('child_process');
const out = execSync('cmd /c "npx vercel inspect https://ecommerce-sem-atalho-iz805jluj-jhoonteixeiraoficial-7398.vercel.app --scope jhoonteixeiraoficial-7398 2>&1"', { encoding: 'utf8', timeout: 30000 });
console.log(out);
