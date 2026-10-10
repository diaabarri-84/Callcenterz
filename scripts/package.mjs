// Zips dist/ into outreach-upload.zip for cPanel File Manager (Upload → Extract in the
// outreach.reklamx.se folder). Uses the tar that ships with Windows 10+/macOS/Linux.
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, statSync } from 'node:fs'

const out = 'outreach-upload.zip'
for (const f of ['dist/index.html', 'dist/.htaccess', 'dist/api/index.php', 'dist/api/.htaccess', 'dist/api/lib/.htaccess']) {
  if (!existsSync(f)) throw new Error(`${f} missing – run "npm run build" first`)
}
if (existsSync(out)) rmSync(out)
execFileSync('tar', ['-a', '-c', '-f', out, '-C', 'dist', '.'], { stdio: 'inherit' })
console.log(`${out} (${Math.round(statSync(out).size / 1024)} KB) – upload it to the outreach.reklamx.se folder and extract it there.`)
