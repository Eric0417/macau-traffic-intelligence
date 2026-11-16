# Changelog

## Macao Move conversation and traffic outlook - 2026-11-16

- Keep up to six recent exchanges in the native assistant. Resolve references and route revisions against that context and run the original verification rules on each turn.
- Stream short text replies while they are generated. Keep verified route cards, improve heading hierarchy and list indentation, and allow practical answers to broader travel questions.
- Add a separate dashed layer for DSAT's 30-minute road forecast. Clear aged predictions and preserve the current traffic layers.

## Macao Move bus route display - 2026-11-16

- Start bus maps with a single blue route style. The along-route traffic view recolours those same segments, with dashed gray for unknown or delayed statuses.
- Remove the duplicate show-traffic switch from the Explore legend. The map button controls visibility and the legend controls the source.
- Audit data gaps near Senado Square against mapped roads and eight bus routes. The sample did not support publishing street-level congestion or vehicle counts from nearby bus reports.

## Macao Move stop summary and traffic layers - 2026-11-16

- Show the arrival estimate and one approaching bus in stop details. Tap its reported segment to open a map with a bus pin. The full stop diagram stays on the route page.
- Remove the native 3D bus model and its assets. Map perspective controls remain available.
- Add an Apple Maps traffic option in Explore. Retry a stale DSAT snapshot once after three seconds and schedule regular reads around cache expiry.
- Scroll the recording waveform at the display cadence using timestamped microphone levels.

## Macao Move bus diagrams and readable replies - 2026-11-16

- Place bus markers between stops in the arrival list and selected-stop detail. Preserve circular last-to-first segments and distinguish a matched position from an approaching-stop report.
- Move the bus model onto its reported map coordinate. Tap a bus to focus it; orient its nose along the matched road and adjust the camera with map rotation and tilt. Keep other vehicles as selectable pins.
- Render assistant Markdown as headings, short paragraphs and lists, without literal stars or decorative star prefixes. Keep route explanations in the existing disclosures.
- Add haptic feedback and an explicit four-colour legend to the home traffic information control. Fix the assistant origin-location button's white-on-white label in dark mode.
- Record an offline road-inference study and masked-label experiment. Whole-street testing missed all covered congested cases, so unknown streets retain their unknown status.

## Macao Move home, assistant and bus detail corrections - 2026-11-16

- Remove the home title gradient that produced a black edge below the status bar. Use a smaller glass destination control with a complete tap area.
- Keep the keyboard closed when entering Assistant. Replace elapsed waiting time with one pulsing dot; retain cancellation and a static Reduce Motion alternative.
- Mark the closest unsuspended stop on the current route only when a recent GPS fix, including its accuracy radius, places it within 50 m. Stop location requests when the detail is hidden or the app is inactive.
- Add reviewed terminal operating hours for 90 routes, preserving day restrictions, split service and fixed departures. Keep unavailable hours explicit and link official timetables.
- Align vehicle rows, describe the reported route segment or approaching stop without claiming exact GPS, and move the map and illustrative bus model below the stop and vehicle lists.

## Macao Move interaction fixes and redesign - 2026-11-16

- Name the native app Macao Move. Rework the home map, assistant, route cards and city view with larger focal elements, fewer visible explanations, monochrome actions and native navigation gestures.
- Preserve the map camera when switching 2D/3D, support repeated location recentering, and batch the complete road overlay by color. Keep traffic delay notices current during stalled refreshes.
- Apply assistant and manual plans to the home map, fit the selected route independently of traffic, and open details in a draggable sheet. Reset live route state on every application and omit current bus estimates for future journeys.
- Show real microphone levels, an enabled white send button and cancellable waiting. Deliver checked route candidates before AI comparison finishes, retain explicit incomplete/error states and abort cancelled model requests.
- Shorten AI explanations, preserve stable route identity while ranking changes, and clear previous itinerary context when a single journey replaces it. Add regression coverage for map controls, complete traffic geometry, gestures, cancellation and streaming responses.
- Reuse numeric route ordering, index nearby pedestrian edges and skip an unchanged search after empty suspension checks. Keep the same paths and snap limits. Record aggregate search-stage durations without questions, coordinates or route records.
- Avoid allocating intermediate bus labels already beaten by an existing state, while preserving complete alternatives and tie ordering. Verify full outputs against the prior implementation across 1,600 generated queries and four real day/night searches.

## Native iOS application - 2026-11-16

- Add an iOS 26 SwiftUI client for buses, local journey planning, AI and voice input, multi-stop itineraries, parking, LRT and city information, using the existing backend.
- Redesign navigation with native gestures, sheets, Liquid Glass controls, neutral buttons and a compact assistant. Move source and estimate explanations behind disclosure controls while retaining visible failure and delay notices.
- Use MapKit and AVKit, add a monochrome route icon, support three languages, dark appearance and Dynamic Type, and save route directions and stop occurrences on the device.
- Add native contract, planner and interaction tests, a deliberate production probe, and build instructions in `ios/README.md`. Record installation and verification evidence in `docs/qa/native-ios/VERIFICATION.md`.

