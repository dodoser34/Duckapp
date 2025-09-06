const form = document.getElementById("registerForm");
const errorMsg = document.getElementById("errorMsg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    errorMsg.textContent = "Пароли не совпадают!";
    return;
  }

  try {
    const response = await fetch("http://127.0.0.1:8000/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });

    if (response.ok) {
      alert("Регистрация успешна! 🦆");
      window.location.href = "index.html";
    } else {
      const data = await response.json();
      errorMsg.textContent = data.detail || "Ошибка регистрации!";
    }
  } catch (error) {
    errorMsg.textContent = "Сервер недоступен!";
  }
});
