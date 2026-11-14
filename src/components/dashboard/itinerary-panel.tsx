"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { ItineraryOption, ItineraryPlans, ItineraryResult, TripDraft } from "@/lib/itinerary";
import { timeMinutes } from "@/lib/itinerary";
import type { SelectedJourney } from "./journey-map-detail";

export function itineraryDraft(plans: ItineraryPlans, option: ItineraryOption): TripDraft {
  const day = plans.draft.mode === "day";
  return { ...plans.draft, fixedStops: day || undefined, originQuery: option.stops[0].id === "current" ? undefined : option.stops[0].name,
    originId: option.stops[0].id === "current" ? undefined : option.stops[0].id,
    stops: (day ? option.stops.filter(s => s.visit) : option.stops.slice(1)).map(s => ({ query: s.name, placeId: s.id, stayMinutes: s.stayMinutes })) };
}

export function ItineraryPanel({ result, busy, onContinue, onJourney, onSelect, onClearMap }: {
  result: ItineraryResult; busy: boolean;
  onContinue: (draft: TripDraft) => void;
  onJourney: (journey: SelectedJourney) => void;
  onSelect: (draft: TripDraft) => void;
  onClearMap: () => void;
}) {
  const { locale } = useLanguage();
  const label = (hant: string, hans: string, en: string) => locale === "en" ? en : locale === "zh-Hans" ? hans : hant;
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editStops, setEditStops] = useState<TripDraft["stops"]>([]);
  const [today] = useState(() => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10));
  if (result.kind === "trip-location") return null;
  if (result.kind === "trip-details") return <section className="panel-section trip-details" aria-labelledby="trip-details-title">
    <h2 id="trip-details-title">{label("先了解你嘅一日遊", "先了解你的一日游", "Plan your day")}</h2>
    <p>{result.draft.theme}</p>
    <p className="quiet-copy">{label("填好以下資料，再幫你比較完整行程。已提供嘅資料可以修改。", "补齐以下资料，再比较完整行程。已提供的资料可以修改。", "Complete the details to compare full itineraries. You can edit prefilled answers.")}</p>
    {result.message ? <p className="data-warning" role="status">{result.message}</p> : null}
    <form className="trip-form" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const get = (key: string) => String(data.get(key) ?? "").trim();
      onContinue({ ...result.draft, date: get("date"), startTime: get("startTime"), endTime: get("endTime"),
        originQuery: get("originQuery"), originId: get("originQuery") === result.draft.originQuery ? result.draft.originId : undefined,
        endQuery: get("endQuery"), endId: get("endQuery") === result.draft.endQuery ? result.draft.endId : undefined,
        preferences: get("preferences") });
    }}>
      <label>{label("出遊日期", "出游日期", "Date")}<input type="date" name="date" required defaultValue={result.draft.date} min={today} /></label>
      <div className="trip-time-fields">
        <label>{label("開始時間", "开始时间", "Start time")}<input type="time" name="startTime" required defaultValue={result.draft.startTime} /></label>
        <label>{label("結束時間", "结束时间", "End time")}<input type="time" name="endTime" required defaultValue={result.draft.endTime} /></label>
      </div>
      <label>{label("出發地點", "出发地点", "Starting point")}<input name="originQuery" required maxLength={150} defaultValue={result.draft.originQuery} /></label>
      <label>{label("最後去邊度", "最后到哪里", "End at")}<input name="endQuery" required maxLength={150} defaultValue={result.draft.endQuery} placeholder={label("例如：關閘總站", "例如：关闸总站", "For example: Border Gate terminal")} /></label>
      <label>{label("遊玩偏好", "游玩偏好", "Preferences")}<textarea name="preferences" required rows={3} maxLength={300} defaultValue={result.draft.preferences} placeholder={label("例如：想睇廟宇、節奏輕鬆、每段步行盡量少於一公里", "例如：想看庙宇、节奏轻松、每段步行尽量少于一公里", "For example: temples, relaxed pace, shorter walks")} /></label>
      <button className="primary-action" disabled={busy}>{label("安排一日遊方案", "安排一日游方案", "Compare day trips")}</button>
    </form>
  </section>;
  if (result.kind === "trip-choice") return <section className="panel-section assistant-place-choices">
    <h2>{label("確認行程地點", "确认行程地点", "Confirm a place")}</h2>
    <p>{result.field === "origin" ? label("起點", "起点", "Start") : result.field === "end" ? label("終點", "终点", "End") : `${label("目的地", "目的地", "Destination")} ${result.field + 1}`} · {result.query}</p>
    {!result.choices.length ? <p className="data-warning">{label("未搵到匹配地點，請提供完整地名或附近巴士站。", "没有找到匹配地点，请提供完整地名或附近公交站。", "No matching place. Enter its full name or a nearby bus stop.")}</p> : null}
    {result.choices.map(place => <button type="button" key={place.id} disabled={busy} onClick={() => {
      const draft = structuredClone(result.draft);
      if (result.field === "origin") { draft.originId = place.id; draft.originQuery = place.name; }
      else if (result.field === "end") { draft.endId = place.id; draft.endQuery = place.name; }
      else draft.stops[result.field] = { ...draft.stops[result.field], query: place.name, placeId: place.id };
      onContinue(draft);
    }}>{place.name}</button>)}
    <form className="trip-form" onSubmit={event => {
      event.preventDefault();
      const query = String(new FormData(event.currentTarget).get("place") ?? "").trim();
      const draft = structuredClone(result.draft);
      if (result.field === "origin") { draft.originQuery = query; delete draft.originId; }
      else if (result.field === "end") { draft.endQuery = query; delete draft.endId; }
      else draft.stops[result.field] = { ...draft.stops[result.field], query, placeId: undefined };
      onContinue(draft);
    }}><label>{label("重新輸入地點", "重新输入地点", "Enter a different place")}<input name="place" required maxLength={150} /></label><button className="primary-action" disabled={busy}>{label("確認地點", "确认地点", "Confirm place")}</button></form>
  </section>;

  const option = result.options[selected] ?? result.options[0];
  const show = (chosen: ItineraryOption, sectionIndex: number, journeyIndex = 0) => {
    const section = chosen.sections[sectionIndex];
    const journey = section?.journeys[journeyIndex];
    if (!journey) return;
    onSelect(itineraryDraft(result, chosen));
    onJourney({ journey, origin: section.from.coordinates, destination: section.to.coordinates,
      destinationName: section.to.name, networkFetchedAt: result.networkFetchedAt, walkingMappedAt: result.walkingMappedAt,
      itineraryStops: chosen.stops, sectionLabel: `${sectionIndex + 1}/${chosen.sections.length} · ${section.from.name} → ${section.to.name}` });
  };
  const totalStay = option.stops.reduce((sum, s) => sum + s.stayMinutes, 0);
  return <section className="panel-section itinerary-results" aria-label={label("完整行程", "完整行程", "Complete itineraries")}>
    <h2>{result.draft.mode === "day" ? label("揀一個一日遊方案", "选一个一日游方案", "Choose a day trip") : label("你嘅多站行程", "你的多站行程", "Your ordered journey")}</h2>
    {result.draft.date ? <p className="quiet-copy">{result.draft.date} · {result.draft.startTime}–{result.draft.endTime} · {label("澳門時間", "澳门时间", "Macau time")}</p> : null}
    {result.draft.mode === "day" ? <p className="quiet-copy">{label("到訪時段係建議，交通耗時未核實；唔係預計到達時間。", "到访时段为建议，交通耗时未核实，并非预计到达时间。", "Visit times are planning targets. Transport durations are unverified; these are not predicted arrivals.")}</p> : null}
    {result.options.length > 1 ? <div className="trip-alternatives">{result.options.map((item, index) => <button type="button" key={item.id} className="assistant-option" aria-pressed={index === selected} onClick={() => { setSelected(index); setEditing(false); onSelect(itineraryDraft(result, item)); onClearMap(); }}>
      <strong>{index + 1}. {item.title}</strong><span>{item.reason}</span><small>{item.stops.filter(s => s.visit).map(s => s.name).join(" → ")}</small>
    </button>)}</div> : <p>{option.reason}</p>}
    <div className="trip-actions">
      <button type="button" className="primary-action" onClick={() => { const index = option.sections.findIndex(s => s.journeys.length); if (index >= 0) show(option, index); }} disabled={!option.sections.some(s => s.journeys.length)}>{label("查看行程地圖", "查看行程地图", "View itinerary map")}</button>
      <button type="button" className="text-action" onClick={() => { setEditStops(itineraryDraft(result, option).stops); setEditing(!editing); }}>{label("修改地點及停留時間", "修改地点和停留时间", "Edit places and stays")}</button>
    </div>
    {editing ? <form className="trip-form trip-editor" onSubmit={event => { event.preventDefault(); onContinue({ ...itineraryDraft(result, option), stops: editStops }); }}>
      <p className="quiet-copy">{label("修改後會依照清單次序重算交通；一日遊亦會重新核對到訪時段。", "修改后按清单顺序重算交通，一日游也会重新核对到访时段。", "Edits recalculate connections in list order and recheck day-trip visit windows.")}</p>
      {editStops.map((stop, index) => <div className="trip-edit-stop" key={index}>
        <label>{label("目的地", "目的地", "Destination")} {index + 1}<input value={stop.query} maxLength={150} required onChange={event => setEditStops(editStops.map((s, i) => i === index ? { ...s, query: event.target.value, placeId: undefined } : s))} /></label>
        <label>{label("停留分鐘", "停留分钟", "Stay (minutes)")}<input type="number" min={0} max={240} value={stop.stayMinutes ?? 0} onChange={event => setEditStops(editStops.map((s, i) => i === index ? { ...s, stayMinutes: Number(event.target.value) } : s))} /></label>
        <div className="trip-actions"><button type="button" disabled={index === 0} onClick={() => { const next = [...editStops]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setEditStops(next); }}>{label("上移", "上移", "Move up")}</button><button type="button" disabled={editStops.length <= 1} onClick={() => setEditStops(editStops.filter((_, i) => i !== index))}>{label("移除", "移除", "Remove")}</button></div>
      </div>)}
      <button type="button" className="text-action" disabled={editStops.length >= 8} onClick={() => setEditStops([...editStops, { query: "", stayMinutes: 0 }])}>{label("加入地點", "加入地点", "Add a place")}</button>
      <button className="primary-action" disabled={busy}>{label("更新行程", "更新行程", "Update itinerary")}</button>
    </form> : null}
    <ol className="itinerary-stops">{option.stops.map((stop, index) => <li key={`${index}:${stop.id}`}>
      <div className="itinerary-stop-heading"><span className="trip-stop-number">{index === 0 ? label("起", "起", "S") : index}</span><h3>{stop.name}</h3></div>
      {stop.targetTime ? <p>{label("建議到訪", "建议到访", "Target visit")} {stop.targetTime}</p> : null}
      {stop.stayMinutes > 0 ? <p>{label("建議停留", "建议停留", "Suggested stay")} {stop.stayMinutes} {label("分鐘", "分钟", "minutes")}</p> : null}
      {stop.sourceUrl ? <p className="quiet-copy"><a href={stop.sourceUrl} target="_blank" rel="noreferrer">{label("官方參觀資料", "官方参观资料", "Official visitor information")}</a> · {stop.hours} · {label("核對", "核对", "Checked")} {stop.checkedAt}</p> : null}
      {option.sections[index] ? <div className="itinerary-connection">
        <p className="eyebrow">{label("前往下一站", "前往下一站", "Continue to the next stop")}</p>
        {option.sections[index].journeys.map((journey, journeyIndex) => <button type="button" className="trip-connection-option" key={journey.id} onClick={() => show(option, index, journeyIndex)}>
          <strong>{journey.legs.length ? journey.legs.map(l => `${l.routeName} → ${l.to.stationName}`).join(" · ") : label("全程步行", "全程步行", "Walk")}</strong>
          <span>{label("步行／接駁距離", "步行／接驳距离", "Walking / access distance")} {Math.round(journey.accessMeters + journey.egressMeters + journey.transferMeters)} m{journey.legs.length ? ` · ${journey.totalStops} ${label("個站", "个站", "stops")}` : ""}</span>
          <span>{label("查看呢段交通及地圖", "查看这段交通和地图", "View this connection and map")}</span>
        </button>)}
        {!option.sections[index].journeys.length ? <p className="data-warning" role="status">{option.sections[index].warnings.at(-1)}</p> : <details><summary>{label("接駁資料說明", "接驳资料说明", "Connection notes")}</summary>{option.sections[index].warnings.map(w => <p className="quiet-copy" key={w}>{w}</p>)}</details>}
      </div> : null}
    </li>)}</ol>
    {totalStay > 0 ? <p className="quiet-copy">{label("停留合計", "停留合计", "Total stays")} {totalStay} {label("分鐘", "分钟", "minutes")}{result.draft.startTime && result.draft.endTime ? ` · ${label("其餘時間供交通、用餐及休息", "其余时间用于交通、用餐和休息", "Remaining for travel, meals and breaks")}: ${Math.max(0, timeMinutes(result.draft.endTime) - timeMinutes(result.draft.startTime) - totalStay)} ${label("分鐘", "分钟", "minutes")}` : ""}</p> : null}
    {result.warnings.map(w => <p className="quiet-copy" key={w}>{w}</p>)}
    <p className="quiet-copy">{label("路線資料", "路线资料", "Route data")} {result.networkFetchedAt.slice(0, 10)} · {label("步行資料", "步行资料", "Walking data")} {result.walkingMappedAt.slice(0, 10)}</p>
  </section>;
}