## Find nearby facilities in the AI assistant - 2026-11-16

- Understand whether a question asks for a nearby type of place, a specific destination or directions. Find hospitals, clinics, pharmacies and toilets by category.
- Use device location or a named landmark to select the nearest mapped facility and open available bus and walking directions. Move the nearby results into view when they load. Show opening hours and services as unverified when requested.

## Bus route cards - 2026-11-16

- Give route cards a responsive minimum width so codes such as 701X and 701XS fit on one line. Use lighter route numbers and muted operator labels in both themes.

## Voice input and bus trip search - 2026-11-15

- Record short questions from the home screen and AI Assistant. DeepSeek transcribes the recording into the editable draft. The user can review it before asking.
- Open the assistant to plan a bus trip from the bus catalogue. Find the manual stop-to-stop planner under the assistant’s manual stop choice.

## Figma Make colours and typography - 2026-11-15

- Use Inter for Latin text and Noto Sans TC for Chinese. Use lighter headings, white and graphite surfaces, and blue selection states.
- Give the destination field a white surface and circular submit button. Use a faint grid behind the bus preview.
- Use neutral streets and blue-grey water in both map themes. The bus-focused label rules and 3D models remain available.

## Stable bus estimates and forward map movement - 2026-11-15

- Keep the nearest bus selected when its time is uncertain. Show stationary or updating status, and label a changed bus instead of silently replacing a one-minute arrival with a later service.
- Filter speed and arrival timestamps, retain matched route progress when coordinates expire, and require position clearance before confirming passage of a stop.
- Stop reverse marker animation and coasting beyond a frozen target. Preserve source indices when empty route segments are omitted. Add recorded route 56 sequence tests and desktop/phone status checks.

## System bus arrival and position estimates - 2026-11-15

- Add labelled arrival minutes from route distance, speed and segment congestion. Correct vehicles paired to the previous segment when their feed coordinate has already moved past the reported stop.
- Advance estimated map positions for at most 15 seconds, capped at the next stop. Frozen data, stopped buses and missing inputs do not trigger indefinite movement or invented departure times.
- Show predictions in bus stop details and the first boarding step; expose labelled current estimates to the AI assistant. Keep stop counts when a prediction is unavailable. The model has not been calibrated against observed arrivals.


All notable user-visible and architectural changes are recorded here.

## Bus map focus and workspace controls - 2026-11-15

- Hide basemap labels and icons while a bus route is selected. Show the selected stop name or the route termini, and show vehicle plates at street zoom. Restore the basemap symbols when leaving the route.
- Start selected bus routes in 3D. Load the existing operator bus and stop sign models at street zoom. Keep the 2D switch and flat markers for wide views and model failures.
- Reduce the home screen to its destination field, example disclosure and service controls. Move desktop navigation to the bottom of the side panel. Use the original bus render on the main shortcut and enlarge route numbers.

## Bus access, transfers and taxi alternatives - 2026-11-15

- Fix the Panda Pavilion walking graph: explicitly unlocked gates on permitted paths remain connected. The park bus stop now has a mapped 430 m connection to the pavilion, so bus routes are no longer removed by a false detour.
- Search endpoint stops within 1 km and up to three same-platform transfers. Balance walking, ridden stops and transfers, and check all four possible bus legs independently in the map and guidance.
- Show a separate taxi alternative for long trips without inventing driving paths, fares, travel times or vehicle availability. Empty bus searches state their limits.
- Version the walking snapshot cache so deployment loads the corrected graph immediately.

## Map workspace redesign - 2026-11-15

- Fill the desktop workspace with the interactive map. Move the five primary sections to a vertical toolbar, place the query and result panel beside it, and group layers, 3D, zoom and compass on the right.
- Give the phone home screen a direct list/map switch and place return and map controls on the map itself. Keep the four bottom tabs and restore keyboard focus when switching views.
- Use a light vector-style basemap by day and a deep navy palette at night. Style journey origins with a blue navigation arrow and halo, destinations with red pins, and night routes with a soft outline. Preserve the traffic status colours and map data sources.

## Assistant transport and nearby answers - 2026-11-15

- Treat destination bus questions such as “石排灣有咩巴士去？” as journeys. Preserve a direct bus candidate and search again after excluding suspended stops, so a truncated candidate list does not leave only walking.
- Let the model recommend the complete multi-stop journey, with boarding, transfer and alighting steps visible and other connections collapsed. Check later ordered connections against the departure period plus stays; travel durations remain unknown.
- Generate the complete itinerary overview from the selected route records so its bus/walking labels always match the displayed steps.
- Answer nearby parking and bus-stop questions using device location or a typed landmark, with distances and dated source evidence. Keep zero, unknown and delayed parking counts distinct. Coach-only loading areas are excluded from ordinary parking suggestions, and their generic car icon is no longer interpreted as private-car spaces.

