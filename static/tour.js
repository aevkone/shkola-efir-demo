// Демо-знакомство: пошаговая подсветка элементов с пояснениями.
// Показывается один раз; «?» — показать снова. Работает на панели и в эфире.

const css = `
.tour-shade{position:fixed;inset:0;z-index:2000;pointer-events:auto}
.tour-hole{position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(10,16,30,.62);transition:all .25s ease;pointer-events:none;z-index:2001}
.tour-hole.none{box-shadow:0 0 0 9999px rgba(10,16,30,.62);width:0;height:0;left:50%;top:40%}
.tour-card{position:fixed;z-index:2002;background:#fff;color:#16202e;border-radius:18px;padding:22px 22px 18px;width:min(360px,calc(100vw - 32px));box-shadow:0 12px 40px rgba(0,0,0,.3);font:17px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.tour-card h3{margin:0 0 8px;font-size:20px;line-height:1.25}
.tour-card p{margin:0 0 16px}
.tour-step{color:#64707f;font-size:14px;margin-bottom:6px;font-weight:700}
.tour-row{display:flex;gap:10px;align-items:center;justify-content:space-between}
.tour-row .tour-skip{background:none;border:0;color:#64707f;font:inherit;font-size:15px;cursor:pointer;min-height:44px;padding:0 6px}
.tour-row .tour-btns{display:flex;gap:8px}
.tour-btn{min-height:48px;padding:0 20px;border-radius:12px;border:2px solid #2e6db4;background:#2e6db4;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.tour-btn.back{background:#fff;color:#2e6db4}
.tour-help{position:fixed;right:16px;bottom:16px;z-index:900;width:52px;height:52px;border-radius:50%;border:0;background:#2e6db4;color:#fff;font:700 24px/1 -apple-system,"Segoe UI",Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer}
`;

let styled = false;
function ensureStyle() {
  if (styled) return;
  const s = document.createElement("style");
  s.textContent = css;
  document.head.append(s);
  styled = true;
}

const KEY = (k) => `tour_${k}_v1`;
export function tourSeen(key) {
  try { return localStorage.getItem(KEY(key)) === "1"; } catch (_) { return false; }
}
function markSeen(key) {
  try { localStorage.setItem(KEY(key), "1"); } catch (_) { /* приватный режим */ }
}

function findEl(step) {
  const el = typeof step.el === "function" ? step.el() : (step.el ? document.querySelector(step.el) : null);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return el;
}

/**
 * Запустить знакомство.
 * steps: [{el: "css-селектор" | () => Element | null, title, text}]
 * Шаги без найденного элемента показываются по центру (если без el) или пропускаются.
 */
export function startTour(key, steps, { force = false } = {}) {
  if (!force && tourSeen(key)) return Promise.resolve(false);
  ensureStyle();
  const list = steps.filter((s) => !s.el || findEl(s));
  if (!list.length) return Promise.resolve(false);
  return new Promise((resolve) => {
    const shade = document.createElement("div");
    shade.className = "tour-shade";
    const hole = document.createElement("div");
    hole.className = "tour-hole";
    const card = document.createElement("div");
    card.className = "tour-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-live", "polite");
    document.body.append(shade, hole, card);
    let i = 0;

    const finish = (done) => {
      markSeen(key);
      shade.remove(); hole.remove(); card.remove();
      removeEventListener("keydown", onKey, true);
      removeEventListener("resize", place);
      resolve(done);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    const next = () => { if (i < list.length - 1) { i++; render(); } else finish(true); };
    const prev = () => { if (i > 0) { i--; render(); } };

    function place() {
      const step = list[i];
      const el = step.el ? findEl(step) : null;
      const pad = 8;
      if (el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const r = el.getBoundingClientRect();
        hole.classList.remove("none");
        Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`,
          width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
        const cw = card.offsetWidth, ch = card.offsetHeight;
        const vw = innerWidth, vh = innerHeight;
        let top = r.bottom + 16;
        if (top + ch > vh - 12) top = r.top - ch - 16;
        if (top < 12) top = Math.max(12, Math.min(vh - ch - 12, r.top + r.height / 2 - ch / 2));
        let left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
        if (top < r.bottom && top + ch > r.top) {  // карточка налезла — ставим сбоку
          left = r.right + 16 + cw < vw ? r.right + 16 : Math.max(12, r.left - cw - 16);
        }
        Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
      } else {
        hole.classList.add("none");
        Object.assign(hole.style, { left: "50%", top: "40%", width: "0px", height: "0px" });
        Object.assign(card.style, { left: `${(innerWidth - card.offsetWidth) / 2}px`,
          top: `${Math.max(16, (innerHeight - card.offsetHeight) / 2)}px` });
      }
    }

    function render() {
      const step = list[i];
      card.replaceChildren();
      const n = document.createElement("div");
      n.className = "tour-step";
      n.textContent = list.length > 1 ? `Шаг ${i + 1} из ${list.length}` : "";
      const h = document.createElement("h3");
      h.textContent = step.title;
      h.id = "tour-title";
      card.setAttribute("aria-labelledby", "tour-title");
      const p = document.createElement("p");
      p.textContent = step.text;
      const row = document.createElement("div");
      row.className = "tour-row";
      const skip = document.createElement("button");
      skip.className = "tour-skip";
      skip.textContent = i === list.length - 1 ? "" : "Пропустить";
      skip.onclick = () => finish(false);
      const btns = document.createElement("div");
      btns.className = "tour-btns";
      if (i > 0) {
        const b = document.createElement("button");
        b.className = "tour-btn back"; b.textContent = "Назад"; b.onclick = prev;
        btns.append(b);
      }
      const go = document.createElement("button");
      go.className = "tour-btn";
      go.textContent = i === list.length - 1 ? "Понятно 👍" : "Дальше";
      go.onclick = next;
      btns.append(go);
      row.append(skip, btns);
      card.append(n, h, p, row);
      requestAnimationFrame(place);
      setTimeout(place, 60);
      go.focus();
    }

    shade.addEventListener("click", next);
    addEventListener("keydown", onKey, true);
    addEventListener("resize", place);
    render();
  });
}

/** Круглая кнопка «?» в углу — показать знакомство снова. */
export function helpButton(onClick, { bottom = 16 } = {}) {
  ensureStyle();
  let b = document.querySelector(".tour-help");
  if (!b) {
    b = document.createElement("button");
    b.className = "tour-help";
    b.textContent = "?";
    b.setAttribute("aria-label", "Показать подсказки по экрану");
    b.title = "Подсказки по экрану";
    document.body.append(b);
  }
  b.style.bottom = `${bottom}px`;
  b.onclick = onClick;
  return b;
}
