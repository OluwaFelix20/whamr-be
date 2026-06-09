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
│   │   ├── authController.ts  # register, login (bcrypt)
│   │   └── userController.ts  # getUsers, getUserById
│   ├── routes/               # Route definitions
│   │   ├── authRoutes.ts      # /api/auth
│   │   └── userRoutes.ts      # /api/users
│   └── types/
│       └── user.ts
└── supabase/
    └── migrations/           # SQL migrations (schema = source of truth)
        └── 0001_create_users_table.sql
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

3. Apply the migration to your Supabase database. Either:
   - Paste `supabase/migrations/0001_create_users_table.sql` into the Supabase
     SQL Editor and run it, **or**
   - Use the Supabase CLI: `supabase db push`.

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

| Method | Endpoint             | Description                |
| ------ | -------------------- | -------------------------- |
| GET    | `/health`            | Health check               |
| POST   | `/api/auth/register` | Create a user (bcrypt hash)|
| POST   | `/api/auth/login`    | Verify credentials         |
| GET    | `/api/users`         | List users                 |
| GET    | `/api/users/:id`     | Get a user by id           |
