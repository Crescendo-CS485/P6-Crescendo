# Crescendo Integration Test Specification

This document describes the integration pathways covered by this specification where frontend and
backend code execute together. Each included pathway is listed as a plain-English requirement
followed by a technical test mapping.

## 1. Functional Scope

The following features are subject to integration testing to verify end-to-end data integrity and
UI state management:

- Discovery and Filtering: Verified via the Artist Feed filters and sort controls.
- Artist and Discussions: Verified through profile loading, discussion browsing, and authenticated
  post submissions.
- Authentication: Verified via registration, login validation, and session persistence across
  navigation.
- Content Discovery: Verified through the Best Albums, New Releases, and Genres pages.
- User Lists: Verified via list creation, list retrieval, and adding/removing albums for personal
  album collections.
- Global Search: Verified through debounced API queries and result navigation.
- Community Overview: Verified via discussion feed loading and community stats retrieval.

## 2. Integration Test Table

| Purpose | Test Inputs (Frontend Action) | Expected Output (Backend/UI Result) |
|---|---|---|
| Load default artist list | Open Discovery page; calls `GET /api/artists`. | Status 200; Artist cards (name, image, genre) render on screen. |
| Filter by genre | Click genre chip; appends `?genre=<name>` to request. | UI displays only artists matching the selected genre. |
| Filter by Active Discussions | Toggle switch; appends `?active_discussions=true`. | UI filters to artists with an activity score >= 8.5. |
| Sort by Most Recent | Select Most Recent; re-fetches with `?sort=recent`. | Artist cards re-order based on discussion count, with the most-discussed artists first. |
| Community stats panel | Open Community page; calls `GET /api/stats` (alongside discussions fetch). | Sidebar displays Active Artists and Community Members from the stats response. |
| Trigger event | On the Artist page, click `Trigger LLM Activity`; `POST /api/events` with `artistId` and required `eventType` (for example, `page_activation`). | Status 200; a success toast notification appears in the UI. |
| Load artist profile | Navigate to `/artists/<id>`; calls `GET /api/artists/<id>`. | Artist name, image, genre tags, and biography render correctly. |
| Load discussion list | Artist page mount; calls `GET /api/artists/<id>/discussions`. | List of discussion threads renders beneath the profile. |
| Open thread and load posts | Click discussion card; calls `GET /api/discussions/<id>/posts`. | Post bodies render in chronological order. |
| Submit post (requires sign-in) | While signed in, input post body and submit `POST /api/discussions/<id>/posts`. | Signed-out users are prompted to sign in; signed-in submissions appear without a page reload. |
| Register new account | Submit Join form; `POST /api/auth/register`. | Success: display name appears in header; modal closes. |
| Sign in (valid) | Submit Sign In form; `POST /api/auth/login`. | Success: display name appears in header; session cookie set. |
| Sign in (invalid) | Submit Sign In form with incorrect password. | 401 response; error message displayed in the login modal. |
| Session persistence | Sign in and then navigate to a different page. | `GET /api/auth/me` on mount restores the user's session in the header. |
| Sign out | Click Sign out; calls `POST /api/auth/logout`. | Header reverts to Sign In / Join guest state. |
| Authenticated post | Submit post while logged in. | `POST` uses session user; no prompt for display name/handle. |
| Default album list | Open Best Albums; calls `GET /api/albums`. | Album cards render with title, artist, and user scores. |
| Filter by year | Select year (e.g., 2026); `GET /api/albums?time_range=2026`. | UI displays only albums released in the specified year. |
| Sort by critic score | Switch sort; re-fetches with `?sort=critic_score`. | Album order matches the backend critic score ranking. |
| Upcoming releases | Open New Releases; initial request is `GET /api/albums?sort=release_date&per_page=50`, then selecting Upcoming re-fetches with `time_range=upcoming`. | Initial UI shows releases sorted by release date; Upcoming filter limits results to albums with future release dates. |
| Genre grid load | Open Genres page; calls `GET /api/albums/genres`. | Cards render for each genre with count and average score. |
| Genre card navigation | Click genre card on `/genres`; calls `GET /api/albums?genre=<name>&sort=user_score&per_page=50` without leaving the page. | Genres page updates in place to show the filtered album list for the selected genre. |
| Lists index load | Open Lists page; calls `GET /api/lists`. | All user-created album lists are rendered. |
| Create new list | Logged in; `POST /api/lists` with `{ title, description }`. | New list appears in the index immediately. |
| Add album to list | Open Add modal; `POST /api/lists/<id>/albums` with `{ albumId }`. | Selected album appears in the list detail view. |
| Remove album from list | Click remove; `DELETE /api/lists/<id>/albums/<album_id>`. | Album is removed from the list detail view. |
| Search (valid) | Type 2+ chars; `GET /api/search?q=<query>` (debounced). | Dropdown displays matching artists and albums. |
| Search navigation | Click a search result (Artist or Album). | UI navigates to the appropriate Artist page. |
| Search (short query) | Type < 2 characters in the search bar. | No network request is sent; dropdown remains closed. |

## 3. Environment Notes

- Local Testing: Requires the Vite development server (`npm run dev`) and the Flask server
  (`python run.py`) running simultaneously.
- Deployed Testing: Verified against live AWS infrastructure:
  - Frontend: `https://main.d291kg32gzfrfc.amplifyapp.com`
  - Backend: `https://ue039qft5b.execute-api.us-east-1.amazonaws.com/prod`
- Environment Switching: Tests are configured to toggle between environments using the
  `BASE_URL` environment variable.
