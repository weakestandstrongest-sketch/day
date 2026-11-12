import Foundation
import WebKit

enum AdBlockLevel: String, CaseIterable, Identifiable, Codable {
    case off, standard, strong
    var id: String { rawValue }
    var label: String {
        switch self {
        case .off: return "オフ"
        case .standard: return "標準"
        case .strong: return "強力"
        }
    }
}

/// ページの中の「非表示にする項目」のタップを受け取る。
@MainActor
final class PickerBridge: NSObject, WKScriptMessageHandler {
    var onPick: ((WKWebView?, String) -> Void)?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let selector = message.body as? String, !selector.isEmpty {
            onPick?(message.webView, selector)
        }
    }
}

/// すべてのタブで共有する WebView の設定（通常とプライベート）と、広告ブロック。
@MainActor
final class BrowserConfiguration {
    let standard: WKWebViewConfiguration
    let privateMode: WKWebViewConfiguration
    let pickerBridge = PickerBridge()
    let securityBridge = SecurityBridge()
    private var baseList: WKContentRuleList?
    private var strongList: WKContentRuleList?
    private var onlineList: WKContentRuleList?
    /// オンラインのリストから読み込んだドメインの数（設定に表示）
    private(set) var onlineDomainCount = 0
    private(set) var onlineUpdatedAt: Date?

    init() {
        standard = Self.make(store: .default())
        privateMode = Self.make(store: .nonPersistent())
        for config in [standard, privateMode] {
            config.userContentController.add(pickerBridge, contentWorld: .defaultClient, name: "orbitHide")
            // 暗号化されていないページのパスワード欄を見つける（ページのスクリプトから見えない別の世界で動かす）
            config.userContentController.add(securityBridge, contentWorld: .defaultClient, name: "orbitSecurity")
            config.userContentController.addUserScript(WKUserScript(source: SecurityScript.source, injectionTime: .atDocumentEnd,
                                                                    forMainFrameOnly: true, in: .defaultClient))
        }
    }

    private static func make(store: WKWebsiteDataStore) -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = store
        config.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1"
        // 詐欺・フィッシングとして知られているサイトの警告（Safari と同じしくみ）
        config.preferences.isFraudulentWebsiteWarningEnabled = true
        // 指で押していないのに勝手に新しい窓を開くスクリプトを止める
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        return config
    }

    // MARK: Ad blocking

    /// 前に作ったリストがあればそれを使う（毎回作り直すと起動が重い）。中身が変わったら id を変える。
    private func cached(_ id: String) async -> WKContentRuleList? {
        await withCheckedContinuation { continuation in
            WKContentRuleListStore.default().lookUpContentRuleList(forIdentifier: id) { list, _ in
                continuation.resume(returning: list)
            }
        }
    }

    private func compileOrLoad(_ id: String, _ json: @autoclosure () -> String) async -> WKContentRuleList? {
        if let list = await cached(id) { return list }
        return await compile(id, json())
    }

    private func compile(_ id: String, _ json: String) async -> WKContentRuleList? {
        await withCheckedContinuation { continuation in
            WKContentRuleListStore.default().compileContentRuleList(forIdentifier: id, encodedContentRuleList: json) { list, _ in
                continuation.resume(returning: list)
            }
        }
    }

    /// level に必要なリストを用意する。strong ではオンラインの広告サーバー一覧も取り込む。
    func prepare(_ level: AdBlockLevel, refreshOnline: Bool = false) async {
        guard level != .off else { return }
        if baseList == nil {
            baseList = await compileOrLoad("orbit-adblock-base-v3", ContentBlocker.rulesJSON(domains: ContentBlocker.domains + ContentBlocker.moreDomains, selectors: ContentBlocker.hiddenSelectors))
        }
        guard level == .strong else { return }
        if strongList == nil {
            strongList = await compileOrLoad("orbit-adblock-strong-v3", ContentBlocker.strongRulesJSON())
        }
        if onlineList == nil || refreshOnline {
            let stale = ContentBlocker.onlineFileDate().map { Date().timeIntervalSince($0) >= 7 * 24 * 3600 } ?? true
            if !refreshOnline, !stale, let list = await cached("orbit-adblock-online-v2") {
                // 1週間以内に作ったものはそのまま使う
                onlineList = list
                onlineDomainCount = ContentBlocker.onlineCountSaved
            } else {
                let domains = await ContentBlocker.onlineDomains(forceRefresh: refreshOnline)
                if !domains.isEmpty {
                    onlineList = await compile("orbit-adblock-online-v2", ContentBlocker.rulesJSON(domains: domains, selectors: []))
                    if onlineList != nil {
                        onlineDomainCount = domains.count
                        ContentBlocker.onlineCountSaved = domains.count
                    }
                }
            }
            onlineUpdatedAt = ContentBlocker.onlineFileDate()
        }
    }

    func applyBlocking(_ level: AdBlockLevel, to webView: WKWebView) {
        let controller = webView.configuration.userContentController
        controller.removeAllContentRuleLists()
        guard level != .off else { return }
        if let baseList { controller.add(baseList) }
        if level == .strong {
            if let strongList { controller.add(strongList) }
            if let onlineList { controller.add(onlineList) }
        }
    }
}

