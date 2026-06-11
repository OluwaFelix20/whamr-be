# whamr_BE

Express + TypeScript backend with Supabase as the database source of truth.

## Architecture

```
whamr_BE/
├── src/
│   ├── index.ts              # Central entry point — Express app + middleware + route mounting
│   ├── config/
│   │   └── supabase.ts        # Server-side Supabase client (service_role)
│   ├── controllers/          # Request handlers / business logic
│   │   ├── authController.ts  # register, login, refresh, logout(-all), me, forgot/reset-password
│   │   ├── userController.ts  # getUsers, getUserById
│   │   ├── favoritesController.ts # list/add/remove favourites
│   │   ├── commentsController.ts  # list/create/delete/report comments
│   │   └── stickerController.ts   # convert / tray / validate (HTTP <-> sticker service)
│   ├── services/             # Framework-free business logic
│   │   └── stickerService.ts  # sharp pipeline: 512x512 WebP, byte-budget, validation
│   ├── middleware/
│   │   ├── authMiddleware.ts  # authenticate — verify JWT + token_version kill-switch
│   │   └── validate.ts        # Zod request validation
│   ├── routes/               # Route definitions
│   │   ├── authRoutes.ts      # /api/auth
│   │   ├── userRoutes.ts      # /api/users
│   │   ├── favoritesRoutes.ts # /api/favorites
│   │   ├── commentsRoutes.ts  # /api/comments
│   │   └── stickerRoutes.ts   # /api/stickers (multer upload + auth)
│   ├── utils/
│   │   ├── jwt.ts             # sign/verify short-lived access tokens
│   │   ├── refreshToken.ts    # opaque refresh tokens, SHA-256 hashed
│   │   ├── passwordReset.ts   # single-use reset tokens
│   │   └── mailer.ts          # send reset email (dev: logs link)
│   ├── validators/           # Zod schemas (auth, user params, community, sticker)
│   └── types/                # User, JWT payload, Express augmentation
└── supabase/
    └── migrations/           # SQL migrations (schema = source of truth)
        ├── 0001_create_users_table.sql
        ├── 0002_create_refresh_tokens_table.sql
        ├── 0003_add_token_version_to_users.sql
        └── 0004_create_password_reset_tokens_table.sql
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the env template and fill in your Supabase credentials:
   ```bash
   cp .env.example .env
   ```
   Get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your Supabase project
   under **Settings → API**.

   Also set `JWT_SECRET` (generate with
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`).
   `ACCESS_TOKEN_EXPIRES_IN` (default `15m`) and `REFRESH_TOKEN_TTL_DAYS`
   (default `30`) are optional.

3. Apply the migrations to your Supabase database, in order, by pasting each
   file under `supabase/migrations/` into the Supabase SQL Editor and running
   it (or `supabase db push` with the CLI):
   - `0001_create_users_table.sql`
   - `0002_create_refresh_tokens_table.sql`
   - `0003_add_token_version_to_users.sql`
   - `0004_create_password_reset_tokens_table.sql`

## Run

```bash
npm run dev     # development with hot reload
npm run build   # compile TypeScript to dist/
npm start       # run the compiled build
```

## Deploy (Render)

This repo ships a `render.yaml` blueprint.

1. Push to GitHub, then in Render: **New → Blueprint** and select this repo.
   Render reads `render.yaml` and creates the `whamr-be` web service
   (build: `npm ci --include=dev && npm run build`, start: `npm start`,
   health check: `/health`).
