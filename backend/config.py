import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    def __init__(self):
        # Read from the environment at app creation time (not module import time)
        # so tests and deploy environments can override safely.
        self.SQLALCHEMY_DATABASE_URI = os.environ.get(
            "DATABASE_URL", "postgresql://localhost/crescendo_p4"
        )
        self.SQLALCHEMY_TRACK_MODIFICATIONS = False
        self.ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
        self.SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-crescendo")