enum ContentBlocker {
    /// 内蔵の広告・トラッキングのドメイン。
    static let domains = [
        // Google
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com", "googletagservices.com",
        "googletagmanager.com", "adservice.google.com", "adservice.google.co.jp", "pagead2.googlesyndication.com", "2mdn.net",
        "app-measurement.com", "imasdk.googleapis.com", "admob.com", "adsensecustomsearchads.com",
        // Exchanges / SSP / DSP
        "adnxs.com", "adsrvr.org", "advertising.com", "amazon-adsystem.com", "criteo.com", "criteo.net", "rubiconproject.com",
        "pubmatic.com", "openx.net", "casalemedia.com", "smartadserver.com", "teads.tv", "yieldmo.com", "sharethrough.com",
        "media.net", "bidswitch.net", "3lift.com", "adform.net", "adroll.com", "zedo.com", "indexww.com", "lijit.com",
        "sovrn.com", "gumgum.com", "triplelift.com", "contextweb.com", "spotxchange.com", "spotx.tv", "adcolony.com",
        "applovin.com", "unityads.unity3d.com", "vungle.com", "inmobi.com", "mopub.com", "smaato.net", "tapjoy.com",
        "chartboost.com", "ironsrc.com", "supersonicads.com", "adsafeprotected.com", "doubleverify.com", "moatads.com",
        "serving-sys.com", "sizmek.com", "flashtalking.com", "eyeota.net", "bluekai.com", "krxd.net", "demdex.net",
        "everesttech.net", "omtrdc.net", "2o7.net", "rlcdn.com", "agkn.com", "exelator.com", "tapad.com", "crwdcntrl.net",
        "mathtag.com", "turn.com", "dotomi.com", "simpli.fi", "stickyadstv.com", "tremorhub.com", "adkernel.com",
        "33across.com", "emxdgt.com", "onetag-sys.com", "id5-sync.com", "liadm.com", "pippio.com", "zemanta.com",
        "undertone.com", "conversantmedia.com", "aniview.com", "connatix.com", "primis.tech", "vidazoo.com", "seedtag.com",
        // Native / content recommendation
        "outbrain.com", "taboola.com", "revcontent.com", "mgid.com", "content.ad", "adblade.com", "nativo.com", "ligatus.com",
        "popin.cc", "logly.co.jp", "gunosy.com", "uzou.jp",
        // Pop-under / aggressive
        "popads.net", "popcash.net", "propellerads.com", "propellerclick.com", "adsterra.com", "exoclick.com", "exosrv.com",
        "juicyads.com", "trafficjunky.net", "hilltopads.net", "clickadu.com", "adcash.com", "onclickads.net", "ad-maven.com",
        "mondiad.com", "richpush.co", "pushnami.com", "onesignal.com", "pushwoosh.com", "pushengage.com",
        // Analytics / session replay
        "scorecardresearch.com", "quantserve.com", "hotjar.com", "mouseflow.com", "fullstory.com", "mixpanel.com", "segment.io",
        "segment.com", "amplitude.com", "branch.io", "appsflyer.com", "adjust.com", "kochava.com", "chartbeat.com",
        "chartbeat.net", "newrelic.com", "nr-data.net", "clarity.ms", "crazyegg.com", "luckyorange.com", "inspectlet.com",
        "optimizely.com", "statcounter.com", "histats.com", "parsely.com", "matomo.cloud", "heapanalytics.com",
        "bugsnag.com", "sentry-cdn.com", "smartlook.com", "logrocket.com", "treasuredata.com", "karte.io", "ptengine.jp",
        "userlocal.jp", "i-mobile.co.jp",
        // Social trackers
        "connect.facebook.net", "ads-twitter.com", "analytics.twitter.com", "ads.linkedin.com", "px.ads.linkedin.com",
        "analytics.tiktok.com", "ads.tiktok.com", "ads.pinterest.com", "ct.pinterest.com", "sc-static.net", "tr.snapchat.com",
        "bat.bing.com", "ads.yahoo.com", "analytics.yahoo.com",
        // Japan
        "yads.yahoo.co.jp", "yjtag.yahoo.co.jp", "s.yimg.jp/images/listing", "microad.jp", "microad.net", "fout.jp",
        "impact-ad.jp", "ad-stir.com", "nend.net", "adingo.jp", "gmossp-sp.jp", "socdm.com", "ladsp.com", "adtdp.com",
        "unthem.com", "a8.net", "accesstrade.net", "valuecommerce.com", "moshimo.com", "afi-b.com", "rentracks.jp",
        "felmat.net", "amoad.com", "geniee.jp", "gssprt.jp", "genieesspv.jp", "yieldone.com", "fluct.jp", "adfurikun.jp",
        "zucks.net", "zucks.co.jp", "ameba.jp/ad", "ad.nicovideo.jp", "adlantis.jp", "advg.jp", "deqwas.net", "sitest.jp",
        "aid.send.microad.jp", "cosmi.io", "bypass.jp", "adpon.jp", "maist.jp", "ebis.ne.jp", "ad-m.asia", "caprofitx.com",
        "taxel.jp", "rtoaster.jp", "docodoco.jp", "nakanohito.jp", "shinobi.jp", "ninja.co.jp", "i2i.jp", "ziyu.net",
        "blogmura.com/ad", "adnico.jp", "performancefirst.jp", "smart-c.jp", "reemo-ad.jp", "addlv.smt.docomo.ne.jp",
        "medibaad.com", "poweredbyaimstar.com", "aimstar.jp", "webantenna.info", "logmi.jp/ad",
    ]

