# Simple phone navigation verification

Date: 2026-11-14. Branch: `codex/mobile-visual-polish`.

## Result

Phone home prioritizes a destination/question field with a full-width 48px send button and a bus lookup entry. The bottom navigation has Travel, Bus, AI Assistant and More. More contains LRT, parking and additional services; a settings disclosure contains appearance/language. Detailed weather is available in the traffic overview and nearby parking in the parking panel. Saved items remain visible when present.

Mobile buttons use neutral secondary/disabled states, 16–22px control icons and softer surfaces in both themes. Colour transitions take 160ms and are disabled with reduced motion. Transport assets are unchanged. Desktop retains five primary tabs and header settings.

The home component stays mounted but hidden during other sections so typing survives visits to settings. Hidden tabs are excluded from keyboard navigation and the active indicator measurement. Shared appearance/language controls avoid two separate implementations.

## Checks

- Typecheck, lint, documentation checks, production build and 173 unit/parser tests passed.
- The full browser run passed 114 tests and skipped six platform-specific cases. Its two failures used the former header More button on phones; both passed after their test helpers followed the new menu path. The final navigation/theme regression also passed in WebKit and Chromium.
- Phone layout checks covered 320/390/430px and three languages. The theme screenshot waits for computed foreground/background colours before capture; the inspected WebKit image shows consistent dark surfaces and readable settings labels.
- The sampled light placeholder/input pair has 4.51:1 contrast; the secondary text/card pair has 5.75:1 in light mode and 7.16:1 in dark mode. Enabled submit foregrounds have 4.91:1 in light mode and 8.03:1 in dark mode. These measurements are not a full accessibility audit.
- Independent source review checked visible-tab keyboard navigation, hidden home state, secondary entry points and desktop isolation. Its dark submit foreground finding was fixed.
- A WebKit test now waits for the hydrated fixture weather before entering a question, so synthetic input cannot race initial React hydration.

All automated browser APIs and map styles use fixtures. Phone checks use browser emulation; physical iPhone browser chrome and keyboard remain unverified.

## Deployment

Pending. Rollback target: code `414b9f494be13953cc2df77d87e0a91395ddd69f`, Render deployment `dep-dbs4mc68bjmc73e49ht0`. No source contract or data migration changes.
