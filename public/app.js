'use strict';

/* ─── CONSTANTS ─── */
const TIERS=[
  {lv:1,name:'Newcomer',min:0,max:499,color:'#6B7280'},
  {lv:2,name:'Chatter',min:500,max:1999,color:'#3B82F6'},
  {lv:3,name:'Active',min:2000,max:7999,color:'#10B981'},
  {lv:4,name:'Advisor',min:8000,max:24999,color:'#0D9488'},
  {lv:5,name:'Steward',min:25000,max:74999,color:'#7C3AED'},
  {lv:6,name:'Scholar',min:75000,max:199999,color:'#E8531F'},
  {lv:7,name:'Legend',min:200000,max:Infinity,color:'#F5A623'},
];
const BADGES=[
  {id:'founder',icon:'🌟',label:'Founder',desc:"Among PëKœ's first 10,000 members"},
  {id:'first_post',icon:'✍️',label:'First Post',desc:'Created your first post'},
  {id:'first_vote',icon:'▲',label:'First Vote',desc:'Voted for the first time'},
  {id:'hot_fan',icon:'🔥',label:'Hot Artist',desc:'Voted on 3 Hot Takes'},
  {id:'town_vet',icon:'⚔️',label:'Townhall Vet',desc:'Participated in 3 Townhalls'},
  {id:'checker',icon:'🔍',label:'Fact Checker',desc:'Flagged 3 posts for Verify'},
  {id:'joiner',icon:'🏘️',label:'Circle Member',desc:'Joined 3 Circles'},
  {id:'talker',icon:'💬',label:'Talker',desc:'Posted 5 comments'},
  {id:'giver',icon:'🤝',label:'Generous',desc:'Upvoted 10 posts'},
  {id:'poll_master',icon:'📊',label:'Poll Master',desc:'Created 3 polls'},
  {id:'streak_3',icon:'🔥',label:'On a Roll',desc:'3-day login streak'},
  {id:'streak_7',icon:'🌊',label:'Week Warrior',desc:'7-day login streak'},
  {id:'rater',icon:'⭐',label:'Star Rater',desc:'Rated 5 posts'},
  {id:'senti_wizard',icon:'🌡️',label:'Senti Wizard',desc:'Used the sentiment slider 3 times'},
];

const DAILY_QUESTS=[
  {id:'q_post',icon:'✍️',name:'Post something',desc:'Create 1 post',target:1,stat:'posts',reward:30},
  {id:'q_vote',icon:'▲',name:'Upvote 3 posts',desc:'Vote on content',target:3,stat:'votes',reward:20},
  {id:'q_comment',icon:'💬',name:'Comment twice',desc:'Join the conversation',target:2,stat:'comments',reward:25},
  {id:'q_ht',icon:'🔥',name:'Vote on Hot Take',desc:'Weigh in on 1 take',target:1,stat:'htvotes',reward:20},
  {id:'q_th',icon:'⚔️',name:'Join Townhall',desc:'Vote in a debate',target:1,stat:'ths',reward:25},
];

const AVCOLORS=['#E8531F','#7C3AED','#0D9488','#2563EB','#10B981','#F5A623','#EF4444','#00C9B1'];
const FAKE_USERS=['Priya_K','RohanV','Deepa_S','CricketBhai','TechGuru_Blr','mumbaikar_99','ChennaiExpress','dilli_dil','Meera_T','VijayB','SkyHigh_Ananya','CodeMonk_Raj','FilmFreak_Zoya','PolicyNerd_Dev'];
const EARN={post:5,upv_given:1,upv_rcv:3,comment:2,htvote:5,thvote:5,tharg:10,joinci:5,newci:20,flag:10,daily:50,poll:8,star:2,senti:1,quest:30};

/* ─── STATE ─── */
let S={
  user:null,
  posts:[],
  circles:[],
  hotTakes:[],
  thArgs:[],
  uVotes:{},uHTVotes:{},uTHVotes:{},uFlags:{},uStars:{},uSentis:{},uPolls:{},
  peksLog:[],badges:new Set(),
  stats:{posts:0,votes:0,comments:0,ths:0,htvotes:0,joins:0,flags:0,polls:0,stars:0,sentis:0},
  view:'home',liveUsers:22400,postType:'regular',
  streak:0,lastLogin:'',questProgress:{},
};

