# DuckApp

DuckApp is a lightweight web messenger built with FastAPI, MySQL, and vanilla HTML/CSS/JavaScript.

## Features

- User registration and login with JWT cookie session
- Profile data with status and avatar
- Upload custom avatar (stored on server, visible to other users)
- Friend requests and friends list
- Direct messages (text and GIF)
- Multi-language UI via `project/lang/language.json`

## Stack

- Backend: Python, FastAPI, PyMySQL
- Frontend: HTML, CSS, JavaScript (ES modules)
- Database: MySQL

## Run

1. Install dependencies:
   `pip install -r requirements.txt`

2. Configure `.env` with DB and security values

3. Start backend from repository root:
   `python project/backend/start_app.py`

Backend will serve API and static assets.
