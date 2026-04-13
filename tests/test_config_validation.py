import pytest


def test_lambda_requires_anthropic_api_key(monkeypatch):
    """CI guard: if Config stops populating ANTHROPIC_API_KEY, Lambda should fail fast."""
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "unit-test")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    from app import create_app

    with pytest.raises(RuntimeError, match=r"ANTHROPIC_API_KEY must be set"):
        create_app()


def test_lambda_allows_startup_when_anthropic_api_key_present(monkeypatch):
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "unit-test")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    from app import create_app

    app = create_app()
    assert app.config.get("ANTHROPIC_API_KEY") == "test-key"
