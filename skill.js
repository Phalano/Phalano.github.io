/* ==========================================================================
   SKILLS.JS : toutes les DONNÉES du jeu (aucune logique ici)

   COMMENT AJOUTER UNE COMPÉTENCE
   1. Copiez une ligne dans la liste SKILLS (plus bas).
   2. Donnez-lui un `id` unique, une voie (`branch`), un coût, une position
      `at: [décalage, rangée]` et ses `parents`.
   3. Décrivez ses effets dans `fx`, avec les noms définis dans STATS.
   4. (Facultatif) `unlocks` débloque un jeu du casino ou une mécanique
      (voir GAMES et FEATURES).
   C’est tout : le bouton, les lignes et les effets sont créés automatiquement.

   Les erreurs courantes (id en double, parent inconnu, effet inconnu…)
   sont signalées dans la console du navigateur (touche F12).
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. VOIES
   Les voies s’excluent : acheter le premier nœud d’une voie ferme les autres.
   `col` = colonne centrale de la voie dans l’arbre.
   Pour ajouter une voie : ajoutez une ligne ici, puis des compétences
   avec `branch: 'nom_de_la_voie'`.
   -------------------------------------------------------------------------- */
const BRANCHES = {
  click:  { label: 'Clic',       col: 0.5 },
  casino: { label: 'Casino',     col: 3   },
  idle:   { label: 'Production', col: 5.5 },
};


/* --------------------------------------------------------------------------
   2. STATISTIQUES
   Chaque nom utilisable dans `fx`.
     base : valeur de départ
     mode : 'add'      → les bonus s’additionnent
            'multiply' → les bonus se multiplient
   Pour créer une nouvelle statistique : ajoutez-la ici, puis utilisez-la
   dans le code du jeu (script.js) là où elle doit avoir un effet.
   -------------------------------------------------------------------------- */
const STATS = {
  clickAdd: { base: 1, mode: 'add'      },  // unités par clic (bonus fixe)
  clickMul: { base: 1, mode: 'multiply' },  // multiplicateur des clics
  secAdd:   { base: 0, mode: 'add'      },  // unités par seconde (bonus fixe)
  secMul:   { base: 1, mode: 'multiply' },  // multiplicateur de la production
  allMul:   { base: 1, mode: 'multiply' },  // multiplicateur clics + production
  limit:    { base: 1, mode: 'multiply' },  // multiplicateur de la mise maximale
  luck:     { base: 0, mode: 'add'      },  // chances de gagner au casino (0.25 = +25 %)
  jackpot:  { base: 1, mode: 'multiply' },  // multiplicateur des gains du casino
};


/* --------------------------------------------------------------------------
   3. MÉCANIQUES DÉBLOQUABLES
   Chaque mécanique est activée par une compétence avec `unlocks: ['nom']`.

   charge : « Clic chargé » : maintenir le bouton principal multiplie le clic.
     fullSeconds     durée de maintien pour la charge maximale
     fullMultiplier  multiplicateur à la charge maximale
                     (ex. 3 s maintenues = ×5 ; entre les deux, c’est progressif)
     minSeconds      en dessous de cette durée, c’est un clic normal (×1)

   boost : une icône bonus apparaît au hasard ; la cliquer lance un effet
           aléatoire sur la production par seconde.
     spawnEverySeconds     délai entre deux apparitions de l’icône
     iconLifetimeSeconds   durée pendant laquelle l’icône reste cliquable
     icon                  symbole affiché
     effects               liste des effets possibles :
                           { multiplier, seconds, weight (facultatif : fréquence relative) }
   -------------------------------------------------------------------------- */
const FEATURES = {
  charge: {
    fullSeconds: 1,
    fullMultiplier: 15,
    minSeconds: 0.5,
    message: 'Clic chargé débloqué : maintenez le bouton enfoncé pour multiplier votre clic.',
  },

  boost: {
    spawnEverySeconds: 120,
    iconLifetimeSeconds: 20,
    icon: '⚡',
    effects: [
      { multiplier: 7,  seconds: 70 },
      { multiplier: 14, seconds: 35 },
      { multiplier: 35, seconds: 14 },
      { multiplier: 77, seconds: 7  },
    ],
    message: 'Surtension débloquée : une icône bonus va apparaître. Cliquez dessus !',
  },
};


