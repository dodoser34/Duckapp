import { initDucks } from "./ducks.js";
import { API_URL } from "./api.js";

const aboutSiteBtn = document.getElementById("aboutSiteBtn");
const aboutUsBtn = document.getElementById("aboutUsBtn");
const aboutSiteModal = document.getElementById("aboutSiteModal");
const aboutUsModal = document.getElementById("aboutUsModal");
const closeButtons = document.querySelectorAll(".close");
const statsSection = document.querySelector("#stats");
const activeUsersCounter = document.getElementById("active-users-counter");
const uptimeCounter = document.getElementById("uptime-counter");
const counters = [activeUsersCounter, uptimeCounter].filter(Boolean);
const startChatBtn = document.getElementById("start-chat-btn");
const helperToggle = document.getElementById("site-helper-toggle");
const helperPanel = document.getElementById("site-helper-panel");
const helperClose = document.getElementById("site-helper-close");
const helperStartChatBtn = document.getElementById("site-helper-start-chat");
const helperOpenFeedbackFormBtn = document.getElementById("site-helper-open-feedback-form");
const helperOpenFeedbackListBtn = document.getElementById("site-helper-open-feedback-list");
const feedbackForm = document.getElementById("feedback-form");
const feedbackStatus = document.getElementById("feedback-status");
const feedbackSubmit = document.getElementById("feedback-submit");
const feedbackOpenListBtn = document.getElementById("feedback-open-list");
const feedbackSection = document.getElementById("feedback-section");
const feedbackProblemTypeWrap = document.getElementById("feedback-problem-type-wrap");
const feedbackProblemTypeSelect = document.getElementById("feedback-problem-type");
const feedbackProblemTypeTrigger = document.getElementById("feedback-problem-type-trigger");
const feedbackProblemTypeMenu = document.getElementById("feedback-problem-type-menu");
const feedbackListModal = document.getElementById("feedbackListModal");
const feedbackListBody = document.getElementById("feedback-list-body");
const feedbackAdminPanel = document.getElementById("feedback-admin-panel");
const feedbackAdminCodeInput = document.getElementById("feedback-admin-code");
const feedbackAdminLoginBtn = document.getElementById("feedback-admin-login");
const feedbackAdminLogoutBtn = document.getElementById("feedback-admin-logout");
const feedbackAdminStatus = document.getElementById("feedback-admin-status");
const feedbackNicknameInput = document.getElementById("feedback-nickname");
const heroQrSection = document.querySelector(".hero-qr");
const featuresSection = document.querySelector(".features.features-classic-animated");
const footerSection = document.querySelector("footer");
const page = "main_page";
const FEEDBACK_STATUS_OPTIONS = Object.freeze([
    "new",
    "attention",
    "rejected_not_enough_info",
    "approved",
    "resolved",
]);
const DEFAULT_PUBLIC_STATS = Object.freeze({
    active_users: 17362,
    uptime_percent: 93.7,
});
const STATS_REFRESH_INTERVAL_MS = 10000;
let heroQrParallaxEnabled = false;
let heroQrParallaxTicking = false;
let isFeedbackAdmin = false;

function t(key, fallback) {
    const lang = window.currentLang;
    const defaultLang = window.__duckappLangIndex?.default || "en";
    return (
        window.translations?.[lang]?.[page]?.[key] ??
        window.translations?.[defaultLang]?.[page]?.[key] ??
        fallback
    );
}

function setFeedbackStatus(text, kind = "") {
    if (!feedbackStatus) return;
    feedbackStatus.textContent = text || "";
    feedbackStatus.classList.remove("success", "error");
    if (kind) {
        feedbackStatus.classList.add(kind);
    }
}

function setFeedbackAdminStatus(text, kind = "") {
    if (!feedbackAdminStatus) return;
    feedbackAdminStatus.textContent = text || "";
    feedbackAdminStatus.classList.remove("success", "error");
    if (kind) {
        feedbackAdminStatus.classList.add(kind);
    }
}

function normalizeFeedbackRequestStatus(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (FEEDBACK_STATUS_OPTIONS.includes(normalized)) {
        return normalized;
    }
    return "new";
}

