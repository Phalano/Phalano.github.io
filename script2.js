/* ==========================================================================
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

/* 1. REGLAGE*/

const SAVE_KEY = 'save';
const OFFLINE_MAX_SECONDS = 28800;
const CONFIRM_DELAY_MS = 300;
const MAX_WIN_CHANCE = 1;
const MAX_BET_RATIO = 1/20;
const TICK_MS = 100;
const AUTOSAVE_MS = 10000;

const LAYOUT = { cellX: 170, cellY: 300, nodeW: 150, nodeH: 110, pad: 15 };


/* 2. OUTILS*/

const $ = (id) => document.getElementById(id);

function formatNumber(n){
    if(n < 1000){
        const isSmallDecimal = n < 10 && n % 1 !== 0;
        return isSmallDecimal ? n.toFixed(1).replace('.', ',') : String(Math.floor(n));
    }
    const units = ['k', 'M', 'B', 'T', 'Qa', 'Qi'];
    let i = -1;
    while(n >= 1000 && i < units.length - 1){
        n /= 1000;
        i++;
    }
    return n.toFixed(2).replace('.', ',') + ' ' + units[i];
}

function newGameState(){
    return {unites: 0, owned: {root: true}, branch: null, saved: Date.now()};
}

let state = newGameState();


/* 3. INITIALISATION SKILLS*/

const SKILL_BY_ID = Object.fromEntries(SKILLS.map((skill) => [skill.id, skill]));

function prepareSkills(){
    for(const skill of SKILLS){
        skill.parents = skill.parents || [];
        skill.fx = skill.fx || {};
        skill.unlocks = skill.unlocks || [];

        const branchColumn = skill.branch ? (BRANCHES[skill.branch]?.col ?? 0) : 0;
        skill.pos = {
            x: LAYOUT.pad + (branchColumn + skill.at[0]) * LAYOUT.cellX,
            y: LAYOUT.pad + skill.at[1] * LAYOUT.cellY,
        };

        const hasParentInSameBranch = skill.parents.some(
            (parentId) => SKILL_BY_ID[parentId]?.branch === skill.branch);
        skill.isBranchEntry = Boolean(skill.branch) && !hasParentInSameBranch;
    }
}

function validateSkills(){
    const seen = new Set();
    for(const skill of SKILLS){
        const where = `[skills.js] compétence "${skill.id}"`;
        if(seen.has(skill.id)){
            console.error(`${where} : id en double`);
        }
        seen.add(skill.id);
        if(skill.branch && !BRANCHES[skill.branch]){
            console.error(`${where} : voie inconnue "${skill.branch}"`);
        }
        if(!Array.isArray(skill.at)){
            console.error(`${where} : "at" doit etre [décalage, rangé]`);
        }
        for(const parentID of skill.parents){
            if(!SKILL_BY_ID[parentID]){
                console.error(`${where} : parent inconnye "${parentID}"`);
            }
        }
        for(const stat of Object.keys(skill.fx)){
            if(!STATS[stat]){
                console.error(`${where} : effet inconnu "${stat}"`);
            }
        }
        for(const key of skill.unlocks){
            if(!GAMES[key] && !FEATURES[key]){
                console.error(`${where} : "${key}" n'existe pas`);
            }
        }
    }
}

/* 4. STATISTIQUES */

function computeStats(){
    const stats = {};
    for(const [name, rule] of Object.entries(STATS)){
        stats[name] = rule.base;
    }

    for(const skill of SKILLS){
        if(!state.owned[skill.id]){
            continue;
        }
        for(const[name, value] of Object.entries(skill.fx)){
            if(!STATS[name]){
                continue;
            }
            stats[name] = STATS[name].mode === 'add' ? stats[name] + value: stats[name] * value;
        }
    }

    stats.perClick = stats.clickAdd * stats.clickMul * stats.allMul;
    stats.perSecond = stats.secAdd * stats.secMul * stats.allMul * boostMultiplier();
    return stats;
}

/* 5. REGLES */

