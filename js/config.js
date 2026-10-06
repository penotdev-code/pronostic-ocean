/* ==========================================================
   🐚  CONFIGURATION DU SITE — c'est le seul fichier à modifier
   ========================================================== */
window.OCEAN_CONFIG = {
  // Qui attend la petite sirène ?
  parents: "Papa & Maman",

  // Surnom affiché tant que le prénom est secret
  babyNickname: "notre petite sirène",

  // Date prévue de l'accouchement (format AAAA-MM-JJ)
  dueDate: "2026-11-20",

  // Faire deviner le prénom ? (mettre false si le prénom est déjà connu de tous)
  guessName: true,

  // Email du compte Firebase autorisé à saisir les résultats (le « capitaine »)
  adminEmail: "penot.dev@gmail.com",

  // Adresse de l'API du serveur maison (server/server.js), qui stocke les
  // pronostics sur le VPS. Mettre "" pour utiliser Firebase ou le mode démo.
  api: "/api",

  // Configuration Firebase (optionnelle, prioritaire si remplie ; console Firebase > Paramètres du projet > Vos applications > Web).
  // Si ce bloc est vide et `api` aussi, le site fonctionne en MODE DÉMO :
  // les pronostics sont enregistrés uniquement dans le navigateur.
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
  },
};
