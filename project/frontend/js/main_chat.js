const chats = { 1: [], 2: [], 3: [], 4: [], 5: [] };
let activeChat = 1;

const chatHader = document.getElementById("chat-header");

const chatBody = document.getElementById("chat-body");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const chatTitle = document.getElementById("chat-title");
const chatItems = document.querySelectorAll(".chat-list-item");

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});


// =====================
// Летающие уточки
// =====================
const ducksContainer = document.getElementById("ducks-container");

function createDuck() {
  const duck = document.createElement("div");
  duck.classList.add("duck");
  duck.textContent = "🦆";

  const size = Math.random() * 20 + 30;
  duck.style.fontSize = size + "px";

  const duration = Math.random() * 10 + 8;
  const direction = Math.random() > 0.5 ? "right" : "left";

  if (direction === "right") {
    duck.style.left = "-50px";
    duck.style.top = Math.random() * window.innerHeight + "px";
    duck.style.transform = "scaleX(-1)"; // наоборот
    duck.animate(
      [
        { transform: "translateX(0) scaleX(-1)" },
        { transform: `translateX(${window.innerWidth + 100}px) scaleX(-1)` }
      ],
      { duration: duration * 1000, iterations: 1 }
    ).onfinish = () => duck.remove();
  } else {
    duck.style.left = window.innerWidth + "px";
    duck.style.top = Math.random() * window.innerHeight + "px";
    duck.style.transform = "scaleX(1)"; // наоборот
    duck.animate(
      [
        { transform: "translateX(0) scaleX(1)" },
        { transform: `translateX(-${window.innerWidth + 100}px) scaleX(1)` }
      ],
      { duration: duration * 1000, iterations: 1 }
    ).onfinish = () => duck.remove();
  }

  ducksContainer.appendChild(duck);
}

setInterval(createDuck, 2000);