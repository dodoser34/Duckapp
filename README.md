# DuckApp

DuckApp is a lightweight web messenger built with FastAPI, MySQL and vanilla HTML/CSS/JavaScript.

## Features

- Registration and login with a JWT session cookie (HttpOnly, SameSite)
- Profile with status and avatar, including uploads with a per-user quota
- Friend requests and friends list
- Direct messages (text and GIF) with emoji reactions and paginated history
- Per-user "clear chat" that does not touch the other participant's copy
- Public feedback board with a moderator-only detail view
- Multi-language UI via `project/lang/<lang>.json` (en, ru, kk, de, ja)

## Stack

- Backend: Python 3.11+, FastAPI, PyMySQL (pooled connections)
- Frontend: HTML, CSS, JavaScript (ES modules, no build step)
- Database: MySQL 8

## Run

1. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Create your config:

   ```bash
   cp .env.example .env
   ```

   `JWT_KEY` and `DUCKAPP_FEEDBACK_ADMIN_CODE` are mandatory — the app refuses
   to start on a missing or placeholder secret. Generate them with:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

3. Start the backend from the repository root:

   ```bash
   python project/backend/start_app.py
   ```

4. Open <http://127.0.0.1:8000/>.

The backend serves both the API and the frontend. Static trees are mounted at
`/html`, `/js`, `/styles`, `/assets`, `/lang` and `/emoji`; `/` redirects to the
landing page. The schema is created and migrated on startup by `init_db()`.

## Configuration

Every setting lives in `.env` — see [.env.example](.env.example) for the full
annotated list. The ones that matter most before going live:

| Variable | Why it matters |
| --- | --- |
| `JWT_KEY` | Signs sessions and the moderator token. Required. |
| `DUCKAPP_FEEDBACK_ADMIN_CODE` | The only credential for the feedback admin panel. Use 32+ random characters. |
| `DUCKAPP_ALLOWED_HOSTS` | Host header whitelist. Anything else gets a 400, so add your domain. |
| `DUCKAPP_CORS_ORIGIN_REGEX` | Anchored regex of allowed browser origins (CORS + CSRF). |
| `DUCKAPP_SECURE_COOKIES` | Set to `1` whenever you serve over HTTPS. |
| `DUCKAPP_TRUST_PROXY_HEADERS` | Only `1` behind a trusted proxy; otherwise `X-Forwarded-For` can be forged past the rate limits. |
| `DUCKAPP_DB_POOL_SIZE` | Pooled MySQL connections; scale with `--workers`. |

## Development

```bash
pip install -r requirements-dev.txt
pytest
ruff check project/backend
```

`DUCKAPP_RELOAD=1` enables uvicorn auto-reload. Never enable it in production.

## Layout

```
project/
  backend/
    core/        shared helpers: config, logging, rate limiting, time
    databases/   connection pool and schema bootstrap
    routers/     auth, profile, friends, messages, feedback, common
    start_app.py app wiring, middleware, static mounts
  frontend/
    html/        pages and image assets
    js/shared/   helpers shared across pages (i18n, peers, session, aliases)
    js/chat/     chat screen modules
    styles/
  lang/          UI translations, one file per language
  emoji/
tests/           pytest suite (no database required)
```

## Security notes

- Rate limiting is in-process. Behind multiple workers each process keeps its
  own budget; move to a shared store (e.g. Redis) if you scale out.
- Uploaded avatars are sniffed by content, not by filename, but they are not
  re-encoded. Add Pillow-based re-encoding if you need to strip metadata.
- Feedback free-text is visible only to moderators; the public board shows the
  nickname, category and status.

## License

MIT — see [LICENSE](LICENSE).
