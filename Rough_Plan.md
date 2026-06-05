# 3-Day Plan: Build & Understand a Status Platform (StatusPulse)

**Your situation:** AWS CCP course done, terms understood, zero hands-on cloud project experience, Learner Lab only (can't build real infra). **Goal:** understand how a real status platform fits together — frontend ↔ backend ↔ APIs ↔ DB ↔ cache ↔ CI/CD ↔ cloud — well enough to contribute to `status.lilly.com`. **Time:** 4 hrs/day × 3 days.

> We are **not** building `status.lilly.com`. We're building **StatusPulse**, a clone-grade project with the *exact same architecture and tech stack*, so every concept transfers 1:1. By the end you'll have a running full-stack app on GitHub with a CI/CD pipeline, and you'll understand *why* each piece exists.

---

## The mental model first (read this before any coding)

A status platform answers one question for a whole company: **"Is service X up or down right now?"** — automatically, without anyone manually editing a page.

Here's the data's journey, mapped to your architecture diagram:

```
Monitoring tools          Backend (FastAPI)              Storage            Frontend
(Splunk, Prometheus) ──►  webhook endpoint ──► normalize ──► message bus ──► DB + cache ──► Next.js UI
                          "something happened"  "common      (SNS / queue)   (history)  (fast    (what users
                                                  format"                      + (Redis)  reads)   see)
```

Read it as a sentence: *A monitoring tool detects a problem and POSTs a webhook to FastAPI. FastAPI normalizes the payload (every tool sends a different shape) into one common format, drops it on a message bus so processing is decoupled, a listener writes it to the database (durable history) and updates the cache (fast current-state reads), and Next.js reads the cache to render the dashboard.*

**Why each piece exists — memorize these "because" statements:**

| Piece | Exists *because* |
|---|---|
| Webhook endpoint | Monitoring tools push events to us; we don't poll them. Push = real-time, no wasted polling. |
| Normalizer | Splunk, Prometheus, Datadog each send different JSON shapes. The rest of the system should only ever see ONE shape. |
| Message bus (SNS/SQS) | Decouples "receiving" from "processing." If the DB is slow or down, events queue up instead of being lost. Lets you scale receivers and processors independently. |
| Database (Postgres/Aurora) | Source of truth. Durable history ("when did service X go down last month?"). Survives restarts. |
| Cache (ElastiCache/Redis) | The dashboard is read constantly. Reading current status from memory (sub-millisecond) instead of hitting the DB every time = fast + cheap + DB stays healthy. Cache is NOT source of truth. |
| Frontend (Next.js) | What humans look at. Pulls current state, renders green/red, auto-refreshes. |
| CI/CD (GitHub Actions) | Every code push is auto-tested and (eventually) auto-deployed. No manual builds, no "works on my machine." |
| AWS infra | Hosts all of the above reliably, scalably, securely. |

If you can explain this table to your mentor without notes, you understand the architecture. The code is just the implementation.

---

## What "being ready for a project like this" actually means (your gap analysis)

You said: *any AI can build a website; understanding the solution and how the pieces connect is the key.* Correct. Here is exactly what a developer + cloud-architect all-rounder is expected to *understand* (not just code) for this kind of project. Use this as a checklist — by end of Day 3 you should be able to speak to every row.

**Backend / API literacy**
- What an HTTP API is: methods (GET/POST/PUT/DELETE), status codes (200/201/400/404/500), request/response bodies (JSON), headers.
- REST conventions: resources as nouns (`/services`, `/incidents`), verbs as methods.
- What a webhook is and how it differs from a normal API call (server-to-server push vs client request).
- Why you validate input (Pydantic) — never trust incoming data.
- Sync vs async (FastAPI is async; why that matters for I/O-heavy webhook ingestion).
- CORS — why the browser blocks your frontend from calling your backend until you allow it.

**Frontend literacy**
- Client vs server rendering (Next.js does both; why SSR/SSG matters for a status page that should load instantly even if the API is slow).
- How a component fetches data (`fetch` in `useEffect`, or Next.js server components / route handlers).
- State (the UI re-renders when data changes).
- Environment variables for API URLs (so localhost vs production just works).

**Data layer literacy**
- Relational DB basics: tables, rows, primary keys, foreign keys, a simple schema.
- ORM concept (SQLAlchemy) vs raw SQL — what an ORM buys you.
- RDS Postgres vs Aurora trade-off (managed simplicity vs scale/performance/cost) — you'll be asked this.
- Cache patterns: cache-aside (read cache → miss → read DB → write cache). Why cache invalidation is "one of the two hard problems."
- Why the DB is truth and the cache is disposable.

**Messaging / decoupling literacy**
- Synchronous vs asynchronous processing.
- Pub/sub (SNS) vs queue (SQS) — one-to-many fan-out vs reliable single consumer.
- Why decoupling makes systems resilient and scalable.

**DevOps / cloud literacy**
- Git: clone, branch, commit, push, pull request, merge. The PR review workflow.
- CI vs CD: CI = test/build every change; CD = deploy automatically.
- What a GitHub Actions workflow file is (YAML, triggers, jobs, steps).
- Containers: what Docker gives you ("ships the same environment everywhere"), image vs container, Dockerfile basics.
- AWS service mapping: which AWS service hosts which part (ECS/Fargate for containers, RDS/Aurora for DB, ElastiCache for Redis, S3/CloudFront for static assets, ALB for load balancing, CloudWatch for monitoring, IAM for permissions, ECR for image storage).
- The deploy story end-to-end: code → PR → CI tests → build Docker image → push to ECR → ECS pulls and runs it → ALB routes traffic → CloudWatch watches it.

**Architecture / judgment literacy (the real differentiator)**
- Reading a data-flow diagram and explaining every arrow.
- Knowing *why* a piece exists and what breaks if you remove it.
- Trade-off thinking: "we used X instead of Y because…"
- Failure thinking: "if the DB is down, what happens to incoming webhooks?" (Answer: the bus buffers them.)
- Security basics: validate webhooks (shared secret/HMAC), least-privilege IAM, secrets in a secret manager not in code.

You don't need to *build* every AWS piece (your Learner Lab won't let you). You need to **simulate the architecture locally** with free equivalents and **understand how each local piece maps to its AWS counterpart**. That's exactly what this plan does.