## Desktop navigation layout - 2026-11-14

- Keep all five tabs inside the centered navigation bar on narrow desktop windows.

## Simple phone navigation and larger controls - 2026-11-14

- Prioritize AI trip input and bus lookup on the phone home screen. Use four mobile navigation items: Travel, Bus, AI Assistant and More. LRT, parking and other services move into More; appearance and language sit inside its expandable settings.
- Use a full-width 48px question button, softer day/night surfaces and neutral secondary/disabled controls. Keep entered home questions while visiting settings, retain keyboard navigation across visible tabs and respect reduced motion. Desktop retains its five primary tabs and header settings.

## Phone layout and Safari card sizing - 2026-11-14

- Keep cards and the homepage question field inside the phone width in WebKit. Grid content can shrink, and the send button keeps its own 44px column.
- Use smaller card padding, separate rows for suggested questions and a stacked assistant form on phones. Compact transport shortcuts and readable date/time fields fit narrow screens without losing their controls.
- Keep localized date punctuation differences between Node and WebKit from rebuilding the page during hydration. Add WebKit coverage for card bounds, all five primary tabs, three languages and day-trip fields at 320, 390 and 430px.

## Compact map guidance and place-name understanding - 2026-11-14

- Keep idle assistant guidance to a 76px strip. Desktop route guidance uses at most 34% of the map area, capped at 280px, and collapses to 48px without losing the selected route. The map resizes with the guide.
- Ask the existing language model to interpret unresolved place names, including typos and Cantonese transcription errors. Batch unresolved names across an itinerary, then match its proposed names against the actual place/stop catalogue. Ambiguous matches remain choices; unknown places are not fabricated. Already-resolved aliases and selected place IDs avoid another model call.

## Ordered journeys and cultural day trips - 2026-11-14

- Use the assistant for one destination, ordered destinations or a themed day trip. Multi-stop journeys retain the requested order and return visits, with separate transport choices and map guidance for each connection.
- Ask for date, start/end time, endpoints and preferences before generating day trips. Compare complete alternatives drawn from seven reviewed cultural places, with official visitor links, opening rules and editable suggested stays. Visit targets are not predicted arrival times.
- Keep place choices and manual-location recovery across the whole itinerary. Edit, remove, add or reorder destinations and recalculate connections. Failed connections remain visible without dropping destinations.
- Update Next.js and its ESLint configuration to 16.4.6 and Zod to 4.6.6 after the pre-release dependency audit.

## Stable journey vehicle status - 2026-11-13

- Keep vehicle details and map markers visible through normal background cache refreshes. The status no longer alternates between available and unavailable every two seconds, and expanded vehicle lists stay open. Read errors and data older than the existing freshness window still show unavailable status.

## Model journey plans and announcement layout - 2026-11-13

- Send natural-language destinations to the model, resolve place choices, obtain current location automatically and ask the model to compare verified journey candidates. Validate its JSON before rendering multiple options linked to the map and step guidance. Manual origin entry handles denied or unavailable location; invalid model responses stay visible failures.
- Disclose that AI journey requests send current location and destination to the configured provider. Manual bus planning and nearby parking still calculate in the browser.
- Keep announcement cards inside the list column and wrap long publisher URLs so headings, text and source buttons are not clipped beside the map.

## Guided journeys and announcement refresh - 2026-11-13

- Connect common natural-language destination requests to the local journey planner. Resolve unique places, request missing endpoints and show walking/boarding/transfer guidance beside the map. Traffic answers appear as a current brief instead of a growing chat thread, with practical next actions and Macau-local publication dates. Unrelated questions no longer wait on cold LRT network reads.
- Rearrange desktop navigation horizontally and put trip input first, with white/navy surfaces, orange controls and compact transport rows. Mobile keeps separate list/map views and a scrollable guidance area below the map.
- Restore DSAT news and arrangement reads by completing the source's TLS chain without disabling verification. Check announcements about every minute, expose refresh, parse attributed RSS descriptions correctly and sort arrangements by publication date.

## Travel cards and leave-now journeys - 2026-11-12

- Always plan bus journeys from the current Macau time. Removed the departure-time picker; searching again checks service hours against the new search time.
- Redesigned the workspace with a desktop navigation rail, separate rounded content cards, a wide bus entry, smaller LRT/parking entries and a separate map. Added teal controls and coordinated day/night colours.
- Preserved mobile list/map switching, bottom navigation and scoped card transitions. The desktop navigation rail also accepts Up/Down keys.

## Bus heading and time-aware journeys - 2026-11-11

