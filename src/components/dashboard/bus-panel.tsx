"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, BusFront, MapPin, Search, Star } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { residentCopy } from "@/lib/resident-copy";
import { stopKey, stopStatus } from "@/lib/resident-tools";
import type { BusEta, BusRoute } from "@/lib/types";
import type { LiveJsonResult } from "@/components/use-live-json";
import type { Favorite } from "./use-resident-preferences";
import { SourceNote } from "./panels";

export function BusPanel({
  routes,
  selected,
  direction,
  eta,
  selectedStopKey,
  onSelectStop,
  onSelect,
  onDirectionChange,
  onBack,
  onMap,
  isSaved,
  onSave,
}: {
  routes: BusRoute[] | null;
  selected: BusRoute | null;
  direction: 0 | 1;
  eta: LiveJsonResult<BusEta>;
  selectedStopKey: string | null;
  onSelectStop: (key: string) => void;
  onSelect: (route: BusRoute) => void;
  onDirectionChange: (direction: 0 | 1) => void;
  onBack: () => void;
  onMap: () => void;
  isSaved: (favorite: Favorite) => boolean;
  onSave: (favorite: Favorite) => void;
}) {
  const { locale, t } = useLanguage();
  const c = residentCopy[locale];
  const [query, setQuery] = useState("");
  const [stopQuery, setStopQuery] = useState("");
  const filtered = useMemo(
    () =>
      (routes ?? []).filter((route) =>
        route.routeName.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [routes, query],
  );
  const stop = eta.data?.stops.find(
    (item) => stopKey(item) === selectedStopKey,
  );
  const favorite: Favorite | null = selected
    ? {
        kind: "bus",
        routeCode: selected.routeCode,
        direction,
        ...(stop ? { stopKey: stopKey(stop), stopName: stop.stationName } : {}),
      }
    : null;
  const stops = (eta.data?.stops ?? []).filter(
    (item) =>
      item.stationName.toLowerCase().includes(stopQuery.trim().toLowerCase()) ||
      item.stationCode.toLowerCase().includes(stopQuery.trim().toLowerCase()),
  );
  const status = stop ? stopStatus(stop) : null;

  if (!selected)
    return (
      <div className="panel-stack bus-catalog">
        <section className="panel-section route-catalog">
          <div className="section-heading">
            <h2>{c.allRoutes}</h2>
            <span className="count-label">{filtered.length}</span>
          </div>
          <label className="search-field has-search-icon">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">{c.routeSearch}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={c.routeSearch}
            />
          </label>
          <div className="route-grid">
            {filtered.map((route) => (
              <button
                type="button"
                key={route.routeCode}
                data-route-code={route.routeCode}
                style={
                  { "--route-color": route.company.color } as CSSProperties
                }
                onClick={() => onSelect(route)}
              >
                <strong>{route.routeName}</strong>
                <small>{route.company.name}</small>
                {!route.live ? (
                  <span className="route-flag">{t("seasonal")}</span>
                ) : null}
              </button>
            ))}
          </div>
          {routes && !filtered.length ? (
            <p role="status" className="empty-state">
              {c.noResults}
            </p>
          ) : null}
        </section>
      </div>
    );

  return (
    <div
      className="panel-stack bus-workspace"
      style={{ "--route-color": selected.company.color } as CSSProperties}
    >
      <section className="panel-section bus-route-header" tabIndex={-1}>
        <button type="button" className="text-action" onClick={onBack}>
          <ArrowLeft size={17} />
          {c.allRoutes}
        </button>
        <div className="route-detail-head">
          <span className="route-badge">{selected.routeName}</span>
          <div className="bus-heading">
            <small>{selected.company.name}</small>
            <h2>
              {eta.data?.stops.length
                ? `${c.towards} ${eta.data.stops.at(-1)?.stationName}`
                : t("route")}
            </h2>
          </div>
          {favorite ? (
            <button
              type="button"
              className="save-button"
              aria-label={isSaved(favorite) ? c.unsave : c.save}
              aria-pressed={isSaved(favorite)}
              onClick={() => onSave(favorite)}
            >
              <Star size={18} />
            </button>
          ) : null}
        </div>
        <div className="segmented" aria-label={t("direction")}>
          {([0, 1] as const)
            .filter((value) => selected.routeType !== 2 || value === 0)
            .map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={direction === value}
                className={direction === value ? "is-active" : ""}
                onClick={() => {
                  setStopQuery("");
                  onDirectionChange(value);
                }}
              >
                {value === 0 ? t("outbound") : t("return")}
              </button>
            ))}
        </div>
        {!stop ? <SourceNote meta={eta.meta} /> : null}
        {!selected.live ? (
          <p className="quiet-copy">{t("noLiveData")}</p>
        ) : null}
        {eta.loading ? (
          <p className="loading-state" role="status">
            {t("loading")}
          </p>
        ) : null}
        {eta.error ? (
          <div className="data-warning" role="status">
            {t("unavailable")}
            <button className="text-action" type="button" onClick={eta.refresh}>
              {t("retry")}
            </button>
          </div>
        ) : null}
        {eta.data?.diversion.suspendedStops.length ? (
          <div className="data-warning">
            <strong>{t("suspendedStops")}</strong>
            <p>
              {eta.data.diversion.suspendedStops
                .map((item) => item.stationName)
                .join("、")}
            </p>
          </div>
        ) : null}
      </section>

      {stop ? (
        <section
          className={`waiting-card ${stop.suspended ? "is-suspended" : ""}`}
          aria-label={c.selectedStop}
          tabIndex={-1}
        >
          <div className="eyebrow">{c.selectedStop}</div>
          <h2>{stop.stationName}</h2>
          <div className="waiting-number">
            {status === "suspended" ? (
              t("suspended")
            ) : status === "due" ? (
              t("dueAtStop")
            ) : status === "waiting" ? (
              <>
                {stop.stopsAway}
                <small>{t("stopsShort")}</small>
              </>
            ) : (
              c.noBus
            )}
          </div>
          <SourceNote meta={eta.meta} />
          {eta.error ? <p role="status">{c.delayed}</p> : null}
          <p>{stop.suspended ? c.suspensionNote : c.nextBus}</p>
          <button className="primary-action" type="button" onClick={onMap}>
            <MapPin size={17} />
            {c.map}
          </button>
        </section>
      ) : null}

      {eta.data ? (
        <section className="panel-section stop-section">
          <div className="section-heading">
            <h2>{c.chooseStop}</h2>
            <span>
              {eta.data.stops.length} {t("stops")}
            </span>
          </div>
          <label className="search-field has-search-icon">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">{c.stopSearch}</span>
            <input
              type="search"
              placeholder={c.stopSearch}
              value={stopQuery}
              onChange={(event) => setStopQuery(event.target.value)}
            />
          </label>
          <ol className="stop-list">
            {stops.map((item) => {
              const itemStatus = stopStatus(item);
              return (
                <li key={stopKey(item)}>
                  <button
                    type="button"
                    className={`stop-row ${item.suspended ? "is-suspended" : ""}`}
                    aria-pressed={stopKey(item) === selectedStopKey}
                    data-stop-key={stopKey(item)}
                    onClick={() => onSelectStop(stopKey(item))}
                  >
                    <span
                      className={`stop-sequence tone-${item.trafficStatus}`}
                    >
                      {item.sequence + 1}
                    </span>
                    <span className="stop-name">
                      {item.stationName}
                      <small>{item.stationCode}</small>
                    </span>
                    <span className="stop-wait">
                      {itemStatus === "suspended"
                        ? t("suspended")
                        : itemStatus === "due"
                          ? t("dueAtStop")
                          : itemStatus === "waiting"
                            ? `${item.stopsAway} ${t("stopsShort")}`
                            : "–"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {!stops.length ? (
            <p role="status" className="empty-state">
              {c.noResults}
            </p>
          ) : null}
          <p className="quiet-copy">{t("stopsAwayNote")}</p>
        </section>
      ) : null}

      {eta.data ? (
        <details className="panel-section vehicle-details">
          <summary>
            <BusFront size={17} />
            {c.vehicleDetails} ({eta.data.vehicles.length})
          </summary>
          <div className="vehicle-list">
            {eta.data.vehicles.map((vehicle) => (
              <article className="vehicle-row" key={vehicle.id}>
                <strong>{vehicle.plate}</strong>
                <span>
                  {t("approaching")} {vehicle.stationName}
                </span>
                <div>
                  {vehicle.lowFloor ? (
                    <em className="vehicle-tag">{t("lowFloor")}</em>
                  ) : null}
                  {vehicle.speedKph !== null ? (
                    <em>{vehicle.speedKph} km/h</em>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          <p className="quiet-copy">{t("positionNote")}</p>
          <p className="quiet-copy">{c.modelsNote}</p>
        </details>
      ) : null}
    </div>
  );
}
