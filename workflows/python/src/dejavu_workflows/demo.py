"""Combined launcher: FastAPI backend + Temporal worker in one process.

This ensures activities can push SSE events through shared in-memory queues.
Run with: uv run --package dejavu-workflows demo
"""

from __future__ import annotations

import asyncio

import uvicorn

from dejavu_tacos.temporal_client import connect_temporal_client
from dejavu_workflows.worker import run_worker


async def _run_combined() -> None:
    client = await connect_temporal_client()

    # Start the Temporal worker in the background
    worker_task = asyncio.create_task(run_worker(client))

    # Start uvicorn (FastAPI) in the foreground
    config = uvicorn.Config(
        "dejavu_tacos.api.routes:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
    server = uvicorn.Server(config)
    await server.serve()

    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


def run_all() -> None:
    asyncio.run(_run_combined())


if __name__ == "__main__":
    run_all()
