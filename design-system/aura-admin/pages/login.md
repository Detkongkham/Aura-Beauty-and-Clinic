# Page override — Login

> Overrides `../MASTER.md` for the `/login`, `/forgot-password`, `/reset-password` screens only.

- **Layout:** single centered card, `max-width: 24rem`, `--radius-lg`, `--shadow-sm`; no AppShell (no sidebar/topbar). Full-viewport `--color-background`.
- **Density:** override to *spacious* here — `--space-2xl` between the brand block, form, and footer link. This is the one screen that is not a dashboard.
- **Brand:** wordmark in Playfair Display `text-2xl`, `--color-primary`; one-line subtitle in `--color-muted-foreground`.
- **Form:** labels always visible above inputs; inputs `text-base` (16px) to prevent iOS zoom. Submit button full-width, primary. Root/API errors render in a `--color-destructive-soft` panel with `role="alert"` above the first field; field errors inline with `aria-describedby`.
- **Motion:** none beyond the global focus ring; do not animate the card in.
- **Responsive:** the card stays `max-width: 24rem` and gains `px-4` gutters below 375px; never full-bleed.
- **A11y:** `autoComplete="username"` on phone, `current-password` on password; the language toggle is reachable before the form in tab order.