    /// 追加の広告・計測・悪質な広告の配信元。
    static let moreDomains = [
        // 広告の配信・計測
        "adsymptotic.com", "adtelligent.com", "adsco.re", "adthrive.com", "mediavine.com", "ezoic.net", "ezodn.com",
        "ezojs.com", "carbonads.com", "carbonads.net", "buysellads.com", "servedby-buysellads.com", "infolinks.com",
        "kargo.com", "lkqd.net", "springserve.com", "teads.com", "unrulymedia.com", "smilewanted.com", "richaudience.com",
        "adhese.com", "improvedigital.com", "yieldlab.net", "stroeerdigitalgroup.de", "ad.gt", "adition.com",
        "admixer.net", "adriver.ru", "betweendigital.com", "yandexadexchange.net", "an.yandex.ru", "mc.yandex.ru",
        "admatic.com.tr", "adpushup.com", "freestar.com", "freestar.io", "pbxai.com", "medianet.com", "contextual.media.net",
        "quantcount.com", "quantcast.com", "permutive.com", "permutive.app", "cdn.permutive.com", "lotame.com",
        "bounceexchange.com", "bouncex.net", "wunderkind.co", "zergnet.com", "adsupply.com", "popunder.net",
        "intellipopup.com", "pubnation.com", "pushcrew.com", "subscribers.com", "sendpulse.com", "webpushr.com",
        "izooto.com", "truepush.com", "aimtell.com", "foxpush.com", "gravitec.net", "pushpushgo.com",
        // 計測・行動の記録
        "doubleclick.com", "googleoptimize.com", "stats.g.doubleclick.net", "analytics.google.com", "fls.doubleclick.net",
        "pixel.facebook.com", "an.facebook.com", "graph.instagram.com/logging", "analytics.pinterest.com",
        "snap.licdn.com", "insight.adsrvr.org", "js.adsrvr.org", "tags.tiqcdn.com", "tealiumiq.com", "ensighten.com",
        "omniture.com", "adobedtm.com", "assets.adobedtm.com", "evergage.com", "cquotient.com", "mxpnl.com",
        "kissmetrics.com", "woopra.com", "clicky.com", "getclicky.com", "foxmetrics.com", "yandex.ru/metrika",
        "clarity.microsoft.com", "c.clarity.ms", "browser-intake-datadoghq.com", "rum.hlx.page", "cdn.mxpnl.com",
        "fullstory.io", "quantummetric.com", "contentsquare.net", "decibelinsight.net", "glassboxdigital.io",
        "sessioncam.com", "clicktale.net", "uxcam.com", "mouseflow.net", "hotjar.io", "smartlook.cloud",
        // 日本
        "ad.impact-ad.jp", "send.microad.jp", "cache.send.microad.jp", "adm.shinobi.jp", "x9.shinobi.jp",
        "j.zucks.net.zimg.jp", "sh.adingo.jp", "ad.adpon.jp", "ad.ad-stir.com", "js.ad-stir.com", "img.ak.impact-ad.jp",
        "ad.yieldmanager.com", "adsv.jp", "adlpo.com", "ads-pixiv.net", "ad.mlp.cx", "crossdevice.jp", "glossom.jp",
        "smac-ssp.com", "pdn.adingo.jp", "imobile.co.jp", "spnativeapi-tls.i-mobile.co.jp", "yimg.jp/images/ads",
        "ad.auone.jp", "ad.excite.co.jp", "adcloud.jp", "ad.gunosy.com", "flux-cdn.com", "adapf.com",
    ]