function feedbackStatusLabel(value) {
    const normalized = normalizeFeedbackRequestStatus(value);
    const labels = {
        new: t("feedback_status_new", "Новая"),
        attention: t("feedback_status_attention", "Обратим внимание"),
        rejected_not_enough_info: t(
            "feedback_status_rejected_not_enough_info",
            "Отклонена: недостаточно инфы"
        ),
        approved: t("feedback_status_approved", "Одобрена"),
        resolved: t("feedback_status_resolved", "Решена"),
    };
    return labels[normalized] || labels.new;
}

function feedbackStatusBadgeClass(value) {
    return `feedback-list-status-badge status-${normalizeFeedbackRequestStatus(value)}`;
}

function syncFeedbackAdminUi() {
    feedbackAdminPanel?.classList.toggle("is-admin", isFeedbackAdmin);
    if (feedbackAdminCodeInput) {
        feedbackAdminCodeInput.disabled = isFeedbackAdmin;
        if (isFeedbackAdmin) {
            feedbackAdminCodeInput.value = "";
        }
    }
    if (feedbackAdminLoginBtn) {
        feedbackAdminLoginBtn.hidden = isFeedbackAdmin;
    }
    if (feedbackAdminLogoutBtn) {
        feedbackAdminLogoutBtn.hidden = !isFeedbackAdmin;
    }
}

function mapFeedbackAdminError(message) {
    if (!message || message === "Failed to fetch") {
        return t("feedback_admin_error_common", "Ошибка входа администратора.");
    }

    if (message === "Invalid admin code") {
        return t("feedback_admin_error_invalid_code", "Неверный спец-код администратора.");
    }

    if (
        message === "Feedback admin code is not configured" ||
        message === "Admin auth secret is not configured"
    ) {
        return t(
            "feedback_admin_error_not_configured",
            "Админ-вход не настроен на сервере."
        );
    }

    return message;
}

function mapFeedbackStatusUpdateError(message) {
    if (!message || message === "Failed to fetch") {
        return t("feedback_status_update_error", "Не удалось обновить статус заявки.");
    }

    if (
        message === "Admin authentication required" ||
        message === "Admin session is invalid" ||
        message === "Admin session has expired"
    ) {
        return t(
            "feedback_status_update_auth_required",
            "Войдите как админ, чтобы менять статусы."
        );
    }

    if (message === "Feedback request not found") {
        return t("feedback_status_update_not_found", "Заявка не найдена.");
    }

    if (message === "Could not update feedback status") {
        return t("feedback_status_update_error", "Не удалось обновить статус заявки.");
    }

    return message;
}

function mapFeedbackLoadError(message) {
    if (!message) {
        return t("feedback_view_error", "Failed to load requests.");
    }

    if (message === "Could not load feedback" || message === "Failed to fetch") {
        return t("feedback_view_error", "Failed to load requests.");
    }

    return message;
}

function mapFeedbackSubmitError(message) {
    if (!message) {
        return t("feedback_submit_error", "Failed to send feedback.");
    }

    if (message === "Could not save feedback" || message === "Failed to fetch") {
        return t("feedback_submit_error", "Failed to send feedback.");
    }

    return message;
}

function openModal(modal, trigger = null) {
    if (!modal) return;
    modal.classList.remove("from-trigger");
    modal.style.removeProperty("--modal-enter-dx");
    modal.style.removeProperty("--modal-enter-dy");
    modal.style.display = "flex";
    modal.classList.remove("closing");

    if (!trigger) return;

    const content = modal.querySelector(".modal-content");
    if (!content) return;

    const triggerRect = trigger.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const triggerCenterY = triggerRect.top + triggerRect.height / 2;
    const contentCenterX = contentRect.left + contentRect.width / 2;
    const contentCenterY = contentRect.top + contentRect.height / 2;

    modal.style.setProperty("--modal-enter-dx", `${Math.round(triggerCenterX - contentCenterX)}px`);
    modal.style.setProperty("--modal-enter-dy", `${Math.round(triggerCenterY - contentCenterY)}px`);
    modal.classList.add("from-trigger");
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.add("closing");
    modal.addEventListener(
        "animationend",
        () => {
            modal.style.display = "none";
            modal.classList.remove("closing");
        },
        { once: true }
    );
}

aboutSiteBtn.onclick = () => openModal(aboutSiteModal, aboutSiteBtn);
aboutUsBtn.onclick = () => openModal(aboutUsModal, aboutUsBtn);

