import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { afterEach, expect, it, vi } from "vitest";
import { dsatDispatcherFor, dsatIntermediate } from "@/server/sources/dsat-tls";
import { fetchText } from "@/server/http";
import { officialNewsSource } from "@/server/sources/official-news";
import { noticesSource } from "@/server/sources/notices";

afterEach(() => vi.unstubAllGlobals());

it("bundles a valid intermediate signed by a Node trusted root", () => {
  const certificate = new X509Certificate(dsatIntermediate);
  expect(certificate.ca).toBe(true);
  expect(rootCertificates.some((pem) => certificate.verify(new X509Certificate(pem).publicKey))).toBe(true);
  expect(Date.parse(certificate.validTo)).toBeGreaterThan(Date.now());
});

it("restricts the supplemental chain to the exact DSAT HTTPS origin", () => {
  expect(dsatDispatcherFor("https://www.dsat.gov.mo/tc/news_rss.aspx")).toBeDefined();
  for (const url of ["http://www.dsat.gov.mo/", "https://www.dsat.gov.mo:444/", "https://bis.dsat.gov.mo/", "https://www.dsat.gov.mo.evil.example/"]) {
    expect(dsatDispatcherFor(url)).toBeUndefined();
  }
});

it("passes the source transport through fetch without disabling verification", async () => {
  const fetch = vi.fn(async () => new Response("news"));
  vi.stubGlobal("fetch", fetch);
  await expect(fetchText("https://www.dsat.gov.mo/tc/news_rss.aspx")).resolves.toBe("news");
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ dispatcher: dsatDispatcherFor("https://www.dsat.gov.mo"), cache: "no-store", redirect: "error" }));
});

it("checks announcements every minute and retains marked stale fallback", () => {
  expect(officialNewsSource.ttlSeconds).toBe(60);
  expect(noticesSource.ttlSeconds).toBe(60);
  expect(noticesSource.staleTtlSeconds).toBeGreaterThan(60);
});
