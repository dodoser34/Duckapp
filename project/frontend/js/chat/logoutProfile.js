document.getElementById("logout-btn").addEventListener("click", async () => {
    try {

        await fetch("http://127.0.0.1:8000/api/auth/logout", {
            method: "POST",
            credentials: "include"
        });

        window.location.reload();
    } catch (err) {
        console.error("Error during logout:", err);
    }
});
