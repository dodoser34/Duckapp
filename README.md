# DuckApp

<p class="has-line-data" data-line-start="0" data-line-end="29">project/<br>
├── backend/<br>
│   ├── app/<br>
│   │   ├── <a>main.py</a>            # Точка входа<br>
│   │   ├── core/                     # Основное<br>
│   │   │   └── <a>db.py</a>          # Подключение к БД<br>
│   │   ├── routers/                  # Роутеры<br>
│   │   │   ├── <a>auth.py</a><br>
│   │   │   └── <a>chat.py</a><br>
│   │   ├── schemas/                  # Pydantic схемы<br>
│   │   │   └── <a>user.py</a><br>
│   │   └── <strong><a>init</strong>.py<br></a>
│<br>
├── frontend/<br>
│   ├── html/<br>
│   │   ├── <a>index.html</a><br>
│   │   ├── <a>main_chat.html</a><br>
│   │   └── <a>register.html</a><br>
│<br>
├── js/<br>
│   ├── <a>api.js</a><br>
│   ├── <a>login.js</a><br>
│   ├── <a>register.js</a><br>
│   └── <a>main_chat.js</a><br>
│<br>
├── styles/<br>
│   ├── <a>base.css</a>           # Общие стили<br>
│   ├── <a>style_index.css</a><br>
│   ├── <a>style_register.css</a><br>
│   └── <a>style_main_chat.css</a><br>
│<br>
├── assets/                # картинки/иконки (пусто пока)<br>
│<br>
└── requirements.txt       # зависимости (FastAPI, SQLAlchemy и т.д.)
