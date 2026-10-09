import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBusEta, loadBusRoutes } from "@/server/sources/bus";

const routeResponse = {
  header: "000",
  data: {
    companyList: [
      { color: "Blue", name: "新福利" },
      { color: "Orange", name: "澳巴" },
    ],
    routeList: [
      { color: "Orange", routeChange: "1", direction: "0", routeName: "3" },
      { color: "Blue", routeChange: "0", direction: "0", routeName: "1A" },
    ],
  },
};

const routePage = `
  <a href="route_display.aspx?route=busroute_3" class="bus_link">
    <div style="background-image: url('./images/bc2.png')">
      <div class="bus_route_text">3</div>
    </div>
  </a>
  <a href="route_display.aspx?route=busroute_3AS" class="bus_link">
    <div style="background-image: url('./images/bc2.png')">
      <div class="bus_route_text">3AS</div>
    </div>
  </a>
  <a href="route_display.aspx?route=busroute_17S1" class="bus_link">
    <div style="background-image: url('./images/bc1.png')">
      <div class="bus_route_text">17S1</div>
    </div>
  </a>
`;

const etaResponse = {
  header: { status: "000" },
  data: {
    data: [
      {
        msg: "0",
        average: 28,
        current: 30,
        stationCode: "M1/9",
        stationName: "關閘總站",
      },
      {
        msg: "0",
        average: 11,
        current: "x",
        stationCode: "M7/1",
        stationName: "關閘馬路",
      },
      {
        msg: "0",
        average: 4,
        current: 9,
        stationCode: "M16/1",
        stationName: "提督馬路/雅廉訪",
      },
    ],
  },
};

const stationResponse = {
  header: "000",
  data: {
    stationInfoList: [
      {
        latitude: "22.215502",
        longitude: "113.54918",
        stationCode: "M1/9",
        stationName: "關閘總站",
        laneName: "D 車道",
      },
      {
        latitude: "22.212759",
        longitude: "113.54862",
        stationCode: "M7/1",
        stationName: "關閘馬路",
        laneName: "",
      },
      {
        latitude: "22.206627",
        longitude: "113.54549",
        stationCode: "M16/1",
        stationName: "提督馬路/雅廉訪",
        laneName: "",
      },
    ],
  },
};

const routeBusResponse = {
  header: "000",
  data: {
    routeInfo: [
      { staCode: "M1/9", busInfo: [] },
      { staCode: "M7/1", busInfo: [] },
      {
        staCode: "M16/1",
        busInfo: [
          {
            busCode: "E5054",
            busPlate: "AD2767",
            busType: "1",
            status: "1",
            isFacilities: "1",
            speed: "18",
          },
        ],
      },
    ],
  },
};

const routeTrafficResponse = {
  // Segment i runs from stop i to stop i + 1; the trailing single point is ignored.
  data: [
    {
      routeCoordinates: "113.54918,22.215502;113.54862,22.212759",
      newRouteTraffic: "1",
    },
    {
      routeCoordinates: "113.54862,22.212759;113.54549,22.206627",
      newRouteTraffic: "3",
    },
    { routeCoordinates: "113.54549,22.206627", newRouteTraffic: "-1" },
  ],
};

const diversionResponse = {
  header: "000",
  data: { routeChange: true, suspendBusStop: ["M7/1$00003002"] },
};

function stubBusFetch(
  overrides: {
    routeBusResponse?: typeof routeBusResponse;
  } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url.includes("getRouteAndCompanyList.html")) return Response.json(routeResponse);
      if (url.includes("bus_route.aspx")) return new Response(routePage, { status: 200 });
      if (url.includes("/ddbus/app/passenger/route")) return Response.json(etaResponse);
      if (url.includes("routestation/location")) return Response.json(stationResponse);
      if (url.includes("routestation/bus")) {
        return Response.json(overrides.routeBusResponse ?? routeBusResponse);
      }
      if (url.includes("supermap/route/traffic")) return Response.json(routeTrafficResponse);
      if (url.includes("getRouteChangeMessage.html")) return Response.json(diversionResponse);

      throw new Error(`Unexpected request ${url}`);
    }),
  );
}

