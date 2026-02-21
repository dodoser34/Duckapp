import { initDucks } from "./ducks.js";

const aboutSiteBtn = document.getElementById("aboutSiteBtn");
const aboutUsBtn = document.getElementById("aboutUsBtn");
const aboutSiteModal = document.getElementById("aboutSiteModal");
const aboutUsModal = document.getElementById("aboutUsModal");
const closeButtons = document.querySelectorAll(".close");
const statsSection = document.querySelector("#stats");
const counters = document.querySelectorAll("[data-counter]");
const startChatBtn = document.getElementById("start-chat-btn");
const helperToggle = document.getElementById("site-helper-toggle");
const helperPanel = document.getElementById("site-helper-panel");
const helperClose = document.getElementById("site-helper-close");

function openModal(modal) {
    modal.style.display = "flex";
    modal.classList.remove("closing");
}

function closeModal(modal) {
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

const slides = document.querySelector(".slides");
const images = document.querySelectorAll(".slides img");
const dotsContainer = document.querySelector(".dots");
let index = 0;

images.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.classList.add("dot");
    if (i === 0) dot.classList.add("active");
    dot.onclick = () => showSlide(i);
    dotsContainer.appendChild(dot);
});
const dots = document.querySelectorAll(".dot");

function showSlide(i) {
    const slideWidth = document.querySelector(".slider").clientWidth;
    if (i >= images.length) index = 0;
    else if (i < 0) index = images.length - 1;
    else index = i;

    slides.style.transform = `translateX(${-slideWidth * index}px)`;
    dots.forEach((d) => d.classList.remove("active"));
    dots[index].classList.add("active");
}

setInterval(() => {
    showSlide(index + 1);
}, 4000);

initDucks();

const root = document.documentElement;
let hideTimer = null;
const SHOW_TIMEOUT = 1500;
const EDGE_ZONE = 100;

function showScroll() {
    if (!root.classList.contains("show-scroll")) {
        root.classList.add("show-scroll");
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        root.classList.remove("show-scroll");
    }, SHOW_TIMEOUT);
}

window.addEventListener("mousemove", (e) => {
    if (window.innerWidth - e.clientX < EDGE_ZONE) {
        showScroll();
    }
});

window.addEventListener("wheel", () => showScroll(), { passive: true });

window.addEventListener("keydown", (e) => {
    const keys = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " "];
    if (keys.includes(e.key)) showScroll();
});

window.addEventListener("touchstart", () => showScroll(), { passive: true });

let statsPlayed = false;

function animateCounter(el) {
    const target = parseFloat(el.dataset.counter);
    const isDecimal = el.dataset.decimal === "true";
    const duration = 1500;
    const startTime = performance.now();

    function update(time) {
        const progress = Math.min((time - startTime) / duration, 1);
        let value = target * progress;

        el.textContent = isDecimal ? value.toFixed(1) : Math.floor(value);

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = isDecimal ? target.toFixed(1) : target.toLocaleString();
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
            }
        });
    },
    { threshold: 0.5 }
);

observer.observe(statsSection);
startChatBtn?.addEventListener("click", () => {
    window.location.href = "authorization-frame.html";
});
