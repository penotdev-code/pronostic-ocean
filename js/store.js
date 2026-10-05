/* ==========================================================
   🗄️  Stockage des pronostics
   - Firebase (Firestore + Auth) si configuré dans config.js
   - sinon le serveur maison (server/server.js) si `api` est défini
   - sinon mode démo : localStorage du navigateur

   Confidentialité (appliquée par les règles Firestore) :
   - predictions/{id} : le pronostic complet avec le nom. Lisible par
     son auteur et le capitaine, puis par tous après la naissance.
   - answers/{id}     : la copie anonyme (sans nom ni mot doux). Lisible
     seulement par ceux qui ont déjà joué, et par le capitaine.
   - messages/{id}    : le mot doux. Lisible par son auteur et le
     capitaine, jamais par les autres joueurs.
   - voters/{uid}     : « cet appareil a joué » (sert au compteur).
   ========================================================== */
(function () {
  const cfg = window.OCEAN_CONFIG || {};
  const FB_VERSION = "10.12.2";
  const hasFirebase = !!(cfg.firebase && cfg.firebase.apiKey && cfg.firebase.projectId);

  const DEFAULT_STATE = { open: true, born: false, result: null, deadline: 0 };
  // Champs recopiés dans la version anonyme
  const ANSWER_FIELDS = ["avatar", "date", "time", "weight", "height", "hair", "looks", "papaWhere", "mamanWhere", "babyName", "createdAt"];
  const pick = (o, keys) => keys.reduce((a, k) => (o[k] !== undefined && (a[k] = o[k]), a), {});

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Impossible de charger " + src));
      document.head.appendChild(s);
    });
  }

  /* ---------------- Mode démo (localStorage) ---------------- */
  function createLocalStore() {
    const read = (k, fallback) => {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    };
    const write = (k, v) => {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    };
    let uid = read("ocean.uid", null);
    if (!uid) {
      uid = "u" + Math.random().toString(36).slice(2, 10);
      write("ocean.uid", uid);
    }
    let predictions = read("ocean.predictions", []);
    let messages = read("ocean.messages", []);
    let state = Object.assign({}, DEFAULT_STATE, read("ocean.state", {}));
    let admin = false;
    try {
      admin = sessionStorage.getItem("ocean.demoAdmin") === "1";
    } catch (e) {}

    const subs = new Set();
    const emit = () => subs.forEach((s) => s());
    const watch = (fn) => {
      const s = () => fn();
      subs.add(s);
      s();
      return () => subs.delete(s);
    };
    const authCbs = [];
    const emitAuth = () => authCbs.forEach((cb) => cb({ isAdmin: admin, email: admin ? "capitaine (démo)" : null, uid }));

    return {
      mode: "demo",
      ready: Promise.resolve(),
      onAuth(cb) {
        authCbs.push(cb);
        cb({ isAdmin: admin, email: admin ? "capitaine (démo)" : null, uid });
      },
      onState(cb) {
        return watch(() => cb(Object.assign({}, state)));
      },
      watchVoters(cb) {
        return watch(() => cb([...new Set(predictions.map((p) => p.uid))]));
      },
      watchAnswers(cb) {
        return watch(() => cb(predictions.map((p) => Object.assign({ id: p.id }, pick(p, ANSWER_FIELDS)))));
      },
      watchPredictions(cb) {
        return watch(() => cb(predictions.slice()));
      },
      watchMine(myUid, cb) {
        return watch(() => cb(predictions.filter((p) => p.uid === myUid)));
      },
      watchMessages(opts, cb) {
        return watch(() => cb(opts.all ? messages.slice() : messages.filter((m) => m.uid === opts.uid)));
      },
      async addPrediction(p, message) {
        const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const createdAt = Date.now();
        predictions.push(Object.assign({}, p, { id, uid, createdAt }));
        if (message) messages.push({ id, uid, name: p.name, avatar: p.avatar, text: message, createdAt });
        write("ocean.predictions", predictions);
        write("ocean.messages", messages);
        emit();
        return id;
      },
      async deletePrediction(id) {
        predictions = predictions.filter((p) => p.id !== id);
        messages = messages.filter((m) => m.id !== id);
        write("ocean.predictions", predictions);
        write("ocean.messages", messages);
        emit();
      },
      async setState(patch) {
        state = Object.assign({}, state, patch);
        write("ocean.state", state);
        emit();
      },
      // En démo, n'importe quel email / mot de passe ouvre l'espace capitaine
      async login() {
        admin = true;
        try {
          sessionStorage.setItem("ocean.demoAdmin", "1");
        } catch (e) {}
        emitAuth();
      },
      async logout() {
        admin = false;
        try {
          sessionStorage.removeItem("ocean.demoAdmin");
        } catch (e) {}
        emitAuth();
      },
    };
  }

  /* ---------------- Firebase ---------------- */
  function createFirebaseStore() {
    let db, auth;
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
    const ready = loadScript(`${base}/firebase-app-compat.js`)
      .then(() =>
        Promise.all([
          loadScript(`${base}/firebase-firestore-compat.js`),
          loadScript(`${base}/firebase-auth-compat.js`),
        ])
      )
      .then(() => {
        firebase.initializeApp(cfg.firebase);
        db = firebase.firestore();
        auth = firebase.auth();
      });

    // Chaque visiteur reçoit une identité anonyme (sans compte) pour que
    // les règles sachent qui a déjà joué et à qui appartient quoi.
    const signedIn = ready.then(
      () =>
        new Promise((resolve, reject) => {
          const off = auth.onAuthStateChanged((u) => {
            if (u) {
              off();
              resolve(u);
            } else auth.signInAnonymously().catch(reject);
          });
        })
    );

    const docs = (snap) => snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    // Lance un abonnement une fois connecté, et renvoie de quoi l'arrêter
    function live(makeQuery, cb, onError, map = docs) {
      let off = null;
      let stopped = false;
      signedIn.then(() => {
        if (!stopped) off = makeQuery().onSnapshot((s) => cb(map(s)), onError);
      }, onError);
      return () => {
        stopped = true;
        if (off) off();
      };
    }

    return {
      mode: "firebase",
      ready: signedIn,
      onAuth(cb) {
        ready.then(() =>
          auth.onAuthStateChanged((u) => {
            if (!u) return auth.signInAnonymously();
            const email = u.email ? u.email.toLowerCase() : null;
            cb({ isAdmin: !!email && email === String(cfg.adminEmail || "").toLowerCase(), email, uid: u.uid });
          })
        );
      },
      onState(cb, onError) {
        return live(() => db.collection("meta").doc("state"), cb, onError, (doc) => Object.assign({}, DEFAULT_STATE, doc.exists ? doc.data() : {}));
      },
      watchVoters(cb, onError) {
        return live(() => db.collection("voters"), cb, onError, (s) => s.docs.map((d) => d.id));
      },
      watchAnswers(cb, onError) {
        return live(() => db.collection("answers"), cb, onError);
      },
      watchPredictions(cb, onError) {
        return live(() => db.collection("predictions"), cb, onError);
      },
      watchMine(uid, cb, onError) {
        return live(() => db.collection("predictions").where("uid", "==", uid), cb, onError);
      },
      watchMessages(opts, cb, onError) {
        return live(() => (opts.all ? db.collection("messages") : db.collection("messages").where("uid", "==", opts.uid)), cb, onError);
      },
      async addPrediction(p, message) {
        const u = await signedIn;
        const uid = auth.currentUser ? auth.currentUser.uid : u.uid;
        const ref = db.collection("predictions").doc();
        const full = Object.assign({}, p, { uid, createdAt: Date.now() });
        const batch = db.batch();
        batch.set(ref, full);
        batch.set(db.collection("answers").doc(ref.id), pick(full, ANSWER_FIELDS));
        if (message) {
          batch.set(db.collection("messages").doc(ref.id), { uid, name: p.name, avatar: p.avatar, text: message, createdAt: full.createdAt });
        }
        batch.set(db.collection("voters").doc(uid), { predictionId: ref.id });
        await batch.commit();
        return ref.id;
      },
      async deletePrediction(id) {
        await ready;
        const batch = db.batch();
        ["predictions", "answers", "messages"].forEach((c) => batch.delete(db.collection(c).doc(id)));
        await batch.commit();
      },
      async setState(patch) {
        await ready;
        await db.collection("meta").doc("state").set(patch, { merge: true });
      },
      async login(email, password) {
        await ready;
        await auth.signInWithEmailAndPassword(email, password);
      },
      async logout() {
        await ready;
        await auth.signOut(); // onAuth repasse automatiquement en anonyme
      },
    };
  }

  /* ---------------- Serveur maison (server/server.js) ---------------- */
  function createApiStore() {
    const base = String(cfg.api).replace(/\/$/, "");
    const POLL_MS = 3000;
    let snap = null;
    let etag = null;
    let me = null;
    let failing = false;
    const watchers = new Set();
    const authCbs = [];

    async function call(method, path, body) {
      const r = await fetch(base + path, {
        method,
        credentials: "same-origin",
        headers: body !== undefined ? { "Content-Type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = new Error(data.error || "Erreur " + r.status);
        e.code = r.status === 403 ? "permission-denied" : "http-" + r.status;
        throw e;
      }
      return data;
    }

    // Une seule requête légère toutes les 3 s : le serveur répond 304
    // tant que rien n'a changé.
    async function refresh() {
      const r = await fetch(base + "/snapshot", {
        credentials: "same-origin",
        cache: "no-store",
        headers: etag ? { "If-None-Match": etag } : {},
      });
      if (r.status === 304) return;
      if (!r.ok) throw new Error("Erreur " + r.status);
      etag = r.headers.get("ETag");
      snap = await r.json();
      const prev = me;
      me = snap.me;
      if (!prev || prev.uid !== me.uid || prev.isAdmin !== me.isAdmin) authCbs.forEach((cb) => cb(Object.assign({}, me)));
      watchers.forEach((w) => w.run());
    }

    function poll() {
      refresh().then(
        () => {
          failing = false;
          setTimeout(poll, POLL_MS);
        },
        (ex) => {
          if (!failing) watchers.forEach((w) => w.onError && w.onError(ex));
          failing = true;
          setTimeout(poll, POLL_MS * 3);
        }
      );
    }
    const ready = refresh();
    ready.then(() => setTimeout(poll, POLL_MS), () => setTimeout(poll, POLL_MS * 3));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh().catch(() => {});
    });

    // N'appelle cb que si la partie des données qui l'intéresse a changé
    function watch(select, cb, onError) {
      const w = {
        last: null,
        onError,
        run() {
          if (!snap) return;
          const v = select(snap);
          if (v === undefined) return;
          const key = JSON.stringify(v);
          if (key === w.last) return;
          w.last = key;
          cb(JSON.parse(key));
        },
      };
      watchers.add(w);
      w.run();
      return () => watchers.delete(w);
    }

    const write = async (method, path, body) => {
      const out = await call(method, path, body);
      await refresh().catch(() => {});
      return out;
    };

    return {
      mode: "api",
      ready,
      onAuth(cb) {
        authCbs.push(cb);
        if (me) cb(Object.assign({}, me));
      },
      onState(cb, onError) {
        return watch((s) => Object.assign({}, DEFAULT_STATE, s.state), cb, onError);
      },
      watchVoters(cb, onError) {
        return watch((s) => s.voters, cb, onError);
      },
      watchAnswers(cb, onError) {
        return watch((s) => s.answers, cb, onError);
      },
      watchPredictions(cb, onError) {
        return watch((s) => s.predictions, cb, onError);
      },
      watchMine(uid, cb, onError) {
        return watch((s) => s.mine, cb, onError);
      },
      watchMessages(opts, cb, onError) {
        return watch((s) => s.messages, cb, onError);
      },
      async addPrediction(p, message) {
        return (await write("POST", "/predictions", { prediction: p, message })).id;
      },
      async deletePrediction(id) {
        await write("DELETE", "/predictions/" + encodeURIComponent(id));
      },
      async setState(patch) {
        await write("PATCH", "/state", patch);
      },
      async login(email, password) {
        await write("POST", "/login", { email, password });
      },
      async logout() {
        await write("POST", "/logout", {});
      },
    };
  }

  window.OceanStore = hasFirebase ? createFirebaseStore() : cfg.api ? createApiStore() : createLocalStore();
})();
