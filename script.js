/* ==========================================================================
   SCRIPT.JS : moteur du jeu
   Pour ajouter du contenu (compétences, voies, jeux), modifiez skills.js.
   Ce fichier n’a besoin d’être touché que pour changer le fonctionnement.

   Sommaire
     1. Réglages
     2. Outils
     3. Préparation des compétences
     4. Statistiques
     5. Règles de l’arbre
     6. Achat
     7. Casino
     8. Mécaniques débloquables (clic chargé, bonus)
     9. Affichage
    10. Boucle de jeu
    11. Sauvegarde, boutons et démarrage
   ========================================================================== */


/* ===== 1. Réglages ======================================================= */

const SAVE_KEY = 'skill_tree-save-v1';
const OFFLINE_MAX_SECONDS = 8 * 3600;   // gain hors-ligne plafonné à 8 h
const CONFIRM_DELAY_MS = 3000;          // délai pour confirmer un choix de voie
const MAX_WIN_CHANCE = 0.95;            // les chances de gain ne dépassent jamais 95 %
const MAX_BET_RATIO = 1 / 20;           // mise maximale = 1/20 des unités possédées
const TICK_MS = 100;                    // fréquence de la boucle de jeu
const AUTOSAVE_MS = 5000;               // sauvegarde automatique toutes les 5 s

// Dimensions de la grille de l’arbre (en pixels)
const LAYOUT = { cellX: 170, cellY: 125, nodeW: 150, nodeH: 110, pad: 15 };


/* ===== 2. Outils ========================================================= */

const $ = (id) => document.getElementById(id);

function formatNumber(n) {
  if (n < 1000) {
    const isSmallDecimal = n < 10 && n % 1 !== 0;
    return isSmallDecimal ? n.toFixed(1).replace('.', ',') : String(Math.floor(n));
  }
  const units = ['k', 'M', 'Md', 'B', 'Bd'];
  let i = -1;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return n.toFixed(2).replace('.', ',') + ' ' + units[i];
}

function newGameState() {
  return { unites: 0, owned: { root: true }, branch: null, saved: Date.now() };
}

let state = newGameState();


/* ===== 3. Préparation des compétences ==================================== */

const SKILL_BY_ID = Object.fromEntries(SKILLS.map((skill) => [skill.id, skill]));

// Complète chaque compétence : valeurs par défaut, position, « choix de voie »
function prepareSkills() {
  for (const skill of SKILLS) {
    skill.parents = skill.parents || [];
    skill.fx = skill.fx || {};
    skill.unlocks = skill.unlocks || [];

    const branchColumn = skill.branch ? (BRANCHES[skill.branch]?.col ?? 0) : 0;
    skill.pos = {
      x: LAYOUT.pad + (branchColumn + skill.at[0]) * LAYOUT.cellX,
      y: LAYOUT.pad + skill.at[1] * LAYOUT.cellY,
    };

    // Premier nœud de sa voie : l’acheter fixe le choix de voie (définitif)
    const hasParentInSameBranch = skill.parents.some(
      (parentId) => SKILL_BY_ID[parentId]?.branch === skill.branch
    );
    skill.isBranchEntry = Boolean(skill.branch) && !hasParentInSameBranch;
  }
}

// Signale dans la console les erreurs dans skills.js
function validateSkills() {
  const seen = new Set();
  for (const skill of SKILLS) {
    const where = `[skills.js] compétence "${skill.id}"`;
    if (seen.has(skill.id)) console.error(`${where} : id en double`);
    seen.add(skill.id);
    if (skill.branch && !BRANCHES[skill.branch]) console.error(`${where} : voie inconnue "${skill.branch}"`);
    if (!Array.isArray(skill.at)) console.error(`${where} : "at" doit être [décalage, rangée]`);
    for (const parentId of skill.parents) {
      if (!SKILL_BY_ID[parentId]) console.error(`${where} : parent inconnu "${parentId}"`);
    }
    for (const stat of Object.keys(skill.fx)) {
      if (!STATS[stat]) console.error(`${where} : effet inconnu "${stat}" (voir STATS)`);
    }
    for (const key of skill.unlocks) {
      if (!GAMES[key] && !FEATURES[key]) console.error(`${where} : "${key}" n’est ni un jeu (GAMES) ni une mécanique (FEATURES)`);
    }
  }
}


/* ===== 4. Statistiques =================================================== */

