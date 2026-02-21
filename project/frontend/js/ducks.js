const DEFAULT_DUCK_COUNT = 8;
const DUCK_EMOJI = "\uD83E\uDD86";

export function initDucks(duckCount = DEFAULT_DUCK_COUNT) {
    const ducksContainer = document.getElementById("ducks");
    if (!ducksContainer) return;

    function spawnDuck() {
        const duck = document.createElement("div");
        duck.classList.add("duck");
        duck.textContent = DUCK_EMOJI;

        const size = Math.random() * 20 + 30;
        duck.style.fontSize = `${size}px`;

        const top = Math.random() * 90;
        duck.style.top = `${top}vh`;

        const speed = Math.random() * 6 + 6;
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
            duck.style.left = direction === "right" ? "110vw" : "-100px";
        });

        setTimeout(() => {
            duck.remove();
            spawnDuck();
        }, speed * 1000);
    }

    for (let i = 0; i < duckCount; i++) {
        setTimeout(spawnDuck, i * 1000);
    }
}
