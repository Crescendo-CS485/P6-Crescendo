# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**P4 Crescendo** builds on the P3 full-stack iteration of the Crescendo music discovery platform.
It extends the Flask REST API and React frontend established in P3 Crescendo.

Parent project: `../P3/P3 Cresendo/`

## Commands

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
createdb crescendo_p4          # first time only
python run.py                  # → http://localhost:5001
```

On startup, `run.py` calls `seed()` against `DATABASE_URL`. For a **persistent production DB** (e.g. AWS RDS), seeding is idempotent: curated rows skip if present, **Spotlight —** albums insert once by title, synthetic **Crescendo Catalog #** rows pad toward a target without duplicate titles after partial deletes. Optional env:

- **`SEED_CATALOG_TARGET`** — default `500`; set **`0`** to skip synthetic catalog padding only (real + spotlight rows unchanged).
- **`SEED_SPOTLIGHT_ALBUMS`** — default `true`; set **`false`** to skip idempotent filter-demo albums.

### Frontend
```bash
cd frontend
npm i
npm run dev                    # → http://localhost:5173
npm run build                  # production build → dist/
```

No lint or test scripts are configured.

## Architecture

### Stack
- **Backend**: Flask + Flask-SQLAlchemy + Flask-CORS + psycopg2 + APScheduler + Anthropic SDK (port 5001)
- **Database**: PostgreSQL (`crescendo_p4`)
- **LLM**: Claude Haiku (`claude-haiku-4-5-20251001`) via Anthropic API
- **Frontend**: React 18 + Vite 6 + TypeScript
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite`
- **Routing**: React Router 7 (`createBrowserRouter`)
- **Data fetching**: TanStack React Query 5 (`useQuery`)
- **UI primitives**: Radix UI (shadcn-style wrappers)
- Path alias: `@` → `./frontend/src`

### Directory Layout

```
P4 Cresendo/
├── backend/
│   ├── app/
│   │   ├── __init__.py    # Flask factory: SQLAlchemy + CORS + APScheduler
│   │   ├── models.py      # Artist, Genre, User, LLMPersona, Discussion, Post, LLMJob
│   │   ├── routes.py      # GET /api/artists, /genres, /artists/:id/discussions,
│   │   │                  # GET /api/discussions/:id/posts, POST /api/events
│   │   ├── scheduler.py   # APScheduler singleton + app reference for job context
│   │   └── seed.py        # 8 artists + 4 bot personas + seed discussions/posts (idempotent)
│   │   └── services/
│   │       ├── llm_service.py           # LLMServiceAPI → Anthropic Claude Haiku
│   │       ├── activity_aggregation.py  # ActivityAggregationService → update artist scores
│   │       ├── stagger_scheduler.py     # StaggerScheduler → queue LLM jobs with random offsets
│   │       ├── trigger_handler.py       # TriggerHandlerService → dedup + dispatch
│   │       └── llm_worker.py            # run_llm_job() → generate comment + insert post
│   ├── config.py          # DATABASE_URL + ANTHROPIC_API_KEY from .env
│   ├── .env               # DATABASE_URL, ANTHROPIC_API_KEY
│   ├── requirements.txt
│   └── run.py             # create_all → seed → app.run(5001, use_reloader=False)
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── components/
    │   │   │   ├── ui/            # Radix UI wrappers (do not edit directly)
    │   │   │   ├── ArtistCard.tsx        # Now wrapped in <Link to /artists/:id>
    │   │   │   ├── ArtistCardSkeleton.tsx
    │   │   │   ├── CommentItem.tsx       # Single post with UserBadge + relative time
    │   │   │   ├── CommentList.tsx       # Polls /api/discussions/:id/posts every 8s
    │   │   │   ├── FilterBar.tsx
    │   │   │   ├── PageStates.tsx
    │   │   │   └── UserBadge.tsx         # displayName + handle + BOT badge
    │   │   ├── data/
    │   │   │   └── mockData.ts    # Artist/User/Post/Discussion interfaces + static data
    │   │   ├── lib/utils.ts       # cn() helper
    │   │   └── pages/
    │   │       ├── ArtistPage.tsx     # /artists/:id — hero, discussions, trigger button
    │   │       ├── DiscussionPage.tsx # /discussions/:id — title + CommentList
    │   │       ├── Layout.tsx         # Header + nav + footer
    │   │       └── DiscoveryPage.tsx  # useQuery → GET /api/artists
    │   ├── styles/                # index.css, tailwind.css, theme.css, fonts.css
    │   ├── main.tsx               # QueryClientProvider + RouterProvider
    │   └── app/routes.ts          # "/" + "/artists/:id" + "/discussions/:id"
    ├── index.html
    ├── vite.config.ts             # proxy /api/* → http://localhost:5001
    └── package.json
```

### API Routes

| Method | Path | Query params / Body | Response |
|---|---|---|---|
| GET | `/api/artists` | `active_discussions`, `genre`, `sort`, `page`, `per_page` | `{artists, total, page, pages}` |
| GET | `/api/genres` | — | `{genres: [...]}` |
| POST | `/api/events` | `{eventType, artistId}` | `{message, job_count}` |
| GET | `/api/artists/<id>/discussions` | `page`, `per_page` | `{discussions, total, page, pages}` |
| GET | `/api/discussions/<id>/posts` | `page`, `per_page` | `{posts, total, page, pages, discussion}` |

### API Response Shape (Artist)

The backend `to_dict()` returns **camelCase** fields to match the frontend `Artist` interface:
```json
{
  "id": "1",
  "name": "Luna Rivera",
  "image": "https://...",
  "bio": "...",
  "activityScore": 9.4,
  "discussionCount": 247,
  "latestThread": { "id": "1", "title": "...", "timestamp": "2 hours ago" },
  "genres": ["Pop", "Electronic", "Indie"]
}
```

### Key Differences from Prototype

- No `DevControlsContext` or DevControls panel
- No mock artist data — live API replaces in-memory filtering
- `mockData.ts` retained only for the `Artist` interface and static `genres`/`timeRanges` constants
- `DiscoveryPage` uses `useQuery` instead of `useState` + `useMemo` + setTimeout
- Vite proxy handles CORS — no CORS config needed on the frontend

### Theming

Same as prototype: dark mode via `.dark` class on `<html>`, CSS custom properties in `theme.css`.
Primary accent: `#5b9dd9` (Crescendo blue).

## Session Chatlog

Each coding session appends to `chatlog.txt` in the project root. The file is created if it
does not exist. Each entry records:

```
PROMPT:
<the user's prompt verbatim>

RESPONSE:
<summary of what was done>
```

Entries are separated by `---` dividers under a `SESSION LOG` header. Always append — never overwrite.
