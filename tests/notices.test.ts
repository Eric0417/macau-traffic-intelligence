import { describe, expect, it } from "vitest";
import {
  parseBusCroadHtml,
  parseCroadHtml,
  parseEmergencyHtml,
} from "@/server/sources/notices";

const emergencyHtml = `
<div class="my_news_list">
  <a href="emergency_detail.aspx?a_id=300900">
    <div class="news_date"><span>09-10-2026</span></div>
    <div class="news_content"><span style="font-weight:bold">交通事故</span>
      <!-- <p>近友誼大馬路發生交通意外，部分行車線封閉。</p> -->
    </div>
  </a>
</div>
<div class="my_news_list">
  <a href="emergency_detail.aspx?a_id=300901">
    <div class="news_date"><span>08-10-2026</span></div>
    <div class="news_content"><span style="font-weight:bold">維修保養工作</span>
      <!-- <p>氹仔柯維納馬路有限度通車。</p> -->
    </div>
  </a>
</div>
`;

const busCroadHtml = `
<div class="my_news_list">
  <a href="bus_croad_detail.aspx?a_id=AAA">
    <div class="news_date"><p>09-10-2026</p></div>
    <div class="news_content">
      <p style="font-weight:bold">煙花活動臨時交管</p>
      <p>路氹連貫公路一帶短暫封閉，多條路線調整。</p>
    </div>
  </a>
</div>
<div class="my_news_list">
  <a href="bus_croad_detail.aspx?a_id=BBB">
    <div class="news_date"><p>06-10-2026</p></div>
    <div class="news_content">
      <p style="font-weight:bold">緊急維修電纜的臨時交通安排</p>
      <p>高美士街實施臨時交通管制。</p>
    </div>
  </a>
</div>
`;

const croadHtml = `
<div class="my_news_list">
  <a href="croad_detail.aspx?id=265643">
    <div class="news_content"><p>2025-04-09 - 2027-07-15, 東北大馬路,有限度通車</p></div>
  </a>
</div>
`;

describe("notice parsers", () => {
  it("reads the hidden emergency summary and flags incidents", () => {
    const notices = parseEmergencyHtml(emergencyHtml, "https://www.dsat.gov.mo/dsat/emergency.aspx");

    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({
      title: "交通事故",
      content: "近友誼大馬路發生交通意外，部分行車線封閉。",
      category: "incident",
      publishedAt: new Date("2026-10-09T00:00:00+08:00").toISOString(),
    });
    expect(notices[1]).toMatchObject({
      title: "維修保養工作",
      category: "roadworks",
    });
  });

  it("classifies urgent bus arrangements separately from planned changes", () => {
    const notices = parseBusCroadHtml(busCroadHtml, "https://www.dsat.gov.mo/dsat/bus_croad.aspx");

    expect(notices[0]).toMatchObject({
      title: "煙花活動臨時交管",
      content: "路氹連貫公路一帶短暫封閉，多條路線調整。",
      category: "bus-change",
    });
    expect(notices[1]).toMatchObject({
      title: "緊急維修電纜的臨時交通安排",
      category: "incident",
    });
  });

  it("reads the scheduled roadwork window", () => {
    const notices = parseCroadHtml(croadHtml, "https://www.dsat.gov.mo/dsat/croad.aspx");

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      title: "2025-04-09 - 2027-07-15, 東北大馬路,有限度通車",
      category: "roadworks",
      publishedAt: new Date("2025-04-09T00:00:00+08:00").toISOString(),
    });
  });
});
