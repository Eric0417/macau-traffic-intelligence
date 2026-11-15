"use client";

import { useState } from "react";

import {
  ArrowRight,
  ArrowUpRight,
  BusFront,
  ChevronDown,
  CircleParking,
  LocateFixed,
  Star,
  Thermometer,
  TramFront,
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
import { VoiceInput } from "./voice-input";

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
  voiceView,
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
  voiceView?: "list" | "map";
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
      <section className="home-ai" aria-labelledby="travel-title">
        <div className="travel-heading">
          <h2 id="travel-title">{c.today}</h2>
          {weather?.temperatureCelsius != null ? (
            <span className="travel-temperature">
              <Thermometer size={16} aria-hidden="true" />
              {weather.temperatureCelsius}°C
            </span>
          ) : null}
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
            placeholder={c.homeSearch}
          />
          {voiceView ? <VoiceInput key={voiceView} onTranscript={text => setQuestion(value => [value.trimEnd(), text].filter(Boolean).join(" ").slice(0, 500))} /> : null}
          <button
            type="submit"
            aria-label={t("assistantSend")}
            title={t("assistantSend")}
            disabled={!question.trim()}
          >
            <ArrowRight size={22} aria-hidden="true" />
          </button>
        </form>
        <details className="home-ai-help">
          <summary>{c.questionExamples}<ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="home-ai-examples">
            {[locale === "en" ? "I want to go to Senado Square" : locale === "zh-Hans" ? "我想去议事亭前地" : "我想去議事亭前地", t("assistantQ1")].map((item) => (
              <button type="button" key={item} onClick={() => onAsk(item)}>
                {item}
                <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
          <p className="home-ai-note">{c.aiEvidence}</p>
        </details>
      </section>
      <div className="travel-shortcuts">
        <button type="button" onClick={onBus} className="mode-tile mode-bus">
          <span className="mode-label">{c.startBus}</span>
          <span className="mode-preview" aria-hidden="true" />
          <ArrowUpRight size={20} aria-hidden="true" />
        </button>
        <button type="button" onClick={onLrt} className="mode-tile mode-lrt">
          <TramFront size={21} aria-hidden="true" />
          <span className="mode-label">{t("lrt")}</span>
        </button>
        <button
          type="button"
          onClick={onParking}
          className="mode-tile mode-parking"
        >
          <CircleParking size={21} aria-hidden="true" />
          <span className="mode-label">{c.startParking}</span>
        </button>
      </div>
      <section className="panel-section home-nearby">
        <div className="section-heading">
          <h2>{c.nearbyParking}</h2>
          <button
            type="button"
            className="nearby-locate"
            onClick={onLocate}
            disabled={locating}
          >
            <LocateFixed size={15} aria-hidden="true" />
            {locating ? c.locating : c.locate}
          </button>
        </div>
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
        <SourceNote meta={parkingMeta} />
      </section>
      {favorites.length ? <section className="panel-section home-saved">
        <div className="section-heading">
          <h2>{c.saved}</h2>
          <Star size={17} />
        </div>
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
      </section> : null}

      <section className="panel-section home-weather">
        <div className="section-heading">
          <h2>{t("weather")}</h2>
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