// Combine les effets de toutes les compétences achetées
function computeStats() {
  const stats = {};
  for (const [name, rule] of Object.entries(STATS)) stats[name] = rule.base;

  for (const skill of SKILLS) {
    if (!state.owned[skill.id]) continue;
    for (const [name, value] of Object.entries(skill.fx)) {
      if (!STATS[name]) continue;
      stats[name] = STATS[name].mode === 'add' ? stats[name] + value : stats[name] * value;
    }
  }

  // Valeurs finales utilisées par le jeu
  stats.perClick = stats.clickAdd * stats.clickMul * stats.allMul;
  stats.perSecond = stats.secAdd * stats.secMul * stats.allMul * boostMultiplier();
  return stats;
}


/* ===== 5. Règles de l’arbre ============================================= */

const isOwned = (skill) => Boolean(state.owned[skill.id]);

// Une voie est fermée si une autre voie a déjà été choisie
const isBlocked = (skill) =>
  Boolean(skill.branch && state.branch && state.branch !== skill.branch);

const isAvailable = (skill) =>
  !isOwned(skill) && !isBlocked(skill) && skill.parents.every((id) => state.owned[id]);

const canAfford = (skill) => state.unites >= skill.cost;

// Vrai si une compétence achetée a débloqué ce jeu ou cette mécanique
const isUnlocked = (key) =>
  SKILLS.some((skill) => isOwned(skill) && skill.unlocks.includes(key));


/* ===== 6. Achat ========================================================== */

let pendingConfirmId = null;   // nœud de voie en attente de confirmation
let pendingConfirmTimer;

function buySkill(id) {
  const skill = SKILL_BY_ID[id];
  if (!isAvailable(skill) || !canAfford(skill)) return;

  // Choisir une voie est définitif : on demande un second clic
  if (skill.isBranchEntry && !state.branch) {
    if (pendingConfirmId !== id) {
      pendingConfirmId = id;
      clearTimeout(pendingConfirmTimer);
      pendingConfirmTimer = setTimeout(() => { pendingConfirmId = null; render(); }, CONFIRM_DELAY_MS);
      render();
      return;
    }
    state.branch = skill.branch;
    pendingConfirmId = null;
  }

  state.unites -= skill.cost;
  state.owned[id] = true;

  // Annonce les mécaniques que cette compétence vient de débloquer
  for (const key of skill.unlocks) {
    const message = FEATURES[key]?.message;
    if (message) $('msg').textContent = message;
  }
  render();
  save();
}


/* ===== 7. Casino ========================================================= */

// Options d’un jeu : ses « choix » (ex. couleurs), ou une seule option par défaut
function getOptions(game) {
  return game.choices || [{ key: 'main', label: game.label, chance: game.chance, payout: game.payout }];
}

function findOption(gameKey, optionKey) {
  return getOptions(GAMES[gameKey]).find((option) => option.key === optionKey);
}

// ---- QTE : appuyer sur une touche avant la fin du délai ----
let qteActive = false;
const QTE_IGNORED_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'];

// Appelle onResult(true) si la bonne touche est pressée à temps, onResult(false) sinon
function startQTE(requiredKey, durationMs, onResult) {
  if (qteActive) return;
  qteActive = true;

  const fill = $('qte-fill');
  $('qte-key').textContent = requiredKey.toUpperCase();
  $('qte').hidden = false;
  $('side-action').disabled = true;

  function onKeyDown(event) {
    if (event.repeat || QTE_IGNORED_KEYS.includes(event.key)) return;
    event.preventDefault();   // évite d’écrire la lettre dans le champ de mise
    finish(event.key.toLowerCase() === requiredKey.toLowerCase());
  }

  function finish(success) {
    if (!qteActive) return;
    qteActive = false;
    window.removeEventListener('keydown', onKeyDown);
    clearTimeout(listenTimer);
    clearTimeout(timeout);
    $('qte').hidden = true;
    $('side-action').disabled = false;
    onResult(success);
  }

  // Écouteur ajouté au tour suivant : sinon la touche Entrée qui a cliqué sur le bouton
  // serait comptée comme une mauvaise touche.
  const listenTimer = setTimeout(() => window.addEventListener('keydown', onKeyDown), 0);
  const timeout = setTimeout(() => finish(false), durationMs);
}

