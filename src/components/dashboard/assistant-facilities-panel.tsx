import { useLanguage } from "@/components/language-provider";
import type { AssistantFacilityResults, AssistantPlace } from "@/lib/assistant-journey";
import { facilityLabels, type FacilitySearch } from "@/lib/facility-search";
import type { Locale } from "@/lib/types";

export function facilityDistanceLabel(search: FacilitySearch, meters: number, locale: Locale) {
  const distance = meters < 1000 ? `${meters.toLocaleString(locale)} m` : `${(meters / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} km`;
  if (search.distance === "walking") {
    return locale === "en" ? `Mapped walk about ${distance}` : locale === "zh-Hans" ? `地图步行约 ${distance}` : `地圖步行約 ${distance}`;
  }
  return locale === "en" ? `About ${distance} straight-line distance` : locale === "zh-Hans" ? `直线距离约 ${distance}` : `直線距離約 ${distance}`;
}

export function AssistantFacilitiesPanel({ result, busy, onDirections }: {
  result: AssistantFacilityResults;
  busy: boolean;
  onDirections: (place: AssistantPlace) => void;
}) {
  const { locale } = useLanguage();
  const label = (hant: string, hans: string, en: string) => locale === "en" ? en : locale === "zh-Hans" ? hans : hant;
  const { search, origin, matches } = result;
  const category = facilityLabels[search.category][locale];
  const title = label(`附近${category}`, `附近${category}`, `${category} nearby`);
  return <section className="panel-section" aria-label={title}>
    <h2>{title}</h2>
    <p className="quiet-copy">{label(`以「${origin.name}」為中心`, `以「${origin.name}」为中心`, `From ${origin.name}`)}</p>
    {search.verify ? <p className="data-warning" role="status">
      {search.verify === "hours"
        ? label("未能核實而家邊間營業。以下係地圖上嘅候選，出發前請先確認。", "无法核实目前哪家营业。以下是地图上的候选，出发前请先确认。", "Current opening hours are unverified. Check with the facility before travelling.")
        : label("未能核實你要求嘅服務。以下係地圖上嘅候選，出發前請先確認。", "无法核实你要求的服务。以下是地图上的候选，出发前请先确认。", "The requested service is unverified. Check with the facility before travelling.")}
    </p> : null}
    {matches.length ? <ul className="assistant-context">
      {matches.map(match => <li key={match.id}>
        <strong>{match.name}</strong>
        <p>{facilityDistanceLabel(search, match.distanceMeters, locale)}{match.context ? ` · ${match.context}` : ""}</p>
        <button className="text-action" type="button" disabled={busy}
          aria-label={label(`前往${match.name}嘅路線`, `前往${match.name}的路线`, `Directions to ${match.name}`)}
          onClick={() => onDirections(match)}>
          {label("查看路線", "查看路线", "Directions")}
        </button>
      </li>)}
    </ul> : <p role="status" className="quiet-copy">
      {search.distance === "walking"
        ? label("目前嘅步行地圖未搵到連接到呢類設施嘅路徑。", "目前的步行地图未找到连接此类设施的路径。", "The walking map has no connected path to a facility of this type.")
        : label("目前地圖資料未搵到呢類設施。", "目前地图数据未找到此类设施。", "The current map data has no matches for this type of facility.")}
    </p>}
    {result.routeNote ? <p className="data-warning" role="status">{result.routeNote}</p> : null}
    <p className="source-note"><span>{label("地圖資料", "地图数据", "Map data")} {result.mappedAt.slice(0, 10)}</span>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
    </p>
  </section>;
}
