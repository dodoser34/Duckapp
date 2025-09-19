
  // --- Элементы ---
const gifModal = document.getElementById("gif-modal");   // модалка
const gifBtn = document.getElementById("sendgif-btn");   // кнопка GIF
const gifCloseBtn = document.getElementById("gifCloseBtn"); // закрыть модалку
const gifSearchBtn = document.getElementById("gifSearchBtn"); // кнопка поиска
const gifSearchInput = document.getElementById("gifSearchInput"); // поле ввода
const gifResults = document.getElementById("gif-results"); // контейнер для гиф
const chatBody = document.getElementById("chat-body"); // чат

  // 🔑 API KEY Giphy (получаешь тут: https://developers.giphy.com/)
const apiKey = "B9T5fDXrQbPNL35xmHCFUHUKUTJKf7Xf"; 


gifBtn.addEventListener("click", () => {
	console.log("Открываю модалку ✅");
	gifModal.classList.add("open");
});

gifCloseBtn.addEventListener("click", () => {
	gifModal.classList.remove("open");
});

  // --- Поиск GIF ---
gifSearchBtn.addEventListener("click", async () => {
	const query = gifSearchInput.value.trim();
	if (!query) return;
	
	// Запрос к Giphy API
	const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=12&rating=g`;
    const res = await fetch(url);
    const data = await res.json();

    // Очистим предыдущие результаты
    gifResults.innerHTML = "";

    if (data.data.length === 0) {
      gifResults.innerHTML = "<p>Ничего не найдено 😢</p>";
      return;
    }

    // Добавим новые GIF
    data.data.forEach(gif => {
      const img = document.createElement("img");
      img.src = gif.images.fixed_height_small.url;
      img.style.cursor = "pointer";
      img.style.borderRadius = "6px";
      img.title = "Отправить в чат";
      img.onclick = () => sendGifToChat(gif.images.original.url);
      gifResults.appendChild(img);
    });
  });

  // --- Вставка гифки в чат ---
function sendGifToChat(url) {
    const div = document.createElement("div");
    div.className = "chat-message";
    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "200px";
    img.style.borderRadius = "8px";
    div.appendChild(img);
    chatBody.appendChild(div);

    // прокрутка вниз
    chatBody.scrollTop = chatBody.scrollHeight;

    // закрываем модалку
    gifModal.style.display = "none";
    gifResults.innerHTML = "";
    gifSearchInput.value = "";
}