// Action du bouton de la sous-section de droite
function onSideAction() {
  if(startQTE("e", 300, success)){
    return 1;
  }
  return 0;
}

function winChance(gameKey, optionKey) {
  const { luck } = computeStats();
  return Math.min(MAX_WIN_CHANCE, findOption(gameKey, optionKey).chance * (1 + luck));
}

// Mise maximale : 1/20 des unités possédées (au moins 1 si on a de quoi miser)
function maxBet() {
  const { limit } = computeStats();
  const ceiling = Math.floor(state.unites * MAX_BET_RATIO * limit);
  return Math.max(1, Math.min(ceiling, Math.floor(state.unites)));
}

// Part des unités que l’on peut miser, en texte (ex. « 5 % »), selon les bonus
function maxBetPercent() {
  const { limit } = computeStats();
  return `${Math.round(MAX_BET_RATIO * limit * 100)} %`;
}

// Construit le panneau du casino à partir de GAMES
function buildCasino() {
  const panel = document.createElement('section');
  panel.id = 'casino';
  panel.hidden = true;
  panel.innerHTML = `
    <h2>Casino</h2>
    <div class="casino-top">
      <div class="bet-row">
        <label>Mise <input id="bet" type="number" min="1" step="1" value="10"></label>
        <button type="button" class="ghost" id="bet-half">½</button>
        <button type="button" class="ghost" id="bet-max">Max</button>
        <span id="bet-limit"></span>
      </div>
      <h3>Sous-section</h3>
      <button type="button" class="ghost" id="side-action">Bouton</button>
      <div id="qte" class="qte" hidden>
      <button type="button" id="qte-key" class="qte-key"></button>
      <div class="qte-bar"><div id="qte-fill"></div></div>
    </div>
    <div class="games" id="games"></div>
    <p id="casino-msg" aria-live="polite"></p>`;

  const gamesBox = panel.querySelector('#games');
  for (const [gameKey, game] of Object.entries(GAMES)) {
    const row = document.createElement('div');
    row.className = 'game';
    row.id = `game-${gameKey}`;
    row.hidden = true;

    // Jeu avec plusieurs choix : on affiche son nom, puis un bouton par choix
    if (game.choices) {
      const name = document.createElement('span');
      name.className = 'game-name';
      name.textContent = game.label;
      row.appendChild(name);
    }

    for (const option of getOptions(game)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `play-${gameKey}-${option.key}`;
      if (option.color) button.style.background = option.color;
      button.onclick = () => playGame(gameKey, option.key);
      row.appendChild(button);
    }
    gamesBox.appendChild(row);
  }

  const treeWrap = document.querySelector('.tree-wrap');
  treeWrap.parentNode.insertBefore(panel, treeWrap);

  $('bet-half').onclick = () => { $('bet').value = Math.max(1, Math.floor(maxBet() / 2)); };
  $('bet-max').onclick = () => { $('bet').value = maxBet(); };
  $('side-action').onclick = onSideAction;
}

function playGame(gameKey, optionKey) {
  const game = GAMES[gameKey];
  const option = findOption(gameKey, optionKey);
  const message = $('casino-msg');
  const bet = Math.floor(Number($('bet').value));

  if (!(bet >= 1)) {
    message.textContent = 'Entrez une mise d’au moins 1 unité.';
    return;
  }
  if (bet > state.unites) {
    message.textContent = 'Pas assez d’unités pour cette mise.';
    return;
  }
  if (bet > maxBet()) {
    message.textContent = `Mise trop élevée : le maximum est de ${formatNumber(maxBet())} unités (${maxBetPercent()} de vos unités).`;
    return;
  }

  state.unites -= bet;
  const won = Math.random() < winChance(gameKey, optionKey);
  const winnings = Math.floor(bet * option.payout * computeStats().jackpot);
  if (won) state.unites += winnings;

  const outcome = won
    ? `gagné ! +${formatNumber(winnings - bet)} unités.`
    : `perdu… -${formatNumber(bet)} unités.`;
  message.textContent = `${game.roll(won, optionKey)} : ${outcome}`;

  render();
  save();
}


/* ===== 8. Mécaniques débloquables ======================================== */

// Affiche un multiplicateur sans décimales inutiles (×5 ou ×3,4)
const formatMultiplier = (value) => `×${formatNumber(Math.round(value * 10) / 10)}`;