**Local → AWS mapping we'll use:**

| Architecture role | We build locally with | Maps to AWS |
|---|---|---|
| Backend API | FastAPI (Python) | runs in ECS/Fargate behind an ALB |
| Frontend | Next.js | runs in ECS/Fargate, or static export on S3+CloudFront |
| Database | Postgres in Docker | Amazon RDS Postgres / Aurora |
| Cache | Redis in Docker | Amazon ElastiCache (Redis) |
| Message bus | a Python in-process queue (and we'll discuss SNS/SQS) | Amazon SNS + SQS |
| Container runtime | Docker + docker-compose | ECS/Fargate + ECR |
| CI/CD | GitHub Actions | same (deploys to ECS) |
| Monitoring source | a script that POSTs fake webhooks | Splunk/Prometheus webhooks |

> On the DB question: MongoDB was in your prompt, but status data is **relational and structured** (services, incidents, status-history with timestamps) and the meeting leans Postgres/Aurora. **We use Postgres.** I'll note where Mongo would differ, but Postgres is the right call here and the right thing to learn for this project.

---

## How to prompt Copilot & Claude Code effectively (a core skill, not a footnote)

You'll build this *with* AI, which is exactly the modern workflow. The skill is **driving the AI, not being driven.** Principles:

1. **Give context, not just commands.** Bad: "make an API." Good: "I'm building a FastAPI backend for a status platform. Create a GET `/services` endpoint that returns a list of services with `id`, `name`, `status` (enum: operational/degraded/down), and `last_updated`. Use a Pydantic model. Data comes from an in-memory dict for now."
2. **Specify the contract.** Inputs, outputs, types, error cases. AI fills gaps with assumptions — pin them down so the assumptions are yours.
3. **Work in small steps and verify each.** Ask for one endpoint, run it, confirm, then the next. Don't accept 300 lines you can't read.
4. **Make it explain, then judge it.** "Explain why you used X." If the explanation is weak, the code is suspect. *You* are the architect; the AI is a fast junior dev.
5. **Use Claude Code for multi-file/repo-level tasks** ("wire the frontend fetch to the backend `/services` endpoint and handle the loading + error states") and **Copilot for inline completions** while you type.
6. **Always read before you run.** The understanding is the deliverable; the working app is the byproduct.

Example prompts are sprinkled through the plan, tagged 🤖.

---

# DAY 1 (4 hrs): Foundations, Project Setup, Backend Skeleton

**Outcome by end of day:** A new VS Code project, a Git repo pushed to GitHub, a running FastAPI backend with real endpoints you understand, tested in the browser docs. You'll understand HTTP, REST, JSON, Pydantic, and the request lifecycle.

### Block 1 (45 min) — Environment & project scaffold
Confirm installed: Python 3.11+ (`python --version`), Node 18+ (`node --version`), Git (`git --version`), VS Code, Docker Desktop (`docker --version`). Install VS Code extensions: Python, Pylance, ESLint, Prettier, Docker, GitHub Copilot, and the Claude Code extension.

```bash
mkdir statuspulse && cd statuspulse
git init
mkdir backend frontend
# Python virtual env for the backend (isolates dependencies — explain to yourself why: so this project's packages don't pollute your system Python)
cd backend
python -m venv venv
# Windows: venv\Scripts\activate   |   Mac/Linux: source venv/bin/activate
pip install "fastapi[standard]" uvicorn pydantic
pip freeze > requirements.txt
cd ..
```

Create a `.gitignore` at the repo root (don't commit `venv`, `node_modules`, secrets):
```
venv/
__pycache__/
node_modules/
.next/
.env
*.pyc
```
**Understand:** a virtualenv is the local equivalent of "each container ships its own dependencies." `requirements.txt` is your dependency manifest — CI and Docker will read it.

### Block 2 (45 min) — HTTP / REST / JSON crash course (no typing, just understanding)
Learn until you can answer these out loud:
- What happens when the browser hits a URL? (DNS → TCP → HTTP request → server → HTTP response.)
- GET vs POST: GET reads, POST creates/sends data. Why is a webhook a POST? (It's sending an event payload.)
- Status codes: 200 OK, 201 Created, 400 Bad Request, 401/403 auth, 404 Not Found, 500 server error.
- JSON: the universal data shape. `{ "name": "Jira", "status": "down" }`.
- REST: `/services` (collection), `/services/{id}` (one item), methods as verbs.

🤖 Prompt to Claude Code: *"Explain the HTTP request/response lifecycle and REST conventions using my status platform as the example — what endpoints would a status API expose and which HTTP methods/status codes each uses. Keep it concise."* Then sanity-check the answer against the list above.

### Block 3 (1 hr 30 min) — Build the FastAPI backend skeleton
Create `backend/main.py`. Build it endpoint by endpoint; run after each.

Core idea you're implementing: an in-memory "current status of each service," a GET to read it, and a webhook POST that updates it (this *is* the status platform in miniature).

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from enum import Enum
from datetime import datetime, timezone

app = FastAPI(title="StatusPulse API")

# CORS: the browser will block the Next.js frontend from calling this API
# unless we explicitly allow its origin. This is a browser security rule.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # the Next.js dev server
    allow_methods=["*"],
    allow_headers=["*"],
)

class StatusEnum(str, Enum):
    operational = "operational"
    degraded = "degraded"
    down = "down"

class Service(BaseModel):          # this is our "common format" (the normalizer's target)
    id: str
    name: str
    status: StatusEnum
    last_updated: datetime

# In-memory store = stand-in for the DB+cache for now. Not durable; that's fine today.
SERVICES: dict[str, Service] = {
    "jira":   Service(id="jira",   name="Jira",   status=StatusEnum.operational, last_updated=datetime.now(timezone.utc)),
    "github": Service(id="github", name="GitHub", status=StatusEnum.operational, last_updated=datetime.now(timezone.utc)),
    "email":  Service(id="email",  name="Email",  status=StatusEnum.degraded,    last_updated=datetime.now(timezone.utc)),
}

@app.get("/health")            # liveness probe — every prod service needs one (ALB/ECS will hit this)
def health():
    return {"status": "ok"}

@app.get("/services", response_model=list[Service])
def list_services():
    return list(SERVICES.values())

@app.get("/services/{service_id}", response_model=Service)
def get_service(service_id: str):
    if service_id not in SERVICES:
        raise HTTPException(status_code=404, detail="Service not found")
    return SERVICES[service_id]

# This is the WEBHOOK. A monitoring tool POSTs here when status changes.
class WebhookPayload(BaseModel):
    service_id: str
    status: StatusEnum

@app.post("/webhook/status", status_code=201)
def receive_webhook(payload: WebhookPayload):
    # In the real system this is where the NORMALIZER lives and we'd publish
    # to the message bus. For now we update the store directly.
    svc = SERVICES.get(payload.service_id)
    if not svc:
        # auto-register unknown services so monitoring can introduce new ones
        svc = Service(id=payload.service_id, name=payload.service_id.title(),
                      status=payload.status, last_updated=datetime.now(timezone.utc))
    else:
        svc.status = payload.status
        svc.last_updated = datetime.now(timezone.utc)
    SERVICES[payload.service_id] = svc
    return {"received": True, "service": svc}
```

Run it:
```bash
cd backend
fastapi dev main.py     # or: uvicorn main:app --reload
```
Open `http://localhost:8000/docs` — FastAPI auto-generates interactive API docs. **This is a FastAPI superpower:** test every endpoint from the browser, no Postman needed. Hit GET `/services`, then POST `/webhook/status` with `{"service_id":"jira","status":"down"}`, then GET `/services` again and watch Jira flip to down.

**Understand what just happened:** you implemented the core loop of a status platform — an external event (webhook) mutated state, and reads reflect it. Everything else (DB, cache, bus, real monitoring tools) is making this loop *durable, fast, decoupled, and automated.*

### Block 4 (45 min) — First commit & push to GitHub
```bash
cd ..    # repo root
git add .
git commit -m "Day 1: FastAPI backend skeleton with services + webhook endpoints"
```
Create an empty repo on github.com named `statuspulse` (no README, so histories don't conflict), then:
```bash
git remote add origin https://github.com/<you>/statuspulse.git
git branch -M main
git push -u origin main
```
**Understand the Git mental model:** working directory → `git add` (stage) → `git commit` (snapshot, local) → `git push` (publish to remote). From tomorrow you'll work on **branches** and open **pull requests** — the professional workflow.

**Day 1 self-check (say these out loud):** What's the difference between GET `/services` and POST `/webhook/status`? Why did we need CORS? What does Pydantic do for us? What's the difference between a commit and a push?

---

# DAY 2 (4 hrs): Frontend, Wiring, Real Persistence & Cache

**Outcome by end of day:** A Next.js dashboard showing live status from your API; a real Postgres DB and Redis cache running in Docker; the backend reading/writing the DB and caching reads. You'll understand SSR vs client fetch, the cache-aside pattern, and why the DB is truth.

### Block 1 (1 hr) — Next.js dashboard that reads your API
```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
npm run dev      # serves on http://localhost:3000
```
Replace `app/page.tsx` with a dashboard that fetches from the backend. Key concepts to internalize as you write it (let Copilot help, but read every line):
- `NEXT_PUBLIC_API_URL` env var in `frontend/.env.local` = `http://localhost:8000` so the URL isn't hardcoded.
- A client component (`"use client"`) fetches in `useEffect`, stores in `useState`, renders a colored row per service, and re-fetches every 10s (the auto-refresh = "minimal manual updates").
- Handle three UI states: loading, error, data. Real apps always handle all three.

🤖 Prompt to Claude Code (this is a good multi-file task): *"In my Next.js app router project, replace app/page.tsx with a client component that fetches GET ${NEXT_PUBLIC_API_URL}/services every 10 seconds, shows a loading state, an error state, and on success renders each service as a row with the name and a colored dot (green=operational, yellow=degraded, red=down) plus a relative 'last updated' time. Use Tailwind. Read the API base URL from process.env.NEXT_PUBLIC_API_URL."*

With both servers running, open `localhost:3000`. POST a webhook (via `localhost:8000/docs`) to flip a service to `down` and watch the dashboard update within 10s. **You now have the full loop running across two processes — this is the prototype of the real product.**

**Understand SSR vs client fetch:** we used a client fetch (simple, dynamic). Next.js can also fetch on the *server* and send pre-rendered HTML — better for instant first paint and SEO. For a status page you'd often server-render the initial state then refresh on the client. Know the difference and the trade-off.

### Block 2 (1 hr) — Real persistence: Postgres in Docker + SQLAlchemy
Why now: the in-memory store dies on restart. Real platforms need durable history. We bring up Postgres with Docker (this is also your first real "infra as a container" experience).

Create `docker-compose.yml` at repo root:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: status
      POSTGRES_PASSWORD: status
      POSTGRES_DB: statuspulse
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]   # named volume = data survives container restarts
  cache:
    image: redis:7
    ports: ["6379:6379"]
volumes:
  pgdata:
```
```bash
docker compose up -d        # starts Postgres + Redis in the background
docker compose ps           # confirm both are healthy
```
**Understand:** `docker compose up` just gave you, locally, the equivalent of provisioning an RDS instance and an ElastiCache cluster — except free and on your laptop. The named volume is why your data isn't lost; that's the local analog of RDS's managed storage.

Add DB libs to the backend:
```bash
cd backend && source venv/bin/activate   # (or Windows activate)
pip install sqlalchemy psycopg2-binary redis
pip freeze > requirements.txt
```
Now refactor the backend so `/services` reads from Postgres via SQLAlchemy and `/webhook/status` writes to Postgres. Concepts to understand while doing it:
- **ORM:** SQLAlchemy maps a Python `Service` class to a `services` table. You write Python, it writes SQL. Know that the raw SQL still exists underneath.
- **Schema:** a `services` table (`id` PK, `name`, `status`, `last_updated`) and ideally a `status_events` table (history: which service, what status, when) — *this* is what makes "when did X go down last month?" answerable. History is the reason a DB beats an in-memory dict.
- **Migrations** (mention/learn, optional to implement): Alembic versions your schema changes so prod and dev stay in sync.

🤖 Prompt: *"Refactor my FastAPI backend to use SQLAlchemy with the Postgres at postgresql://status:status@localhost:5432/statuspulse. Create two models: Service (id PK string, name, status string, last_updated) and StatusEvent (id PK autoincrement, service_id FK, status, created_at). On POST /webhook/status, upsert the Service AND insert a StatusEvent row. On GET /services return all services. Create tables on startup. Show me the full file and explain the session/connection handling."* Read the explanation carefully — connection/session lifecycle is a thing people get wrong.

### Block 3 (1 hr) — The cache layer (Redis) + cache-aside pattern
This is the ElastiCache concept made concrete. The dashboard reads `/services` constantly; hitting Postgres every time is wasteful. Add Redis as a read cache.

Implement **cache-aside** on GET `/services`:
1. Try to read the services list from Redis (key like `services:all`).
2. **Hit** → return it (fast, no DB).
3. **Miss** → read from Postgres, write the result into Redis with a short TTL (e.g. 10s), return it.
4. On any webhook write → **invalidate** the cache key (delete it) so the next read repopulates with fresh data.

🤖 Prompt: *"Add Redis caching (redis-py, localhost:6379) to my GET /services using the cache-aside pattern with key 'services:all' and a 10-second TTL. On POST /webhook/status, delete that key to invalidate. Add a tiny log line on cache HIT vs MISS so I can see it working. Explain why we invalidate on write and why the cache is not the source of truth."*

Watch the logs: first request = MISS (reads DB), next few = HIT (reads Redis), after a webhook = MISS again. **You now understand the single most important caching pattern and the phrase "cache invalidation is hard."** Say out loud: *the DB is truth; the cache is a fast disposable copy; if Redis vanished, the app still works (just slower).* That sentence is what an architect wants to hear.

### Block 4 (1 hr) — Message bus concept + simulate monitoring
Two parts:

**(a) Decoupling / message bus (understanding + light implementation).** Right now the webhook writes to the DB synchronously inside the request. In the real architecture the webhook *publishes to SNS* and a *separate listener* writes to the DB — so a slow/broken DB never blocks ingestion and you can scale them independently. Implement a tiny local stand-in: push incoming events onto a Python `queue.Queue` (or `asyncio` queue / background task) and have a small worker drain it into the DB. This makes the decoupling *tangible*.

🤖 Prompt: *"Refactor POST /webhook/status so it validates + publishes the event to an in-process asyncio queue and returns 202 Accepted immediately. Add a background worker task that drains the queue and does the DB write + cache invalidation. Explain how this maps to AWS SNS (publish) + SQS (queue) + a consumer, and what resilience this buys us."*

**Understand the AWS mapping:** publish → **SNS** (fan-out to many subscribers, e.g. DB-writer *and* an alerting Lambda), queue → **SQS** (reliable buffering, retry, dead-letter for poison messages), consumer → your listener running in ECS. The *value*: ingestion never blocks, events aren't lost if a consumer is down, and you scale producers/consumers separately.

**(b) Simulate the monitoring tools.** Write `tools/fake_monitor.py` that POSTs random status changes to your webhook every few seconds — this *is* your Splunk/Prometheus stand-in.
```python
import requests, random, time
SERVICES = ["jira", "github", "email", "vpn", "wiki"]
STATUSES = ["operational", "operational", "operational", "degraded", "down"]  # weighted toward healthy
while True:
    s = random.choice(SERVICES); st = random.choice(STATUSES)
    r = requests.post("http://localhost:8000/webhook/status",
                      json={"service_id": s, "status": st})
    print(f"sent {s} -> {st} ({r.status_code})")
    time.sleep(3)
```
Run it and watch the whole system breathe: fake monitor → webhook → queue → worker → Postgres + cache invalidation → Next.js dashboard updates. **This is the entire architecture working end-to-end on your laptop.**

Commit on a branch and open a PR (start the pro workflow):
```bash
git checkout -b day2-frontend-db-cache
git add . && git commit -m "Day 2: Next.js dashboard, Postgres, Redis cache-aside, async ingestion, fake monitor"
git push -u origin day2-frontend-db-cache
```
Open the PR on GitHub, read your own diff as if reviewing someone else's work, then merge.

**Day 2 self-check:** Why does the cache get invalidated on write? What breaks if Redis goes down vs if Postgres goes down? What does returning 202 from the webhook buy you? What's the difference between SNS and SQS?

---

# DAY 3 (4 hrs): CI/CD, Containers, AWS Mapping & The Architect Story

**Outcome by end of day:** A GitHub Actions pipeline that tests & builds your app on every push; both apps containerized with Docker; and a clear, spoken explanation of how this whole thing deploys on AWS. You'll finish able to walk a mentor through the full architecture and the code-to-production lifecycle.

### Block 1 (1 hr) — Containerize backend & frontend (Docker)
Why: "works on my machine" dies here. A container ships the app *and its environment*, so it runs identically on your laptop, in CI, and on AWS Fargate.

`backend/Dockerfile`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```
`frontend/Dockerfile` (multi-stage — build then run, smaller image):
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]
```
Add backend + frontend to your `docker-compose.yml` alongside db/cache so `docker compose up` brings up the *entire stack* with one command. Test it.

**Understand the AWS mapping:** a Docker **image** is what you push to **ECR** (Elastic Container Registry). **ECS/Fargate** pulls that image and runs it as a **container** (a "task") — Fargate means you don't manage servers. An **ALB** (load balancer) sits in front and routes traffic + does health checks (hitting your `/health` endpoint — now you see why we built it Day 1). Say the sentence: *image in ECR → ECS task on Fargate → ALB in front → CloudWatch watching.*

### Block 2 (1 hr 30 min) — CI/CD with GitHub Actions
Create `.github/workflows/ci.yml`. Start with **CI** (test + build on every push/PR). Concepts: a workflow has **triggers** (`on: push`), **jobs** (run on a fresh VM), **steps** (checkout → setup → install → test → build).

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r backend/requirements.txt
      - run: pip install pytest
      - run: cd backend && pytest -q || echo "add tests!"   # placeholder until you write tests
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "18" }
      - run: cd frontend && npm ci
      - run: cd frontend && npm run build      # fails the pipeline if the app doesn't compile
  docker-build:
    runs-on: ubuntu-latest
    needs: [backend, frontend]                 # only runs if tests/builds passed
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t statuspulse-backend ./backend
      - run: docker build -t statuspulse-frontend ./frontend
```
Push it. Go to the **Actions** tab on GitHub and watch it run. Make a tiny change on a branch, open a PR, and see the checks run *on the PR* — this is the gate that stops broken code from merging. **That gate is the entire point of CI.**

Write at least one real backend test so CI is meaningful:
🤖 Prompt: *"Write a pytest test using FastAPI's TestClient that checks GET /health returns 200 and {'status':'ok'}, and that POST /webhook/status with a valid payload returns 201/202 and then GET /services reflects the new status. Put it in backend/test_main.py."*

**Understand CI vs CD:** what you built is **CI** (continuous integration — test/build every change). **CD** (continuous deployment) adds steps that, after tests pass on `main`, log in to AWS, push the image to ECR, and tell ECS to deploy the new version. You can't run the AWS half in Learner Lab, but you *write/read* the deploy job so you understand it:
```yaml
  # deploy (conceptual — needs AWS creds + ECR/ECS set up; can't run in Learner Lab)
  deploy:
    needs: docker-build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}      # secrets, never in code
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      # build → tag → docker push to ECR → aws ecs update-service --force-new-deployment
```
**Understand:** secrets live in GitHub repo settings (encrypted), never in the YAML. IAM gives the pipeline *least-privilege* permission to push to ECR and update one ECS service — nothing more. This is the security mindset they'll expect.

### Block 3 (1 hr) — The full AWS architecture, mapped & spoken
No building (Learner Lab). Instead, **produce the artifact that proves you understand it**: a one-page architecture write-up + the spoken walkthrough. Re-draw your diagram with AWS services named on every box and be able to narrate it:

> *"A monitoring tool POSTs a webhook to our FastAPI service, which runs as a Fargate task behind an Application Load Balancer. FastAPI validates and normalizes the payload, then publishes it to an SNS topic. SNS fans out to an SQS queue (and could also trigger an alerting Lambda). A consumer — another Fargate task — drains the queue, writes a durable status event to Aurora Postgres, and invalidates the relevant key in ElastiCache Redis. The Next.js frontend, also on Fargate (or static on S3+CloudFront), reads current status — served from ElastiCache on a hit, falling back to Aurora on a miss. CloudWatch collects logs and metrics and alarms on errors. IAM roles give each component least-privilege access. Code ships via GitHub Actions: every PR runs tests and a build; merges to main build a Docker image, push it to ECR, and trigger an ECS rolling deployment with zero downtime."*

If you can say that paragraph confidently and answer "why?" on any clause, **you are ready to contribute to status.lilly.com.** That's the whole goal.

Drill the trade-off / failure questions you'll be asked:
- *RDS Postgres vs Aurora?* RDS = simple, cheaper at small scale, fine for an internal tool. Aurora = ~3–5× throughput, storage auto-scaling, faster failover, multi-AZ by design — worth it at enterprise scale/load. For status.lilly.com's likely scale, lead with RDS, note Aurora as the scale path.
- *Why a cache at all?* Reads vastly outnumber writes on a status page; cache absorbs read load, cuts latency, protects the DB. It's disposable, not truth.
- *Why a message bus?* Decouples ingestion from processing → resilience (DB hiccup doesn't drop events), independent scaling, fan-out to multiple consumers.
- *DB down?* Reads still served from cache (briefly); writes buffer in SQS and replay when DB recovers → no data loss.
- *Securing webhooks?* Shared secret / HMAC signature verification so only your real monitoring tools can post; rate limiting; TLS only.

### Block 4 (30 min) — Final docs, README, wrap-up
Write a `README.md` at repo root: what StatusPulse is, the architecture diagram, how to run it (`docker compose up`), the local→AWS mapping table, and a "what I learned" section. This README is your portfolio proof and your interview cheat-sheet.

🤖 Prompt: *"Write a README.md for my StatusPulse repo: one-paragraph overview, an ASCII architecture diagram (monitoring → FastAPI webhook → queue → worker → Postgres + Redis → Next.js), prerequisites, 'docker compose up' run instructions, a table mapping each local component to its AWS equivalent, and a short 'concepts demonstrated' list."*

Final commit & merge to main; confirm CI goes green on `main`.

**Day 3 self-check:** Explain image vs container. What does the ALB health check hit and why? What's in GitHub secrets and why not in the YAML? Walk the full code-to-production path in one breath. Give the RDS-vs-Aurora answer.

---

## After the 3 days — next steps (when you have real AWS access)
- Stand up the real thing: ECR + ECS/Fargate + RDS + ElastiCache + ALB, deploy via the CD job you already wrote.
- Add **Alembic** migrations and **auth** (HMAC) on the webhook.
- Add a real **status history page** and an **incidents** model (open/resolved, timestamps, affected services).
- Wire an actual monitoring source (a Prometheus Alertmanager webhook, or a Splunk alert action) instead of the fake monitor.
- Add **CloudWatch** dashboards/alarms and structured logging.
- Explore **Infrastructure as Code** (Terraform / AWS CDK) so the whole stack is reproducible — this is the senior-level skill.

## The one thing to remember
The code is replaceable and AI can write it. **Your value is the architecture in your head:** knowing what each piece is *for*, what happens when it fails, and why one choice beats another. Build the app to earn that understanding — then the understanding is what you carry into status.lilly.com.
