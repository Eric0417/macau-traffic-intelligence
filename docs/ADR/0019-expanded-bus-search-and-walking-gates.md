# Bus connections and pedestrian gates

Accepted 2026-11-15.

The reported Pui Ching to Panda Pavilion query produced only a 12,211 m walk. Bus topology contained usable routes, but the importer blocked even gates tagged `locked=no`. The resulting 1,762 m path from C655 exceeded the 1 km pedestrian limit and removed the bus options before model selection.

Allow explicitly unlocked, operable gates on otherwise permitted ways. Keep locked gates, unspecified gates, walls, private access, conditional access and pedestrian prohibitions blocked. Rebuild the same dated OSM extract; do not change its observation date or add guessed links. A source-specific cache version prevents Redis from retaining the previous graph across deployment, without invalidating unrelated sources or changing their TTLs.

Search all endpoint platforms within 1 km, retaining the 1 km mapped-path limit at each end. Extend the shared bus search to four rides (three same-platform transfers). Use bounded rounds over published forward stop order. Rank by reviewed hours, then a comparison score of ridden stop edges plus one point per 100 m of endpoint walking plus six points per transfer. These are ranking weights, not travel-time estimates. Keep a direct alternative among the six returned combinations. Do not connect neighbouring transfer platforms without a verified path.

Long journeys can include a separate taxi suggestion. It has no invented driving geometry, fare, duration, availability or booking. It does not masquerade as a bus or walking candidate. An opened bus journey checks all four possible legs independently.
