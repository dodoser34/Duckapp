import { registerUser } from "./api.js";
import { getSession } from "./check-session.js";
import { initDucks } from "./ducks.js";

const registerForm = document.getElementById("registerForm");
const msg = document.getElementById("errorMsg");
const page = document.body.getAttribute("data-page") || "register";
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const passwordChecklistItems = Array.from(document.querySelectorAll("#passwordChecklist li"));
const passwordStrengthValue = document.getElementById("passwordStrengthValue");
const passwordStrengthFill = document.getElementById("passwordStrengthFill");
const passwordMatchState = document.getElementById("passwordMatchState");
const passwordCapsLockHint = document.getElementById("passwordCapsLockHint");
const confirmPasswordCapsLockHint = document.getElementById("confirmPasswordCapsLockHint");

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

function getPasswordChecks(value) {
    const password = String(value || "");
    return {
        length: password.length >= 8,
        digit: /[0-9]/.test(password),
        upper: /[A-ZА-ЯЁ]/.test(password),
        special: /[^A-Za-z0-9\s]/.test(password),
    };
}

function resolvePasswordStrength(password, checks) {
    if (!password) {
        return {
            state: "empty",
            text: t("password_strength_empty", "Not set"),
            width: 0,
        };
    }

    const passed = Object.values(checks).filter(Boolean).length;
    if (passed <= 2) {
        return {
            state: "weak",
            text: t("password_strength_weak", "Weak"),
            width: 38,
        };
    }
    if (passed === 3) {
        return {
            state: "medium",
            text: t("password_strength_medium", "Medium"),
            width: 68,
        };
    }
    return {
        state: "strong",
        text: t("password_strength_strong", "Strong"),
        width: 100,
    };
}

function renderPasswordChecklist(checks) {
    passwordChecklistItems.forEach((item) => {
        const rule = item.dataset.rule;
        if (!rule) return;
        item.dataset.ok = checks[rule] ? "1" : "0";
    });
}

function renderPasswordStrength(password, checks) {
    if (!passwordStrengthValue || !passwordStrengthFill) return;
    const { state, text, width } = resolvePasswordStrength(password, checks);
    passwordStrengthValue.dataset.state = state;
    passwordStrengthValue.textContent = text;
    passwordStrengthFill.dataset.state = state;
    passwordStrengthFill.style.width = `${width}%`;
}

function renderPasswordMatch() {
    if (!passwordMatchState || !passwordInput || !confirmPasswordInput) return;

    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    let state = "idle";
    let text = t("password_match_idle", "Repeat password to check match");

    if (confirmPassword) {
        if (password === confirmPassword) {
            state = "match";
            text = t("password_match_yes", "Passwords match");
        } else {
            state = "mismatch";
            text = t("password_match_no", "Passwords do not match");
        }
    }

    passwordMatchState.dataset.state = state;
    passwordMatchState.textContent = text;
}

function updatePasswordAssistant() {
    if (!passwordInput) return;
    const checks = getPasswordChecks(passwordInput.value);
    renderPasswordChecklist(checks);
    renderPasswordStrength(passwordInput.value, checks);
    renderPasswordMatch();
}

function bindCapsLockHint(input, hintEl) {
    if (!input || !hintEl || hintEl.dataset.bound === "1") return;

    const updateHint = (event) => {
        const isCapsLockOn = Boolean(event?.getModifierState?.("CapsLock"));
        hintEl.hidden = !isCapsLockOn;
    };

    input.addEventListener("keydown", updateHint);
    input.addEventListener("keyup", updateHint);
    input.addEventListener("focus", updateHint);
    input.addEventListener("blur", () => {
        hintEl.hidden = true;
    });

    hintEl.dataset.bound = "1";
}

function setupPasswordAssistant() {
    if (!passwordInput || !confirmPasswordInput) return;

    if (passwordInput.dataset.assistantBound !== "1") {
        passwordInput.addEventListener("input", updatePasswordAssistant);
        confirmPasswordInput.addEventListener("input", renderPasswordMatch);
        passwordInput.dataset.assistantBound = "1";
    }

    bindCapsLockHint(passwordInput, passwordCapsLockHint);
    bindCapsLockHint(confirmPasswordInput, confirmPasswordCapsLockHint);
    updatePasswordAssistant();
}

document.addEventListener("DOMContentLoaded", async () => {
    setupPasswordToggles();
    setupPasswordAssistant();
    const res = await getSession();
    if (res.ok) {
        window.location.replace("main-chat.html");
    }
});

window.addEventListener("duckapp:translations-ready", () => {
    setupPasswordToggles();
    setupPasswordAssistant();
});

registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = registerForm.username.value.trim();
    const email = registerForm.email.value.trim();
    const password = registerForm.password.value;
    const confirmPassword = registerForm.confirmPassword.value;
    updatePasswordAssistant();

    if (password !== confirmPassword) {
        msg.textContent = "Error: " + t("password_mismatch_error", "Passwords do not match");
        return;
    }

    const { ok, result } = await registerUser(username, email, password);

    if (ok) {
        const check = await getSession();
        if (check.ok) {
            window.location = "main-chat.html";
        } else {
            msg.textContent = "Error: " + t("session_check_error", "Session check error") + ": " + (check.result.detail || "");
        }
    } else {
        msg.textContent = "Error: " + (result.detail || t("unknown_error", "Unknown error"));
    }
});

initDucks();
