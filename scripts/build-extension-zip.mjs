// Regenera o zip da extensão após editar extension/. Rodar: node scripts/build-extension-zip.mjs
import { execSync } from 'node:child_process'
execSync('powershell -Command "Compress-Archive -Path \'extension\manifest.json\',\'extension\content.js\' -DestinationPath \'public\assertive-espionagem.zip\' -Force"', { stdio: 'inherit' })
console.log('zip atualizado em public/assertive-espionagem.zip')
