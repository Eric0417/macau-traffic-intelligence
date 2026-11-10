// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JourneyPlanner } from "@/components/dashboard/journey-planner";
import { useLiveJson } from "@/components/use-live-json";
import type { BusNetwork } from "@/lib/bus-journey";

vi.mock("@/components/use-live-json", () => ({ useLiveJson: vi.fn() }));
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({ locale: "zh-Hant", t: (key: string) => key }) }));
vi.mock("@/components/dashboard/panels", () => ({ SourceNote: () => null }));

const network: BusNetwork = {
  fetchedAt: "2026-11-10T10:00:00.000Z", coverage: { catalogRoutes: 1, loadedRoutes: 1, missingRoutes: [] },
  routes: [{ routeName: "3", routeCode: "00003", direction: 0, circular: false, company: { id: "orange", name: "澳巴", color: "orange" }, stops: [
    { stationCode: "A", stationName: "出發站", coordinates: [113.54, 22.19] },
    { stationCode: "B", stationName: "終點站", coordinates: [113.56, 22.19] },
  ] }],
};
const props = { enabled: true, location: [113.5401, 22.19] as [number, number], locating: false, locationError: false, onLocate: vi.fn(), onInspect: vi.fn(), liveRouteCodes: new Set(["00003"]) };
function source(data = network) {
  vi.mocked(useLiveJson).mockReturnValue({ data, loading: false, error: null, meta: null, refresh: vi.fn() });
}
function choose(label: string, value: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: label }), { target: { value } });
  const button = within(screen.getByRole("list", { name: label })).getByRole("button");
  button.focus();
  fireEvent.click(button);
}
afterEach(cleanup);

describe("journey result context", () => {
  it("returns keyboard focus to the input after choosing a suggestion", () => {
    source(); render(<JourneyPlanner {...props} />);
    choose("起點", "A");
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "起點" }));
    expect(screen.queryByRole("list", { name: "起點" })).toBeNull();
  });

  it("hides an old location plan when location changes elsewhere in the workspace", () => {
    source(); const { rerender } = render(<JourneyPlanner {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "使用目前位置" }));
    choose("終點", "B");
    fireEvent.click(screen.getByRole("button", { name: "尋找巴士方案" }));
    expect(screen.getByText("直達")).toBeTruthy();
    rerender(<JourneyPlanner {...props} location={[113.60, 22.19]} />);
    expect(screen.queryByText("直達")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "尋找巴士方案" }));
    expect(screen.getByText(/未找到符合條件/)).toBeTruthy();
  });

  it("does not show an old stop order under a newer network retrieval date", () => {
    source(); const { rerender } = render(<JourneyPlanner {...props} />);
    choose("起點", "A"); choose("終點", "B");
    fireEvent.click(screen.getByRole("button", { name: "尋找巴士方案" }));
    expect(screen.getByText("直達")).toBeTruthy();
    source({ ...network, fetchedAt: "2026-11-11T10:00:00.000Z", routes: [{ ...network.routes[0], stops: [...network.routes[0].stops].reverse() }] });
    rerender(<JourneyPlanner {...props} />);
    expect(screen.queryByText("直達")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "尋找巴士方案" }));
    expect(screen.getByText(/未找到符合條件/)).toBeTruthy();
  });
});
