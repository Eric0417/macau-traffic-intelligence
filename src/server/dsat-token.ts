import "server-only";
import { createHash } from "node:crypto";

interface MacauDateTimeParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

export function macauDateTimeParts(date = new Date()): MacauDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Macau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

export function createDsatToken(params: Record<string, string | number>, date = new Date()): string {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = createHash("md5").update(query).digest("hex").split("");
  const { year, month, day, hour, minute } = macauDateTimeParts(date);

  digest.splice(24, 0, hour + minute);
  digest.splice(12, 0, month + day);
  digest.splice(4, 0, year);

  return digest.join("");
}
