// Демо-версия без сервера: отвечает на запросы страниц пробными данными прямо в браузере.
// Данные — снимок настоящей платформы (scripts/build_demo.py). Изменения живут до перезагрузки.
(function () {
  const D = JSON.parse(JSON.stringify(window.KZ_DEMO_DATA || {}));
  const P = D.panel || {};
  const realFetch = window.fetch.bind(window);
  const ok = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
  const fail = (detail, status = 400) => ok({ detail }, status);
  const room = () => window.__fakeRoom;
  let seq = 900;

  // цвет школы, выбранный в демо-настройках, — на всех демо-экранах
  const mix = (hex, to, k) => "#" + [1, 3, 5].map((i, j) => Math.round(parseInt(hex.slice(i, i + 2), 16) + (to[j] - parseInt(hex.slice(i, i + 2), 16)) * k).toString(16).padStart(2, "0")).join("");
  let savedTheme = (P.me && P.me.theme_color) || "";
  try { savedTheme = localStorage.getItem("kz_demo_theme") || savedTheme; } catch (_) { /* приватный режим */ }
  if (/^#[0-9a-f]{6}(,#[0-9a-f]{6})?$/i.test(savedTheme)) {
    const r = document.documentElement.style;
    const [c, accent] = savedTheme.split(",");
    r.setProperty("--blue", c); r.setProperty("--blue-2", mix(c, [0, 0, 0], 0.18));
    r.setProperty("--blue-soft", mix(c, [255, 255, 255], 0.88));
    r.setProperty("--navy", mix(c, [10, 16, 30], 0.55)); r.setProperty("--navy-2", mix(c, [10, 16, 30], 0.45));
    r.setProperty("--bg", mix(c, [255, 255, 255], 0.95)); r.setProperty("--line", mix(c, [255, 255, 255], 0.86));
    if (accent) { r.setProperty("--gold", accent); r.setProperty("--gold-soft", mix(accent, [255, 255, 255], 0.82)); }
    if (P.me) P.me.theme_color = savedTheme;
  }
  let decor = P.me ? (P.me.decor || "") : "";
  try { const d = localStorage.getItem("kz_demo_decor"); if (d !== null) decor = d; } catch (_) { /* приватный режим */ }
  if (decor) document.documentElement.dataset.decor = decor;
  if (P.me) P.me.decor = decor;
  const nid = () => ++seq;

  // плашка «Демонстрация»
  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = '🧪 <b>Демонстрация</b> · данные примерные, изменения не сохраняются · <a href="index.html">все экраны</a>';
    document.body.prepend(bar);
  });

  const lessonById = (id) => (P.lessonsFull || {})[id];
  function rowOf(card) {
    const keys = ["id", "title", "kind", "kind_label", "status", "starts_at", "date_label", "group_id", "group", "who", "record", "materials"];
    const r = {}; keys.forEach((k) => { r[k] = card[k]; }); return r;
  }
  function syncRow(card) {
    const list = P.lessons.items;
    const i = list.findIndex((x) => x.id === card.id);
    if (i >= 0) list[i] = rowOf(card); else list.unshift(rowOf(card));
  }
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const dateLabel = (local) => { if (!local) return ""; const d = new Date(local); return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const daysPhrase = (n) => n == null ? "без срока" : (n % 365 === 0 ? `${n / 365} год` : `${n} ${n % 10 === 1 && n % 100 !== 11 ? "день" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "дня" : "дней")}`);
  const whoOf = (c) => c.visibility === "link" ? { kind: "link", text: `Все по ссылке · ${daysPhrase(c.access_days)}` } : { kind: "group", text: `Ученики · ${daysPhrase(c.access_days)}` };
  const link = (tok) => ({ link: `https://t.me/elena_school_bot?start=${tok}`, link_short: `t.me/elena_school_bot?start=${tok}` });
  const tok = (p) => p + Math.random().toString(36).slice(2, 10);
  function studentRow(label, gid, until) {
    const g = (P.groups.items || []).find((x) => x.id === gid) || { name: "" };
    return { id: nid(), label, group_id: gid, group: g.name, status: "waiting", status_label: "Ждём вход", access_until: until,
      access_until_label: until || "без срока", ...link(tok("inv_")), joined: null, reason: "", soon: false };
  }

  async function panel(method, path, body) {
    const [pth, qs] = path.split("?");
    const q = new URLSearchParams(qs || "");
    let m;
    if (method === "GET") {
      if (pth === "/me") return ok(P.me);
      if (pth === "/server") return ok(P.server);
      if (pth === "/groups") return ok(P.groups);
      if (pth === "/lessons") return ok(P.lessons);
      if (pth === "/staff") return ok(P.staff);
      if (pth === "/recordings") return ok(P.recordings);
      if (pth === "/invite-message") return ok({ message: P.inviteMessage });
      if ((m = pth.match(/^\/lessons\/(\d+)$/))) return lessonById(m[1]) ? ok(lessonById(m[1])) : fail("Урок не найден", 404);
      if (pth === "/students") {
        const gid = Number(q.get("group_id"));
        const items = (P.students || []).filter((s) => !gid || s.group_id === gid);
        return ok({ items });
      }
      if ((m = pth.match(/^\/recordings\/(\d+)\/url$/))) return ok({ url: "static/demo/sample.mp4" });
      if ((m = pth.match(/^\/recordings\/(\d+)\/subtitles$/))) return ok(P.subs[m[1]] || { status: "", cues: [] });
      if ((m = pth.match(/^\/recordings\/(\d+)\/burn\/url$/))) return ok({ url: "static/demo/sample_subs.mp4" });
    }
    // субтитры: правка, повтор, ролик с вшитыми субтитрами
    if ((m = pth.match(/^\/recordings\/(\d+)\/(subtitles|subtitles\/retry|burn)$/))) {
      const item = P.recordings.items.find((x) => x.id === Number(m[1]));
      if (m[2] === "subtitles" && method === "PUT") { P.subs[m[1]] = { ...(P.subs[m[1]] || {}), status: "ready", cues: body.cues }; if (item) item.burn_status = item.burn_status === "ready" ? "" : item.burn_status; return ok({ ok: true }); }
      if (m[2] === "subtitles/retry" && item) { Object.assign(item, { subs_status: "queued", subs_label: "В очереди" }); return ok({ ok: true }); }
      if (m[2] === "burn" && item) { item.burn_status = "queued"; return ok({ ok: true }); }
    }
    if (method === "POST" && pth === "/lessons") {
      if (!body.title) return fail("Напишите название урока");
      const g = P.groups.items.find((x) => x.id === body.group_id) || {};
      const id = nid();
      const card = { ...JSON.parse(JSON.stringify(Object.values(P.lessonsFull)[0])), id, title: body.title, status: "scheduled",
        kind: "live", kind_label: "Эфир", starts_at_local: body.starts_at_local, date_label: dateLabel(body.starts_at_local),
        group_id: body.group_id, group: g.name || "", visibility: body.visibility, access_days: body.visibility === "link" ? 10 : 365,
        materials_list: [], materials: 0, recordings: [], record: { kind: "none", text: "Будет после урока" }, guests: 0,
        attendance: { came: 0, total: 0, absent: [], guests: 0 }, can_resume: false, signup_url: "", ...link(tok("open_")) };
      card.open_link = card.link; card.open_link_short = card.link_short;
      card.who = whoOf(card);
      P.lessonsFull[id] = card; syncRow(card);
      return ok(card);
    }
    if ((m = pth.match(/^\/lessons\/(\d+)$/)) && method === "PATCH") {
      const c = lessonById(m[1]); if (!c) return fail("Урок не найден", 404);
      Object.entries(body).forEach(([k, v]) => { if (["title", "visibility", "access_days", "download_allowed", "notify_students", "signup_url", "duration_min", "group_id"].includes(k)) c[k] = v; });
      if (body.unlimited) c.access_days = null;
      if (body.starts_at_local) { c.starts_at_local = body.starts_at_local; c.date_label = dateLabel(body.starts_at_local); }
      if (body.group_id) { const g = P.groups.items.find((x) => x.id === body.group_id); c.group = g ? g.name : ""; }
      if (body.reset_link) { const l = link(tok("open_")); c.open_link = l.link; c.open_link_short = l.link_short; }
      c.who = whoOf(c);
      c.available_until = c.access_days ? "через " + daysPhrase(c.access_days) + " после урока" : null;
      syncRow(c);
      return ok(body.notify_text ? { ...c, notified: { total: 18 } } : c);
    }
    if ((m = pth.match(/^\/lessons\/(\d+)$/)) && method === "DELETE") {
      delete P.lessonsFull[m[1]]; P.lessons.items = P.lessons.items.filter((x) => x.id !== Number(m[1]));
      return ok({ ok: true, notified: q.get("notify_cancel") === "true" ? 18 : 0 });
    }
    if ((m = pth.match(/^\/lessons\/(\d+)\/start$/))) return ok({ url: "lesson-host.html" });
    if (pth === "/lessons/video") return ok({ id: 1, url: "lesson-host.html?video=1" });
    if ((m = pth.match(/^\/lessons\/(\d+)\/copy$/))) {
      const src = lessonById(m[1]); const id = nid();
      const g = P.groups.items.find((x) => x.id === body.group_id) || {};
      const c = { ...JSON.parse(JSON.stringify(src)), id, group_id: body.group_id, group: g.name || src.group, status: "scheduled", recordings: [],
        record: { kind: "none", text: "Будет после урока" } };
      if (body.starts_at_local) { c.starts_at_local = body.starts_at_local; c.date_label = dateLabel(body.starts_at_local); }
      P.lessonsFull[id] = c; syncRow(c); return ok(c);
    }
    if ((m = pth.match(/^\/lessons\/(\d+)\/materials$/))) {
      const c = lessonById(m[1]);
      const f = body instanceof FormData ? body.get("file") : null;
      const name = f ? f.name : "файл.pdf";
      const kind = { pdf: "PDF", doc: "Word", docx: "Word", ppt: "PowerPoint", pptx: "PowerPoint", xls: "Excel", xlsx: "Excel" }[name.split(".").pop().toLowerCase()] || "Файл";
      const size = f ? (f.size > 1048576 ? (f.size / 1048576).toFixed(1).replace(".", ",") + " МБ" : Math.round(f.size / 1024) + " КБ") : "1 МБ";
      c.materials_list.push({ id: nid(), name, size, kind, hidden: false, position: c.materials_list.length + 1, ok: true });
      c.materials = c.materials_list.length; syncRow(c); return ok(c);
    }
    if ((m = pth.match(/^\/materials\/(\d+)$/))) {
      const c = Object.values(P.lessonsFull).find((l) => l.materials_list.some((x) => x.id === Number(m[1])));
      const i = c.materials_list.findIndex((x) => x.id === Number(m[1]));
      if (method === "DELETE") c.materials_list.splice(i, 1);
      else if (body.hidden !== undefined) c.materials_list[i].hidden = body.hidden;
      else if (body.move && i > 0) { const [x] = c.materials_list.splice(i, 1); c.materials_list.splice(i - 1, 0, x); }
      return ok(c);
    }
    if (pth === "/students" && method === "POST") {
      const s = studentRow(body.label, body.group_id, body.access_until); P.students.unshift(s); return ok(s);
    }
    if (pth === "/students/bulk") {
      const names = body.names.replace(/,/g, "\n").split("\n").map((x) => x.trim()).filter(Boolean);
      const items = names.map((n) => studentRow(n, body.group_id, body.access_until));
      P.students.unshift(...items); return ok({ items, message: P.inviteMessage });
    }
    if ((m = pth.match(/^\/students\/(\d+)\/relink$/))) { const s = P.students.find((x) => x.id === Number(m[1])); Object.assign(s, link(tok("inv_")), { status: "waiting", status_label: "Ждём вход" }); return ok(s); }
    if ((m = pth.match(/^\/students\/(\d+)$/))) {
      const i = P.students.findIndex((x) => x.id === Number(m[1]));
      if (method === "DELETE") { P.students.splice(i, 1); return ok({ ok: true }); }
      const s = P.students[i];
      if (body.label) s.label = body.label;
      if (body.disabled === true) Object.assign(s, { status: "disabled", status_label: "Доступ закрыт", reason: { unpaid: "не оплачено", request: "по просьбе" }[body.disabled_reason] || "" });
      if (body.disabled === false) Object.assign(s, { status: "active", status_label: "Активен", reason: "" });
      if (body.access_until) { s.access_until = body.access_until; s.access_until_label = body.access_until; }
      return ok(s);
    }
    if (pth === "/groups" && method === "POST") { const g = { id: nid(), name: body.name, archived: false, students: 0, active: 0, lessons: 0, created: "сегодня" }; P.groups.items.unshift(g); return ok(g); }
    if ((m = pth.match(/^\/groups\/(\d+)$/))) { const g = P.groups.items.find((x) => x.id === Number(m[1])); Object.assign(g, body); return ok(g); }
    if (pth === "/staff" && method === "POST") { const s = { id: nid(), label: body.label, role: body.role, role_label: body.role === "host" ? "Ведущая" : "Модератор", status: "waiting", status_label: "Ждём вход", ...link(tok("adm_")) }; P.staff.items.push(s); return ok(s); }
    if ((m = pth.match(/^\/staff\/(\d+)$/))) { const s = P.staff.items.find((x) => x.id === Number(m[1])); if (body.disabled !== undefined) Object.assign(s, body.disabled ? { status: "disabled", status_label: "Отключён" } : { status: "active", status_label: "Активен" }); return ok(s); }
    if (pth === "/broadcast") return ok({ total: body.who === "absent" ? 4 : 18 });
    if (pth === "/settings") { Object.assign(P.me, { school: body.school_name || P.me.school, host_name: body.host_name || P.me.host_name, contact: body.contact, theme_color: body.theme_color || P.me.theme_color, decor: body.decor ?? P.me.decor }); return ok({ ok: true }); }
    if (pth === "/server/prepare") {
      P.server = { ...P.server, state: "starting", label: "Включается…" };
      setTimeout(() => { P.server = { ...P.server, state: "ready", label: "Готов к эфиру" }; }, 6000);
      return ok(P.server);
    }
    if (pth === "/logout") return ok({ ok: true });
    return ok({ ok: true });
  }

  async function lesson(method, path, body) {
    const cfg = window.KZ_DEMO || {};
    const L = D.lesson[cfg.role === "host" || cfg.role === "moderator" ? "staff" : cfg.role] || D.lesson.student;
    const r = room();
    if (path === "/info") return ok({ ...L.info, kind: cfg.video ? "video" : L.info.kind, title: cfg.video ? "Видеоурок: разбор домашних заданий" : L.info.title });
    if (path === "/join") {
      if (!body.name && cfg.role !== "host") return fail("Напишите, как вас назвать в чате");
      const live = cfg.role === "host" ? false : true;  // ведущая сначала проходит проверку перед эфиром
      cfg.name = body.name || L.info.default_name;
      cfg.meta = { status: live ? "live" : "scheduled", title: L.info.title, kind: L.info.kind, chat_closed: false, recording: live, rec_started: live ? new Date(Date.now() - 42 * 60000).toISOString() : null };
      return ok({ url: "demo", token: "demo", identity: cfg.role === "host" ? "staff-1" : "st-demo", name: cfg.name, role: cfg.role, chat: [], meta: cfg.meta, hands: [] });
    }
    if (path === "/host/connected") {
      const meta = { status: "live", recording: true, rec_started: new Date().toISOString() };
      if (r) r.setMeta(meta);
      return ok({ ...(cfg.meta || {}), ...meta });
    }
    if (path === "/chat" && method === "POST") {
      if (r && r.metadata && JSON.parse(r.metadata).chat_closed && cfg.role !== "host") return fail("Чат закрыт ведущей");
      return ok({ id: "m" + Date.now(), ts: Date.now() / 1000, name: cfg.name, role: cfg.role, text: body.text });
    }
    const raised = () => r ? [...r.remoteParticipants.values()].filter((p) => p.attributes.hand)
      .sort((a, b) => Number(a.attributes.hand) - Number(b.attributes.hand)).map((p) => p.identity) : [];
    if (path === "/chat") return ok({ chat: (r && r.chatLog) || [], meta: r && r.metadata ? JSON.parse(r.metadata) : {}, hands: raised() });
    if (path === "/hand") { if (r) r.localHand(body.up); return ok({ ok: true, place: body.up ? 1 : 0 }); }
    if (path === "/roster") {
      return ok({ roster: r ? r.roster() : {}, hands: raised() });
    }
    if (path === "/floor") { if (r) r.setFloor(body.identity, body.on); return ok({ ok: true }); }
    if (path === "/hand/lower") { if (r) r.setFloor(body.identity, false); return ok({ ok: true }); }
    if (path === "/kick") { if (r) r.kick(body.identity); return ok({ ok: true }); }
    if (path === "/mute-all") return ok({ ok: true, muted: r ? r.muteAll() : 0 });
    if (path === "/chat-state") { if (r) r.setMeta({ chat_closed: body.closed }); return ok({ ok: true, closed: body.closed }); }
    if (path === "/end") return ok({ ok: true });
    return ok({ ok: true });
  }

  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || "GET").toUpperCase();
    let body = init.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { /* как есть */ } }
    body = body || {};
    let m;
    if ((m = url.match(/\/api\/panel(\/[^#]*)$/))) return panel(method, m[1], body);
    if ((m = url.match(/\/api\/lesson\/\d+(\/[^?#]*)/))) return lesson(method, m[1], body);
    if (url.match(/\/api\/rec\/\d+/)) return ok(D.rec);
    return realFetch(input, init);
  };
})();
