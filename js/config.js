/* ==========================================================
   🐚  CONFIGURATION DU SITE — c'est le seul fichier à modifier
   ========================================================== */
window.OCEAN_CONFIG = {
  // Qui attend la petite sirène ?
  parents: "Papa & Maman",

  // Surnom affiché tant que le prénom est secret
  babyNickname: "notre petite sirène",

  // Date prévue de l'accouchement (format AAAA-MM-JJ)
  dueDate: "2026-12-01",

  // Faire deviner le prénom ? (mettre false si le prénom est déjà connu de tous)
  guessName: true,

  // Email du compte Firebase autorisé à saisir les résultats (le « capitaine »)
  adminEmail: "penot.dev@gmail.com",

  // Configuration Firebase (console Firebase > Paramètres du projet > Vos applications > Web).
  // Tant que ce bloc est vide, le site fonctionne en MODE DÉMO :
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
