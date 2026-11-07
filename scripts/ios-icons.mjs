// ios-assets/AppIcon.appiconset（icons/icon-512.png から作ったアイコン一式）を、
// `npx cap add ios` で作られた iOS プロジェクトに入れる。Windows・macOS・Linux どれでも動く。
import { cp, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'ios-assets', 'AppIcon.appiconset');
const to = join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
try { await stat(join(root, 'ios', 'App')); } catch { console.error('ios/ がありません。先に npx cap add ios を実行してください'); process.exit(1); }
await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true });
console.log('アプリのアイコンを ios/App/App/Assets.xcassets/AppIcon.appiconset に入れました');
