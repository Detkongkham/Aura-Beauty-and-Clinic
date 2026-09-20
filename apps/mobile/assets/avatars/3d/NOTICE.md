# 3D cartoon avatar pack

Source: **Microsoft Fluent Emoji** — https://github.com/microsoft/fluentui-emoji
License: **MIT** (graphics) — © Microsoft. Free to use/bundle/redistribute.

`av-01.png` … `av-47.png` are the `3D` renders of assorted "person" emoji
(varied gender / skin tone / hair / profession), downloaded from
`raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/<Name>/<Tone>/3D/`.

Picked deterministically by name-hash in `src/components/ui/Avatar.tsx`
via `src/lib/avatarPack.ts` (regenerate that file if you add/remove PNGs here).
