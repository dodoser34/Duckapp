/* ====== MODALS ====== */
const aboutSiteBtn = document.getElementById("aboutSiteBtn");
const aboutUsBtn = document.getElementById("aboutUsBtn");
const aboutSiteModal = document.getElementById("aboutSiteModal");
const aboutUsModal = document.getElementById("aboutUsModal");
const closeButtons = document.querySelectorAll(".close");

// Open modal
function openModal(modal) {
    modal.style.display = "flex";
    modal.classList.remove("closing"); // remove "closing" if it remains
}

// Close modal with animation
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

/* ====== SLIDER ====== */
const slides = document.querySelector(".slides");
const images = document.querySelectorAll(".slides img");
const dotsContainer = document.querySelector(".dots");
let index = 0;

// Create dots
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

/* ====== DUCKS ====== */
const duckCount = 8;
const ducksContainer = document.getElementById("ducks");

function spawnDuck() {
    const duck = document.createElement("div");
    duck.classList.add("duck");
    duck.textContent = "🦆";

    // size
    const size = Math.random() * 20 + 30;
    duck.style.fontSize = size + "px";

    // height
    const top = Math.random() * 90;
    duck.style.top = top + "vh";

    // speed
    const speed = Math.random() * 6 + 6;

    // direction
    const direction = Math.random() < 0.5 ? "right" : "left";

    if (direction === "right") {
        duck.style.left = "-80px";
        duck.style.transform = "scaleX(-1)";
    } else {
        duck.style.left = "100vw";
        duck.style.transform = "scaleX(1)";
    }

    ducksContainer.appendChild(duck);

    requestAnimationFrame(() => {
        duck.style.transition = `left ${speed}s linear`;
        if (direction === "right") {
            duck.style.left = "110vw";
        } else {
            duck.style.left = "-100px";
        }
    });

    setTimeout(() => {
        duck.remove();
        spawnDuck();
    }, speed * 1000);
}

for (let i = 0; i < duckCount; i++) {
    setTimeout(spawnDuck, i * 1000);
}

/* ====== SCROLLBAR SHOW/HIDE ====== */
const root = document.documentElement;
let hideTimer = null;
const SHOW_TIMEOUT = 1500; // hide after this delay (ms)
const EDGE_ZONE = 100; // right edge zone to trigger (px)

// Show scrollbar
function showScroll() {
    if (!root.classList.contains("show-scroll")) {
        root.classList.add("show-scroll");
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        root.classList.remove("show-scroll");
    }, SHOW_TIMEOUT);
}

// Show on mouse move near the right edge
window.addEventListener("mousemove", (e) => {
    if (window.innerWidth - e.clientX < EDGE_ZONE) {
        showScroll();
    }
});

// Mouse wheel / touchpad
window.addEventListener("wheel", () => showScroll(), { passive: true });

// Keyboard scroll keys
window.addEventListener("keydown", (e) => {
    const keys = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " "];
    if (keys.includes(e.key)) showScroll();
});

// Touch screen
window.addEventListener("touchstart", () => showScroll(), { passive: true });