// ---- 8a. Clic chargé : maintenir le bouton multiplie le gain du clic ----

let holdStartedAt = null;   // instant où le bouton a été enfoncé (null = pas de maintien)
let holdFrame = null;       // animation en cours pendant le maintien
let gatherLabel = '';       // texte normal du bouton principal

const heldSeconds = () =>
  holdStartedAt === null ? 0 : (performance.now() - holdStartedAt) / 1000;

// Multiplicateur obtenu après `seconds` secondes de maintien
function chargeMultiplier(seconds) {
  if (!isUnlocked('charge')) return 1;
  const { minSeconds, fullSeconds, fullMultiplier } = FEATURES.charge;
  if (seconds <= minSeconds) return 1;
  const progress = Math.min((seconds - minSeconds) / (fullSeconds - minSeconds), 1);
  return 1 + progress * (fullMultiplier - 1);
}

function showGatherButton(charge, label) {
  const button = $('gather');
  button.style.setProperty('--charge', charge);   // remplissage du bouton (CSS)
  button.textContent = label;
}

// Met à jour le bouton à chaque image tant qu’il est maintenu
function animateHold() {
  if (holdStartedAt === null) return;
  if (isUnlocked('charge')) {
    const seconds = heldSeconds();
    const progress = Math.min(seconds / FEATURES.charge.fullSeconds, 1);
    showGatherButton(progress, `Chargement… ${formatMultiplier(chargeMultiplier(seconds))}`);
  }
  holdFrame = requestAnimationFrame(animateHold);
}

function startHold() {
  if (holdStartedAt !== null) return;
  holdStartedAt = performance.now();
  animateHold();
}

// Relâchement : on génère le clic, multiplié selon la durée (cancelled = geste annulé)
function endHold(cancelled) {
  if (holdStartedAt === null) return;
  const multiplier = cancelled ? 1 : chargeMultiplier(heldSeconds());
  holdStartedAt = null;
  cancelAnimationFrame(holdFrame);
  showGatherButton(0, gatherLabel);
  if (cancelled) return;

  const gain = computeStats().perClick * multiplier;
  state.unites += gain;
  if (multiplier > 1) {
    $('msg').textContent = `Clic chargé ${formatMultiplier(multiplier)} : +${formatNumber(gain)} unités.`;
  }
  render();
}

// Souris, écran tactile et clavier (Espace / Entrée) passent par le même mécanisme
function setupGatherButton() {
  const button = $('gather');
  gatherLabel = button.textContent;

  button.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;                     // seul le clic gauche compte
    try { button.setPointerCapture(event.pointerId); } catch (error) { /* non supporté */ }
    startHold();
  });
  button.addEventListener('pointerup', () => endHold(false));
  button.addEventListener('pointercancel', () => endHold(true));
  button.addEventListener('contextmenu', (event) => event.preventDefault());

  button.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) startHold();
  });
  button.addEventListener('keyup', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    endHold(false);
  });
  button.addEventListener('blur', () => endHold(true));
}


// ---- 8b. Bonus aléatoire : une icône apparaît, la cliquer lance un effet ----

let boost = null;           // effet en cours : { multiplier, endsAt }
let nextBonusAt = null;     // prochaine apparition de l’icône (null = mécanique inactive)
let bonusIcon = null;       // icône actuellement affichée
let bonusIconTimer;

// Multiplicateur de production du bonus en cours (×1 s’il n’y en a pas)
function boostMultiplier() {
  return boost && Date.now() < boost.endsAt ? boost.multiplier : 1;
}

// Choisit un effet au hasard (selon `weight`, 1 par défaut)
function pickBonusEffect() {
  const { effects } = FEATURES.boost;
  const total = effects.reduce((sum, effect) => sum + (effect.weight ?? 1), 0);
  let roll = Math.random() * total;
  for (const effect of effects) {
    roll -= effect.weight ?? 1;
    if (roll < 0) return effect;
  }
  return effects[effects.length - 1];
}

function removeBonusIcon() {
  clearTimeout(bonusIconTimer);
  if (bonusIcon) bonusIcon.remove();
  bonusIcon = null;
}