const isOwned = (skill) => Boolean(state.owned[skill.id]);

const isBlocked = (skill) => 
    Boolean(skill.branch && state.branch && state.branch !== skill.branch && computeStats().branch === 0);

const isAvailable = (skill) =>
    !isOwned(skill) && !isBlocked(skill) && skill.parents.every((id) => state.owned[id]);

const canAfford = (skill) => state.unites >= skill.cost;

const isUnlocked = (key) =>
    SKILLS.some((skill) => isOwned(skill) && skill.unlocks.includes(key));

/* 6. ACHAT */

let pendingConfirmId = null;
let pendingConfirmTimer;

function buySkill(id){
    const skill = SKILL_BY_ID[id];
    if(!isAvailable(skill) ||!canAfford(skill)){
        return;
    }

    if(skill.isBranchEntry && !state.branch){
        if(pendingConfirmId !== id){
            pendingConfirmId = id;
            clearTimeout(pendingConfirmTimer);
            pendingConfirmTimer = setTimeout(() => {pendingConfirmId = null; render();}, CONFIRM_DELAY_MS);
            render();
            return;
        }
        state.branch = skill.branch;
        pendingConfirmId = null;
    }

    state.unites -= skill.cost;
    state.owned[id] = true;

    for(const key of skill.unlocks){
        const message = FEATURES[key]?.message;
        if(message){
            $('msg').textContent = message;
        }
    }
    render();
    save();
}

/* 7. CASINO */

function getOptions(game){
    return game.choices || [{key: 'main', label: game.label, chance: game.chance, payout: game.payout}];
}

function findOption(gameKey, optionKey){
    return getOptions(GAMES[gameKey]).find((option) => option.key === optionKey);
}

function winChance(gameKey, optionKey){
    const {luck} = computeStats();
    return Math.min(MAX_WIN_CHANCE, findOption(gameKey, optionKey).chance * (1 + luck));
}

function maxBet(){
    const {limit} = computeStats();
    const ceiling = Math.floor(state.unites * MAX_BET_RATIO * limit);
    return Math.max(1, Math.min(ceiling, Math.floor(state.unites)));
}

function maxBetPercent(){
    const {limit} = computeStats();
    return `${Math.round(MAX_BET_RATIO * limit * 100)} %`
}

function buildCasino(){
    const panel = document.createElement('section');
    panel.id = 'casino';
    panel.hidden = true;
    panel.innerHTML = `
        <h2>Casino</h2>
        <div class="bet-row">
            <label>Mise <input id="bet" type="number" min="1" step="1" value="0"></label>
            <button type="button" class="ghost" id="bet-half">1/2</button>
            <button type="button" class="ghost" id="bet-max">Max</button>
            <span id="bet-limit"></span>
        </div>
        <div class="games" id="games"></div>
        <p id="casino-msg" aria-live="polite"></p>`;
    
    const gameBox = panel.querySelector('#games');
    for(const [gameKey, game] of Object.entries(GAMES)){
        const row = document.createElement('div');
        row.className = 'game';
        row.id = `game-${gameKey}`;
        row.hidden = true;

        if(game.choices){
            const name = document.createElement('span');
            name.className = 'game-name';
            name.textContent = game.label;
            row.appendChild(name);
        }

        for(const option of getOptions(game)){
            const button = document.createElement('button');
            button.type = 'button';
            button.id = `play-${gameKey}-${option.key}`;
            if(option.color){
                button.style.background = option.color;
            }
            button.onclick = () => playGame(gameKey, option.key);
            row.appendChild(button);
        }
        gameBox.appendChild(row);
    }

    const treeWrap = document.querySelector('.tree-wrap');
    treeWrap.parentNode.insertBefore(panel, treeWrap);

    $('bet-half').onclick = () => { $('bet').value = Math.max(1, Math.floor(maxBet() / 2)); };
    $('bet-max').onclick = () => {$('bet').value = maxBet();};
}

