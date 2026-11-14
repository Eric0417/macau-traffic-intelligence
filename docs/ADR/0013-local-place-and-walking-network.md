# Local place search and walking routes

Accepted 2026-11-11.

Build a dated place index and directed pedestrian graph from the Geofabrik Macau OpenStreetMap extract. Keep this ODbL data separate from official bus topology. Publish the normalized snapshot through the existing server-only source and cache path. The browser searches names and computes walking routes locally, so a search does not transmit an address or precise location. Refresh the snapshot explicitly with the build script.

Join edges only at shared OSM nodes. Exclude mapped private or prohibited access, conditional access and roads without a supported pedestrian classification. Respect pedestrian direction and avoid snapping arbitrary endpoints to bridges, tunnels and indoor ways. Use mapped public entrances for named polygons when available, otherwise a mapped place coordinate. Connect endpoints to nearby eligible edges and distinguish those approximate short links from the mapped path.

Keep published bus stop order and same-platform transfers. For place searches, consider nearby bus stops only when the pedestrian graph connects the necessary access and egress legs. Offer a full walking route independently of bus availability. Walking lengths are estimates from the dated map. Bus availability, current closures and accessibility are outside the snapshot.