function spawnBonusIcon() {
  removeBonusIcon();
  const icon = document.createElement('button');
  icon.type = 'button';
  icon.className = 'bonus-icon';
  icon.textContent = FEATURES.boost.icon;
  icon.setAttribute('aria-label', 'Bonus : cliquez pour lancer un effet aléatoire');
  icon.style.left = `${5 + Math.random() * 85}%`;   // position aléatoire dans la fenêtre
  icon.style.top = `${15 + Math.random() * 70}%`;
  icon.onclick = collectBonus;
  document.body.appendChild(icon);

  bonusIcon = icon;
  bonusIconTimer = setTimeout(removeBonusIcon, FEATURES.boost.iconLifetimeSeconds * 1000);
}

function collectBonus() {
  const effect = pickBonusEffect();
  boost = { multiplier: effect.multiplier, endsAt: Date.now() + effect.seconds * 1000 };
  removeBonusIcon();
  $('msg').textContent = `Bonus ! Production ×${effect.multiplier} pendant ${effect.seconds} s.`;
  render();
}

// Appelée à chaque tour de boucle : programme et déclenche les apparitions
function updateBonusSpawner() {
  if (boost && Date.now() >= boost.endsAt) boost = null;

  if (!isUnlocked('boost')) {
    nextBonusAt = null;
    return;
  }
  const delay = FEATURES.boost.spawnEverySeconds * 1000;
  const now = Date.now();
  if (nextBonusAt === null) {
    nextBonusAt = now + delay;
  } else if (now >= nextBonusAt) {
    spawnBonusIcon();
    nextBonusAt = now + delay;
  }
}

function resetMechanics() {
  endHold(true);
  boost = null;
  nextBonusAt = null;
  removeBonusIcon();
}


/* ===== 9. Affichage ====================================================== */

// Création des éléments, une seule fois au démarrage
function buildTree() {
  const tree = $('tree');
  const links = $('links');
  let maxX = 0;
  let maxY = 0;

  for (const skill of SKILLS) {
    // Lignes vers les parents
    for (const parentId of skill.parents) {
      const from = SKILL_BY_ID[parentId].pos;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x + LAYOUT.nodeW / 2);
      line.setAttribute('y1', from.y + LAYOUT.nodeH);
      line.setAttribute('x2', skill.pos.x + LAYOUT.nodeW / 2);
      line.setAttribute('y2', skill.pos.y);
      line.dataset.from = parentId;
      line.dataset.to = skill.id;
      links.appendChild(line);
    }

    // Bouton de la compétence
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'node';
    node.id = `n-${skill.id}`;
    node.style.left = `${skill.pos.x}px`;
    node.style.top = `${skill.pos.y}px`;
    const entryTag = skill.isBranchEntry ? '<span class="tag">Choix définitif</span>' : '';
    node.innerHTML = `<b>${skill.name}</b><small>${skill.desc}</small>${entryTag}<span class="cost"></span>`;
    node.onclick = () => buySkill(skill.id);
    tree.appendChild(node);

    maxX = Math.max(maxX, skill.pos.x);
    maxY = Math.max(maxY, skill.pos.y);
  }

  // La zone s’adapte automatiquement à la taille de l’arbre
  tree.style.width = `${maxX + LAYOUT.nodeW + LAYOUT.pad}px`;
  tree.style.height = `${maxY + LAYOUT.nodeH + LAYOUT.pad}px`;
}

function costLabel(skill) {
  if (isOwned(skill)) return 'Acquis';
  if (isBlocked(skill)) return 'Voie fermée';
  if (pendingConfirmId === skill.id) return 'Définitif : recliquez';
  return `${formatNumber(skill.cost)} unités`;
}

function renderHeader(stats) {
  $('unites').textContent = formatNumber(state.unites);
  $('cps').textContent = formatNumber(stats.perSecond);
  $('cpc').textContent = formatNumber(stats.perClick);
}

function renderSkills() {
  for (const skill of SKILLS) {
    const node = $(`n-${skill.id}`);
    const owned = isOwned(skill);
    const available = isAvailable(skill);
    const blocked = isBlocked(skill);

    node.classList.toggle('owned', owned);
    node.classList.toggle('available', available);
    node.classList.toggle('blocked', blocked && !owned);
    node.classList.toggle('locked', !owned && !available);
    node.classList.toggle('afford', available && canAfford(skill));
    node.setAttribute('aria-disabled', String(owned || !available));
    node.querySelector('.cost').textContent = costLabel(skill);
  }

  document.querySelectorAll('#links line').forEach((line) => {
    const bothOwned = state.owned[line.dataset.from] && state.owned[line.dataset.to];
    line.classList.toggle('on', Boolean(bothOwned));
  });
}

