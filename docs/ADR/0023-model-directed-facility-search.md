# Model-directed facility search

Date: 2026-11-16

The live question “我想要最近嘅醫院” passed through the model as a named journey. Searching the word 醫院 returned a street, hospitals and bus stops. The app asked the rider to choose a destination before obtaining an origin.

Keep classification as the first step in the existing assistant journey endpoint. Add a validated facility search with a category, a lookup or directions action, and optional walking-distance ranking. The configured model extracts the task and any explicit reference landmark. It receives no device coordinates during classification. A location follow-up carries the validated search so the model does not have to reinterpret the original question.

Keep the existing dated OSM extract and walking graph. Record facility types from its tags for named hospitals, clinics, pharmacies and toilets. Use those types to exclude similar-looking streets, car parks and stops. Select the nearest indexed facility by straight-line distance by default. For explicit walking proximity, rank connected facilities by mapped walking distance. A named origin takes priority over device location. Unresolved or ambiguous origins can be corrected before selecting the destination.

Location lookups show one result or a distance-ordered list, with directions available from each result. A directions request uses the nearest matching facility as the destination and runs the existing bus and walking search. The second model call selects only validated transport options. If route data is unavailable or no route is found, keep the named facility and explain the route limitation. Do not claim current opening, accessibility or clinical services from map tags. Explicit service or opening-hours requirements are shown as unverified and require a separate choice to start directions. Explicit requests for emergency assistance show the Macau emergency number from the Health Bureau's [emergency service page](https://www.gov.mo/en/services/ps-1544/).

The API keeps its v1 path and no-store responses. Existing named trips, itineraries, parking, bus-stop lookups and traffic questions retain their entry points. The walking snapshot cache version changes to load the added fields. No new runtime provider or cache is needed.