- Align 3D buses using the route under their front and rear axles so short bends do not turn the entire model sideways.
- Draw verified transfer legs independently, with both colours visible on overlapping roads. Show each leg's latest official vehicle estimates when available.
- Filter known service hours by the selected Macau departure time. Reviewed hours cover all six night routes and five other routes.

## Bus stop selection crash - 2026-11-11

- Show the waiting card immediately when a stop is selected. Skipping the stop-list transition snapshot prevents the reproduced Chrome renderer crash and preserves focus and map selection.

## Place search and walking journeys - 2026-11-11

- Search for a Macau place, street or bus stop in either journey field. Named places automatically use reachable nearby platforms for direct and one-transfer bus options.
- Compare a full walking route with bus options and view mapped walking segments in green. OSM place search and routing stay in the browser. The data date and approximate endpoint links are displayed.

## Journey clarity and route map - 2026-11-10

- Removed the white inset shine from dark navigation while retaining visible keyboard focus.
- Numbered each journey option, grouped its bus legs, and added explicit boarding/alighting codes, per-leg stop counts and circular-line labels. Service hours remain visibly unverified.
- Fixed ranking that put 30-stop direct trips before 9-stop transfers. Options now sort by ridden stops, straight-line access distance, then transfer count. An explicit nearby-stop setting includes other platforms within 500 metres.
- Added a whole-journey map and step list. Each bus leg uses a separate colour and verified official geometry; missing or inconsistent geometry is omitted with a warning. Map and live leg details preserve the selected journey when returning.
- Added walking navigation links opened by the user. The page identifies straight-line access links and discloses that opening Google Maps shares that walking leg's endpoints. No automatic external routing request is made.

## Connected workspace and bus journeys - 2026-11-10

- Rebuilt the page as a continuous list/map workspace with compact 3D transport entries, nearby/saved information before supporting content, lighter AI input, integrated route/stop rows and consistent selected-result surfaces. Existing scoped card transitions and reduced-motion behavior remain.
- Kept arriving buses clear of schematic stop signs. Sign positions now account for scaled vehicle footprints and route bends, with a leader to the unchanged official anchor. Fixed world proportions are retained.
- Added bus journeys from current location or an official stop to a destination stop. Direct and one-transfer options use a dated official DSAT network of 90 routes and 111 directions. Results show stop count, straight-line access distance and data date, and open the selected leg's live arrivals. Location is processed only in the browser.
- Added the official MLM service page adapter and 17 station timetable links across three lines. The app distinguishes the published schedule edition from retrieval time and does not label timetable data as live arrivals.
- Added fixture regressions for directional journey search, repeated stops, nearby candidates, stale result context, station-sign clearance and official timetable parsing. Source policy for the bus snapshot is recorded in ADR 0012.

## Resident travel workspace - 2026-11-10

- Enabled antialiasing when MapLibre creates the WebGL context shared with Three.js, while retaining native device resolution and fixed model proportions. Stationary bus markers stop their animation loop and resume when the official estimate changes.
- Added connected card/detail transitions, directional return motion and a moving navigation indicator. Transitions stay inside the content panel so the map and navigation remain usable; reduced-motion preferences use direct updates.
- Switched interface typography to self-hosted variable Noto Sans TC through Next.js font optimization. Home, waiting, parking, weather and source modules use separate cards with consistent spacing. Long stop/facility lists remain compact within cards.

- Replaced duplicated desktop/mobile overlays with one responsive workspace: Travel, Buses, LRT, Parking and AI. Desktop keeps the list beside the map; phones switch views with fixed navigation and native content scrolling.
- Added on-device favourites, explicit nearby-parking location, seven official parking categories, full facility results, source status/retry, SMG forecasts and coordinated day/night appearance. Location coordinates stay in browser memory.
- Bus details lead with a selected waiting stop, route direction/destination and suspension status. Search distinguishes route numbers from in-route station names. The selected bus stops polling outside its visible context; AI answers survive section changes.
- Applied the user correction to model size: all kinds now use one fixed 4x world-space display scale, with no zoom-dependent compensation. Rounded edges, smooth normals, denser circles, roof vents, wheel bolts, brighter paint and soft contact shadows replace the coarse model finish.
- Rebuilt two operator-livery buses, cylindrical bus-stop signs from the user's reference, and LRT canopy/platform markers in Blender. All five GLBs total 962,612 bytes. Three.js/models load on demand; 2D is the default and failed models keep flat markers. Model identity, structure and bearing remain schematic.
- Added prominent homepage AI questions and a primary AI tab. The existing DeepSeek pipeline carries source timestamps and partial-news availability into its snapshot; unavailable/unconfigured service returns an explicit failure.
- LRT carriages now turn independently, use a rounded Blender mesh, and remain readable at route zoom. Track geometry joins shared endpoints at both ends, removes the artificial Taipa jump, trims terminal overrun and preserves per-line interchange locations. Hidden old MLM notices are historical, and CST dates use Macau time.
- Enlarged station hit areas, disabled accidental touch rotation/pitch, corrected competing map camera movements, resized the map with its real viewport and paused animation on hidden mobile maps. Reduced-motion preferences disable continuous vehicle animation. Primary navigation supports keyboard arrows/Home/End.