function renderCasino() {
  const anyGameUnlocked = Object.keys(GAMES).some(isUnlocked);
  $('casino').hidden = !anyGameUnlocked;

  const limit = maxBet();
  $('bet').max = limit;
  $('bet-limit').textContent = `Max : ${formatNumber(limit)} (${maxBetPercent()} de vos unités)`;

  for (const [gameKey, game] of Object.entries(GAMES)) {
    $(`game-${gameKey}`).hidden = !isUnlocked(gameKey);
    for (const option of getOptions(game)) {
      const percent = winChance(gameKey, option.key) * 100;
      const shown = (percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)).replace('.', ',');
      $(`play-${gameKey}-${option.key}`).textContent = `${option.label} · ×${option.payout} · ${shown} %`;
    }
  }
}

function renderMechanics() {
  // Indication au survol quand le clic chargé est débloqué
  $('gather').title = isUnlocked('charge') ? 'Maintenez pour charger le clic' : '';

  // Compte à rebours du bonus de production en cours
  const status = $('boost-status');
  const active = boostMultiplier() > 1;
  status.hidden = !active;
  if (active) {
    const secondsLeft = Math.ceil((boost.endsAt - Date.now()) / 1000);
    status.textContent = `${FEATURES.boost.icon} Production ${formatMultiplier(boost.multiplier)} · ${secondsLeft} s`;
  }
}

function render() {
  renderHeader(computeStats());
  renderSkills();
  renderCasino();
  renderMechanics();
}


/* ===== 10. Boucle de jeu ================================================= */

function startGameLoop() {
  let lastTick = performance.now();
  setInterval(() => {
    const now = performance.now();
    const elapsedSeconds = (now - lastTick) / 1000;
    lastTick = now;
    updateBonusSpawner();
    state.unites += computeStats().perSecond * elapsedSeconds;
    render();
  }, TICK_MS);

  setInterval(save, AUTOSAVE_MS);
  window.addEventListener('pagehide', save);   // dernière sauvegarde à la fermeture
}


/* ===== 11. Sauvegarde, boutons et démarrage =============================== */

// La partie (unités, compétences, voie choisie) est enregistrée dans le navigateur.
// Les effets temporaires (bonus en cours, icône) ne sont pas sauvegardés.
function save() {
  try {
    state.saved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (error) { /* stockage indisponible : on continue sans sauvegarde */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state = { ...state, ...saved, owned: { root: true, ...saved.owned } };

    // Retrouve la voie choisie si la sauvegarde ne la contient pas
    if (!state.branch) {
      const ownedBranchSkill = SKILLS.find((skill) => skill.branch && isOwned(skill));
      state.branch = ownedBranchSkill ? ownedBranchSkill.branch : null;
    }

    // Gains hors-ligne
    const secondsAway = Math.min((Date.now() - saved.saved) / 1000, OFFLINE_MAX_SECONDS);
    const gain = computeStats().perSecond * secondsAway;
    if (gain >= 1) {
      state.unites += gain;
      $('msg').textContent = `Pendant votre absence : +${formatNumber(gain)} unités.`;
    }
  } catch (error) { /* sauvegarde illisible : on repart de zéro */ }
}

function setupButtons() {
  setupGatherButton();

  $('save').onclick = () => {
    save();
    $('msg').textContent = 'Partie sauvegardée.';
  };

  // Indicateur du bonus de production, placé à côté du message
  const status = document.createElement('span');
  status.id = 'boost-status';
  status.hidden = true;
  $('msg').before(status);

  // Réinitialisation en deux clics (évite les clics accidentels)
  let resetArmed = false;
  $('reset').onclick = () => {
    if (!resetArmed) {
      resetArmed = true;
      $('reset').textContent = 'Confirmer la réinitialisation';
      setTimeout(() => { resetArmed = false; $('reset').textContent = 'Réinitialiser'; }, CONFIRM_DELAY_MS);
      return;
    }
    resetArmed = false;
    state = newGameState();
    resetMechanics();
    $('reset').textContent = 'Réinitialiser';
    $('msg').textContent = 'Partie réinitialisée.';
    save();
    render();
  };
}

prepareSkills();
validateSkills();
buildTree();
buildCasino();
setupButtons();
load();
render();
startGameLoop();
