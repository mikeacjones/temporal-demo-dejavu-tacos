# Déjà Vu Tacos — Temporal Order Management Demo

A live, interactive demo showing why [Temporal](https://temporal.io) matters for order management. Place a taco order through an iPhone-style app, watch the behind-the-scenes workflow execute in real time, and see what happens when things go wrong.

Toggle between **Traditional mode** (direct service calls, no recovery) and **Temporal mode** (durable workflows with retries, signals, and compensation) — same failure, wildly different outcomes.

![Temporal mode — workflow retrying after store outage](docs/screenshots/temporal-retrying.png)

## Quick Start

**Prerequisites:** [Temporal CLI](https://docs.temporal.io/cli) + either Docker or the language-specific toolchain for local mode.

```bash
./scripts/start.sh              # Python worker (default)
./scripts/start.sh go           # Go worker
./scripts/start.sh typescript   # TypeScript worker
./scripts/start.sh java         # Java worker
./scripts/start.sh dotnet       # .NET (C#) worker
./scripts/start.sh rust         # Rust worker
./scripts/start.sh php          # PHP worker
./scripts/start.sh ruby         # Ruby worker
```

The script auto-detects your environment:

| Has Docker? | What happens |
|---|---|
| Yes | Temporal CLI on host, backend/worker/frontend in containers |
| No | Everything runs locally as background processes |

Open http://localhost:5173 once it's running. Temporal UI at http://localhost:8233.

To present the demo, follow [RUNBOOK.md](RUNBOOK.md): the walkthrough beat by beat, and where in the code each part happens.

## The Demo

### 1. Place an order (Temporal mode)

Browse the menu, add items, and check out. The behind-the-scenes panel shows each workflow activity executing. The code panel on the right shows the actual workflow code — in the language of the running worker — lighting up in real time.

![Order complete with code view](docs/screenshots/temporal-complete.png)

### 2. Simulate a failure

With the default "Store Connectivity" failure scenario, the store loses connection after payment is authorized. Switch to the **Kitchen Display** tab to see what happened:

![Bob unplugged the ethernet](docs/screenshots/kds-bob-unplugged.png)

Click **"Plug It Back In"** — the Temporal workflow's retry policy picks up the recovery automatically. The order appears on the KDS, and you can mark it ready:

![KDS with order ready](docs/screenshots/kds-order-ready.png)

### 3. Compare with Traditional mode

Switch to Traditional mode in settings (the path button at the top right, which reads **Temporal · Store connectivity**) and place the same order. When the store goes down, the order fails — payment is taken but no food is coming. No retries, no compensation, no recovery.

![Traditional mode failure with architecture diagram](docs/screenshots/traditional-failed.png)

### 4. See the architecture contrast

Use the **arrow keys** to step through the "Evolution of Simple Architecture" diagram, showing the Rube Goldberg machine of queues, retry services, dead letter queues, state databases, and cron jobs that you'd need to build for reliability without Temporal.

![Full traditional architecture](docs/screenshots/traditional-arch-full.png)

### 5. Inspect the real workflows

The Temporal UI at http://localhost:8233 shows actual workflow executions with full event history:

![Temporal UI](docs/screenshots/temporal-ui-complete.png)

### 6. The Workflow viewscreen (`reinvent-example/`)

A second, standalone web app: the phone on the left and the order's Workflow timeline on
the right, which loads the new Workflow each time an order is placed. Two console buttons
stand in for the kitchen display: **Reconnect store** ends the store-offline retries and
**Mark ready** sends the `order_ready` Signal. It uses the same backend and Workers as the
main app and lives under `/_reinvent_example/`.

The timeline is an iframe of the Temporal UI, which only allows framing from its own origin
(`X-Frame-Options: SAMEORIGIN`). On the hosted demo the platform serves the namespace's
public, read-only Temporal UI on the demo's own host, so the timeline appears in place.
Locally the dev server's UI on `:8233` is another origin, so the viewscreen shows a link
instead.

On the hosted demo the viewscreen loads the Temporal UI when the page opens, on the
namespace's newest run, behind the empty state. Each order then switches the loaded UI to
the new Workflow in place, in about a second, where a fresh load took 6 to 16 seconds. It
waits for the UI to finish rendering first, since a switch before that is a full reload, and
goes by way of the namespace's schedules page: the UI's run page only starts its 10-second
refresh of pending activities, which is where retry attempts come from, when it mounts, so a
direct run-to-run switch would never show a retry. The
UI's sidebar starts collapsed (its own `navOpen` setting), and an injected stylesheet hides
its side, top and bottom bars; the selectors are temporalio/ui 2.58.1's, the version the
platform pins. − and + scale the frame (100 to 160%), remembered per browser. `docker compose up --build reinvent-example` serves it at
http://localhost:5175/_reinvent_example/.

## Settings

Click the path button at the top right (it shows the current architecture and failure scenario) to configure:
- **Architecture Mode**: Traditional (fragile) vs Temporal (durable)
- **Failure Scenario**: Store connectivity (default), payment error, random chaos, or none
- **Presentation Mode**: Simple (high-level) vs Detailed (retries, payloads, error messages)

## Architecture

```
Browser (React + Vite + nginx)
    ↓ REST + SSE
FastAPI Backend (Python)
    ├── Mock Services (payment, store, cart)
    ├── Internal API (failure state, SSE events, store orders)
    └── Temporal client (starts workflows, sends signals)
           ↕
Temporal Dev Server (CLI, on host)
           ↕
Worker (Python, Go, TypeScript, Java, .NET, Rust, PHP, or Ruby — swappable)
    ├── OrderWorkflow (saga compensation, signals, queries)
    └── Activities → Backend internal API
```

The worker runs as a separate process from the backend. Activities call the backend's internal API for failure state and store order registration, so the worker can be killed and restarted without losing sync — demonstrating Temporal's durable execution.

## Multi-Language Support

The same workflow is implemented in all eight languages with a Temporal SDK. The backend is decoupled from the worker: it starts workflows and sends signals by string name, so any language's worker can be swapped in.

| Language | Run with | Saga Pattern |
|---|---|---|
| Python | `./scripts/start.sh python` | Manual compensation list + `asyncio.shield` |
| Go | `./scripts/start.sh go` | `Compensations` struct + `NewDisconnectedContext` |
| TypeScript | `./scripts/start.sh typescript` | Manual compensation list + `CancellationScope.nonCancellable()` |
| Java | `./scripts/start.sh java` | SDK's built-in `Saga` class (first-class support) |
| .NET (C#) | `./scripts/start.sh dotnet` | Manual compensation list with try/catch |
| Rust | `./scripts/start.sh rust` | Manual compensation list + detached `WorkflowCancellationToken` |
| PHP | `./scripts/start.sh php` | SDK's built-in `Saga` class, run by RoadRunner |
| Ruby | `./scripts/start.sh ruby` | Manual compensation list + detached `Cancellation` |

All workers implement the same flow: validate → authorize payment → clear cart → submit to store → wait for ready signal → capture payment. Same task queue (`dejavu-tacos`), same signal names, same compensation behavior.

The code view opens on the active worker's language, with a tab per language to compare them. To add a new language, see [Adding a New Language](#adding-a-new-language).

## Project Structure

```
├── frontend/             # React + Vite + TypeScript + Tailwind
│   └── src/data/         # Language-specific code definitions for the code viewer
├── reinvent-example/     # Workflow viewscreen: phone + framed timeline, /_reinvent_example/
├── backend/              # FastAPI + mock services (always Python)
├── workflows/
│   ├── python/           # Python worker — temporalio SDK
│   ├── go/               # Go worker — go.temporal.io/sdk
│   ├── typescript/       # TypeScript worker — @temporalio/* packages
│   ├── java/             # Java worker — io.temporal:temporal-sdk
│   ├── dotnet/           # .NET worker — Temporalio NuGet package
│   ├── rust/             # Rust worker — temporalio-sdk crate
│   ├── php/              # PHP worker — temporal/sdk on RoadRunner
│   └── ruby/             # Ruby worker — temporalio gem
├── docker/               # Dockerfiles + nginx config
├── docker-compose.yml    # Container orchestration (one profile per language)
└── scripts/start.sh      # One-command launcher
```

## Running with Docker

```bash
# Start with a specific worker language
DEJAVU_WORKER_LANGUAGE=go docker compose --profile go up --build

# Or use the launch script (handles Temporal dev server too)
./scripts/start.sh typescript
```

Docker Compose profiles: `python`, `go`, `typescript`, `java`, `dotnet`, `rust`, `php`, `ruby`. Only the selected worker starts.

## Running Locally

The launch script falls back to local mode if Docker isn't available:

```bash
./scripts/start.sh python       # needs: uv, npm, temporal
./scripts/start.sh go           # needs: go, npm, temporal
./scripts/start.sh typescript   # needs: node/npm, temporal
./scripts/start.sh java         # needs: gradle, jdk 17+, npm, temporal
./scripts/start.sh dotnet       # needs: dotnet 8+, npm, temporal
./scripts/start.sh rust         # needs: rust 1.92+, protoc, npm, temporal
./scripts/start.sh php          # needs: php 8.4+ with sockets, composer, rr, npm, temporal
./scripts/start.sh ruby         # needs: ruby 3.4, bundler, npm, temporal
```

## Development

```bash
# Install dependencies
uv sync && cd frontend && npm install

# Run individual services
temporal server start-dev                                                        # Temporal on :7233
uv run --package dejavu-tacos-backend server                                     # FastAPI on :8000
DEJAVU_BACKEND_URL=http://localhost:8000 uv run --package dejavu-workflows worker # Python worker
cd workflows/go && DEJAVU_BACKEND_URL=http://localhost:8000 go run ./cmd/worker/ # Go worker
cd workflows/typescript && npm run build && DEJAVU_BACKEND_URL=http://localhost:8000 node lib/worker.js
cd workflows/java && DEJAVU_BACKEND_URL=http://localhost:8000 gradle run
cd workflows/dotnet && DEJAVU_BACKEND_URL=http://localhost:8000 dotnet run
cd workflows/rust && DEJAVU_BACKEND_URL=http://localhost:8000 cargo run --release
cd workflows/php && composer install && DEJAVU_BACKEND_URL=http://localhost:8000 rr serve -c .rr.yaml
cd workflows/ruby && bundle install && DEJAVU_BACKEND_URL=http://localhost:8000 bundle exec ruby worker.rb
cd frontend && npm run dev                                                       # Vite on :5173
```

## Order Flow

1. **Validate Order** — check items and prices
2. **Validate Store** — confirm store is open
3. **Authorize Payment** — place a hold (not a capture)
4. **Clear Cart** — commit the order
5. **Submit to Store** — send to kitchen (retries on failure)
6. **Await Order Ready** — signal from KDS (human in the loop)
7. **Capture Payment** — charge only after store confirms

**Compensation (saga pattern):** If store submission fails permanently, the workflow automatically releases the payment hold and notifies the customer. No manual intervention needed.

## Adding a New Language

1. Implement the workflow in `workflows/<lang>/` — same activity event names, same task queue
2. Add code definition in `frontend/src/data/workflowCode.ts` (code lines, compensation lines, syntax highlighting)
3. Add a Dockerfile in `docker/worker-<lang>.Dockerfile`
4. Add a profile in `docker-compose.yml`
5. Add a case in `scripts/start.sh`
6. Add to `WorkerLanguage` type in `frontend/src/types/index.ts`
