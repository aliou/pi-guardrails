---
"@aliou/pi-guardrails": minor
---

Rework the path-access outside-path prompt options. Options now render as a single-column list in the same order they navigate, instead of a two-column grid whose linear arrow navigation zig-zagged visually (↓ from "Allow once" landed on "Allow file this session", then → moved sideways on the same row). Each option now also has a single-key shortcut shown on its row (`o`/`f`/`F`/`d`/`D`).

Directory grant options ("Allow directory this session/always") are no longer offered when the directory is not grantable — the filesystem root or the home directory — instead of being shown and then rejected after selection. This applies to both the TUI prompt and the RPC select fallback.

Also fix `isGrantTooBroad` never matching the filesystem root: trailing-separator stripping reduced `/` to an empty string before comparison, so selecting "Allow directory always" for `/` silently persisted a useless empty-path grant with no "too broad" warning.
