/*
  Файл: js/app.js
  Назначение: Вся логика интерфейса на чистом JS:
    - хранение мок-данных (список чатов и их сообщения)
    - рендеринг списка чатов и ленты сообщений
    - отправка сообщения (в текущий активный чат)
    - "летающие" уточки на фоне

  ВАЖНО ПРО БЕЗОПАСНОСТЬ:
    - Везде, где выводим пользовательский текст, используем textContent,
      чтобы исключить XSS (не вставлять HTML).
*/

// ----------------------
// 1) Мок-данные чатов
// ----------------------
const chats = [
  { id: 1, name: "User_main",     avatar: "https://i.pravatar.cc/40?img=1"  },
  { id: 2, name: "Группа 🦆",     avatar: "https://i.pravatar.cc/40?img=8"  },
  { id: 3, name: "meit-2b25-cer3", avatar: "https://i.pravatar.cc/40?img=12" }
];

/*
  Структура сообщений:
    messages[chatId] = [ { id, text, isMine, time }, ... ]
  Для демо заполняем заранее. В реальном проекте получите с сервера.
*/
const messages = {
  1: [
    { id: 1, text: "Привет, это Утяцап!", isMine: false, time: "10:21" },
    { id: 2, text: "Кря-кря! 🦆",         isMine: true,  time: "10:22" }
  ],
  2: [
    { id: 1, text: "Добро пожаловать в группу!", isMine: false, time: "11:00" }
  ],
  3: [] // пустая история
};

// Текущий активный чат по умолчанию — первый
let activeChat = 1;

// ----------------------
// 2) Кэшируем DOM-элементы
// ----------------------
const chatListEl   = document.getElementById("chat-list");   // правая колонка, список чатов
const chatBody     = document.getElementById("chat-body");   // лента сообщений
const chatTitle    = document.getElementById("chat-title");  // заголовок (имя чата)
const chatAvatar   = document.getElementById("chat-avatar"); // аватар в шапке
const messageInput = document.getElementById("message-input");// поле ввода сообщения
const sendBtn      = document.getElementById("send-btn");     // кнопка "отправить"

// ----------------------
// 3) Утилиты
// ----------------------

/**
 * Безопасный формат времени (HH:MM).
 * @param {Date} d
 * @returns {string}
 */
function formatTime(d = new Date()) {
  // Берём локальное время и отрезаем секунды: "10:05:33" -> "10:05"
  return d.toLocaleTimeString().slice(0, 5);
}

/**
 * Гарантируем, что у активного чата есть массив для сообщений.
 * Если его нет — создаём пустой (на случай несогласованности данных).
 */
function ensureMessagesBucket(chatId) {
  if (!messages[chatId]) {
    messages[chatId] = [];
  }
}

// ----------------------
// 4) Отрисовка списка чатов (правая колонка)
// ----------------------
function renderChats() {
  // Полностью очищаем контейнер
  chatListEl.innerHTML = "";

  // На каждый чат создаём элемент списка .chat-list-item
  chats.forEach((c) => {
    const item = document.createElement("div");
    item.className = "chat-list-item" + (c.id === activeChat ? " active" : "");

    // Создаём элементы вручную, НЕ используем innerHTML для текстов (безопасность)
    const avatar = document.createElement("img");
    avatar.src = c.avatar;
    avatar.alt = "avatar";

    const nameWrap = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = c.name; // безопасно: текст, а не HTML

    nameWrap.appendChild(name);
    item.appendChild(avatar);
    item.appendChild(nameWrap);

    // Переключение активного чата по клику
    item.addEventListener("click", () => switchChat(c.id));

    chatListEl.appendChild(item);
  });

  // Добавляем футер (копирайт) в конец списка
  const footer = document.createElement("div");
  footer.className = "footer";
  footer.textContent = "ООО УТЯПУТЯ © " + new Date().getFullYear();
  chatListEl.appendChild(footer);
}

// ----------------------
// 5) Переключение активного чата
// ----------------------
function switchChat(id) {
  activeChat = id;

  // Находим данные выбранного чата (для шапки)
  const chat = chats.find((c) => c.id === id);
  if (chat) {
    chatTitle.textContent = chat.name; // обновляем заголовок
    chatAvatar.src = chat.avatar;      // обновляем аватар
  }

  // Перерисовываем список (подсветка .active)
  renderChats();

  // Перерисовываем ленту сообщений под текущий чат
  renderMessages();
}

