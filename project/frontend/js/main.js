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
const feedbackNicknameInput = document.getElementById("feedback-nickname");
const page = "main_page";
const DEFAULT_PUBLIC_STATS = Object.freeze({
    active_users: 17362,
    uptime_percent: 93.7,
});
const STATS_REFRESH_INTERVAL_MS = 400;

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

function openModal(modal) {
    if (!modal) return;
    modal.style.display = "flex";
    modal.classList.remove("closing");
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

aboutSiteBtn.onclick = () => openModal(aboutSiteModal);
aboutUsBtn.onclick = () => openModal(aboutUsModal);

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
    openModal(feedbackListModal);
    await loadFeedbackList();
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

        meta.appendChild(author);
        meta.appendChild(typeBadge);
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

feedbackOpenListBtn?.addEventListener("click", async () => {
    openModal(feedbackListModal);
    await loadFeedbackList();
});

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

async function initStatsSection() {
    await refreshStats();

    if (statsSection) {
        observer.observe(statsSection);
    }

    startStatsPolling();
}

initStatsSection();

window.addEventListener("beforeunload", () => {
    if (statsPollTimer) {
        clearInterval(statsPollTimer);
        statsPollTimer = null;
    }
});

startChatBtn?.addEventListener("click", () => {
    window.location.href = "authorization-frame.html";
});
