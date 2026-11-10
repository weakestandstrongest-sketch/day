// `npx cap add ios` で作られた iOS プロジェクトに、ひび手帳に必要な設定を入れる（毎回作り直すので、ここで足す）
//   - アプリのアイコン（ios-assets/AppIcon.appiconset）
//   - Info.plist：表示名（英字の Hibi。日本語の iPhone では ja.lproj で「ひび手帳」）、Google ログインから戻る URL スキーム、Face ID・カメラ・マイク・位置情報・写真の使い道の説明
// Windows・macOS・Linux どれでも動く。何度実行しても同じ結果になる。
import { cp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'ios', 'App', 'App');
try { await stat(app); } catch { console.error('ios/ がありません。先に npx cap add ios を実行してください'); process.exit(1); }

// icons
const iconTo = join(app, 'Assets.xcassets', 'AppIcon.appiconset');
await rm(iconTo, { recursive: true, force: true });
await cp(join(root, 'ios-assets', 'AppIcon.appiconset'), iconTo, { recursive: true });

// Info.plist
const SCHEME = 'jp.weakestandstrongest.hibi';
const keys = {
  // AltStore / AltServer register the app with Apple under this name, and Apple only takes letters and digits there
  // ("The name for this app is invalid"). The home screen still shows ひび手帳 from ja.lproj/InfoPlist.strings,
  // which the workflow copies into the app (ios-assets/ja.lproj).
  CFBundleDisplayName: '<string>Hibi</string>',
  CFBundleURLTypes: `<array><dict><key>CFBundleURLName</key><string>${SCHEME}</string><key>CFBundleURLSchemes</key><array><string>${SCHEME}</string></array></dict></array>`,
  NSFaceIDUsageDescription: '<string>ひび手帳のロックを Face ID で開くために使います。</string>',
  NSCameraUsageDescription: '<string>日記の写真を撮るために使います。</string>',
  NSMicrophoneUsageDescription: '<string>カメラで撮影するときに使います（音声は保存しません）。</string>',
  NSLocationWhenInUseUsageDescription: '<string>日記や「この1週間の動き」に、いる場所と天気を記録するために使います。</string>',
  NSPhotoLibraryUsageDescription: '<string>日記に写真を入れるために使います。</string>',
  NSPhotoLibraryAddUsageDescription: '<string>撮った写真を「写真」アプリに保存するために使います。</string>',
};
const plistPath = join(app, 'Info.plist');
let plist = await readFile(plistPath, 'utf8');
for (const [k, v] of Object.entries(keys)) {
  // remove an older copy of the key (so running twice changes nothing), then add it before the closing </dict>
  plist = plist.replace(new RegExp(`\\s*<key>${k}</key>\\s*(<string>[\\s\\S]*?</string>|<array>[\\s\\S]*?</array>(?=\\s*<key>|\\s*</dict>\\s*</plist>))`), '');
  plist = plist.replace(/\n?<\/dict>\s*<\/plist>\s*$/, `\n\t<key>${k}</key>\n\t${v}\n</dict>\n</plist>\n`);
}
await writeFile(plistPath, plist);
console.log('iOS プロジェクトに、アイコンと Info.plist の設定（URL スキーム・Face ID などの説明）を入れました');
