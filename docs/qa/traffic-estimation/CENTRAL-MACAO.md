# Traffic coverage near Senado Square

16 November 2026. The sample covers a 650 m radius around 22.1935° N, 113.5398° E. It is a spot check of central Macao.

## Coverage check

The normalized DSAT road snapshot retrieved at 11:06:01 had 1,268 segments, including 170 with unknown status. The same 170 IDs were unknown in the earlier saved 10:01 snapshot. Within the sample area, 107 feed segments with midpoints inside the radius had at least 5 m of geometry. One, on 東望洋街, was explicitly unknown. Other streets can have no feed segment at all.

For comparison, we clipped public motor-road candidates from the [dated Geofabrik Macau extract](https://download.geofabrik.de/asia/china/macau-261114.osm.pbf) to the sample radius. Candidates were primary, secondary, tertiary, unclassified, residential, living streets and the three corresponding connector classes. The access filter excluded explicit restrictions from the most specific available motorcar, motor vehicle, vehicle or general access tag. This filter is a road inventory approximation. It does not validate direction, turn rules or legal motor access on every way.

| Road group | Mapped length | Within 12 m of a known DSAT segment | Additional length within 12 m of a bus traffic report |
| --- | ---: | ---: | ---: |
| All candidates | 31.75 km | 7.70 km (24.2%) | 4.16 km |
| Residential, unclassified and living streets | 17.69 km | 0.54 km (3.1%) | 0.75 km |

Lengths use a local latitude/longitude projection scaled at 103,100 m per longitude degree and 111,320 m per latitude degree. Coverage is length intersecting the 12 m buffer around eligible lines, with the bus contribution measured outside the DSAT buffer. Nearby crossings and parallel roads can inflate the result. These are proximity figures for OSM ways, with divided carriageways counted by mapped length. The extract hash is `ee7e269fbd51241a1d56fcbc314c4ce26a8d458e17d266a6744533ff58b45b20`.

## Can bus reports fill the gaps?

The existing ETA endpoint returned fresh observations for 3A, 5, 9, 11, 6A, 16, 18 inbound and 19 from 11:06:35 to 11:06:38. We kept the bus segments whose midpoints lie in the study area. Of 66 segments, 56 had a reported traffic category. We sampled the road geometries at intervals of at most 5 m and matched a candidate bus segment if it passed within 12 m of at least 85% of the samples.

Of the 88 known road segments with a candidate bus match, reports agreed with the road category on 32. Candidate bus reports disagreed with one another on 27 and gave a unanimous different category on 29. Differences can come from timing, direction, geometry or the aggregation of a whole stop-to-stop segment. The one explicitly unknown road segment overlapped only 24% of its matching route 9 segment, so the route's category could describe another part of the trip.

Kim and Wang's [Macao bus dataset](https://www.nature.com/articles/s41597-025-05660-y) also describes stop-to-stop congestion categories and bus travel times. It covers five historical routes. DSAT's [2024 travel survey](https://www.dsat.gov.mo/dsat/news_detail.aspx?a_id=352144CD66AF9E0F6B38EDDD3C070F0A) describes residents' travel behaviour. Neither supplies current street-level vehicle counts.

A congestion model could use several days of direction-specific travel times and road measurements, with held-out streets and periods to score false clear readings. Estimating vehicles per hour requires traffic counts at representative sites to calibrate it. This single comparison supports keeping missing street statuses unknown. No forecast layer is published.

## Follow-up using DSAT's own forecast

The [DSAT Traffic Situation map](https://bis.dsat.gov.mo/macauTraffic/?lang=zh_tw) supplies road geometry separately from its current and forecast categories. A deliberate read on 16 November returned 2,390 road section IDs with coordinates. The current category was known for 1,646 and the 30-minute forecast for 2,293. The publisher uses different segment boundaries from the original live-road layer. In the same 650 m study area, 271 forecast segments had a reported category, compared with 114 in the earlier live-road snapshot. This count includes any segment with a vertex inside the circle.

Using the same OSM inventory and 12 m proximity rule, 40.0% of the mapped road length in the study area was near a known forecast, versus 24.2% near the earlier live layer. For local roads the comparison was 6.4% versus 3.1%. Neither figure measures forecast accuracy. Build 11 adds the publisher forecast as a separate dashed map layer and leaves missing road sections uncoloured.
