// GitHub Pages 版のひび手帳を、Capacitor 用の www/ にコピーする。
// 元のファイルは一切書き換えない（読むだけ）。www/ は毎回まっさらに作り直す。
//
// まいにち（AI・リポジトリ hibi2）もあれば www/hibi2/ に入れる。ひび手帳は ../hibi2/ を開くので、アプリの中でも同じ場所になる。
//   探す場所：環境変数 HIBI2_DIR → このフォルダの隣の ../hibi2
//   見つからないときは入れずに続ける（まいにちの画面だけ開けなくなる）。HIBI2_REQUIRED=1 のときは止める。
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'privacy.html'];
const dirs = ['icons', 'startup', 'sounds', 'one', 'camera']; // one/ = iti（カレンダーの左端から開く）

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of files) {
  await stat(join(root, f)); // ないときはここで止まる
  await cp(join(root, f), join(out, f));
}
for (const d of dirs) await cp(join(root, d), join(out, d), { recursive: true });
const s = await stat(join(out, 'index.html'));
console.log(`www/ を作りました（index.html ${(s.size / 1024).toFixed(0)} KB、${files.length} ファイル + ${dirs.join('/, ')}/）`);

// まいにち（hibi2）
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const candidates = [process.env.HIBI2_DIR, join(root, '..', 'hibi2')].filter(Boolean).map(p => resolve(root, p));
let hibi2 = '';
for (const c of candidates) if (await exists(join(c, 'index.html')) && await exists(join(c, 'ai', 'mainichi-ai.js'))) { hibi2 = c; break; }
if (!hibi2) {
  const msg = `まいにち（hibi2）が見つかりませんでした（探した場所：${candidates.join('、')}）`;
  if (process.env.HIBI2_REQUIRED === '1') { console.error(msg); process.exit(1); }
  console.warn(msg + '。まいにちを入れずに続けます');
} else {
  const to = join(out, 'hibi2');
  await mkdir(to, { recursive: true });
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js']) if (await exists(join(hibi2, f))) await cp(join(hibi2, f), join(to, f));
  for (const d of ['icons', 'ai']) if (await exists(join(hibi2, d))) await cp(join(hibi2, d), join(to, d), { recursive: true });
  console.log(`まいにち（${hibi2}）を www/hibi2/ に入れました`);
}