## Resident data accuracy corrections - 2026-11-10

- Removed application-generated border waiting minutes. Official qualitative status remains; minutes stay unknown until an official numeric field is verified.
- Parking publisher timestamps stay unknown when absent or invalid, and previously fresh snapshots age into delayed status if the client loses contact.
- Added normalized government transport news from the official GCS and DSAT RSS feeds, with publication dates and per-feed availability. These are published announcements, not a complete live incident stream.
- Roadwork start dates are no longer reported as publication dates. Complete DSAT notice-source failure keeps the last valid cache instead of publishing an empty successful list.

## Two-second bus refresh - 2026-10-11

- A focused bus route now polls the client and the server cache every 2 seconds, down from 5 seconds. The stale fallback stays at 60 seconds, and the client keeps its jitter and failure backoff.
- The upstream cost per focused route-direction rises from about 12 to about 30 refreshes a minute; the cache lock still collapses concurrent requests.
- The 更新延遲 indicator no longer flickers when a payload is served one refresh cycle past its TTL. It now appears only when the payload is older than its TTL plus an 8-second grace window, which means a refresh actually failed; the bus panel measured 28 of 40 samples flagged before this fix and none after.

## Honest bus report: official positions and stops-away counts - 2026-10-11

- The bus panel no longer invents arrival minutes. The `/ddbus/app/passenger/route` endpoint the adapter read as a countdown is the half-hourly passenger waiting-time/flow statistics feed behind the official 乘客候車時間 page: it returns `currentSeg`/`historyRange` segments and per-stop counts that stay frozen while buses move. It is no longer read (ADR 0010).
- Live bus markers now use the position estimate the official bus report publishes per plate in the stop-location feed, the same coordinates the official map page draws, falling back to the coordinates of the stop each bus is approaching. Markers still glide along the official route polyline, and they no longer rewind to the stop just reached when the feed advances.
- The stop list shows the official metric instead: the stop a bus is heading to shows 即將進站 with a bus icon and plate, later stops show 還有 N 站 (wrapping on circular routes), and stops behind every bus show a dash. A quiet note states that DSAT publishes no per-stop arrival minutes.
- The bus payload drops `etaMinutes`, `averageMinutes`, and `messageCode` and adds `stopsAway`. The AI assistant receives stops-away counts and is instructed not to convert them into minutes. `docs/DATA_SOURCES.md`, the README, and ADR 0010 record the change.

## Full parking coordinate coverage - 2026-10-10

- All 92 DSAT public car parks now have map coordinates. The 14 that had no OpenStreetMap name match use the Macau SAR Government WebMap Carpark POI layer at build time; the runtime keeps reading the checked-in `data/parking-locations.json`.
- `npm run build:parking` keeps OpenStreetMap as the primary match and falls back to the government GIS layer. 未定位 remains for any car park that neither source can match.

## Stop-arrival correction for bus markers - 2026-10-10

- When DSAT advances a bus to the next approaching stop, the map now re-anchors that bus to the stop it just reached, then continues toward the new estimate. Estimate error no longer accumulates across stops.
- Backward segment revisions are not treated as arrivals. They keep the existing eased correction, so a feed jump cannot teleport a marker backward.

## Per-tab map focus, parking markers, and incident-first alerts - 2026-10-10

- Each tab now narrows the map to its own subject: parking shows only mapped car parks, cameras show only camera markers, and Alerts shows only the monitored road segments named in the selected incident. The bus and LRT tabs keep their focused views, and Overview keeps the general map.
- Clicking a car park in the list flies the map to it and draws a blue selection ring. `data/parking-locations.json` maps 78 of 92 DSAT car parks to OpenStreetMap `amenity=parking` coordinates (ODbL); the rest show 未定位 and cannot be selected. `npm run build:parking` regenerates the file.
- The DSAT 特別消息, 交通改道, and 巴士改道 lists are parsed correctly now; the previous parser missed their detail links and the summary the 特別消息 page hides in an HTML comment. Messages with accident, fire, flooding, fallen-tree, collision, or urgent-repair keywords are classified as incidents and shown first.
- Planned roadworks, diversions, and events moved into a collapsed section under the incident list.

## Dark transit console and clean LRT view - 2026-10-10

