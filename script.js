// ---- Données de l’arbre ----
// x, y : position dans la grille ; parents : tous requis
// br : voie (click / casino / idle). Le premier nœud de voie acheté ferme les deux autres, définitivement.
// fx : ca/pa = bonus fixe clic/seconde ; cm/pm/gm = multiplicateurs clic/seconde/global
//      luck = chances de gagner au casino (+0,25 = +25 %) ; jp = multiplicateur des gains
const NODES = [
  {id:'root', name:'Unité mère', desc:'Point de départ. Choisissez une voie.', cost:0, x:3, y:0, parents:[], fx:{}},

  // Voie CLIC : les unités par clic explosent
  {id:'fil', br:'click', name:'Filaments',     desc:'+1 par clic. Choix définitif.', cost:15,     x:0.5, y:1, parents:['root'],      fx:{ca:1}},
  {id:'pre', br:'click', name:'Pression',      desc:'+5 par clic.',                  cost:100,    x:0,   y:2, parents:['fil'],       fx:{ca:5}},
  {id:'clu', br:'click', name:'Amas',          desc:'Clics ×2.',                     cost:400,    x:1,   y:2, parents:['fil'],       fx:{cm:2}},
  {id:'res', br:'click', name:'Résonance',     desc:'Clics ×3.',                     cost:3000,   x:0.5, y:3, parents:['pre','clu'], fx:{cm:3}},
  {id:'mar', br:'click', name:'Marteau-pilon', desc:'+100 par clic.',                cost:15000,  x:0.5, y:4, parents:['res'],       fx:{ca:100}},
  {id:'tit', br:'click', name:'Titan',         desc:'Clics ×5.',                     cost:100000, x:0.5, y:5, parents:['mar'],       fx:{cm:5}},

  // Voie CASINO : on mise des unités, le hasard décide
  {id:'gbl', br:'casino', name:'Casino',            desc:'Pile ou face, ×2. Choix définitif.',  cost:20,    x:3,   y:1, parents:['root'],      fx:{}},
  {id:'rlt', br:'casino', name:'Roulette',          desc:'Un numéro, ×35 (1 chance sur 37).',   cost:200,   x:2.5, y:2, parents:['gbl'],       fx:{}},
  {id:'lu1', br:'casino', name:'Trèfle',            desc:'Chances de gagner +25 %.',            cost:500,   x:3.5, y:2, parents:['gbl'],       fx:{luck:0.25}},
  {id:'lu2', br:'casino', name:'Croupier complice', desc:'Chances de gagner +50 %.',            cost:5000,  x:3.5, y:3, parents:['lu1'],       fx:{luck:0.5}},
  {id:'jac', br:'casino', name:'Jackpot',           desc:'Tous les gains ×1,5.',                cost:20000, x:3,   y:4, parents:['rlt','lu2'], fx:{jp:1.5}},

  // Voie PRODUCTION : génération par seconde
  {id:'gen', br:'idle', name:'Générateur', desc:'+1 par seconde. Choix définitif.', cost:15,    x:5.5, y:1, parents:['root'],      fx:{pa:1}},
  {id:'g2',  br:'idle', name:'Chaîne',     desc:'+5 par seconde.',                  cost:100,   x:5,   y:2, parents:['gen'],       fx:{pa:5}},
  {id:'g3',  br:'idle', name:'Surcharge',  desc:'Production ×2.',                   cost:500,   x:6,   y:2, parents:['gen'],       fx:{pm:2}},
  {id:'g4',  br:'idle', name:'Usine',      desc:'+50 par seconde.',                 cost:4000,  x:5.5, y:3, parents:['g2','g3'],   fx:{pa:50}},
  {id:'g5',  br:'idle', name:'Réseau',     desc:'Production ×3.',                   cost:30000, x:5.5, y:4, parents:['g4'],        fx:{pm:3}},
];
const SAVE_KEY = 'skill_tree-save-v1';
const CELL_X = 170, CELL_Y = 120, NODE_W = 140, NODE_H = 92, PAD = 15;
const $ = id => document.getElementById(id);
const byId = Object.fromEntries(NODES.map(n => [n.id, n]));
let state = {unites:0, owned:{root:true}, branch:null, saved:Date.now()};