beforeEach(() => {
  globalThis.__macauTrafficCacheBackend = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bus sources", () => {
  it("merges seasonal routes that the arrival system omits", async () => {
    stubBusFetch();

    const routes = await loadBusRoutes();
    const byName = new Map(routes.map((route) => [route.routeName, route]));

    expect(routes.map((route) => route.routeName)).toEqual(["1A", "3", "3AS", "17S1"]);
    expect(byName.get("3")).toMatchObject({
      routeCode: "00003",
      routeType: 0,
      hasChange: true,
      live: true,
    });
    expect(byName.get("1A")?.routeCode).toBe("0001A");
    expect(byName.get("3AS")).toMatchObject({ company: { color: "orange" }, live: false });
    expect(byName.get("17S1")).toMatchObject({
      routeCode: "017S1",
      company: { color: "blue" },
      live: false,
    });
  });

  it("keeps the tracked catalog when the published route page fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("getRouteAndCompanyList.html")) return Response.json(routeResponse);
        return new Response("blocked", { status: 503 });
      }),
    );

    const routes = await loadBusRoutes();

    expect(routes.map((route) => route.routeName)).toEqual(["1A", "3"]);
  });

  it("normalizes ETA values and adds station coordinates", async () => {
    stubBusFetch();

    const eta = await loadBusEta("00003", 0);

    expect(eta.routeName).toBe("3");
    expect(eta.stops).toEqual([
      expect.objectContaining({
        stationCode: "M1/9",
        etaMinutes: 30,
        coordinates: [113.54918, 22.215502],
        trafficStatus: "normal",
        trafficLevel: 1,
      }),
      expect.objectContaining({
        stationCode: "M7/1",
        etaMinutes: 0,
        coordinates: [113.54862, 22.212759],
        trafficStatus: "normal",
        trafficLevel: 1,
        suspended: true,
      }),
      expect.objectContaining({
        stationCode: "M16/1",
        etaMinutes: 9,
        coordinates: [113.54549, 22.206627],
        trafficStatus: "congested",
        trafficLevel: 3,
        suspended: false,
      }),
    ]);
    expect(eta.diversion.suspendedStops).toEqual([
      { stationCode: "M7/1", stationName: "關閘馬路" },
    ]);
  });

  it("keeps the official route polyline per traffic segment", async () => {
    stubBusFetch();

    const eta = await loadBusEta("00003", 0);

    expect(eta.routeSegments).toEqual([
      {
        fromStationCode: "M1/9",
        toStationCode: "M7/1",
        trafficStatus: "normal",
        trafficLevel: 1,
        coordinates: [
          [113.54918, 22.215502],
          [113.54862, 22.212759],
        ],
      },
      {
        fromStationCode: "M7/1",
        toStationCode: "M16/1",
        trafficStatus: "congested",
        trafficLevel: 3,
        coordinates: [
          [113.54862, 22.212759],
          [113.54549, 22.206627],
        ],
      },
    ]);
  });

  it("reports live buses on the segment before their next stop", async () => {
    stubBusFetch();

    const eta = await loadBusEta("00003", 0);

    expect(eta.vehicles).toEqual([
      {
        id: "E5054",
        plate: "AD2767",
        busType: "1",
        lowFloor: true,
        speedKph: 18,
        status: "1",
        stationCode: "M16/1",
        stationName: "提督馬路/雅廉訪",
        stationSequence: 2,
        segmentIndex: 1,
        coordinates: [
          expect.closeTo(113.5469298, 7),
          expect.closeTo(22.20944772, 7),
        ],
        bearing: expect.closeTo(
          207.0414504734597,
          5,
        ),
        estimated: true,
      },
    ]);
  });

  it("aligns feeds by stationCode when an ETA stop is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        if (url.includes("getRouteAndCompanyList.html")) return Response.json(routeResponse);
        if (url.includes("bus_route.aspx")) return new Response(routePage, { status: 200 });
        if (url.includes("/ddbus/app/passenger/route")) {
          return Response.json({
            header: { status: "000" },
            data: {
              data: [
                {
                  msg: "0",
                  average: 28,
                  current: 30,
                  stationCode: "M1/9",
                  stationName: "關閘總站",
                },
                {
                  msg: "0",
                  average: 4,
                  current: 9,
                  stationCode: "M16/1",
                  stationName: "提督馬路/雅廉訪",
                },
              ],
            },
          });
        }
        if (url.includes("routestation/location")) return Response.json(stationResponse);
        if (url.includes("routestation/bus")) {
          return Response.json({
            header: "000",
            data: {
              routeInfo: [
                {
                  staCode: "M16/1",
                  busInfo: [
                    {
                      busCode: "E5054",
                      busPlate: "AD2767",
                      busType: "1",
                      status: "1",
                      isFacilities: "1",
                      speed: "18",
                    },
                  ],
                },
              ],
            },
          });
        }
        if (url.includes("supermap/route/traffic")) {
          return Response.json({
            data: [
              {
                routeCoordinates: "113.54918,22.215502;113.54862,22.212759",
                newRouteTraffic: "1",
              },
              {
                routeCoordinates: "113.54862,22.212759",
                newRouteTraffic: "-1",
              },
              {
                routeCoordinates: "113.54862,22.212759;113.54549,22.206627",
                newRouteTraffic: "3",
              },
            ],
          });
        }
        if (url.includes("getRouteChangeMessage.html")) return Response.json(diversionResponse);

        throw new Error(`Unexpected request ${url}`);
      }),
    );

    const eta = await loadBusEta("00003", 0);

    expect(eta.stops.map((stop) => stop.stationCode)).toEqual([
      "M1/9",
      "M7/1",
      "M16/1",
    ]);
    expect(eta.routeSegments).toEqual([
      {
        fromStationCode: "M1/9",
        toStationCode: "M7/1",
        trafficStatus: "normal",
        trafficLevel: 1,
        coordinates: [
          [113.54918, 22.215502],
          [113.54862, 22.212759],
        ],
      },
      {
        fromStationCode: "M7/1",
        toStationCode: "M16/1",
        trafficStatus: "congested",
        trafficLevel: 3,
        coordinates: [
          [113.54862, 22.212759],
          [113.54549, 22.206627],
        ],
      },
    ]);
    expect(eta.vehicles[0]).toMatchObject({
      stationCode: "M16/1",
      stationName: "提督馬路/雅廉訪",
      stationSequence: 2,
    });
  });

  it("separates buses approaching the same stop", async () => {
    stubBusFetch({
      routeBusResponse: {
        header: "000",
        data: {
          routeInfo: [
            {
              staCode: "M16/1",
              busInfo: [
                {
                  busCode: "E5054",
                  busPlate: "AD2767",
                  busType: "1",
                  status: "1",
                  isFacilities: "1",
                  speed: "18",
                },
                {
                  busCode: "E5055",
                  busPlate: "AD2768",
                  busType: "1",
                  status: "1",
                  isFacilities: "0",
                  speed: "10",
                },
              ],
            },
          ],
        },
      },
    });

    const eta = await loadBusEta("00003", 0);

    expect(eta.vehicles).toHaveLength(2);
    expect(eta.vehicles[0].coordinates).not.toEqual(eta.vehicles[1].coordinates);
  });
});
