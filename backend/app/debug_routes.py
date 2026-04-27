from flask import Blueprint, jsonify, session, abort

from .models import LLMJob

debug_bp = Blueprint("debug", __name__, url_prefix="/api/debug")


@debug_bp.before_request
def _require_session_for_debug():
    """Debug routes are dev-only (see app factory) but still require a signed-in user."""
    if not session.get("user_id"):
        abort(403)


@debug_bp.route("/jobs")
def debug_jobs():
    """Shows the last 20 LLMJobs and their status/errors (dev only)."""
    jobs = LLMJob.query.order_by(LLMJob.created_at.desc()).limit(20).all()
    return jsonify(
        [
            {
                "id": j.id,
                "artist_id": j.artist_id,
                "discussion_id": j.discussion_id,
                "status": j.status,
                "scheduled_time": j.scheduled_time.isoformat(),
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "error_msg": j.error_msg,
            }
            for j in jobs
        ]
    )


@debug_bp.route("/run-job/<int:job_id>", methods=["POST"])
def debug_run_job(job_id):
    """Synchronously runs a pending job (dev only)."""
    from .services.llm_worker import _execute_job

    try:
        _execute_job(job_id)
        job = LLMJob.query.get(job_id)
        return jsonify({"status": job.status, "error_msg": job.error_msg})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