function playGame(gameKey, optionKey){
    const game = GAMES[gameKey];
    const option = findOption(gameKey, optionKey);
    const message = $('casino-msg');
    const bet = Math.floor(Number($('bet').value));

    if(!(bet >= 1)){
        message.textContent = 'Entrez une mise.';
        return;
    }
    if(bet > state.unites){
        message.textContent = 'Pas assez d’unités';
        return;
    }
    if(bet > maxBet()){
        message.textContent = `Mise trop élévée: le maximum est ${formatNumber(maxBet())} unités (${maxBetPercent()}.)`;
        return;
    }

    state.unites -= bet;
    const won = Math.random() < winChance(gameKey, optionKey);
    const winnings = Math.floor(bet * option.payout * computeStats().jackpot);
    if(won){
        state.unites += winnings;
    }

    const outcome = won
        ? `gagné ! +${formatNumber(winnings - bet)} unités.`
        : `perdu... -${formatNumber(bet)} unités.`;
    message.textContent = `${game.roll(won, optionKey)} : ${outcome}`;

    render();
    save();
}

/* 8. UNLOCKS */

const formatMultiplier = (value) => `×${formatNumber(Math.round(value * 10) / 10)}`;

/* 8a. Skill: click chargé*/

let holdStartedAt = null;
let holdFrame = null;
let gatherLabel = '';

const heldSeconds = () =>
    holdStartedAt === null ? 0 : (performance.now() - holdStartedAt) / 1000;

function chargeMultiplier(seconds){
    if(!isUnlocked('charge')){
        return 1;
    }
    const {minSeconds, fullSeconds, fullMultiplier} = FEATURES.charge;
    if(seconds <= minSeconds){
        return 1;
    }
    const progress = Math.min((seconds - minSeconds) / (fullSeconds - minSeconds), 1);
    return (1 + progress * (fullMultiplier - 1) * computeStats().fcharge);
}

function showGatherButton(charge, label){
    const button = $('gather');
    button.style.setProperty('--charge', charge);
    button.textContent = label;
}

function animateHold(){
    if(holdStartedAt == null){
        return;
    }
    if(isUnlocked('charge')){
        const seconds = heldSeconds();
        const progress = Math.min(seconds / FEATURES.charge.fullSeconds, 1);
        showGatherButton(progress, `${formatMultiplier(chargeMultiplier(seconds))}`);
    }
    holdFrame = requestAnimationFrame(animateHold);
}

function startHold(){
    if(holdStartedAt !== null){
        return;
    }
    holdStartedAt = performance.now();
    animateHold();
}

function endHold(cancelled){
    if(holdStartedAt === null){
        return;
    }
    const multiplier = cancelled ? 1 : chargeMultiplier(heldSeconds());
    holdStartedAt = null;
    cancelAnimationFrame(holdFrame);
    showGatherButton(0, gatherLabel);
    if(cancelled){
        return;
    }

    const gain = computeStats().perClick * multiplier;
    state.unites += gain;
    if(multiplier > 1){
        $('msg').textContent = `Clic chargé ${formatMultiplier(multiplier)} : +${formatNumber(gain)} unités.`;
    }
    render();
}

