"""
Run the backend locally in a production-like configuration.

- Uses the same app factory path as AWS Lambda (`create_app()`), i.e. NO `seed()`
- Sets `AWS_LAMBDA_FUNCTION_NAME` so Lambda-only behavior matches production:
  - APScheduler is disabled
  - Debug routes are not registered

This is meant for local smoke testing against a real Postgres DB.
"""

import os

os.environ.setdefault("AWS_LAMBDA_FUNCTION_NAME", "local")
os.environ.setdefault("FLASK_ENV", "production")

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)