/* ─── API WRAPPER ─── */
const API = {
    token: localStorage.getItem('pk_token'),
    async fetch(url, options = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = this.token;
        try {
            const res = await fetch(url, { ...options, headers });
            const data = await res.json();
            if (res.status === 401) {
                if (this.token) this.logout();
                return null;
            }
            if (!res.ok) {
                toast('Error', data.error || 'Something went wrong', '❌');
                return null;
            }
            return data;
        } catch (e) {
            toast('Network Error', 'Check your connection or the server status', '📡');
            return null;
        }
    },
    logout() {
        localStorage.removeItem('pk_token');
        this.token = null;
        location.reload();
    }
};

/* ─── UTILS ─── */
function rnd(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function pick(a){return a[rnd(0,a.length-1)]}
function fmt(n){
    if (n === null || n === undefined) return '0';
    return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':''+n;
}
function ago(t){
    // SQLite CURRENT_TIMESTAMP is UTC. Append Z if not present to ensure UTC parsing.
    const dateStr = (t && !t.endsWith('Z')) ? t.replace(' ', 'T') + 'Z' : t;
    const d = new Date(dateStr);
    const diff = (new Date() - d) / 60000;
    const m = Math.floor(diff);
    return m < 1 ? 'just now' : m < 60 ? m+'m ago' : m < 1440 ? Math.floor(m/60)+'h ago' : Math.floor(m/1440)+'d ago';
}
function uid(){return 'u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)}
function tier(p){return TIERS.find(t=>p>=t.min&&p<=t.max)||TIERS[0]}
function nextTier(p){const t=tier(p);return TIERS.find(x=>x.lv===t.lv+1)||null}
function circ(id){return S.circles.find(c=>c.id===id)||{name:id,icon:'🏘️',accent:'#E8531F'}}
function ini(n){return n?n[0].toUpperCase():'?'}
function joined(id){return S.user?.joinedCircles?.includes(id)}
function bdgLabel(t){return{hot:'🔥 Hot Take',sage:'🧠 Sage Q&A',townhall:'⚔️ Townhall',regular:'💬 Post',poll:'📊 Poll'}[t]||'💬 Post'}
function bdgCls(t){return{hot:'bh',sage:'bs',townhall:'bt',regular:'br',poll:'bp'}[t]||'br'}
function vStatus(post){
  if(post.verified==='verified')return{cls:'bv',lbl:'✅ Verified'};
  if(post.verified==='false')return{cls:'bf',lbl:'❌ False'};
  if(post.verified==='misleading')return{cls:'bf',lbl:'⚠️ Misleading'};
  if(post.flagged)return{cls:'bf',lbl:'🔍 Under Review'};
  return null;
}

/* ─── XP FOUNTAIN ─── */
function spawnXP(x,y,amt){
  const f=document.getElementById('xp-fountain');
  if(!f) return;
  for(let i=0;i<Math.min(amt,6);i++){
    const p=document.createElement('div');
    p.className='xp-particle';
    const tx=(rnd(-60,60))+'px';
    const ty=(-rnd(60,140))+'px';
    p.style.cssText=`left:${x}px;top:${y}px;--tx:${tx};--ty:${ty};animation-delay:${i*0.08}s`;
    p.textContent=`+${amt}`;
    f.appendChild(p);
    setTimeout(()=>p.remove(),2000);
  }
}

/* ─── LOGIN ─── */
async function doLogin(){
  const name=document.getElementById('ln').value.trim();
  const email=document.getElementById('le').value.trim();
  if(!name||name.length<2){hilite('ln');return;}

  const res = await API.fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: name, email })
  });

  if (res && res.token) {
      localStorage.setItem('pk_token', res.token);
      API.token = res.token;
      S.user = res.user;
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      await initApp();
  }
}

function hilite(id){
  const el=document.getElementById(id);if(!el)return;
  el.style.borderColor='var(--red)';
  setTimeout(()=>el.style.borderColor='',1500);
}

