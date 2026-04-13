import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

db = SQLAlchemy()


def create_app(test_config=None):
    app = Flask(__name__)

    # Always load the default config so core settings (DB URI, secrets, etc.) exist,
    # then override with any test-specific mapping.
    from config import Config
    app.config.from_object(Config())
    if test_config:
        app.config.from_mapping(test_config)

    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_HTTPONLY"] = True

    is_lambda = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
    if is_lambda and not app.config.get("ANTHROPIC_API_KEY") and not app.config.get("TESTING"):
        raise RuntimeError(
            "ANTHROPIC_API_KEY must be set to enable LLM features in Lambda"
        )

    db.init_app(app)
    CORS(app)

    from .routes import bp
    app.register_blueprint(bp)

    from .auth_routes import auth_bp
    app.register_blueprint(auth_bp)

    from .list_routes import list_bp
    app.register_blueprint(list_bp)

    if not is_lambda:
        from .scheduler import init_scheduler
        init_scheduler(app)

    return app
