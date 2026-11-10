import type { CapacitorConfig } from '@capacitor/cli';

// ひび手帳の iOS アプリ版（Capacitor 8）
// www/ は `npm run build`（scripts/prepare-web.mjs）が GitHub Pages 版のファイルをコピーして作る。
const config: CapacitorConfig = {
  appId: 'jp.weakestandstrongest.hibi',
  appName: 'ひび手帳',
  webDir: 'www',
  ios: {
    // 画面のすみ（ノッチ・ホームバー）は、ひび手帳の CSS が env(safe-area-inset-*) で避けている
    contentInset: 'never',
    // behind the page while it loads: black, like the screen before it (no beige flash before the launch animation)
    backgroundColor: '#000000',
  },
};

export default config;