- Replaced the light frosted interface with a dark, data-first transit console: system typography, dark materials, a system-blue interactive tint, semantic status colours, a 66 px vertical navigation rail on desktop, and a bottom tab bar with a draggable sheet on mobile.
- The LRT tab now isolates the network. Roads, cameras, congestion, buildings, and other overlays hide while the tab is open, and selecting a line leaves only that line, its stations, and the labelled schematic train on the map.
- Bus arrivals now refresh every 5 seconds on both the client and the server, down from 10 seconds, so arrivals and markers react faster. The stale fallback stays at 60 seconds.

## Apple-inspired interface refresh - 2026-10-10

- Rebuilt the interface chrome after Apple's design guidance: system font stack, a light translucent header, frosted floating panels, hairline separators, and a documented radius scale for controls and surfaces.
- The language switcher, direction control, and 3D/2D control use segmented styles; the active desktop and mobile tab uses a soft tinted pill instead of an underline.
- The layer menu is now an iOS-style popover with grouped rows and switches for roads, cameras, and LRT.
- The mobile bottom sheet uses the same material, radius, and grabber treatment as the desktop panel.
- Surfaces fall back to solid backgrounds under `prefers-reduced-transparency`, and all existing keyboard, ARIA, and focus behavior is unchanged.

## Bigger bus models and a 2D preview mode - 2026-10-10

- The 3D bus models render at 1.8x display scale so they stay readable at street zoom. Above z19 the on-screen size still stays fixed.
- The layer menu replaces the 3D/buildings checkbox with a 3D/2D mode control. 2D flattens the camera, hides the buildings, and shows enlarged livery-coloured bus markers with plate labels at every zoom.
- The GLB models are not requested or drawn while 2D is active, and switching back to 3D loads them on demand.
- The bus panel note and the source registry now describe both modes.

## Bus marker motion fix - 2026-10-09

- Live bus markers no longer dead-reckon ahead of the feed and snap back on the next poll. Each marker glides from its drawn position toward the newest official estimate along the concatenated official route polyline at a bounded bus speed, so a coarse ETA step never teleports the bus. A marker holds its position when the official estimate does not change.
- The bus ETA payload now names the `routeSegments` index used for each vehicle estimate in `segmentIndex`. A repeated stop code on a loop route can no longer send the marker to a different part of the route.
- Loop routes carry a marker forward into the next lap instead of snapping it back to the first segment, and backward corrections are eased instead of stepped.
- Live polls send `cache: "no-store"` so the browser cannot serve a bus payload from its own HTTP cache for the 10 s TTL plus the 60 s revalidation window.

## Competition video male voiceover - 2026-10-09

- Replaced the demo video narration with the male `edge-tts` voice `en-US-AndrewMultilingualNeural` at a +12% rate. Each cue is time-fitted to its existing narration slot, so the picture and the SRT keep their original timing. 7 of 31 cues needed up to 10% extra pace.
- The video stream is copied without re-encoding. The rebuilt file is 269.2 seconds and 25.1 MB. Integrated loudness is -16.5 LUFS, the same as the previous mix.
- Added `competition/video/scripts/revoice.mjs` to swap narration in an already-cut video. `tts.mjs` now generates narration with `edge-tts` instead of Apple `say`. The research report's AI disclosure and both checklists name `edge-tts`.

## Live-detail assistant and flat map with 3D buildings - 2026-10-09

- Fixed bus jitter near stops: the animation now eases down over the last 70 m, never draws a bus past the stop, and holds its drawn position for up to four seconds when a new poll places the bus slightly behind, instead of stepping back. Corrections between polls are blended over 1.6 s.
- Buses now animate between polls: each vehicle advances along its official segment using the feed's speed, falling back to the approaching stop's ETA when the speed is missing or near zero, and resets to the official estimate on every poll. The panel already states that positions are estimates.
- The selected LRT line shows one train that moves along the official line geometry as an explicitly labelled schematic animation (ADR 0008). No live position, countdown, or timetable inference is presented.
- The assistant now carries the official LRT network (lines, stations, interchanges) and answers LRT questions while stating that no official live train positions exist.
- Answers can carry a UI action: a named bus route is drawn on the map with its stops and live vehicles while the answer stays on screen, and a named LRT line is highlighted. A button in the answer opens the matching bus or LRT panel.
- Questions such as "does route 9 serve Taipa?" are checked against the official stop list on the server. The verified yes or no leads the answer, so a weak model cannot flip the result.
- The AI assistant now resolves names in the question. A named bus route triggers live fetches for that route (both directions when one route is named, at most three route-direction slices), so answers can use vehicle plates, the stop each bus is approaching, speed, the low-floor flag, next arrivals, suspended stops, and the per-segment traffic on the official route. A named road is matched against all 1,268 monitored segments and summarised with a segment count, status breakdown, and total length.
- Road answers now list every congested segment and the slowest named segments, not only a count.
- Bus answers state that positions are estimated from the official arrival feed, not GPS. Direction 0 is the outbound trip and direction 1 is the return trip.
- The map ground is flat: terrain elevation is no longer applied, so roads no longer rise and fall with the DEM. The 3D view still tilts the camera and shows extruded buildings from the OpenFreeMap vector tiles. The AWS terrain source and its CSP entries are removed.
- The assistant suggestions now include a bus-position example ("Where is bus 3 right now?").