/* ─── INIT ─── */
async function initApp(){
  const profileData = await API.fetch('/api/user/profile');
  if (profileData) {
      S.user = profileData.user;
      S.peksLog = profileData.history;
      S.badges = new Set(profileData.badges);
  }

  const circlesData = await API.fetch('/api/circles');
  if (circlesData) S.circles = circlesData;

  updateSB();
  renderSBCircles();
  populateCircleSelect();
  nav('home');
  startSim();

  const last=localStorage.getItem('pk_login');
  const today=new Date().toDateString();
  if(last!==today){
      localStorage.setItem('pk_login',today);
      setTimeout(()=>toast('Daily login bonus 🌅', '+50 PëKs awarded', '🏅'), 1200);
  }
  toast('Welcome back, ' + S.user.username + '!', 'You have '+fmt(S.user.peks)+' PëKs.', '🏡');
  
  // Register with socket for live updates
  if (window.socket) window.socket.emit('register', S.user.id);
}

function updateSB(){
  const t=tier(S.user?.peks||0);
  const a=document.getElementById('sbav');if(a){a.textContent=ini(S.user?.username);a.style.background=S.user?.avatar_color||'var(--ember)';}
  if(document.getElementById('sbn'))document.getElementById('sbn').textContent=S.user?.username||'—';
  if(document.getElementById('sbp'))document.getElementById('sbp').textContent=fmt(S.user?.peks||0)+' PëKs · '+t.name;
  if(document.getElementById('lc'))document.getElementById('lc').textContent=fmt(S.liveUsers);
  if(document.getElementById('streak-num'))document.getElementById('streak-num').textContent=S.user?.streak||1;
}

function renderSBCircles(){
  const el=document.getElementById('sbcirc');if(!el)return;
  el.innerHTML=S.circles.filter(c=>joined(c.id)).map(c=>`<div class="nitem" onclick="nav('circles')" style="font-size:.76rem">${c.icon} ${c.name}</div>`).join('');
}

