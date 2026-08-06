"""
TrustSphere AI — Real load/latency measurement.

The README's architecture doc claims "sub-80ms trust score decisions ...
device, behavior, network engines evaluated in parallel". This script
actually measures that claim in two layers, rather than repeating it
uncited:

  1. ENGINE-COMPUTE LATENCY — the four scoring engines
     (fingerprint/behavior/network/scoring) run back to back with the
     Supabase/HTTP boundary mocked out, so this isolates pure algorithm
     cost from network/DB variance. This is the honest substance behind
     the "sub-80ms" claim: it was never a claim about database or
     third-party geolocation-API latency (those are architecturally
     backgrounded/cached — see fingerprint_engine's LRU cache — but this
     script measures the part that's actually deterministic and
     testable without live infrastructure).

  2. HTTP-LAYER THROUGHPUT — concurrent requests against the *actually
     running* local backend (http://127.0.0.1:8001), to validate the
     FastAPI/Uvicorn stack itself handles concurrency without degrading,
     using endpoints that don't require a real Supabase JWT (so this
     runs against the dev server exactly as launched by `run.md` / the
     project's own instructions, no special test server needed).

Run:
    cd backend
    ./venv/Scripts/python.exe tests/load_test.py

Requires the backend dev server to be running on :8001 for part 2 (part
1 runs standalone). If the server isn't reachable, part 2 is skipped
with an explicit message — this script never fabricates numbers for a
target it couldn't reach.
"""

from __future__ import annotations

import asyncio
import statistics
import sys
import time
from unittest.mock import patch, MagicMock

sys.path.insert(0, ".")


def _percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * (pct / 100)
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return sorted_values[f]
    return sorted_values[f] + (sorted_values[c] - sorted_values[f]) * (k - f)


def _report(name: str, samples_ms: list[float]) -> None:
    s = sorted(samples_ms)
    print(f"\n  {name}  (n={len(s)})")
    print(f"    min    {min(s):7.2f} ms")
    print(f"    p50    {_percentile(s, 50):7.2f} ms")
    print(f"    p95    {_percentile(s, 95):7.2f} ms")
    print(f"    p99    {_percentile(s, 99):7.2f} ms")
    print(f"    max    {max(s):7.2f} ms")
    print(f"    mean   {statistics.mean(s):7.2f} ms")


# ---------------------------------------------------------------------
# Part 1: in-process engine-compute latency (mocked I/O boundary)
# ---------------------------------------------------------------------

def measure_engine_pipeline(iterations: int = 500) -> list[float]:
    from app.engines.fingerprint_engine import evaluate_device, _device_cache
    from app.engines.behavior_engine import evaluate_behavior
    from app.engines.network_engine import evaluate_network
    from app.engines.scoring_engine import calculate_trust_score

    device_signals = {
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/125.0.0.0 Safari/537.36",
        "timezone": "Asia/Kolkata", "screen_res": "1920x1080",
        "language": "en-US", "platform": "Win32", "touch_points": 0,
    }
    behavior_signals = {
        "typing_speed_wpm": 45.0, "mouse_event_count": 120,
        "key_hold_times": [90.0, 95.0, 88.0, 92.0] * 10,
        "flight_times": [110.0, 105.0, 98.0] * 10,
        "mouse_speeds": [200.0, 220.0, 195.0] * 10,
        "total_keystrokes": 40,
    }

    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"home_timezone": "Asia/Kolkata", "home_country": "IN"}
    ]
    mock_sb.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []

    async def fake_flagged(_ip):
        return None

    async def fake_geo(_ip):
        return {"country": "IN", "city": "Mumbai", "ip": "1.2.3.4", "latitude": 19.0, "longitude": 72.8}

    async def fake_history(_ip, _uid):
        return True

    async def fake_last_login(_uid):
        return None

    samples = []
    with patch("app.engines.fingerprint_engine.get_supabase", return_value=mock_sb), \
         patch("app.engines.network_engine.check_flagged_ip", side_effect=fake_flagged), \
         patch("app.engines.network_engine.geolocate_ip", side_effect=fake_geo), \
         patch("app.engines.network_engine.check_ip_history_for_user", side_effect=fake_history), \
         patch("app.engines.network_engine.get_last_login_for_user", side_effect=fake_last_login), \
         patch("app.database.supabase_client.get_supabase", return_value=mock_sb), \
         patch("app.engines.scoring_engine.get_supabase", return_value=mock_sb):

        for i in range(iterations):
            _device_cache.clear()  # force the full lookup path each iteration
            start = time.perf_counter()

            device_result = evaluate_device(f"user-{i}", device_signals)
            behavior_result = evaluate_behavior(behavior_signals)
            network_result = asyncio.run(evaluate_network("103.21.124.8", f"user-{i}"))
            calculate_trust_score(
                device_result["device_score"],
                behavior_result["behavior_score"],
                network_result["network_score"],
            )

            elapsed_ms = (time.perf_counter() - start) * 1000
            samples.append(elapsed_ms)

    return samples


