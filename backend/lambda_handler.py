from a2wsgi import WSGIMiddleware
from app import create_app
from mangum import Mangum

flask_app = create_app()

# This repo does not include migrations. If you need to bootstrap missing tables for a new
# deployment, opt into a one-time `create_all()` by setting LAMBDA_CREATE_TABLES=1.
#
# Keeping DDL out of the default import path avoids adding cold-start latency and avoids
# DDL race conditions during scale-out.
if __import__("os").environ.get("LAMBDA_CREATE_TABLES") == "1":
    try:
        from app import db  # type: ignore

        with flask_app.app_context():
            db.create_all()
    except Exception:
        # If the DB is unreachable during cold start, let requests fail with normal API errors.
        # This keeps the handler importable so Lambda can surface logs/health.
        pass

handler = Mangum(WSGIMiddleware(flask_app), lifespan="off")
