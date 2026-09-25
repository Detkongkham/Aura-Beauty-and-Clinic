# Page override — Auth (login / forgot / reset)

> Overrides `../MASTER.md` for the `/login`, `/forgot-password`, `/reset-password` screens only.
> Redesigned 2026-09-25 (was: single centred card, no motion).

- **Layout:** split screen at `lg+` — form column (DOM first, so tab order + `h1` lead) and a sticky brand panel placed left via `lg:order-first`. Below `lg` the panel is hidden and a compact API status pill sits in the footer. Shared frame: `features/auth/components/AuthShell.tsx` (`AuthShell` + `AuthCard`).
- **Brand panel:** `bg-primary` / `text-primary-foreground` only (follows tone presets + dark mode), Playfair headline, 3 feature rows, live Vientiane clinic clock.
- **System status card:** polls the origin-root `/health` every 8 s while the tab is visible (`useApiHealth`), shows state pill, response / success / checks, a 20-bar latency chart (failed probes = short red tick, not colour only) and an availability bar. Nothing beyond up/down + timing is exposed pre-auth.
- **Form column:** header with LanguageToggle + ThemeToggle (reachable before the form). Card = icon badge, eyebrow (greeting or stepper), sans `h1`, subtitle, bordered form card. Inputs 44px with leading icon, 16px text; password fields have show/hide + Caps Lock warning.
- **Status/progress:** `AuthStepper` segmented bar for multi-screen flows (reset: request → new password → done; 2FA: password → code/link app → console/save codes). `CountdownBar` for account lockout, reset-code expiry (`?exp=&sent=` from step 1) and the post-reset auto-redirect. Resend code has a 60 s cooldown. `PasswordStrengthMeter` is advisory — only the 8-char minimum is enforced.
- **Feedback:** `AuthNotice` (error = `role="alert"`, others `role="status"`) above the first field; field errors inline with `aria-describedby`.
- **Motion:** short fade/slide entrance on the form and status card, bar fills via `transform: scaleX`; every animation has `motion-reduce:` off.
