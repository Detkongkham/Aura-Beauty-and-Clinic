# Push notifications — one-time setup (Module 23)

The app code is done (`src/lib/push.ts`, `app.json` `expo-notifications` plugin,
`/notifications/devices` on the backend). What's left needs **your Expo + Apple/Google
accounts** and can't be scripted here.

---

## Where each credential comes from

### A. `EXPO_ACCESS_TOKEN`  (backend → sends the push)

- **Account needed:** Expo account — free, sign up at <https://expo.dev>.
- **Get it:** <https://expo.dev/settings/access-tokens> → **Create token** → copy the value
  (shown once).
- **Put it in:** `apps/backend/.env`
  ```
  EXPO_ACCESS_TOKEN=<paste>
  ```
- Without it the backend just logs `[push:dev] would send Expo push` — everything else still works.

### B. `extra.eas.projectId`  (app → asks Expo for a real push token)

- **Account needed:** same Expo account.
- **Get it:** it is written automatically:
  ```bash
  cd apps/mobile
  npx eas-cli login
  npx eas-cli init        # picks/creates the project, writes projectId into app.json
  ```
- `src/lib/push.ts` already reads it. No manual editing.

### C. iOS APNs key  (`.p8`)  — only for a real iOS build

- **Account needed:** **Apple Developer Program** membership (US$99/year) —
  <https://developer.apple.com/programs/>.
- **Easiest — let EAS make it for you:**
  ```bash
  npx eas-cli credentials          # → iOS → Push Notifications → "Set up a new key"
  ```
  Log in with your Apple ID (or an App Store Connect API key); EAS creates the `.p8`,
  registers it with Apple, and stores it. One key covers every app on the account.
- **Manual alternative:** Apple Developer portal → *Certificates, Identifiers & Profiles* →
  **Keys** → **+** → tick **Apple Push Notifications service (APNs)** → Continue → **Download**
  the `.p8` (**downloadable once — keep it safe**). Note the **Key ID** (on that page) and your
  **Team ID** (top-right of the portal). Then `npx eas-cli credentials` → iOS → *upload* the
  `.p8` + Key ID + Team ID.

### D. Android FCM  (`google-services.json` + service-account key) — only for a real Android build

- **Account needed:** a Google account → **Firebase** (free) — <https://console.firebase.google.com>.
- **Steps:**
  1. **Create / open a Firebase project.**
  2. **Add app → Android.** *Android package name* must exactly match `app.json`
     `expo.android.package` = **`la.aura.customer`**.
  3. **Download `google-services.json`** → save as `apps/mobile/google-services.json`.
  4. Add to `app.json`:
     ```json
     "android": {
       "package": "la.aura.customer",
       "googleServicesFile": "./google-services.json",
       "adaptiveIcon": { "...": "..." }
     }
     ```
  5. **Service-account key for Expo's push service:** Firebase console → **Project settings**
     (gear) → **Service accounts** → **Generate new private key** → downloads a JSON.
  6. `npx eas-cli credentials` → Android → **Google Service Account Key for Push Notifications
     (FCM V1)** → upload that JSON.
- Add `google-services.json` and the service-account JSON to `.gitignore`.

---

## Order of operations

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init                                   # B — projectId
# backend/.env: EXPO_ACCESS_TOKEN=...              # A
npx eas-cli credentials                            # C (iOS APNs key)  + D (Android FCM key)
npx eas-cli build --profile development --platform ios     # or android
```

Install the resulting **dev client** on a physical device (push doesn't work on simulators,
and Expo Go on SDK 53+ can't receive remote push).

---

## Test end-to-end

1. Log in on the device → `POST /api/v1/notifications/devices` fires
   (check backend logs / the `push_devices` table).
2. Send a manual test from <https://expo.dev/notifications> using the device's
   `ExponentPushToken[...]` (printed to the Metro console by `src/lib/push.ts` in dev).
3. Book an appointment ~24 h or ~1 h out; the `reminder` worker sweep (every 15 min) sends it.
   Run the worker: `tsx apps/backend/src/jobs/main.ts` (registers the repeatable jobs on boot).
4. Cancel a booking someone else is waitlisted for → `WAITLIST_SLOT_OPEN` push.

## Cost summary

| Credential | Account | Cost |
|---|---|---|
| `EXPO_ACCESS_TOKEN` + `projectId` | Expo | free |
| iOS APNs key | Apple Developer Program | US$99 / year |
| Android FCM | Firebase / Google | free |
