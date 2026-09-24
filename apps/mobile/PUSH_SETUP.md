# Push notifications — one-time setup (Module 23)

The app code is done (`src/lib/push.ts`, `app.config.ts` `expo-notifications` plugin,
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
- **Already set** in `app.config.ts` (`1e5952ee-…`, owner `nongta`). Only if you move the app to
  another Expo account: `npx eas-cli init` there and paste the new id into `app.config.ts`
  (`eas init` can't rewrite a dynamic config).
- `src/lib/push.ts` already reads it.

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
  2. **Add app → Android.** *Android package name* must exactly match `app.config.ts`
     `android.package` = **`la.aura.customer`**.
  3. **Download `google-services.json`** → save as `apps/mobile/google-services.json`.
  4. Nothing to edit in code: `app.config.ts` uses that file automatically for local builds. It is
     gitignored, so EAS cloud builds need it uploaded as a file env var (the config reads it from there):
     ```bash
     npx eas-cli env:create --environment development --environment preview --environment production \
       --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret
     ```
  5. **Service-account key for Expo's push service:** Firebase console → **Project settings**
     (gear) → **Service accounts** → **Generate new private key** → downloads a JSON.
  6. `npx eas-cli credentials` → Android → **Google Service Account Key for Push Notifications
     (FCM V1)** → upload that JSON.
- `google-services.json` and `*service-account*.json` are already in the root `.gitignore`.

---

## Building (`eas.json` profiles)

| Profile | For | API URL comes from |
|---|---|---|
| `development` | iOS **simulator** dev client (no push/camera) | `http://localhost:4000/api/v1` (in `eas.json`) |
| `development-device` | dev client on a **real phone** (push, QR camera, voice notes) | EAS env `development` — use your Mac's LAN IP, e.g. `http://192.168.1.20:4000/api/v1` |
| `preview` | internal testers (Android = installable `.apk`) | EAS env `preview` — **must be `https://`** |
| `production` | App Store / Play Store (build number auto-increments on EAS) | EAS env `production` — **must be `https://`** |

`app.config.ts` refuses to build `preview`/`production` without an `https://` `EXPO_PUBLIC_API_BASE_URL`,
so a tester build can never silently point at `localhost`. Set it once per environment:

```bash
npx eas-cli env:create --environment development --name EXPO_PUBLIC_API_BASE_URL --value http://<LAN-IP>:4000/api/v1 --visibility plaintext
npx eas-cli env:create --environment preview     --name EXPO_PUBLIC_API_BASE_URL --value https://<api-host>/api/v1 --visibility plaintext
npx eas-cli env:create --environment production  --name EXPO_PUBLIC_API_BASE_URL --value https://<api-host>/api/v1 --visibility plaintext
```

Version numbers live on EAS (`appVersionSource: "remote"`). The first time, run
`npx eas-cli build:version:set` per platform, or just build and let EAS start at 1.

Backend side for any non-local build: uploaded files are served only through signed URLs, so set a
dedicated `UPLOAD_URL_SECRET` (≥16 chars) and a public `STORAGE_PUBLIC_URL` (`https://<api-host>/uploads`)
in `apps/backend/.env`.

---

## Order of operations

```bash
cd apps/mobile
npx eas-cli login
# B — projectId is already in app.config.ts
# backend/.env: EXPO_ACCESS_TOKEN=...              # A
npx eas-cli credentials                            # C (iOS APNs key)  + D (Android FCM key)
npx eas-cli env:create ...                         # API URL per environment (see Building)
npx eas-cli build --profile development-device --platform ios     # or android
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
