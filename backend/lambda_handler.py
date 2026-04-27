from a2wsgi import WSGIMiddleware
from app import create_app
from mangum import Mangum

flask_app = create_app()

# Lambda deployments don’t run `run.py` (which calls `db.create_all()`), and this repo
# doesn’t include migrations. Ensure new tables exist before serving requests.
try:
    from app import db  # type: ignore

    with flask_app.app_context():
        db.create_all()
except Exception:
    # If the DB is unreachable during cold start, let requests fail with normal API errors.
    # This keeps the handler importable so Lambda can surface logs/health.
    pass

handler = Mangum(WSGIMiddleware(flask_app), lifespan="off")
