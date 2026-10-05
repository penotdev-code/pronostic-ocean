/* ==========================================================
   🎬 Le grand reveal de la naissance
   Une révélation étape par étape : chaque info est dévoilée
   avec roulement de tambour, puis le classement remonte
   du dernier au premier, et enfin les trophées.
   ========================================================== */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  let ctx, steps, idx, overlay, runId = 0, skip = null, fast = false;

  /* Attend `ms`, sauf si l'utilisateur a cliqué pour passer l'animation de l'étape */
  function pause(ms) {
    return new Promise((resolve) => {
      if (fast) return resolve();
      const t = setTimeout(done, reduced() ? Math.min(ms, 150) : ms);
      const skipper = () => {
        fast = true;
        done();
      };
      function done() {
        clearTimeout(t);
        if (skip === skipper) skip = null;
        resolve();
      }
      skip = skipper;
    });
  }

  /* ---------------- Construction des étapes ---------------- */
  function closest(list, diffFn) {
    let best = Infinity;
    let winners = [];
    list.forEach((p) => {
      const d = diffFn(p);
      if (isNaN(d)) return;
      if (d < best) {
        best = d;
        winners = [p];
      } else if (d === best) winners.push(p);
    });
    return { best, winners };
  }
  function names(list, max = 4) {
    const e = ctx.esc;
    const shown = list.slice(0, max).map((p) => `<b>${e(p.avatar)} ${e(p.name)}</b>`);
    const rest = list.length - shown.length;
    if (rest > 0) shown.push(`${rest} autre${rest > 1 ? "s" : ""}`);
    return shown.length > 1 ? shown.slice(0, -1).join(", ") + " et " + shown[shown.length - 1] : shown[0] || "";
  }
  function closestLine(c, fmtDiff, exactWord) {
    if (!c.winners.length) return "";
    if (c.best === 0) return `🎯 ${exactWord} : ${names(c.winners)} ${c.winners.length > 1 ? "avaient" : "avait"} vu juste !`;
    return `🥇 Le plus proche : ${names(c.winners)} (${fmtDiff(c.best)})`;
  }
  function matchLine(list, key, value) {
    const ok = list.filter((p) => p[key] === value);
    if (!ok.length) return "😮 Personne ne l'avait vu venir !";
    return `✅ ${ok.length} sur ${list.length} : ${names(ok)}`;
  }

  function buildSteps() {
    const r = ctx.result;
    const list = ctx.predictions;
    const D = ctx.diff;
    const s = [{ type: "intro" }];
    if (!list.length) {
      s.push({ type: "facts" }, { type: "end" });
      return s;
    }
    s.push({
      type: "fact", icon: "📅", title: "Elle est née le…",
      value: ctx.fmtDay(r.date, { year: "numeric" }),
      sub: closestLine(closest(list, (p) => D.days(p, r)), (d) => `à ${d} jour${d > 1 ? "s" : ""} près`, "Pile le bon jour"),
    });
    s.push({
      type: "fact", icon: "🕰️", title: "À exactement…",
      value: ctx.fmtTime(r.time),
      sub: closestLine(closest(list, (p) => D.minutes(p, r)), (m) => "à " + ctx.fmtDuration(m) + " près", "À la minute près"),
    });
    s.push({
      type: "fact", icon: "⚖️", title: "Sur la balance…",
      value: ctx.fmtWeight(r.weight),
      sub: closestLine(closest(list, (p) => D.grams(p, r)), (g) => `à ${g} g près`, "Au gramme près"),
    });
    s.push({
      type: "fact", icon: "📏", title: "Et elle mesure…",
      value: ctx.fmtHeight(r.height),
      sub: closestLine(closest(list, (p) => D.cm(p, r)), (c) => `à ${String(c).replace(".", ",")} cm près`, "Au millimètre"),
    });
    s.push({ type: "fact", icon: "💇", title: "Côté cheveux…", value: ctx.labelOf(ctx.HAIR, r.hair), sub: matchLine(list, "hair", r.hair) });
    s.push({ type: "fact", icon: "🪞", title: "Elle ressemble à…", value: ctx.labelOf(ctx.LOOKS, r.looks), sub: matchLine(list, "looks", r.looks) });
    if (r.papaWhere) s.push({ type: "fact", icon: "👨", title: "Au début du travail, papa était…", value: ctx.labelOf(ctx.WHERE, r.papaWhere), sub: matchLine(list, "papaWhere", r.papaWhere) });
    if (r.mamanWhere) s.push({ type: "fact", icon: "👩", title: "Et maman était…", value: ctx.labelOf(ctx.WHERE, r.mamanWhere), sub: matchLine(list, "mamanWhere", r.mamanWhere) });
    if (ctx.guessName && r.babyName) {
      const ok = list.filter((p) => ctx.norm(p.babyName) && ctx.norm(p.babyName) === ctx.norm(r.babyName));
      s.push({
        type: "name", icon: "✨", title: "Et son prénom est…", value: r.babyName,
        sub: ok.length ? `🔮 ${names(ok)} ${ok.length > 1 ? "l'avaient" : "l'avait"} deviné !` : "🤫 Le secret était bien gardé : personne n'avait trouvé !",
      });
    }
    s.push({ type: "ranking" }, { type: "trophies" }, { type: "end" });
    return s;
  }

  /* ---------------- Rendu ---------------- */
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "reveal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Révélation de la naissance");
    overlay.innerHTML = `
      <div class="reveal__bg" aria-hidden="true"></div>
      <button class="reveal__close" type="button" aria-label="Fermer">✕</button>
      <div class="reveal__progress"><div class="reveal__progress-fill"></div></div>
      <div class="reveal__stage" aria-live="polite"></div>
      <div class="reveal__nav">
        <button class="btn btn--ghost reveal__prev" type="button">← Retour</button>
        <button class="btn btn--coral reveal__next" type="button">Suivant →</button>
      </div>`;
    document.body.appendChild(overlay);
    $(".reveal__close", overlay).addEventListener("click", close);
    $(".reveal__next", overlay).addEventListener("click", next);
    $(".reveal__prev", overlay).addEventListener("click", () => go(idx - 1));
    $(".reveal__stage", overlay).addEventListener("click", () => skip && skip());
    document.addEventListener("keydown", (e) => {
      if (!overlay.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") go(idx - 1);
    });
    return overlay;
  }

  function next() {
    if (skip) return skip(); // termine l'animation en cours
    if (idx < steps.length - 1) go(idx + 1);
    else close();
  }

  function setNav(label, showPrev = true) {
    $(".reveal__next", overlay).textContent = label;
    $(".reveal__prev", overlay).style.visibility = showPrev && idx > 0 ? "visible" : "hidden";
  }

  async function go(i) {
    if (i < 0 || i >= steps.length) return;
    idx = i;
    const my = ++runId;
    skip = null;
    fast = false;
    const step = steps[i];
    const stage = $(".reveal__stage", overlay);
    $(".reveal__progress-fill", overlay).style.width = (i / (steps.length - 1)) * 100 + "%";
    stage.classList.remove("is-in");
    void stage.offsetWidth;
    stage.classList.add("is-in");
    const alive = () => my === runId && overlay.classList.contains("is-open");
    await RENDER[step.type](stage, step, alive);
  }

  const RENDER = {
    async intro(stage) {
      stage.innerHTML = `
        <div class="reveal__bottle" aria-hidden="true">🍾</div>
        <p class="reveal__kicker">Message urgent pour tout l'équipage</p>
        <h2 class="reveal__title">Une bouteille vient d'échouer sur la plage…</h2>
        <p class="reveal__text">Elle contient des nouvelles de <b>${ctx.esc(ctx.nickname)}</b>. Prêt·e à découvrir qui avait le meilleur flair ?</p>`;
      setNav("🍾 Ouvrir la bouteille", false);
    },

    async fact(stage, step, alive) {
      stage.innerHTML = `
        <div class="reveal__icon" aria-hidden="true">${step.icon}</div>
        <h2 class="reveal__title">${ctx.esc(step.title)}</h2>
        <div class="reveal__drum" aria-hidden="true">🥁</div>
        <p class="reveal__value" hidden>${ctx.esc(step.value)}</p>
        <p class="reveal__sub" hidden>${step.sub}</p>`;
      setNav("Suivant →");
      await pause(1600);
      if (!alive()) return;
      $(".reveal__drum", stage).hidden = true;
      $(".reveal__value", stage).hidden = false;
      ctx.confetti(["🫧", "⭐", "🐚"], 18);
      await pause(700);
      if (!alive()) return;
      $(".reveal__sub", stage).hidden = false;
    },

    async name(stage, step, alive) {
      stage.innerHTML = `
        <div class="reveal__icon" aria-hidden="true">${step.icon}</div>
        <h2 class="reveal__title">${ctx.esc(step.title)}</h2>
        <div class="reveal__drum" aria-hidden="true">🥁</div>
        <p class="reveal__value reveal__value--name" aria-label="${ctx.esc(step.value)}"></p>
        <p class="reveal__sub" hidden>${step.sub}</p>`;
      setNav("Suivant →");
      await pause(2200);
      if (!alive()) return;
      $(".reveal__drum", stage).hidden = true;
      const box = $(".reveal__value", stage);
      for (const ch of Array.from(step.value)) {
        const sp = document.createElement("span");
        sp.className = "reveal__letter";
        sp.textContent = ch === " " ? " " : ch;
        box.appendChild(sp);
        await pause(260);
        if (!alive()) return;
      }
      ctx.confetti(["💖", "🧜‍♀️", "🐚", "✨", "🌸"], 70);
      await pause(800);
      if (!alive()) return;
      $(".reveal__sub", stage).hidden = false;
    },

    async facts(stage) {
      stage.innerHTML = `<h2 class="reveal__title">Bienvenue petite sirène ! 🧜‍♀️</h2><p class="reveal__text">Aucun pronostic n'avait été lancé… mais tout l'équipage est heureux de t'accueillir.</p>`;
      setNav("Suivant →");
    },

    async ranking(stage, step, alive) {
      const list = ctx.ranked;
      stage.innerHTML = `
        <h2 class="reveal__title">🏆 Le classement final</h2>
        <p class="reveal__text">Du fond des abysses jusqu'à la surface…</p>
        <ol class="reveal__rank"></ol>`;
      setNav("Suivant →");
      const ol = $(".reveal__rank", stage);
      const row = (p) => {
        const li = document.createElement("li");
        li.className = "reveal__row" + (p.rank <= 3 ? " reveal__row--top r" + p.rank : "") + (ctx.mine.includes(p.id) ? " is-mine" : "");
        li.innerHTML = `<span class="reveal__pos">${ctx.medal(p.rank)}</span><span class="reveal__who">${ctx.esc(p.avatar)} ${ctx.esc(p.name)}</span><span class="reveal__pts">${p.score.total} pts</span>`;
        ol.prepend(li);
        return li;
      };
      const rest = list.filter((p) => p.rank > 3).reverse();
      const gap = Math.max(60, Math.min(380, 3500 / Math.max(1, rest.length)));
      for (const p of rest) {
        row(p);
        await pause(gap);
        if (!alive()) return;
      }
      for (const r of [3, 2, 1]) {
        const group = list.filter((p) => p.rank === r);
        if (!group.length) continue;
        const drum = document.createElement("li");
        drum.className = "reveal__row reveal__row--drum";
        drum.textContent = `🥁 ${ctx.medal(r)} …`;
        ol.prepend(drum);
        await pause(r === 1 ? 2200 : 1400);
        drum.remove();
        if (!alive()) return;
        group.slice().reverse().forEach(row);
        ctx.confetti(r === 1 ? ["🏆", "👑", "⭐", "🐚", "💎"] : ["⭐", "🫧"], r === 1 ? 80 : 20);
        await pause(500);
        if (!alive()) return;
      }
    },

    async trophies(stage) {
      stage.innerHTML = `
        <h2 class="reveal__title">🎖️ Les trophées des abysses</h2>
        <div class="trophies trophies--reveal">${ctx.trophiesHtml()}</div>`;
      setNav("Suivant →");
    },

    async end(stage) {
      stage.innerHTML = `
        <div class="reveal__icon" aria-hidden="true">🧜‍♀️</div>
        <h2 class="reveal__title">Merci à tout l'équipage !</h2>
        <p class="reveal__text">Retrouve ton score détaillé et celui de chaque moussaillon juste en dessous.</p>`;
      setNav("Voir le classement détaillé ⚓");
      ctx.confetti();
    },
  };

  function close() {
    if (!overlay) return;
    runId++;
    skip = null;
    overlay.classList.remove("is-open");
    document.body.classList.remove("is-revealing");
    if (ctx && ctx.onClose) ctx.onClose();
  }

  window.OceanReveal = {
    start(c) {
      ctx = c;
      steps = buildSteps();
      ensureOverlay();
      overlay.classList.add("is-open");
      document.body.classList.add("is-revealing");
      go(0);
      $(".reveal__next", overlay).focus();
    },
    close,
  };
})();
