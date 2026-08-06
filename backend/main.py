"""
TrustSphere AI — FastAPI Entry Point
Real-time Identity Trust Platform for Bank of Baroda Hackathon 2026
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config.settings import settings
from app.database.neo4j_client import close_neo4j_driver
from app.routers import auth, score, sessions, graph, dashboard, config, onboarding, recovery, insider

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.utils.rate_limiter import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    yield
    # Cleanup on shutdown
    close_neo4j_driver()


app = FastAPI(
    title="TrustSphere AI",
    description="Real-time Identity Trust Platform — Bank of Baroda Hackathon 2026",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(score.router,     prefix="/api/score",     tags=["Trust Score"])
app.include_router(sessions.router,  prefix="/api/sessions",  tags=["Sessions"])
app.include_router(graph.router,     prefix="/api/graph",     tags=["Fraud Graph"])
app.include_router(dashboard.router, prefix="/api/stats",     tags=["Dashboard"])
app.include_router(config.router,    prefix="/api/config",    tags=["Config"])
app.include_router(onboarding.router, prefix="/api/onboarding", tags=["Onboarding"])
app.include_router(recovery.router, prefix="/api/recovery", tags=["Recovery"])
app.include_router(insider.router, prefix="/api/insider", tags=["Insider Threat"])


@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "TrustSphere AI", "version": "1.0.0"}


@app.get("/", tags=["System"])
async def root():
    return {"status": "ok", "message": "TrustSphere AI API is running. Visit /docs for documentation."}


# --- Demo reset endpoint (development only) ---
if settings.ENVIRONMENT == "development":
    from app.database.supabase_client import get_supabase

    @app.get("/api/demo/reset", tags=["Demo"])
    async def demo_reset():
        """Clear session data for a clean demo. Development only."""
        sb = get_supabase()
        try:
            sb.table("behavioral_metrics").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            sb.table("otp_sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            sb.table("login_events").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            return {"status": "reset", "message": "Login events, metrics, and OTP sessions cleared."}
        except Exception as e:
            return {"status": "error", "message": str(e)}