/* --------------------------------------------------------------------------
   4. COMPÉTENCES
   id       identifiant unique
   branch   voie (voir BRANCHES) ; absent pour le nœud de départ
   name     titre affiché
   desc     description courte
   cost     prix en unités
   at       [décalage horizontal par rapport à la colonne de la voie, rangée]
   parents  compétences à acheter avant (toutes sont requises)
   fx       effets : { nomDeStat: valeur }
   unlocks  jeux du casino ou mécaniques débloqués (voir GAMES et FEATURES)
   -------------------------------------------------------------------------- */
const SKILLS = [
  // ---- Départ ----
  { id: 'root', name: 'Unité mère', desc: 'Point de départ. Choisissez une voie.',
    cost: 0, at: [3, 0], parents: [] },

  // ---- Voie CLIC : les unités par clic explosent ----
  { id: 'fil', branch: 'click', name: 'Filaments',     desc: '+1 par clic.',
    cost: 15,     at: [ 0,   1], parents: ['root'],      fx: { clickAdd: 1 } },
  { id: 'pre', branch: 'click', name: 'Pression',      desc: '+5 par clic.',
    cost: 100,    at: [-0.5, 2], parents: ['fil'],       fx: { clickAdd: 5 } },
  { id: 'clu', branch: 'click', name: 'Amas',          desc: 'Clics ×2.',
    cost: 400,    at: [ 0.5, 2], parents: ['fil'],       fx: { clickMul: 2 } },
  { id: 'res', branch: 'click', name: 'Résonance',     desc: 'Clics ×3.',
    cost: 4000,   at: [ 0,   3], parents: ['chg'], fx: { clickMul: 3 } },
  { id: 'mar', branch: 'click', name: 'Marteau-pilon', desc: '+100 par clic.',
    cost: 20000,  at: [ 0,   4], parents: ['res'],       fx: { clickAdd: 100 } },
  { id: 'tit', branch: 'click', name: 'Titan',         desc: 'Clics ×5.',
    cost: 150000, at: [ 0,   5], parents: ['mar'],       fx: { clickMul: 5 } },

  { id: 'chg', branch: 'click', name: 'Clic chargé',    desc: `Maintenir le bouton : ×${FEATURES.charge.fullMultiplier} après ${FEATURES.charge.fullSeconds} s.`,
    cost: 2000,   at: [ 1,   3], parents: ['pre', 'clu'], unlocks: ['charge'] },

  // ---- Voie CASINO : on mise des unités, le hasard décide ----
  { id: 'gbl', branch: 'casino', name: 'Casino',            desc: 'Pile ou face, ×2.',
    cost: 20,    at: [ 0,   1], parents: ['root'],       unlocks: ['coin'] },
  { id: 'rlt', branch: 'casino', name: 'Roulette',          desc: 'Rouge ou noir ×2, vert ×35.',
    cost: 200,   at: [-0.5, 2], parents: ['gbl'],        unlocks: ['roulette'] },
  { id: 'vip', branch: 'casino', name: 'Client VIP',         desc: 'Mise maximale doublée (1/10 de vos unités).',
    cost: 3000,  at: [-0.5, 3], parents: ['rlt'],        fx: { limit: 2 } },
  { id: 'lu1', branch: 'casino', name: 'Trèfle',            desc: 'Chances de gagner +12 %.',
    cost: 500,   at: [ 0.5, 2], parents: ['gbl'],        fx: { luck: 0.12 } },
  { id: 'lu2', branch: 'casino', name: 'Corruption', desc: '+25% de chance',
    cost: 5000,  at: [ 0.5, 3], parents: ['lu1'],        fx: { luck: 0.25 } },
  { id: 'jac', branch: 'casino', name: 'Jackpot',           desc: 'Multiplication des gain par 1.5.',
    cost: 20000, at: [ 0,   4], parents: ['vip', 'lu2'], fx: { jackpot: 1.5 } },

  // ---- Voie PRODUCTION : génération par seconde ----
  { id: 'gen', branch: 'idle', name: 'Générateur', desc: '+1 par seconde.',
    cost: 15,    at: [ 0,   1], parents: ['root'],       fx: { secAdd: 1 } },
  { id: 'g2',  branch: 'idle', name: 'Chaîne',     desc: '+7 par seconde.',
    cost: 100,   at: [-0.5, 2], parents: ['gen'],        fx: { secAdd: 7 } },
  { id: 'g3',  branch: 'idle', name: 'Surcharge',  desc: 'Production ×4.',
    cost: 500,   at: [ 0.5, 2], parents: ['gen'],        fx: { secMul: 4 } },
  { id: 'g4',  branch: 'idle', name: 'Usine',      desc: '+50 par seconde.',
    cost: 4000,  at: [ 0,   3], parents: ['g2', 'g3'],   fx: { secAdd: 50 } },
  { id: 'g5',  branch: 'idle', name: 'Réseau',     desc: 'Production ×3.',
    cost: 300000, at: [ 0,   4], parents: ['g4'],         fx: { secMul: 3 } },
  { id: 'bst', branch: 'idle', name: 'Surtension', desc: `Toutes les ${FEATURES.boost.spawnEverySeconds / 60} min, une icône bonus apparaît.`,
    cost: 5000,  at: [ 1.5, 3], parents: ['g2', 'g3'],   unlocks: ['boost'] },
];