2. Set the three secret env vars in the Render dashboard (marked
   `sync: false`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `RESEND_API_KEY`. `JWT_SECRET` is auto-generated; the rest have defaults in
   the blueprint. `PORT` is injected by Render — don't set it.
3. After it's live, point the frontend at it: set `DEPLOYED_API` in
   `whamr_FE/reset-password.html` to the Render URL, and make sure this
   service's `CORS_ALLOWED_ORIGINS` includes the frontend origin.

Note: `NODE_OPTIONS=--use-system-ca` is **only** for local machines behind a
TLS-intercepting proxy (see below) — do not set it on Render.

## Network note (TLS-intercepting proxies)

If you are behind a corporate/managed network that inspects TLS, Node and npm
may reject HTTPS with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` because they ship their
own CA bundle instead of using the OS trust store. This breaks both
`npm install` and runtime Supabase calls. On Node 22.15+/24, trust the system
store:

```bash
# PowerShell
$env:NODE_OPTIONS = "--use-system-ca"
# bash
export NODE_OPTIONS=--use-system-ca
```

Set this before `npm install` and before running the server.

## API

`Auth` column: 🔓 public · 🔑 requires `Authorization: Bearer <accessToken>`.

| Method | Endpoint                | Auth | Body                          | Description                                                                 |
| ------ | ----------------------- | ---- | ----------------------------- | --------------------------------------------------------------------------- |
| GET    | `/health`               | 🔓   | —                             | Health check                                                                |
| POST   | `/api/auth/register`    | 🔓   | `email, password, full_name?` | Create a user (bcrypt hash). Returns `{ user, accessToken, refreshToken }`. |
| POST   | `/api/auth/login`       | 🔓   | `email, password`             | Verify credentials. Returns `{ user, accessToken, refreshToken }`.          |
| POST   | `/api/auth/refresh`     | 🔓   | `refreshToken`                | Rotate tokens. Returns a new `{ accessToken, refreshToken }`.               |
| POST   | `/api/auth/logout`      | 🔓   | `refreshToken`                | Revoke one refresh token (idempotent).                                      |
| POST   | `/api/auth/logout-all`  | 🔑   | —                             | Kill-switch: revoke all refresh tokens **and** all access tokens.           |
| POST   | `/api/auth/forgot-password` | 🔓 | `email`                      | Email a single-use reset link. Always 200 (no email enumeration).           |
| POST   | `/api/auth/reset-password`  | 🔓 | `token, newPassword`         | Set a new password; invalidates all existing sessions.                      |
| GET    | `/api/auth/me`          | 🔑   | —                             | Current authenticated user.                                                 |
| GET    | `/api/users`            | 🔑   | —                             | List users.                                                                 |
| GET    | `/api/users/:id`        | 🔑   | —                             | Get a user by id (UUID).                                                     |
| GET    | `/api/favorites`        | 🔑   | —                             | List the current user's favourited meme ids: `{ meme_ids }`.                |
| POST   | `/api/favorites`        | 🔑   | `meme_id`                     | Add a favourite (idempotent).                                               |
| DELETE | `/api/favorites/:memeId`| 🔑   | —                             | Remove a favourite.                                                          |
| GET    | `/api/comments`         | 🔓   | `?meme_id=`                   | List a meme's comments, newest first: `{ comments }`.                        |
| POST   | `/api/comments`         | 🔑   | `meme_id, text`               | Post a comment (author name derived from email). Returns `{ comment }`.     |
| DELETE | `/api/comments/:id`     | 🔑   | —                             | Delete a comment (author or `ADMIN_USER_IDS`).                              |
| POST   | `/api/comments/:id/report` | 🔑 | —                            | Flag a comment for moderation.                                              |
| POST   | `/api/stickers/process` | 🔑   | `image` (file), `fit?`        | Convert an image to a Meta-compliant 512×512 WebP sticker. Returns WebP bytes. |
| POST   | `/api/stickers/tray`    | 🔑   | `image` (file), `fit?`        | Build a 96×96 PNG tray icon (≤50 KB) for a pack. Returns PNG bytes.         |
| POST   | `/api/stickers/validate`| 🔑   | `image` (file)                | Grade a file against the sticker spec. Returns `{ valid, checks, … }`.      |

### Authentication

- **Access token** — short-lived JWT (`ACCESS_TOKEN_EXPIRES_IN`, default `15m`).
  Send it as `Authorization: Bearer <accessToken>` on 🔑 routes.
- **Refresh token** — long-lived opaque token (`REFRESH_TOKEN_TTL_DAYS`, default
  `30`), stored SHA-256 hashed. Exchange it at `/api/auth/refresh` for a new
  pair. **Rotating**: each refresh revokes the old token; reusing a revoked
  token is treated as theft and revokes the user's whole token family.
- **Kill-switch** — each access token carries a `ver` claim checked against the
  user's `token_version` on every 🔑 request. `/api/auth/logout-all` bumps
  `token_version`, instantly invalidating every outstanding access token.

Error responses are JSON: `{ "error": "..." }`, with validation failures adding
`details: [{ field, message }]`.

### Stickers

The `/api/stickers` routes turn arbitrary art into assets that satisfy Meta's
WhatsApp sticker requirements — built ahead of Meta Business API approval, where
non-compliant files are rejected outright. Image processing uses
[`sharp`](https://sharp.pixelplumbing.com/) (libvips).

The spec we enforce (see [Meta's media docs](https://developers.facebook.com/docs/whatsapp/api/media#stickers)):

| Asset    | Dimensions | Format | Max size |
| -------- | ---------- | ------ | -------- |
| Static sticker   | 512×512 | WebP | 100 KB |
| Animated sticker | 512×512 | WebP | 500 KB |
| Tray icon        | 96×96   | PNG  | 50 KB  |

**Request** — `multipart/form-data` with:

- `image` *(required)* — the source file (PNG/JPEG/WebP/GIF/TIFF). Animation is
  auto-detected; animated inputs stay animated.
- `fit` *(optional)* — `contain` (default; letterbox onto transparency, never
  crops) or `cover` (fill the square and crop the overflow).

**`/process` and `/tray`** stream back the raw image bytes (`image/webp` /
`image/png`) so the result can be piped straight into a `.wastickers` pack or
uploaded to storage. The derived properties come back as `X-Sticker-*` response
headers (`Animated`, `Frames`, `Width`, `Height`, `Bytes`, `Quality`), exposed
via CORS so a browser `fetch` can read them. Append `?download=1` to force a
file download. Quality is auto-stepped down until the file fits its byte budget;
if even the lowest setting overflows, the response is `422` rather than a
non-compliant sticker.

**`/validate`** transforms nothing — it grades the uploaded file and returns
`{ valid, format, width, height, bytes, animated, frames, checks[] }`, where each
check reports `{ name, pass, detail }`. The request is `200` regardless of the
verdict; only an unreadable image is an error.

Status codes: `400` missing/empty image · `413` upload over
`STICKER_MAX_UPLOAD_BYTES` (default 25 MB) · `415` unsupported/undecodable
image · `422` cannot be compressed within spec.
