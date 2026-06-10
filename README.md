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
│   │   └── userController.ts  # getUsers, getUserById
│   ├── middleware/
│   │   ├── authMiddleware.ts  # authenticate — verify JWT + token_version kill-switch
│   │   └── validate.ts        # Zod request validation
│   ├── routes/               # Route definitions
│   │   ├── authRoutes.ts      # /api/auth
│   │   └── userRoutes.ts      # /api/users
│   ├── utils/
│   │   ├── jwt.ts             # sign/verify short-lived access tokens
│   │   ├── refreshToken.ts    # opaque refresh tokens, SHA-256 hashed
│   │   ├── passwordReset.ts   # single-use reset tokens
│   │   └── mailer.ts          # send reset email (dev: logs link)
│   ├── validators/           # Zod schemas (auth, user params)
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
