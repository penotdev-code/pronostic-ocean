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
  // Où seront papa et maman au début du travail ?
  const WHERE = [
    { id: "maison", label: "À la maison 🏠" },
    { id: "lit", label: "Au lit 😴" },
    { id: "travail", label: "Au travail 💼" },
    { id: "route", label: "Sur la route 🚗" },
    { id: "courses", label: "En courses 🛒" },
    { id: "sortie", label: "En sortie, chez des amis 🎉" },
    { id: "douche", label: "Sous la douche 🚿" },
    { id: "maternite", label: "Déjà à la maternité 🏥" },
  ];

  /* ---------------- État ---------------- */
  let state = { open: true, born: false, result: null, deadline: 0 };
  let auth = { isAdmin: false, uid: null, email: null };
  let answers = []; // version anonyme (après avoir joué)
  let allPreds = []; // version complète (capitaine, ou tout le monde après la naissance)
  let myPreds = []; // mes propres pronostics
  // Page annexe /stats : uniquement le tableau de bord du capitaine
  const STATS_PAGE = /^\/stats\/?$/.test(location.pathname);
  let messages = []; // capitaine : tous ; joueur : les siens
  let voters = []; // appareils ayant joué

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
  function fmtDateTime(ms) {
    const d = new Date(ms);
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
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
  function fmtDuration(m) {
    if (m < 60) return m + " min";
    const h = Math.floor(m / 60);
    return h + "h" + (m % 60 ? String(m % 60).padStart(2, "0") : "");
  }
  function fmtLeft(ms) {
    const d = Math.floor(ms / DAY);
    const h = Math.floor((ms % DAY) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return d + " j " + h + " h";
    if (h > 0) return h + " h " + String(m).padStart(2, "0");
    return m + " min";
  }
  const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || "–";
  const DAY = 86400000;
  const plural = (n, word) => n + " " + word + (n > 1 ? "s" : "");

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

  /* ---------------- Règles du jeu ---------------- */
  const mineIds = () => myPreds.map((p) => p.id);
  const hasVoted = () => myPreds.length > 0 || (auth.uid && voters.includes(auth.uid));
  const canSeeAnswers = () => auth.isAdmin || state.born || hasVoted();
  const deadlinePassed = () => !!state.deadline && Date.now() >= state.deadline;
  const votingOpen = () => state.open && !state.born && !deadlinePassed();

  /* ---------------- Comparaison avec la réalité (sans points : on joue sans pression) ---------------- */
  // Écarts entre un pronostic et la réalité
  const DIFF = {
    days: (p, r) => Math.round(Math.abs(parseDay(p.date) - parseDay(r.date)) / DAY),
    minutes: (p, r) => {
      const dm = Math.abs(minutes(p.time) - minutes(r.time));
      return Math.min(dm, 1440 - dm);
    },
    grams: (p, r) => Math.abs(Number(p.weight) - Number(r.weight)),
    cm: (p, r) => Math.round(Math.abs(Number(p.height) - Number(r.height)) * 10) / 10,
  };
  const nameMatch = (p, r) => !!(cfg.guessName && r.babyName && norm(p.babyName) && norm(p.babyName) === norm(r.babyName));
  const same = (p, r, k) => !!(p[k] && r[k] && p[k] === r[k]);

  // Les questions où le pronostic était juste, ou tout près
  function nearHits(p, r) {
    const hits = [];
    const d = DIFF.days(p, r);
    if (d === 0) hits.push("la date 🎯");
    else if (d === 1) hits.push("la date (à 1 jour près)");
    const m = DIFF.minutes(p, r);
    if (m <= 30) hits.push(m === 0 ? "l'heure à la minute près 🎯" : "l'heure (à " + fmtDuration(m) + " près)");
    const g = DIFF.grams(p, r);
    if (g <= 100) hits.push(g === 0 ? "le poids au gramme près 🎯" : "le poids (à " + g + " g près)");
    const c = DIFF.cm(p, r);
    if (c <= 1) hits.push(c === 0 ? "la taille 🎯" : "la taille (à " + String(c).replace(".", ",") + " cm près)");
    if (same(p, r, "hair")) hits.push("les cheveux");
    if (same(p, r, "looks")) hits.push("la ressemblance");
    if (same(p, r, "papaWhere")) hits.push("où était papa");
    if (same(p, r, "mamanWhere")) hits.push("où était maman");
    if (nameMatch(p, r)) hits.push("le prénom 🔮");
    return hits;
  }
  const byName = (list) => list.slice().sort((a, b) => a.name.localeCompare(b.name, "fr"));

  /* Trophées rigolos décernés après la naissance */
  function trophies(list, r) {
    if (!list.length) return [];
    const best = (fn) => {
      const vals = list.map((p) => ({ p, v: fn(p) })).filter((x) => !isNaN(x.v));
      if (!vals.length) return { who: [], v: NaN };
      const min = Math.min(...vals.map((x) => x.v));
      return { who: vals.filter((x) => x.v === min).map((x) => x.p), v: min };
    };
    const t = [];
    const add = (icon, title, b, detail) => b.who.length && t.push({ icon, title, who: b.who, detail: detail(b.v) });
    add("📅", "Le calendrier vivant", best((p) => DIFF.days(p, r)), (v) => (v ? `à ${v} jour${v > 1 ? "s" : ""} près` : "le jour exact !"));
    add("⏱️", "Le chronomètre", best((p) => DIFF.minutes(p, r)), (v) => (v ? "à " + fmtDuration(v) + " près" : "à la minute près !"));
    add("⚖️", "La balance de précision", best((p) => DIFF.grams(p, r)), (v) => (v ? `à ${v} g près` : "au gramme près !"));
    add("📏", "Le mètre ruban", best((p) => DIFF.cm(p, r)), (v) => (v ? `à ${String(v).replace(".", ",")} cm près` : "pile la bonne taille !"));
    const finders = list.filter((p) => nameMatch(p, r));
    if (finders.length) t.push({ icon: "🔮", title: "Le devin", who: finders, detail: "a trouvé le prénom" });
    const both = list.filter((p) => same(p, r, "papaWhere") && same(p, r, "mamanWhere"));
    if (both.length) t.push({ icon: "🕵️", title: "Le détective", who: both, detail: "savait où étaient papa et maman" });
    add("🐇", "Le plus pressé", best((p) => parseDay(p.date)), (v) => "la voyait arriver le " + fmtDay(v, { weekday: undefined }));
    add("🐢", "Le plus patient", best((p) => -parseDay(p.date)), (v) => "la voyait arriver le " + fmtDay(-v, { weekday: undefined }));
    return t;
  }
  function trophiesHtml(list, r) {
    const t = trophies(list, r);
    if (!t.length) return '<p class="empty">Pas de trophée cette fois.</p>';
    return t.map((x) => `
      <div class="trophy">
        <div class="trophy__icon">${x.icon}</div>
        <div class="trophy__title">${esc(x.title)}</div>
        <div class="trophy__who">${x.who.slice(0, 4).map((p) => esc(p.avatar) + " " + esc(p.name)).join("<br />")}${x.who.length > 4 ? "<br />+ " + (x.who.length - 4) : ""}</div>
        <div class="trophy__detail">${esc(x.detail)}</div>
      </div>`).join("");
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
      b.style.left = x != null ? x : Math.random() * 100 + "vw";
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
      if (e.target.closest("input, textarea, select, button, a, dialog, .calendar, table")) return;
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

  /* ---------------- En-tête, compte à rebours, date limite ---------------- */
  function initHeader() {
    renderParents();
    $("#footerBaby").textContent = cfg.babyNickname || "notre petite sirène";
    if (!cfg.guessName) $("#nameField").remove();
    if (store.mode === "demo") $("#demoBanner").hidden = false;
  }
  function renderParents() {
    $("#footerParents").textContent = cfg.parents || "";
    $("#heroKicker").textContent = cfg.parents ? cfg.parents + " vous annoncent…" : "Avis à tous les moussaillons";
  }

  // Les parents et la date du terme réglés dans l'espace capitaine
  // remplacent ceux de config.js
  const baseCfg = { parents: cfg.parents, dueDate: cfg.dueDate };
  function applySettings() {
    const parents = state.parents || baseCfg.parents;
    const dueDate = state.dueDate || baseCfg.dueDate;
    if (parents !== cfg.parents) {
      cfg.parents = parents;
      renderParents();
    }
    if (dueDate !== cfg.dueDate) {
      cfg.dueDate = dueDate;
      calendar.refreshDue();
    }
  }

  let wasOpen = null;
  function tick() {
    const caption = $("#countdownCaption");
    const box = $("#countdown");
    // Si la date limite vient de passer, on rafraîchit la page
    const open = votingOpen();
    if (wasOpen !== null && open !== wasOpen) renderAll();
    wasOpen = open;
    renderDeadline();

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

  function renderDeadline() {
    const pill = $("#deadlinePill");
    const note = $("#deadlineNote");
    if (!state.deadline || state.born || !state.open) {
      pill.hidden = note.hidden = true;
      return;
    }
    const left = state.deadline - Date.now();
    if (left <= 0) {
      pill.hidden = false;
      pill.textContent = "⏳ Les votes sont clos depuis le " + fmtDateTime(state.deadline);
      note.hidden = true;
      return;
    }
    pill.hidden = note.hidden = false;
    pill.textContent = "⏳ Votes ouverts jusqu'au " + fmtDateTime(state.deadline) + " · encore " + fmtLeft(left);
    note.textContent = "⏳ Plus que " + fmtLeft(left) + " pour jeter ta bouteille (fin des votes le " + fmtDateTime(state.deadline) + ").";
    note.classList.toggle("is-urgent", left < DAY);
  }

  /* ---------------- Sélecteur de date ---------------- */
  const calendar = (function () {
    const today = parseDay(dayToStr(Date.now()));
    let due, min, max, view;
    let selected = null;
    let box, input, choice;
    // Recalculé quand le capitaine change la date du terme
    function setRange() {
      due = parseDay(cfg.dueDate);
      min = isNaN(due) ? today : due - 60 * DAY;
      max = isNaN(due) ? today + 300 * DAY : due + 30 * DAY;
      const v = isNaN(due) ? new Date(today) : new Date(due); // mois affiché (UTC)
      view = Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), 1);
    }
    setRange();

    function monthStart(ms, delta) {
      const d = new Date(ms);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
    }
    function relToDue(ms) {
      if (isNaN(due)) return "";
      const d = Math.round((ms - due) / DAY);
      if (d === 0) return "le jour du terme 🎯";
      return plural(Math.abs(d), "jour") + (d < 0 ? " avant le terme" : " après le terme");
    }
    function render() {
      const first = new Date(view);
      const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
      const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      const prevOk = monthStart(view, 0) > min;
      const nextOk = monthStart(view, 1) <= max;
      let cells = "";
      for (let i = 0; i < offset; i++) cells += '<span class="calendar__pad"></span>';
      for (let d = 1; d <= daysIn; d++) {
        const ms = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d);
        const off = ms < min || ms > max;
        const cls = ["calendar__day"];
        if (ms === due) cls.push("is-due");
        if (ms === selected) cls.push("is-selected");
        if (ms === today) cls.push("is-today");
        cells += `<button type="button" class="${cls.join(" ")}" data-ms="${ms}" ${off ? "disabled" : ""} aria-pressed="${ms === selected}" aria-label="${esc(fmtDay(ms, { year: "numeric" }))}${ms === due ? ", terme prévu" : ""}">${d}</button>`;
      }
      box.innerHTML = `
        <div class="calendar__head">
          <button type="button" class="calendar__nav" data-nav="-1" ${prevOk ? "" : "disabled"} aria-label="Mois précédent">‹</button>
          <span class="calendar__month">${esc(first.toLocaleDateString("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" }))}</span>
          <button type="button" class="calendar__nav" data-nav="1" ${nextOk ? "" : "disabled"} aria-label="Mois suivant">›</button>
        </div>
        <div class="calendar__grid" role="group" aria-label="Jours du mois">
          ${["L", "M", "M", "J", "V", "S", "D"].map((x) => `<span class="calendar__wd" aria-hidden="true">${x}</span>`).join("")}
          ${cells}
        </div>
        <div class="calendar__quick">
          ${isNaN(due) ? "" : '<button type="button" class="chip chip--small" data-jump="0">🎯 Le jour du terme</button>'}
          <button type="button" class="chip chip--small" data-shift="-1" ${selected ? "" : "disabled"}>− 1 jour</button>
          <button type="button" class="chip chip--small" data-shift="1" ${selected ? "" : "disabled"}>+ 1 jour</button>
        </div>`;
    }
    function select(ms) {
      if (ms < min || ms > max) return;
      selected = ms;
      view = monthStart(ms, 0);
      input.value = dayToStr(ms);
      choice.innerHTML = `Ton choix : <b>${esc(fmtDay(ms, { year: "numeric" }))}</b>${relToDue(ms) ? " · " + esc(relToDue(ms)) : ""}`;
      render();
      const btn = box.querySelector(`[data-ms="${ms}"]`);
      if (btn) btn.focus({ preventScroll: true });
    }
    return {
      init() {
        box = $("#datePicker");
        input = $("#predictionForm").date;
        choice = $("#dateChoice");
        box.addEventListener("click", (e) => {
          const b = e.target.closest("button");
          if (!b || b.disabled) return;
          if (b.dataset.ms) select(Number(b.dataset.ms));
          else if (b.dataset.nav) {
            view = monthStart(view, Number(b.dataset.nav));
            render();
          } else if (b.dataset.jump) select(due);
          else if (b.dataset.shift && selected) select(selected + Number(b.dataset.shift) * DAY);
        });
        // Flèches du clavier dans la grille
        box.addEventListener("keydown", (e) => {
          const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
          const b = e.target.closest(".calendar__day");
          if (!step || !b) return;
          e.preventDefault();
          select(Number(b.dataset.ms) + step * DAY);
        });
        render();
      },
      reset() {
        selected = null;
        input.value = "";
        choice.textContent = "Touche un jour dans le calendrier.";
        render();
      },
      refreshDue() {
        setRange();
        if (selected !== null && (selected < min || selected > max)) this.reset();
        else if (box) render();
      },
    };
  })();

  /* ---------------- Formulaire ---------------- */
  function pickerGroup(container, items, render) {
    container.innerHTML = "";
    container.setAttribute("role", "radiogroup");
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
  const chip = (b, it) => {
    b.className = "chip";
    b.textContent = it.label;
  };
  const CHOICE_PICKERS = ["#hairPicker", "#looksPicker", "#papaPicker", "#mamanPicker"];

  function initForm() {
    const form = $("#predictionForm");
    const avatarBox = $("#avatarPicker");
    pickerGroup(avatarBox, AVATARS, (b, a) => {
      b.className = "avatar-opt";
      b.textContent = a;
      b.setAttribute("aria-label", "Avatar " + a);
    });
    avatarBox.children[Math.floor(Math.random() * AVATARS.length)].click();
    pickerGroup($("#hairPicker"), HAIR, chip);
    pickerGroup($("#looksPicker"), LOOKS, chip);
    pickerGroup($("#papaPicker"), WHERE, chip);
    pickerGroup($("#mamanPicker"), WHERE, chip);
    calendar.init();

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
      if (!votingOpen()) return (err.textContent = "Les pronostics sont fermés ⚓");
      const val = (sel) => $(sel).dataset.value || "";
      const p = {
        name: form.name.value.trim(),
        avatar: avatarBox.dataset.value || "🐠",
        date: form.date.value,
        time: form.time.value,
        weight: Number(w.value),
        height: Number(h.value),
        hair: val("#hairPicker"),
        looks: val("#looksPicker"),
        papaWhere: val("#papaPicker"),
        mamanWhere: val("#mamanPicker"),
        babyName: cfg.guessName ? form.babyName.value.trim() : "",
      };
      const message = form.message.value.trim();
      if (!p.name) return (err.textContent = "Dis-nous qui tu es, moussaillon ! 🦜"), form.name.focus();
      if (!p.date) return (err.textContent = "Choisis un jour dans le calendrier 📅"), $("#datePicker").scrollIntoView({ block: "center" });
      if (!p.time) return (err.textContent = "Il manque l'heure de naissance 🕰️"), form.time.focus();
      if (!p.hair) return (err.textContent = "Choisis la couleur de ses cheveux 💇");
      if (!p.looks) return (err.textContent = "À qui ressemblera-t-elle ? 🪞");
      if (!p.papaWhere) return (err.textContent = "Où sera papa au début du travail ? 👨");
      if (!p.mamanWhere) return (err.textContent = "Où sera maman au début du travail ? 👩");

      const btn = $("#submitBtn");
      btn.disabled = true;
      btn.textContent = "🌊 La bouteille vogue…";
      try {
        await store.addPrediction(p, message);
        launchBottle(btn);
        form.reset();
        calendar.reset();
        $("#msgCount").textContent = "0";
        CHOICE_PICKERS.forEach((s) => {
          delete $(s).dataset.value;
          $(s).querySelectorAll("[role=radio]").forEach((x) => x.setAttribute("aria-checked", "false"));
        });
        upd();
        toast("🍾 Bouteille lancée ! Merci " + p.name + " 💙 Les courants te sont dévoilés…", 4500);
        setTimeout(() => $("#courants").scrollIntoView({ behavior: "smooth" }), 1300);
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

  /* ---------------- Statistiques ---------------- */
  /* withNames : version capitaine, qui affiche qui a répondu quoi */
  function statsHtml(list, withNames) {
    const n = list.length;
    if (!n) return '<p class="empty stat--wide">Aucune bouteille pour l\'instant… 🐚</p>';
    const who = (arr) => (withNames && arr.length ? `<span class="bar__who">${arr.map((p) => esc(p.avatar) + " " + esc(p.name)).join(", ")}</span>` : "");
    const avg = (k) => list.reduce((s, p) => s + Number(p[k] || 0), 0) / n;
    const days = list.map((p) => parseDay(p.date)).filter((x) => !isNaN(x));
    const avgDay = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length / DAY) * DAY : NaN;
    const mins = list.map((p) => minutes(p.time)).filter((x) => !isNaN(x));
    // moyenne circulaire des heures (23h et 1h → minuit, pas midi)
    const ang = mins.reduce((acc, m) => {
      const a = (m / 1440) * 2 * Math.PI;
      return [acc[0] + Math.cos(a), acc[1] + Math.sin(a)];
    }, [0, 0]);
    const avgMin = Math.round(((Math.atan2(ang[1], ang[0]) / (2 * Math.PI)) * 1440 + 1440) % 1440);
    const avgTime = String(Math.floor(avgMin / 60)).padStart(2, "0") + ":" + String(avgMin % 60).padStart(2, "0");

    const bars = (rows) => {
      const max = Math.max(1, ...rows.map((r) => r.n));
      return '<div class="bars">' + rows.map((r) =>
        `<div class="bar"><span>${esc(r.label)}</span><div class="bar__track"><div class="bar__fill" style="width:${(r.n / max) * 100}%"></div></div><span class="bar__count">${r.n}</span>${who(r.people || [])}</div>`
      ).join("") + "</div>";
    };
    const countBy = (k, opts) => opts.map((it) => {
      const people = list.filter((p) => p[k] === it.id);
      return { label: it.label, n: people.length, people };
    });
    const nameRows = () => {
      const counts = {};
      list.forEach((p) => {
        const k = norm(p.babyName);
        if (!k) return;
        counts[k] = counts[k] || { label: p.babyName.trim(), n: 0, people: [] };
        counts[k].n++;
        counts[k].people.push(p);
      });
      const rows = Object.values(counts).sort((a, b) => b.n - a.n).slice(0, withNames ? 50 : 6);
      return rows.length ? bars(rows) : '<p class="stat__sub">Personne n\'a encore osé… 🤫</p>';
    };
    const extremes = () => {
      if (!withNames) return "";
      const by = (fn, dir) => list.slice().sort((a, b) => dir * (fn(a) - fn(b)))[0];
      const line = (label, p, value) => `<li><span>${label}</span><b>${esc(p.avatar)} ${esc(p.name)}</b><span>${esc(value)}</span></li>`;
      const early = by((p) => parseDay(p.date), 1), late = by((p) => parseDay(p.date), -1);
      const light = by((p) => p.weight, 1), heavy = by((p) => p.weight, -1);
      const small = by((p) => p.height, 1), tall = by((p) => p.height, -1);
      return `<div class="stat stat--wide"><p class="stat__label">Les extrêmes</p><ul class="extremes">
        ${line("🐇 Date la plus tôt", early, fmtDay(early.date, { weekday: undefined }))}
        ${line("🐢 Date la plus tard", late, fmtDay(late.date, { weekday: undefined }))}
        ${line("🪶 Le plus léger", light, fmtWeight(light.weight))}
        ${line("🐳 Le plus lourd", heavy, fmtWeight(heavy.weight))}
        ${line("🦐 La plus petite", small, fmtHeight(small.height))}
        ${line("🦒 La plus grande", tall, fmtHeight(tall.height))}
      </ul></div>`;
    };

    return `
      <div class="stat"><p class="stat__label">Bouteilles à la mer</p><p class="stat__value">${n}</p><p class="stat__sub">pronostic${n > 1 ? "s" : ""} reçu${n > 1 ? "s" : ""}</p></div>
      <div class="stat"><p class="stat__label">Date moyenne</p><p class="stat__value">${isNaN(avgDay) ? "–" : esc(fmtDay(avgDay, { weekday: undefined }))}</p><p class="stat__sub">${isNaN(avgDay) ? "" : esc(fmtDay(avgDay, { day: undefined, month: undefined }))}</p></div>
      <div class="stat"><p class="stat__label">Heure moyenne</p><p class="stat__value">${mins.length ? fmtTime(avgTime) : "–"}</p><p class="stat__sub">${momentOf(avgMin)}</p></div>
      <div class="stat"><p class="stat__label">Poids moyen</p><p class="stat__value">${fmtWeight(avg("weight"))}</p><p class="stat__sub">taille moyenne : ${fmtHeight(Math.round(avg("height") * 10) / 10)}</p></div>
      <div class="stat stat--wide"><p class="stat__label">Dates pronostiquées</p>${histogram(list, withNames)}</div>
      ${extremes()}
      <div class="stat"><p class="stat__label">Ses cheveux</p>${bars(countBy("hair", HAIR))}</div>
      <div class="stat"><p class="stat__label">Elle ressemblera à…</p>${bars(countBy("looks", LOOKS))}</div>
      ${cfg.guessName ? `<div class="stat"><p class="stat__label">Prénoms proposés</p>${nameRows()}</div>` : ""}
      <div class="stat"><p class="stat__label">👨 Papa au début du travail</p>${bars(countBy("papaWhere", WHERE).filter((r) => r.n || withNames))}</div>
      <div class="stat"><p class="stat__label">👩 Maman au début du travail</p>${bars(countBy("mamanWhere", WHERE).filter((r) => r.n || withNames))}</div>
    `;
  }

  function momentOf(min) {
    if (min < 360 || min >= 1320) return "une naissance nocturne 🌙";
    if (min < 720) return "dans la matinée 🌅";
    if (min < 1080) return "dans l'après-midi ☀️";
    return "en soirée 🌆";
  }

  function histogram(list, withNames) {
    const days = list.map((p) => parseDay(p.date)).filter((x) => !isNaN(x));
    if (!days.length) return '<p class="empty">–</p>';
    const due = parseDay(cfg.dueDate);
    let min = Math.min(...days, isNaN(due) ? Infinity : due) - 2 * DAY;
    let max = Math.max(...days, isNaN(due) ? -Infinity : due) + 2 * DAY;
    const span = Math.round((max - min) / DAY) + 1;
    const bin = Math.max(1, Math.ceil(span / 21));
    const cols = [];
    for (let t = min; t <= max; t += bin * DAY) cols.push({ start: t, n: 0, names: [], due: !isNaN(due) && due >= t && due < t + bin * DAY });
    list.forEach((p) => {
      const d = parseDay(p.date);
      if (isNaN(d)) return;
      const c = cols[Math.min(cols.length - 1, Math.floor((d - min) / DAY / bin))];
      c.n++;
      if (withNames) c.names.push(p.name);
    });
    const top = Math.max(1, ...cols.map((c) => c.n));
    const labelEvery = Math.ceil(cols.length / 7);
    return '<div class="histo">' + cols.map((c, i) =>
      `<div class="histo__col${c.due ? " histo__col--due" : ""}" title="${esc(fmtDay(c.start, { weekday: undefined }))}${bin > 1 ? " (+" + (bin - 1) + " j)" : ""} : ${c.n}${c.due ? " · terme prévu" : ""}${c.names.length ? " — " + esc(c.names.join(", ")) : ""}">
        ${c.n ? `<div class="histo__n">${c.n}</div>` : ""}
        <div class="histo__bar" style="height:${(c.n / top) * 85}%"></div>
        ${i % labelEvery === 0 || c.due ? `<span class="histo__x">${c.due ? "🎯 " : ""}${esc(new Date(c.due ? due : c.start).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" }))}</span>` : ""}
      </div>`
    ).join("") + "</div>";
  }

  /* ---------------- Rendu public ---------------- */
  function lockHtml(what) {
    const n = voters.length;
    const count = n ? `<p class="lock__count">Déjà <b>${plural(n, "moussaillon")}</b> ${n > 1 ? "ont" : "a"} jeté leur bouteille.</p>` : "";
    if (!votingOpen()) {
      return `<div class="lock__icon" aria-hidden="true">🔒</div><p>Les ${what} restent au fond de l'océan jusqu'à la naissance.</p>${count}`;
    }
    return `<div class="lock__icon" aria-hidden="true">🔒</div>
      <p>Les ${what} sont cachés pour l'instant. Jette d'abord ta propre bouteille : pas question de copier sur le voisin&nbsp;! 😉</p>
      ${count}
      <a class="btn btn--coral" href="#pronostic">🍾 Faire mon pronostic</a>`;
  }

  function renderStats() {
    const show = canSeeAnswers();
    $("#statsLock").hidden = show;
    $("#stats").hidden = !show;
    if (!show) return void ($("#statsLock").innerHTML = lockHtml("courants de l'équipage"));
    $("#stats").innerHTML = statsHtml(state.born ? allPreds : answers, false);
  }

  function renderMyMessages() {
    const mineMsgs = messages.filter((m) => m.uid === auth.uid);
    $("#messages").hidden = !mineMsgs.length;
    const box = $("#shells");
    box.innerHTML = mineMsgs.map((m, i) =>
      `<button class="shell" type="button" aria-expanded="false">
        <span class="shell__icon">${i % 2 ? "🦪" : "🐚"}</span>
        <span class="shell__from">${esc(m.avatar)} ${esc(m.name)}</span>
        <span class="shell__text">${esc(m.text)}</span>
      </button>`
    ).join("");
    box.querySelectorAll(".shell").forEach((s) =>
      s.addEventListener("click", () => s.setAttribute("aria-expanded", String(s.classList.toggle("is-open"))))
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
        ${r.papaWhere ? `<div class="birth-card__fact"><small>Papa était</small>${esc(labelOf(WHERE, r.papaWhere))}</div>` : ""}
        ${r.mamanWhere ? `<div class="birth-card__fact"><small>Maman était</small>${esc(labelOf(WHERE, r.mamanWhere))}</div>` : ""}
      </div>
      ${r.note ? `<p class="birth-card__note">« ${esc(r.note)} »</p>` : ""}`;

    const list = byName(allPreds);
    const mine = mineIds();
    const myOnes = list.filter((p) => mine.includes(p.id));
    $("#myResult").hidden = !myOnes.length;
    $("#myResult").innerHTML = myOnes.map((p) => {
      const hits = nearHits(p, r);
      return `<p>${esc(p.avatar)} <b>${esc(p.name)}</b>, ${hits.length ? "tu avais vu juste pour " + esc(joinFr(hits)) + " 👏" : "pas de réponse dans le mille cette fois, mais quelle jolie bouteille 💙"}</p>`;
    }).join("");

    $("#trophies").innerHTML = trophiesHtml(allPreds, r);

    $("#leaderboard").innerHTML = list.length
      ? list.map((p) => `
        <details class="lb-row${mine.includes(p.id) ? " is-mine" : ""}">
          <summary>
            <span class="lb-row__avatar">${esc(p.avatar)}</span>
            <span class="lb-row__name">${esc(p.name)}</span>
            <span class="lb-row__guess">${esc(fmtDay(p.date, { weekday: undefined }))} · ${esc(fmtTime(p.time))}</span>
          </summary>
          ${breakdownHtml(p, r)}
        </details>`).join("")
      : '<p class="empty">Aucun pronostic n\'avait été lancé.</p>';
  }
  function joinFr(arr) {
    return arr.length > 1 ? arr.slice(0, -1).join(", ") + " et " + arr[arr.length - 1] : arr[0];
  }

  /* Pronostic d'un participant comparé à la réalité, question par question */
  function breakdownHtml(p, r) {
    const ecart = (v, unit) => (v === 0 ? "🎯 pile !" : unit(v));
    const ok = (v) => (v ? "✅" : "–");
    const rows = [
      ["📅", "Date", fmtDay(p.date, { weekday: undefined }), fmtDay(r.date, { weekday: undefined }), ecart(DIFF.days(p, r), (v) => v + " j")],
      ["🕰️", "Heure", fmtTime(p.time), fmtTime(r.time), ecart(DIFF.minutes(p, r), fmtDuration)],
      ["⚖️", "Poids", fmtWeight(p.weight), fmtWeight(r.weight), ecart(DIFF.grams(p, r), (v) => v + " g")],
      ["📏", "Taille", fmtHeight(p.height), fmtHeight(r.height), ecart(DIFF.cm(p, r), (v) => String(v).replace(".", ",") + " cm")],
      ["💇", "Cheveux", labelOf(HAIR, p.hair), labelOf(HAIR, r.hair), ok(same(p, r, "hair"))],
      ["🪞", "Ressemblance", labelOf(LOOKS, p.looks), labelOf(LOOKS, r.looks), ok(same(p, r, "looks"))],
      ["👨", "Papa au début", labelOf(WHERE, p.papaWhere), labelOf(WHERE, r.papaWhere), ok(same(p, r, "papaWhere"))],
      ["👩", "Maman au début", labelOf(WHERE, p.mamanWhere), labelOf(WHERE, r.mamanWhere), ok(same(p, r, "mamanWhere"))],
    ];
    if (cfg.guessName) rows.push(["✨", "Prénom", p.babyName || "–", r.babyName || "–", ok(nameMatch(p, r))]);
    return `<div class="breakdown"><table>
      <thead><tr><th></th><th>Pronostic</th><th>Réalité</th><th>Écart</th></tr></thead>
      <tbody>${rows.map((x) => `<tr><th scope="row"><span aria-hidden="true">${x[0]}</span> ${x[1]}</th><td>${esc(x[2])}</td><td>${esc(x[3])}</td><td>${esc(x[4])}</td></tr>`).join("")}</tbody>
    </table></div>`;
  }

  /* ---------------- Ma bouteille & code de récupération ---------------- */
  function renderMyBottle() {
    const box = $("#myBottle");
    const code = store.myCode ? store.myCode() : null;
    if (!myPreds.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const row = (k, v) => `<li><span>${k}</span><b>${esc(v)}</b></li>`;
    const cards = myPreds
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((p) => `
        <div class="my-bottle__card">
          <p class="my-bottle__who">${esc(p.avatar)} ${esc(p.name)}</p>
          <ul>
            ${row("📅 Date", fmtDay(p.date, { year: "numeric" }))}
            ${row("🕰️ Heure", fmtTime(p.time))}
            ${row("⚖️ Poids", fmtWeight(p.weight))}
            ${row("📏 Taille", fmtHeight(p.height))}
            ${row("💇 Cheveux", labelOf(HAIR, p.hair))}
            ${row("🪞 Ressemble à", labelOf(LOOKS, p.looks))}
            ${row("👨 Papa sera", labelOf(WHERE, p.papaWhere))}
            ${row("👩 Maman sera", labelOf(WHERE, p.mamanWhere))}
            ${p.babyName ? row("✨ Prénom", p.babyName) : ""}
          </ul>
        </div>`)
      .join("");
    box.innerHTML = `
      <h3 class="zone__subtitle">📜 ${myPreds.length > 1 ? "Tes bouteilles" : "Ta bouteille"}</h3>
      ${code ? `
        <div class="my-bottle__code">
          <p>🔑 Ton code de bouteille : <b id="myCode">${esc(code)}</b>
            <button type="button" class="chip chip--small" id="copyCode">📋 Copier</button></p>
          <small>Note-le bien ! Il te permet de retrouver tes réponses sur un autre téléphone ou ordinateur.</small>
        </div>` : ""}
      <div class="my-bottle__cards">${cards}</div>`;
    const copy = $("#copyCode");
    if (copy)
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code);
          toast("📋 Code copié : " + code);
        } catch (e) {
          toast("🔑 Ton code : " + code, 6000);
        }
      });
  }

  function initRecover() {
    $("#recoverForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#recoverError");
      const code = e.target.code.value.trim();
      err.textContent = "";
      if (!code) return;
      const clean = (c) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const current = store.myCode ? store.myCode() : null;
      if (current && clean(current) !== clean(code) &&
          !confirm("Cet appareil a déjà sa propre bouteille (code " + current + "). Note-le avant de continuer : veux-tu vraiment passer à l'autre ?")) return;
      try {
        await store.recover(code);
        e.target.reset();
        $("#recoverBox").open = false;
        toast("🍾 Bouteille retrouvée ! Bon retour à bord 💙", 4000);
        setTimeout(() => $("#myBottle").scrollIntoView({ behavior: "smooth", block: "center" }), 300);
      } catch (ex) {
        err.textContent = ex.code === "http-404" ? "Ce code ne correspond à aucune bouteille 🧐 Vérifie les lettres et les chiffres." : ex.message;
      }
    });
  }

  function initStatsPage() {
    if (!STATS_PAGE) return;
    document.body.classList.add("is-stats-page");
    document.title = "Statistiques · " + document.title;
    $("#statsBar").hidden = false;
  }

  function renderFormState() {
    const open = votingOpen();
    // Une fois joué (ou bouteille retrouvée avec un code), plus de formulaire :
    // seulement ses réponses (« Ta bouteille ») et les courants de l'équipage
    const voted = hasVoted() && !auth.isAdmin;
    $("#predictionForm").hidden = !open || voted;
    $("#formIntro").hidden = !open;
    $("#ctaPredict").hidden = !open && !voted;
    $("#ctaPredict").textContent = voted ? "📜 Voir ma bouteille" : "🍾 Jeter ma bouteille à la mer";
    $("#recoverBox").hidden = !store.recover || auth.isAdmin || voted;
    const note = $("#closedNote");
    note.hidden = open;
    if (state.born) note.textContent = "⚓ Elle est arrivée ! Les pronostics sont fermés. Merci à tous les moussaillons.";
    else if (!state.open) note.textContent = "⚓ Les pronostics sont fermés : la marée est passée ! Merci à tous les moussaillons.";
    else if (deadlinePassed()) note.textContent = "⏳ Les votes sont clos depuis le " + fmtDateTime(state.deadline) + ". Rendez-vous à la naissance pour les résultats !";
    // L'intro rappelle le terme prévu pour aiguiller les joueurs
    const due = isNaN(parseDay(cfg.dueDate)) ? "" : fmtDay(cfg.dueDate, { year: "numeric" });
    const dueLine = due ? `🎯 Le terme est prévu le <b>${esc(due)}</b>. Sera-t-elle pile à l'heure, en avance ou en retard&nbsp;? ` : "";
    $("#formIntro").innerHTML = voted
      ? dueLine + "Ta bouteille est à la mer 💙 Voici ce que tu as joué. Les courants de l'équipage sont dévoilés juste en dessous&nbsp;!"
      : dueLine + "Remplis ton parchemin, glisse-le dans la bouteille, et à la naissance on découvrira qui avait vu juste. Pas de points, pas de pression : juste pour le plaisir&nbsp;! Les courants de l'équipage (les tendances anonymes) se dévoilent une fois que tu as joué.";
    $("#heroSub").textContent = state.born
      ? "Elle est arrivée ! Découvre qui a eu le meilleur flair 🏆"
      : "Une petite fille va bientôt rejoindre l'équipage." + (due ? " Le terme est prévu le " + due + " : devine quand elle pointera le bout de sa nageoire !" : " Devine quand elle pointera le bout de sa nageoire !");
  }

  /* ---------------- Tableau de bord du capitaine ---------------- */
  let dashSort = { key: "createdAt", dir: -1 };
  const DASH_COLS = [
    { key: "name", label: "Nom", get: (p) => p.name, show: (p) => `${esc(p.avatar)} ${esc(p.name)}` },
    { key: "code", label: "Code", get: (p) => p.code || "", show: (p) => (p.code ? `<button type="button" class="dash-code" data-code="${esc(p.code)}" title="Copier le code">${esc(p.code)}</button>` : "–") },
    { key: "date", label: "Date", get: (p) => p.date, show: (p) => esc(fmtDay(p.date, { weekday: "short" })) },
    { key: "time", label: "Heure", get: (p) => p.time, show: (p) => esc(fmtTime(p.time)) },
    { key: "weight", label: "Poids", get: (p) => p.weight, show: (p) => esc(fmtWeight(p.weight)) },
    { key: "height", label: "Taille", get: (p) => p.height, show: (p) => esc(fmtHeight(p.height)) },
    { key: "hair", label: "Cheveux", get: (p) => labelOf(HAIR, p.hair), show: (p) => esc(labelOf(HAIR, p.hair)) },
    { key: "looks", label: "Ressemble à", get: (p) => labelOf(LOOKS, p.looks), show: (p) => esc(labelOf(LOOKS, p.looks)) },
    { key: "papaWhere", label: "Papa", get: (p) => labelOf(WHERE, p.papaWhere), show: (p) => esc(labelOf(WHERE, p.papaWhere)) },
    { key: "mamanWhere", label: "Maman", get: (p) => labelOf(WHERE, p.mamanWhere), show: (p) => esc(labelOf(WHERE, p.mamanWhere)) },
    { key: "babyName", label: "Prénom", get: (p) => p.babyName || "", show: (p) => esc(p.babyName || "–") },
    { key: "message", label: "Mot doux", get: (p) => (msgFor(p.id) ? 1 : 0), show: (p) => (msgFor(p.id) ? `<span title="${esc(msgFor(p.id).text)}">💌</span>` : "–") },
    { key: "createdAt", label: "Reçu le", get: (p) => p.createdAt, show: (p) => esc(new Date(p.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) },
  ];
  const msgFor = (id) => messages.find((m) => m.id === id);

  function initDashboard() {
    document.querySelectorAll(".dash-tab").forEach((t) =>
      t.addEventListener("click", () => {
        document.querySelectorAll(".dash-tab").forEach((x) => x.setAttribute("aria-selected", String(x === t)));
        document.querySelectorAll(".dash-panel").forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
      })
    );
    $("#dashSearch").addEventListener("input", renderDashboard);
    $("#dashTable").addEventListener("click", (e) => {
      const th = e.target.closest("th[data-key]");
      if (th) {
        dashSort = { key: th.dataset.key, dir: dashSort.key === th.dataset.key ? -dashSort.dir : 1 };
        renderDashboard();
      }
    });
    $("#dashCsv").addEventListener("click", exportCsv);
    // Clic sur un code de bouteille : copié pour le renvoyer au joueur
    $("#dashTable").addEventListener("click", async (e) => {
      const b = e.target.closest(".dash-code");
      if (!b) return;
      try {
        await navigator.clipboard.writeText(b.dataset.code);
        toast("📋 Code copié : " + b.dataset.code);
      } catch (ex) {
        toast("🔑 Code : " + b.dataset.code, 6000);
      }
    });
  }

  function dashRows() {
    const q = norm($("#dashSearch").value);
    let list = allPreds.slice();
    // norm() ne garde que les lettres : pour les codes, on garde aussi les chiffres
    const qc = $("#dashSearch").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (q || qc) list = list.filter((p) => (q && norm(p.name).includes(q)) || (qc && String(p.code || "").replace(/-/g, "").includes(qc)));
    const col = DASH_COLS.find((c) => c.key === dashSort.key) || DASH_COLS[0];
    return list.sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      return (x > y ? 1 : x < y ? -1 : 0) * dashSort.dir;
    });
  }

  function renderDashboard() {
    const sec = $("#dashboard");
    $("#statsGate").hidden = !STATS_PAGE || auth.isAdmin;
    sec.hidden = !auth.isAdmin || !STATS_PAGE;
    if (sec.hidden) return;
    const n = allPreds.length;
    const status = state.born ? "🎉 Naissance annoncée" : !state.open ? "⚓ Votes fermés" : deadlinePassed() ? "⏳ Date limite passée" : state.deadline ? "🟢 Ouverts · encore " + fmtLeft(state.deadline - Date.now()) : "🟢 Ouverts, sans date limite";
    $("#dashKpis").innerHTML = `
      <div class="kpi"><span>Pronostics</span><b>${n}</b></div>
      <div class="kpi"><span>Appareils</span><b>${voters.length}</b></div>
      <div class="kpi"><span>Mots doux</span><b>${messages.length}</b></div>
      <div class="kpi kpi--wide"><span>Votes</span><b class="kpi__status">${esc(status)}</b></div>`;

    const cols = DASH_COLS.filter((c) => !c.bornOnly || state.born);
    const rows = dashRows();
    $("#dashTable").innerHTML = rows.length
      ? `<table><thead><tr>${cols.map((c) => `<th data-key="${c.key}" scope="col" aria-sort="${dashSort.key === c.key ? (dashSort.dir > 0 ? "ascending" : "descending") : "none"}">${c.label}${dashSort.key === c.key ? (dashSort.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
         <tbody>${rows.map((p) => `<tr>${cols.map((c) => `<td>${c.show(p)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : '<p class="empty">Aucun pronostic pour l\'instant.</p>';

    $("#dashStats").innerHTML = statsHtml(allPreds, true);

    const msgs = messages.slice().sort((a, b) => b.createdAt - a.createdAt);
    $("#dashMessages").innerHTML = msgs.length
      ? msgs.map((m) => `<figure class="note"><blockquote>${esc(m.text)}</blockquote><figcaption>${esc(m.avatar)} ${esc(m.name)} · ${esc(new Date(m.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))}</figcaption></figure>`).join("")
      : '<p class="empty">Pas encore de mot doux.</p>';
  }

  function exportCsv() {
    const cols = DASH_COLS.filter((c) => !c.bornOnly || state.born);
    const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const lines = [cols.map((c) => cell(c.label)).join(";")];
    dashRows().forEach((p) =>
      lines.push(cols.map((c) => {
        if (c.key === "message") return cell(msgFor(p.id) ? msgFor(p.id).text : "");
        if (c.key === "createdAt") return cell(new Date(p.createdAt).toLocaleString("fr-FR"));
        if (c.key === "date") return cell(p.date);
        return cell(c.get(p));
      }).join(";"))
    );
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pronostics-petite-sirene.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function renderAll() {
    renderFormState();
    renderMyBottle();
    renderTreasure();
    renderStats();
    renderMyMessages();
    renderDashboard();
    renderAdminList();
    renderDeadline();
  }

  /* ---------------- Abonnements aux données ----------------
     On n'écoute que ce que la personne a le droit de voir :
     les règles Firestore refuseraient de toute façon le reste. */
  const subs = {};
  function syncSubs() {
    const want = {};
    if (auth.uid) {
      want["mine:" + auth.uid] = () => store.watchMine(auth.uid, (l) => ((myPreds = l), syncSubs(), renderAll()), subError("mine:" + auth.uid));
      const mk = auth.isAdmin ? "msg:all" : "msg:" + auth.uid;
      want[mk] = () => store.watchMessages({ all: auth.isAdmin, uid: auth.uid }, (l) => ((messages = l), renderAll()), subError(mk));
    }
    if (canSeeAnswers()) want.answers = () => store.watchAnswers((l) => ((answers = l), renderAll()), subError("answers"));
    if (auth.isAdmin || state.born)
      want.preds = () => store.watchPredictions((l) => ((allPreds = l), renderAll()), subError("preds"));

    Object.keys(subs).forEach((k) => {
      if (!want[k]) {
        subs[k]();
        delete subs[k];
        if (k === "answers") answers = [];
        if (k === "preds") allPreds = [];
      }
    });
    Object.keys(want).forEach((k) => {
      if (subs[k]) return;
      // On réserve la place avant de s'abonner : en mode démo le premier
      // envoi est immédiat et rappelle syncSubs.
      let off = null;
      let cancelled = false;
      subs[k] = () => (off ? off() : (cancelled = true));
      off = want[k]();
      if (cancelled) off();
    });
  }
  function subError(key) {
    return (ex) => {
      console.warn("Abonnement " + key + " refusé :", ex && ex.message);
      if (subs[key]) {
        subs[key]();
        delete subs[key];
      }
      if (!(ex && ex.code === "permission-denied")) onError(ex);
    };
  }

  /* ---------------- Espace capitaine ---------------- */
  function initAdmin() {
    const modal = $("#adminModal");
    const fillSelect = (sel, items) => (sel.innerHTML = items.map((i) => `<option value="${i.id}">${esc(i.label)}</option>`).join(""));
    fillSelect($("#resultHair"), HAIR);
    fillSelect($("#resultLooks"), LOOKS);
    fillSelect($("#resultPapa"), WHERE);
    fillSelect($("#resultMaman"), WHERE);

    $("#adminOpen").addEventListener("click", () => {
      prefillAdmin();
      modal.showModal();
    });
    if (location.hash === "#capitaine") setTimeout(() => $("#adminOpen").click(), 300);
    $("#statsLogin").addEventListener("click", () => $("#adminOpen").click());
    // Liens vers les statistiques : on ferme la fenêtre puis on descend à la section
    modal.querySelectorAll("[data-close-admin]").forEach((link) =>
      link.addEventListener("click", (e) => {
        if (STATS_PAGE) return; // la page principale s'ouvre normalement
        e.preventDefault();
        modal.close();
        const target = $(link.getAttribute("href").replace(/^\//, ""));
        if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      })
    );

    store.onAuth((a) => {
      const changed = a.uid !== auth.uid || a.isAdmin !== auth.isAdmin;
      const uidChanged = a.uid !== auth.uid;
      auth = a;
      $("#adminLogin").hidden = a.isAdmin;
      $("#adminPanel").hidden = !a.isAdmin;
      $("#adminWho").textContent = "Connecté·e : " + (a.email || "");
      $("#loginError").textContent = a.email && !a.isAdmin ? "Ce compte n'est pas le capitaine de ce navire 🏴‍☠️" : "";
      if (changed) {
        if (uidChanged) myPreds = [];
        messages = [];
        syncSubs();
      }
      renderAll();
    });

    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      $("#loginError").textContent = "";
      try {
        await store.login(f.email.value.trim(), f.password.value);
        f.reset();
        if (store.mode === "demo") toast("⚓ Bienvenue à bord, capitaine ! (démo)");
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

    $("#settingsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const parents = f.parents.value.trim();
      const dueDate = f.dueDate.value;
      if (!parents) return void ($("#settingsStatus").textContent = "Indique le nom des parents.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return void ($("#settingsStatus").textContent = "Choisis la date du terme.");
      try {
        await store.setState({ parents, dueDate });
        $("#settingsStatus").textContent = "";
        toast("🐚 Infos du site mises à jour");
      } catch (ex) {
        $("#settingsStatus").textContent = "Erreur : " + ex.message;
      }
    });

    $("#deadlineForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = $("#deadlineInput").value;
      const ms = v ? new Date(v).getTime() : 0; // datetime-local = heure locale
      if (!ms) return void ($("#deadlineStatus").textContent = "Choisis une date et une heure.");
      try {
        await store.setState({ deadline: ms });
        toast("⏳ Fin des votes : " + fmtDateTime(ms));
        prefillAdmin();
      } catch (ex) {
        $("#deadlineStatus").textContent = "Erreur : " + ex.message;
      }
    });
    $("#deadlineClear").addEventListener("click", async () => {
      try {
        await store.setState({ deadline: 0 });
        $("#deadlineInput").value = "";
        toast("Plus de date limite");
        prefillAdmin();
      } catch (ex) {
        $("#deadlineStatus").textContent = "Erreur : " + ex.message;
      }
    });

    function readResult() {
      const f = $("#resultForm");
      const result = {
        date: f.date.value,
        time: f.time.value,
        weight: Number(f.weight.value),
        height: Number(f.height.value),
        hair: f.hair.value,
        looks: f.looks.value,
        papaWhere: f.papaWhere.value,
        mamanWhere: f.mamanWhere.value,
        babyName: f.babyName.value.trim(),
        note: f.note.value.trim(),
      };
      $("#resultError").textContent = "";
      if (!result.date || !result.time || !result.weight || !result.height) {
        $("#resultError").textContent = "Remplis la date, l'heure, le poids et la taille.";
        return null;
      }
      return result;
    }

    $("#resultForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const result = readResult();
      if (!result) return;
      if (!confirm("Annoncer la naissance à tout l'équipage ? Tout le monde verra le récapitulatif.")) return;
      try {
        await store.setState({ born: true, open: false, result });
        modal.close();
        confetti();
        setTimeout(() => $("#tresor").scrollIntoView({ behavior: "smooth" }), 300);
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

  function toLocalInput(ms) {
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }
  function prefillAdmin() {
    $("#openToggle").checked = !!state.open;
    $("#settingsForm").parents.value = cfg.parents || "";
    $("#settingsForm").dueDate.value = cfg.dueDate || "";
    $("#deadlineInput").value = state.deadline ? toLocalInput(state.deadline) : "";
    $("#deadlineStatus").textContent = state.deadline
      ? (deadlinePassed() ? "Votes clos depuis le " : "Les votes se fermeront le ") + fmtDateTime(state.deadline) + "."
      : "Aucune date limite : les votes restent ouverts jusqu'à ce que tu les fermes.";
    const r = state.result;
    if (!r) return;
    const f = $("#resultForm");
    ["date", "time", "weight", "height", "hair", "looks", "papaWhere", "mamanWhere", "babyName", "note"].forEach((k) => {
      if (r[k] != null) f[k].value = r[k];
    });
  }

  function renderAdminList() {
    const ul = $("#adminList");
    if (!ul || !auth.isAdmin) return;
    $("#openToggle").checked = !!state.open;
    ul.innerHTML = allPreds.length
      ? allPreds.map((p) => `<li><span>${esc(p.avatar)} ${esc(p.name)} — ${esc(fmtDay(p.date, { weekday: undefined }))}</span><button type="button" data-id="${esc(p.id)}" title="Supprimer">🗑️</button></li>`).join("")
      : "<li>Aucun pronostic.</li>";
    ul.querySelectorAll("button[data-id]").forEach((b) =>
      b.addEventListener("click", async () => {
        const p = allPreds.find((x) => x.id === b.dataset.id);
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
    toast("⚠️ Impossible de joindre l'océan (base de données). Réessaie dans un instant.", 6000);
  }

  initHeader();
  initStatsPage();
  initForm();
  initRecover();
  initBubbles();
  initSwimmers();
  initDepth();
  initDashboard();
  initAdmin();
  initEasterEggs();
  tick();
  setInterval(tick, 1000);

  store.ready.catch(onError);
  store.watchVoters((l) => {
    voters = l;
    syncSubs();
    renderAll();
  }, onError);
  store.onState((s) => {
    state = s;
    applySettings();
    syncSubs();
    renderAll();
  }, onError);
})();