    /// 広告の枠を消す CSS セレクタ。
    static let hiddenSelectors = [
        ".adsbygoogle", "ins.adsbygoogle", "[id^='div-gpt-ad']", "[id^='google_ads_iframe']", "[id^='google_ads_']",
        "[class*='ad-banner']", "[class^='ad_']", ".ad-slot", ".ad-container", ".ad-wrapper", ".advertisement", ".advert",
        "[data-ad-slot]", "[data-ad-client]", "[data-ad-unit]", "[data-google-query-id]", "iframe[src*='doubleclick.net']",
        "iframe[src*='googlesyndication.com']", "iframe[src*='amazon-adsystem.com']", "iframe[id^='aswift_']",
        ".OUTBRAIN", ".ob-widget", ".trc_related_container", "[id^='taboola-']", ".taboola", ".mgbox", "[id^='yads']",
        ".yads_ad", "[class*='sponsored-']", "amp-ad", "amp-embed[type='taboola']", "amp-sticky-ad",
        "[id^='ad-']:not(html):not(body)", "[id$='-ad']:not(html):not(body)", "[class$='-ad']:not(html):not(body)",
        "[aria-label='広告']", "[aria-label='Advertisement']", "[aria-label='Sponsored']",
    ]

    /// 「強力」で追加する、じゃまな枠（下に貼りつく広告、通知の許可、アプリへの誘導、おすすめ枠など）。
    static let strongSelectors = [
        "[class*='sticky-ad']", "[class*='stickyAd']", "[class*='fixed-ad']", "[class*='overlay-ad']", "[class*='adOverlay']",
        "[class*='interstitial']", "[id*='interstitial']", "[class*='ad_frame']", "[class*='adsBox']", "[class*='adbox']",
        "[class*='AdSlot']", "[class*='adslot']", "[class*='ad-unit']", "[class*='adunit']", "[class*='AdUnit']",
        "[class*='gpt-ad']", "[class*='dfp-ad']", "[class*='banner-ad']", "[class*='bannerAd']", "[class*='native-ad']",
        "[class*='promoted-']", "[class*='smartbanner']", "[class*='app-banner']", "[class*='appBanner']",
        "[class*='push-notification']", "[class*='notification-prompt']", "#onesignal-slidedown-container",
        "#onesignal-bell-container", "[class*='newsletter-popup']", "[class*='newsletter-modal']", "[class*='subscribe-popup']",
        "[id*='google_vignette']", ".google-auto-placed", "[class*='recommend-ad']", "[class*='pr-banner']",
        "[class*='affiliate']", "iframe[src*='taboola']", "iframe[src*='outbrain']", "iframe[src*='microad']",
        "iframe[src*='i-mobile']", "iframe[src*='nend.net']", "iframe[src*='fout.jp']", "iframe[src*='socdm.com']",
        "iframe[src*='a8.net']", "a[href*='a8.net']", "a[href*='accesstrade.net'] img", "a[href*='valuecommerce.com'] img",
        "a[href*='doubleclick.net']", "a[href*='googleadservices.com']",
    ]

