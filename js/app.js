/* ==========================================================
   🐬 Logique du site de pronostics
   ========================================================== */
(function () {
  const cfg = window.OCEAN_CONFIG || {};
  const store = window.OceanStore;
  const $ = (sel, root = document) => root.querySelector(sel);

  const AVATARS = ["🐳", "🐬", "🐙", "🦀", "🐠", "🐡", "🦈", "🐢", "🦭", "🪼", "🦦", "🐚", "🦞", "🐧", "🧜‍♀️", "🏴‍☠️"];
  const HAIR = [
    { id: "none", label: "Crâne d'œuf 🥚" },
    { id: "blond", label: "Blonds" },
    { id: "chatain", label: "Châtains" },
    { id: "brun", label: "Bruns" },
    { id: "roux", label: "Roux" },
  ];
  const LOOKS = [
    { id: "papa", label: "Papa 👨" },
    { id: "maman", label: "Maman 👩" },
    { id: "both", label: "Un parfait mélange 💞" },
  ];
  const SCORE = { date: 30, time: 15, weight: 20, height: 15, hair: 5, looks: 5, name: 10 };
  const MAX_SCORE = Object.entries(SCORE).reduce((s, [k, v]) => s + (k === "name" && !cfg.guessName ? 0 : v), 0);

  let predictions = [];
  let state = { open: true, born: false, result: null };
  let isAdmin = false;
  let mine = readMine();

  /* ---------------- Utilitaires ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function parseDay(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }
  function dayToStr(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function fmtDay(str, opts) {
    const ms = typeof str === "number" ? str : parseDay(str);
    if (isNaN(ms)) return "–";
    return new Date(ms).toLocaleDateString("fr-FR", Object.assign({ timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }, opts));
  }
  function fmtTime(t) {
    return t ? t.replace(":", "h") : "–";
  }
  function fmtWeight(g) {
    return (Number(g) / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg";
  }
  function fmtHeight(cm) {
    return Number(cm).toLocaleString("fr-FR") + " cm";
  }
  function minutes(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
    return m ? +m[1] * 60 + +m[2] : NaN;
  }
  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  }
  const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || "–";
  const DAY = 86400000;

  function readMine() {
    try {
      return JSON.parse(localStorage.getItem("ocean.mine") || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveMine() {
    try {
      localStorage.setItem("ocean.mine", JSON.stringify(mine));
    } catch (e) {}
  }

  let toastTimer;
  function toast(msg, ms = 3200) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), ms);
  }

  function confetti(chars = ["🐚", "⭐", "💖", "🫧", "🐠", "🎉", "🌸"], n = 60) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span");
      c.className = "confetti";
      c.textContent = chars[Math.floor(Math.random() * chars.length)];
      c.style.left = Math.random() * 100 + "vw";
      c.style.animationDuration = 2.5 + Math.random() * 2.5 + "s";
      c.style.animationDelay = Math.random() * 0.8 + "s";
      c.style.fontSize = 1 + Math.random() * 1.4 + "rem";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 6000);
    }
  }

  /* ---------------- Score ---------------- */
  function scoreOf(p, r) {
    if (!r) return null;
    const d = {};
    const dd = Math.abs(parseDay(p.date) - parseDay(r.date)) / DAY;
    d.date = isNaN(dd) ? 0 : Math.max(0, SCORE.date - 3 * Math.round(dd));
    let dm = Math.abs(minutes(p.time) - minutes(r.time));
    dm = Math.min(dm, 1440 - dm);
    d.time = isNaN(dm) ? 0 : Math.max(0, SCORE.time - Math.floor(dm / 30));
    d.weight = Math.max(0, SCORE.weight - Math.floor(Math.abs(p.weight - r.weight) / 50));
    d.height = Math.max(0, SCORE.height - Math.round(2 * Math.abs(p.height - r.height)));
    d.hair = p.hair && p.hair === r.hair ? SCORE.hair : 0;
    d.looks = p.looks && p.looks === r.looks ? SCORE.looks : 0;
    d.name = cfg.guessName && r.babyName && norm(p.babyName) && norm(p.babyName) === norm(r.babyName) ? SCORE.name : 0;
    d.total = Object.values(d).reduce((a, b) => a + b, 0);
    return d;
  }
  function ranked() {
    if (!state.born || !state.result) return predictions.slice();
    return predictions
      .map((p) => Object.assign({}, p, { score: scoreOf(p, state.result) }))
      .sort((a, b) => b.score.total - a.score.total || a.createdAt - b.createdAt);
  }

  /* ---------------- Décor ---------------- */
  function initBubbles() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = $("#bubbles");
    function spawn(x, y, size) {
      const b = document.createElement("span");
      b.className = "bubble";
      const s = size || 6 + Math.random() * 22;
      b.style.width = b.style.height = s + "px";
      b.style.left = (x != null ? x : Math.random() * 100 + "vw");
      if (y != null) b.style.top = y;
      const dur = 7 + Math.random() * 9;
      b.style.animationDuration = dur + "s";
      box.appendChild(b);
      setTimeout(() => b.remove(), dur * 1000);
    }
    setInterval(() => {
      if (!document.hidden && box.childElementCount < 40) spawn();
    }, 650);
    document.addEventListener("click", (e) => {
      if (e.target.closest("input, textarea, select, button, a, dialog")) return;
      for (let i = 0; i < 6; i++) spawn(e.clientX - 10 + Math.random() * 20 + "px", e.clientY + "px", 5 + Math.random() * 14);
    });
  }

  function initSwimmers() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = $("#swimmers");
    const creatures = ["🐠", "🐟", "🐡", "🐬", "🐳", "🐙", "🦈", "🐢", "🪼", "🦑", "🐋", "🐠🐠🐠"];
    const quips = ["Bloop ! 🫧", "Coucou petite sirène ! 🧜‍♀️", "Glou glou…", "Tu as fait ton pronostic ? 👀", "Je parie sur un mardi ! 🐟", "Splash ! 💦"];
    function spawn() {
      if (document.hidden || box.childElementCount > 3) return;
      const el = document.createElement("div");
      const ltr = Math.random() > 0.5;
      el.className = "swimmer " + (ltr ? "swimmer--ltr" : "swimmer--rtl");
      el.innerHTML = "<span>" + creatures[Math.floor(Math.random() * creatures.length)] + "</span>";
      el.style.top = 15 + Math.random() * 75 + "vh";
      el.style.left = "0";
      el.style.fontSize = 1.4 + Math.random() * 1.8 + "rem";
      el.style.setProperty("--from", ltr ? "-150px" : "calc(100vw + 50px)");
      el.style.setProperty("--to", ltr ? "calc(100vw + 50px)" : "-150px");
      const dur = 14 + Math.random() * 14;
      el.style.animationDuration = dur + "s";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        toast(quips[Math.floor(Math.random() * quips.length)], 1800);
        const p = document.createElement("span");
        p.className = "pop";
        p.textContent = "🫧";
        p.style.left = e.clientX + "px";
        p.style.top = e.clientY + "px";
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 900);
        el.style.animationDuration = "1.5s"; // il s'enfuit !
      });
      box.appendChild(el);
      setTimeout(() => el.remove(), dur * 1000);
    }
    setTimeout(spawn, 1500);
    setInterval(spawn, 6000);
  }

  function initDepth() {
    const fill = $("#depthFill");
    const val = $("#depthValue");
    const MAX = 10994; // fosse des Mariannes 🌊
    function update() {
      const h = document.documentElement.scrollHeight - innerHeight;
      const p = h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0;
      fill.style.height = p * 100 + "%";
      val.textContent = Math.round(p * p * MAX).toLocaleString("fr-FR");
    }
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
  }

  /* ---------------- En-tête & compte à rebours ---------------- */
  function initHeader() {
    $("#footerParents").textContent = cfg.parents || "";
    $("#footerBaby").textContent = cfg.babyNickname || "notre petite sirène";
    if (cfg.parents) $("#heroKicker").textContent = cfg.parents + " vous annoncent…";
    const due = parseDay(cfg.dueDate);
    if (!isNaN(due)) $("#dateHint").textContent = "Terme prévu : " + fmtDay(cfg.dueDate, { weekday: undefined, year: "numeric" });
    if (!cfg.guessName) $("#nameField").remove();
    if (store.mode === "demo") $("#demoBanner").hidden = false;
  }

  function tickCountdown() {
    const caption = $("#countdownCaption");
    const box = $("#countdown");
    if (state.born && state.result) {
      box.hidden = true;
      caption.textContent = "🎉 Née le " + fmtDay(state.result.date, { year: "numeric" }) + " à " + fmtTime(state.result.time) + " !";
      return;
    }
    box.hidden = false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cfg.dueDate || "");
    if (!m) return;
    const target = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    let diff = target - Date.now();
    const late = diff < 0;
    diff = Math.abs(diff);
    $("#cdDays").textContent = Math.floor(diff / DAY);
    $("#cdHours").textContent = String(Math.floor((diff % DAY) / 3600000)).padStart(2, "0");
    $("#cdMinutes").textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
    $("#cdSeconds").textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    caption.textContent = late
      ? "🐢 Elle prend son temps… le terme est dépassé depuis tout ça !"
      : "avant le terme prévu, le " + fmtDay(cfg.dueDate, { year: "numeric" });
  }

  /* ---------------- Formulaire ---------------- */
  function pickerGroup(container, items, name, render) {
    container.innerHTML = "";
    items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      b.dataset.value = it.id || it;
      render(b, it);
      b.addEventListener("click", () => {
        container.querySelectorAll("[role=radio]").forEach((x) => x.setAttribute("aria-checked", "false"));
        b.setAttribute("aria-checked", "true");
        container.dataset.value = b.dataset.value;
      });
      container.appendChild(b);
    });
  }

  function initForm() {
    const form = $("#predictionForm");
    const avatarBox = $("#avatarPicker");
    pickerGroup(avatarBox, AVATARS, "avatar", (b, a) => {
      b.className = "avatar-opt";
      b.textContent = a;
      b.setAttribute("aria-label", "Avatar " + a);
    });
    avatarBox.children[Math.floor(Math.random() * AVATARS.length)].click();
    pickerGroup($("#hairPicker"), HAIR, "hair", (b, h) => {
      b.className = "chip";
      b.textContent = h.label;
    });
    pickerGroup($("#looksPicker"), LOOKS, "looks", (b, l) => {
      b.className = "chip";
      b.textContent = l.label;
    });

    const due = parseDay(cfg.dueDate);
    if (!isNaN(due)) {
      form.date.min = dayToStr(due - 60 * DAY);
      form.date.max = dayToStr(due + 30 * DAY);
    }

    const w = form.weight, h = form.height;
    const upd = () => {
      $("#weightOut").textContent = fmtWeight(w.value);
      $("#heightOut").textContent = fmtHeight(h.value);
    };
    w.addEventListener("input", upd);
    h.addEventListener("input", upd);
    upd();
    form.message.addEventListener("input", () => ($("#msgCount").textContent = form.message.value.length));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#formError");
      err.textContent = "";
      if (!state.open || state.born) return (err.textContent = "Les pronostics sont fermés ⚓");
      const p = {
        name: form.name.value.trim(),
        avatar: avatarBox.dataset.value || "🐠",
        date: form.date.value,
        time: form.time.value,
        weight: Number(w.value),
        height: Number(h.value),
        hair: $("#hairPicker").dataset.value || "",
        looks: $("#looksPicker").dataset.value || "",
        babyName: cfg.guessName ? form.babyName.value.trim() : "",
        message: form.message.value.trim(),
      };
      if (!p.name) return (err.textContent = "Dis-nous qui tu es, moussaillon ! 🦜"), form.name.focus();
      if (!p.date || isNaN(parseDay(p.date))) return (err.textContent = "Il manque la date de naissance 📅"), form.date.focus();
      if (form.date.min && (p.date < form.date.min || p.date > form.date.max))
        return (err.textContent = "Choisis une date entre le " + fmtDay(form.date.min, { weekday: undefined }) + " et le " + fmtDay(form.date.max, { weekday: undefined }) + " 📅");
      if (!p.time) return (err.textContent = "Il manque l'heure de naissance 🕰️"), form.time.focus();
      if (!p.hair) return (err.textContent = "Choisis la couleur de ses cheveux 💇");
      if (!p.looks) return (err.textContent = "À qui ressemblera-t-elle ? 🪞");

      const btn = $("#submitBtn");
      btn.disabled = true;
      btn.textContent = "🌊 La bouteille vogue…";
      try {
        const id = await store.addPrediction(p);
        mine.push(id);
        saveMine();
        launchBottle(btn);
        form.reset();
        $("#msgCount").textContent = "0";
        ["#hairPicker", "#looksPicker"].forEach((s) => {
          delete $(s).dataset.value;
          $(s).querySelectorAll("[role=radio]").forEach((x) => x.setAttribute("aria-checked", "false"));
        });
        upd();
        toast("🍾 Bouteille lancée ! Merci " + p.name + " 💙", 4000);
        setTimeout(() => $("#banc").scrollIntoView({ behavior: "smooth" }), 1300);
      } catch (ex) {
        console.error(ex);
        err.textContent = "Oups, la bouteille a coulé… réessaie dans un instant. (" + (ex.message || ex) + ")";
      } finally {
        btn.disabled = false;
        btn.textContent = "🍾 Lancer ma bouteille";
      }
    });
  }

  function launchBottle(from) {
    const r = from.getBoundingClientRect();
    const b = document.createElement("span");
    b.className = "bottle-fly";
    b.textContent = "🍾";
    b.style.left = r.left + r.width / 2 + "px";
    b.style.top = r.top + "px";
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 1700);
    confetti(["🫧", "💧", "🐚", "⭐"], 30);
  }

  /* ---------------- Rendu ---------------- */
  function renderStats() {
    const box = $("#stats");
    const n = predictions.length;
    if (!n) {
      box.innerHTML = '<p class="empty stat--wide">Aucune bouteille pour l\'instant… sois le premier ou la première ! 🐚</p>';
      return;
    }
    const avg = (k) => predictions.reduce((s, p) => s + Number(p[k] || 0), 0) / n;
    const days = predictions.map((p) => parseDay(p.date)).filter((x) => !isNaN(x));
    const avgDay = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length / DAY) * DAY : NaN;
    const mins = predictions.map((p) => minutes(p.time)).filter((x) => !isNaN(x));
    // moyenne circulaire des heures
    const ang = mins.reduce((acc, m) => {
      const a = (m / 1440) * 2 * Math.PI;
      return [acc[0] + Math.cos(a), acc[1] + Math.sin(a)];
    }, [0, 0]);
    let avgMin = Math.round(((Math.atan2(ang[1], ang[0]) / (2 * Math.PI)) * 1440 + 1440) % 1440);
    const avgTime = String(Math.floor(avgMin / 60)).padStart(2, "0") + ":" + String(avgMin % 60).padStart(2, "0");

    const countBy = (k, list) =>
      list.map((it) => ({ label: it.label, n: predictions.filter((p) => p[k] === it.id).length }));
    const bars = (rows) => {
      const max = Math.max(1, ...rows.map((r) => r.n));
      return '<div class="bars">' + rows.map((r) =>
        `<div class="bar"><span>${esc(r.label)}</span><div class="bar__track"><div class="bar__fill" style="width:${(r.n / max) * 100}%"></div></div><span class="bar__count">${r.n}</span></div>`
      ).join("") + "</div>";
    };

    box.innerHTML = `
      <div class="stat"><p class="stat__label">Bouteilles à la mer</p><p class="stat__value">${n}</p><p class="stat__sub">pronostic${n > 1 ? "s" : ""} reçu${n > 1 ? "s" : ""}</p></div>
      <div class="stat"><p class="stat__label">Date moyenne</p><p class="stat__value">${isNaN(avgDay) ? "–" : esc(fmtDay(avgDay, { weekday: undefined }))}</p><p class="stat__sub">${isNaN(avgDay) ? "" : esc(fmtDay(avgDay, { day: undefined, month: undefined }))}</p></div>
      <div class="stat"><p class="stat__label">Heure moyenne</p><p class="stat__value">${mins.length ? fmtTime(avgTime) : "–"}</p><p class="stat__sub">${avgMin >= 1320 || avgMin < 360 ? "une naissance nocturne 🌙" : "en pleine journée ☀️"}</p></div>
      <div class="stat"><p class="stat__label">Poids moyen</p><p class="stat__value">${fmtWeight(avg("weight"))}</p><p class="stat__sub">taille moyenne : ${fmtHeight(Math.round(avg("height") * 10) / 10)}</p></div>
      <div class="stat stat--wide"><p class="stat__label">Dates pronostiquées</p>${histogram(days)}</div>
      <div class="stat"><p class="stat__label">Ses cheveux</p>${bars(countBy("hair", HAIR))}</div>
      <div class="stat"><p class="stat__label">Elle ressemblera à…</p>${bars(countBy("looks", LOOKS))}</div>
      ${cfg.guessName ? `<div class="stat"><p class="stat__label">Prénoms proposés</p>${namesCloud()}</div>` : ""}
    `;
  }

  function histogram(days) {
    if (!days.length) return '<p class="empty">–</p>';
    const due = parseDay(cfg.dueDate);
    let min = Math.min(...days, isNaN(due) ? Infinity : due);
    let max = Math.max(...days, isNaN(due) ? -Infinity : due);
    min -= 2 * DAY;
    max += 2 * DAY;
    const span = Math.round((max - min) / DAY) + 1;
    const bin = Math.max(1, Math.ceil(span / 21));
    const cols = [];
    for (let t = min; t <= max; t += bin * DAY) cols.push({ start: t, n: 0, due: !isNaN(due) && due >= t && due < t + bin * DAY });
    days.forEach((d) => {
      const i = Math.min(cols.length - 1, Math.floor((d - min) / DAY / bin));
      cols[i].n++;
    });
    const top = Math.max(1, ...cols.map((c) => c.n));
    const labelEvery = Math.ceil(cols.length / 7);
    return '<div class="histo">' + cols.map((c, i) =>
      `<div class="histo__col${c.due ? " histo__col--due" : ""}" title="${esc(fmtDay(c.start, { weekday: undefined }))}${bin > 1 ? " (+" + (bin - 1) + " j)" : ""} : ${c.n}${c.due ? " · terme prévu" : ""}">
        ${c.n ? `<div class="histo__n">${c.n}</div>` : ""}
        <div class="histo__bar" style="height:${(c.n / top) * 85}%"></div>
        ${i % labelEvery === 0 || c.due ? `<span class="histo__x">${c.due ? "🎯 " : ""}${esc(new Date(c.start).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" }))}</span>` : ""}
      </div>`
    ).join("") + "</div>";
  }

  function namesCloud() {
    const counts = {};
    predictions.forEach((p) => {
      const k = norm(p.babyName);
      if (!k) return;
      counts[k] = counts[k] || { label: p.babyName.trim(), n: 0 };
      counts[k].n++;
    });
    const rows = Object.values(counts).sort((a, b) => b.n - a.n).slice(0, 6);
    if (!rows.length) return '<p class="stat__sub">Personne n\'a encore osé… 🤫</p>';
    const max = rows[0].n;
    return '<div class="bars">' + rows.map((r) =>
      `<div class="bar"><span>${esc(r.label)}</span><div class="bar__track"><div class="bar__fill" style="width:${(r.n / max) * 100}%"></div></div><span class="bar__count">${r.n}</span></div>`
    ).join("") + "</div>";
  }

  function renderCards() {
    const box = $("#cards");
    const list = ranked();
    if (!state.born) list.reverse(); // les plus récentes d'abord
    $("#bancIntro").textContent = state.born
      ? "Classement final — les points sont sur chaque bouteille 🏆"
      : "Toutes les bouteilles repêchées jusqu'ici (" + predictions.length + ").";
    if (!list.length) {
      box.innerHTML = '<p class="empty">L\'océan est encore calme… aucune bouteille repêchée. 🌊</p>';
      return;
    }
    box.innerHTML = list.map((p, i) => {
      const isMine = mine.includes(p.id);
      return `<article class="card${isMine ? " card--mine" : ""}" style="animation-delay:${Math.min(i, 12) * 40}ms">
        ${p.score ? `<span class="card__score" title="Date ${p.score.date} · Heure ${p.score.time} · Poids ${p.score.weight} · Taille ${p.score.height} · Cheveux ${p.score.hair} · Ressemblance ${p.score.looks}${cfg.guessName ? " · Prénom " + p.score.name : ""}">${p.score.total} pts</span>` : ""}
        <div class="card__head">
          <div class="card__avatar" style="animation-delay:${-i * 0.37}s">${esc(p.avatar)}</div>
          <div><p class="card__name">${esc(p.name)}</p>${isMine ? '<span class="card__tag">★ Ma bouteille</span>' : ""}</div>
        </div>
        <dl>
          <dt>📅</dt><dd>${esc(fmtDay(p.date))}</dd>
          <dt>🕰️</dt><dd>${esc(fmtTime(p.time))}</dd>
          <dt>⚖️</dt><dd>${esc(fmtWeight(p.weight))}</dd>
          <dt>📏</dt><dd>${esc(fmtHeight(p.height))}</dd>
          <dt>💇</dt><dd>${esc(labelOf(HAIR, p.hair))}</dd>
          <dt>🪞</dt><dd>${esc(labelOf(LOOKS, p.looks))}</dd>
          ${cfg.guessName && p.babyName ? `<dt>✨</dt><dd>${esc(p.babyName)}</dd>` : ""}
        </dl>
      </article>`;
    }).join("");
  }

  function renderShells() {
    const box = $("#shells");
    const withMsg = predictions.filter((p) => p.message);
    $("#messages").hidden = !withMsg.length;
    const icons = ["🐚", "🦪", "🐚", "🫧"];
    box.innerHTML = withMsg.map((p, i) =>
      `<button class="shell" type="button" aria-expanded="false">
        <span class="shell__icon">${icons[i % icons.length]}</span>
        <span class="shell__from">${esc(p.avatar)} ${esc(p.name)}</span>
        <span class="shell__text">${esc(p.message)}</span>
      </button>`
    ).join("");
    box.querySelectorAll(".shell").forEach((s) =>
      s.addEventListener("click", () => {
        const open = s.classList.toggle("is-open");
        s.setAttribute("aria-expanded", String(open));
      })
    );
  }

  function renderTreasure() {
    const sec = $("#tresor");
    const r = state.result;
    if (!state.born || !r) {
      sec.hidden = true;
      return;
    }
    sec.hidden = false;
    $("#birthCard").innerHTML = `
      <p class="birth-card__name">${r.babyName ? esc(r.babyName) : "Notre petite sirène"} 🧜‍♀️</p>
      <div class="birth-card__facts">
        <div class="birth-card__fact"><small>Née le</small>${esc(fmtDay(r.date, { year: "numeric" }))}</div>
        <div class="birth-card__fact"><small>À</small>${esc(fmtTime(r.time))}</div>
        <div class="birth-card__fact"><small>Poids</small>${esc(fmtWeight(r.weight))}</div>
        <div class="birth-card__fact"><small>Taille</small>${esc(fmtHeight(r.height))}</div>
        <div class="birth-card__fact"><small>Cheveux</small>${esc(labelOf(HAIR, r.hair))}</div>
        <div class="birth-card__fact"><small>Ressemble à</small>${esc(labelOf(LOOKS, r.looks))}</div>
      </div>
      ${r.note ? `<p class="birth-card__note">« ${esc(r.note)} »</p>` : ""}`;

    const list = ranked();
    const medals = ["🥇", "🥈", "🥉"];
    $("#podium").innerHTML = list.slice(0, 3).map((p, i) =>
      `<li class="p${i + 1}"><div class="podium__medal">${medals[i]}</div><div class="podium__avatar">${esc(p.avatar)}</div><div class="podium__name">${esc(p.name)}</div><div class="podium__pts">${p.score.total} / ${MAX_SCORE}</div></li>`
    ).join("");
    $("#leaderboard").innerHTML = list.slice(3).map((p, i) =>
      `<div class="lb-row"><span class="lb-row__rank">${i + 4}</span><span class="lb-row__avatar">${esc(p.avatar)}</span><span>${esc(p.name)}</span><span class="lb-row__pts">${p.score.total} pts</span></div>`
    ).join("");
  }

  function renderFormState() {
    const closed = !state.open || state.born;
    $("#predictionForm").hidden = closed;
    $("#closedNote").hidden = !closed;
    $("#formIntro").hidden = closed;
    $("#ctaPredict").hidden = closed;
    $("#heroSub").textContent = state.born
      ? "Elle est arrivée ! Découvre qui a eu le meilleur flair 🏆"
      : "Une petite fille va bientôt rejoindre l'équipage. Devine quand elle pointera le bout de sa nageoire !";
  }

  function renderAll() {
    renderFormState();
    renderTreasure();
    renderStats();
    renderCards();
    renderShells();
    renderAdminList();
    tickCountdown();
  }

  /* ---------------- Espace capitaine ---------------- */
  function initAdmin() {
    const modal = $("#adminModal");
    const fillSelect = (sel, items) => (sel.innerHTML = items.map((i) => `<option value="${i.id}">${esc(i.label)}</option>`).join(""));
    fillSelect($("#resultHair"), HAIR);
    fillSelect($("#resultLooks"), LOOKS);

    $("#adminOpen").addEventListener("click", () => {
      prefillResult();
      modal.showModal();
    });
    if (location.hash === "#capitaine") setTimeout(() => $("#adminOpen").click(), 300);

    store.onAuth((a) => {
      isAdmin = a.isAdmin;
      $("#adminLogin").hidden = isAdmin;
      $("#adminPanel").hidden = !isAdmin;
      $("#adminWho").textContent = store.mode === "demo" ? "Mode démo : pas besoin de mot de passe." : "Connecté·e : " + (a.email || "");
      $("#logoutBtn").hidden = store.mode === "demo";
      if (a.email && !a.isAdmin) $("#loginError").textContent = "Ce compte n'est pas le capitaine de ce navire 🏴‍☠️";
      renderAdminList();
    });

    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      $("#loginError").textContent = "";
      try {
        await store.login(f.email.value.trim(), f.password.value);
        f.reset();
      } catch (ex) {
        $("#loginError").textContent = "Connexion impossible : vérifie l'email et le mot de passe.";
      }
    });
    $("#logoutBtn").addEventListener("click", () => store.logout());

    $("#openToggle").addEventListener("change", async (e) => {
      try {
        await store.setState({ open: e.target.checked });
        toast(e.target.checked ? "Pronostics ouverts 🌊" : "Pronostics fermés ⚓");
      } catch (ex) {
        toast("Erreur : " + ex.message);
        e.target.checked = !e.target.checked;
      }
    });

    $("#resultForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const result = {
        date: f.date.value,
        time: f.time.value,
        weight: Number(f.weight.value),
        height: Number(f.height.value),
        hair: f.hair.value,
        looks: f.looks.value,
        babyName: f.babyName.value.trim(),
        note: f.note.value.trim(),
      };
      $("#resultError").textContent = "";
      if (!result.date || !result.time || !result.weight || !result.height) {
        $("#resultError").textContent = "Remplis la date, l'heure, le poids et la taille.";
        return;
      }
      try {
        await store.setState({ born: true, open: false, result });
        modal.close();
        confetti();
        toast("🎉 Bienvenue petite sirène !", 5000);
        setTimeout(() => $("#tresor").scrollIntoView({ behavior: "smooth" }), 400);
      } catch (ex) {
        $("#resultError").textContent = "Erreur : " + ex.message;
      }
    });

    $("#unpublishBtn").addEventListener("click", async () => {
      try {
        await store.setState({ born: false });
        toast("Résultats masqués");
      } catch (ex) {
        toast("Erreur : " + ex.message);
      }
    });
  }

  function prefillResult() {
    const f = $("#resultForm");
    const r = state.result;
    $("#openToggle").checked = !!state.open;
    if (!r) return;
    ["date", "time", "weight", "height", "hair", "looks", "babyName", "note"].forEach((k) => {
      if (r[k] != null) f[k].value = r[k];
    });
  }

  function renderAdminList() {
    const ul = $("#adminList");
    if (!ul || !isAdmin) return;
    $("#openToggle").checked = !!state.open;
    ul.innerHTML = predictions.length
      ? predictions.map((p) => `<li><span>${esc(p.avatar)} ${esc(p.name)} — ${esc(fmtDay(p.date, { weekday: undefined }))}</span><button type="button" data-id="${esc(p.id)}" title="Supprimer">🗑️</button></li>`).join("")
      : "<li>Aucun pronostic.</li>";
    ul.querySelectorAll("button[data-id]").forEach((b) =>
      b.addEventListener("click", async () => {
        const p = predictions.find((x) => x.id === b.dataset.id);
        if (!p || !confirm("Supprimer le pronostic de « " + p.name + " » ?")) return;
        try {
          await store.deletePrediction(p.id);
        } catch (ex) {
          toast("Erreur : " + ex.message);
        }
      })
    );
  }

  /* ---------------- Easter eggs ---------------- */
  function initEasterEggs() {
    let clicks = 0;
    $("#chest").addEventListener("click", () => {
      clicks++;
      if (clicks === 1) toast("🧰 Le coffre est fermé… insiste un peu ?");
      else if (clicks === 3) {
        toast("💎 Tu as trouvé le trésor caché ! Bravo moussaillon !", 4000);
        confetti(["💎", "🪙", "👑", "🐚", "⭐"], 70);
        clicks = 0;
      }
    });
    // Code secret : taper « sirene » au clavier 🧜‍♀️
    let typed = "";
    addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea")) return;
      typed = (typed + e.key.toLowerCase()).slice(-6);
      if (typed === "sirene") {
        toast("🧜‍♀️ La petite sirène vous fait coucou !", 4000);
        confetti(["🧜‍♀️", "🐚", "💖", "🫧"], 50);
      }
    });
  }

  /* ---------------- Démarrage ---------------- */
  function onError(ex) {
    console.error(ex);
    toast("⚠️ Impossible de joindre l'océan (base de données). Vérifie la configuration Firebase.", 6000);
  }

  initHeader();
  initForm();
  initBubbles();
  initSwimmers();
  initDepth();
  initAdmin();
  initEasterEggs();
  tickCountdown();
  setInterval(tickCountdown, 1000);

  store.ready.catch(onError);
  store.onPredictions((list) => {
    predictions = list;
    renderAll();
  }, onError);
  store.onState((s) => {
    const wasBorn = state.born;
    state = s;
    renderAll();
    if (s.born && !wasBorn && predictions.length) confetti();
  }, onError);
})();