// ----------------------
// 6) Отрисовка сообщений (левая колонка)
// ----------------------
function renderMessages() {
  // Чистим ленту
  chatBody.innerHTML = "";

  // Гарантируем, что у чата есть массив сообщений
  ensureMessagesBucket(activeChat);

  // Для каждого сообщения создаём DOM-элемент "пузырь"
  messages[activeChat].forEach((m) => {
    // Внешний контейнер пузыря
    const msgEl = document.createElement("div");
    msgEl.className = "message " + (m.isMine ? "outgoing" : "incoming");

    // Текст сообщения (используем textContent — безопасно)
    const textEl = document.createElement("div");
    textEl.textContent = m.text;

    // Метаданные — время
    const metaEl = document.createElement("div");
    metaEl.className = "meta";
    metaEl.textContent = m.time;

    // Складываем структуру пузыря
    msgEl.appendChild(textEl);
    msgEl.appendChild(metaEl);

    // Добавляем в ленту
    chatBody.appendChild(msgEl);
  });

  // Прокручиваем ленту внизу (к последнему сообщению)
  chatBody.scrollTop = chatBody.scrollHeight;
}

// ----------------------
// 7) Отправка сообщения
// ----------------------
function sendMessage() {
  // 1) Забираем и чистим текст
  const raw = messageInput.value;
  const text = raw.trim();

  // 2) Пустые сообщения игнорируем
  if (!text) return;

  // 3) Готовим объект сообщения (локальный, "моё")
  const msg = {
    id: Date.now(),            // простой уникальный идентификатор (timestamp)
    text,                      // сам текст
    isMine: true,              // флаг "моё" — отрисуется справа и жёлтым
    time: formatTime(new Date()) // "HH:MM"
  };

  // 4) Гарантируем наличие массива в хранилище и добавляем сообщение
  ensureMessagesBucket(activeChat);
  messages[activeChat].push(msg);

  // 5) Очищаем поле ввода
  messageInput.value = "";

  // 6) Перерисовываем ленту (покажет новое сообщение)
  renderMessages();

  /*
    ПРИ ЖЕЛАНИИ: здесь можно отправлять сообщение на сервер.
    Пример (фейковый):
      fetch("/api/messages", { method:"POST", body: JSON.stringify({ chatId: activeChat, text }) })
        .then(r => r.json())
        .then(serverMsg => { ...обновить id/время, если сервер вернул свои значения... })
        .catch(console.error);
  */
}

// ----------------------
// 8) Летающие уточки (визуальный эффект)
// ----------------------
function spawnDuck() {
  // Берём контейнер для уток
  const c = document.getElementById("ducks-container");

  // Создаём элемент-утку
  const duck = document.createElement("div");
  duck.textContent = "🦆";
  duck.style.position = "absolute";

  // Случайная вертикальная позиция в пределах окна
  duck.style.top = Math.random() * window.innerHeight + "px";

  // Начальная позиция слева за экраном
  duck.style.left = "-50px";

  // Случайный размер эмодзи для вариативности
  duck.style.fontSize = 28 + Math.random() * 24 + "px";

  // CSS-переход: будем анимировать transform (сдвиг по X)
  duck.style.transition = "transform 8s linear";

  // Добавляем утку в DOM
  c.appendChild(duck);

  // Небольшая задержка, чтобы transition сработал (после вставки в DOM)
  setTimeout(() => {
    // Перемещаем утку вправо за пределы экрана на ширину окна + запас
    duck.style.transform = `translateX(${window.innerWidth + 100}px)`;
  }, 100);

  // Через ~9 секунд удаляем элемент, чтобы не заспамить DOM
  setTimeout(() => duck.remove(), 9000);
}

// Запускаем "рождение утки" каждые 2 секунды
setInterval(spawnDuck, 2000);

// ----------------------
// 9) События интерфейса
// ----------------------

// Клик по кнопке "отправить"
sendBtn.addEventListener("click", sendMessage);

// Отправка по Enter (без Shift)
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// ----------------------
// 10) Стартовая инициализация
// ----------------------
function init() {
  renderChats();     // нарисовать список чатов
  renderMessages();  // показать историю сообщений активного чата
}
init();

/*
  ПРИМЕЧАНИЕ:
  Если нужно сохранять историю между перезагрузками,
  можно сериализовать объект messages в localStorage:

    // сохранить:
    localStorage.setItem("utyachat_messages", JSON.stringify(messages));

    // восстановить:
    const saved = localStorage.getItem("utyachat_messages");
    if (saved) Object.assign(messages, JSON.parse(saved));

  Логику сохранения можно повесить на sendMessage() (после push),
  а восстановление — в init() ДО renderMessages().
*/
