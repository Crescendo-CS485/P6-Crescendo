import random
from datetime import datetime, timezone, timedelta
from ..models import LLMJob
from .stagger_scheduler import StaggerScheduler


class TriggerHandlerService:
    def handle_user_reply(self, artist_id: int, discussion_id: int) -> dict:
        """
        User-reply trigger — fires when a human posts in a discussion.
        Schedules 1–2 bot responses targeted at the exact discussion the user posted in.
        Dedup is scoped per discussion with a shorter 30s window to avoid stacking jobs
        if the user posts multiple times quickly.
        """
        # Dedup: skip if a pending job already exists for this discussion in the last 30s
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=30)
        recent_pending = LLMJob.query.filter(
            LLMJob.discussion_id == discussion_id,
            LLMJob.status == "pending",
            LLMJob.created_at >= cutoff,
        ).first()

        if recent_pending:
            return {"message": "Response already scheduled", "job_count": 0}

        scheduler = StaggerScheduler()
        job_count = scheduler.schedule_jobs({
            "artist_id": artist_id,
            "discussion_id": discussion_id,
            "bot_count": random.randint(1, 2),
        })
        return {"message": "LLM response scheduled", "job_count": job_count}