closeButtons.forEach((btn) => {
    btn.onclick = () => {
        const modal = btn.closest(".modal");
        closeModal(modal);
    };
});

window.onclick = (event) => {
    if (event.target.classList.contains("modal")) {
        closeModal(event.target);
    }
};

function toggleHelperPanel(forceOpen) {
    if (!helperPanel) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : !helperPanel.classList.contains("open");
    helperPanel.classList.toggle("open", open);
    helperPanel.setAttribute("aria-hidden", open ? "false" : "true");
    helperToggle?.classList.toggle("active", open);
}

helperToggle?.addEventListener("click", () => toggleHelperPanel());
helperClose?.addEventListener("click", () => toggleHelperPanel(false));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") toggleHelperPanel(false);
});
document.addEventListener("click", (event) => {
    if (!helperPanel || !helperToggle) return;
    if (helperPanel.contains(event.target) || helperToggle.contains(event.target)) return;
    toggleHelperPanel(false);
});

helperStartChatBtn?.addEventListener("click", () => {
    toggleHelperPanel(false);
    window.location.href = "authorization-frame.html";
});

helperOpenFeedbackFormBtn?.addEventListener("click", () => {
    toggleHelperPanel(false);
    feedbackSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => feedbackNicknameInput?.focus(), 360);
});

helperOpenFeedbackListBtn?.addEventListener("click", async () => {
    toggleHelperPanel(false);
    await openFeedbackListModalAndLoad(helperOpenFeedbackListBtn);
});

function closeFeedbackProblemTypeMenu() {
    if (!feedbackProblemTypeWrap || !feedbackProblemTypeTrigger) return;
    feedbackProblemTypeWrap.classList.remove("open");
    feedbackProblemTypeTrigger.setAttribute("aria-expanded", "false");
}

function updateFeedbackProblemTypeTrigger() {
    if (!feedbackProblemTypeSelect || !feedbackProblemTypeTrigger) return;

    const selected = feedbackProblemTypeSelect.selectedOptions?.[0] || null;
    const placeholder =
        Array.from(feedbackProblemTypeSelect.options).find((opt) => opt.value === "") ||
        feedbackProblemTypeSelect.options[0];
    const hasValue = Boolean(selected?.value);
    const text = hasValue ? selected?.textContent : placeholder?.textContent;

    feedbackProblemTypeTrigger.textContent = (text || "").trim();
    feedbackProblemTypeTrigger.classList.toggle("is-placeholder", !hasValue);
}

function renderFeedbackProblemTypeMenu() {
    if (!feedbackProblemTypeSelect || !feedbackProblemTypeMenu) return;

    feedbackProblemTypeMenu.innerHTML = "";
    Array.from(feedbackProblemTypeSelect.options).forEach((option) => {
        if (!option.value) return;

        const item = document.createElement("li");
        item.className = "feedback-select-option";
        item.setAttribute("role", "option");
        item.dataset.value = option.value;
        item.textContent = (option.textContent || option.value).trim();

        const isSelected = feedbackProblemTypeSelect.value === option.value;
        item.setAttribute("aria-selected", isSelected ? "true" : "false");
        if (isSelected) item.classList.add("selected");

        item.addEventListener("click", () => {
            feedbackProblemTypeSelect.value = option.value;
            feedbackProblemTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
            closeFeedbackProblemTypeMenu();
        });

        feedbackProblemTypeMenu.appendChild(item);
    });
}

function initFeedbackProblemTypeSelect() {
    if (
        !feedbackProblemTypeWrap ||
        !feedbackProblemTypeSelect ||
        !feedbackProblemTypeTrigger ||
        !feedbackProblemTypeMenu
    ) {
        return;
    }

    if (feedbackProblemTypeTrigger.dataset.bound === "1") return;
    feedbackProblemTypeTrigger.dataset.bound = "1";

    updateFeedbackProblemTypeTrigger();
    renderFeedbackProblemTypeMenu();

    feedbackProblemTypeTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = !feedbackProblemTypeWrap.classList.contains("open");
        feedbackProblemTypeWrap.classList.toggle("open", willOpen);
        feedbackProblemTypeTrigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
        if (willOpen) renderFeedbackProblemTypeMenu();
    });

    feedbackProblemTypeSelect.addEventListener("change", () => {
        updateFeedbackProblemTypeTrigger();
        renderFeedbackProblemTypeMenu();
    });

    feedbackForm?.addEventListener("reset", () => {
        setTimeout(() => {
            updateFeedbackProblemTypeTrigger();
            renderFeedbackProblemTypeMenu();
            closeFeedbackProblemTypeMenu();
        }, 0);
    });

    window.addEventListener("duckapp:translations-ready", () => {
        updateFeedbackProblemTypeTrigger();
        renderFeedbackProblemTypeMenu();
    });

    document.addEventListener("click", (event) => {
        if (!feedbackProblemTypeWrap.contains(event.target)) {
            closeFeedbackProblemTypeMenu();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeFeedbackProblemTypeMenu();
        }
    });
}

