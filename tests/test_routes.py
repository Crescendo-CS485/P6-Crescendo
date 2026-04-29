"""
Tests for backend/app/routes.py and app/debug_routes.py (when ENABLE_DEBUG_ROUTES).

Covers route handlers including get_artists, get_artist, get_genres, post_event,
get_artist_discussions, create_post, get_discussion_posts, get_albums,
get_album_genres, get_all_discussions, get_stats, search, debug_jobs, debug_run_job.
"""

from datetime import datetime, timezone, timedelta, date
from unittest.mock import patch, MagicMock
from app import db
from app.models import (
    Artist, Genre, User, Discussion, Post, Album,
    LLMJob, LLMPersona, Notification, List, ListAlbum, ListLike,
)


# ── GET /api/artists ────────────────────────────────────────────────────

class TestGetArtists:
    """Spec tests 1-9"""

    def test_default_response(self, client, make_artist):
        make_artist(name="A1")
        db.session.commit()
        r = client.get("/api/artists")
        assert r.status_code == 200
        data = r.get_json()
        assert "artists" in data
        assert "total" in data
        assert data["page"] == 1
        assert data["total"] >= 1

    def test_active_discussions_filter(self, client, make_artist):
        make_artist(name="High", activity_score=9.0)
        make_artist(name="Low", activity_score=7.0)
        db.session.commit()
        r = client.get("/api/artists?active_discussions=true")
        data = r.get_json()
        names = [a["name"] for a in data["artists"]]
        assert "High" in names
        assert "Low" not in names

    def test_active_discussions_false(self, client, make_artist):
        make_artist(name="High2", activity_score=9.0)
        make_artist(name="Low2", activity_score=7.0)
        db.session.commit()
        r = client.get("/api/artists?active_discussions=false")
        data = r.get_json()
        assert data["total"] == 2

    def test_genre_filter(self, client, make_genre, make_artist):
        pop = make_genre("Pop")
        rock = make_genre("Rock")
        make_artist(name="PopArtist", genres=[pop])
        make_artist(name="RockArtist", genres=[rock])
        db.session.commit()
        r = client.get("/api/artists?genre=Pop")
        data = r.get_json()
        assert len(data["artists"]) == 1
        assert data["artists"][0]["name"] == "PopArtist"

    def test_multi_genre_filter(self, client, make_genre, make_artist):
        pop = make_genre("Pop")
        rock = make_genre("Rock")
        jazz = make_genre("Jazz")
        make_artist(name="PopArt", genres=[pop])
        make_artist(name="RockArt", genres=[rock])
        make_artist(name="JazzArt", genres=[jazz])
        db.session.commit()
        r = client.get("/api/artists?genre=Pop&genre=Rock")
        data = r.get_json()
        assert data["total"] == 2

    def test_sort_activity(self, client, make_artist):
        make_artist(name="Low3", activity_score=5.0)
        make_artist(name="High3", activity_score=9.0)
        db.session.commit()
        r = client.get("/api/artists?sort=activity")
        data = r.get_json()
        assert data["artists"][0]["activityScore"] == 9.0

    def test_sort_recent(self, client, make_artist, make_user, make_discussion):
        few = make_artist(name="Few")
        many = make_artist(name="Many")
        u = make_user()
        make_discussion(many.id, u.id, title="D1")
        make_discussion(many.id, u.id, title="D2")
        make_discussion(few.id, u.id, title="D3")
        db.session.commit()
        r = client.get("/api/artists?sort=recent")
        data = r.get_json()
        assert data["artists"][0]["discussionCount"] == 2

    def test_pagination(self, client, make_artist):
        for i in range(3):
            make_artist(name=f"Art{i}", activity_score=float(i))
        db.session.commit()
        r = client.get("/api/artists?page=2&per_page=1")
        data = r.get_json()
        assert data["page"] == 2
        assert data["pages"] == 3
        assert len(data["artists"]) == 1

    def test_empty_when_no_match(self, client, make_artist):
        make_artist(name="LowScore", activity_score=3.0)
        db.session.commit()
        r = client.get("/api/artists?active_discussions=true")
        data = r.get_json()
        assert data["artists"] == []
        assert data["total"] == 0

    def test_listener_count_excludes_deleted_posts(self, client, make_artist, make_user, make_discussion, make_post):
        artist = make_artist(name="ListenerCountArtist")
        user = make_user(handle="@listener_visible")
        discussion = make_discussion(artist.id, user.id, title="Listeners")
        make_post(discussion.id, user.id, body="Visible", is_deleted=False)
        make_post(discussion.id, user.id, body="Deleted", is_deleted=True)
        db.session.commit()

        r = client.get("/api/artists")
        assert r.status_code == 200
        payload = r.get_json()["artists"][0]
        assert payload["listenerCount"] == 1

    def test_list_latest_thread_matches_most_recent_discussion(
        self, client, make_artist, make_user, make_discussion
    ):
        artist = make_artist(name="LatestListHost")
        u = make_user()
        make_discussion(
            artist.id, u.id, title="Older",
            last_activity_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        newer = make_discussion(
            artist.id, u.id, title="NewerRow",
            last_activity_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
        )
        db.session.commit()
        r = client.get("/api/artists")
        assert r.status_code == 200
        row = next(a for a in r.get_json()["artists"] if a["name"] == "LatestListHost")
        assert row["latestThread"]["id"] == str(newer.id)
        assert row["latestThread"]["title"] == "NewerRow"


# ── GET /api/artists/<id> ──────────────────────────────────────────────

class TestGetArtist:
    """Spec tests 10-11"""

    def test_returns_artist(self, client, make_artist):
        a = make_artist(name="Solo")
        db.session.commit()
        r = client.get(f"/api/artists/{a.id}")
        assert r.status_code == 200
        assert r.get_json()["artist"]["id"] == str(a.id)

    def test_404_missing(self, client):
        r = client.get("/api/artists/9999")
        assert r.status_code == 404

    def test_returns_artist_with_latest_thread_title(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="Lonely Artist", activity_score=4.2, discussion_count=1,
                        latest_thread_title="Lone thread", latest_thread_timestamp="2026-04-05T00:00:00Z")
        u = make_user(display_name="Author", handle="@author", is_bot=False)
        d = make_discussion(a.id, u.id, title="Thread Title")
        db.session.commit()
        r = client.get(f"/api/artists/{a.id}")
        assert r.status_code == 200
        data = r.get_json()["artist"]
        assert data["id"] == str(a.id)
        assert data["name"] == "Lonely Artist"
        assert data["latestThread"]["id"] == str(d.id)
        assert data["latestThread"]["title"] == "Thread Title"


class TestCreateArtist:
    def test_success_creates_artist_and_genres(self, client, app):
        app.config["ENABLE_CATALOG_WRITE"] = True
        reg = client.post("/api/auth/register", json={
            "displayName": "Creator",
            "handle": "creator_artist",
            "email": "creator_artist@example.com",
            "password": "password123",
        })
        assert reg.status_code == 201

        r = client.post("/api/artists", json={
            "name": "New Artist",
            "bio": "A bio",
            "genres": ["Pop", "Dream Pop"],
        })
        assert r.status_code == 201
        data = r.get_json()["artist"]
        assert data["name"] == "New Artist"
        assert "Pop" in data["genres"]
        assert "Dream Pop" in data["genres"]

    def test_disabled_returns_403(self, client, app):
        app.config["ENABLE_CATALOG_WRITE"] = False
        r = client.post("/api/artists", json={"name": "Blocked Artist"})
        assert r.status_code == 403

    def test_requires_auth(self, client, app):
        app.config["ENABLE_CATALOG_WRITE"] = True
        r = client.post("/api/artists", json={"name": "NoAuth Artist"})
        assert r.status_code == 401

    def test_missing_or_blank_name_returns_400(self, client, app):
        app.config["ENABLE_CATALOG_WRITE"] = True
        reg = client.post("/api/auth/register", json={
            "displayName": "Name Checker",
            "handle": "name_checker",
            "email": "name_checker@example.com",
            "password": "password123",
        })
        assert reg.status_code == 201

        missing = client.post("/api/artists", json={})
        assert missing.status_code == 400
        blank = client.post("/api/artists", json={"name": "   "})
        assert blank.status_code == 400


# ── GET /api/genres ─────────────────────────────────────────────────────

class TestGetGenres:
    """Spec tests 12-13"""

    def test_sorted_alphabetically(self, client, make_genre):
        make_genre("Rock")
        make_genre("Jazz")
        make_genre("Pop")
        db.session.commit()
        r = client.get("/api/genres")
        assert r.status_code == 200
        assert r.get_json()["genres"] == ["Jazz", "Pop", "Rock"]

    def test_empty(self, client):
        r = client.get("/api/genres")
        assert r.status_code == 200
        assert r.get_json()["genres"] == []


# ── POST /api/events ───────────────────────────────────────────────────

def _register_session(client):
    r = client.post(
        "/api/auth/register",
        json={
            "displayName": "Event Human",
            "handle": "eventhuman",
            "email": "eventhuman@example.com",
            "password": "password123",
        },
    )
    assert r.status_code == 201


class TestPostEvent:
    """Legacy page-activation endpoint is disabled; LLM replies are post-triggered."""

    def test_event_trigger_is_disabled(self, client, make_artist):
        _register_session(client)
        artist = make_artist(name="Legacy Trigger Artist")
        db.session.commit()

        r = client.post("/api/events", json={
            "eventType": "page_activation",
            "artistId": artist.id,
        })

        assert r.status_code == 410
        assert "posts only" in r.get_json()["error"]
        assert LLMJob.query.count() == 0

    def test_missing_artist_id(self, client):
        _register_session(client)
        r = client.post("/api/events", json={"eventType": "page_activation"})
        assert r.status_code == 400
        assert "artistId" in r.get_json()["error"]

    def test_events_require_auth(self, client, make_artist):
        a = make_artist(name="NoAuthTrig")
        db.session.commit()
        r = client.post("/api/events", json={
            "eventType": "page_activation",
            "artistId": a.id,
        })
        assert r.status_code == 401


# ── GET /api/artists/<id>/discussions ──────────────────────────────────

class TestGetArtistDiscussions:
    """Spec tests 18-20"""

    def test_returns_discussions(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="DiscArt")
        u = make_user(handle="@disc_rt")
        make_discussion(a.id, u.id, title="D1")
        make_discussion(a.id, u.id, title="D2")
        db.session.commit()
        r = client.get(f"/api/artists/{a.id}/discussions")
        assert r.status_code == 200
        data = r.get_json()
        assert len(data["discussions"]) == 2
        assert data["total"] == 2

    def test_404_missing_artist(self, client):
        r = client.get("/api/artists/9999/discussions")
        assert r.status_code == 404

    def test_ordered_by_last_activity(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="OrderArt")
        u = make_user(handle="@order_rt")
        make_discussion(
            a.id, u.id, title="Old",
            last_activity_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        make_discussion(
            a.id, u.id, title="New",
            last_activity_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
        )
        db.session.commit()
        r = client.get(f"/api/artists/{a.id}/discussions")
        data = r.get_json()
        assert data["discussions"][0]["title"] == "New"


# ── POST /api/discussions/<id>/posts ───────────────────────────────────

class TestCreateArtistDiscussion:
    """Tests for POST /api/artists/<id>/discussions"""

    def test_creates_discussion_with_opening_post(self, client, make_artist, make_user):
        artist = make_artist(name="Thread Artist")
        user = make_user(display_name="Thread Starter", handle="@threadstarter")
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = user.id

        with patch(
            "app.services.trigger_handler.TriggerHandlerService.handle_user_reply",
            return_value={"job_count": 1},
        ) as trigger:
            resp = client.post(
                f"/api/artists/{artist.id}/discussions",
                json={
                    "title": "Best album opener?",
                    "body": "I keep coming back to the first track.",
                },
            )

        assert resp.status_code == 201
        data = resp.get_json()
        assert data["discussion"]["title"] == "Best album opener?"
        assert data["discussion"]["postCount"] == 1
        assert data["llmTriggered"] is False
        assert data["post"]["body"] == "I keep coming back to the first track."
        assert data["post"]["author"]["handle"] == "@threadstarter"
        trigger.assert_not_called()

        discussion = Discussion.query.get(int(data["discussion"]["id"]))
        assert discussion.artist_id == artist.id
        assert discussion.author_user_id == user.id
        assert discussion.post_count == 1
        assert Post.query.filter_by(discussion_id=discussion.id).count() == 1

    def test_triggers_llm_when_requested(self, client, make_artist, make_user):
        artist = make_artist(name="Thread LLM Artist")
        user = make_user(display_name="Thread LLM Starter", handle="@threadllm")
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = user.id

        with patch(
            "app.services.trigger_handler.TriggerHandlerService.handle_user_reply",
            return_value={"job_count": 2},
        ) as trigger:
            resp = client.post(
                f"/api/artists/{artist.id}/discussions",
                json={
                    "title": "Who should reply?",
                    "body": "Let's invite some bot replies.",
                    "triggerLlm": True,
                },
            )

        assert resp.status_code == 201
        data = resp.get_json()
        assert data["llmTriggered"] is True
        trigger.assert_called_once()
        assert trigger.call_args.kwargs["artist_id"] == artist.id
        assert trigger.call_args.kwargs["discussion_id"] == int(data["discussion"]["id"])

    def test_requires_authentication(self, client, make_artist):
        artist = make_artist(name="No Auth Thread")
        db.session.commit()

        resp = client.post(
            f"/api/artists/{artist.id}/discussions",
            json={"title": "Topic", "body": "Body"},
        )

        assert resp.status_code == 401

    def test_requires_title_and_body(self, client, make_artist, make_user):
        artist = make_artist(name="Invalid Thread")
        user = make_user(handle="@invalidthread")
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = user.id

        missing_title = client.post(
            f"/api/artists/{artist.id}/discussions",
            json={"body": "Body"},
        )
        missing_body = client.post(
            f"/api/artists/{artist.id}/discussions",
            json={"title": "Topic"},
        )

        assert missing_title.status_code == 400
        assert missing_title.get_json()["error"] == "Title is required"
        assert missing_body.status_code == 400
        assert missing_body.get_json()["error"] == "Body is required"


class TestCreatePost:
    """Spec tests 21-26"""

    def test_with_session_user(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="PostArt")
        u = make_user(handle="@sess_user")
        d = make_discussion(a.id, u.id)
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        r = client.post(f"/api/discussions/{d.id}/posts", json={"body": "Great song!"})
        assert r.status_code == 201
        data = r.get_json()
        assert data["post"]["body"] == "Great song!"
        assert data["post"]["author"]["handle"] == "@sess_user"
        assert data["llmTriggered"] is False
        assert Notification.query.count() == 0

    def test_notifies_prior_human_participants(self, client, make_artist, make_user, make_discussion, make_post):
        a = make_artist(name="NotifyPostArt")
        owner = make_user(display_name="Thread Owner", handle="@thread_owner")
        responder = make_user(display_name="Responder", handle="@responder")
        d = make_discussion(a.id, owner.id, title="Notification thread")
        make_post(d.id, owner.id, body="Opening thought")
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = responder.id

        r = client.post(f"/api/discussions/{d.id}/posts", json={"body": "I have a reply"})

        assert r.status_code == 201
        notifications = Notification.query.all()
        assert len(notifications) == 1
        assert notifications[0].user_id == owner.id
        assert notifications[0].actor_user_id == responder.id
        assert notifications[0].notification_type == "reply"
        assert notifications[0].discussion_id == d.id

    def test_does_not_notify_bots_or_self(self, client, make_artist, make_user, make_discussion, make_post):
        a = make_artist(name="SelfNotifyArt")
        human = make_user(handle="@self_notify_user")
        bot = make_user(display_name="Seed Bot", handle="@self_notify_bot", is_bot=True)
        d = make_discussion(a.id, human.id, title="Self notification thread")
        make_post(d.id, human.id, body="My own thought")
        make_post(d.id, bot.id, body="Bot thought")
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = human.id

        r = client.post(f"/api/discussions/{d.id}/posts", json={"body": "Another thought"})

        assert r.status_code == 201
        assert Notification.query.count() == 0

    def test_triggers_llm_when_requested(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="PostLlmArt")
        u = make_user(handle="@post_llm_user")
        d = make_discussion(a.id, u.id)
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = u.id

        with patch(
            "app.services.trigger_handler.TriggerHandlerService.handle_user_reply",
            return_value={"job_count": 1},
        ) as trigger:
            r = client.post(
                f"/api/discussions/{d.id}/posts",
                json={"body": "Invite replies", "triggerLlm": True},
            )

        assert r.status_code == 201
        data = r.get_json()
        assert data["llmTriggered"] is True
        trigger.assert_called_once_with(artist_id=a.id, discussion_id=d.id)

    def test_without_session_returns_401(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="PostArt2")
        u = make_user(handle="@anon_creator")
        d = make_discussion(a.id, u.id)
        db.session.commit()
        r = client.post(f"/api/discussions/{d.id}/posts", json={
            "body": "Nice!",
            "displayName": "Guest",
            "handle": "@guest",
        })
        assert r.status_code == 401

    def test_session_identity_ignores_spoofed_body_fields(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="NewPostArtist", activity_score=3.0)
        bot = make_user(display_name="Seed Bot", handle="@seedbot", is_bot=True)
        human = make_user(display_name="Real Human", handle="@realhuman")
        d = make_discussion(a.id, bot.id, title="Discussion")
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = human.id

        payload = {"body": "Hello world", "displayName": "FakeName", "handle": "@fakehandle"}
        resp = client.post(f"/api/discussions/{d.id}/posts", json=payload)
        assert resp.status_code == 201
        post = resp.get_json()["post"]
        assert post["body"] == "Hello world"
        assert post["author"]["displayName"] == "Real Human"
        assert post["author"]["handle"] == "@realhuman"

    def test_404_missing_discussion(self, client, make_user):
        u = make_user(handle="@miss_disc")
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        r = client.post("/api/discussions/9999/posts", json={"body": "Hello"})
        assert r.status_code == 404

    def test_400_empty_body(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="EmptyBody")
        u = make_user(handle="@empty_body")
        d = make_discussion(a.id, u.id)
        db.session.commit()
        r = client.post(f"/api/discussions/{d.id}/posts", json={"body": ""})
        assert r.status_code == 400

    def test_increments_post_count(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="CountArt")
        u = make_user(handle="@count_user")
        d = make_discussion(a.id, u.id, post_count=5)
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        client.post(f"/api/discussions/{d.id}/posts", json={"body": "Test"})
        db.session.expire(d)
        assert Discussion.query.get(d.id).post_count == 6


class TestNotifications:
    def test_get_notifications_requires_auth(self, client):
        r = client.get("/api/notifications")
        assert r.status_code == 401

    def test_get_notifications_returns_unread_count(self, client, make_artist, make_user, make_discussion, make_post):
        artist = make_artist(name="NotificationListArtist")
        owner = make_user(display_name="Notify Owner", handle="@notify_owner")
        responder = make_user(display_name="Notify Responder", handle="@notify_responder")
        discussion = make_discussion(artist.id, owner.id, title="Unread count thread")
        opening_post = make_post(discussion.id, owner.id, body="Opening")
        reply_post = make_post(discussion.id, responder.id, body="Reply")
        notification = Notification(
            user_id=owner.id,
            actor_user_id=responder.id,
            discussion_id=discussion.id,
            post_id=reply_post.id,
            notification_type="reply",
        )
        read_notification = Notification(
            user_id=owner.id,
            actor_user_id=responder.id,
            discussion_id=discussion.id,
            post_id=opening_post.id,
            notification_type="reply",
            is_read=True,
        )
        db.session.add_all([notification, read_notification])
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = owner.id

        r = client.get("/api/notifications")

        assert r.status_code == 200
        data = r.get_json()
        assert data["unreadCount"] == 1
        assert len(data["notifications"]) == 2
        assert data["notifications"][0]["message"] == "Notify Responder replied in Unread count thread"
        assert data["notifications"][0]["discussionId"] == str(discussion.id)

    def test_mark_notification_read(self, client, make_artist, make_user, make_discussion, make_post):
        artist = make_artist(name="MarkReadArtist")
        owner = make_user(handle="@mark_read_owner")
        responder = make_user(handle="@mark_read_responder")
        discussion = make_discussion(artist.id, owner.id)
        post = make_post(discussion.id, responder.id)
        notification = Notification(
            user_id=owner.id,
            actor_user_id=responder.id,
            discussion_id=discussion.id,
            post_id=post.id,
            notification_type="reply",
        )
        db.session.add(notification)
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = owner.id

        r = client.post(f"/api/notifications/{notification.id}/read")

        assert r.status_code == 200
        db.session.refresh(notification)
        assert notification.is_read is True

    def test_mark_all_notifications_read(self, client, make_artist, make_user, make_discussion, make_post):
        artist = make_artist(name="MarkAllReadArtist")
        owner = make_user(handle="@mark_all_owner")
        other_owner = make_user(handle="@mark_all_other_owner")
        responder = make_user(handle="@mark_all_responder")
        discussion = make_discussion(artist.id, owner.id)
        post = make_post(discussion.id, responder.id)
        db.session.add_all([
            Notification(
                user_id=owner.id,
                actor_user_id=responder.id,
                discussion_id=discussion.id,
                post_id=post.id,
                notification_type="reply",
            ),
            Notification(
                user_id=owner.id,
                actor_user_id=responder.id,
                discussion_id=discussion.id,
                post_id=post.id,
                notification_type="reply",
            ),
            Notification(
                user_id=other_owner.id,
                actor_user_id=responder.id,
                discussion_id=discussion.id,
                post_id=post.id,
                notification_type="reply",
            ),
        ])
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = owner.id

        r = client.post("/api/notifications/read-all")

        assert r.status_code == 200
        assert r.get_json()["updated"] == 2
        assert Notification.query.filter_by(user_id=owner.id, is_read=False).count() == 0
        assert Notification.query.filter_by(user_id=other_owner.id, is_read=False).count() == 1


class TestMyDiscussions:
    def test_requires_authentication(self, client):
        r = client.get("/api/me/discussions")
        assert r.status_code == 401

    def test_returns_authored_and_participated_discussions(
        self, client, make_artist, make_user, make_discussion, make_post
    ):
        artist = make_artist(name="ProfileDiscussionArtist")
        user = make_user(display_name="Profile User", handle="@profile_user")
        other = make_user(display_name="Other User", handle="@profile_other")
        authored = make_discussion(
            artist.id,
            user.id,
            title="Authored thread",
            last_activity_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
        participated = make_discussion(
            artist.id,
            other.id,
            title="Participated thread",
            last_activity_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
        )
        unrelated = make_discussion(
            artist.id,
            other.id,
            title="Unrelated thread",
            last_activity_at=datetime(2026, 1, 4, tzinfo=timezone.utc),
        )
        make_post(authored.id, user.id, body="Opening")
        make_post(participated.id, other.id, body="Opening")
        make_post(participated.id, user.id, body="I joined")
        make_post(unrelated.id, other.id, body="Other only")
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = user.id

        r = client.get("/api/me/discussions")

        assert r.status_code == 200
        data = r.get_json()
        assert data["total"] == 2
        assert [d["title"] for d in data["discussions"]] == [
            "Participated thread",
            "Authored thread",
        ]
        by_title = {d["title"]: d for d in data["discussions"]}
        assert by_title["Authored thread"]["isAuthor"] is True
        assert by_title["Participated thread"]["isAuthor"] is False
        assert "Unrelated thread" not in by_title


# ── GET /api/discussions/<id>/posts ────────────────────────────────────

class TestGetDiscussionPosts:
    """Spec tests 27-31"""

    def test_returns_posts_and_discussion(self, client, make_artist, make_user, make_discussion, make_post):
        a = make_artist(name="GetPosts")
        u = make_user(handle="@getposts")
        d = make_discussion(a.id, u.id)
        make_post(d.id, u.id, body="P1")
        make_post(d.id, u.id, body="P2")
        make_post(d.id, u.id, body="P3")
        db.session.commit()
        r = client.get(f"/api/discussions/{d.id}/posts")
        assert r.status_code == 200
        data = r.get_json()
        assert len(data["posts"]) == 3
        assert data["total"] == 3
        assert "discussion" in data

    def test_404_missing_discussion(self, client):
        r = client.get("/api/discussions/9999/posts")
        assert r.status_code == 404

    def test_ordered_ascending(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="OrderPosts")
        u = make_user(handle="@order_posts")
        d = make_discussion(a.id, u.id)
        p1 = Post(
            discussion_id=d.id, author_user_id=u.id, body="First",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        p2 = Post(
            discussion_id=d.id, author_user_id=u.id, body="Second",
            created_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
        )
        db.session.add_all([p1, p2])
        db.session.commit()
        r = client.get(f"/api/discussions/{d.id}/posts")
        posts = r.get_json()["posts"]
        assert posts[0]["body"] == "First"
        assert posts[1]["body"] == "Second"

    def test_deleted_posts_excluded(self, client, make_artist, make_user, make_discussion, make_post):
        a = make_artist(name="Deleted")
        u = make_user(handle="@deleted_post")
        d = make_discussion(a.id, u.id)
        make_post(d.id, u.id, body="Visible")
        make_post(d.id, u.id, body="Gone", is_deleted=True)
        db.session.commit()
        r = client.get(f"/api/discussions/{d.id}/posts")
        data = r.get_json()
        assert len(data["posts"]) == 1
        assert data["total"] == 1

    def test_bot_flair_in_author(self, client, make_artist, make_user, make_discussion, make_post):
        a = make_artist(name="FlairArt")
        bot = make_user(
            display_name="BotFan", handle="@flair_bot",
            is_bot=True, bot_label="Synthetic Fan",
        )
        d = make_discussion(a.id, bot.id)
        make_post(d.id, bot.id, body="Bot says hi")
        db.session.commit()
        r = client.get(f"/api/discussions/{d.id}/posts")
        author = r.get_json()["posts"][0]["author"]
        assert author["isBot"] is True
        assert author["botLabel"] == "Synthetic Fan"


# ── GET /api/albums ─────────────────────────────────────────────────────

class TestGetAlbums:
    """Spec tests 32-36"""

    def test_default_listing(self, client, make_artist, make_album):
        a = make_artist(name="AlbumArt")
        make_album(title="A1", artist_id=a.id)
        db.session.commit()
        r = client.get("/api/albums")
        assert r.status_code == 200
        data = r.get_json()
        assert "albums" in data
        assert data["total"] >= 1

    def test_genre_filter(self, client, make_genre, make_artist, make_album):
        rb = make_genre("R&B")
        pop = make_genre("Pop")
        a = make_artist(name="AlbGenre")
        make_album(title="RB Album", artist_id=a.id, genres=[rb])
        make_album(title="Pop Album", artist_id=a.id, genres=[pop])
        db.session.commit()
        r = client.get("/api/albums?genre=R%26B")
        data = r.get_json()
        assert len(data["albums"]) == 1

    def test_type_filter(self, client, make_artist, make_album):
        a = make_artist(name="TypeArt")
        make_album(title="EP1", artist_id=a.id, album_type="EP")
        make_album(title="Studio1", artist_id=a.id, album_type="studio")
        make_album(title="Studio2", artist_id=a.id, album_type="studio")
        db.session.commit()
        r = client.get("/api/albums?type=EP")
        data = r.get_json()
        assert len(data["albums"]) == 1
        assert data["albums"][0]["albumType"] == "EP"

    def test_search_filter_matches_album_title_and_artist_name(self, client, make_artist, make_album):
        title_artist = make_artist(name="Plain Artist")
        name_artist = make_artist(name="Needle Artist")
        make_album(title="Needle Album", artist_id=title_artist.id)
        make_album(title="Different Title", artist_id=name_artist.id)
        make_album(title="Other Album", artist_id=title_artist.id)
        db.session.commit()

        title_resp = client.get("/api/albums?q=needle")
        title_data = title_resp.get_json()
        title_names = {album["title"] for album in title_data["albums"]}
        assert title_resp.status_code == 200
        assert "Needle Album" in title_names
        assert "Different Title" in title_names
        assert "Other Album" not in title_names

    def test_time_range_year(self, client, make_artist, make_album):
        a = make_artist(name="YearArt")
        make_album(title="2026 Album", artist_id=a.id,
                   release_date=date(2026, 1, 15), release_year=2026)
        make_album(title="2025 Album", artist_id=a.id,
                   release_date=date(2025, 6, 1), release_year=2025)
        db.session.commit()
        r = client.get("/api/albums?time_range=2026")
        data = r.get_json()
        assert len(data["albums"]) == 1
        assert data["albums"][0]["title"] == "2026 Album"

    def test_sort_user_score(self, client, make_artist, make_album):
        a = make_artist(name="ScoreArt")
        make_album(title="Low", artist_id=a.id, user_score=7.0)
        make_album(title="High", artist_id=a.id, user_score=9.5)
        db.session.commit()
        r = client.get("/api/albums?sort=user_score")
        data = r.get_json()
        assert data["albums"][0]["userScore"] == 9.5


class TestCreateAlbum:
    def test_success_creates_album(self, client, app, make_artist):
        app.config["ENABLE_CATALOG_WRITE"] = True
        artist = make_artist(name="Album Target")
        db.session.commit()
        reg = client.post("/api/auth/register", json={
            "displayName": "Album Creator",
            "handle": "album_creator",
            "email": "album_creator@example.com",
            "password": "password123",
        })
        assert reg.status_code == 201

        r = client.post("/api/albums", json={
            "title": "Created Album",
            "artistId": str(artist.id),
            "releaseYear": "2026",
            "albumType": "studio",
            "genres": ["Indie"],
        })
        assert r.status_code == 201
        data = r.get_json()["album"]
        assert data["title"] == "Created Album"
        assert data["releaseYear"] == 2026
        assert "Indie" in data["genres"]

    def test_disabled_returns_403(self, client, app):
        app.config["ENABLE_CATALOG_WRITE"] = False
        r = client.post("/api/albums", json={"title": "Blocked"})
        assert r.status_code == 403

    def test_requires_auth(self, client, app):
        app.config["ENABLE_CATALOG_WRITE"] = True
        r = client.post("/api/albums", json={"title": "NoAuth"})
        assert r.status_code == 401

    def test_missing_fields_and_missing_artist(self, client, app, make_artist):
        app.config["ENABLE_CATALOG_WRITE"] = True
        reg = client.post("/api/auth/register", json={
            "displayName": "Album Validator",
            "handle": "album_validator",
            "email": "album_validator@example.com",
            "password": "password123",
        })
        assert reg.status_code == 201

        missing_title = client.post("/api/albums", json={"artistId": "1"})
        assert missing_title.status_code == 400
        missing_artist = client.post("/api/albums", json={"title": "Needs Artist"})
        assert missing_artist.status_code == 400

        artist = make_artist(name="Exists")
        db.session.commit()
        not_found = client.post("/api/albums", json={
            "title": "Missing Artist",
            "artistId": str(artist.id + 999),
        })
        assert not_found.status_code == 404

    def test_invalid_release_year_returns_400(self, client, app, make_artist):
        app.config["ENABLE_CATALOG_WRITE"] = True
        artist = make_artist(name="Year Artist")
        db.session.commit()
        reg = client.post("/api/auth/register", json={
            "displayName": "Year Validator",
            "handle": "year_validator",
            "email": "year_validator@example.com",
            "password": "password123",
        })
        assert reg.status_code == 201

        for bad_year in ("nope", 2026.7, True):
            resp = client.post("/api/albums", json={
                "title": "Bad Year",
                "artistId": str(artist.id),
                "releaseYear": bad_year,
            })
            assert resp.status_code == 400

    def test_release_year_out_of_range_returns_400(self, client, app, make_artist):
        app.config["ENABLE_CATALOG_WRITE"] = True
        artist = make_artist(name="Range Artist")
        db.session.commit()
        reg = client.post("/api/auth/register", json={
            "displayName": "Range Validator",
            "handle": "range_validator",
            "email": "range_validator@example.com",
            "password": "password123",
        })
        assert reg.status_code == 201
        for bad in (0, -1, 10000):
            resp = client.post("/api/albums", json={
                "title": "Bad Range",
                "artistId": str(artist.id),
                "releaseYear": bad,
            })
            assert resp.status_code == 400

    def test_invalid_artist_id_returns_400(self, client, app, make_artist):
        app.config["ENABLE_CATALOG_WRITE"] = True
        artist = make_artist(name="ArtistId Artist")
        db.session.commit()
        reg = client.post("/api/auth/register", json={
            "displayName": "ArtistId Validator",
            "handle": "artistid_validator",
            "email": "artistid_validator@example.com",
            "password": "password123",
        })
        assert reg.status_code == 201

        for bad_id in ("abc", True, 12.7):
            resp = client.post("/api/albums", json={
                "title": "Bad Artist",
                "artistId": bad_id,
            })
            assert resp.status_code == 400


# ── GET /api/albums/genres ──────────────────────────────────────────────

class TestGetAlbumGenres:
    """Spec tests 37-38"""

    def test_returns_genres_with_stats(self, client, make_genre, make_artist, make_album):
        pop = make_genre("Pop")
        a = make_artist(name="GenreStatArt")
        make_album(title="Pop1", artist_id=a.id, user_score=8.0, genres=[pop])
        make_album(title="Pop2", artist_id=a.id, user_score=9.0, genres=[pop])
        db.session.commit()
        r = client.get("/api/albums/genres")
        data = r.get_json()
        pop_entry = next(g for g in data["genres"] if g["name"] == "Pop")
        assert pop_entry["albumCount"] == 2
        assert pop_entry["avgScore"] == 8.5

    def test_excludes_empty_genres(self, client, make_genre):
        make_genre("Classical")
        db.session.commit()
        r = client.get("/api/albums/genres")
        names = [g["name"] for g in r.get_json()["genres"]]
        assert "Classical" not in names


# ── GET /api/discussions ────────────────────────────────────────────────

class TestGetAllDiscussions:
    """Spec tests 39-40"""

    def test_default_sort_recent(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="AllDiscArt")
        u = make_user(handle="@all_disc")
        make_discussion(
            a.id, u.id, title="Old",
            last_activity_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        make_discussion(
            a.id, u.id, title="New",
            last_activity_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
        )
        db.session.commit()
        r = client.get("/api/discussions")
        assert r.status_code == 200
        data = r.get_json()
        assert data["discussions"][0]["title"] == "New"

    def test_sort_popular(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="PopDiscArt")
        u = make_user(handle="@pop_disc")
        make_discussion(a.id, u.id, title="Few", post_count=5)
        make_discussion(a.id, u.id, title="Many", post_count=20)
        db.session.commit()
        r = client.get("/api/discussions?sort=popular")
        data = r.get_json()
        assert data["discussions"][0]["postCount"] == 20


# ── GET /api/stats ──────────────────────────────────────────────────────

class TestGetStats:
    """Spec test 41"""

    def test_correct_counts(self, client, app, make_artist, make_user, make_discussion, make_post):
        app.config["ENABLE_CATALOG_WRITE"] = False
        a1 = make_artist(name="Stat1")
        a2 = make_artist(name="Stat2")
        a3 = make_artist(name="Stat3")
        human1 = make_user(handle="@stat_h1", is_bot=False)
        human2 = make_user(handle="@stat_h2", is_bot=False)
        bot = make_user(handle="@stat_bot", is_bot=True)
        d = make_discussion(a1.id, human1.id)
        make_post(d.id, human1.id, body="P1")
        make_post(d.id, human2.id, body="P2")
        db.session.commit()
        r = client.get("/api/stats")
        assert r.status_code == 200
        data = r.get_json()
        assert data["artistCount"] == 3
        assert data["userCount"] == 2
        assert data["botCount"] == 1
        assert data["discussionCount"] == 1
        assert data["postCount"] == 2
        assert data["catalogWriteEnabled"] is False

    def test_catalog_write_flag_reflects_config(self, client, app):
        app.config["ENABLE_CATALOG_WRITE"] = True
        r = client.get("/api/stats")
        assert r.status_code == 200
        assert r.get_json()["catalogWriteEnabled"] is True


# ── GET /api/search ─────────────────────────────────────────────────────

class TestSearch:
    """Spec tests 42-45"""

    def test_artist_by_name(self, client, make_artist):
        make_artist(name="Luna Rivera")
        db.session.commit()
        r = client.get("/api/search?q=Luna")
        data = r.get_json()
        assert any(a["name"] == "Luna Rivera" for a in data["artists"])

    def test_album_by_title(self, client, make_artist, make_album):
        a = make_artist(name="SearchArt")
        make_album(title="Ctrl", artist_id=a.id)
        db.session.commit()
        r = client.get("/api/search?q=Ctrl")
        data = r.get_json()
        assert any(al["title"] == "Ctrl" for al in data["albums"])

    def test_short_query_returns_empty(self, client):
        r = client.get("/api/search?q=A")
        data = r.get_json()
        assert data["artists"] == []
        assert data["albums"] == []

    def test_case_insensitive(self, client, make_artist):
        make_artist(name="Luna Rivera")
        db.session.commit()
        r = client.get("/api/search?q=luna")
        data = r.get_json()
        assert any(a["name"] == "Luna Rivera" for a in data["artists"])


# ── GET /api/debug/jobs ─────────────────────────────────────────────────

class TestDebugJobs:
    """Spec tests 46-47"""

    def test_jobs_requires_session(self, client):
        r = client.get("/api/debug/jobs")
        assert r.status_code == 403

    def test_returns_last_20(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="DebugArt")
        u = make_user(handle="@debug_user", is_bot=True)
        d = make_discussion(a.id, u.id)
        db.session.commit()
        for i in range(25):
            job = LLMJob(
                artist_id=a.id, discussion_id=d.id, llm_user_id=u.id,
                scheduled_time=datetime.now(timezone.utc),
                status="completed",
            )
            db.session.add(job)
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        r = client.get("/api/debug/jobs")
        assert r.status_code == 200
        assert len(r.get_json()) == 20

    def test_job_fields_present(self, client, make_artist, make_user, make_discussion):
        a = make_artist(name="FieldArt")
        u = make_user(handle="@field_user", is_bot=True)
        d = make_discussion(a.id, u.id)
        job = LLMJob(
            artist_id=a.id, discussion_id=d.id, llm_user_id=u.id,
            scheduled_time=datetime.now(timezone.utc),
            status="completed",
            completed_at=datetime.now(timezone.utc),
        )
        db.session.add(job)
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        r = client.get("/api/debug/jobs")
        entry = r.get_json()[0]
        for key in ("id", "artist_id", "discussion_id", "status",
                     "scheduled_time", "completed_at", "error_msg"):
            assert key in entry


# ── POST /api/debug/run-job/<id> ───────────────────────────────────────

class TestDebugRunJob:
    """Spec tests 48-49"""

    def test_run_job_requires_session(self, client):
        r = client.post("/api/debug/run-job/1")
        assert r.status_code == 403

    def test_sync_execution(self, client, make_artist, make_user, make_discussion, make_persona):
        a = make_artist(name="RunJobArt")
        bot = make_user(display_name="RunBot", handle="@runjob_bot", is_bot=True)
        make_persona(bot.id)
        d = make_discussion(a.id, bot.id, title="Run disc")
        job = LLMJob(
            artist_id=a.id, discussion_id=d.id, llm_user_id=bot.id,
            scheduled_time=datetime.now(timezone.utc),
            status="pending",
        )
        db.session.add(job)
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = bot.id
        with patch("app.services.llm_service.LLMServiceAPI.generate_comment",
                    return_value="Mocked comment"):
            r = client.post(f"/api/debug/run-job/{job.id}")
        assert r.status_code == 200
        assert r.get_json()["status"] == "completed"

    def test_nonexistent_job(self, client, make_user):
        u = make_user(handle="@nj_debug", is_bot=False)
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        r = client.post("/api/debug/run-job/9999")
        # _execute_job returns early for None job, then route tries job.status on None → 500
        assert r.status_code == 500
        data = r.get_json()
        assert "error" in data


class TestEdgeCases:
    """Edge-case tests merged from tests/test_edge_cases.py"""

    def _register(self, client, suffix="edge"):
        r = client.post(
            "/api/auth/register",
            json={
                "displayName": "List Owner",
                "handle": suffix,
                "email": f"{suffix}@example.com",
                "password": "password123",
            },
        )
        assert r.status_code == 201

    def test_create_list_requires_auth(self, client):
        resp = client.post("/api/lists", json={"title": "X"})
        assert resp.status_code == 401

    def test_create_list_requires_title(self, client):
        self._register(client, "notitle")
        resp = client.post("/api/lists", json={})
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_add_album_requires_albumId(self, client):
        self._register(client, "albumid")
        r = client.post("/api/lists", json={"title": "My List"})
        assert r.status_code == 201
        list_id = int(r.get_json()["list"]["id"])

        resp = client.post(f"/api/lists/{list_id}/albums", json={})
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "albumId is required"

    def test_add_album_album_not_found(self, client):
        self._register(client, "alb_nf")
        r = client.post("/api/lists", json={"title": "L2"})
        list_id = int(r.get_json()["list"]["id"])

        resp = client.post(f"/api/lists/{list_id}/albums", json={"albumId": 99999})
        assert resp.status_code == 404
        assert resp.get_json()["error"] == "Album not found"

    def test_add_album_idempotent(self, client, make_artist, make_album):
        self._register(client, "idem")
        a = make_artist(name="AlbumListArtist")
        album = make_album(title="UniqueAlbum", artist_id=a.id)
        db.session.commit()

        r = client.post("/api/lists", json={"title": "My Picks"})
        list_id = int(r.get_json()["list"]["id"])

        r1 = client.post(f"/api/lists/{list_id}/albums", json={"albumId": album.id})
        assert r1.status_code == 200
        # add again — should be idempotent
        r2 = client.post(f"/api/lists/{list_id}/albums", json={"albumId": album.id})
        assert r2.status_code == 200
        lst = r2.get_json()["list"]
        assert "albums" in lst
        assert len(lst["albums"]) == 1
        assert lst["userHasLiked"] is False
        assert r1.get_json()["list"]["userHasLiked"] is False

    def test_remove_album_response_includes_userHasLiked(self, client, make_artist, make_album):
        self._register(client, "remuhl")
        a = make_artist(name="RemArtist")
        album = make_album(title="RemAlb", artist_id=a.id)
        db.session.commit()
        r = client.post("/api/lists", json={"title": "RemList"})
        list_id = int(r.get_json()["list"]["id"])
        assert r.get_json()["list"]["userHasLiked"] is False
        client.post(f"/api/lists/{list_id}/albums", json={"albumId": album.id})
        resp = client.delete(f"/api/lists/{list_id}/albums/{album.id}")
        assert resp.status_code == 200
        assert resp.get_json()["list"]["userHasLiked"] is False

    def test_remove_album_nonexistent_list(self, client):
        self._register(client, "remlist")
        resp = client.delete("/api/lists/99999/albums/1")
        assert resp.status_code == 404

    def test_add_album_forbidden_other_owner(self, client, make_artist, make_album):
        a = make_artist(name="OwnArt")
        album = make_album(title="OwnAlb", artist_id=a.id)
        db.session.commit()

        self._register(client, "owner1")
        r = client.post("/api/lists", json={"title": "Mine"})
        list_id = int(r.get_json()["list"]["id"])

        client.post("/api/auth/logout")
        self._register(client, "owner2")

        resp = client.post(f"/api/lists/{list_id}/albums", json={"albumId": album.id})
        assert resp.status_code == 403

    def test_register_login_and_duplicate_register(self, client):
        # Register
        resp = client.post("/api/auth/register", json={
            "displayName": "RegUser",
            "handle": "reguser",
            "email": "reg@example.com",
            "password": "password123",
        })
        assert resp.status_code == 201
        assert "user" in resp.get_json()

        # Logout then login
        client.post("/api/auth/logout")
        r = client.post("/api/auth/login", json={"email": "reg@example.com", "password": "password123"})
        assert r.status_code == 200

        # Wrong password
        r2 = client.post("/api/auth/login", json={"email": "reg@example.com", "password": "wrongpass"})
        assert r2.status_code == 401

        # Duplicate register by email or handle should fail
        r3 = client.post("/api/auth/register", json={
            "displayName": "RegUser2",
            "handle": "reguser",  # same handle
            "email": "reg@example.com",  # same email
            "password": "password123",
        })
        assert r3.status_code == 400

    def test_register_accepts_raw_json_body(self, client):
        resp = client.post(
            "/api/auth/register",
            data=(
                '{"displayName":"RawJsonUser","handle":"rawjson",'
                '"email":"rawjson@example.com","password":"password123"}'
            ),
        )
        assert resp.status_code == 201
        assert resp.get_json()["user"]["email"] == "rawjson@example.com"

    def test_register_accepts_client_field_aliases(self, client):
        resp = client.post("/api/auth/register", json={
            "name": "Alias User",
            "username": "aliasuser",
            "email": "alias@example.com",
            "password": "password123",
        })

        assert resp.status_code == 201
        user = resp.get_json()["user"]
        assert user["displayName"] == "Alias User"
        assert user["handle"] == "@aliasuser"
        assert user["email"] == "alias@example.com"

    def test_register_reports_missing_fields(self, client):
        resp = client.post("/api/auth/register", json={"email": "partial@example.com"})

        assert resp.status_code == 400
        data = resp.get_json()
        assert data["error"] == "Missing required fields: displayName, handle, password"
        assert data["missingFields"] == ["displayName", "handle", "password"]

    def test_stagger_scheduler_returns_zero_without_personas(self, client, make_artist):
        a = make_artist(name="NoPersonaArtist")
        db.session.commit()

        from app.services.stagger_scheduler import StaggerScheduler

        count = StaggerScheduler().schedule_jobs({"artist_id": a.id})
        assert count == 0
        # ensure no LLMJob rows created
        assert LLMJob.query.filter_by(artist_id=a.id).count() == 0

    def test_run_due_llm_jobs_executes_due_pending_jobs(
        self, client, make_artist, make_user, make_discussion, make_persona, make_post
    ):
        artist = make_artist(name="DueJobArtist")
        human = make_user(display_name="Due Human", handle="@duehuman")
        bot = make_user(display_name="DueBot", handle="@duebot", is_bot=True)
        make_persona(bot.id)
        discussion = make_discussion(artist.id, human.id, title="Due job thread")
        make_post(discussion.id, human.id, body="Human opening post")
        due_job = LLMJob(
            artist_id=artist.id,
            discussion_id=discussion.id,
            llm_user_id=bot.id,
            scheduled_time=datetime.now(timezone.utc) - timedelta(minutes=1),
            status="pending",
        )
        future_job = LLMJob(
            artist_id=artist.id,
            discussion_id=discussion.id,
            llm_user_id=bot.id,
            scheduled_time=datetime.now(timezone.utc) + timedelta(minutes=10),
            status="pending",
        )
        db.session.add_all([due_job, future_job])
        db.session.commit()

        from app.services.llm_worker import run_due_llm_jobs

        with patch(
            "app.services.llm_service.LLMServiceAPI.generate_comment",
            return_value="Scheduled bot reply",
        ):
            result = run_due_llm_jobs(limit=5)

        assert result["processed"] == 1
        assert result["completed"] == 1
        assert result["failed"] == 0
        db.session.refresh(due_job)
        db.session.refresh(future_job)
        assert due_job.status == "completed"
        assert future_job.status == "pending"
        assert Post.query.filter_by(
            discussion_id=discussion.id,
            body="Scheduled bot reply",
        ).count() == 1
        notification = Notification.query.filter_by(
            user_id=human.id,
            notification_type="llm_reply",
        ).first()
        assert notification is not None
        assert notification.actor_user_id == bot.id
        assert notification.discussion_id == discussion.id

    def test_llm_job_failure_rolls_back_bot_post(
        self, client, make_artist, make_user, make_discussion, make_persona, make_post
    ):
        artist = make_artist(name="AtomicJobArtist")
        human = make_user(display_name="Atomic Human", handle="@atomichuman")
        bot = make_user(display_name="AtomicBot", handle="@atomicbot", is_bot=True)
        make_persona(bot.id)
        discussion = make_discussion(
            artist.id,
            human.id,
            title="Atomic job thread",
            post_count=1,
        )
        make_post(discussion.id, human.id, body="Human opening post")
        job = LLMJob(
            artist_id=artist.id,
            discussion_id=discussion.id,
            llm_user_id=bot.id,
            scheduled_time=datetime.now(timezone.utc) - timedelta(minutes=1),
            status="pending",
        )
        db.session.add(job)
        db.session.commit()

        from app.services.llm_worker import run_due_llm_jobs

        with patch(
            "app.services.llm_service.LLMServiceAPI.generate_comment",
            return_value="Bot reply that should roll back",
        ), patch(
            "app.services.notification_service.create_reply_notifications",
            side_effect=RuntimeError("notification insert failed"),
        ):
            result = run_due_llm_jobs(limit=5)

        assert result["processed"] == 1
        assert result["completed"] == 0
        assert result["failed"] == 1
        db.session.refresh(job)
        db.session.refresh(discussion)
        assert job.status == "failed"
        assert "notification insert failed" in job.error_msg
        assert discussion.post_count == 1
        assert Post.query.filter_by(
            discussion_id=discussion.id,
            body="Bot reply that should roll back",
        ).count() == 0

    def test_albums_time_range_today(self, client, make_artist, make_album):
        a = make_artist(name="TodayAlbumArtist")
        make_album(title="Hot Today", artist_id=a.id, release_date=date.today(), release_year=date.today().year)
        db.session.commit()

        r = client.get("/api/albums?time_range=today")
        assert r.status_code == 200
        data = r.get_json()
        assert any(al["title"] == "Hot Today" for al in data["albums"])


class TestListLike:
    """Tests for POST /api/lists/:id/like"""

    def test_unauthenticated_returns_401(self, client, make_user):
        u = make_user(handle="@like_anon_owner")
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        r = client.post("/api/lists", json={"title": "Likeable"})
        assert r.status_code == 201
        list_id = r.get_json()["list"]["id"]
        with client.session_transaction() as sess:
            sess.clear()
        resp = client.post(f"/api/lists/{list_id}/like")
        assert resp.status_code == 401

    def test_like_missing_list_returns_404(self, client, make_user):
        u = make_user(handle="@liker404")
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        resp = client.post("/api/lists/99999/like")
        assert resp.status_code == 404

    def test_like_increments_count(self, client, make_user):
        u = make_user(handle="@liker1")
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        r = client.post("/api/lists", json={"title": "L-Like"})
        assert r.status_code == 201
        list_id = r.get_json()["list"]["id"]
        resp = client.post(f"/api/lists/{list_id}/like")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["liked"] is True
        assert data["likeCount"] == 1

    def test_like_toggle_unlike(self, client, make_user):
        u = make_user(handle="@liker2")
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        r = client.post("/api/lists", json={"title": "L-Toggle"})
        assert r.status_code == 201
        list_id = r.get_json()["list"]["id"]
        client.post(f"/api/lists/{list_id}/like")  # like
        resp = client.post(f"/api/lists/{list_id}/like")  # unlike
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["liked"] is False
        assert data["likeCount"] == 0

    def test_list_endpoints_report_real_like_rows(self, client, make_user, make_artist, make_album):
        owner = make_user(handle="@real_list_owner")
        viewer = make_user(handle="@real_list_viewer")
        other_liker = make_user(handle="@real_list_liker")
        artist = make_artist(name="RealListArtist")
        album_one = make_album(title="RealListAlbumOne", artist_id=artist.id)
        album_two = make_album(title="RealListAlbumTwo", artist_id=artist.id)
        db.session.flush()

        lst = List(
            title="Real Counters",
            creator_user_id=owner.id,
            like_count=99,
        )
        db.session.add(lst)
        db.session.flush()
        db.session.add_all([
            ListAlbum(list_id=lst.id, album_id=album_one.id),
            ListAlbum(list_id=lst.id, album_id=album_two.id),
            ListLike(list_id=lst.id, user_id=viewer.id),
            ListLike(list_id=lst.id, user_id=other_liker.id),
        ])
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = viewer.id

        resp = client.get("/api/lists")
        assert resp.status_code == 200
        list_item = next(item for item in resp.get_json()["lists"] if item["id"] == str(lst.id))
        assert list_item["likes"] == 2
        assert list_item["albumCount"] == 2
        assert list_item["userHasLiked"] is True

        detail = client.get(f"/api/lists/{lst.id}")
        assert detail.status_code == 200
        detail_item = detail.get_json()["list"]
        assert detail_item["likes"] == 2
        assert detail_item["albumCount"] == 2
        assert len(detail_item["albums"]) == 2
        assert detail_item["userHasLiked"] is True


class TestListFork:
    """Tests for POST /api/lists/:id/fork"""

    def test_unauthenticated_returns_401(self, client, make_user):
        u = make_user(handle="@fork_anon_owner")
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        r = client.post("/api/lists", json={"title": "Source List"})
        assert r.status_code == 201
        list_id = r.get_json()["list"]["id"]
        with client.session_transaction() as sess:
            sess.clear()
        resp = client.post(f"/api/lists/{list_id}/fork")
        assert resp.status_code == 401

    def test_missing_list_returns_404(self, client, make_user):
        u = make_user(handle="@fork_404")
        db.session.commit()
        with client.session_transaction() as sess:
            sess["user_id"] = u.id
        resp = client.post("/api/lists/99999/fork")
        assert resp.status_code == 404

    def test_fork_creates_copy_with_albums(self, client, make_user, make_artist, make_album):
        owner = make_user(handle="@fork_owner")
        forker = make_user(handle="@fork_forker")
        artist = make_artist(name="ForkArtist")
        album = make_album(title="ForkAlbum", artist_id=artist.id)
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = owner.id
        r = client.post("/api/lists", json={"title": "Original"})
        assert r.status_code == 201
        assert r.get_json()["list"]["userHasLiked"] is False
        list_id = r.get_json()["list"]["id"]
        client.post(f"/api/lists/{list_id}/albums", json={"albumId": album.id})

        with client.session_transaction() as sess:
            sess["user_id"] = forker.id
        resp = client.post(f"/api/lists/{list_id}/fork")
        assert resp.status_code == 201
        data = resp.get_json()["list"]
        assert data["title"] == "Original (copy)"
        assert data["creatorUserId"] == str(forker.id)
        assert data["userHasLiked"] is False

    def test_fork_albums_are_copied(self, client, make_user, make_artist, make_album):
        owner = make_user(handle="@fork_album_owner")
        forker = make_user(handle="@fork_album_forker")
        artist = make_artist(name="ForkAlbumArtist")
        album = make_album(title="CopiedAlbum", artist_id=artist.id)
        db.session.commit()

        with client.session_transaction() as sess:
            sess["user_id"] = owner.id
        r = client.post("/api/lists", json={"title": "WithAlbums"})
        assert r.status_code == 201
        list_id = r.get_json()["list"]["id"]
        client.post(f"/api/lists/{list_id}/albums", json={"albumId": album.id})

        with client.session_transaction() as sess:
            sess["user_id"] = forker.id
        fork_resp = client.post(f"/api/lists/{list_id}/fork")
        fork_id = fork_resp.get_json()["list"]["id"]

        detail = client.get(f"/api/lists/{fork_id}").get_json()["list"]
        assert detail["albumCount"] == 1
