# Assistant facility search verification

Date: 2026-11-16

## Reproduction

On the previous public site, submitting “我想要最近嘅醫院” gave a destination choice list that included 醫院後街 and bus stops C701 and C702. It did not ask for the location needed to determine which hospital was closest. The old classifier could emit a general facility noun as the destination name, and the name search returned unrelated objects.

The new classifier has a facility action. The server ranks map-tagged places, and a directions request uses the selected facility in the existing route graph. The location continuation preserves the category and action. Fixed browser flows include granted and denied location, a named landmark, a multi-result list with route selection, opening-hours uncertainty and emergency contact.

## Dataset check

The dated Geofabrik import still has 7,816 places, 52,983 walking nodes and 57,125 directed-edge records. The regenerated locations and graph match the existing snapshot, apart from the additional facility category field. The same-name 醫院後街, hospital car parks and the 協和醫院 rail stop do not match the hospital category. The OSM record for the Union Hospital complex is tagged separately.

## Acceptance checks

Typecheck, lint, the production build and 247 unit tests passed. The Python importer suite passed four tests. In Playwright, 41 tests passed across desktop Chromium, mobile Chromium and mobile WebKit. The desktop-only guidance test and unsupported WebKit geolocation-permission simulation were skipped in those projects. The mobile tests verify the map opens first and the rider can return to the route options. API and basemap requests were mocked for these browser regressions.

The configured DeepSeek model correctly handled 32 new and existing request scenarios (31 distinct questions) and the original question's location continuation. These were deliberate local live checks, using public landmarks and a synthetic position near Pui Ching. The test checks the intended action separately from the resulting routes and distances. See [all question cases](local-model-cases.json).

| Question | Verified behaviour |
| --- | --- |
| 我想要最近嘅醫院 | Requested an origin, then picked 鏡湖醫院 for the synthetic location and opened validated directions. Straight-line distance was 631 m, and the mapped walk was 751 m. |
| 呢頭邊間醫院最近啊 | Returned one nearby hospital from the supplied location without asking for its name. |
| 我喺議事亭前地，附近有邊幾間醫院？ | Used the named landmark and listed hospitals by distance. |
| 有没有离关闸广场近一点的卫生中心？ | Used 關閘廣場, with no choice between street fragments. |
| Where's the closest hospital to Senado Square? | Returned one hospital in lookup mode from the named landmark. |
| 我而家喺石排灣輕軌站，搭巴士去最近嗰間醫院 | Used the named station, chose the mapped Union Hospital complex and returned real bus candidates. |
| 我喺塔石廣場，想行去最近嗰個公廁 | Used a mapped path to the tagged public toilet. |
| 依家仲開緊嘅藥房有冇 | Preserved the opening-hours condition and returned locations with an unverified status. |
| nearest ER from Senado Square | Kept emergency-department service unverified. |
| 幫我叫白車 | Returned the Macau emergency contact action with no route search. |
| 我去山頂醫院有咩巴士 | Resolved the named hospital alias, then requested the starting point. |
| 想去媽閣廟，跟住去大三巴 | Kept the ordered itinerary flow. |

The initial model run exposed an inconsistent distinction between wanting directions and looking up a place, and a Cantonese opening-hours phrase that lost its condition. The revised prompt makes this distinction explicit, and the server preserves explicit service and opening-hours qualifiers after classification. There is no assumption that every model paraphrase will resolve correctly or that the facilities are currently open.

## Public-site checks

The facility search shipped to Render as `8837192` in deployment `dep-dbstsek9v7es73cb2acg`. Seven real API requests verified the original request and continuation, a named English reference point, a Simplified Chinese clinic request, Cantonese opening-hours and bus questions, and the emergency action. The original continuation returned the 751 m mapped walk and a bus alternative. One routing probe took about 35 seconds. See [production results](production-evidence.json).

The follow-up scroll regression first failed in mobile WebKit because the first directions button was entirely below the viewport. The UI now scrolls and focuses the results. All 14 applicable facility browser tests passed on the final build, with the same WebKit permission simulation skipped.

Final Render deployment `dep-dbstuotckfvc73e1iq00` is live at `826afc2`. Health reported `ok` with Redis. The live desktop Chromium test submitted the original question from the home page, provided synthetic device coordinates only on continuation, and showed the selected hospital and walking directions. The mobile WebKit test named 塔石廣場 and showed a clinic list without using geolocation. Its first directions button was fully inside the visible results panel. Neither test recorded document overflow or page errors. See [browser observations](browser-evidence.json) and the desktop and phone captures in this folder.
