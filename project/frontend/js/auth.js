import { loginUser, requestAccountRecovery, resetAccountCredentials } from "./api.js";
import { getSession } from "./check-session.js";
import { initDucks } from "./ducks.js";

const loginForm = document.getElementById("loginForm");
const msg = document.getElementById("errorMsg");
const recoveryToggle = document.getElementById("recoveryToggle");
const recoveryForm = document.getElementById("recoveryForm");
const recoverySendCode = document.getElementById("recoverySendCode");
const recoveryCodeStep = document.getElementById("recoveryCodeStep");
const recoveryMsg = document.getElementById("recoveryMsg");
const page = document.body.getAttribute("data-page") || "authorization";
const USERNAME_MAX_LENGTH = 32;
const t = (key, fallback) => {
    const lang = window.currentLang;
    const defaultLang = window.__duckappLangIndex?.default || "en";
    return (
        window.translations?.[lang]?.[page]?.[key] ??
        window.translations?.[defaultLang]?.[page]?.[key] ??
        fallback
    );
};

function setupPasswordToggles() {
    const icons = {
        show: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
        hide: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>`,
    };

    const toggles = document.querySelectorAll(".password-toggle");
    toggles.forEach((toggle) => {
        const targetId = toggle.dataset.target;
        const input = targetId ? document.getElementById(targetId) : null;
        if (!input) return;

        const refreshLabel = () => {
            const visible = input.type === "text";
            const label = visible
                ? t("password_toggle_hide", "Hide")
                : t("password_toggle_show", "Show");
            toggle.innerHTML = visible ? icons.hide : icons.show;
            toggle.setAttribute("aria-label", label);
            toggle.setAttribute("title", label);
        };

        if (toggle.dataset.bound !== "1") {
            toggle.addEventListener("click", () => {
                input.type = input.type === "password" ? "text" : "password";
                refreshLabel();
                input.focus();
            });
            toggle.dataset.bound = "1";
        }

        refreshLabel();
    });
}

function setRecoveryMessage(text, state = "info") {
    if (!recoveryMsg) return;
    recoveryMsg.dataset.state = state;
    recoveryMsg.textContent = text;
}

function setLoading(button, isLoading, loadingText, idleText) {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : idleText;
}

function recoveryErrorText(detail) {
    const messages = {
        "Email delivery is not configured": t(
            "recovery_delivery_missing",
            "Email delivery is not configured"
        ),
        "Could not send recovery email": t(
            "recovery_delivery_failed",
            "Could not send recovery email"
        ),
        "Invalid or expired recovery code": t(
            "recovery_invalid_or_expired_code",
            "Invalid or expired recovery code"
        ),
        "Username is already taken": t(
            "recovery_username_taken",
            "Username is already taken"
        ),
        "Invalid email address": t("recovery_invalid_email", "Enter a valid email"),
        "Password must be at least 8 characters long": t(
            "recovery_password_too_short",
            "Password must be at least 8 characters long"
        ),
    };
    return messages[detail] || detail || t("recovery_error", "Recovery error");
}

function setupRecoveryPanel() {
    if (!recoveryToggle || !recoveryForm) return;

    const emailInput = document.getElementById("recoveryEmail");
    const codeInput = document.getElementById("recoveryCode");
    const usernameInput = document.getElementById("recoveryUsername");
    const passwordInput = document.getElementById("recoveryPassword");
    const confirmPasswordInput = document.getElementById("recoveryConfirmPassword");
    const codeStepControls = recoveryCodeStep
        ? Array.from(recoveryCodeStep.querySelectorAll("input, button"))
        : [];
    const setCodeStepEnabled = (enabled) => {
        if (recoveryCodeStep) {
            recoveryCodeStep.hidden = !enabled;
        }
        codeStepControls.forEach((control) => {
            control.disabled = !enabled;
        });
    };

    setCodeStepEnabled(false);

    recoveryToggle.addEventListener("click", () => {
        const willOpen = recoveryForm.hidden;
        recoveryForm.hidden = !willOpen;
        recoveryToggle.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) {
            setRecoveryMessage("");
            emailInput?.focus();
        }
    });

    codeInput?.addEventListener("input", () => {
        codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
    });

    recoverySendCode?.addEventListener("click", async () => {
        const email = String(emailInput?.value || "").trim();
        if (!emailInput || !email || !emailInput.checkValidity()) {
            setRecoveryMessage(t("recovery_invalid_email", "Enter a valid email"), "error");
            emailInput?.focus();
            return;
        }

        setLoading(
            recoverySendCode,
            true,
            t("recovery_sending", "Sending..."),
            t("recovery_send_code", "Send code")
        );
        setRecoveryMessage("");

        const res = await requestAccountRecovery(email);
        setLoading(
            recoverySendCode,
            false,
            t("recovery_sending", "Sending..."),
            t("recovery_send_code", "Send code")
        );

        if (res.ok) {
            setCodeStepEnabled(true);
            setRecoveryMessage(t("recovery_code_sent", "Code sent to email"), "success");
            codeInput?.focus();
        } else {
            setRecoveryMessage(recoveryErrorText(res.detail), "error");
        }
    });

    recoveryForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = String(emailInput?.value || "").trim();
        const code = String(codeInput?.value || "").trim();
        const username = String(usernameInput?.value || "").trim();
        const password = String(passwordInput?.value || "");
        const confirmPassword = String(confirmPasswordInput?.value || "");

        if (!emailInput || !email || !emailInput.checkValidity()) {
            setRecoveryMessage(t("recovery_invalid_email", "Enter a valid email"), "error");
            emailInput?.focus();
            return;
        }
        if (!/^\d{6}$/.test(code)) {
            setRecoveryMessage(t("recovery_invalid_code", "Enter the 6-digit code"), "error");
            codeInput?.focus();
            return;
        }
        if (!username || username.length > USERNAME_MAX_LENGTH) {
            setRecoveryMessage(`Error: Username must be at most ${USERNAME_MAX_LENGTH} characters long`, "error");
            usernameInput?.focus();
            return;
        }
        if (password !== confirmPassword) {
            setRecoveryMessage(
                t("recovery_password_mismatch", "Passwords do not match"),
                "error"
            );
            confirmPasswordInput?.focus();
            return;
        }

        const submitButton = recoveryForm.querySelector('button[type="submit"]');
        setLoading(
            submitButton,
            true,
            t("recovery_saving", "Saving..."),
            t("recovery_apply", "Change login and password")
        );

        const res = await resetAccountCredentials(email, code, username, password);
        setLoading(
            submitButton,
            false,
            t("recovery_saving", "Saving..."),
            t("recovery_apply", "Change login and password")
        );

        if (res.ok) {
            loginForm.username.value = res.username || username;
            loginForm.password.value = "";
            recoveryForm.reset();
            setCodeStepEnabled(false);
            setRecoveryMessage(
                t("recovery_reset_success", "Account updated. You can sign in now."),
                "success"
            );
        } else {
            setRecoveryMessage(recoveryErrorText(res.detail), "error");
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    setupPasswordToggles();
    setupRecoveryPanel();
    const res = await getSession();
    if (res.ok) {
        window.location.replace("main-chat.html");
    }
});

window.addEventListener("duckapp:translations-ready", () => {
    setupPasswordToggles();
});

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);
    const username = String(formData.get("username") || "").trim();
    const password = formData.get("password");

    if (!username || username.length > USERNAME_MAX_LENGTH) {
        msg.textContent = `Error: Invalid username or password`;
        return;
    }

    const res = await loginUser(username, password);

    if (res.ok) {
        window.location.replace("main-chat.html");
    } else {
        msg.textContent = "Error: " + (res.detail || t("auth_error", "Authorization error"));
    }
});

initDucks();
