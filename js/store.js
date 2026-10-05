/* ==========================================================
   🗄️  Stockage des pronostics
   - Firebase (Firestore + Auth) si configuré dans config.js
   - sinon mode démo : localStorage du navigateur
   ========================================================== */
(function () {
  const cfg = window.OCEAN_CONFIG || {};
  const FB_VERSION = "10.12.2";
  const hasFirebase = !!(cfg.firebase && cfg.firebase.apiKey && cfg.firebase.projectId);

  const DEFAULT_STATE = { open: true, born: false, result: null };

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
    const KEY_P = "ocean.predictions";
    const KEY_S = "ocean.state";
    const listeners = { predictions: [], state: [] };

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
      } catch (e) {
        /* stockage indisponible : tant pis, on garde en mémoire */
      }
    };
    let predictions = read(KEY_P, []);
    let state = Object.assign({}, DEFAULT_STATE, read(KEY_S, {}));

    const emitP = () => listeners.predictions.forEach((cb) => cb(predictions.slice()));
    const emitS = () => listeners.state.forEach((cb) => cb(Object.assign({}, state)));

    return {
      mode: "demo",
      ready: Promise.resolve(),
      onPredictions(cb) {
        listeners.predictions.push(cb);
        cb(predictions.slice());
      },
      onState(cb) {
        listeners.state.push(cb);
        cb(Object.assign({}, state));
      },
      async addPrediction(p) {
        const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        predictions.push(Object.assign({ id, createdAt: Date.now() }, p));
        write(KEY_P, predictions);
        emitP();
        return id;
      },
      async deletePrediction(id) {
        predictions = predictions.filter((p) => p.id !== id);
        write(KEY_P, predictions);
        emitP();
      },
      async setState(patch) {
        state = Object.assign({}, state, patch);
        write(KEY_S, state);
        emitS();
      },
      // En mode démo, tout le monde est capitaine
      onAuth(cb) {
        cb({ isAdmin: true, email: "démo" });
      },
      async login() {},
      async logout() {},
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

    return {
      mode: "firebase",
      ready,
      onPredictions(cb, onError) {
        ready.then(() =>
          db
            .collection("predictions")
            .orderBy("createdAt", "asc")
            .onSnapshot(
              (snap) => cb(snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))),
              onError
            )
        );
      },
      onState(cb, onError) {
        ready.then(() =>
          db
            .collection("meta")
            .doc("state")
            .onSnapshot(
              (doc) => cb(Object.assign({}, DEFAULT_STATE, doc.exists ? doc.data() : {})),
              onError
            )
        );
      },
      async addPrediction(p) {
        await ready;
        const ref = await db
          .collection("predictions")
          .add(Object.assign({}, p, { createdAt: Date.now() }));
        return ref.id;
      },
      async deletePrediction(id) {
        await ready;
        await db.collection("predictions").doc(id).delete();
      },
      async setState(patch) {
        await ready;
        await db.collection("meta").doc("state").set(patch, { merge: true });
      },
      onAuth(cb) {
        ready.then(() =>
          auth.onAuthStateChanged((u) => {
            const email = u && u.email ? u.email.toLowerCase() : null;
            cb({
              isAdmin: !!email && email === String(cfg.adminEmail || "").toLowerCase(),
              email,
            });
          })
        );
      },
      async login(email, password) {
        await ready;
        await auth.signInWithEmailAndPassword(email, password);
      },
      async logout() {
        await ready;
        await auth.signOut();
      },
    };
  }

  window.OceanStore = hasFirebase ? createFirebaseStore() : createLocalStore();
})();
