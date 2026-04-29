# Crescendo

A full-stack music discovery platform with AI-powered community discussions. Users can browse artists and albums, post in discussion threads, and curate personal lists. Synthetic bot personas (powered by Claude Haiku) automatically seed and respond to discussions to simulate organic fan activity — all transparently labeled.

---

## Using the Live App

The app is publicly deployed and requires no installation:

**Frontend (React):** [https://main.d291kg32gzfrfc.amplifyapp.com](https://main.d291kg32gzfrfc.amplifyapp.com)

Open that URL in any modern browser. From there you can:

- **Browse artists** on the Discovery page — filter by genre, sort by activity or name, search by keyword.
- **View an artist** — click any card to see the artist's bio, albums, and discussion threads.
- **Read discussions** — click a thread title to see all posts, including AI bot replies (labeled **BOT**).
- **Post a comment** — log in (or register a free account) and reply to any discussion.
- **Trigger AI activity** — on any artist page, click **Trigger LLM Activity** to schedule 1–5 bot personas to post Claude-generated replies within the next two minutes.
- **Curate lists** — create and manage personal album lists from the Lists page.

> The backend API runs on AWS Lambda behind a function URL. Requests from the frontend go directly to Lambda; no separate backend URL is needed.

---

## Production Runtime Notes

- Debug API routes (`/api/debug/*`) are disabled by default and are never registered when running on AWS Lambda.
- Session-backed auth requires cross-site cookie settings when frontend and API are on different domains:
  - `SESSION_COOKIE_SECURE=true`
  - `SESSION_COOKIE_SAMESITE=None`
  - `CORS_ORIGINS=https://<your-frontend-domain>`
- The production frontend should set `VITE_API_BASE` to the deployed API URL.
- **Database seeding:** `backend/run.py` runs `db.create_all()` then `seed()` on every process start (local dev or any host that uses `run.py` as the entrypoint). The **Lambda** handler (`lambda_handler.py`) only calls `create_app()` — it does **not** run `seed()` unless you add that yourself. For RDS, run migrations / initial seed explicitly (e.g. one-off job or container that executes `run.py` once) if you rely on seeded content in production.
- **Synthetic catalog (optional on RDS):** In local dev, `seed()` pads album count toward **500** with idempotent `Crescendo Catalog #…` rows and adds **Spotlight — …** filter-demo albums once. **On AWS/Lambda (production), synthetic catalog padding defaults to off** to avoid placeholder titles in the UI. Tune with `SEED_CATALOG_TARGET` / `SEED_SPOTLIGHT_ALBUMS` (see [Environment variables reference](#5-environment-variables-reference)).

---

## Running Tests Locally

### Backend Tests

The backend test suite uses **pytest** with **pytest-cov** for coverage. Tests run against an in-memory SQLite database, so **no PostgreSQL or Anthropic API key is needed** to run tests.

**Frameworks and libraries required:**

| Library | Purpose |
|---------|---------|
| **Python 3.10+** | Runtime |
| **pytest** | Test runner and assertion framework |
| **pytest-cov** | Coverage reporting plugin for pytest |
| **pytest-mock** | Mock/patch utilities (included in requirements.txt) |

All test dependencies are listed in `backend/requirements.txt`.

**Setup and run:**

```bash
# 1. Create and activate a virtual environment
cd backend
python3 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

# 2. Install all dependencies (includes pytest and pytest-mock)
pip install -r requirements.txt

# 3. Run the tests with coverage
python -m pytest ../tests/ -v --cov=app.models --cov=app.routes --cov-report=term-missing
```

Or, from the project root using npm:

```bash
npm run setup   # one-time: creates venv and installs deps
npm test        # runs pytest with coverage
```

**What you should see:**

- All tests passing
- `models.py` and `routes.py` at high coverage (exact percentages may drift as the project evolves)

**Test file locations:**

| File | Tests | What it covers |
|------|-------|----------------|
| `tests/conftest.py` | — | Shared fixtures: in-memory SQLite DB, mock APScheduler, factory helpers, auto-cleanup |
| `tests/test_models.py` | (varies) | All `to_dict()` methods on Artist, User, Discussion, Post, Album, and List models |
| `tests/test_routes.py` | (varies) | Route handlers in `routes.py` — filtering, pagination, error handling, bot flair, dedup, search |

Note: legacy test files previously located under `backend/testing/` and `backend/tests/` have been removed; the canonical test suite now lives in the top-level `tests/` directory. Run the full backend test suite from the project root with:

```bash
pytest -q tests --disable-warnings
```

### Frontend Tests

The frontend uses **Jest** with **React Testing Library** for unit and component tests. Tests are written in TypeScript and run in a simulated browser environment (jsdom). No running backend or database is needed.

**Frameworks and libraries required:**

| Library | Purpose |
|---------|---------|
| **Node.js 20+** | Runtime |
| **npm** | Package manager |
| **Jest 30** | Test runner |
| **jest-environment-jsdom** | Simulated browser DOM for component tests |
| **babel-jest** | Transpiles TypeScript/TSX for Jest via Babel |
| **@babel/preset-env** | Babel preset for modern JavaScript |
| **@babel/preset-react** | Babel preset for JSX |
| **@babel/preset-typescript** | Babel preset for TypeScript |
| **@testing-library/react** | React component rendering and interaction utilities |
| **@testing-library/jest-dom** | Custom Jest matchers for DOM assertions |

All of these are listed as `devDependencies` in `frontend/package.json` and are installed automatically by `npm install`. No separate install step is needed.

**Setup and run:**

```bash
# 1. Install dependencies (skip if already done)
cd frontend
npm install

# 2. Run the Jest test suite
npm test
```

**What you should see:**

- Jest output showing results for `DiscoveryPage.test.tsx` and `ArtistPage.test.tsx`
- A coverage summary for `DiscoveryPage.tsx` and `ArtistPage.tsx`

**Test file locations:**

| File | What it covers |
|------|----------------|
| `tests/DiscoveryPage.test.tsx` | Discovery page component — rendering, filtering, API integration |
| `tests/ArtistPage.test.tsx` | Artist page component — hero section, discussions, trigger button |

Configuration files (all in `frontend/`):
- `jest.config.cjs` — test environment, transforms, module aliases, coverage targets
- `babel.config.cjs` — Babel presets used by `babel-jest`
- `jest.setup.ts` — global setup: imports `@testing-library/jest-dom` matchers and polyfills `TextEncoder`/`TextDecoder`

### Continuous Integration

The single GitHub Actions workflow, `.github/workflows/ci-cd.yml`, runs on every push and pull request to `main`.
Pull requests run test jobs only. Pushes to `main` run the test jobs first, then the deployment jobs.

| Job | When | What it does |
|-----|------|--------------|
| **Backend Tests** | Pushes and PRs to `main` | Python 3.12, installs backend deps, runs pytest with coverage |
| **Frontend Tests** | Pushes and PRs to `main` | Node 20, installs frontend deps, runs `npm run build`, then `npm test` |
| **Integration Tests** | Pushes and PRs to `main` | Starts Postgres, Flask, and Vite, then runs Playwright |
| **Deploy Backend to AWS Lambda** | Pushes to `main` only, after backend + integration tests pass | Packages `backend/` and calls `aws lambda update-function-code` for `crescendo-api` |
| **Deploy Frontend to AWS Amplify** | Pushes to `main` only, after frontend + integration tests pass | Builds the frontend, then waits for the Amplify `main` branch job to finish |

View CI results at the [Actions tab](../../actions) on GitHub.

---

## Dependencies
 
### Backend (Python)
 
Every Python package the backend requires is listed in `backend/requirements.txt`. The key dependencies and their roles:
 
| Package | Role |
|---------|------|
| **Flask** | Web framework — handles HTTP routing, request/response lifecycle, and the development server |
| **Flask-SQLAlchemy** | ORM integration — provides SQLAlchemy bindings for Flask, used for all database models and queries |
| **Flask-CORS** | Cross-origin resource sharing — allows the Vite frontend (port 5173) to call the Flask API (port 5001) |
| **psycopg2-binary** | PostgreSQL adapter — the low-level driver that SQLAlchemy uses to connect to Postgres |
| **python-dotenv** | Environment loading — reads `backend/.env` into `os.environ` at startup |
| **anthropic** | Anthropic Python SDK — used by `llm_service.py` to call Claude Haiku for bot comment generation |
| **APScheduler** | Background scheduler — runs staggered bot comment jobs at randomized future times, with a SQLAlchemy-backed persistent job store |
 
### Frontend (Node.js)
 
Frontend packages are managed via `frontend/package.json`. The key dependencies:
 
| Package | Role |
|---------|------|
| **React 18** | UI framework — component-based rendering for all pages |
| **TypeScript** | Type safety — enforces types on API responses, props, and state |
| **Vite 6** | Build tool and dev server — serves the frontend on port 5173 and proxies `/api/*` to the Flask backend |
| **React Router 7** | Client-side routing — maps URLs to page components (`/`, `/artists/:id`, `/discussions/:id`) |
| **TanStack React Query 5** | Data fetching and caching — manages API calls, polling (8-second intervals), and cache invalidation |
| **Tailwind CSS v4** | Utility-first styling — all layout and visual design |
| **Radix UI** | Accessible UI primitives — headless components wrapped as shadcn-style building blocks |
 
### External Services
 
| Service | Required? | Role |
|---------|-----------|------|
| **PostgreSQL** | Yes | The sole database. All application data is stored here |
| **Anthropic API** (Claude Haiku) | For LLM features | Generates bot comments when "Trigger LLM Activity" is clicked. The app starts and serves non-LLM features without this key, but the trigger button and bot replies will fail |

## Data storage

This application uses **one primary database**: a **local PostgreSQL** instance named `crescendo_p4`. There is no multi-database or read-replica setup.

| Concern | Detail |
|--------|--------|
| **Create** | You create the empty database with `createdb` (or `CREATE DATABASE` in `psql`). The app creates tables via SQLAlchemy (`db.create_all()`) when you run `python run.py`. |
| **Read / write** | All API and background jobs read and write to the database named in `DATABASE_URL` — a single connection string in `backend/.env`. |
| **Configuration** | Per-machine: each developer or environment uses its own `backend/.env` pointing at a local Postgres (or any Postgres you control). |

If you see inconsistent data or schema issues, use [Resetting the database](#resetting-the-database) below to drop and recreate `crescendo_p4`; `python run.py` will recreate tables and reseed.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Flask + Flask-SQLAlchemy + Flask-CORS |
| Database | PostgreSQL |
| AI | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) |
| Scheduler | APScheduler |
| Frontend | React 18 + TypeScript + Vite 6 |
| Styling | Tailwind CSS v4 |
| Routing | React Router 7 |
| Data Fetching | TanStack React Query 5 |
| UI Primitives | Radix UI |

---

## Prerequisites

On a **new machine**, install the following before the app will run.

| Requirement | Notes |
|---------------|--------|
| **PostgreSQL** | Install and ensure the server is running. Have a Postgres username and password ready if your install requires them (needed for `createdb` and for `DATABASE_URL`). [postgresql.org/download](https://www.postgresql.org/download/) |
| **Python 3.10 or higher** | [python.org](https://www.python.org/downloads/) |
| **Node.js 18+** | For the frontend dev server. [nodejs.org](https://nodejs.org/) |
| **Anthropic API key** | Required for LLM-driven features (e.g. “Trigger LLM Activity”). [console.anthropic.com](https://console.anthropic.com/) |

Verify:

```bash
python3 --version   # 3.10+
node --version
psql --version
```

---

## Operations quick reference (SRE / new engineer)

Use this checklist for **install**, **startup**, **stop**, and **reset**.

### First-time install

1. Clone the repo (see [Clone the repository](#1-clone-the-repository)).
2. Create the database (Postgres user must be able to connect):

   ```bash
   createdb crescendo_p4
   ```

3. **Backend** — from the `backend` directory:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

   Create `backend/.env` (see [Backend environment file](#2d-create-the-environment-file)).

4. **Frontend** — from the `frontend` directory:

   ```bash
   npm install
   ```

### Start services (typical local test)

Run **two terminals**: backend first, then frontend.

**Terminal 1 — backend** (from `backend`):

```bash
source .venv/bin/activate
pip install -r requirements.txt   # omit if dependencies unchanged
python run.py
```

Server listens on **http://localhost:5001**.

**Terminal 2 — frontend** (from `frontend`):

```bash
npm install   # omit if node_modules is current
npm run dev
```

App URL: **http://localhost:5173** (Vite proxies `/api/*` to the backend).

### Start backend in production-like mode (recommended for release smoke tests)

This runs the backend **the same way AWS Lambda does** (via `create_app()`), meaning:
- **No automatic `seed()`**
- **No APScheduler** (Lambda mode)
- Debug routes are not registered

1. Configure env (copy the template and edit):

```bash
cp backend/.env.production.local.example backend/.env
```

2. Start the backend (from `backend/`):

```bash
source .venv/bin/activate
python run_lambda_local.py
```

Then start the frontend as usual with `npm run dev`.

### Stop services

- In each terminal where a server is running, press **Ctrl+C** to stop that process.
- There is no separate daemon or supervisor in local dev; stopping the terminal process is sufficient.

### Reset database and data

If the database is in a bad state, wipe it and let the app recreate schema + seed:

```bash
cd backend
source .venv/bin/activate
dropdb crescendo_p4
createdb crescendo_p4
python run.py
```

`python run.py` runs `db.create_all()` and the seed routine on startup.

---

## 1. Clone the Repository

```bash
git clone https://github.com/Crescendo-CS485/P4-backend-implementation.git
cd P4-backend-implementation
```

---

## 2. Backend Setup

### 2a. Create and activate a virtual environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows
```

### 2b. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2c. Create the PostgreSQL database

```bash
createdb crescendo_p4
```

> If `createdb` is not found, ensure the PostgreSQL bin directory is on your `PATH`, or run the equivalent SQL:
> ```sql
> CREATE DATABASE crescendo_p4;
> ```

### 2d. Create the environment file

Create `backend/.env` with at least:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/crescendo_p4
ANTHROPIC_API_KEY=your_anthropic_api_key_here
SECRET_KEY=any_random_secret_string
```

- `DATABASE_URL` — **Required.** Full PostgreSQL URL for the `crescendo_p4` database. Replace `USER`, `PASSWORD`, and `HOST` (often `localhost`). Example for local default peer auth: `postgresql://localhost/crescendo_p4` (see `backend/config.py` default).
- `ANTHROPIC_API_KEY` — **Required for LLM features** (e.g. trigger button / bot replies). Get a key at [console.anthropic.com](https://console.anthropic.com/).
- `SECRET_KEY` — Used to sign Flask sessions. Can be any non-empty string for local dev; if omitted, a development default is used (see `config.py`).

### 2e. Start the backend

```bash
source .venv/bin/activate   # if not already active
python run.py
```

On first run, `run.py` will:
1. Create all database tables via SQLAlchemy
2. Run `seed()`: **24** curated artists, **67** curated albums, **4** bot personas with discussions/posts, **3** lists; then pad total albums toward **`SEED_CATALOG_TARGET`** (default **500**) with synthetic catalog rows, then idempotent **Spotlight — …** albums for UI time/year/genre filters
3. Start the Flask development server on **http://localhost:5001**

You should see log lines similar to:

```
Seeded 24 artists.
Seeded 4 bot personas and discussions for 24 artists.
Seeded 67 albums.
Added … catalog albums (target total 500).
Added … spotlight demo albums for time/year/genre filters.   # or "already present, skipping"
Seeded 3 lists.
 * Running on http://127.0.0.1:5001
```

> **Idempotency:** Curated artists, bots, the 67 hand-picked albums, and lists insert once and are skipped on later runs. Catalog padding runs only while album count is below the target. Spotlight albums are skipped if their fixed titles already exist. Synthetic catalog titles use the next free `Crescendo Catalog #` suffix so partial deletes do not create duplicate titles.

---

## 3. Frontend Setup

Open a **new terminal tab** and leave the backend running.

### 3a. Install Node dependencies

```bash
cd frontend
npm install
```

### 3b. Start the development server

```bash
npm run dev
```

The frontend runs on **http://localhost:5173**.

Vite is configured to proxy all `/api/*` requests to the backend at `http://localhost:5001`, so no additional CORS configuration is needed.

---

## 4. Open the App

With both servers running, open your browser to:

```
http://localhost:5173
```

You should see the Crescendo discovery page populated with real artists and albums.

---

## 5. Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string for the single app database (`crescendo_p4`) |
| `ANTHROPIC_API_KEY` | For LLM features | Anthropic API key for Claude Haiku (trigger / bot activity) |
| `SECRET_KEY` | Recommended | Flask session signing key (defaults in `config.py` if omitted) |
| `SEED_CATALOG_TARGET` | No | Default **`500`** in local/dev, **`0`** on AWS/Lambda/production. Max total albums after synthetic padding when `seed()` runs. Set **`0`** to skip synthetic **Crescendo Catalog** rows (curated + spotlight unchanged unless disabled below). |
| `SEED_SPOTLIGHT_ALBUMS` | No | Default **`true`** in local/dev, **`false`** on AWS/Lambda/production. Set **`false`** to skip idempotent **Spotlight — …** demo albums. |
| `CORS_ORIGINS` | Production | Comma-separated allowed browser origins for credentialed API calls (see [Production Runtime Notes](#production-runtime-notes)). |
| `SESSION_COOKIE_SECURE` / `SESSION_COOKIE_SAMESITE` | Production | Set when API and frontend are on different sites (see above). |

### Readiness checklist (local or release)

- [ ] `DATABASE_URL` points at the intended database; schema exists (`python run.py` once from `backend/`, or your migration process).
- [ ] For production: `CORS_ORIGINS`, `SESSION_COOKIE_*`, and frontend `VITE_API_BASE` (or build-time API URL) match the deployed domains.
- [ ] Decide **`SEED_CATALOG_TARGET`** / **`SEED_SPOTLIGHT_ALBUMS`** for RDS (defaults add synthetic catalog + spotlight when `run.py` runs `seed()`).
- [ ] `pytest` / `npm test` pass before tagging or merging.
- [ ] Lambda: confirm whether you rely on **manual/one-off seed** vs extending the handler to call `seed()` (see [Production Runtime Notes](#production-runtime-notes)).

---

## 6. Resetting the database

To drop all data and fully reseed from scratch:

```bash
cd backend
source .venv/bin/activate
dropdb crescendo_p4
createdb crescendo_p4
python run.py
```

---

## 7. API Overview

The backend exposes a REST API under `/api`. Key endpoints:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/artists` | Paginated artist list (filter by genre, sort, active discussions) |
| GET | `/api/artists/:id` | Single artist detail |
| GET | `/api/genres` | All genres |
| GET | `/api/albums` | Paginated album list (filter by genre, type, time range) |
| GET | `/api/albums/genres` | Genres with album counts and cover images |
| GET | `/api/discussions` | All discussions (sort: recent or popular) |
| GET | `/api/artists/:id/discussions` | Discussions for a specific artist |
| GET | `/api/discussions/:id/posts` | Posts within a discussion |
| POST | `/api/discussions/:id/posts` | Submit a new post |
| POST | `/api/events` | Trigger AI bot activity for an artist |
| GET | `/api/search?q=` | Search artists and albums (min 2 chars) |
| GET | `/api/stats` | Platform-wide stats |
| GET | `/api/lists` | All curated lists |
| POST | `/api/lists` | Create a new list |
| GET | `/api/lists/:id` | List detail with albums |
| POST | `/api/auth/register` | Register a new account |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Get the current session user |

---

## 8. How AI Bot Discussions Work

Crescendo uses Claude Haiku to simulate organic fan activity in artist discussions. The system is fully transparent — all bot posts are labeled with a **BOT** badge in the UI.

**Flow:**
1. A user visits an artist page and clicks "Trigger LLM Activity" (or posts a comment).
2. The backend schedules 1–5 bot personas to respond, each with a randomized delay (10–120 seconds).
3. APScheduler fires each job at the scheduled time.
4. Claude Haiku generates a 1–3 sentence comment based on the discussion context and the bot's unique engagement style.
5. The post is saved to the database and appears in the discussion feed within the next 8-second poll cycle.

---

## 9. Project Structure

```
P4 Crescendo/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Flask app factory
│   │   ├── models.py            # SQLAlchemy models (Artist, Album, User, Discussion, Post, List, ...)
│   │   ├── routes.py            # Main API routes
│   │   ├── auth_routes.py       # Auth endpoints
│   │   ├── list_routes.py       # List endpoints
│   │   ├── scheduler.py         # APScheduler singleton
│   │   └── seed.py              # Idempotent seed: artists, albums, bots, lists, catalog pad, spotlight
│   │   └── services/
│   │       ├── llm_service.py           # Claude Haiku API calls
│   │       ├── llm_worker.py            # Job execution logic
│   │       ├── trigger_handler.py       # Event deduplication + dispatch
│   │       ├── stagger_scheduler.py     # Random-offset job scheduling
│   │       └── activity_aggregation.py  # Artist activity score updates
│   ├── config.py                # Config from .env
│   ├── requirements.txt
│   └── run.py                   # Entry point
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── components/      # Reusable UI components
    │   │   ├── context/         # AuthContext
    │   │   ├── pages/           # Page components (Discovery, Artist, Discussion, ...)
    │   │   └── routes.ts        # Route definitions
    │   ├── styles/              # Tailwind + custom CSS
    │   └── main.tsx             # App entry point
    ├── vite.config.ts           # Vite config + /api proxy
    └── package.json
```

---

## Deploying to AWS (Fork Setup)

If you fork this repo you can run the same CI/CD pipeline against your own AWS account. The pipeline is defined in one workflow file: `.github/workflows/ci-cd.yml`.

On pull requests, the workflow runs tests only. On pushes to `main`, it runs tests and then starts two deployment jobs:

| Job | What it does |
|-----|--------------|
| **Deploy Backend to AWS Lambda** | Installs backend dependencies into a package directory, copies the Flask app and Lambda handler, zips the package, and calls `aws lambda update-function-code` |
| **Deploy Frontend to AWS Amplify** | Runs the frontend build in Actions, then waits for Amplify's auto-triggered branch deployment to finish |

The current workflow targets Lambda function `crescendo-api` and Amplify app ID `d291kg32gzfrfc`. If you fork the repo, update those values in `.github/workflows/ci-cd.yml` for your AWS account.

The steps below are written for the **AWS Management Console**. If you prefer the command line, expand the CLI Quickstart below — it covers the same setup and push flow using only the AWS CLI and GitHub CLI.

<details>
<summary><strong>CLI Quickstart — AWS CLI + GitHub CLI alternative</strong></summary>

**Prerequisites:**
- AWS CLI v2 installed and configured with admin credentials: `aws configure`
- GitHub CLI installed and authenticated: `gh auth login`
- Set these shell variables once — they are reused throughout every command below:

```bash
REGION=us-east-1
FUNCTION_NAME=crescendo-api        # must match .github/workflows/ci-cd.yml
REPO=YOUR_ORG/YOUR_REPO            # e.g. Crescendo-CS485/P6-Crescendo
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

---

#### CLI Step 1 — Create RDS PostgreSQL

```bash
# Security group — allow Postgres inbound (restrict to specific IPs in production)
SG_ID=$(aws ec2 create-security-group \
  --group-name crescendo-rds-sg \
  --description "Crescendo RDS access" \
  --query GroupId --output text --region $REGION)

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID --protocol tcp --port 5432 \
  --cidr 0.0.0.0/0 --region $REGION

# Create the instance (takes ~5 minutes)
aws rds create-db-instance \
  --db-instance-identifier crescendo-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username adminuser \
  --master-user-password 'YOUR_DB_PASSWORD' \
  --allocated-storage 20 \
  --publicly-accessible \
  --vpc-security-group-ids $SG_ID \
  --region $REGION

aws rds wait db-instance-available \
  --db-instance-identifier crescendo-db --region $REGION

RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier crescendo-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text --region $REGION)

echo "RDS endpoint: $RDS_ENDPOINT"

# Create the empty database
psql -h $RDS_ENDPOINT -U adminuser \
  -c "CREATE DATABASE crescendo_p4;"
```

---

#### CLI Step 2 — Create the Lambda function

```bash
# Execution role Lambda needs to write CloudWatch logs
aws iam create-role \
  --role-name crescendo-lambda-role \
  --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy \
  --role-name crescendo-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Placeholder ZIP — the CD workflow overwrites this on first push
mkdir -p /tmp/crescendo-placeholder
echo 'def handler(e, c): return {"statusCode": 200}' \
  > /tmp/crescendo-placeholder/lambda_handler.py
cd /tmp/crescendo-placeholder && zip /tmp/placeholder.zip lambda_handler.py && cd -

# Create the function
aws lambda create-function \
  --function-name $FUNCTION_NAME \
  --runtime python3.12 \
  --role arn:aws:iam::${ACCOUNT_ID}:role/crescendo-lambda-role \
  --handler lambda_handler.handler \
  --zip-file fileb:///tmp/placeholder.zip \
  --timeout 30 \
  --region $REGION

aws lambda wait function-active \
  --function-name $FUNCTION_NAME --region $REGION

# Set environment variables
aws lambda update-function-configuration \
  --function-name $FUNCTION_NAME \
  --environment "Variables={\
DATABASE_URL=postgresql://adminuser:YOUR_DB_PASSWORD@${RDS_ENDPOINT}:5432/crescendo_p4,\
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_KEY,\
SECRET_KEY=replace-with-a-long-random-string}" \
  --region $REGION

# Create a public function URL and allow unauthenticated invocations
aws lambda create-function-url-config \
  --function-name $FUNCTION_NAME \
  --auth-type NONE --region $REGION

aws lambda add-permission \
  --function-name $FUNCTION_NAME \
  --statement-id AllowPublicFunctionUrl \
  --action lambda:InvokeFunctionUrl \
  --principal '*' \
  --function-url-auth-type NONE \
  --region $REGION

# Print the URL — set the frontend VITE_API_BASE value to this URL
aws lambda get-function-url-config \
  --function-name $FUNCTION_NAME \
  --query FunctionUrl --output text --region $REGION
```

---

#### CLI Step 3 — Create the Amplify app

Amplify's automated GitHub integration requires a GitHub Personal Access Token with `repo` scope.
Generate one at [github.com/settings/tokens](https://github.com/settings/tokens), then:

```bash
AMPLIFY_APP_ID=$(aws amplify create-app \
  --name crescendo-frontend \
  --repository https://github.com/$REPO \
  --access-token YOUR_GITHUB_PAT \
  --query 'app.appId' --output text --region $REGION)

aws amplify create-branch \
  --app-id $AMPLIFY_APP_ID \
  --branch-name main --region $REGION

echo "Amplify App ID: $AMPLIFY_APP_ID"

# Patch the workflow file with your App ID and Lambda tag ARN
# macOS:
sed -i '' "s/d291kg32gzfrfc/$AMPLIFY_APP_ID/g" \
  .github/workflows/ci-cd.yml
sed -i '' "s|arn:aws:lambda:us-east-1:940482408601:function:crescendo-api|arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}|g" \
  .github/workflows/ci-cd.yml
# Linux:
# sed -i "s/d291kg32gzfrfc/$AMPLIFY_APP_ID/g" \
#   .github/workflows/ci-cd.yml
# sed -i "s|arn:aws:lambda:us-east-1:940482408601:function:crescendo-api|arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}|g" \
#   .github/workflows/ci-cd.yml

git add .github/workflows/ci-cd.yml
git commit -m "chore: set AWS deployment identifiers for fork"
```

---

#### CLI Step 4 — Create the IAM deploy user

```bash
aws iam create-user --user-name crescendo-github-actions

cat > /tmp/deploy-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaDeploy",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:TagResource"
      ],
      "Resource": "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
    },
    {
      "Sid": "AmplifyDeploy",
      "Effect": "Allow",
      "Action": [
        "amplify:StartJob",
        "amplify:ListJobs",
        "amplify:GetJob"
      ],
      "Resource": [
        "arn:aws:amplify:${REGION}:${ACCOUNT_ID}:apps/${AMPLIFY_APP_ID}/branches/main",
        "arn:aws:amplify:${REGION}:${ACCOUNT_ID}:apps/${AMPLIFY_APP_ID}/branches/main/jobs/*"
      ]
    }
  ]
}
EOF

aws iam put-user-policy \
  --user-name crescendo-github-actions \
  --policy-name CrescendoDeploy \
  --policy-document file:///tmp/deploy-policy.json

# Create the access key — the secret is shown once, save it immediately
aws iam create-access-key --user-name crescendo-github-actions
```

---

#### CLI Step 5 — Store secrets with the GitHub CLI

```bash
# gh prompts for the value securely (no value appears in shell history)
gh secret set AWS_ACCESS_KEY_ID     --repo $REPO
gh secret set AWS_SECRET_ACCESS_KEY --repo $REPO
gh secret set AWS_REGION --body "$REGION" --repo $REPO
```

---

#### CLI Step 6 — Push and watch

```bash
git push origin main

# Stream live workflow logs in your terminal
gh run watch --repo $REPO
```

</details>

### Step 1 — Create a PostgreSQL database

Lambda needs a persistent database. The simplest option is **Amazon RDS** (Postgres engine):

1. In the AWS console open **RDS → Create database**.
2. Choose **PostgreSQL**, Free Tier template.
3. Note the **endpoint**, **port** (5432), **username**, and **password** you set.
4. In the security group, allow inbound TCP 5432 from the Lambda function's VPC (or from `0.0.0.0/0` for a quick test).

Your `DATABASE_URL` will be:
```
postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/crescendo_p4
```

Create the empty database once:
```bash
psql -h RDS_ENDPOINT -U USER -c "CREATE DATABASE crescendo_p4;"
```

Tables and seed data are **not** created by Lambda cold start alone. Use **`python run.py`** (or an equivalent one-off/migration step) against RDS when you want `create_all` + `seed()`, or manage schema with Alembic/migrations and insert data separately.

### Step 2 — Create the Lambda function (backend)

1. In the AWS console open **Lambda → Create function**.
2. Choose **Author from scratch**.
   - **Function name**: `crescendo-api` (or any name — update the workflow file to match).
   - **Runtime**: Python 3.12.
   - **Architecture**: x86_64.
3. After creation, go to **Configuration → Environment variables** and add:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | `postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/crescendo_p4` |
   | `ANTHROPIC_API_KEY` | Your key from [console.anthropic.com](https://console.anthropic.com/) |
   | `SECRET_KEY` | Any long random string |
   | `SEED_CATALOG_TARGET` (optional) | `500` (default) or `0` to skip synthetic catalog padding |
   | `SEED_SPOTLIGHT_ALBUMS` (optional) | `true` (default) or `false` to skip Spotlight demo albums |

4. Under **Configuration → General configuration**, increase **Timeout** to at least **30 seconds** (large requests or cold starts).

> If you add `seed()` to Lambda startup later, allow extra time the first time the database is empty.
5. Under **Configuration → Function URL**, click **Create function URL**, auth type **NONE**. Copy the URL — this is your API base URL.
6. Update the frontend's `VITE_API_BASE` (or the Vite proxy target) to point at your function URL.

> If you rename the function from `crescendo-api`, open `.github/workflows/ci-cd.yml` and update every `crescendo-api` reference in the `deploy-lambda` job. Also update the hard-coded Lambda ARN used by the `tag-resource` step, or remove that tagging step.

### Step 3 — Create the Amplify app (frontend)

1. In the AWS console open **AWS Amplify → New app → Host web app**.
2. Connect your **forked GitHub repository**, branch `main`.
3. Amplify will detect the `amplify.yml` at the repo root and use it for the build.
4. Complete the setup. Note your **App ID** (looks like `d2xxxxxxxxx`).
5. Open `.github/workflows/ci-cd.yml` and replace the `AMPLIFY_APP_ID` value with your App ID.
6. If Amplify auto-build is disabled, keep it disabled and let GitHub Actions start each release job explicitly with `aws amplify start-job`. This avoids relying on Amplify to independently detect pushes.

### Step 4 — Create an IAM user with least-privilege access

1. In the AWS console open **IAM → Users → Create user**.
2. Name it something like `crescendo-github-actions`.
3. Attach the following inline policy (replace `YOUR_ACCOUNT_ID`, `YOUR_REGION`, `YOUR_FUNCTION_NAME`, and `YOUR_AMPLIFY_APP_ID`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaDeploy",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:TagResource"
      ],
      "Resource": "arn:aws:lambda:YOUR_REGION:YOUR_ACCOUNT_ID:function:YOUR_FUNCTION_NAME"
    },
    {
      "Sid": "AmplifyDeploy",
      "Effect": "Allow",
      "Action": [
        "amplify:StartJob",
        "amplify:ListJobs",
        "amplify:GetJob"
      ],
      "Resource": [
        "arn:aws:amplify:YOUR_REGION:YOUR_ACCOUNT_ID:apps/YOUR_AMPLIFY_APP_ID/branches/main",
        "arn:aws:amplify:YOUR_REGION:YOUR_ACCOUNT_ID:apps/YOUR_AMPLIFY_APP_ID/branches/main/jobs/*"
      ]
    }
  ]
}
```

4. Go to **Security credentials → Create access key** (use case: **Other**). Download the CSV — you will not be able to view the secret key again.

### Step 5 — Store secrets in GitHub

1. In your forked repository, go to **Settings → Secrets and variables → Actions → New repository secret**.
2. Add these three secrets:

   | Secret name | Value |
   |-------------|-------|
   | `AWS_ACCESS_KEY_ID` | Access key ID from the CSV |
   | `AWS_SECRET_ACCESS_KEY` | Secret access key from the CSV |
   | `AWS_REGION` | The region where you created Lambda and Amplify (e.g. `us-east-1`) |

### Step 6 — Push to main

With `.github/workflows/ci-cd.yml` updated for your Lambda function, Lambda tag ARN, and Amplify app ID, and with secrets in place, push any commit to `main`:

```bash
git push origin main
```

The Actions tab will show one **CI / CD** workflow with five jobs:

| Job | Expected outcome |
|-----|------------------|
| Backend Tests | pytest suite passes |
| Frontend Tests | `npm run build` + Jest passes |
| Integration Tests | Playwright E2E passes |
| Deploy Backend to AWS Lambda | ZIP uploaded, `lambda:UpdateFunctionCode` succeeds |
| Deploy Frontend to AWS Amplify | Amplify build job completes with status `SUCCEED` |

Once both deploy jobs are green, your fork is live.
