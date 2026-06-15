from __future__ import annotations

import asyncio
import os
from datetime import datetime

from temporalio import activity

from dejavu_tacos.models import ArchitectureMode, StepStatus
from dejavu_tacos.services.cart import clear_cart, validate_order
from dejavu_tacos.services.payment import (
    authorize_payment,
    capture_payment,
    release_payment_hold,
)
from dejavu_tacos.services.store import submit_to_store, validate_store

# When running as a separate process, push events via HTTP to the backend.
# When running in-process (combined mode), push directly to the in-memory queue.
_BACKEND_URL = os.environ.get("DEJAVU_BACKEND_URL", "")


async def _emit_event(
    order_id: str,
    step: str,
    status: StepStatus,
    *,
    mode: ArchitectureMode = ArchitectureMode.TEMPORAL,
    attempt: int = 1,
    max_attempts: int = 1,
    error: str | None = None,
    detail: str = "",
) -> None:
    """Push an event via HTTP or in-memory queue depending on mode."""
    if _BACKEND_URL:
        # External worker mode — POST to backend
        import aiohttp

        payload = {
            "order_id": order_id,
            "step": step,
            "status": status.value,
            "attempt": attempt,
            "max_attempts": max_attempts,
            "error": error,
            "detail": detail,
            "timestamp": datetime.now().isoformat(),
            "mode": mode.value,
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{_BACKEND_URL}/api/internal/events", json=payload
                ) as resp:
                    resp.raise_for_status()
        except Exception:
            pass  # Best effort — don't fail the activity over an SSE event
    else:
        # In-process mode — use shared queue directly
        from dejavu_tacos.api.events import emit_event as emit_in_process_event

        await emit_in_process_event(
            order_id,
            step,
            status,
            mode=mode,
            attempt=attempt,
            max_attempts=max_attempts,
            error=error,
            detail=detail,
        )

MODE = ArchitectureMode.TEMPORAL


@activity.defn
async def validate_order_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    await _emit_event(order_id, "validate_order", StepStatus.RUNNING, mode=MODE)
    try:
        result = await validate_order(order_input["items"])
        await _emit_event(
            order_id,
            "validate_order",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"Validated {result['item_count']} items, total ${result['total']:.2f}",
        )
        return result
    except Exception as e:
        info = activity.info()
        await _emit_event(
            order_id,
            "validate_order",
            StepStatus.RETRYING,
            mode=MODE,
            attempt=info.attempt,
            error=str(e),
        )
        raise


@activity.defn
async def validate_store_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    await _emit_event(order_id, "validate_store", StepStatus.RUNNING, mode=MODE)
    try:
        result = await validate_store()
        await _emit_event(
            order_id,
            "validate_store",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"{result['name']} is open, ~{result['estimated_wait_minutes']} min wait",
        )
        return result
    except Exception as e:
        info = activity.info()
        await _emit_event(
            order_id,
            "validate_store",
            StepStatus.RETRYING,
            mode=MODE,
            attempt=info.attempt,
            error=str(e),
        )
        raise


@activity.defn
async def authorize_payment_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    amount = order_input["total"]
    await _emit_event(order_id, "authorize_payment", StepStatus.RUNNING, mode=MODE)
    try:
        result = await authorize_payment(order_id, amount)
        await _emit_event(
            order_id,
            "authorize_payment",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"Hold placed: ${result.amount:.2f} (auth: {result.authorization_id})",
        )
        return {
            "authorization_id": result.authorization_id,
            "amount": result.amount,
            "status": result.status,
        }
    except Exception as e:
        info = activity.info()
        await _emit_event(
            order_id,
            "authorize_payment",
            StepStatus.RETRYING,
            mode=MODE,
            attempt=info.attempt,
            error=str(e),
        )
        raise


@activity.defn
async def clear_cart_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    await _emit_event(order_id, "clear_cart", StepStatus.RUNNING, mode=MODE)
    result = await clear_cart(order_id)
    await _emit_event(
        order_id,
        "clear_cart",
        StepStatus.COMPLETED,
        mode=MODE,
        detail="Cart cleared",
    )
    return result


@activity.defn
async def submit_to_store_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    info = activity.info()
    await _emit_event(
        order_id,
        "submit_to_store",
        StepStatus.RUNNING,
        mode=MODE,
        attempt=info.attempt,
        max_attempts=10,
    )
    try:
        result = await submit_to_store(order_id, order_input["items"])
        await _emit_event(
            order_id,
            "submit_to_store",
            StepStatus.COMPLETED,
            mode=MODE,
            attempt=info.attempt,
            max_attempts=10,
            detail=f"Store accepted, ready in ~{result['estimated_ready_minutes']} min",
        )
        return result
    except Exception as e:
        await _emit_event(
            order_id,
            "submit_to_store",
            StepStatus.RETRYING,
            mode=MODE,
            attempt=info.attempt,
            max_attempts=10,
            error=str(e),
        )
        raise


@activity.defn
async def capture_payment_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    authorization_id = order_input["authorization_id"]
    amount = order_input["total"]
    await _emit_event(order_id, "capture_payment", StepStatus.RUNNING, mode=MODE)
    result = await capture_payment(authorization_id, amount)
    await _emit_event(
        order_id,
        "capture_payment",
        StepStatus.COMPLETED,
        mode=MODE,
        detail=f"Payment captured: ${result.amount:.2f}",
    )
    return {
        "authorization_id": result.authorization_id,
        "amount": result.amount,
        "status": result.status,
    }


@activity.defn
async def release_payment_hold_activity(order_input: dict) -> dict:
    """Release a payment hold (compensation). Idempotent — safe to call
    even if the hold was never placed."""
    order_id = order_input["order_id"]
    authorization_id = order_input.get("authorization_id", "")
    amount = order_input["total"]
    if not authorization_id:
        # Hold was never placed — nothing to release
        return {"status": "no_hold"}
    await _emit_event(
        order_id, "release_payment_hold", StepStatus.RUNNING, mode=MODE
    )
    result = await release_payment_hold(authorization_id, amount)
    await _emit_event(
        order_id,
        "release_payment_hold",
        StepStatus.COMPLETED,
        mode=MODE,
        detail=f"Payment hold released: ${result.amount:.2f} (compensation)",
    )
    return {
        "authorization_id": result.authorization_id,
        "amount": result.amount,
        "status": result.status,
    }


@activity.defn
async def notify_customer_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    success = order_input.get("success", True)
    await asyncio.sleep(0.2)
    if success:
        await _emit_event(
            order_id,
            "notify_customer_success",
            StepStatus.COMPLETED,
            mode=MODE,
            detail="Customer notified: Your order is ready for pickup!",
        )
    else:
        await _emit_event(
            order_id,
            "notify_customer_failure",
            StepStatus.COMPLETED,
            mode=MODE,
            detail="Customer notified: Sorry, we couldn't process your order. "
            "Your payment hold has been released.",
        )
    return {"notified": True, "success": success}
