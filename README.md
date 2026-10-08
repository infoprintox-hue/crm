# Visitinglink Business OS — Next.js

The application is now a single Next.js project:

- React components for Dashboard, Sales, Tasks, Clients, Bills, Finance, Collection and Team
- Next.js App Router
- Next.js Route Handlers for the complete serverless backend
- MongoDB for business state, authentication and activity
- Cloudinary for profile images and PDF assets
- Role-based access for Admin, Sub Admin, Sales, Manager and Team

The previous single-file HTML, DOM scripts, Vercel-style API folder, Neon fallback and compatibility copy are not part of this project.

## CSV lead import

- CSV files are reviewed before anything is saved. The review shows new, existing, repeated, invalid and ambiguous rows.
- Choose **Add new only** to keep every existing lead unchanged, or **Add new + update existing** to replace only imported contact/form details.
- Updating an existing lead keeps its internal ID, assignment, stage, follow-ups, call history, notes, pin and payment data.
- Useful form answers are retained as labelled lead details. Advertising IDs, campaign/form tracking fields and other technical export fields are hidden.
- UTF-8 and UTF-16 CSV exports are supported. Large imports are sent in safe batches without silently dropping rows.

Run the CSV regression tests with `npm run test:csv`. The optional browser flow test is `npm run test:csv:browser` when Playwright is available.

## Run locally

```bash
npm install
npm run check:storage
npm run dev
npm run check:connections
```

Open `http://127.0.0.1:3000`.

## Environment

Copy `.env.example` to `.env.local` and configure MongoDB, the session secret and optional Cloudinary credentials. `ADMIN_PASSWORD` is only a first-time bootstrap fallback; an Admin password already stored in MongoDB remains the real password.

`GET /api/health` verifies the browser-facing frontend, Next.js backend, required environment configuration and MongoDB connection without returning secret values. On every server start, the terminal reports whether MongoDB is configured, connecting, connected or unavailable. Logs automatically redact passwords, tokens, cookies, PINs, API keys and database URLs. Set `VL_LOG_LEVEL=debug|info|warn|error`; use `VL_LOG_FORMAT=pretty` for readable terminal logs or `VL_LOG_FORMAT=json` for production log collectors. Browser API success logs are enabled locally and can be enabled in production with `NEXT_PUBLIC_VL_API_LOGS=true`.

If the Admin password has already been stored in MongoDB, it continues to work. To deliberately replace it:

```bash
npm run seed:admin -- --password "your-new-password"
```

## Production

Deploy this folder as the Vercel project root. The handlers under `app/api` are deployed as serverless functions automatically.

### Vercel checklist

1. Sign in to the **Printox Vercel account** and import this folder/repository as the project root.
2. Add `MONGODB_URI`, `MONGODB_DB` and `SESSION_SECRET` under Project Settings → Environment Variables for Production. Add the four `CLOUDINARY_*` values when uploads are required.
3. Do not add `META_*` variables; Meta integration is not part of this build.
4. Deploy again after saving environment variables.
5. Open `/api/health`. A correct deployment returns HTTP 200 with frontend, backend and database all shown as `connected`.
6. Check the deployment logs for `MongoDB connected successfully` and `MongoDB connection verified. Server is ready.`
7. Add `inhousecrm.online` to this project from the Printox account. If Vercel reports that the domain belongs to another project/account, move or remove it there first and then add it here.

Never upload `.env.local`; it contains private credentials and is already excluded from Git and the deployment archive.
