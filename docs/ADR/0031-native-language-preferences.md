# Native language preferences

Date: 2026-11-16

The native app follows the first supported preferred language on the device by default, with an optional in-app override. English is the fallback. Localized UI and permission prompts cover Traditional Chinese, Simplified Chinese, English, Japanese, Korean, Portuguese and Spanish. Publisher names are displayed in their available languages, including official Portuguese names when present.

Assistant request locales include the same languages. This is an additive extension to the v1 request contracts. The existing website UI locale set is separate. Generated answers use the requested response language. Machine-readable journey records and official source fields keep their existing contracts. Fixed backend copy falls back to English where additional translations are unavailable.