initFeedbackProblemTypeSelect();

function mapProblemType(type) {
    const normalized = String(type || "").trim().toLowerCase();
    const dictionary = {
        bug: t("feedback_problem_type_bug", "Bug"),
        ui: t("feedback_problem_type_ui", "Interface / UX"),
        performance: t("feedback_problem_type_performance", "Performance"),
        security: t("feedback_problem_type_security", "Security"),
        other: t("feedback_problem_type_other", "Other"),
    };
    return dictionary[normalized] || dictionary.other;
}

function formatFeedbackDate(value, createdAtMs) {
    let date;
    const ms = Number(createdAtMs);
    if (Number.isFinite(ms) && ms > 0) {
        date = new Date(ms);
    } else {
        let normalized = value || new Date().toISOString();
        if (typeof normalized === "string") {
            normalized = normalized.replace(" ", "T");
            if (
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)
            ) {
                normalized = `${normalized}Z`;
            }
        }
        date = new Date(normalized);
    }

    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(window.currentLang || "en", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function createFeedbackField(labelText, value) {
    const wrapper = document.createElement("div");
    wrapper.className = "feedback-list-field";

    const label = document.createElement("span");
    label.className = "feedback-list-field-label";
    label.textContent = labelText;

    const content = document.createElement("div");
    content.className = "feedback-list-field-value";
    content.textContent = value || "-";

    wrapper.appendChild(label);
    wrapper.appendChild(content);
    return wrapper;
}

async function checkFeedbackAdminSession() {
    try {
        const response = await fetch(`${API_URL}/api/feedback/admin/session`, {
            credentials: "include",
        });
        const data = await response.json().catch(() => ({}));
        isFeedbackAdmin = Boolean(response.ok && data?.is_admin);
    } catch {
        isFeedbackAdmin = false;
    }
    syncFeedbackAdminUi();
}

async function updateFeedbackRequestStatus(feedbackId, statusValue) {
    const response = await fetch(`${API_URL}/api/feedback/${encodeURIComponent(feedbackId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: statusValue }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.detail || mapFeedbackStatusUpdateError(""));
    }
    return data?.feedback || null;
}

let feedbackAdminStatusMenuListenersBound = false;

function closeFeedbackAdminStatusMenu(selectWrap) {
    if (!selectWrap) return;
    selectWrap.classList.remove("open");
    const trigger = selectWrap.querySelector(".feedback-select-trigger");
    trigger?.setAttribute("aria-expanded", "false");
}

function closeAllFeedbackAdminStatusMenus(exceptWrap = null) {
    document.querySelectorAll(".feedback-admin-item-select.open").forEach((node) => {
        if (node !== exceptWrap) {
            closeFeedbackAdminStatusMenu(node);
        }
    });
}

function bindFeedbackAdminStatusMenuListeners() {
    if (feedbackAdminStatusMenuListenersBound) return;
    feedbackAdminStatusMenuListenersBound = true;

    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            closeAllFeedbackAdminStatusMenus();
            return;
        }
        if (!target.closest(".feedback-admin-item-select")) {
            closeAllFeedbackAdminStatusMenus();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeAllFeedbackAdminStatusMenus();
        }
    });
}

function createFeedbackAdminStatusSelect(initialStatus) {
    bindFeedbackAdminStatusMenuListeners();

    const selectWrap = document.createElement("div");
    selectWrap.className = "feedback-select-wrap feedback-admin-item-select";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "feedback-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const menu = document.createElement("ul");
    menu.className = "feedback-select-menu";
    menu.setAttribute("role", "listbox");

    let currentValue = normalizeFeedbackRequestStatus(initialStatus);

    function updateTrigger() {
        trigger.textContent = feedbackStatusLabel(currentValue);
        trigger.classList.remove("is-placeholder");
    }

    function renderMenu() {
        menu.innerHTML = "";

        FEEDBACK_STATUS_OPTIONS.forEach((statusValue) => {
            const item = document.createElement("li");
            item.className = "feedback-select-option";
            item.setAttribute("role", "option");
            item.dataset.value = statusValue;
            item.textContent = feedbackStatusLabel(statusValue);

            const isSelected = currentValue === statusValue;
            item.setAttribute("aria-selected", isSelected ? "true" : "false");
            if (isSelected) {
                item.classList.add("selected");
            }

            item.addEventListener("click", () => {
                currentValue = statusValue;
                updateTrigger();
                renderMenu();
                closeFeedbackAdminStatusMenu(selectWrap);
            });

            menu.appendChild(item);
        });
    }

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = !selectWrap.classList.contains("open");
        closeAllFeedbackAdminStatusMenus(selectWrap);
        selectWrap.classList.toggle("open", willOpen);
        trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
        if (willOpen) {
            renderMenu();
        }
    });

    updateTrigger();
    renderMenu();

    selectWrap.appendChild(trigger);
    selectWrap.appendChild(menu);

    return {
        element: selectWrap,
        getValue: () => currentValue,
        setValue: (nextValue) => {
            currentValue = normalizeFeedbackRequestStatus(nextValue);
            updateTrigger();
            renderMenu();
        },
        setDisabled: (disabled) => {
            trigger.disabled = Boolean(disabled);
            selectWrap.classList.toggle("is-disabled", Boolean(disabled));
            if (disabled) {
                closeFeedbackAdminStatusMenu(selectWrap);
            }
        },
    };
}

function createFeedbackAdminControls(item, statusBadge) {
    const controls = document.createElement("div");
    controls.className = "feedback-admin-item-controls";

    let currentStatus = normalizeFeedbackRequestStatus(item.status);
    const statusSelect = createFeedbackAdminStatusSelect(currentStatus);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "feedback-admin-item-save";
    saveBtn.textContent = t("feedback_status_save_btn", "Сохранить статус");

    const note = document.createElement("div");
    note.className = "feedback-admin-item-note";

    saveBtn.addEventListener("click", async () => {
        const nextStatus = normalizeFeedbackRequestStatus(statusSelect.getValue());

        if (nextStatus === currentStatus) {
            note.classList.remove("error");
            note.textContent = t("feedback_status_no_changes", "Статус не изменен.");
            return;
        }

        saveBtn.disabled = true;
        statusSelect.setDisabled(true);
        note.classList.remove("error");
        note.textContent = t("feedback_status_saving", "Сохраняем...");

        try {
            const updatedFeedback = await updateFeedbackRequestStatus(item.id, nextStatus);
            currentStatus = normalizeFeedbackRequestStatus(updatedFeedback?.status || nextStatus);
            item.status = currentStatus;
            statusBadge.className = feedbackStatusBadgeClass(currentStatus);
            statusBadge.textContent = feedbackStatusLabel(currentStatus);
            statusSelect.setValue(currentStatus);
            note.textContent = t("feedback_status_saved", "Статус сохранен.");
        } catch (error) {
            note.classList.add("error");
            note.textContent = mapFeedbackStatusUpdateError(error?.message);
        } finally {
            saveBtn.disabled = false;
            statusSelect.setDisabled(false);
        }
    });

    controls.appendChild(statusSelect.element);
    controls.appendChild(saveBtn);
    controls.appendChild(note);
    return controls;
}

function renderFeedbackList(items) {
    if (!feedbackListBody) return;
    feedbackListBody.innerHTML = "";

    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "feedback-list-empty";
        empty.textContent = t("feedback_view_empty", "No requests yet.");
        feedbackListBody.appendChild(empty);
        return;
    }

    items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "feedback-list-item";
        const statusValue = normalizeFeedbackRequestStatus(item.status);

        const meta = document.createElement("div");
        meta.className = "feedback-list-meta";

        const author = document.createElement("div");
        author.className = "feedback-list-author";
        author.textContent = item.nickname || t("feedback_view_user", "User");

        const typeBadge = document.createElement("div");
        typeBadge.className = "feedback-list-type";
        typeBadge.textContent = mapProblemType(item.problem_type);

        const time = document.createElement("div");
        time.className = "feedback-list-time";
        time.textContent = formatFeedbackDate(item.created_at, item.created_at_ms);

        const statusBadge = document.createElement("div");
        statusBadge.className = feedbackStatusBadgeClass(statusValue);
        statusBadge.textContent = feedbackStatusLabel(statusValue);

        meta.appendChild(author);
        meta.appendChild(typeBadge);
        meta.appendChild(statusBadge);
        meta.appendChild(time);
        card.appendChild(meta);

        card.appendChild(
            createFeedbackField(
                t("feedback_description_label", "Issue description"),
                item.description
            )
        );
        card.appendChild(
            createFeedbackField(
                t("feedback_reproduce_label", "How it happens"),
                item.reproduction
            )
        );
        card.appendChild(
            createFeedbackField(
                t("feedback_recommendation_label", "Fix recommendations"),
                item.recommendation
            )
        );

        if (isFeedbackAdmin) {
            card.appendChild(createFeedbackAdminControls(item, statusBadge));
        }

        feedbackListBody.appendChild(card);
    });
}

async function loadFeedbackList() {
    if (!feedbackListBody) return;

    feedbackListBody.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "feedback-list-empty";
    loading.textContent = t("feedback_view_loading", "Loading requests...");
    feedbackListBody.appendChild(loading);

    try {
        const response = await fetch(`${API_URL}/api/feedback?limit=100`, {
            credentials: "include",
        });
        const data = await response.json().catch(() => []);

        if (!response.ok) {
            throw new Error(mapFeedbackLoadError(data?.detail));
        }

        renderFeedbackList(Array.isArray(data) ? data : []);
    } catch (error) {
        feedbackListBody.innerHTML = "";
        const errorNode = document.createElement("div");
        errorNode.className = "feedback-list-empty";
        errorNode.textContent = mapFeedbackLoadError(error?.message);
        feedbackListBody.appendChild(errorNode);
    }
}

async function openFeedbackListModalAndLoad(triggerButton = null) {
    openModal(feedbackListModal, triggerButton);
    await checkFeedbackAdminSession();
    await loadFeedbackList();
}

feedbackOpenListBtn?.addEventListener("click", async () => {
    await openFeedbackListModalAndLoad(feedbackOpenListBtn);
});

feedbackAdminLoginBtn?.addEventListener("click", async () => {
    const code = feedbackAdminCodeInput?.value.trim() || "";
    if (!code) {
        setFeedbackAdminStatus(t("feedback_admin_code_required", "Введите спец-код."), "error");
        feedbackAdminCodeInput?.focus();
        return;
    }

    feedbackAdminLoginBtn.disabled = true;
    setFeedbackAdminStatus(t("feedback_admin_login_loading", "Выполняется вход..."));

    try {
        const response = await fetch(`${API_URL}/api/feedback/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ code }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(mapFeedbackAdminError(data?.detail));
        }

        isFeedbackAdmin = true;
        syncFeedbackAdminUi();
        setFeedbackAdminStatus(
            t("feedback_admin_login_success", "Вход выполнен. Теперь можно менять статусы."),
            "success"
        );
        await loadFeedbackList();
    } catch (error) {
        setFeedbackAdminStatus(mapFeedbackAdminError(error?.message), "error");
    } finally {
        feedbackAdminLoginBtn.disabled = false;
    }
});

feedbackAdminCodeInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    feedbackAdminLoginBtn?.click();
});

feedbackAdminCodeInput?.addEventListener("input", () => {
    if (feedbackAdminStatus?.textContent) {
        setFeedbackAdminStatus("");
    }
});

feedbackAdminLogoutBtn?.addEventListener("click", async () => {
    feedbackAdminLogoutBtn.disabled = true;
    setFeedbackAdminStatus(t("feedback_admin_logout_loading", "Выходим из админа..."));

    try {
        const response = await fetch(`${API_URL}/api/feedback/admin/logout`, {
            method: "POST",
            credentials: "include",
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(mapFeedbackAdminError(data?.detail));
        }

        isFeedbackAdmin = false;
        syncFeedbackAdminUi();
        setFeedbackAdminStatus(
            t("feedback_admin_logout_success", "Админ-сессия завершена."),
            "success"
        );
        await loadFeedbackList();
    } catch (error) {
        setFeedbackAdminStatus(mapFeedbackAdminError(error?.message), "error");
    } finally {
        feedbackAdminLogoutBtn.disabled = false;
    }
});

syncFeedbackAdminUi();

feedbackForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nickname = document.getElementById("feedback-nickname")?.value.trim();
    const problemType = document.getElementById("feedback-problem-type")?.value;
    const description = document.getElementById("feedback-description")?.value.trim();
    const reproduction = document.getElementById("feedback-reproduce")?.value.trim();
    const recommendation = document.getElementById("feedback-recommendation")?.value.trim();

    if (!nickname || !problemType || !description || !reproduction || !recommendation) {
        setFeedbackStatus(
            t("feedback_submit_error_required", "Please fill all form fields."),
            "error"
        );
        return;
    }

    if (feedbackSubmit) {
        feedbackSubmit.disabled = true;
        feedbackSubmit.textContent = t("feedback_submit_loading", "Sending...");
    }
    setFeedbackStatus("");

    try {
        const response = await fetch(`${API_URL}/api/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nickname,
                problem_type: problemType,
                description,
                reproduction,
                recommendation,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(mapFeedbackSubmitError(data?.detail));
        }

        feedbackForm.reset();
        setFeedbackStatus(t("feedback_submit_success", "Thanks! Feedback was sent."), "success");
        if (feedbackListModal?.style.display === "flex") {
            await loadFeedbackList();
        }
    } catch (error) {
        setFeedbackStatus(mapFeedbackSubmitError(error?.message), "error");
    } finally {
        if (feedbackSubmit) {
            feedbackSubmit.disabled = false;
            feedbackSubmit.textContent = t("feedback_submit_btn", "Send feedback");
        }
    }
});

feedbackForm?.addEventListener("input", () => {
    if (feedbackStatus?.textContent) {
        setFeedbackStatus("");
    }
});

const slides = document.querySelector(".slides");
const images = document.querySelectorAll(".slides img");
let index = 0;

function showSlide(i) {
    if (!slides || images.length === 0) {
        return;
    }

    const slider = document.querySelector(".slider");
    if (!slider) {
        return;
    }

    const slideWidth = slider.clientWidth;
    if (i >= images.length) index = 0;
    else if (i < 0) index = images.length - 1;
    else index = i;

    slides.style.transform = `translateX(${-slideWidth * index}px)`;
}

if (images.length > 1) {
    setInterval(() => {
        showSlide(index + 1);
    }, 4000);
}

initDucks();

let statsPlayed = false;
let statsLiveRenderEnabled = false;
let statsPollTimer = null;
let statsPollInFlight = false;

function normalizePublicStats(payload) {
    const activeUsers = Number(payload?.active_users);
    const uptimePercent = Number(payload?.uptime_percent);

    return {
        active_users:
            Number.isFinite(activeUsers) && activeUsers >= 0
                ? Math.round(activeUsers)
                : DEFAULT_PUBLIC_STATS.active_users,
        uptime_percent:
            Number.isFinite(uptimePercent) && uptimePercent >= 0
                ? Math.min(100, Math.round(uptimePercent * 10) / 10)
                : DEFAULT_PUBLIC_STATS.uptime_percent,
    };
}

async function fetchPublicStats() {
    try {
        const response = await fetch(`${API_URL}/api/stats`, {
            credentials: "include",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return DEFAULT_PUBLIC_STATS;
        }
        return normalizePublicStats(data);
    } catch {
        return DEFAULT_PUBLIC_STATS;
    }
}

function applyPublicStats(stats) {
    if (activeUsersCounter) {
        activeUsersCounter.dataset.counter = String(stats.active_users);
        activeUsersCounter.dataset.decimal = "false";
    }
    if (uptimeCounter) {
        uptimeCounter.dataset.counter = String(stats.uptime_percent);
        uptimeCounter.dataset.decimal = "true";
    }

    if (statsLiveRenderEnabled) {
        renderPublicStats(stats);
    }
}

function renderPublicStats(stats) {
    const locale = window.currentLang || document.documentElement.lang || navigator.language || "en";
    if (activeUsersCounter) {
        activeUsersCounter.textContent = Math.round(Number(stats.active_users) || 0).toLocaleString(locale);
    }
    if (uptimeCounter) {
        const value = Number(stats.uptime_percent);
        uptimeCounter.textContent = Number.isFinite(value) ? value.toFixed(1) : "0.0";
    }
}

function animateCounter(el) {
    const target = Number(el.dataset.counter);
    if (!Number.isFinite(target)) {
        el.textContent = "0";
        return;
    }

    const isDecimal = el.dataset.decimal === "true";
    const locale = window.currentLang || document.documentElement.lang || navigator.language || "en";
    const duration = 1500;
    const startTime = performance.now();

    function update(time) {
        const progress = Math.min((time - startTime) / duration, 1);
        let value = target * progress;

        el.textContent = isDecimal ? value.toFixed(1) : Math.floor(value);

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = isDecimal ? target.toFixed(1) : Math.round(target).toLocaleString(locale);
        }
    }

    requestAnimationFrame(update);
}

const observer = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting && !statsPlayed) {
                counters.forEach(animateCounter);
                statsPlayed = true;
                window.setTimeout(() => {
                    statsLiveRenderEnabled = true;
                }, 1600);
                if (statsSection) {
                    observer.unobserve(statsSection);
                }
            }
        });
    },
    { threshold: 0.5 }
);

async function refreshStats() {
    if (statsPollInFlight) return;
    statsPollInFlight = true;
    try {
        const stats = await fetchPublicStats();
        applyPublicStats(stats);
    } finally {
        statsPollInFlight = false;
    }
}

function startStatsPolling() {
    if (statsPollTimer) return;
    statsPollTimer = window.setInterval(() => {
        if (document.hidden) return;
        refreshStats();
    }, STATS_REFRESH_INTERVAL_MS);
}

function updateHeroQrParallax() {
    if (!heroQrSection || !heroQrParallaxEnabled) return;

    const rect = heroQrSection.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    const sectionCenter = rect.top + rect.height / 2;
    const viewportCenter = viewportHeight / 2;
    const normalized = Math.max(-1, Math.min(1, (sectionCenter - viewportCenter) / viewportHeight));

    const textShift = Math.round(normalized * 8);
    const mediaShift = Math.round(normalized * 14);

    heroQrSection.style.setProperty("--qr-text-parallax", `${textShift}px`);
    heroQrSection.style.setProperty("--qr-media-parallax", `${mediaShift}px`);
}

function scheduleHeroQrParallax() {
    if (heroQrParallaxTicking) return;
    heroQrParallaxTicking = true;
    requestAnimationFrame(() => {
        heroQrParallaxTicking = false;
        updateHeroQrParallax();
    });
}

function initHeroQrAnimation() {
    if (!heroQrSection) return;

    const forceVisible = () => {
        heroQrParallaxEnabled = true;
        heroQrSection.classList.add("is-visible");
        scheduleHeroQrParallax();
    };

    if (typeof IntersectionObserver === "undefined") {
        forceVisible();
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                forceVisible();
                observer.disconnect();
            });
        },
        { threshold: 0.25 }
    );

    observer.observe(heroQrSection);
    window.addEventListener("scroll", scheduleHeroQrParallax, { passive: true });
    window.addEventListener("resize", scheduleHeroQrParallax);
}

function initScrollReveal() {
    const revealTargets = [featuresSection, statsSection, feedbackSection, footerSection].filter(Boolean);
    if (!revealTargets.length) return;

    if (typeof IntersectionObserver === "undefined") {
        revealTargets.forEach((section) => section.classList.add("is-visible"));
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        },
        { threshold: 0.1, rootMargin: "0px 0px -2% 0px" }
    );

    revealTargets.forEach((section) => observer.observe(section));
}

async function initStatsSection() {
    await refreshStats();

    if (statsSection) {
        observer.observe(statsSection);
    }

    startStatsPolling();
}

initStatsSection();
initHeroQrAnimation();
initScrollReveal();

window.addEventListener("beforeunload", () => {
    if (statsPollTimer) {
        clearInterval(statsPollTimer);
        statsPollTimer = null;
    }
});

startChatBtn?.addEventListener("click", () => {
    window.location.href = "authorization-frame.html";
});
