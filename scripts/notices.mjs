import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
let output =
  'FlipChart third-party notices\n\nThe application is MIT licensed. Dependencies retain their own licenses.\nThis inventory includes installed runtime and developer dependencies from the committed lockfile.\nMarket data is not licensed by this file. TradingView Lightweight Charts is Apache-2.0; visible attribution is retained in the application.\n';
for (const [path, pkg] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (!path || !existsSync(path)) continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 13);
  output += `\n\n===== ${name} ${pkg.version} (${pkg.license ?? 'see package metadata'}) =====\n`;
  const files = readdirSync(path).filter((name) =>
    /^(license|licence|copying|notice)([._-]|$)/i.test(name),
  );
  if (!files.length)
    output +=
      'No standalone license/notice file supplied; consult the package metadata and upstream distribution.\n';
  for (const file of files)
    output += `\n--- ${file} ---\n${readFileSync(join(path, file), 'utf8')}\n`;
}
output += '\n\n' + readFileSync('public/tradingview-notice.txt', 'utf8');
writeFileSync('public/third-party-notices.txt', output);

writeFileSync('public/license.txt', readFileSync('LICENSE', 'utf8'));