function populateCircleSelect(){
  const sel=document.getElementById('pcirc');if(!sel)return;
  sel.innerHTML=S.circles.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

/* ─── NAV ─── */
let fsort='new';
async function nav(view){
  S.view=view;
  document.querySelectorAll('.nitem').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  const titles={home:'Home Feed',hottake:'🔥 Hot Takes',townhall:'⚔️ Townhall',circles:'🏘️ Circles',verify:'✅ Verify',profile:'👤 Profile',quests:'🎯 Daily Quests',leaderboard:'🏆 Leaderboard'};
  document.getElementById('ttl').textContent=titles[view]||view;
  const c=document.getElementById('content');c.innerHTML='<div style="text-align:center;padding:2rem;color:var(--text3)">Loading...</div>';
  
  if (view === 'home') await renderHome();
  else if (view === 'leaderboard') await renderLeaderboard();
  else if (view === 'profile') await renderProfile();
  else if (view === 'circles') await renderCircles();
  else if (view === 'verify') renderVerify();
  else if (view === 'quests') renderQuests();
  else if (view === 'hottake') renderHotTakes();
  else if (view === 'townhall') renderTownhall();
}

async function renderCircles(){
    const c = document.getElementById('content');
    c.innerHTML = `<div class="cgrid" id="clist"></div>`;
    const cl = document.getElementById('clist');
    S.circles.forEach(circ => {
        const div = document.createElement('div');
        div.className = 'ccard' + (joined(circ.id) ? ' joined' : '');
        div.innerHTML = `
            <div class="cicbig">${circ.icon}</div>
            <div class="cname">${circ.name}</div>
            <div class="cdesc">${circ.description}</div>
            <button class="jbtn ${joined(circ.id) ? 'joined' : ''}" onclick="joinCircle('${circ.id}', event)">${joined(circ.id) ? 'Joined' : 'Join Circle'}</button>
        `;
        cl.appendChild(div);
    });
}

async function joinCircle(id, evt){
    const res = await API.fetch('/api/circles/join', {
        method: 'POST',
        body: JSON.stringify({ circle_id: id })
    });
    if (res && res.success) {
        if (!S.user.joinedCircles.includes(id)) {
            S.user.joinedCircles.push(id);
            S.user.peks += 5;
            toast('Circle joined! 🏘️', '+5 PëKs awarded', '🏅');
            spawnXP(evt.clientX, evt.clientY, 5);
            updateSB();
            renderSBCircles();
            renderCircles();
        }
    }
}

function renderVerify(){
    const c = document.getElementById('content');
    c.innerHTML = `
        <div style="background:rgba(16,185,129,.05);border:1px solid rgba(16,185,129,.15);border-radius:12px;padding:1rem;margin-bottom:1rem;font-size:.8rem;color:var(--text2)">
            🛡️ <strong>Verify</strong> is PëKœ's peer-reviewed fact-checking layer. Earn <strong>+10 PëKs</strong> per accepted flag.
        </div>
        <div style="text-align:center;padding:3rem;color:var(--text3)">
            <div style="font-size:2rem;margin-bottom:1rem">🔍</div>
            No pending claims in your region. Check back later!
        </div>
    `;
}

function renderQuests(){
    const c = document.getElementById('content');
    c.innerHTML = `
        <div class="quests-panel">
            <div class="quest-title">🎯 Daily Quests <span class="quest-refresh">Resets in 8h 22m</span></div>
            ${DAILY_QUESTS.map(q => `
                <div class="quest-item">
                    <div class="quest-icon">${q.icon}</div>
                    <div class="quest-info">
                        <div class="quest-name">${q.name}</div>
                        <div class="quest-prog">
                            <div class="quest-bar"><div class="quest-fill" style="width:0%"></div></div>
                            <div class="quest-progtext">0/${q.target}</div>
                        </div>
                    </div>
                    <div class="quest-reward">+${q.reward} PëKs</div>
                </div>
            `).join('')}
        </div>
    `;
}

async function renderHotTakes(){
    const c = document.getElementById('content');
    c.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text3)">Stoking the fire... 🔥</div>';
    
    const takes = await API.fetch('/api/posts?sort=hot');
    if (!takes) return;

    c.innerHTML = `
        <div class="tklayout" id="tk-list"></div>
    `;
    const tkl = document.getElementById('tk-list');
    takes.forEach(t => {
        const div = document.createElement('div');
        div.className = 'tkcard';
        div.id = 'ht-' + t.id;
        div.innerHTML = `
            <div class="tkh">
                <div class="tktitle">${t.title}</div>
                <div class="tkmeta">shared by ${t.username} · ${ago(t.created_at)}</div>
            </div>
            <div class="tkbody">
                <div class="tkoption" onclick="voteHotTake('${t.id}', 'up', event)">
                    <div class="tktext">Agree</div>
                    <div class="tkvotes" id="ht-up-${t.id}">${fmt(t.votes || 0)}</div>
                </div>
                <div class="tkoption" onclick="voteHotTake('${t.id}', 'down', event)">
                    <div class="tktext">Disagree</div>
                    <div class="tkvotes" id="ht-dn-${t.id}">${fmt(t.dn || 0)}</div>
                </div>
            </div>
            <div class="tktimer">🔥 Live Debate · ${fmt(t.votes + t.dn)} members weighed in</div>
        `;
        tkl.appendChild(div);
    });
}

