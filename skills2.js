const BRANCHES = {
    click: {label: 'clic', col: 0.5},
    casino: {label: 'Casino', col:3},
    idle: {label: 'Production', col: 5.5},
};

const STATS = {
    clickAdd: {base: 1, mode: 'add'},
    clickMul: {base: 1, mode: 'multiply'},
    secAdd:   {base: 0, mode: 'add'},
    secMul:   {base: 1, mode: 'multiply'},
    allMul:   {base: 1, mode: 'multiply'},
    limit:    {base: 1, mode: 'multiply'},
    luck:     {base: 0, mode: 'add'},
    jackpot:  {base: 1, mode: 'multiply'},
    fcharge:  {base: 1, mode: 'multiply'},
    bmult:    {base: 1, mode: 'multiply'},
    branch:   {base: 0, mode: 'add'},
};

const FEATURES = {
    charge: {
        fullSeconds: 0.75,
        fullMultiplier: 15,
        minSeconds: 0.5,
        message: 'Click chargé débloqué',
    },

    boost: {
        spawnEverySeconds: 60,
        iconLifetimeSeconds: 20,
        icon: '⚡',
        effects: [
            { multiplier: 7,  seconds: 70 },
            { multiplier: 77, seconds: 7  },
        ],
        message: 'Surtention debloquée',
    },
};


