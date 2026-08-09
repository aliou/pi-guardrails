---
"@aliou/pi-guardrails": patch
---

Make Pi documentation path grants optional so the extension loads in Oh My Pi.

`extensions/path-access/dynamic-resources.ts` no longer statically imports named `getReadmePath`, `getDocsPath`, and `getExamplesPath` helpers from `@earendil-works/pi-coding-agent`. When those helpers are unavailable (e.g. under Oh My Pi), documentation grants are skipped instead of failing extension validation.
