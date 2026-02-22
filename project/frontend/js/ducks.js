const DUCK_EMOJI = "🦆";

if (!document.getElementById("duck-style")) {
    const style = document.createElement("style");
    style.id = "duck-style";
    style.textContent = `
#ducks {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
}

.duck {
    position: absolute;
    will-change: transform;
}
`;
    document.head.appendChild(style);
}

export function initDucks(count = null) {
    if (count === null) count = Math.floor(Math.random() * (50 - 10 + 1)) + 10;

    let container = document.getElementById("ducks");
    if (!container) {
        container = document.createElement("div");
        container.id = "ducks";
        document.body.appendChild(container);
    }

    const ducks = [];

    for (let i = 0; i < count; i++) {
        const el = document.createElement("div");
        el.className = "duck";
        el.textContent = DUCK_EMOJI;

        el.style.fontSize = `${Math.random() * 20 + 30}px`;

        const y = Math.random() * (window.innerHeight * 0.7) + window.innerHeight * 0.15;
        const dir = Math.random() < 0.5 ? 1 : -1;

        const duck = {
            el,
            x: Math.random() * window.innerWidth,
            y,
            dir,
            speed: Math.random() * 40 + 50,
            waveAmp: Math.random() * 6 + 4,
            waveSpeed: Math.random() * 1.5 + 0.8,
            phase: Math.random() * Math.PI * 2,
            flip: dir === 1 ? -1 : 1
        };

        container.appendChild(el);
        ducks.push(duck);
    }

    let lastTime = performance.now();

    function animate(time) {
        const dt = (time - lastTime) / 1000;
        lastTime = time;

        const maxX = window.innerWidth - 40;

        for (const d of ducks) {
            d.x += d.dir * d.speed * dt;
            d.phase += d.waveSpeed * dt;

            if (d.x <= 0) {
                d.x = 0;
                d.dir = 1;
                d.flip = -1;
            } else if (d.x >= maxX) {
                d.x = maxX;
                d.dir = -1;
                d.flip = 1;
            }

            const waveY = Math.sin(d.phase) * d.waveAmp;

            d.el.style.transform = `
                translate(${d.x}px, ${d.y + waveY}px)
                scaleX(${d.flip})
                rotate(${Math.sin(d.phase) * 2}deg)
            `;
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}