async function voteHotTake(id, dir, evt){
    const res = await API.fetch(`/api/posts/${id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ type: dir })
    });
    if (res && res.success) {
        evt.currentTarget.parentElement.querySelectorAll('.tkoption').forEach(b => b.classList.remove('myvote'));
        evt.currentTarget.classList.add('myvote');
    }
}

async function renderTownhall(){
    const c = document.getElementById('content');
    c.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text3)">Preparing the floor... ⚔️</div>';
    
    const posts = await API.fetch('/api/posts');
    if (!posts) return;
    
    const ths = posts.filter(p => p.type === 'townhall');

    c.innerHTML = `
        <div id="th-list"></div>
    `;
    const thl = document.getElementById('th-list');
    ths.forEach(t => {
        const total = (t.votes || 0) + (t.dn || 0);
        const pctA = total === 0 ? 0 : Math.round((t.votes || 0) / total * 100);
        const pctB = total === 0 ? 0 : 100 - pctA;

        const div = document.createElement('div');
        div.className = 'thcard';
        div.id = 'th-' + t.id;
        div.innerHTML = `
            <div class="thh">
                <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text3)">Live Debate</div>
                <div class="nicon">⚔️</div>
            </div>
            <div class="thq">${t.title}</div>
            <div class="vbars">
                <div class="vbrow">
                    <div class="vblabel">${t.sideA || 'Side A'}</div>
                    <div class="vbtrack"><div class="vbfill" id="th-fill-a-${t.id}" style="width:${pctA}%;background:var(--grad-ember)"></div></div>
                    <div class="vbpct" id="th-pct-a-${t.id}">${pctA}%</div>
                </div>
                <div class="vbrow">
                    <div class="vblabel">${t.sideB || 'Side B'}</div>
                    <div class="vbtrack"><div class="vbfill" id="th-fill-b-${t.id}" style="width:${pctB}%;background:var(--blue)"></div></div>
                    <div class="vbpct" id="th-pct-b-${t.id}">${pctB}%</div>
                </div>
            </div>
            <div class="thvbtns">
                <button class="thvbtn thva ${t.userVote === 'up' ? 'voted' : ''}" onclick="voteTownhall('${t.id}', 'up', event)">Support ${t.sideA || 'Side A'}</button>
                <button class="thvbtn thvb ${t.userVote === 'down' ? 'voted' : ''}" onclick="voteTownhall('${t.id}', 'down', event)">Support ${t.sideB || 'Side B'}</button>
            </div>
        `;
        thl.appendChild(div);
    });
}

async function voteTownhall(id, dir, evt){
    const res = await API.fetch(`/api/posts/${id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ type: dir })
    });
    if (res && res.success) {
        evt.target.parentElement.querySelectorAll('.thvbtn').forEach(b => b.classList.remove('voted'));
        // If we toggled the same side off, res.userVote might be null (assuming backend returns it)
        // But for now, let's just highlight what was clicked
        evt.target.classList.add('voted');
    }
}



async function renderHome(){
  const c=document.getElementById('content');
  const sb=document.createElement('div');sb.className='sbar';
  sb.innerHTML=['🔥 Hot','✨ New','⬆️ Top','🧠 Sage','📊 Polls'].map((l,i)=>{
    const keys=['hot','new','top','sage','polls'];
    return`<button class="sbtn${fsort===keys[i]?' active':''}" onclick="fsort='${keys[i]}';nav('home')">${l}</button>`;
  }).join('');
  c.innerHTML = '';
  c.appendChild(sb);

  const posts = await API.fetch('/api/posts?sort=' + fsort);
  if (posts) {
      S.posts = posts;
      posts.forEach(p=>c.appendChild(mkCard(p)));
  }
}

/* ─── INTERACTIONS ─── */
async function vpost(pid,dir,evt){
  const res = await API.fetch(`/api/posts/${pid}/vote`, {
      method: 'POST',
      body: JSON.stringify({ type: dir })
  });
  if (res && res.success) {
      const ue=document.getElementById('ups-'+pid);if(ue)ue.textContent=fmt(res.votes);
      const de=document.getElementById('dns-'+pid);if(de)de.textContent=fmt(res.dn);
      
      const p = S.posts.find(x => x.id === pid);
      if (p) { p.votes = res.votes; p.dn = res.dn; }
  }
}

async function addCmt(pid){
  const inp = document.getElementById('cin-' + pid);
  const text = inp.value.trim();
  if (!text) return;

  const res = await API.fetch(`/api/posts/${pid}/comment`, {
      method: 'POST',
      body: JSON.stringify({ text })
  });

  if (res) {
      inp.value = '';
      const list = document.getElementById('cl-' + pid);
      const div = document.createElement('div');
      div.className = 'citem';
      div.innerHTML = `<div class="cav" style="background:${res.avatar_color}">${ini(res.username)}</div><div><div class="cmeta">${res.username} <span style="color:var(--text3);font-weight:400;font-size:.63rem">just now</span></div><div class="ctext">${res.text}</div></div>`;
      list.prepend(div);
      const cn = document.getElementById('cn-' + pid);
      if (cn) cn.textContent = parseInt(cn.textContent) + 1;
  }
}