# ---------------------------------------------------------------------
# Part 2: HTTP-layer concurrency against the live local server
# ---------------------------------------------------------------------

def measure_http_concurrency(base_url: str = "http://127.0.0.1:8001",
                              concurrency: int = 50, requests_per_worker: int = 10) -> dict | None:
    import httpx

    try:
        httpx.get(f"{base_url}/health", timeout=3.0)
    except Exception as e:
        print(f"\n  HTTP layer test skipped: backend not reachable at {base_url} ({e}).")
        print("  Start it with: cd backend && ./venv/Scripts/python.exe -m uvicorn main:app --port 8001")
        return None

    async def worker(client: httpx.AsyncClient, samples: list[float]):
        for _ in range(requests_per_worker):
            start = time.perf_counter()
            await client.get(f"{base_url}/health")
            samples.append((time.perf_counter() - start) * 1000)

    async def run():
        samples: list[float] = []
        async with httpx.AsyncClient() as client:
            wall_start = time.perf_counter()
            await asyncio.gather(*[worker(client, samples) for _ in range(concurrency)])
            wall_elapsed = time.perf_counter() - wall_start
        return samples, wall_elapsed

    samples, wall_elapsed = asyncio.run(run())
    total_requests = concurrency * requests_per_worker
    return {
        "samples": samples,
        "total_requests": total_requests,
        "wall_seconds": wall_elapsed,
        "throughput_rps": total_requests / wall_elapsed,
    }


def main():
    print("=" * 72)
    print("TrustSphere AI — Load & Latency Report")
    print("=" * 72)

    print("\n[1/2] Engine-compute pipeline (device + behavior + network + scoring,")
    print("       Supabase/HTTP I/O boundary mocked — measures pure algorithm cost)")
    engine_samples = measure_engine_pipeline(iterations=500)
    _report("Full trust-score pipeline (per login)", engine_samples)
    p95 = _percentile(sorted(engine_samples), 95)
    print(f"\n  --> {p95:.2f} ms p95 compute cost per login evaluation "
          f"(500 iterations, this machine).")

    print("\n[2/2] HTTP-layer concurrency against the live local backend")
    http_result = measure_http_concurrency(concurrency=50, requests_per_worker=10)
    if http_result:
        _report("/health under 50 concurrent clients x10 requests each", http_result["samples"])
        print(f"\n  --> {http_result['total_requests']} requests in "
              f"{http_result['wall_seconds']:.2f}s = {http_result['throughput_rps']:.1f} req/s "
              f"sustained throughput.")

    print("\n" + "=" * 72)
    print("Note: this measures compute + HTTP-stack cost on THIS machine, not a")
    print("production-scale deployment. Real login latency also includes actual")
    print("Supabase/Neo4j network round-trips, which need the integration-test")
    print("infrastructure in tests/integration/ (real credentials or local Docker)")
    print("to measure honestly — this script deliberately does not guess that part.")
    print("=" * 72)


if __name__ == "__main__":
    main()
