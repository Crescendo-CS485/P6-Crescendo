"""
One-off local utility to make seeded community discussions feel coherent.

It updates the *existing* seeded discussions (instead of deleting) so URLs/IDs
remain stable. Intended for local/dev databases only.
"""

from __future__ import annotations

import os
import sys

# Ensure `backend/` is on sys.path when running as a script.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from datetime import datetime, timezone

from app import create_app, db
from app.models import Artist, Discussion, Post, Album, User


def _pick_album_titles(artist_id: int, limit: int = 2) -> list[str]:
    albums = (
        Album.query.filter_by(artist_id=artist_id)
        .filter(~Album.title.like("Crescendo Catalog #%"))
        .filter(~Album.title.like("Spotlight —%"))
        .order_by(Album.user_score.desc().nullslast(), Album.release_year.desc().nullslast())
        .limit(limit)
        .all()
    )
    return [a.title for a in albums if a and a.title]


def _new_titles_for_artist(artist: Artist) -> list[str]:
    album_titles = _pick_album_titles(artist.id, limit=2)
    primary = album_titles[0] if album_titles else None
    secondary = album_titles[1] if len(album_titles) > 1 else None

    base = [
        f"{artist.name} essentials — where should a new listener start?",
        f"First impressions thread: {primary}" if primary else f"First impressions — what drew you to {artist.name}?",
    ]

    if secondary:
        base.append(f"Deep cuts & favorites: {secondary}")
    else:
        base.append(f"Favorite tracks, deep cuts, and why they hit")

    # Return at most 2 titles for the existing seed shape
    return base[:2]


def _new_openers_for_artist(artist: Artist) -> list[str]:
    album_titles = _pick_album_titles(artist.id, limit=1)
    primary = album_titles[0] if album_titles else None

    opener1 = (
        f"If you're brand new to {artist.name}, what should you listen to first — and why?"
        " Drop your top track / album recs."
    )
    opener2 = (
        f"Just gave {primary} a fresh listen — what’s your favorite moment on it?"
        if primary
        else f"Just rediscovered {artist.name}. What’s the one track you’d use to convert a friend?"
    )
    return [opener1, opener2]


def cleanup_discussions() -> dict[str, int]:
    updated_discussions = 0
    updated_posts = 0

    bot_ids = [bid for (bid,) in User.query.filter_by(is_bot=True).with_entities(User.id).all()]

    for artist in Artist.query.order_by(Artist.id.asc()).all():
        discussions = (
            Discussion.query.filter_by(artist_id=artist.id)
            .order_by(Discussion.id.asc())
            .limit(2)
            .all()
        )
        if not discussions:
            continue

        titles = _new_titles_for_artist(artist)
        openers = _new_openers_for_artist(artist)

        for idx, d in enumerate(discussions):
            if idx < len(titles):
                d.title = titles[idx]
                updated_discussions += 1

            # Update only when earliest post author is a known bot.
            p = (
                Post.query.filter_by(discussion_id=d.id, is_deleted=False)
                .order_by(Post.id.asc())
                .first()
            )
            if p and p.author_user_id in bot_ids:
                if idx < len(openers):
                    p.body = openers[idx]
                    updated_posts += 1

            d.last_activity_at = datetime.now(timezone.utc)

    db.session.commit()
    return {"updated_discussions": updated_discussions, "updated_posts": updated_posts}


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        res = cleanup_discussions()
        print(res)

