# Visitinglink Business OS — Next.js

The application is now a single Next.js project:

- React components for Dashboard, Sales, Tasks, Clients, Bills, Finance, Collection and Team
- Next.js App Router
- Next.js Route Handlers for the complete serverless backend
- MongoDB for business state, authentication and activity
- Cloudinary for profile images and PDF assets
- Role-based access for Admin, Sub Admin, Sales, Manager and Team

The previous single-file HTML, DOM scripts, Vercel-style API folder, Neon fallback and compatibility copy are not part of this project.

## Run locally

```bash
npm install
npm run check:storage
npm run dev
npm run check:connections
```

Open `http://127.0.0.1:3000`.

## Environment

Copy `.env.example` to `.env.local` and configure MongoDB, the Admin password, session secret and optional Cloudinary credentials.

`GET /api/health` verifies the browser-facing frontend, Next.js backend, required environment configuration and MongoDB connection without returning secret values. On every server start, the terminal reports whether MongoDB is configured, connecting, connected or unavailable. Logs automatically redact passwords, tokens, cookies, PINs, API keys and database URLs. Set `VL_LOG_LEVEL=debug|info|warn|error`; use `VL_LOG_FORMAT=pretty` for readable terminal logs or `VL_LOG_FORMAT=json` for production log collectors. Browser API success logs are enabled locally and can be enabled in production with `NEXT_PUBLIC_VL_API_LOGS=true`.

If the Admin password has already been stored in MongoDB, it continues to work. To deliberately replace it:

```bash
npm run seed:admin -- --password "your-new-password"
```

## Production

Deploy this folder as the Vercel project root. The handlers under `app/api` are deployed as serverless functions automatically.