// ---- Calculs ----
function stats(){
  let ca=1, cm=1, pa=0, pm=1, gm=1, luck=0, jp=1;
  for(const n of NODES){ if(!state.owned[n.id]) continue;
    const f=n.fx; ca+=f.ca||0; pa+=f.pa||0; cm*=f.cm||1; pm*=f.pm||1; gm*=f.gm||1;
    luck+=f.luck||0; jp*=f.jp||1; }
  return {click:ca*cm*gm, cps:pa*pm*gm, luck, jp};
}
function fmt(n){
  if(n<1000) return n<10 && n%1 ? n.toFixed(1).replace('.',',') : String(Math.floor(n));
  const u=['k','M','Md','B','Bd']; let i=-1;
  while(n>=1000 && i<u.length-1){ n/=1000; i++; }
  return n.toFixed(2).replace('.',',')+' '+u[i];
}
// Une voie est fermée si une autre voie a déjà été choisie
const isBlocked = n => !!(n.br && state.branch && state.branch !== n.br);
const isAvailable = n => !state.owned[n.id] && !isBlocked(n) && n.parents.every(p => state.owned[p]);

// ---- Achat (avec confirmation pour le choix de voie) ----
let armedId = null, armedTimer;
function buy(id){
  const n=byId[id];
  if(!isAvailable(n) || state.unites<n.cost) return;
  if(n.br && !state.branch){
    if(armedId!==id){
      armedId=id; clearTimeout(armedTimer);
      armedTimer=setTimeout(()=>{ armedId=null; render(); },3000);
      render(); return;
    }
    state.branch=n.br; armedId=null;
  }
  state.unites-=n.cost; state.owned[id]=true; render(); save();
}
$('gather').onclick = () => { state.unites += stats().click; render(); };

// ---- Casino ----
const GAMES = {
  coin:     {base:1/2,  mult:2,  label:'Pile ou face'},
  roulette: {base:1/37, mult:35, label:'Roulette'},
};
const chance = kind => Math.min(0.95, GAMES[kind].base * (1 + stats().luck));

function buildCasino(){
  const box=document.createElement('section'); box.id='casino'; box.hidden=true;
  box.innerHTML=`<h2>Casino</h2>
    <div class="bet-row">
      <label>Mise <input id="bet" type="number" min="1" step="1" value="10"></label>
      <button type="button" class="ghost" id="bet-half">½</button>
      <button type="button" class="ghost" id="bet-max">Max</button>
    </div>
    <div class="games">
      <button type="button" id="play-coin"></button>
      <span id="roulette-ui">
        <label>Numéro <input id="pick" type="number" min="0" max="36" value="7"></label>
        <button type="button" id="play-roulette"></button>
      </span>
    </div>
    <p id="casino-msg" aria-live="polite"></p>`;
  const wrap=document.querySelector('.tree-wrap');
  wrap.parentNode.insertBefore(box,wrap);
  $('bet-half').onclick=()=>{ $('bet').value=Math.max(1,Math.floor(state.unites/2)); };
  $('bet-max').onclick =()=>{ $('bet').value=Math.max(1,Math.floor(state.unites)); };
  $('play-coin').onclick     =()=>play('coin');
  $('play-roulette').onclick =()=>play('roulette');
}
function play(kind){
  const out=$('casino-msg'), s=stats(), g=GAMES[kind];
  const bet=Math.floor(Number($('bet').value));
  if(!(bet>=1))          { out.textContent='Entrez une mise d’au moins 1 unité.'; return; }
  if(bet>state.unites)   { out.textContent='Pas assez d’unités pour cette mise.'; return; }
  state.unites-=bet;
  const win=Math.random()<chance(kind);
  const gain=Math.floor(bet*g.mult*s.jp);
  if(kind==='coin'){
    if(win) state.unites+=gain;
    out.textContent = win ? `Pile ! Vous gagnez ${fmt(gain-bet)} unités.` : `Face… vous perdez ${fmt(bet)} unités.`;
  } else {
    const pick=Math.min(36,Math.max(0,Math.floor(Number($('pick').value)||0)));
    let drawn=pick;
    if(!win){ do{ drawn=Math.floor(Math.random()*37); }while(drawn===pick); }
    if(win) state.unites+=gain;
    out.textContent = win ? `Le ${drawn} sort ! Vous gagnez ${fmt(gain-bet)} unités.` : `Le ${drawn} sort… vous perdez ${fmt(bet)} unités.`;
  }
  render(); save();
}

