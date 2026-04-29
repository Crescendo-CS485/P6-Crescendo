from .. import db
from ..models import Discussion, Notification, Post, User


def create_reply_notifications(discussion: Discussion, post: Post) -> int:
    actor = post.author or db.session.get(User, post.author_user_id)
    if not actor:
        return 0

    recipient_rows = (
        db.session.query(User.id)
        .join(Post, Post.author_user_id == User.id)
        .filter(Post.discussion_id == discussion.id)
        .filter(Post.is_deleted.is_(False))
        .filter(User.is_bot.is_(False))
        .filter(User.id != post.author_user_id)
        .distinct()
        .all()
    )
    recipient_ids = {int(row[0]) for row in recipient_rows}

    if discussion.author_user_id != post.author_user_id:
        author = db.session.get(User, discussion.author_user_id)
        if author and not author.is_bot:
            recipient_ids.add(author.id)

    notification_type = "llm_reply" if actor.is_bot else "reply"
    for user_id in sorted(recipient_ids):
        db.session.add(
            Notification(
                user_id=user_id,
                discussion_id=discussion.id,
                post_id=post.id,
                actor_user_id=post.author_user_id,
                notification_type=notification_type,
            )
        )

    return len(recipient_ids)