function mkCard(post){
  const circle=circ(post.circle_id);
  const vs=vStatus(post);
  const div=document.createElement('div');
  div.className='card';
  div.id='card-'+post.id;
  const isScholar=post.username==='DrMeeraK'||post.username==='UPSCRavi';
  const showPoll=post.type==='poll'&&post.poll_data;

  div.innerHTML=`
    <div class="ch">
      <div class="av" style="background:${post.avatar_color || '#E8531F'}">${ini(post.username)}</div>
      <div style="flex:1">
        <div class="puser">${post.username}${isScholar?'<span class="schip" style="margin-left:.4rem">🧠 Scholar</span>':''}</div>
        <div class="pcirc" onclick="nav('circles')">${circle.icon} ${circle.name}</div>
      </div>
      <div class="ptime">${ago(post.created_at)}</div>
    </div>
    <div style="margin-bottom:.5rem">
      <span class="pbadge ${bdgCls(post.type)}">${bdgLabel(post.type)}</span>
      ${vs?`<span class="pbadge ${vs.cls}" style="margin-left:.3rem">${vs.lbl}</span>`:''}
    </div>
    <div class="ptitle">${post.title}</div>
    ${post.body&&!showPoll?`<div class="pbody">${post.body}</div>`:''}
    
    ${showPoll ? `<div id="poll-${post.id}" class="poll-wrap">${renderPollUI(post.id, post.poll_data)}</div>` : ''}

    <div class="pacts">
      <button class="abtn" onclick="vpost('${post.id}','up',event)">▲ <span id="ups-${post.id}">${fmt(post.votes || 0)}</span></button>
      <button class="abtn" onclick="vpost('${post.id}','down',event)">▼ <span id="dns-${post.id}">${fmt(post.dn || 0)}</span></button>
      <button class="abtn" onclick="togCmts('${post.id}')">💬 <span id="cn-${post.id}">...</span></button>
      <button class="abtn" onclick="toast('Link copied!','Share it — even non-members can read 🔗','↗')">↗</button>
    </div>
    <div id="cmts-${post.id}" class="csec hidden">
      <div class="cir">
        <input class="cin" id="cin-${post.id}" placeholder="Add a comment…" onkeydown="if(event.key==='Enter')addCmt('${post.id}')"/>
        <button class="bsm" onclick="addCmt('${post.id}')">Reply +2</button>
      </div>
      <div id="cl-${post.id}">Loading comments...</div>
    </div>`;
  return div;
}

function renderPollUI(pid, data){
    if (!data || !data.options) return '';
    const total = data.totalVotes || 0;
    return data.options.map((opt, i) => {
        const pct = total === 0 ? 0 : Math.round((opt.votes || 0) / total * 100);
        return `
            <div class="poll-option" onclick="castPollVote('${pid}', ${i})">
                <div class="poll-bar" style="width:${pct}%"></div>
                <div class="poll-circle"></div>
                <div class="poll-text">${opt.text}</div>
                <div class="poll-pct">${pct}%</div>
            </div>
        `;
    }).join('') + `<div class="poll-meta">${fmt(total)} votes · Live Poll</div>`;
}

async function castPollVote(pid, idx){
    const res = await API.fetch(`/api/posts/${pid}/poll-vote`, {
        method: 'POST',
        body: JSON.stringify({ optionIndex: idx })
    });
    if (res && res.success) {
        toast('Vote cast! 📊', '+8 PëKs awarded', '🏅');
        updateSB();
    }
}

async function togCmts(pid){
    const el = document.getElementById('cmts-' + pid);
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
        const list = document.getElementById('cl-' + pid);
        const cmts = await API.fetch(`/api/posts/${pid}/comments`);
        if (cmts) {
            list.innerHTML = cmts.length ? cmts.map(c=>`<div class="citem"><div class="cav" style="background:${c.avatar_color || 'var(--ember)'}">${ini(c.username)}</div><div><div class="cmeta">${c.username} <span style="color:var(--text3);font-weight:400;font-size:.63rem">${ago(c.created_at)}</span></div><div class="ctext">${c.text}</div></div></div>`).join('') : '<div style="font-size:.76rem;color:var(--text3);padding:.35rem 0">No comments yet — be first!</div>';
            const cn = document.getElementById('cn-' + pid);
            if (cn) cn.textContent = cmts.length;
        }
    }
}

