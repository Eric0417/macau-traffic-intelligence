import SwiftUI

struct NoticesView: View {
    @Environment(AppSettings.self) private var settings
    @State private var notices = LiveResource<[Notice]>()
    @State private var news = LiveResource<News>()
    @State private var selection = 0
    @State private var query = ""
    var body: some View {
        List {
            Picker(settings.text("消息類別", "Update type"), selection: $selection) {
                Text(settings.text("公告與安排", "Arrangements")).tag(0)
                Text(settings.text("政府新聞", "Government news")).tag(1)
            }.pickerStyle(.segmented)
            Text(settings.text("已發布消息未必仍然生效，亦唔代表完整即時事故資料。", "Published notices may no longer apply. This is not a complete live incident feed.")).font(.footnote).foregroundStyle(.secondary)
            if selection == 0 { LoadState(resource: notices) { Task { await notices.load("traffic/notices") } } }
            else { LoadState(resource: news) { Task { await news.load("traffic/news") } } }
            ForEach(items.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || $0.content.localizedCaseInsensitiveContains(query) }) { notice in
                NavigationLink {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            Text(notice.title).font(.title.bold())
                            if let date = Timestamp.date(notice.publishedAt) {
                                Text(publishedLabel(date)).font(.subheadline).foregroundStyle(.secondary)
                            }
                            Text(notice.content).textSelection(.enabled)
                            if let url = URL(string: notice.url) { Link(settings.text("閱讀官方原文", "Read the official notice"), destination: url).buttonStyle(.bordered) }
                        }.padding(24)
                    }.navigationTitle(settings.text("消息詳情", "Update")).navigationBarTitleDisplayMode(.inline)
                } label: {
                    NoticeRow(notice: notice)
                }
            }
            if selection == 1 {
                ForEach(news.data?.feeds ?? [], id: \.name) { feed in
                    Label(feed.name, systemImage: feed.available ? "checkmark.circle" : "exclamationmark.circle").font(.caption).foregroundStyle(feed.available ? Color.secondary : Color.orange)
                }
            }
            SourceNote(meta: selection == 0 ? notices.meta : news.meta, error: selection == 0 ? notices.error : news.error)
        }.navigationTitle(settings.text("交通消息", "Transport updates"))
            .searchable(text: $query, prompt: settings.text("搜尋消息", "Search updates"))
            .livePolling(notices, path: "traffic/notices", interval: 60)
            .livePolling(news, path: "traffic/news", interval: 60)
            .refreshable { if selection == 0 { await notices.load("traffic/notices") } else { await news.load("traffic/news") } }
    }
    private var items: [Notice] { (selection == 0 ? notices.data ?? [] : news.data?.items ?? []).sorted { ($0.publishedAt ?? "") > ($1.publishedAt ?? "") } }
    private func publishedLabel(_ date: Date) -> String {
        let timeStyle: Date.FormatStyle.TimeStyle = selection == 0 ? .omitted : .shortened
        return settings.text("發布：", "Published: ") + date.formatted(date: .abbreviated, time: timeStyle)
    }
}

struct NoticeRow: View {
    var notice: Notice
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(notice.title).font(.headline).fixedSize(horizontal: false, vertical: true)
            Text(notice.content).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
            if let date = Timestamp.date(notice.publishedAt) {
                Text(date.formatted(date: .abbreviated, time: .omitted)).font(.caption).foregroundStyle(.tertiary)
            }
        }.padding(.vertical, 8)
    }
}

struct SourceStatusView: View {
    @Environment(AppSettings.self) private var settings
    @State private var health: Health?
    @State private var error: String?
    var body: some View {
        List {
            Section(settings.text("應用伺服器", "Application server")) {
                if let error, health != nil { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.orange) }
                if let health {
                    Label(error == nil ? settings.text("伺服器可連線", "Server reachable") : settings.text("上次檢查成功；最新檢查失敗", "Previous check succeeded; latest check failed"), systemImage: "network")
                    Text(settings.text("呢個結果唔代表所有上游資料正常。各頁面會分開顯示來源及延遲狀態。", "This does not establish that every upstream source is available. Each screen shows its own source and freshness."))
                    if let date = Timestamp.date(health.time) { Text(date.formatted()).font(.caption).foregroundStyle(.secondary) }
                    ForEach(health.failures.keys.sorted(), id: \.self) { key in
                        if let count = health.failures[key], count > 0 { LabeledContent(key, value: settings.text("近期失敗 \(count) 次", "\(count) recent failures")) }
                    }
                } else if let error { Text(error).foregroundStyle(.orange) }
                else { ProgressView() }
                Button(settings.text("重新檢查", "Check again")) { Task { await load() } }
            }
            Section(settings.text("來源", "Sources")) {
                Link("DSAT · " + settings.text("道路、巴士、泊車、鏡頭", "Roads, buses, parking, cameras"), destination: URL(string: "https://www.dsat.gov.mo")!)
                Link("SMG · " + settings.text("天氣", "Weather"), destination: URL(string: "https://www.smg.gov.mo")!)
                Link("MLM · " + settings.text("輕軌", "Light rail"), destination: URL(string: "https://www.mlm.com.mo")!)
                Link("FSM · " + settings.text("口岸", "Border crossings"), destination: URL(string: "https://www.fsm.gov.mo")!)
                Link("OpenStreetMap · ODbL", destination: URL(string: "https://www.openstreetmap.org/copyright")!)
                Text(settings.text("地圖底圖由 Apple Maps 提供。巴士位置及到站分鐘仍有估算限制；輕軌冇即時列車資料。", "The basemap is provided by Apple Maps. Bus positions and arrival minutes have estimation limits. Live LRT train data is unavailable."))
            }
        }.navigationTitle(settings.text("資料來源", "Sources")).task { await load() }.refreshable { await load() }
    }
    private func load() async {
        do { health = try await APIClient.shared.get("health"); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