    static func rulesJSON(domains: [String], selectors: [String]) -> String {
        var rules: [[String: Any]] = domains.map { domain in
            let escaped = NSRegularExpression.escapedPattern(for: domain).replacingOccurrences(of: "/", with: "\\/")
            if domain.contains("/") {
                return ["trigger": ["url-filter": "^https?://\(escaped)"], "action": ["type": "block"]]
            }
            return [
                "trigger": ["url-filter": "^https?://([a-z0-9-]+\\.)*\(escaped)[/:?]", "load-type": ["third-party"]],
                "action": ["type": "block"],
            ]
        }
        if !selectors.isEmpty {
            rules.append([
                "trigger": ["url-filter": ".*"],
                "action": ["type": "css-display-none", "selector": selectors.joined(separator: ", ")],
            ])
        }
        let data = (try? JSONSerialization.data(withJSONObject: rules)) ?? Data("[]".utf8)
        return String(decoding: data, as: UTF8.self)
    }

    /// 「強力」：じゃまな枠を消し、広告・計測でよく使われる URL の形もブロックする。
    static func strongRulesJSON() -> String {
        let patterns = [
            "/pagead/", "/adsbygoogle", "/ads\\.js", "/ad\\.js", "/adframe\\.", "/adserver/", "/adsense/", "/advert/",
            "/banner_ad", "/prebid", "/gpt\\.js", "/pubads", "/adrequest", "/adview\\?", "/ad_iframe", "/popunder",
            "/tracking\\.js", "/tracker\\.js", "/pixel\\.gif", "/beacon\\.gif", "/collect\\?v=", "/analytics\\.js",
        ]
        var rules: [[String: Any]] = patterns.map { pattern in
            ["trigger": ["url-filter": pattern, "load-type": ["third-party"],
                         "resource-type": ["script", "image", "raw", "popup", "document"]],
             "action": ["type": "block"]]
        }
        // 別のサイトから開かれるポップアップ
        rules.append(["trigger": ["url-filter": ".*", "resource-type": ["popup"], "load-type": ["third-party"]],
                      "action": ["type": "block"]])
        rules.append(["trigger": ["url-filter": ".*"],
                      "action": ["type": "css-display-none", "selector": strongSelectors.joined(separator: ", ")]])
        let data = (try? JSONSerialization.data(withJSONObject: rules)) ?? Data("[]".utf8)
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: Online list (ad server hostnames, refreshed weekly)

    /// 広告サーバーの一覧。取れたものをすべて合わせる（1つが落ちていても動く）。
    private static let onlineURLs = [
        "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=nohtml&showintro=0&mimetype=plaintext",
        "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/light.txt",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/light.txt",
    ]

    static var onlineCountSaved: Int {
        get { OrbitEmbed.defaults.integer(forKey: "adblock.onlineCount") }
        set { OrbitEmbed.defaults.set(newValue, forKey: "adblock.onlineCount") }
    }

    private static var onlineFile: URL {
        let base = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("adblock-online.txt")
    }

    static func onlineFileDate() -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: onlineFile.path))?[.modificationDate] as? Date
    }

    static func onlineDomains(forceRefresh: Bool) async -> [String] {
        let fresh = onlineFileDate().map { Date().timeIntervalSince($0) < 7 * 24 * 3600 } ?? false
        if forceRefresh || !fresh {
            var merged: [String] = []
            var seenMirror = false
            for source in onlineURLs {
                // hagezi は GitHub と jsDelivr の同じもの。片方が取れたらもう片方は見ない
                if seenMirror, source.contains("hagezi") { continue }
                guard let url = URL(string: source) else { continue }
                var request = URLRequest(url: url)
                request.timeoutInterval = 25
                if let (data, response) = try? await URLSession.shared.data(for: request),
                   (response as? HTTPURLResponse)?.statusCode == 200, data.count > 1000 {
                    merged += HostList.parse(String(decoding: data, as: UTF8.self), limit: 120_000)
                    if source.contains("hagezi") { seenMirror = true }
                }
            }
            if merged.count > 100 {
                try? merged.joined(separator: "\n").write(to: onlineFile, atomically: true, encoding: .utf8)
            }
        }
        guard let text = try? String(contentsOf: onlineFile, encoding: .utf8) else { return [] }
        let known = Set(domains + moreDomains)
        var seen = Set<String>()
        var result: [String] = []
        for line in text.split(whereSeparator: \.isNewline) {
            let host = line.trimmingCharacters(in: .whitespaces).lowercased()
            guard host.count >= 4, host.count <= 80, host.contains("."), !known.contains(host), seen.insert(host).inserted,
                  host.range(of: "^[a-z0-9.-]+$", options: .regularExpression) != nil else { continue }
            result.append(host)
            // WebKit の1つのリストは 15 万件まで。コンパイルの重さも考えて 5 万件で止める
            if result.count >= 50_000 { break }
        }
        return result
    }
}