/* --------------------------------------------------------------------------
   5. JEUX DU CASINO
   Un jeu apparaît quand une compétence l’a débloqué (champ `unlocks`).
     label    nom affiché
     chance   probabilité de gagner de base (0.5 = une chance sur deux)
     payout   multiplicateur de la mise en cas de gain
     choices  (facultatif) plusieurs paris possibles dans un même jeu.
              Chaque choix a sa propre chance et son propre gain :
              { key, label, chance, payout, color }  (color = couleur du bouton)
              Dans ce cas, `chance` et `payout` du jeu ne servent plus.
     roll     fonction qui renvoie le texte du résultat : (gagné, choix) => texte
              `choix` est la `key` du pari ('main' si le jeu n’a pas de choix)
   -------------------------------------------------------------------------- */

// Roulette : numéros rouges (les autres sont noirs, sauf le 0 qui est vert)
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const COLOR_NAMES = { green: 'vert', red: 'rouge', black: 'noir' };

function rouletteColor(number) {
  if (number === 0) return 'green';
  return RED_NUMBERS.includes(number) ? 'red' : 'black';
}

const GAMES = {
  coin: {
    label: 'Pile ou face',
    chance: 1 / 2,
    payout: 2,
    roll: (win) => (win ? 'Pile' : 'Face'),
  },

  roulette: {
    label: 'Roulette',
    choices: [
      { key: 'green', label: 'Vert',  chance: 1 / 37,  payout: 35, color: '#2e7d4f' },
      { key: 'red',   label: 'Rouge', chance: 18 / 37, payout: 2,  color: '#b3261e' },
      { key: 'black', label: 'Noir',  chance: 18 / 37, payout: 2,  color: '#25211f' },
    ],
    // Le résultat est tiré après coup : un numéro de la couleur choisie si on gagne,
    // d’une autre couleur si on perd.
    roll: (win, choice) => {
      const numbers = Array.from({ length: 37 }, (_, n) => n);
      const candidates = numbers.filter((n) => (rouletteColor(n) === choice) === win);
      const drawn = candidates[Math.floor(Math.random() * candidates.length)];
      return `Le ${drawn} ${COLOR_NAMES[rouletteColor(drawn)]} sort`;
    },
  },
};
