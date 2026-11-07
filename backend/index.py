# Entry point for Vercel: it looks for a FastAPI `app` in index.py.
# Locally you still run: python -m uvicorn app.main:app --reload --port 8000
from app.main import app  # noqa: F401
