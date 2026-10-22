// Панель управления. Без сборки и библиотек: обычный JavaScript.
import { startTour, helpButton } from "./tour.js";

// ---------- помощники ----------
const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// replaceChildren превращает null в текст «null» — отбрасываем пустое
function put(el, ...kids) {
  el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
}

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", headers: {}, credentials: "same-origin" };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers["Content-Type"] = "application/json";
  }
  const r = await fetch("/api/panel" + path, init);
  let data = null;
  try { data = await r.json(); } catch (_) { /* пусто */ }
  if (r.status === 401) { showLogin(data && data.detail); throw new Error("401"); }
  if (!r.ok) {
    const msg = (data && (typeof data.detail === "string" ? data.detail : "Проверьте, всё ли заполнено")) || "Что-то пошло не так. Попробуйте ещё раз";
    if (!opts.quiet) toast(msg, true);
    const e = new Error(msg); e.status = r.status;
    throw e;
  }
  return data;
}

function toast(text, error = false) {
  const t = h("div", { class: "toast" + (error ? " error" : ""), role: error ? "alert" : "status" }, text);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), error ? 6000 : 2500);
}

async function copy(text, what = "Ссылка скопирована") {
  try { await navigator.clipboard.writeText(text); }
  catch (_) {
    const ta = h("textarea", {}, text); document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  toast(what);
}

// окно: закрывается по Esc и по клику мимо, фокус внутри
function modal(title, body, actions) {
  const prevFocus = document.activeElement;
  const back = h("div", { class: "modal-back", onclick: (e) => { if (e.target === back) close(); } });
  const id = "m" + Math.random().toString(36).slice(2);
  const close = () => { back.remove(); removeEventListener("keydown", onKey); if (prevFocus) prevFocus.focus(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  addEventListener("keydown", onKey);
  const box = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": id },
    h("h2", { id }, title), body, h("div", { class: "actions" }, ...actions(close)));
  back.append(box);
  document.body.append(back);
  setTimeout(() => { const f = box.querySelector("input,select,textarea,button.btn:not(.outline)"); if (f) f.focus(); }, 30);
  return close;
}

function confirmBox(title, text, okText, onOk, { danger = true, extra = null } = {}) {
  modal(title, h("div", {}, h("p", {}, text), extra), (close) => [
    h("button", { class: "btn outline", onclick: close }, "Отмена"),
    h("button", { class: "btn" + (danger ? " red" : ""), onclick: async (e) => { e.target.disabled = true; try { await onOk(); close(); } catch (_) { e.target.disabled = false; } } }, okText),
  ]);
}

function busy(btn, text = "Сохраняю…") {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = text;
  return () => { btn.disabled = false; btn.textContent = old; };
}

// ошибка под полем
function fieldError(input, text) {
  input.classList.add("invalid");
  input.setAttribute("aria-invalid", "true");
  let e = input.parentElement.querySelector(".field-error");
  if (!e) { e = h("div", { class: "field-error", role: "alert" }); input.parentElement.append(e); }
  e.textContent = text;
  input.focus();
  input.addEventListener("input", () => { input.classList.remove("invalid"); input.removeAttribute("aria-invalid"); e.remove(); }, { once: true });
  return false;
}

function field(label, input, hint) {
  return h("label", { class: "field" }, h("span", {}, label), input, hint ? h("small", { class: "muted", style: "display:block;margin-top:6px" }, hint) : null);
}

const pad = (n) => String(n).padStart(2, "0");
function plusDays(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function plural(n, one, few, many) {
  n = Math.abs(n) % 100; const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}
const chipClass = { ready: "green", live: "red", wait: "amber", error: "red", none: "" };

// ---------- состояние ----------
const state = { me: null, groups: [], studentGroup: null, studentFilter: "all" };
const isHost = () => state.me && state.me.role === "host";

function showLogin(detail) {
  put($("#main"), h("div", { class: "msg-card", style: "margin:60px auto" },
    h("h1", {}, "Вход в панель"),
    h("p", {}, detail || "Откройте бота школы в Telegram и нажмите «🛠 Панель управления» — придёт ссылка для входа."),
  ));
}

// ---------- навигация ----------
// В демо-версии (GitHub Pages, без сервера) разделы живут в адресе после «#».
const DEMO = !!window.KZ_DEMO;
const curPath = () => DEMO ? (decodeURI(location.hash.slice(1)) || "/panel") : location.pathname;
function go(path) {
  if (DEMO) { if (location.hash.slice(1) !== path) { location.hash = path; return; } route(); return; }
  history.pushState({}, "", path);
  route();
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href^='/panel']");
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute("href")); $("#side").classList.remove("open"); }
});
window.addEventListener(DEMO ? "hashchange" : "popstate", route);
$("#burger").addEventListener("click", () => $("#side").classList.toggle("open"));
$("#logout").addEventListener("click", async () => {
  await fetch("/api/panel/logout", { method: "POST" });
  showLogin("Вы вышли. Чтобы войти снова, нажмите в боте «🛠 Панель управления».");
});

async function route() {
  const p = curPath().replace(/\/+$/, "");
  const m = p.match(/^\/panel\/lessons\/(\d+)$/);
  let page = "lessons";
  if (p.startsWith("/panel/students")) page = "students";
  else if (p.startsWith("/panel/recordings")) page = "recordings";
  else if (p.startsWith("/panel/settings")) page = "settings";
  document.querySelectorAll("#nav a").forEach((a) => {
    const on = a.dataset.page === page;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  put($("#main"), h("div", { class: "loading" }, h("span", { class: "spinner", "aria-label": "Загрузка" })));
  try {
    if (m) await pageLesson(Number(m[1]));
    else if (page === "students") await pageStudents();
    else if (page === "recordings") await pageRecordings();
    else if (page === "settings") await pageSettings();
    else await pageLessons();
  } catch (e) {
    if (e.message !== "401") console.error(e);
  }
  window.scrollTo(0, 0);
}

async function loadGroups() {
  state.groups = (await api("/groups")).items;
  return state.groups;
}
const activeGroups = () => state.groups.filter((g) => !g.archived);

function groupOptions(selected, allowNone = false) {
  const opts = state.groups.filter((g) => !g.archived || g.id === selected)
    .map((g) => h("option", { value: g.id, selected: g.id === selected }, g.name));
  if (allowNone) opts.unshift(h("option", { value: "", selected: !selected }, "— без группы —"));
  return opts;
}

// ---------- эфир: человеческий статус ----------
function serverLine(srv) {
  const box = h("div", { class: "server-line", role: "status" });
  const paint = (s) => {
    let icon = "⏳", text = "Эфир включится сам за 30 минут до урока";
    if (s.state === "ready") { icon = "✅"; text = "Эфир готов"; }
    else if (s.state === "starting") { icon = "⏳"; text = "Эфир готовится, обычно 2–4 минуты"; }
    put(box, h("span", {}, `${icon} ${text}`),
      s.state === "off" ? h("button", { class: "link-btn", onclick: async () => {
        const ns = await api("/server/prepare", { method: "POST" }); paint(ns); poll();
        toast("Готовлю эфир — через несколько минут всё будет готово");
      } }, "Включить сейчас") : null);
  };
  let timer = null;
  const poll = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!document.body.contains(box)) return;
      try { const s = await api("/server", { quiet: true }); paint(s); if (s.state === "starting") poll(); } catch (_) { /* тихо */ }
    }, 5000);
  };
  paint(srv);
  if (srv.state === "starting") poll();
  return box;
}

async function startLesson(id) {
  const r = await api(`/lessons/${id}/start`, { method: "POST" });
  location.href = r.url;  // в той же вкладке: браузер не заблокирует
}