// ---- Rendu ----
function build(){
  const tree=$('tree'), svg=$('links');
  const pos = n => ({x:PAD+n.x*CELL_X, y:PAD+n.y*CELL_Y});
  for(const n of NODES){
    for(const p of n.parents){
      const a=pos(byId[p]), b=pos(n), l=document.createElementNS('http://www.w3.org/2000/svg','line');
      l.setAttribute('x1',a.x+NODE_W/2); l.setAttribute('y1',a.y+NODE_H);
      l.setAttribute('x2',b.x+NODE_W/2); l.setAttribute('y2',b.y);
      l.dataset.from=p; l.dataset.to=n.id; svg.appendChild(l);
    }
    const el=document.createElement('button');
    el.className='node'; el.id='n-'+n.id; el.type='button';
    el.style.left=pos(n).x+'px'; el.style.top=pos(n).y+'px';
    el.innerHTML=`<b>${n.name}</b><small>${n.desc}</small><span class="cost"></span>`;
    el.onclick=()=>buy(n.id);
    tree.appendChild(el);
  }
  buildCasino();
}
function render(){
  const s=stats();
  $('unites').textContent=fmt(state.unites);
  $('cps').textContent=fmt(s.cps);
  $('cpc').textContent=fmt(s.click);
  for(const n of NODES){
    const el=$('n-'+n.id), owned=!!state.owned[n.id], av=isAvailable(n), blocked=isBlocked(n);
    el.classList.toggle('owned',owned);
    el.classList.toggle('available',av);
    el.classList.toggle('blocked',blocked&&!owned);
    el.classList.toggle('locked',!owned&&!av);
    el.classList.toggle('afford',av&&state.unites>=n.cost);
    el.setAttribute('aria-disabled', String(owned||!av));
    el.querySelector('.cost').textContent =
      owned ? 'Acquis' :
      blocked ? 'Voie fermée' :
      armedId===n.id ? 'Définitif : recliquez' :
      fmt(n.cost)+' unités';
  }
  document.querySelectorAll('#links line').forEach(l=>l.classList.toggle('on',!!state.owned[l.dataset.from]&&!!state.owned[l.dataset.to]));

  // Panneau casino : visible seulement une fois le nœud « Casino » acquis
  $('casino').hidden=!state.owned.gbl;
  $('roulette-ui').hidden=!state.owned.rlt;
  const pct = k => (chance(k)*100).toFixed(k==='coin'?0:1).replace('.',',');
  $('play-coin').textContent=`Pile ou face · ×${GAMES.coin.mult} · ${pct('coin')} %`;
  $('play-roulette').textContent=`Roulette · ×${GAMES.roulette.mult} · ${pct('roulette')} %`;
}

// ---- Boucle de jeu ----
let last=performance.now();
setInterval(()=>{
  const now=performance.now(), dt=(now-last)/1000; last=now;
  state.unites+=stats().cps*dt; render();
},100);
setInterval(()=>save(),5000);

// ---- Sauvegarde ----
function save(){
  try{ state.saved=Date.now(); localStorage.setItem(SAVE_KEY,JSON.stringify(state)); }catch(e){}
}
function load(){
  try{
    const raw=localStorage.getItem(SAVE_KEY); if(!raw) return;
    const d=JSON.parse(raw); state={...state,...d,owned:{root:true,...d.owned}};
    // Retrouve la voie choisie si l’ancienne sauvegarde ne la contenait pas
    state.branch = state.branch || (NODES.find(n=>n.br && state.owned[n.id])||{}).br || null;
    const secs=Math.min((Date.now()-d.saved)/1000, 8*3600), gain=stats().cps*secs;
    if(gain>=1){ state.unites+=gain; $('msg').textContent=`Pendant votre absence : +${fmt(gain)} unités.`; }
  }catch(e){}
}
$('save').onclick=()=>{ save(); $('msg').textContent='Partie sauvegardée.'; };
let armed=false;
$('reset').onclick=()=>{
  if(!armed){ armed=true; $('reset').textContent='Confirmer la réinitialisation'; setTimeout(()=>{armed=false;$('reset').textContent='Réinitialiser';},3000); return; }
  state={unites:0,owned:{root:true},branch:null,saved:Date.now()}; armed=false;
  $('reset').textContent='Réinitialiser'; $('msg').textContent='Partie réinitialisée.'; save(); render();
};

build(); load(); render();
