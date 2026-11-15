# Assistant facility search verification

Date: 2026-11-16

## Reproduction

On the previous public site, submitting “我想要最近嘅醫院” gave a destination choice list that included 醫院後街 and bus stops C701 and C702. It did not ask for the location needed to determine which hospital was closest. The old classifier could emit a general facility noun as the destination name, and the name search returned unrelated objects.

The new classifier has a facility action. The server ranks map-tagged places, and a directions request uses the selected facility in the existing route graph. The location continuation preserves the category and action. Fixed browser flows include granted and denied location, a named landmark, a multi-result list with route selection, opening-hours uncertainty and emergency contact.

## Dataset check

The dated Geofabrik import still has 7,816 places, 52,983 walking nodes and 57,125 directed-edge records. The regenerated locations and graph match the existing snapshot, apart from the additional facility category field. The same-name 醫院後街, hospital car parks and the 協和醫院 rail stop do not match the hospital category. The OSM record for the Union Hospital complex is tagged separately.

The real-model sample is documented below after verification. It uses public landmark names and a synthetic location near Pui Ching.
