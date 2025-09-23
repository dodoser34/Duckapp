document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
        // request to backend to remove cookie
        await fetch("http://127.0.0.1:8000/api/auth/logout", {
            method: "POST",
            credentials: "include" // important to send cookies
        });

        // after logout — reload the page
        window.location.reload();
    } catch (err) {
        console.error("Error during logout:", err);
    }
});