const SKILLS = [
    { id: 'root', name: 'Unité mère', desc: 'Choisissez une voie.',
    cost: 0, at: [3, 0], parents: [] },

    // ------CLICK---------------------------
    {   id: 'fil', branch: 'click', name: 'Poing',          desc: '+1 unité par click.',
        cost: 15,   at: [0, 0.5], parents: ['root'],              fx: {clickAdd: 1}},
    {   id: 'pre', branch: 'click', name: 'Deuxieme poing', desc: '+5 unités par click.',
        cost: 100,  at: [-0.5, 1], parents: ['fil'],          fx: {clickAdd: 5}},
    {   id: 'clu', branch: 'click', name: 'Super force',    desc: 'Clicks 2x',
        cost: 200,  at: [0.5, 1],  parents: ['fil'],          fx: {clickMul: 2}},
    {   id: 'chg', branch: 'click', name: 'Click chargé',    desc: `Maintenir le bouton pour : x${FEATURES.charge.fullMultiplier} aprés ${FEATURES.charge.fullSeconds}s.`,
        cost: 2000, at: [0, 1.5],   parents: ['pre', 'clu'],   unlocks: ['charge']},
    {   id: 'hak', branch: 'click', name: 'Haki',            desc: 'Clicks 3x.',
        cost: 3000, at: [0, 2],    parents: ['chg'],          fx: {clickMul: 3}},
    {   id: 'ha2', branch: 'click', name: 'Haki avencé',      desc: 'Ameliore la charge',
        cost: 10000, at: [1, 2], parents:['chg'],             fx: {fcharge: 1.5}},
    {   id: 'mar', branch: 'click', name: 'Mjolnir',         desc: '+100 par click',
        cost: 20000, at: [0, 2.5], parents: ['hak'],          fx: {clickAdd: 100}},
    {   id: 'mac', branch: 'click', name: 'Macuahuitl',      desc: 'ameliore la charge',
        cost: 100000, at: [0, 3], parents: ['mar'],             fx: {fcharge: 2}},
    {   id: 'drg', branch: 'click', name: 'Dragon slayer',   desc: 'Clicks 5x.',
        cost: 1500000, at: [0, 3.5], parents: ['mac'],          fx: {clickMul: 5}},
    {   id: 'exc', branch: 'click', name: 'Excalibur',       desc: 'Debloque les autres branches',
        cost: 10000000, at: [1, 3.5], parents: ['drg'],         fx: {branch: 1}},

    // ------CASINO----------------------------
    {   id: 'gbl', branch: 'casino', name: 'Casino',          desc: 'Pile ou face',
        cost: 15,     at: [0, 0.5],  parents: ['root'],            unlocks: ['coin']},
    {   id: 'trc', branch: 'casino', name: 'Piéce truqué',    desc: 'Chance de gagner augmenté',
        cost: 150,    at: [0, 1],    parents:['gbl'],                fx: {luck: 0.1}},
    {   id: 'rlt', branch: 'casino', name: 'Roulette',        desc: 'Rouge Black Green',
        cost: 500,   at: [0, 1.5],  parents:['trc'],              unlocks: ['roulette']},
    {   id: 'vip', branch: 'casino', name: 'Client VIP',      desc: 'Mise maximale doublé',
        cost: 2000,   at: [-0.5, 2], parents: ['rlt'],            fx: {limit: 2}},
    {   id: 'lu1', branch: 'casino', name: 'Future sight',    desc: 'Augmente les chances',
        cost: 5500,   at: [0.5, 2],  parents: ['rlt'],            fx: {luck: 0.22}},
    {   id: 'lu2', branch: 'casino', name: 'Corruption',      desc: 'Augment les chances',
        cost: 10000,  at: [0, 2.5],  parents: ['lu1', 'vip'],     fx: {luck: 0.44}},
    {   id: 'jac', branch: 'casino', name: 'Jackpot',         desc: 'Augmente les gains',
        cost: 1000000, at: [0, 3],    parents: ['lu2'],            fx: {jackpot: 1.5}},
    {   id: 'lot', branch: 'casino', name: 'Rachat',          desc: 'Debloque les autres branches',
        cost: 500000000, at: [0, 3.5], parents: ['jac'],          fx: {branch: 1}},

    // -----PRODUCTION---------------------
    {   id: 'gen', branch: 'idle',   name: 'Generateur',        desc: '+1 par seconde',
        cost: 15,     at: [0, 0.5],  parents: ['root'],           fx: {secAdd: 1}},
    {   id: 'ge2', branch: 'idle',   name: 'Chaines',           desc: '+8 par seconde',
        cost: 100,    at: [-0.5, 1], parents: ['gen'],         fx: {secAdd: 8}},
    {   id: 'sch', branch: 'idle',   name: 'Surtension',        desc: 'Production 4x',
        cost: 200,    at: [0.5, 1],  parents: ['gen'],         fx: {secMul: 4}},
    {   id: 'usi', branch: 'idle',   name: 'Usine',             desc: '+60 par seconde',
        cost: 2000,   at: [0, 1.5],  parents: ['ge2', 'sch'],  fx: {secAdd: 60}},
    {   id: 'bst', branch: 'idle',   name: 'Surtention',        desc: `Toutes les ${FEATURES.boost.spawnEverySeconds / 60} min, une icône bonus apparaît.`,
        cost: 3000,   at: [1, 1.5],  parents: ['ge2', 'sch'],  unlocks: ['boost']},
    {   id: 'res', branch: 'idle',   name: 'Réseau',            desc: 'Production x4',
        cost: 15000,  at: [0, 2],    parents: ['usi'],         fx: {secMul: 4}},
    {   id: 'nuc', branch: 'idle',   name: 'Nucléaire',         desc: 'Production 5x',
        cost: 100000, at: [0, 2.5],  parents: ['res'],         fx: {secMul: 5}},
    {   id: 'eto', branch: 'idle',   name: 'Etoile à neutron',  desc: 'Ameliore la surtension',
        cost: 1000000,at: [0, 3],    parents: ['nuc'],         fx: {bmult: 2}},
    {   id: 'uvi', branch: 'idle',   name: 'Galaxie',          desc: 'Debloque les autres branches',
        cost: 5000000, at: [0, 3.5], parents: ['eto'],          fx: {branch: 1}},
];

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const COLOR_NAMES = { green: 'vert', red: 'rouge', black: 'noir' };

function rouletteColor(number){
    if(number === 0){
        return 'green';
    }
    return RED_NUMBERS.includes(number) ? 'red' : 'black';
}

const GAMES = {
    coin: {
        label: 'Pile ou face',
        chance: 1/2,
        payout: 2,
        roll: (win) => (win ? 'Pile' : 'Face'),
    },

    roulette: {
        label: 'Roulette',
        choices: [
            {key: 'green', label: 'Vert',  chance: 1/35,  payout: 35, color: '#2e7d4f'},
            {key: 'red',   label: 'Rouge', chance: 17/35, payout: 2,  color: '#b3261e'},
            {key: 'black', label: 'Noir',  chance: 17/35, payout: 2,  color: '#25211f'},
        ],
        roll: (win, choice) => {
            const numbers = Array.from({length: 35}, (_, n) => n);
            const candidates = numbers.filter((n) => (rouletteColor(n) === choice) === win);
            const drawn = candidates[Math.floor(Math.random() * candidates.length)];
            return `Le ^${drawn} ${COLOR_NAMES[rouletteColor(drawn)]} est sortie`;
        },
    },
};
