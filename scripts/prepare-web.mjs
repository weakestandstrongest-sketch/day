// GitHub Pages 版のひび手帳を、Capacitor 用の www/ にコピーする。
// 元のファイルは一切書き換えない（読むだけ）。www/ は毎回まっさらに作り直す。
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'privacy.html'];
const dirs = ['icons', 'startup'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of files) {
  await stat(join(root, f)); // ないときはここで止まる
  await cp(join(root, f), join(out, f));
}
for (const d of dirs) await cp(join(root, d), join(out, d), { recursive: true });

const s = await stat(join(out, 'index.html'));
console.log(`www/ を作りました（index.html ${(s.size / 1024).toFixed(0)} KB、${files.length} ファイル + ${dirs.join('/, ')}/）`);