/* ─── MODAL ─── */
function openModal(){document.getElementById('moverlay').classList.remove('hidden')}
function closeModal(){
  document.getElementById('moverlay').classList.add('hidden');
  document.getElementById('ptitle').value='';
  document.getElementById('pbody').value='';
  document.getElementById('thextra').classList.add('hidden');
  document.getElementById('pollextra').classList.add('hidden');
  S.postType='regular';
}
function selType(type,btn){
  S.postType=type;
  if(btn){document.querySelectorAll('.tbtn').forEach(b=>b.classList.remove('sel'));btn.classList.add('sel');}
  document.getElementById('thextra').classList.toggle('hidden',type!=='townhall');
  document.getElementById('pollextra').classList.toggle('hidden',type!=='poll');
}
async function submitPost(){
  const title=document.getElementById('ptitle').value.trim();
  if(!title){hilite('ptitle');return;}
  const cid=document.getElementById('pcirc').value;
  const body=document.getElementById('pbody').value.trim();
  
  let poll_data = null;
  if (S.postType === 'poll') {
      const opts = document.getElementById('pollopts').value.split('\n').map(t => t.trim()).filter(t => t);
      if (opts.length < 2) { hilite('pollopts'); return; }
      poll_data = {
          options: opts.map(o => ({ text: o, votes: 0 })),
          totalVotes: 0
      };
  }

  const postData = {
      id: Math.random().toString(36).substr(2, 9),
      type: S.postType,
      circle_id: cid,
      title,
      body,
      sideA: document.getElementById('tha')?.value.trim(),
      sideB: document.getElementById('thb')?.value.trim(),
      poll_data
  };

  const res = await API.fetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify(postData)
  });

  if (res && res.success) {
      closeModal();
      nav('home');
      toast('Post published!', `"${title.slice(0,42)}…" is live`, '✍️');
  }
}

/* ─── TOASTS ─── */
function toast(title,desc,icon='ℹ️'){
  const c=document.getElementById('toasts');
  const d=document.createElement('div');d.className='toast';
  d.innerHTML=`<div class="tico">${icon}</div><div class="tmsg"><div class="tttl">${title}</div><div class="tdsc">${desc}</div></div><div class="tx" onclick="this.parentElement.remove()">✕</div>`;
  c.appendChild(d);
  if(c.children.length>4) c.firstElementChild.remove();
  setTimeout(()=>d.remove(),5500);
}

/* ─── LEADERBOARD ─── */
async function renderLeaderboard(){
    const c = document.getElementById('content');
    const board = await API.fetch('/api/leaderboard');
    if (!board) return;

    c.innerHTML = `
        <div class="lb-panel">
            <div class="lb-title">🏆 Top Members — All Time</div>
            <div id="lb-list"></div>
        </div>`;
    const lb = document.getElementById('lb-list');
    board.forEach((u, i) => {
        const rank = i + 1;
        const crown = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;
        const row = document.createElement('div');
        row.className = 'lb-row' + (u.name === S.user.username ? ' me' : '');
        row.innerHTML = `<div class="lb-rank">${crown}</div><div class="lb-av" style="background:${u.av}">${ini(u.name)}</div><div style="flex:1"><div class="lb-name">${u.name}</div></div><div class="lb-peks">${fmt(u.peks)}</div>`;
        lb.appendChild(row);
    });
}

/* ─── PROFILE ─── */
async function renderProfile(){
    const c = document.getElementById('content');
    const t = tier(S.user.peks);
    c.innerHTML = `
        <div class="phead">
            <div class="pavbig" style="background:${S.user.avatar_color}">${ini(S.user.username)}</div>
            <div class="pname">${S.user.username}</div>
            <div class="ptier" style="color:${t.color};border-color:${t.color}">${t.name}</div>
            <div class="pksbig">${fmt(S.user.peks)}</div>
            <div class="pklbl">PëKs earned · 🔥 ${S.user.streak} day streak</div>
        </div>
        <div class="plog">
            <div style="font-family:var(--fd);font-size:.88rem;font-weight:700;margin-bottom:.85rem">PëKs Earning History</div>
            ${S.peksLog.map(l => `<div class="logitem"><div class="logdesc">${l.reason}</div><div class="logpts">+${l.amt}</div></div>`).join('')}
        </div>
        <div style="margin-top:1rem;text-align:center"><button onclick="API.logout()" class="btn-p" style="width:auto;padding:.5rem 1rem">Logout</button></div>`;
}

