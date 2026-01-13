# UniMemory Console Dashboard

Developer and enterprise control plane for UniMemory.

## URL
`console.unimemory.app`

## Purpose

The Console is the **B2B/developer interface** for managing UniMemory:
- Create and manage API keys
- View memory statistics
- Inspect stored memories
- Monitor processing logs
- Manage end users
- Configure settings

## Features

### Dashboard Overview
- Total memories stored
- Sources ingested
- End users tracked
- API requests (24h/7d)
- Active API keys

### API Keys Management
- Create new API keys
- View all keys
- Revoke keys
- Copy to clipboard

### Memories Viewer
- List all memories
- Filter by API key
- Filter by user ID
- Edit memory content
- Delete memories
- View linked sources

### Requests/Logs
- Processing history
- Worth remembering vs skipped
- Extraction counts
- Timestamps and reasons
- Pagination support

### Settings
- Account configuration
- Ingest preferences
- Data retention policies

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Auth:** Firebase (Google OAuth)
- **API:** Internal stats endpoints + memory APIs

## Development

```bash
npm install
npm run dev
```

Runs on http://localhost:3000

## Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_API_URL=https://unimemory.up.railway.app/api/v1
```

## Deployment

Deployed on Vercel:
- Production: `console.unimemory.app`
- Auto-deploys from `main` branch

## Structure

```
apps/console/
├── app/
│   ├── (authenticated)/      # Protected routes
│   │   ├── dashboard/        # Overview page
│   │   ├── keys/            # API keys management
│   │   ├── memories/        # Memory viewer
│   │   ├── requests/        # Processing logs
│   │   └── settings/        # Settings
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Landing/login
├── components/
│   └── shared/
│       └── Sidebar.tsx      # Main navigation
├── lib/
│   ├── api.ts              # API client
│   └── firebase.ts         # Auth helpers
└── public/
    └── Unimemory Name Logo NoBG.png
```

## API Integration

The Console uses:
- `/api/v1/stats/*` - Dashboard statistics
- `/api/v1/memories` - Memory CRUD
- `/api/v1/keys` - API key management
- `/api/v1/auth/me` - User info

All authenticated via Firebase ID tokens.

## Key Differences from Consumer App

| Feature | Console | Consumer |
|---------|---------|----------|
| **Purpose** | Developer tools | End-user experience |
| **Auth** | Firebase (developers) | Firebase (end users) |
| **API Keys** | Manage keys | No keys exposed |
| **Focus** | Stats, logs, control | Timeline, search, UX |
| **URL** | console.unimemory.app | app.unimemory.app |