## AI learning assistant - 2026-10-09

- Added an AI learning assistant behind a server-only adapter (`src/server/sources/assistant.ts`). It answers student questions in Traditional Chinese, Simplified Chinese, or English, using a compact snapshot of the cached normalized data: road status, bridge times, weather, parking, borders, notices, LRT notices, and the focused bus route's arrivals.
- Added `POST /api/v1/assistant` with Zod validation, the shared per-identity rate limit plus a stricter assistant limit, and response meta that names the model. Questions and answers are not stored. `ASSISTANT_TIMEOUT_MS` raises the provider timeout for slower local models.
- Added the AI tutor tab to the desktop rail and mobile sheet: suggested questions, the grounded answer, the snapshot time, and the list of data used.
- The assistant needs `ASSISTANT_API_KEY`. Without it the route returns 503 and every other module keeps working. `ASSISTANT_BASE_URL` (default `https://api.deepseek.com/v1`) and `ASSISTANT_MODEL` (default `deepseek-chat`) accept any OpenAI-compatible endpoint; `ASSISTANT_RATE_LIMIT_PER_MINUTE` defaults to 12; `SOURCE_ASSISTANT_ENABLED=false` disables the route.

## Runtime refresh and local dev fixes - 2026-10-07

- The LRT network now rebuilds from OpenStreetMap route relations at runtime every 6 hours, so new stations and lines appear without a redeploy. The checked-in `data/lrt-network.json` stays as the fallback and keeps the official names for known stations.
- Documented that the bus catalog, notices, cameras, parking, weather, roads, bridges, borders, and LRT notices were already fetched at runtime by the server; a new bus route appears within the 6-hour catalog TTL.
- Local development: `127.0.0.1` is an allowed dev origin, and Playwright reuses a running dev server on `localhost:3100` instead of starting a second one.
- Selecting a bus route now scrolls its detail into view, and switching routes no longer shows the previous route's arrivals while the new payload loads.
- Traffic notices do not repeat the title as the body when DSAT returns the same text for both.
- Bus GLB models load only when a route is focused at street zoom. The 3D layer also attaches models correctly when vehicles arrive before the GLBs finish loading.
- The bus panel no longer shows the raw DSAT `busType` code, which has no published meaning.
- Mobile: the bottom sheet now follows the finger while dragging, snaps by distance or velocity, has a 38 px grip, 44 px route and map controls, 48 px camera rows, safe-area padding, and contained scrolling.
- The LRT source tries an Overpass mirror list (overridable with `LRT_OVERPASS_URL`) and logs when it serves the checked-in fallback.
- `/api/v1/health` now reports per-source failure counts, and `npm run warmup` primes the deployed cache after a release.
- Client polling backs off with jitter while a source is failing, then returns to the base interval after recovery.
- Added a Content-Security-Policy for the map, terrain tiles, and official camera streams.

## Bus 3D layer and station alignment - 2026-10-05

- Buses now render as GLB models in a MapLibre custom WebGL layer. The model uses true meter scale from z17 to z19, then keeps a fixed on-screen size so it stays readable without covering the map at z20+. Lower zoom levels use a marker and plate label.
- Fixed the high-zoom flicker and disappearing model: each vehicle's transform is folded into the MapLibre projection in Float64, the model matrix is refreshed every frame, and the model ignores terrain depth/frustum culling so it remains visible and stable while zooming.
- The map zoom ceiling moved from 17 to 24 so the true-scale bus model can be inspected closely. MapLibre does not provide mathematically infinite zoom; 24 is 128 times the previous scale at the bus layer.
- The source model is `docs/models/bus-models.blend`, with runtime exports `public/models/bus-tcm.glb` and `public/models/bus-transmac.glb`. The 32 heading PNG sprites are removed.
- The generic two-axle model now has front and rear axles and a rear engine grille. It is not presented as brand-specific; DSAT `busType` is exposed in the vehicle payload for later mapping.
- Bus stops are merged by `stationCode` between the arrival and location feeds. Live buses use the feed's `staCode`, route segments carry `fromStationCode` and `toStationCode`, and invalid segments no longer shift later stop pairings.
- Buses approaching the same stop are distributed along their official segment using the stop ETA, and plate labels are shown at route overview zoom.

## Bus model remodel - 2026-10-04