/* ─── SIMULATION ─── */
function startSim(){
    setInterval(() => {
        S.liveUsers += rnd(-5, 5);
        const lc = document.getElementById('lc');
        if (lc) lc.textContent = fmt(S.liveUsers);
    }, 5000);
}

/* ─── BOOT ─── */
(async function(){
  // Socket.io for live updates
  const socket = io();
  window.socket = socket; // Make it globally accessible for registration
  
  socket.on('balanceUpdate', (data) => {
      console.log("Balance update received:", data);
      S.user.peks = data.peks;
      updateSB();
      toast('PëKs Updated! 🏅', data.reason, '✨');
      // Spawn XP in a random top-right area for balance updates
      spawnXP(window.innerWidth - 100, 100, data.amt);
  });

  socket.on('voteUpdate', (data) => {
      const ue = document.getElementById('ups-' + data.postId);
      const de = document.getElementById('dns-' + data.postId);
      if (ue) ue.textContent = fmt(data.votes);
      if (de) de.textContent = fmt(data.dn);
      // Update local state too
      const p = S.posts.find(x => x.id === data.postId);
      if (p) { p.votes = data.votes; p.dn = data.dn; }
      
      // Update Hot Take view if active
      const hue = document.getElementById('ht-up-' + data.postId);
      const hde = document.getElementById('ht-dn-' + data.postId);
      if (hue) hue.textContent = fmt(data.votes);
      if (hde) hde.textContent = fmt(data.dn);

      // Update Townhall view if active
      const tfa = document.getElementById('th-fill-a-' + data.postId);
      const tfb = document.getElementById('th-fill-b-' + data.postId);
      const tpa = document.getElementById('th-pct-a-' + data.postId);
      const tpb = document.getElementById('th-pct-b-' + data.postId);
      if (tfa && tfb) {
          const total = (data.votes || 0) + (data.dn || 0);
          const pctA = total === 0 ? 0 : Math.round((data.votes || 0) / total * 100);
          const pctB = total === 0 ? 0 : 100 - pctA;
          tfa.style.width = pctA + '%';
          tfb.style.width = pctB + '%';
          tpa.textContent = pctA + '%';
          tpb.textContent = pctB + '%';
      }
  });

  socket.on('pollUpdate', (data) => {
      const el = document.getElementById('poll-' + data.postId);
      if (el) el.innerHTML = renderPollUI(data.postId, data.pollData);
      const p = S.posts.find(x => x.id === data.postId);
      if (p) p.poll_data = data.pollData;
  });

  socket.on('newPost', (post) => {
      if (S.view === 'home') {
          const c = document.getElementById('content');
          const sbar = c.querySelector('.sbar');
          if (sbar) {
              const card = mkCard(post);
              sbar.after(card);
              card.style.animation = 'tin 0.5s ease-out';
          }
      }
      S.posts.unshift(post);
      if (post.username !== S.user.username) {
          toast('New post!', `${post.username} just shared something in ${circ(post.circle_id).name}`, '✨');
      }
  });

  socket.on('newComment', (cmt) => {
      const list = document.getElementById('cl-' + cmt.post_id);
      if (list) {
          const div = document.createElement('div');
          div.className = 'citem';
          div.innerHTML = `<div class="cav" style="background:${cmt.avatar_color || 'var(--ember)'}">${ini(cmt.username)}</div><div><div class="cmeta">${cmt.username} <span style="color:var(--text3);font-weight:400;font-size:.63rem">just now</span></div><div class="ctext">${cmt.text}</div></div>`;
          list.prepend(div);
          const cn = document.getElementById('cn-' + cmt.post_id);
          if (cn) cn.textContent = parseInt(cn.textContent) + 1;
      }
      if (cmt.username !== S.user.username) {
          // Notify if it's the current user's post? (Need to track post ownership better)
      }
  });

  if(API.token){
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      await initApp();
  }
})();
