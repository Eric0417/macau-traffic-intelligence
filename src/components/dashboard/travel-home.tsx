"use client";

import { useState } from "react";

import {
  ArrowUpRight,
  BusFront,
  CircleParking,
  MapPin,
  Star,
  Sparkles,
  Send,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { residentCopy } from "@/lib/resident-copy";
import {
  distanceMeters,
  filterParking,
  type Coordinates,
} from "@/lib/resident-tools";
import type {
  BusRoute,
  ParkingFacility,
  ResponseMeta,
  WeatherSnapshot,
} from "@/lib/types";
import { favoriteId, type Favorite } from "./use-resident-preferences";
import { SourceNote } from "./panels";

export function TravelHome({
  favorites,
  routes,
  parking,
  weather,
  weatherMeta,
  parkingMeta,
  location,
  onLocate,
  locating,
  onOpen,
  onBus,
  onParking,
  onLrt,
  onAsk,
  onOverview,
}: {
  favorites: Favorite[];
  routes: BusRoute[] | null;
  parking: ParkingFacility[] | null;
  weather: WeatherSnapshot | null;
  location: Coordinates | null;
  onLocate: () => void;
  locating: boolean;
  onOpen: (favorite: Favorite) => void;
  onBus: () => void;
  onParking: () => void;
  onLrt: () => void;
  onAsk: (question: string) => void;
  onOverview: () => void;
  weatherMeta: ResponseMeta | null;
  parkingMeta: ResponseMeta | null;
}) {
  const { t, locale } = useLanguage();
  const c = residentCopy[locale];
  const [question, setQuestion] = useState("");
  const nearby = location
    ? filterParking(parking ?? [], "", "lightVehicle", "distance", location)
        .filter((item) => item.coordinates)
        .slice(0, 4)
    : [];
  return (
    <div className="travel-home panel-stack">
      <section className="travel-heading">
        <div className="eyebrow">
          {new Date().toLocaleDateString(locale === "en" ? "en-GB" : "zh-MO", {
            timeZone: "Asia/Macau",
            month: "short",
            day: "numeric",
            weekday: "short",
          })}
        </div>
        <h2>{c.today}</h2>
        <p>{c.intro}</p>
      </section>
      <div className="travel-shortcuts">
        <button type="button" onClick={onBus} className="mode-tile mode-bus">
          <span className="mode-model" aria-hidden="true" />
          <span>{c.startBus}</span>
          <ArrowUpRight size={16} />
        </button>
        <button type="button" onClick={onLrt} className="mode-tile mode-lrt">
          <span className="mode-model" aria-hidden="true" />
          <span>{t("lrt")}</span>
          <ArrowUpRight size={16} />
        </button>
        <button
          type="button"
          onClick={onParking}
          className="mode-tile mode-parking"
        >
          <span className="parking-object" aria-hidden="true">
            P
          </span>
          <span>{c.startParking}</span>
          <ArrowUpRight size={16} />
        </button>
      </div>
      <section className="home-ai">
        <div className="home-ai-title">
          <span className="ai-glyph">
            <Sparkles size={21} />
          </span>
          <div>
            <h2>{t("assistant")}</h2>
            <p>{c.aiPrompt}</p>
          </div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim()) onAsk(question.trim());
          }}
        >
          <label className="sr-only" htmlFor="home-question">
            {t("assistantPlaceholder")}
          </label>
          <input
            id="home-question"
            type="text"
            maxLength={500}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={c.aiExample}
          />
          <button
            type="submit"
            aria-label={t("assistantSend")}
            disabled={!question.trim()}
          >
            <Send size={18} />
          </button>
        </form>
        <div className="home-ai-examples">
          {[t("assistantQ1"), t("assistantQ2")].map((item) => (
            <button type="button" key={item} onClick={() => onAsk(item)}>
              {item}
              <ArrowUpRight size={13} />
            </button>
          ))}
        </div>
        <p className="home-ai-note">{c.aiEvidence}</p>
      </section>
      <section className="panel-section">
        <div className="section-heading">
          <h2>{c.saved}</h2>
          <Star size={17} />
        </div>
        {!favorites.length ? (
          <div className="saved-empty">
            <p>{c.savedEmpty}</p>
            <span>{c.localOnly}</span>
          </div>
        ) : (
          <div className="saved-list">
            {favorites.map((favorite) => {
              const route =
                favorite.kind === "bus"
                  ? routes?.find(
                      (item) => item.routeCode === favorite.routeCode,
                    )
                  : null;
              const park =
                favorite.kind === "parking"
                  ? parking?.find((item) => item.id === favorite.id)
                  : null;
              return (
                <button
                  type="button"
                  key={favoriteId(favorite)}
                  onClick={() => onOpen(favorite)}
                >
                  {favorite.kind === "bus" ? (
                    <BusFront size={19} />
                  ) : (
                    <CircleParking size={19} />
                  )}
                  <span>
                    <strong>
                      {favorite.kind === "bus"
                        ? `${route?.routeName ?? favorite.routeCode} · ${favorite.stopName ?? t("route")}`
                        : (park?.name ?? favorite.id)}
                    </strong>
                    <small>
                      {favorite.kind === "bus"
                        ? favorite.direction === 0
                          ? t("outbound")
                          : t("return")
                        : t("lightVehicle")}
                    </small>
                  </span>
                  <b>
                    {favorite.kind === "parking" ? (
                      (park?.availability.lightVehicle ?? "–")
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </b>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <section className="panel-section">
        <div className="section-heading">
          <h2>{c.nearbyParking}</h2>
          <MapPin size={17} />
        </div>
        <SourceNote meta={parkingMeta} />
        <button
          type="button"
          className="text-action"
          onClick={onLocate}
          disabled={locating}
        >
          {locating ? c.locating : c.locate}
        </button>
        <p className="quiet-copy">{c.locationNote}</p>
        {nearby.map((park) => (
          <button
            type="button"
            className="nearby-row"
            onClick={() => onOpen({ kind: "parking", id: park.id })}
            key={park.id}
          >
            <span>
              {park.name}
              <small>
                {c.straightLine}{" "}
                {Math.round(distanceMeters(location!, park.coordinates!))} m
              </small>
            </span>
            <strong>
              {park.availability.lightVehicle ?? "–"}
              <small>{c.remaining}</small>
            </strong>
          </button>
        ))}
      </section>
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("weather")}</h2>
          <span>
            {weather?.temperatureCelsius != null
              ? `${weather.temperatureCelsius}°C`
              : "–"}
          </span>
        </div>
        <SourceNote meta={weatherMeta} />
        {weather ? (
          <>
            <div className="weather-summary">
              {weather.warnings
                .filter((item) => item.active)
                .map((item) => (
                  <p className="data-warning" key={item.type}>
                    {item.text}
                  </p>
                ))}
              <p>{weather.forecast ?? t("unavailable")}</p>
            </div>
            <button className="text-action" type="button" onClick={onOverview}>
              {c.forecast}
              <ArrowUpRight size={16} />
            </button>
          </>
        ) : (
          <p className="quiet-copy">{c.weatherEmpty}</p>
        )}
      </section>
    </div>
  );
}
