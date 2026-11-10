"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, Star } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { residentCopy } from "@/lib/resident-copy";
import {
  distanceMeters,
  filterParking,
  type Coordinates,
  type ParkingKind,
} from "@/lib/resident-tools";
import type { ParkingFacility } from "@/lib/types";
import type { Favorite } from "./use-resident-preferences";

export function ParkingPanel({
  facilities,
  selectedId,
  onSelect,
  kind,
  onKindChange,
  location,
  onLocate,
  locating,
  onMap,
  isSaved,
  onSave,
}: {
  facilities: ParkingFacility[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  kind: ParkingKind;
  onKindChange: (kind: ParkingKind) => void;
  location: Coordinates | null;
  onLocate: () => void;
  locating: boolean;
  onMap: () => void;
  isSaved: (favorite: Favorite) => boolean;
  onSave: (favorite: Favorite) => void;
}) {
  const { t, locale } = useLanguage();
  const c = residentCopy[locale];
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"spaces" | "distance">("spaces");
  const filtered = useMemo(
    () => filterParking(facilities ?? [], query, kind, sort, location),
    [facilities, query, kind, sort, location],
  );
  const types: Array<[ParkingKind, string]> = [
    ["lightVehicle", t("lightVehicle")],
    ["motorcycle", t("motorcycle")],
    ["electricVehicle", t("electricVehicle")],
    ["electricMotorcycle", c.electricMotorcycle],
    ["accessible", t("accessible")],
    ["heavyVehicleShort", c.heavyShort],
    ["heavyVehicleLong", c.heavyLong],
  ];
  const selected = facilities?.find((item) => item.id === selectedId);

  return (
    <div className="panel-stack parking-workspace">
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("parking")}</h2>
          <span className="count-label">
            {filtered.length} {c.results}
          </span>
        </div>
        <label className="search-field has-search-icon">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">{t("parkingSearch")}</span>
          <input
            type="search"
            placeholder={t("parkingSearch")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-row">
          <label>
            {c.vehicleType}
            <select
              aria-label={c.vehicleType}
              value={kind}
              onChange={(event) =>
                onKindChange(event.target.value as ParkingKind)
              }
            >
              {types.map(([value, name]) => (
                <option value={value} key={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {c.sortBy}
            <select
              aria-label={c.sortBy}
              value={sort}
              onChange={(event) => {
                const next = event.target.value as "spaces" | "distance";
                setSort(next);
                if (next === "distance" && !location) onLocate();
              }}
            >
              <option value="spaces">{c.spacesSort}</option>
              <option value="distance">{c.distanceSort}</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          className="text-action"
          onClick={onLocate}
          disabled={locating}
        >
          <MapPin size={16} />
          {locating ? c.locating : c.locate}
        </button>
        <p className="quiet-copy">{c.locationNote}</p>
        {selected ? (
          <div
            className="parking-detail"
            aria-label={selected.name}
            tabIndex={-1}
          >
            <div className="section-heading">
              <h3>{selected.name}</h3>
              <button
                type="button"
                className="save-button"
                aria-label={
                  isSaved({ kind: "parking", id: selected.id })
                    ? c.unsave
                    : c.save
                }
                aria-pressed={isSaved({ kind: "parking", id: selected.id })}
                onClick={() => onSave({ kind: "parking", id: selected.id })}
              >
                <Star size={18} />
              </button>
            </div>
            <dl className="parking-breakdown">
              {types.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{selected.availability[key] ?? "–"}</dd>
                </div>
              ))}
            </dl>
            <p className="quiet-copy">
              {c.publisherTime}{" "}
              {selected.updatedAt
                ? new Date(selected.updatedAt).toLocaleString(
                    locale === "en" ? "en-GB" : "zh-MO",
                    { timeZone: "Asia/Macau" },
                  )
                : c.unknownTime}
            </p>
            {selected.coordinates ? (
              <button type="button" className="primary-action" onClick={onMap}>
                <MapPin size={16} />
                {c.map}
              </button>
            ) : (
              <p className="quiet-copy">{t("noLocation")}</p>
            )}
          </div>
        ) : null}
        <div className="parking-list">
          {filtered.map((facility) => {
            const count = facility.availability[kind];
            const meters =
              location && facility.coordinates
                ? distanceMeters(location, facility.coordinates)
                : null;
            return (
              <button
                type="button"
                className={`parking-row ${selectedId === facility.id ? "is-active" : ""}`}
                key={facility.id}
                data-parking-id={facility.id}
                aria-pressed={selectedId === facility.id}
                onClick={() => onSelect(facility.id)}
              >
                <div>
                  <strong>{facility.name}</strong>
                  <span>
                    {meters !== null
                      ? `${c.straightLine} ${meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`}`
                      : facility.coordinates
                        ? types.find(([key]) => key === kind)?.[1]
                        : t("noLocation")}
                  </span>
                </div>
                <div
                  className={`parking-count tone-${count === null ? "unknown" : count <= 5 ? "low" : count <= 20 ? "medium" : "good"}`}
                >
                  <strong>{count ?? "–"}</strong>
                  <span>{count === null ? t("unknown") : c.remaining}</span>
                </div>
              </button>
            );
          })}
        </div>
        {facilities && !filtered.length ? (
          <p className="empty-state" role="status">
            {c.noResults}
          </p>
        ) : null}
      </section>
    </div>
  );
}