// ---------- Уроки ----------
async function pageLessons() {
  const [data, srv] = await Promise.all([api("/lessons"), api("/server"), loadGroups()]);
  const students = (await api("/students")).items;
  const head = h("div", { class: "page-head" }, h("h1", {}, "Уроки"),
    h("div", { class: "actions" },
      h("button", { class: "btn", id: "btn-new-lesson", onclick: () => lessonForm() }, "+ Новый урок"),
      h("button", { class: "btn outline", id: "btn-video", onclick: recordVideo }, "🎥 Записать видеоурок")));
  const parts = [head];

  // первый вход: три шага
  const steps = [
    { done: state.groups.length > 0, text: "Создайте группу — например, «Курс 2026»", btn: "Создать группу", act: () => go("/panel/settings#groups") },
    { done: data.items.length > 0, text: "Создайте первый урок — дату, время и группу", btn: "Создать урок", act: () => lessonForm() },
    { done: students.length > 0, text: "Пригласите учеников — каждый получит личную ссылку", btn: "Пригласить", act: () => go("/panel/students") },
  ];
  if (steps.some((s) => !s.done)) {
    parts.push(h("div", { class: "card start-steps", style: "margin-bottom:24px" },
      h("h2", { style: "margin-bottom:14px" }, "С чего начать"),
      ...steps.map((s, i) => h("div", { class: "start-step" + (s.done ? " done" : "") },
        h("span", { class: "num", "aria-hidden": "true" }, s.done ? "✓" : String(i + 1)),
        h("span", { class: "grow" }, s.text),
        s.done ? h("span", { class: "muted" }, "готово") : h("button", { class: "btn small", onclick: s.act }, s.btn)))));
  }

  if (data.next) {
    const n = data.next;
    const isLive = n.status === "live";
    const meta = [n.date_label, n.group, n.students ? `${n.students} ${plural(n.students, "ученик", "ученика", "учеников")}` : null,
      n.materials ? `${n.materials} ${plural(n.materials, "файл", "файла", "файлов")}` : null].filter(Boolean).join(" · ");
    parts.push(h("div", { class: "next" + (isLive ? " live" : ""), id: "next-card" },
      h("div", { class: "grow" },
        h("div", { class: "label" }, isLive ? "● Урок идёт" : "Следующий урок"),
        h("h2", {}, h("a", { href: `/panel/lessons/${n.id}`, style: "color:inherit" }, n.title)),
        h("div", { class: "muted" }, meta),
        serverLine(srv)),
      h("button", { class: "btn green big", id: "btn-start", onclick: () => startLesson(n.id) }, isLive ? "▶ Вернуться в эфир" : "▶ Начать урок")));
  } else if (data.items.length) {
    parts.push(h("div", { class: "card", style: "margin-bottom:24px" }, "Ближайших эфиров нет. Создайте урок — ученики получат напоминание за сутки и за 15 минут."));
  }

  if (data.items.length) {
    const rows = data.items.map((l) => h("tr", { class: "click", tabindex: "0", onclick: () => go(`/panel/lessons/${l.id}`),
      onkeydown: (e) => { if (e.key === "Enter") go(`/panel/lessons/${l.id}`); } },
      h("td", { style: "white-space:nowrap" }, l.date_label),
      h("td", { class: "title" }, l.title, h("div", { class: "muted small sub" },
        `${l.kind_label} · ${l.who.text}`)),
      h("td", {}, h("span", { class: "chip " + (chipClass[l.record.kind] || "") }, l.record.text))));
    parts.push(h("div", { class: "table-card", id: "lessons-table" }, h("table", { class: "t lessons" },
      h("thead", {}, h("tr", {}, ...["Дата", "Урок", "Запись"].map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", {}, rows))));
  }
  put($("#main"), ...parts);
  maybeTour();
}

function durationSelect(value = 150) {
  const opts = [[60, "1 час"], [90, "1,5 часа"], [120, "2 часа"], [150, "2,5 часа"], [180, "3 часа"], [240, "4 часа"]];
  if (!opts.some(([v]) => v === value)) opts.push([value, `${value} мин`]);
  return h("select", {}, ...opts.map(([v, t]) => h("option", { value: v, selected: v === value }, t)));
}

function lessonForm() {
  if (!activeGroups().length) {
    modal("Сначала — группа", h("p", {}, "Уроки проходят для группы учеников. Создайте её — например, «Курс 2026»."), (close) => [
      h("button", { class: "btn outline", onclick: close }, "Позже"),
      h("button", { class: "btn", onclick: () => { close(); go("/panel/settings#groups"); } }, "Создать группу")]);
    return;
  }
  const f = {
    title: h("input", { type: "text", placeholder: "Например: Урок 6. Итоги", maxlength: 200 }),
    when: h("input", { type: "datetime-local" }),
    duration: durationSelect(150),
    group: h("select", {}, ...groupOptions(activeGroups()[0].id)),
    open: h("input", { type: "checkbox" }),
  };
  modal("Новый урок", h("div", {},
    field("Название", f.title),
    h("div", { class: "form-row" }, field("Дата и время эфира", f.when), field("Длительность", f.duration)),
    field("Группа", f.group),
    h("label", { class: "check-row" }, f.open, h("span", {}, h("b", {}, "Открытый урок"), h("br"), h("span", { class: "muted small" }, "Смогут прийти все, у кого есть ссылка (доступ 10 дней)"))),
    h("p", { class: "hint-box" }, "🔔 Ссылку ученикам рассылать не нужно. Урок сам появится у учеников группы в боте, а бот напомнит за сутки и за 15 минут — с кнопкой «Войти на урок»."),
  ), (close) => [
    h("button", { class: "btn outline", onclick: close }, "Отмена"),
    h("button", { class: "btn", onclick: async (e) => {
      if (!f.title.value.trim()) return fieldError(f.title, "Напишите название урока");
      if (!f.when.value) return fieldError(f.when, "Укажите дату и время урока");
      const done = busy(e.target, "Создаю…");
      try {
        const l = await api("/lessons", { method: "POST", body: {
          title: f.title.value, starts_at_local: f.when.value, duration_min: Number(f.duration.value),
          group_id: Number(f.group.value) || null, visibility: f.open.checked ? "link" : "group",
        } });
        close();
        toast(l.students ? `Урок создан. Напоминание придёт само ${l.students} ${plural(l.students, "ученику", "ученикам", "ученикам")} группы — рассылать ничего не нужно` : "Урок создан. Ученики группы получат напоминание сами", false);
        go(`/panel/lessons/${l.id}`);
      } catch (_) { done(); }
    } }, "Создать урок"),
  ]);
}

async function recordVideo() {
  if (!state.groups.length) await loadGroups();
  const title = h("input", { type: "text", placeholder: "Например: Разбор домашних заданий" });
  const group = h("select", {}, ...groupOptions(activeGroups()[0] && activeGroups()[0].id, true));
  modal("Записать видеоурок", h("div", {},
    h("p", { class: "muted" }, "Откроется эфир без зрителей: камера и экран. Когда закончите, запись появится у группы в «Записях»."),
    field("Название", title),
    field("Для какой группы", group),
  ), (close) => [
    h("button", { class: "btn outline", onclick: close }, "Отмена"),
    h("button", { class: "btn", onclick: async (e) => {
      const done = busy(e.target, "Открываю…");
      try {
        const r = await api("/lessons/video", { method: "POST", body: { title: title.value, group_id: Number(group.value) || null } });
        location.href = r.url;
      } catch (_) { done(); }
    } }, "🎥 Начать запись"),
  ]);
}

// ---------- рассылка ----------
function writeStudents({ groupId = null, lessonId = null, who = "students", text = "", title = "Написать ученикам", button = "" } = {}) {
  const ta = h("textarea", { rows: 5, maxlength: 2000, placeholder: "Например: Домашнее задание уже в «Материалах» 📎" }, text);
  const whoSel = h("select", {},
    h("option", { value: "students", selected: who === "students" }, "Ученикам группы"),
    lessonId ? h("option", { value: "all", selected: who === "all" }, "Ученикам и гостям урока") : null,
    lessonId ? h("option", { value: "guests", selected: who === "guests" }, "Только гостям урока") : null,
    lessonId ? h("option", { value: "absent", selected: who === "absent" }, "Тем, кто не был на уроке") : null);
  const btnSel = h("select", {},
    h("option", { value: "", selected: !button }, "Без кнопки"),
    lessonId ? h("option", { value: "lesson", selected: button === "lesson" }, "«Войти на урок»") : null,
    h("option", { value: "records", selected: button === "records" }, "«Записи»"),
    h("option", { value: "materials", selected: button === "materials" }, "«Материалы»"));
  modal(title, h("div", {}, field("Сообщение", ta), h("div", { class: "form-row" }, field("Кому", whoSel), field("Кнопка в сообщении", btnSel)),
    h("p", { class: "muted small" }, "Сообщение придёт ученикам в бот школы.")), (close) => [
    h("button", { class: "btn outline", onclick: close }, "Отмена"),
    h("button", { class: "btn", onclick: async (e) => {
      if (!ta.value.trim()) return fieldError(ta, "Напишите текст сообщения");
      const done = busy(e.target, "Отправляю…");
      try {
        const r = await api("/broadcast", { method: "POST", body: { text: ta.value, group_id: groupId, lesson_id: lessonId, who: whoSel.value, button: btnSel.value } });
        close();
        toast(r.total ? `Отправляю ${r.total} ${plural(r.total, "ученику", "ученикам", "ученикам")}` : "Пока некому отправлять — никто не открыл ссылку", !r.total);
      } catch (_) { done(); }
    } }, "✉ Отправить"),
  ]);
}

// ---------- Карточка урока ----------
async function pageLesson(id) {
  const [l] = await Promise.all([api(`/lessons/${id}`), loadGroups()]);
  renderLesson(l);
}

function renderLesson(l) {
  // сохранение сразу при изменении
  let saveTimer = null;
  const saveNow = async (patch, okText = "Сохранено ✓") => {
    try {
      const nl = await api(`/lessons/${l.id}`, { method: "PATCH", body: patch });
      toast(okText); Object.assign(l, nl); return nl;
    } catch (_) { return null; }
  };
  const saveSoon = (patch) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveNow(patch), 600); };

  const titleIn = h("input", { type: "text", value: l.title, maxlength: 200, onchange: (e) => e.target.value.trim() ? saveNow({ title: e.target.value }) : fieldError(e.target, "Название не может быть пустым") });

  // материалы
  const fileInput = h("input", { type: "file", multiple: true, class: "hidden", onchange: (e) => upload(e.target.files) });
  const drop = h("div", { class: "drop", id: "dropzone", tabindex: "0", role: "button", onclick: () => fileInput.click(), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") fileInput.click(); } },
    h("div", {}, "Перетащите файлы сюда или ", h("b", {}, "выберите на компьютере")),
    h("div", { class: "small" }, "До 50 МБ каждый · можно просто отправить файл боту"), fileInput);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => upload(e.dataTransfer.files));
  async function upload(files) {
    let last = null;
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) { toast(`«${file.name}» больше 50 МБ — Telegram такие не принимает. Сожмите файл.`, true); continue; }
      const fd = new FormData(); fd.append("file", file);
      toast(`Загружаю «${file.name}»…`);
      try { last = await api(`/lessons/${l.id}/materials`, { method: "POST", body: fd }); } catch (_) { /* уже показано */ }
    }
    if (last) { toast(l.notify_students ? "Файлы добавлены — через 5 минут ученикам придёт сообщение" : "Файлы добавлены"); renderLesson(last); }
  }
  const icon = (k) => ({ PDF: "📄", Word: "📝", Excel: "📊", PowerPoint: "📽️", Картинка: "🖼️", Видео: "🎞️", Аудио: "🎧", Архив: "🗜️" }[k] || "📎");
  const files = h("div", { class: "files" }, ...l.materials_list.map((m) => h("div", { class: "file" },
    h("div", { class: "ico", "aria-hidden": "true" }, icon(m.kind)),
    h("div", { class: "grow" }, h("div", { class: "name" }, m.name), h("div", { class: "muted small" }, `${m.size}${m.hidden ? " · скрыт от учеников" : ""}`)),
    h("div", { class: "ops" },
      h("button", { class: "icon-btn", title: "Поднять выше", "aria-label": `Поднять «${m.name}» выше`, onclick: async () => renderLesson(await api(`/materials/${m.id}`, { method: "PATCH", body: { move: -1 } })) }, "↑"),
      h("button", { class: "icon-btn", title: m.hidden ? "Показать ученикам" : "Скрыть от учеников", "aria-label": m.hidden ? `Показать «${m.name}» ученикам` : `Скрыть «${m.name}» от учеников`, onclick: async () => renderLesson(await api(`/materials/${m.id}`, { method: "PATCH", body: { hidden: !m.hidden } })) }, m.hidden ? "👁" : "🙈"),
      h("button", { class: "icon-btn", title: "Удалить", "aria-label": `Удалить «${m.name}»`, onclick: () => confirmBox("Удалить файл?", `«${m.name}» пропадёт из материалов урока.`, "Удалить", async () => renderLesson(await api(`/materials/${m.id}`, { method: "DELETE" }))) }, "🗑")),
  )));
  if (!l.materials_list.length) files.append(h("div", { class: "muted", style: "padding:6px 0" }, "Материалов пока нет."));

  // запись
  const ready = l.recordings.filter((r) => r.status === "ready").pop();
  let recBody;
  if (ready) {
    recBody = h("div", { class: "rec" },
      h("button", { class: "thumb", onclick: () => playRec(ready.id, l.title), "aria-label": "Смотреть запись" }, "▶"),
      h("div", { class: "rec-meta" }, h("b", {}, `${ready.date} · ${ready.duration}`), h("span", { class: "muted" }, `Просмотров: ${ready.views}`)));
  } else {
    const other = l.recordings[l.recordings.length - 1];
    recBody = h("div", { class: "muted" }, other ? `${other.status_label}${other.error ? ": " + other.error : ""}` :
      (l.kind === "video" ? "Запись появится, когда вы закончите видеоурок." : "Запись идёт автоматически и появится здесь после урока."));
  }
  const toggle = (id, checked, label, onchange) => h("label", { class: "row-between toggle-row", for: id },
    h("span", {}, label), h("span", { class: "switch" }, h("input", { type: "checkbox", id, checked, onchange }), h("span", { "aria-hidden": "true" })));

  // доступ
  const visCard = (val, title, sub) => {
    const input = h("input", { type: "radio", name: "vis", value: val, checked: l.visibility === val });
    const card = h("label", { class: "radio-card" + (l.visibility === val ? " on" : "") }, input, h("div", {}, h("b", {}, title), h("span", { class: "muted" }, sub)));
    input.addEventListener("change", async () => {
      const nl = await saveNow({ visibility: val, ...(val === "link" && !l.access_days ? { access_days: 10 } : {}) });
      if (nl) renderLesson(nl);
    });
    return card;
  };
  const daysIn = h("input", { type: "number", min: 1, max: 3650, value: l.access_days || "", "aria-label": "Сколько дней после урока доступно" });
  daysIn.addEventListener("change", async () => {
    const v = Number(daysIn.value);
    if (v > 0) { const nl = await saveNow({ access_days: v }); if (nl) renderLesson(nl); }
  });
  const closes = h("div", { class: "muted", style: "margin-top:10px" },
    l.access_days ? (l.available_until ? `Закроется сам ${l.available_until}` : "") : "Без срока");

  const signupIn = h("input", { type: "url", value: l.signup_url || "", placeholder: "https://… страница записи на курс", onchange: (e) => saveNow({ signup_url: e.target.value }) });
  const linkBox = l.visibility === "link" ? h("div", {},
    h("div", { class: "section-title" }, "🔗 Ссылка для всех желающих"),
    h("div", { class: "copy-field" }, h("input", { type: "text", readonly: true, value: l.open_link_short, "aria-label": "Ссылка на открытый урок" }),
      h("button", { class: "btn outline", onclick: () => copy(l.open_link) }, "Копировать")),
    h("div", { class: "muted small", style: "margin-top:8px" }, `Пришло по ссылке: ${l.guests}. `,
      h("button", { class: "link-btn small", onclick: () => {
        const drop = h("input", { type: "checkbox" });
        confirmBox("Сделать новую ссылку?", "Старая ссылка перестанет работать для новых гостей.", "Сделать новую", async () => renderLesson(await api(`/lessons/${l.id}`, { method: "PATCH", body: { reset_link: true, drop_guests: drop.checked } })),
          { danger: false, extra: h("label", { class: "check-row" }, drop, h("span", {}, "И закрыть доступ всем, кто уже пришёл по старой")) });
      } }, "Новая ссылка")),
    field("Ссылка «Записаться на курс» для гостей", signupIn, "Через час после урока гости получат сообщение с этой кнопкой и записью урока.")) : null;

  // дата и время, перенос — с сообщением ученикам
  const whenIn = h("input", { type: "datetime-local", value: l.starts_at_local });
  whenIn.addEventListener("change", () => {
    if (!whenIn.value || whenIn.value === l.starts_at_local) return;
    const d = new Date(whenIn.value);
    const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    const txt = `📅 Урок «${l.title}» перенесён на ${d.getDate()} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}. Я напомню заранее.`;
    const ta = h("textarea", { rows: 3 }, txt);
    modal("Сообщить ученикам о переносе?", h("div", {}, h("p", { class: "muted" }, "Ученики и гости получат сообщение в бот. Напоминания придут заново по новому времени."), field("Текст", ta)), (close) => [
      h("button", { class: "btn outline", onclick: async () => { close(); const nl = await saveNow({ starts_at_local: whenIn.value }); if (nl) renderLesson(nl); } }, "Перенести без сообщения"),
      h("button", { class: "btn", onclick: async () => { close(); const nl = await saveNow({ starts_at_local: whenIn.value, notify_text: ta.value }, "Перенесено, ученикам отправляется сообщение"); if (nl) renderLesson(nl); } }, "Перенести и сообщить"),
    ]);
  });
  const durIn = durationSelect(l.duration_min);
  durIn.addEventListener("change", () => saveNow({ duration_min: Number(durIn.value) }));
  const groupIn = h("select", { onchange: (e) => saveSoon({ group_id: Number(e.target.value) || null }) }, ...groupOptions(l.group_id, true));

  // посещаемость
  const att = l.attendance;
  const attBox = (l.status === "finished" || l.status === "live") && att ? h("div", { class: "card" },
    h("h3", {}, "🙋 Кто был на уроке"),
    att.total ? h("p", { style: "font-size:20px;margin:0 0 8px" }, h("b", {}, `${att.came} из ${att.total}`), " учеников группы") : null,
    att.guests ? h("p", { class: "muted", style: "margin:0 0 8px" }, `Гостей: ${att.guests}`) : null,
    att.absent && att.absent.length ? h("details", {}, h("summary", { class: "link-btn" }, `Не были (${att.absent.length})`), h("p", { class: "muted" }, att.absent.join(", "))) : null,
    att.absent && att.absent.length ? h("button", { class: "btn outline", style: "margin-top:12px", onclick: () => writeStudents({ lessonId: l.id, who: "absent", title: "Написать тем, кто не был", button: "records", text: `Вы пропустили урок «${l.title}». Запись — в «Записях», материалы — в «Материалах».` }) }, "✉ Написать тем, кто не был") : null) : null;

  const startLabel = l.status === "live" ? "▶ Вернуться в эфир" : (l.can_resume ? "▶ Возобновить урок" : (l.kind === "video" ? "🎥 Записывать" : "▶ Начать урок"));
  const canStart = l.status !== "finished" || l.can_resume || l.kind === "video";
  const head = h("div", { class: "page-head" },
    h("div", { style: "flex:1;min-width:260px" }, h("a", { class: "back", href: "/panel" }, "← Уроки"), h("h1", {}, l.title)),
    h("div", { class: "actions" },
      canStart ? h("button", { class: "btn green", id: "btn-start", onclick: () => startLesson(l.id) }, startLabel) : null,
      h("button", { class: "btn outline", onclick: () => writeStudents({ lessonId: l.id, who: l.visibility === "link" ? "all" : "students", button: "lesson" }) }, "✉ Написать ученикам")));

  put($("#main"), head, h("div", { class: "grid-2" },
    h("div", { class: "stack" },
      h("div", { class: "card" }, h("h3", {}, "📁 Материалы урока"), files, drop),
      h("div", { class: "card" }, h("h3", {}, "🎬 Запись урока"), recBody,
        toggle("dl-toggle", l.download_allowed, "Разрешить ученикам скачивать запись", (e) => saveNow({ download_allowed: e.target.checked }))),
      attBox,
      h("div", { class: "card" }, h("h3", {}, "✏️ Об уроке"),
        field("Название", titleIn),
        l.kind === "live" ? h("div", { class: "form-row" }, field("Дата и время", whenIn), field("Длительность", durIn)) : null,
        field("Группа", groupIn),
        l.kind === "live" && l.status !== "finished" ? h("p", { class: "hint-box" },
          `🔔 Напоминание с кнопкой «Войти на урок» придёт само за сутки и за 15 минут: ${l.students ? `${l.students} ${plural(l.students, "ученику", "ученикам", "ученикам")} группы «${l.group}»` : "ученикам группы"}${l.visibility === "link" ? " и всем, кто пришёл по ссылке" : ""}. Рассылать ссылку не нужно.`) : null,
        toggle("notify-toggle", l.notify_students, "Сообщать ученикам о готовой записи и новых материалах", (e) => saveNow({ notify_students: e.target.checked })),
        h("div", { class: "danger" },
          h("button", { class: "link-btn", onclick: () => copyLessonDialog(l) }, "📋 Скопировать урок"),
          isHost() ? h("button", { class: "link-btn red", onclick: () => {
            const tell = h("input", { type: "checkbox", checked: l.status !== "finished" });
            confirmBox("Удалить урок?", `«${l.title}» исчезнет у всех учеников вместе с материалами и записью. Отменить нельзя.`, "Удалить урок", async () => {
              const r = await api(`/lessons/${l.id}?notify_cancel=${tell.checked}`, { method: "DELETE" });
              toast(r.notified ? `Урок удалён, сообщение об отмене уходит ${r.notified} ученикам` : "Урок удалён"); go("/panel");
            }, { extra: l.status !== "finished" ? h("label", { class: "check-row" }, tell, h("span", {}, "Сообщить ученикам об отмене")) : null });
          } }, "Удалить урок") : null))),
    h("div", { class: "card" },
      h("h3", {}, "🔑 Кто видит урок и запись"),
      visCard("group", "Только ученики группы", l.group || "Выберите группу"),
      visCard("link", "Все, у кого есть ссылка", "Для открытых и вводных уроков"),
      h("div", { class: "section-title" }, "⏳ Сколько дней после урока доступно"),
      h("div", { class: "days" }, daysIn, h("span", {}, "дней")),
      closes,
      l.access_days ? h("button", { class: "link-btn small", onclick: async () => { const nl = await saveNow({ unlimited: true }); if (nl) renderLesson(nl); } }, "Без срока") : null,
      linkBox)));
}

function copyLessonDialog(l) {
  const group = h("select", {}, ...groupOptions(l.group_id));
  const when = h("input", { type: "datetime-local", value: l.starts_at_local });
  modal("Скопировать урок", h("div", {}, h("p", { class: "muted" }, "Будет новый урок с теми же настройками и материалами — например, для второй группы."),
    field("Для группы", group), l.kind === "live" ? field("Дата и время", when) : null), (close) => [
    h("button", { class: "btn outline", onclick: close }, "Отмена"),
    h("button", { class: "btn", onclick: async (e) => {
      const done = busy(e.target, "Копирую…");
      try {
        const n = await api(`/lessons/${l.id}/copy`, { method: "POST", body: { group_id: Number(group.value), starts_at_local: when.value || null } });
        close(); toast("Урок скопирован"); go(`/panel/lessons/${n.id}`);
      } catch (_) { done(); }
    } }, "Скопировать"),
  ]);
}

async function playRec(id, title) {
  const r = await api(`/recordings/${id}/url`);
  modal(title, h("video", { class: "player", src: r.url, controls: true, autoplay: true, playsinline: true }), (c) => [
    h("button", { class: "btn outline", onclick: async () => { const d = await api(`/recordings/${id}/url?download=true`); location.href = d.url; } }, "⬇ Скачать"),
    h("button", { class: "btn", onclick: c }, "Закрыть"),
  ]);
}

// ---------- Ученики ----------
async function pageStudents() {
  await loadGroups();
  if (!state.groups.length) {
    put($("#main"), h("div", { class: "page-head" }, h("h1", {}, "Ученики")),
      h("div", { class: "card" }, "Сначала создайте группу — например, «Курс 2026». ",
        h("a", { href: "/panel/settings#groups" }, "Создать группу →")));
    return;
  }
  const act = activeGroups();
  if (!state.studentGroup || !state.groups.some((g) => g.id === state.studentGroup)) state.studentGroup = (act[0] || state.groups[0]).id;
  const gid = state.studentGroup;
  const group = state.groups.find((g) => g.id === gid);
  const list = (await api(`/students?group_id=${gid}`)).items;
  const count = (st) => list.filter((s) => s.status === st).length;
  const filters = [["all", "Все", list.length], ["active", "Активны", count("active")], ["waiting", "Ждём вход", count("waiting")], ["disabled", "Доступ закрыт", count("disabled") + count("expired")]];
  const shown = list.filter((s) => state.studentFilter === "all" || s.status === state.studentFilter || (state.studentFilter === "disabled" && s.status === "expired"));
  const statusChip = { active: "green", waiting: "amber", disabled: "", expired: "red" };

  const rowFor = (s) => h("tr", {},
    h("td", { class: "title" }, h("button", { class: "link-btn name-btn", onclick: () => editStudent(s) }, s.label)),
    h("td", {}, h("span", { class: "chip " + statusChip[s.status] }, s.status_label), s.reason ? h("div", { class: "muted small" }, s.reason) : null),
    h("td", { class: s.soon ? "soon" : "" }, s.status === "waiting" || s.status === "disabled" ? "—" : s.access_until_label),
    h("td", { style: "white-space:nowrap" }, s.status === "active" || s.status === "expired"
      ? h("button", { class: "link-btn red", onclick: () => closeAccess(s) }, "Закрыть доступ")
      : s.status === "waiting" ? h("button", { class: "link-btn", onclick: () => copyInvite(s) }, "Скопировать приглашение")
        : h("button", { class: "link-btn", onclick: async () => { await api(`/students/${s.id}`, { method: "PATCH", body: { disabled: false } }); toast("Доступ возвращён"); pageStudents(); } }, "Вернуть доступ")));

  const head = h("div", { class: "page-head" },
    h("h1", {}, act.length > 1 || state.groups.length > 1 ? "Ученики" : `Ученики · ${group.name}`),
    h("div", { class: "actions" },
      h("button", { class: "btn", id: "btn-invite", onclick: () => inviteDialog(gid) }, "+ Пригласить учеников"),
      h("button", { class: "btn outline", onclick: () => writeStudents({ groupId: gid, title: `Написать группе «${group.name}»` }) }, "✉ Написать группе")));
  const groupSel = state.groups.length > 1 ? h("label", { class: "group-select" }, h("span", { class: "muted" }, "Группа:"),
    h("select", { onchange: (e) => { state.studentGroup = Number(e.target.value); state.studentFilter = "all"; pageStudents(); } }, ...groupOptions(gid))) : null;
  const filterBar = h("div", { class: "filters", role: "tablist", "aria-label": "Показать учеников" },
    ...filters.map(([k, t, n]) => h("button", { class: "filter" + (state.studentFilter === k ? " on" : ""), role: "tab", "aria-selected": state.studentFilter === k ? "true" : "false",
      onclick: () => { state.studentFilter = k; pageStudents(); } }, `${t} · ${n}`)),
    count("waiting") ? h("button", { class: "link-btn", onclick: () => copyWaiting(list.filter((s) => s.status === "waiting")) }, "Скопировать ссылки тех, кто не открыл") : null);

  put($("#main"), head, groupSel ? h("div", { style: "margin:-8px 0 16px" }, groupSel) : null, filterBar,
    h("div", { class: "table-card", id: "students-table" }, list.length ? h("table", { class: "t students-t" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Ученик"), h("th", { scope: "col" }, "Статус"), h("th", { scope: "col" }, "Доступ до"), h("th", {}, h("span", { class: "sr-only" }, "Действие")))),
      h("tbody", {}, shown.length ? shown.map(rowFor) : h("tr", {}, h("td", { colspan: 4, class: "empty" }, "Здесь никого."))))
      : h("div", { class: "empty" }, h("p", {}, "В группе пока никого."), h("button", { class: "btn", onclick: () => inviteDialog(gid) }, "+ Пригласить учеников"))),
    h("p", { class: "hint-box", style: "margin-top:16px" }, "💡 Ученика приглашают один раз: он открывает личную ссылку и попадает в бот школы. Дальше все уроки его группы появляются у него сами, бот присылает напоминания с кнопкой «Войти на урок»."),
    h("p", { class: "muted small", style: "margin-top:10px" }, "Мы не храним ФИО, телефоны и почты. Имя ученика видите только вы."));
}

let inviteTpl = null;
async function inviteText(link) {
  if (!inviteTpl) inviteTpl = (await api("/invite-message")).message;
  return inviteTpl.replace("{ссылка}", link);
}
async function copyInvite(s) { copy(await inviteText(s.link), "Приглашение скопировано — отправьте его ученику"); }
async function copyWaiting(list) {
  const lines = list.map((s) => `${s.label}: ${s.link}`).join("\n");
  copy(lines, `Скопировано ${list.length} ${plural(list.length, "ссылка", "ссылки", "ссылок")}`);
}

function inviteDialog(gid) {
  const tabOne = h("button", { class: "filter on", role: "tab" }, "Одного");
  const tabMany = h("button", { class: "filter", role: "tab" }, "Списком");
  const label = h("input", { type: "text", placeholder: "Например: Анна", maxlength: 80 });
  const names = h("textarea", { rows: 8, placeholder: "Анна\nОльга\nИрина С.\n…по одному имени на строку" });
  const until = h("input", { type: "date", value: plusDays(365) });
  const one = h("div", {}, field("Имя ученика (видно только вам)", label));
  const many = h("div", { class: "hidden" }, field("Имена — по одному на строку", names, "Можно вставить столбик из таблицы."));
  const result = h("div", {});
  let mode = "one";
  tabOne.onclick = () => { mode = "one"; tabOne.classList.add("on"); tabMany.classList.remove("on"); one.classList.remove("hidden"); many.classList.add("hidden"); };
  tabMany.onclick = () => { mode = "many"; tabMany.classList.add("on"); tabOne.classList.remove("on"); many.classList.remove("hidden"); one.classList.add("hidden"); };
  const closeFn = modal("Пригласить учеников", h("div", {},
    h("div", { class: "filters", role: "tablist", style: "margin-bottom:14px" }, tabOne, tabMany),
    one, many, field("Доступ до", until), result), (close) => [
    h("button", { class: "btn outline", onclick: () => { close(); pageStudents(); } }, "Закрыть"),
    h("button", { class: "btn", id: "btn-make-links", onclick: async (e) => {
      if (mode === "one" && !label.value.trim()) return fieldError(label, "Напишите имя ученика");
      if (mode === "many" && !names.value.trim()) return fieldError(names, "Впишите имена — по одному на строку");
      const done = busy(e.target, "Создаю…");
      try {
        let items;
        if (mode === "one") items = [await api("/students", { method: "POST", body: { group_id: gid, label: label.value, access_until: until.value || null } })];
        else items = (await api("/students/bulk", { method: "POST", body: { group_id: gid, names: names.value, access_until: until.value || null } })).items;
        const allText = (await Promise.all(items.map(async (s) => `${s.label}:\n${await inviteText(s.link)}`))).join("\n\n— — —\n\n");
        put(result, h("div", { class: "invite-result" },
          h("p", {}, h("b", {}, `Готово: ${items.length} ${plural(items.length, "ссылка", "ссылки", "ссылок")}.`), " Отправьте каждому его приглашение в любой мессенджер."),
          h("div", { class: "invite-list" }, ...items.map((s) => h("div", { class: "invite-item" },
            h("span", { class: "grow" }, h("b", {}, s.label), h("br"), h("span", { class: "muted small" }, s.link_short)),
            h("button", { class: "btn small outline", onclick: () => copyInvite(s) }, "Скопировать")))),
          items.length > 1 ? h("button", { class: "btn block", style: "margin-top:12px", onclick: () => copy(allText, "Все приглашения скопированы") }, "📋 Скопировать все приглашения") : null,
          h("a", { class: "link-btn", href: "static/help/instruction.png", download: "Как попасть на урок.png" }, "⬇ Картинка-инструкция для учеников")));
        e.target.classList.add("hidden");
      } catch (_) { done(); }
    } }, "Получить ссылки-приглашения"),
  ]);
  return closeFn;
}

function closeAccess(s) {
  const reasons = [["unpaid", "Не оплачено", "Ученик увидит: «Доступ приостановлен до оплаты»"], ["request", "По просьбе ученика", ""], ["other", "Другое", ""]];
  let reason = "unpaid";
  const box = h("div", { role: "radiogroup" }, ...reasons.map(([v, t, sub], i) => {
    const r = h("input", { type: "radio", name: "reason", value: v, checked: i === 0, onchange: () => { reason = v; } });
    return h("label", { class: "radio-card" + (i === 0 ? " on" : ""), onclick: (e) => { box.querySelectorAll(".radio-card").forEach((c) => c.classList.remove("on")); e.currentTarget.classList.add("on"); } },
      r, h("div", {}, h("b", {}, t), sub ? h("span", { class: "muted small" }, sub) : null));
  }));
  modal(`Закрыть доступ: ${s.label}`, h("div", {}, h("p", { class: "muted" }, "Ученик сразу потеряет доступ к урокам, материалам и записям, а если сейчас в эфире — выйдет из него. Вернуть можно в любой момент."), box), (close) => [
    h("button", { class: "btn outline", onclick: close }, "Отмена"),
    h("button", { class: "btn red", onclick: async (e) => {
      const done = busy(e.target, "Закрываю…");
      try { await api(`/students/${s.id}`, { method: "PATCH", body: { disabled: true, disabled_reason: reason } }); close(); toast("Доступ закрыт"); pageStudents(); }
      catch (_) { done(); }
    } }, "Закрыть доступ"),
  ]);
}

function editStudent(s) {
  const label = h("input", { type: "text", value: s.label, maxlength: 80 });
  const until = h("input", { type: "date", value: s.access_until || "" });
  const group = h("select", {}, ...groupOptions(s.group_id));
  const linkBox = h("div", {}, field("Личная ссылка", h("div", { class: "copy-field" },
    h("input", { type: "text", readonly: true, value: s.link_short, "aria-label": "Личная ссылка" }), h("button", { class: "btn outline", onclick: () => copyInvite(s) }, "Скопировать приглашение"))));
  modal(s.label, h("div", {},
    field("Имя (видно только вам)", label),
    h("div", { class: "form-row" }, field("Доступ до (пусто — без срока)", until), field("Группа", group)),
    linkBox,
    h("p", { class: "muted small" }, s.joined ? `Вошёл в бота ${s.joined}.` : "Ещё не открывал ссылку."),
    h("div", { style: "display:flex;gap:18px;flex-wrap:wrap" },
      h("button", { class: "link-btn", onclick: () => confirmBox("Сделать новую ссылку?", "Старая ссылка перестанет работать. Пригодится, если ученик сменил телефон или аккаунт Telegram.", "Новая ссылка", async () => {
        const n = await api(`/students/${s.id}/relink`, { method: "POST" });
        s.link = n.link; s.link_short = n.link_short;
        put(linkBox, field("Новая личная ссылка", h("div", { class: "copy-field" }, h("input", { type: "text", readonly: true, value: n.link_short }), h("button", { class: "btn", onclick: () => copyInvite(n) }, "Скопировать приглашение"))));
        toast("Новая ссылка готова — отправьте её ученику");
      }, { danger: false }) }, "Новая ссылка"),
      h("button", { class: "link-btn red", onclick: () => confirmBox("Удалить ученика?", "Запись об ученике будет удалена полностью.", "Удалить", async () => { await api(`/students/${s.id}`, { method: "DELETE" }); toast("Удалено"); document.querySelector(".modal-back")?.remove(); pageStudents(); }) }, "Удалить ученика"))),
  (close) => [
    h("button", { class: "btn outline", onclick: () => { close(); pageStudents(); } }, "Закрыть"),
    h("button", { class: "btn", onclick: async (e) => {
      if (!label.value.trim()) return fieldError(label, "Имя не может быть пустым");
      const body = { label: label.value, group_id: Number(group.value) };
      if (until.value) body.access_until = until.value; else body.unlimited = true;
      const done = busy(e.target);
      try { await api(`/students/${s.id}`, { method: "PATCH", body }); close(); toast("Сохранено ✓"); pageStudents(); } catch (_) { done(); }
    } }, "Сохранить"),
  ]);
}

// ---------- Записи ----------
async function pageRecordings() {
  const data = await api("/recordings");
  const rows = data.items.map((r) => h("tr", {},
    h("td", {}, r.date),
    h("td", { class: "title" }, h("a", { href: `/panel/lessons/${r.lesson_id}`, style: "color:inherit" }, r.lesson),
      h("div", { class: "muted small sub" }, `до ${r.available_until} · скачивание ${r.download_allowed ? "можно" : "нельзя"}`)),
    h("td", {}, r.status === "ready" ? r.duration : h("span", { class: "chip " + (r.status === "failed" ? "red" : "amber") }, r.status_label)),
    h("td", {}, r.status === "ready" ? subsCell(r) : null),
    h("td", { style: "white-space:nowrap" },
      r.status === "ready" ? h("button", { class: "btn small", onclick: () => playRec(r.id, r.lesson) }, "▶ Смотреть") : null, " ",
      isHost() && r.status !== "recording" ? h("button", { class: "icon-btn", title: "Удалить запись", "aria-label": `Удалить запись «${r.lesson}»`, onclick: () => confirmBox("Удалить запись?", "Файл удалится, ученики больше не смогут её посмотреть. Отменить нельзя.", "Удалить", async () => { await api(`/recordings/${r.id}`, { method: "DELETE" }); toast("Запись удалена"); pageRecordings(); }) }, "🗑") : null)));
  put($("#main"), h("div", { class: "page-head" }, h("h1", {}, "Записи")),
    h("p", { class: "muted", style: "margin:-14px 0 22px" }, "Записи появляются сами после урока и удаляются сами, когда заканчивается срок доступа."),
    h("div", { class: "table-card" }, rows.length ? h("table", { class: "t" },
      h("thead", {}, h("tr", {}, ...["Дата", "Урок", "Длительность", "Субтитры", ""].map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", {}, rows)) : h("div", { class: "empty" }, "Записей пока нет. Они появятся после первого урока.")));
}

// ---------- субтитры ----------
const SUBS_CHIP = { ready: "green", failed: "red", queued: "amber", working: "amber" };
function subsCell(r) {
  if (!r.subs_status) return h("button", { class: "link-btn", onclick: async () => { await api(`/recordings/${r.id}/subtitles/retry`, { method: "POST" }); toast("Субтитры поставлены в очередь"); pageRecordings(); } }, "Сделать");
  const chip = h("span", { class: "chip " + SUBS_CHIP[r.subs_status] }, r.subs_label);
  return r.subs_status === "ready" || r.subs_status === "failed"
    ? h("button", { class: "subs-btn", onclick: () => subsDialog(r), "aria-label": `Субтитры к записи «${r.lesson}»` }, chip, " ✏️")
    : chip;
}
const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, "0")}`; };
async function subsDialog(r) {
  const d = await api(`/recordings/${r.id}/subtitles`);
  if (d.status === "failed") {
    return confirmBox("Субтитры не получились", (d.error || "Не удалось распознать речь.") + " Можно попробовать ещё раз.", "Распознать заново",
      async () => { await api(`/recordings/${r.id}/subtitles/retry`, { method: "POST" }); toast("Субтитры поставлены в очередь"); pageRecordings(); }, { danger: false });
  }
  const inputs = d.cues.map((c) => { const ta = h("textarea", { rows: c.text.length > 52 ? 2 : 1, maxlength: 300, "aria-label": `Фраза на ${fmtTime(c.start)}` }); ta.value = c.text; return ta; });
  const list = h("div", { class: "subs-list" }, ...d.cues.map((c, i) => h("label", { class: "subs-row" }, h("span", { class: "subs-time" }, fmtTime(c.start)), inputs[i])));
  const burn = r.burn_status === "ready"
    ? h("button", { class: "btn outline", onclick: async () => { const u = await api(`/recordings/${r.id}/burn/url`); if (DEMO) window.open(u.url, "_blank"); else location.href = u.url; } }, "⬇ Ролик с субтитрами")
    : r.burn_status === "queued" || r.burn_status === "working"
      ? h("span", { class: "chip amber" }, "Ролик с субтитрами готовится…")
      : r.burn_allowed
        ? h("button", { class: "btn outline", onclick: async (e) => { const done = busy(e.target, "Ставлю в очередь…"); try { await save(false); await api(`/recordings/${r.id}/burn`, { method: "POST" }); toast("Ролик с вшитыми субтитрами будет готов через несколько минут"); pageRecordings(); } finally { done(); } } }, "🎬 Вшить в ролик")
        : null;
  async function save(notify = true) {
    await api(`/recordings/${r.id}/subtitles`, { method: "PUT", body: { cues: d.cues.map((c, i) => ({ start: c.start, end: c.end, text: inputs[i].value })) } });
    if (notify) toast("Субтитры сохранены ✓");
  }
  modal(`Субтитры — ${r.lesson}`, h("div", {},
    h("p", { class: "muted", style: "margin:-8px 0 14px" }, d.cues.length ? "Текст распознан автоматически. Исправьте ошибки прямо в строках — ученики увидят исправленный вариант." : "Речь в записи не найдена."),
    list,
    h("div", { class: "subs-tools" },
      h("a", { class: "btn ghost", href: DEMO ? "#" : `/api/panel/recordings/${r.id}/subtitles.srt`, onclick: DEMO ? (e) => { e.preventDefault(); toast("В демонстрации файл не скачивается"); } : null }, "⬇ Файл субтитров (.srt)"),
      burn),
    r.burn_allowed ? h("p", { class: "muted small", style: "margin:10px 0 0" }, "«Вшить в ролик» — субтитры станут частью видео: удобно для коротких роликов в соцсети.") : null),
  (c) => [
    h("button", { class: "btn outline", onclick: c }, "Закрыть"),
    h("button", { class: "btn", onclick: async (e) => { const done = busy(e.target); try { await save(); c(); pageRecordings(); } finally { done(); } } }, "Сохранить правки"),
  ]);
}

// ---------- цвет школы ----------
// Цвет — основной или «основной,акцент»: акцент красит звёздочку, отметки и номера шагов.
const THEMES = [["#8a6cc0,#c9a24a", "Нежный фиолетовый с золотом"], ["#2e6db4", "Синий"], ["#1f8a5b", "Зелёный"], ["#6b4fbb", "Фиолетовый"],
  ["#a33a54", "Бордовый"], ["#138496", "Бирюзовый"], ["#c8641c", "Оранжевый"], ["#b5487f", "Розовый"], ["#3d4a5c", "Графит"]];
function mixColor(hex, to, k) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + c.map((x, i) => Math.round(x + (to[i] - x) * k).toString(16).padStart(2, "0")).join("");
}
export function applyTheme(value) {
  const r = document.documentElement.style;
  if (!/^#[0-9a-f]{6}(,#[0-9a-f]{6})?$/i.test(value || "")) return;
  const [color, accent] = value.split(",");
  r.setProperty("--blue", color);
  r.setProperty("--bg", mixColor(color, [255, 255, 255], 0.95));
  r.setProperty("--line", mixColor(color, [255, 255, 255], 0.86));
  if (accent) { r.setProperty("--gold", accent); r.setProperty("--gold-soft", mixColor(accent, [255, 255, 255], 0.82)); }
  else { r.removeProperty("--gold"); r.removeProperty("--gold-soft"); }
  r.setProperty("--blue-2", mixColor(color, [0, 0, 0], 0.18));
  r.setProperty("--blue-soft", mixColor(color, [255, 255, 255], 0.88));
  r.setProperty("--navy", mixColor(color, [10, 16, 30], 0.55));
  r.setProperty("--navy-2", mixColor(color, [10, 16, 30], 0.45));
}

// тематический узор школы: звёзды и натальная карта, геометрия, дорога
const DECORS = [["", "Без узора", "—"], ["astro", "Астрология", "✦"], ["design", "Дизайн", "◆"], ["auto", "Автошкола", "🚗"]];
export function applyDecor(d) {
  if (d) document.documentElement.dataset.decor = d; else delete document.documentElement.dataset.decor;
}

// ---------- Настройки: школа, группы, команда, расходы ----------
async function pageSettings() {
  const [me, staff] = await Promise.all([api("/me"), api("/staff"), loadGroups()]);
  state.me = me;
  const school = h("input", { type: "text", value: me.school, maxlength: 80 });
  const hostName = h("input", { type: "text", value: me.host_name, maxlength: 60 });
  const contact = h("input", { type: "text", value: me.contact || "", placeholder: "@username модератора или ссылка", maxlength: 120 });
  let color = me.theme_color || "#2e6db4";
  const picker = h("input", { type: "color", value: color, "aria-label": "Свой цвет", class: "color-pick" });
  const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Цвет школы" });
  const paintSwatches = () => put(swatches, ...THEMES.map(([hex, name]) => h("button", { type: "button", class: "swatch" + (hex === color ? " on" : ""),
    style: hex.includes(",") ? `background:linear-gradient(135deg, ${hex.split(",")[0]} 55%, ${hex.split(",")[1]} 55%)` : `background:${hex}`, title: name, "aria-label": name, role: "radio", "aria-checked": hex === color ? "true" : "false",
    onclick: () => { color = hex; picker.value = hex; applyTheme(hex); paintSwatches(); } })), h("label", { class: "swatch custom", title: "Свой цвет" }, picker, h("span", { "aria-hidden": "true" }, "＋")));
  picker.addEventListener("input", () => { color = picker.value; applyTheme(color); paintSwatches(); });
  const subsOn = h("input", { type: "checkbox", checked: me.subtitles !== false });
  let decor = me.decor || "";
  const decors = h("div", { class: "decor-pick", role: "radiogroup", "aria-label": "Узор школы" });
  const paintDecors = () => put(decors, ...DECORS.map(([key, name, ico]) => h("button", { type: "button", class: "decor-opt" + (key === decor ? " on" : ""),
    role: "radio", "aria-checked": key === decor ? "true" : "false", "data-decor-preview": key,
    onclick: () => { decor = key; applyDecor(key); paintDecors(); } }, h("span", { class: "decor-ico", "aria-hidden": "true" }, ico), name)));
  paintDecors();
  if (color.includes(",")) picker.value = color.split(",")[0];
  paintSwatches();
  const schoolCard = h("div", { class: "card", id: "school" }, h("h2", {}, "Школа"),
    field("Название (видно в боте и эфире)", school),
    field("Имя ведущей", hostName),
    field("Куда ученикам писать вопросы", contact, "Появится кнопкой «✉️ Написать в школу», когда у ученика что-то не получается. Вопросы, написанные боту, и так приходят команде."),
    h("div", { class: "field" }, h("span", {}, "Цвет школы — панель, эфир и страница записи"), swatches,
      h("small", { class: "muted", style: "display:block;margin-top:6px" }, "Нажмите на цвет — увидите сразу. Сохранится после «Сохранить».")),
    h("label", { class: "check-row" }, subsOn, h("span", {}, h("b", {}, "Субтитры к записям"), h("br"), h("small", { class: "muted" }, "После урока речь распознаётся сама, ученики видят текст под видео. Бесплатно, на вашем сервере."))),
    h("div", { class: "field" }, h("span", {}, "Узор по теме школы — меню, вход на урок, эфир"), decors,
      h("small", { class: "muted", style: "display:block;margin-top:6px" }, "Нужен свой узор под тему школы — напишите нам, нарисуем.")),
    isHost() ? h("button", { class: "btn", onclick: async (e) => { const done = busy(e.target); try { await api("/settings", { method: "PATCH", body: { school_name: school.value, host_name: hostName.value, contact: contact.value, theme_color: color, decor, subtitles: subsOn.checked } }); if (DEMO) { try { localStorage.setItem("kz_demo_theme", color); localStorage.setItem("kz_demo_decor", decor); } catch (_) {} } toast("Сохранено ✓"); init(); } finally { done(); } } }, "Сохранить") : h("p", { class: "muted small" }, "Настройки школы меняет ведущая."));

  const gname = h("input", { type: "text", placeholder: "Например: Курс 2026", maxlength: 120 });
  const groupsCard = h("div", { class: "card", id: "groups" }, h("h2", {}, "Группы"),
    h("div", { class: "copy-field", style: "margin-bottom:16px" }, gname,
      h("button", { class: "btn", onclick: async (e) => { if (!gname.value.trim()) return fieldError(gname, "Напишите название группы"); const done = busy(e.target, "Создаю…"); try { await api("/groups", { method: "POST", body: { name: gname.value } }); toast("Группа создана"); pageSettings(); } catch (_) { done(); } } }, "+ Создать")),
    state.groups.length ? h("div", { class: "files" }, ...state.groups.map((g) => h("div", { class: "file" },
      h("div", { class: "grow" }, h("div", { class: "name" }, g.name, g.archived ? h("span", { class: "chip", style: "margin-left:8px" }, "Курс завершён") : null),
        h("div", { class: "muted small" }, `Учеников: ${g.active} из ${g.students} · уроков: ${g.lessons}`)),
      h("div", { class: "ops" },
        h("button", { class: "link-btn", onclick: () => { state.studentGroup = g.id; go("/panel/students"); } }, "Ученики"),
        h("button", { class: "link-btn", onclick: () => renameGroup(g) }, "Переименовать"),
        h("button", { class: "link-btn" + (g.archived ? "" : " red"), onclick: () => g.archived
          ? api(`/groups/${g.id}`, { method: "PATCH", body: { archived: false } }).then(pageSettings)
          : confirmBox("Курс завершён?", "Новые эфиры для группы закроются. Записи и материалы останутся у учеников до своего срока.", "Да, завершить курс", async () => { await api(`/groups/${g.id}`, { method: "PATCH", body: { archived: true } }); pageSettings(); }) },
        g.archived ? "Вернуть" : "Курс завершён"))))) : h("p", { class: "muted" }, "Групп пока нет."));

  const label = h("input", { type: "text", placeholder: "Например: Ольга", maxlength: 80 });
  const role = h("select", {}, h("option", { value: "moderator" }, "Модератор"), h("option", { value: "host" }, "Ведущая"));
  const out = h("div", {});
  const teamCard = h("div", { class: "card", id: "team" }, h("h2", {}, "Команда"),
    h("div", { class: "files" }, ...staff.items.map((s) => h("div", { class: "file" },
      h("div", { class: "grow" }, h("div", { class: "name" }, s.label, s.id === staff.me ? h("span", { class: "muted" }, " (вы)") : null),
        h("div", { class: "muted small" }, `${s.role_label} · ${s.status_label}`)),
      isHost() && s.id !== staff.me ? h("div", { class: "ops" },
        s.status === "waiting" && s.link ? h("button", { class: "link-btn", onclick: () => copy(s.link) }, "Ссылка") : null,
        h("button", { class: "link-btn" + (s.status === "disabled" ? "" : " red"), onclick: async () => { await api(`/staff/${s.id}`, { method: "PATCH", body: { disabled: s.status !== "disabled" } }); pageSettings(); } }, s.status === "disabled" ? "Вернуть" : "Отключить")) : null))),
    isHost() ? h("div", { style: "margin-top:18px" }, h("h3", { style: "margin-bottom:10px" }, "Добавить в команду"),
      h("div", { class: "form-row" }, field("Имя", label), field("Роль", role)),
      h("button", { class: "btn", onclick: async (e) => {
        if (!label.value.trim()) return fieldError(label, "Напишите имя");
        const done = busy(e.target, "Создаю…");
        try {
          const s = await api("/staff", { method: "POST", body: { label: label.value, role: role.value } });
          put(out, h("p", { class: "muted small" }, "Отправьте ссылку человеку: открыв её, он попадёт в бота и сможет входить в панель и помогать в эфире."),
            h("div", { class: "copy-field" }, h("input", { type: "text", readonly: true, value: s.link_short }), h("button", { class: "btn outline", onclick: () => copy(s.link) }, "Копировать")));
        } finally { done(); }
      } }, "Получить ссылку"), out) : null);

  const costCard = h("div", { class: "card" }, h("h2", {}, "Сервер и расходы"),
    h("p", {}, `Сервер эфиров работал в этом месяце: `, h("b", {}, `${String(me.hours_month).replace(".", ",")} ч`), h("span", { class: "muted" }, ` (предупреждение после ${me.hours_alert} ч)`)),
    h("p", {}, "Записи в хранилище: ", h("b", {}, me.storage)),
    !me.s3 ? h("p", { class: "badge-note" }, "Хранилище записей ещё не подключено — его настраивают при установке.") : null,
    !me.bot_ok ? h("p", { class: "badge-note" }, "Бот ещё не подключён — нужен токен бота.") : null);

  const helpCard = h("div", { class: "card" }, h("h2", {}, "Помощь"),
    h("p", {}, h("a", { href: "static/help/instruction.png", download: "Как попасть на урок.png" }, "⬇ Картинка-инструкция для учеников")),
    h("button", { class: "btn outline", onclick: () => { go("/panel"); setTimeout(() => runTour(true), 600); } }, "Показать подсказки по панели снова"));

  put($("#main"), h("div", { class: "page-head" }, h("h1", {}, "Настройки")),
    h("div", { class: "settings-grid" }, h("div", { class: "stack" }, groupsCard, teamCard), h("div", { class: "stack" }, schoolCard, costCard, helpCard)));
  const anchor = DEMO ? (curPath().split("#")[1] ? "#" + curPath().split("#")[1] : "") : location.hash;
  if (anchor) setTimeout(() => { const el = document.querySelector(anchor); if (el) el.scrollIntoView({ behavior: "smooth" }); }, 50);
}

function renameGroup(g) {
  const name = h("input", { type: "text", value: g.name, maxlength: 120 });
  modal("Переименовать группу", field("Название", name), (close) => [
    h("button", { class: "btn outline", onclick: close }, "Отмена"),
    h("button", { class: "btn", onclick: async () => { await api(`/groups/${g.id}`, { method: "PATCH", body: { name: name.value } }); close(); pageSettings(); } }, "Сохранить"),
  ]);
}

// ---------- знакомство ----------
function tourSteps() {
  const host = isHost();
  const steps = [
    { title: host ? `Здравствуйте, ${state.me.label}! 👋` : "Добро пожаловать! 👋", text: "Покажу панель за минуту: где уроки, ученики и записи. Можно пропустить и вернуться к подсказкам кнопкой «?» внизу справа." },
    { el: "#nav a[data-page='lessons']", title: "Уроки", text: "Все уроки — прошедшие и будущие. Нажмите на урок, чтобы добавить материалы, поменять дату или посмотреть запись." },
    { el: "#btn-new-lesson", title: "Новый урок", text: "Название, дата, группа — и всё. Ссылку рассылать не нужно: ученики группы сами получат в боте напоминание с кнопкой «Войти на урок» — за сутки и за 15 минут." },
    { el: "#btn-start", title: "Начать урок", text: "В день урока нажмите здесь — откроется эфир. Сервер эфиров включается сам за 30 минут до начала." },
    { el: "#btn-video", title: "Видеоурок", text: "Можно записать урок без зрителей — он появится у группы в «Записях»." },
    { el: "#nav a[data-page='students']", title: "Ученики", text: "Учеников приглашают один раз: каждый получает личную ссылку и попадает в бот. Дальше все уроки группы приходят ему сами. Здесь же — закрыть или вернуть доступ." },
    { el: "#nav a[data-page='recordings']", title: "Записи", text: "Записи появляются сами после урока. Ученикам приходит сообщение «Запись готова»." },
    { el: "#nav a[data-page='settings']", title: "Настройки", text: "Группы, команда школы, контакт для вопросов учеников и расходы на сервер." },
    { el: ".tour-help", title: "Подсказки — всегда здесь", text: "Нажмите «?», чтобы посмотреть это знакомство ещё раз." },
  ];
  if (innerWidth <= 820) {
    steps.splice(1, 1, { el: "#burger", title: "Меню", text: "Разделы — здесь: Уроки, Ученики, Записи, Настройки." });
    return steps.filter((s) => !(s.el || "").startsWith("#nav"));
  }
  return steps;
}
function runTour(force = false) { return startTour(isHost() ? "panel_host" : "panel_mod", tourSteps(), { force }); }
let tourChecked = false;
function maybeTour() {
  if (tourChecked) return;
  tourChecked = true;
  setTimeout(() => runTour(false), 500);
}

// ---------- запуск ----------
async function init() {
  try {
    state.me = await api("/me");
  } catch (_) { return; }
  if (state.me.theme_color) applyTheme(state.me.theme_color);
  applyDecor(state.me.decor || "");
  $("#school-name").textContent = state.me.school;
  $("#school-name-top").textContent = state.me.school;
  $("#me-label").textContent = `${state.me.label} · ${state.me.role_label}`;
  document.title = `${state.me.school} — панель`;
  helpButton(() => { if (!curPath().match(/^\/panel\/?$/)) { go("/panel"); setTimeout(() => runTour(true), 600); } else runTour(true); });
}

init().then(() => { if (state.me) route(); });
