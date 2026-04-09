# Crescendo Integration Test Specification

This document describes every code pathway that requires the execution of **both** frontend
and backend code together. Each pathway is listed as a plain-English sentence that a test
must verify.

---

## 1. Discovery Page — Artist Feed

**1.1 Load default artist list**
When the user opens the Discovery page, the frontend calls `GET /api/artists` and renders
the returned artist cards (name, image, genre tags) on screen.

**1.2 Filter by genre**
When the user clicks a genre chip, the frontend appends `?genre=<name>` to the artists
request and only the matching artists are displayed.

**1.3 Filter by "Active Discussions"**
When the user toggles "Active Discussions", the frontend appends `?active_discussions=true`
and only artists whose activity score ≥ 8.5 are shown.

**1.4 Sort by "Most Recent"**
Switching the sort control to "Most Recent" re-fetches artists sorted by discussion count
descending and the first card changes accordingly.

**1.5 Stats banner**
The Discovery page also calls `GET /api/stats` and the returned counts (artists, discussions,
posts) appear in the statistics strip at the top of the page.

**1.6 Trigger event from Discovery page**
Clicking the "Trending" trigger button on an artist card fires `POST /api/events` with the
artist ID and event type; a 200 response causes a success toast to appear.

---

## 2. Artist Page — Profile & Discussions

**2.1 Load artist profile**
Navigating to `/artists/<id>` causes the frontend to call `GET /api/artists/<id>` and
render the artist name, image, genre tags, and biography.

**2.2 Load discussion list**
After loading the artist profile, the page calls `GET /api/artists/<id>/discussions` and
renders the list of discussion threads beneath the profile.

**2.3 Open a discussion thread and load posts**
Clicking a discussion card calls `GET /api/discussions/<id>/posts` and renders the post
bodies in chronological order.

**2.4 Submit a new post (anonymous)**
When the user types a comment in the text area and clicks "Post", the frontend sends
`POST /api/discussions/<id>/posts` with `{ body, displayName, handle }`. The new post
appears in the thread immediately without a page reload.

---

## 3. Authentication

**3.1 Register a new account**
Submitting the Join form calls `POST /api/auth/register`; on success the user's display
name appears in the header and the modal closes.

**3.2 Sign in with valid credentials**
Submitting the Sign In form calls `POST /api/auth/login`; on success the user's display
name appears in the header.

**3.3 Sign in with wrong password returns error**
Submitting the Sign In form with an incorrect password receives a 401 from
`POST /api/auth/login` and an error message is displayed in the modal.

**3.4 Session persists after navigation**
After signing in, navigating to another page still shows the user's display name (the
frontend calls `GET /api/auth/me` on mount and restores the session).

**3.5 Sign out**
Clicking "Sign out" calls `POST /api/auth/logout`; the header reverts to the "Sign In /
Join" buttons.

**3.6 Authenticated post uses session user**
After signing in, posting a comment in a discussion thread does not prompt for a display
name or handle — the backend uses the server-side session to identify the author.

---

## 4. Best Albums Page

**4.1 Default album list**
The Best Albums page calls `GET /api/albums` and renders album cards with title, artist,
and user score.

**4.2 Filter by year**
Selecting a year filter (e.g. "2026") re-fetches with `?time_range=2026` and only albums
from that release year are shown.

**4.3 Filter by genre**
Selecting a genre filter appends `?genre=<name>` and only albums of that genre appear.

**4.4 Sort by critic score**
Switching to "Critic Score" re-fetches with `?sort=critic_score`; the album order
matches the backend's critic score ranking.

---

## 5. New Releases Page

**5.1 Upcoming releases**
The New Releases page calls `GET /api/albums?time_range=upcoming` (or similar) and
shows albums whose release date is in the future.

**5.2 Recent releases this week**
Filtering to "This Week" re-fetches with `?time_range=this-week` and only albums
released in the past 7 days appear.

---

## 6. Genres Page

**6.1 Genre grid loads**
The Genres page calls `GET /api/albums/genres` and renders a card for each genre with
the album count and average score.

**6.2 Genre card links to filtered Best Albums**
Clicking a genre card navigates to the Best Albums page pre-filtered to that genre and
the artist/album count reflects the filter.

---

## 7. Community (Discussions) Page

**7.1 All discussions load**
The Community page calls `GET /api/discussions` and renders the most-recently-active
threads across all artists.

**7.2 Sort by popularity**
Switching to "Popular" re-fetches with `?sort=popular` and the first thread has the
highest post count.

---

## 8. Lists Page

**8.1 Lists index loads**
The Lists page calls `GET /api/lists` and renders all user-created album lists.

**8.2 Open a list and see its albums**
Clicking a list card navigates to `/lists/<id>`, which calls `GET /api/lists/<id>` and
renders the albums in that list.

**8.3 Create a new list (requires auth)**
When logged in, submitting the "Create List" modal calls `POST /api/lists` with `{ title,
description }` and the new list appears in the index immediately.

**8.4 Add an album to a list**
Opening the "Add Album" modal, searching for an album, and confirming calls
`POST /api/lists/<id>/albums`; the album appears in the list detail view.

**8.5 Remove an album from a list**
Clicking the remove button next to an album in the list detail view calls
`DELETE /api/lists/<id>/albums/<album_id>` and the album disappears from the list.

---

## 9. Search

**9.1 Search returns artists and albums**
Typing at least 2 characters in the search bar triggers `GET /api/search?q=<query>`
(debounced 300 ms) and the dropdown shows matching artists and albums.

**9.2 Clicking a search result navigates to the correct page**
Clicking an artist result navigates to `/artists/<id>`; clicking an album result also
navigates to the artist page for that album's artist.

**9.3 Short queries (< 2 chars) are not sent**
Typing a single character produces no network request to `/api/search` and the dropdown
stays closed.

---

## Environment Notes

Tests marked **[LOCAL ONLY]** require both the Vite dev server (`npm run dev`) and the
Flask server (`python run.py`) running locally.

Tests marked **[DEPLOYED]** verify the same pathways against the live AWS infrastructure:
- Frontend: `https://main.d291kg32gzfrfc.amplifyapp.com`
- Backend: `https://ue039qft5b.execute-api.us-east-1.amazonaws.com/prod`

All other tests can run in both environments by switching the `BASE_URL` environment
variable.
