# Page override — Users & Roles (`/settings/users`, `/settings/users/:id/permissions`, `/settings/users/quick-login`)

> Overrides `../MASTER.md` for system-account management. `users:manage` gates every write.

- **List (`UsersPage`):** shared `DataTable` — avatar + name, phone, role badge (dynamic `Role.color`/`icon` when a custom role is assigned, else the enum name), branch, last-login relative time, active dot. Row click → permissions page. Toolbar: search + role `Select` + "Invite user" primary button.
- **Invite:** centered `Dialog` (not a Sheet) — name / phone / email / role `Select` / branch `Select`. POST `/users`, 201 → toast + optimistic prepend.
- **Permissions (`PermissionsPage`):** two-column — left, the effective permission list grouped by module with a tri-state control per row (inherit / grant / deny); right, a sticky summary card (role base count + N overrides + effective count). Overrides are an idempotent replace via `PUT /users/:id/permissions`. "Reset to role" clears all overrides. Base row = muted; explicit grant = `--color-success` chip; explicit deny = `--color-destructive` chip.
- **Quick-login (`QuickLoginPage`):** card grid of admin accounts with a PIN-enabled toggle; enabling opens a 4–6 digit PIN `Dialog` (`POST /users/:id/quick-login`), disabling is a `ConfirmDialog` (`DELETE …`). PIN inputs are `inputMode="numeric"`, masked, never echoed to logs.
- **A11y:** the tri-state permission control is a `radiogroup` per row with a visible legend; role badges carry `title` with the full role name when truncated.
