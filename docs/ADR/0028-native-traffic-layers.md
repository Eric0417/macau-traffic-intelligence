# Native traffic layers

Date: 2026-11-16

Explore can show DSAT road statuses or the traffic layer drawn by Apple MapKit. Apple lists Macao under Maps: Traffic. MapKit controls coverage, colours, incidents and refresh timing for its own layer. The app does not copy its data into the DSAT feed or use it for trip estimates. DSAT remains the initial selection and retains its own legend and retrieval time.

For DSAT, the client makes one follow-up read three seconds after seeing a stale cache snapshot. After a fresh response, it schedules its next read around the server's cache expiry. Repeated stale responses or errors return to the normal polling interval. The shared server cache, source TTL and upstream endpoints stay the same.

Apple documentation: [Macao traffic availability](https://www.apple.com/ios/feature-availability/#maps-traffic) and [MapKit traffic property](https://developer.apple.com/documentation/mapkit/mkstandardmapconfiguration/showstraffic).