function setupGatherButton(){
    const button = $('gather');
    gatherLabel = button.textContent;

    button.addEventListener('pointerdown', (event) => {
        if (event.button > 0) return;
        try {button.setPointerCapture(event.pointerId);} catch(error){console.error(error)}
        startHold();
    });
    button.addEventListener('pointerup', () => endHold(false));
    button.addEventListener('pointercancel', () => endHold(true));
    button.addEventListener('contextmenu', (event) => event.preventDefault());

    button.addEventListener('keydown', (event) => {
        if(event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if(!event.repeat) startHold();
    });
    button.addEventListener('keyup', (event) => {
        if(event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        endHold(false);
    });
    button.addEventListener('blur', () => endHold(true));
}

/* 8B. BONUS RANDOM*/

let boost = null; // effet en cours
let nextBonusAt = null; // prochaine apparition du cookie dorée (null = pas utilisé)
let bonusIcon = null; // icone affiché
let bonusIconTimer;

function boostMultiplier(){
    return boost && Date.now() < boost.endsAt ? (boost.multiplier) : 1;
}

function pickBonusEffect(){
    const {effects} = FEATURES.boost;
    const total = effects.reduce((sum, effect) => sum + (effect.weight ?? 1), 0);
    let roll = Math.random() * total;
    for(const effect of effects){
        roll -= effect.weight ?? 1;
        if(roll < 0){
            return effect;
        }
    }
    return effects[effects.length - 1];
}

function removeBonusIcon(){
    clearTimeout(bonusIconTimer);
    if(bonusIcon){
        bonusIcon.remove();
    }
    bonusIcon = null;
}

function spawnBonusIcon(){
    removeBonusIcon();
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'bonus-icon';
    icon.textContent = FEATURES.boost.icon;
    icon.setAttribute('aria-label', 'Bonus: cliquez');
    icon.style.left = `${5 + Math.random() * 85}%`;
    icon.style.top = `${15 + Math.random() * 70}%`;
    icon.onclick = collectBonus;
    document.body.appendChild(icon);

    bonusIcon = icon;
    bonusIconTimer = setTimeout(removeBonusIcon, FEATURES.boost.iconLifetimeSeconds * 1000);
}

function collectBonus(){
    const effect = pickBonusEffect();
    boost = {multiplier: effect.multiplier * computeStats().bmult, endsAt: Date.now() + effect.seconds * 1000};
    removeBonusIcon();
    $('msg').textContent = `Bonus! ${effect.multiplier}x pendant ${effect.seconds}s.`;
    render();
}

function updateBonusSpawner(){
    if(boost && Date.now() >= boost.endsAt){
        boost = null;
    }

    if(!isUnlocked('boost')){
        nextBonusAt = null;
        return;
    }
    const delay = FEATURES.boost.spawnEverySeconds * 1000;
    const now = Date.now();
    if(nextBonusAt === null){
        nextBonusAt = now + delay;
    } else if(now >= nextBonusAt){
        spawnBonusIcon();
        nextBonusAt = now + delay;
    }
}

function resetMechanics(){
    endHold(true);
    boost = null;
    nextBonusAt = null;
    removeBonusIcon();
}

/* 9. AFFIcharge */

function buildTree(){
    const tree = $('tree');
    const links = $('links');
    let maxX = 0;
    let maxY = 0;

    for(const skill of SKILLS){
        for(const parentId of skill.parents){
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

        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'node';
        node.id = `n-${skill.id}`;
        node.style.left = `${skill.pos.x}px`;
        node.style.top = `${skill.pos.y}px`;
        const entryTag = skill.isBranchEntry ? '<span class="tag">Choix Permanent</span>' : '';
        node.innerHTML = `<b>${skill.name}</b><small>${skill.desc}</small>${entryTag}<span class="cost"></span>`;
        node.onclick = () => buySkill(skill.id);
        tree.appendChild(node);

        maxX = Math.max(maxX, skill.pos.x);
        maxY = Math.max(maxY, skill.pos.y);
    }

    tree.style.width = `${maxX + LAYOUT.nodeW + LAYOUT.pad}px`;
    tree.style.height = `${maxY + LAYOUT.nodeH + LAYOUT.pad}px`;
}

function costLabel(skill){
    if(isOwned(skill)){
        return 'Acquis';
    }
    if(isBlocked(skill)){
        return 'Bloqué';
    }
    if(pendingConfirmId === skill.id){
        return 'Choix definitf, vous etes sur ?';
    }
    return `${formatNumber(skill.cost)} unités`;
}

function renderHeader(stats){
    $('unites').textContent = formatNumber(state.unites);
    $('cps').textContent = formatNumber(stats.perSecond);
    $('cpc').textContent = formatNumber(stats.perClick);
}

function renderSkills(){
    for(const skill of SKILLS){
        const node = $(`n-${skill.id}`);
        const owned = isOwned(skill);
        const available = isAvailable(skill);
        const blocked = isBlocked(skill);

        node.classList.toggle('owned', owned);
        node.classList.toggle('available', available);
        node.classList.toggle('blocked', blocked && !owned);
        node.classList.toggle('lockec', !owned && !available);
        node.classList.toggle('afford', available && canAfford(skill));
        node.setAttribute('aria-disabled', String(owned || !available));
        node.querySelector('.cost').textContent = costLabel(skill);
    }

    document.querySelectorAll('#links line').forEach((line) => {
        const bothOwned = state.owned[line.dataset.from] && state.owned[line.dataset.to];
        line.classList.toggle('on', Boolean(bothOwned));
    });
}

function renderCasino(){
    const anyGameUnlocked = Object.keys(GAMES).some(isUnlocked);
    $('casino').hidden = !anyGameUnlocked;

    const limit = maxBet();
    $('bet').max = limit;
    $('bet-limit').textContent = `Max: ${formatNumber(limit)} (${maxBetPercent()} de vos unités)`;

    for(const [gameKey, game] of Object.entries(GAMES)){
        $(`game-${gameKey}`).hidden = !isUnlocked(gameKey);
        for(const option of getOptions(game)){
            const percent = winChance(gameKey, option.key) * 100;
            const shown = (percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)).replace('.', ',');
            $(`play-${gameKey}-${option.key}`).textContent = `${option.label} · x${option.payout} · ${shown} %`;
        }
    }
}

function renderMechanics(){
    $(`gather`).title = isUnlocked('charge') ? 'Maintenez click pour le charger': '';

    const status = $('boost-status');
    const active = boostMultiplier() > 1;
    status.hidden = !active;
    if(active){
        const secondsLeft = Math.ceil((boost.endsAt - Date.now()) / 1000);
        status.textContent = `${FEATURES.boost.icon} Production ${formatMultiplier(boost.multiplier)} · ${secondsLeft} s`;
    }
}

function render(){
    renderHeader(computeStats());
    renderSkills();
    renderCasino();
    renderMechanics();
}

/* 10. BOUCLE DU JEU */

function startGameLoop(){
    let lastTick = performance.now();
    setInterval(() => {
        const now = performance.now();
        const elapsedSeconds = (now -lastTick) / 1000;
        lastTick = now;
        updateBonusSpawner();
        state.unites += computeStats().perSecond * elapsedSeconds;
        render();
    }, TICK_MS);

    setInterval(save, AUTOSAVE_MS);
    window.addEventListener('pagehide', save); //sauvegarde avant fermeture de la page
}

/* 11. SAUVEGARDE, BOUTON ET DEMARRAGE */

function save(){
    try {
        state.saved = Date.now();
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (error) {console.error(error)}
}

function load(){
    try{
        const raw = localStorage.getItem(SAVE_KEY);
        if(!raw) return;
        const saved = JSON.parse(raw);
        state = { ...state, ...saved, owned: {root: true, ...saved.owned}};

        const secondsAway = Math.min((Date.now() - saved.saved) / 1000, OFFLINE_MAX_SECONDS);
        const gain = computeStats().perSecond * secondsAway;
        if(gain >= 1){
            state.unites += gain;
            $('msg').textContent = `Vous avez gagné: +${formatNumber(gain)} unités.`;
        }
    } catch(error){/* sauvegarde illisible*/}
}

function setupButtons(){
    setupGatherButton();

    $('save').onclick = () => {
        save();
        $('msg').textContent = 'Partie sauvegardée.';
    };

    const status = document.createElement('span');
    status.id = 'boost-status';
    status.hidden = true;
    $('msg').before(status);

    let resetArmed = false;
    $('reset').onclick = () => {
        if (!resetArmed) {
            resetArmed = true;
            $('reset').textContent = 'Confirmer';
            setTimeout(() => {resetArmed = false; $('reset').textContent = 'Reset'; }, CONFIRM_DELAY_MS);
            return;
        }
        resetArmed = false;
        state = newGameState();
        resetMechanics();
        $('reset').textContent = 'Reset';
        $('msg').textContent = 'Partie reset';
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