- Superseded 2026-10-05: buses were first rendered as 16 heading PNG sprites; the current implementation uses the GLB custom layer above.
- Rebuilt the two bus models from the operator references: TCM (澳巴) orange body, white front and roof band, white window mullions; Transmac (新福利) yellow body, white front, blue skirt stripe.
- The redesigned bus has a separate glazing band, five window mullions per side, two kerb-side doorways, roof air-conditioning unit, lit destination sign, head and tail lamps, mirrors, and visible wheels with hubs.
- Models are laid out in Blender 5.2 and exported as GLB. Previews are in `docs/models/`.
- An earlier custom-layer attempt did not composite. The current layer initializes Three.js on MapLibre's WebGL context after the map loads.

## Deployment - 2026-10-03

- Live at https://macau-traffic-intelligence.onrender.com on Render project `Macau Traffic Intelligence`, environment `production`.
- Web service `macau-traffic-intelligence` (Docker, singapore, two instances) plus private Key Value `macau-traffic-cache` (256 MB, no persistence).
- Source repository: https://github.com/Eric0417/macau-traffic-intelligence with auto-deploy from `main`.
- Map labels now request the `Noto Sans Regular` glyph set that OpenFreeMap serves, removing a 404 for the default font stack.

## 0.1.0 - 2026-10-03

### Added

- Map-first Traditional Chinese, Simplified Chinese, and English dashboard.
- Road congestion GeoJSON, bridge travel times, and traffic notice layers.
- Direct official HLS camera viewer with lazy single-stream playback.
- Bus route selection, direction switching, and 10-second arrival refresh.
- Public parking availability, weather warnings, border status, and LRT network/notice panels.
- Versioned read-only API under `/api/v1`.
- Redis-compatible shared cache with stale-while-revalidate, locks, circuit state, and rate limiting.
- Render Docker blueprint with two to three instances and private Key Value.
- Fixture-based unit tests, Playwright configuration, live source smoke check, and engineering memory files.

### Data Decisions

- LRT train positions and arrival countdowns are not shown because no trustworthy official real-time API was found.
- Border values are best effort and degrade to the official link or stale values without blocking other modules.
- The border adapter now uses the official live status service and covers all eight checkpoints listed by the Public Security Police Force.
- Camera catalog entries that share an official id because the same camera appears under two zones receive deterministic suffixed ids; byte-identical repeats are dropped.
- No traffic history database is included.

### Fixed

- Map overlays are applied once the map style finishes loading instead of being dropped by a load race.
- The MapLibre stylesheet no longer collapses the full-height map container, so official control styling is used without breaking the layout.
- The bus panel shows every route instead of only the first 30 matches.

### Changed

- Bus catalog now merges the official route page, so seasonal routes (`3AS`, `17S1`, `26S`, `52S`) appear with `live: false` instead of being missing.
- Bus arrivals now include stop coordinates and live vehicles (plate, low-floor flag, speed, approaching stop) from the official station feeds; markers are placed between the previous and approaching stop because DSAT publishes segment-level positions.
- Selecting a route zooms the map to its stops and draws the stop sequence, station markers, and live buses.
- The selected route is drawn with the official polyline from `route/traffic`, coloured per segment by the official traffic level, and each stop badge in the panel shows the same status.
- Bus live requests now mirror the official route page parameters (`action`, `routeType`) for the station feed.
- A zero-minute arrival now reads "即將到站" instead of "即時 分鐘".
- Route buttons no longer show the exclamation badge: the official `routeChange` flag covers 50 of 97 routes and does not mean an active diversion. A diversion banner now appears only when the message feed reports suspended stops, and those stops are marked in the list.
- Bus stops on the map are larger and labelled at close zoom, and live buses use the map's bus icon with the plate label so a selected route is readable at a glance.
- LRT has its own tab: selecting a line highlights the line and its stations on the map, lists the stations with interchange badges, and shows the official service notices. No live train position or countdown is shown because no official feed exists.
- Selecting a bus route now focuses the map on that route: camera, LRT, and congestion overlays hide, the 3D buildings hide, and the route stops get halos and labels.
- Live buses are drawn with an isometric 3D bus icon rotated to their travel direction, positioned at 50% along the official polyline of the stop-to-stop segment they are running on.
- The 3D map can be freely rotated and tilted (drag or two-finger), and the navigation control now shows a compass with pitch.
- Live buses now render as rough 3D models built from extruded geometry: TCM (澳巴) in orange with a white front and Transmac (新福利) in yellow with a blue front, after the operators' current liveries.
- The selected LRT line shows a rough 3D "Ocean Cruiser" train model (pale body, deep blue front, orange wave stripe) at the line start; it is a static livery showcase because no official live train position exists.
- The 3D vehicle models are only drawn at street zoom; below that the rotated icon marker is used.
- Roads layer draws the full street network in grey underneath the 1,268 officially monitored segments and the layer menu states that grey roads have no official live data.
- Map defaults to a 3D view with pitch, extruded buildings from OpenFreeMap vectors, and AWS Open Data terrain; the layer menu toggles it back to flat.
