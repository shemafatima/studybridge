const SUPABASE_URL = "https://ssfbdfhfixichjnkphea.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_by6oR8GcnE3GspRV_rWeIw_en8eAC2A";
const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

/* ===================================================================
   StudyBridge — localStorage-backed app logic
   Collections stored under keys prefixed "sb_"
=================================================================== */

const DB = {
  get(key){ try{ return JSON.parse(localStorage.getItem(key)) || []; }catch(e){ return []; } },
  set(key, val){ localStorage.setItem(key, JSON.stringify(val)); },
};

const KEYS = {
  users:'sb_users', groups:'sb_groups', attendance:'sb_attendance',
  notes:'sb_notes', announcements:'sb_announcements', quizzes:'sb_quizzes',
  results:'sb_results', missed:'sb_missed', messages:'sb_messages', session:'sb_session'
};

function uid(prefix){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function fmtDate(d){
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
}
function fmtDateTime(iso){
  const dt = new Date(iso);
  return dt.toLocaleDateString(undefined, {month:'short', day:'numeric'}) + ' · ' +
         dt.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
}
function genCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for(let i=0;i<6;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------- Session ---------------- */
function getSession(){ const s = localStorage.getItem(KEYS.session); return s ? JSON.parse(s) : null; }
function setSession(userId){ localStorage.setItem(KEYS.session, JSON.stringify({userId})); }
function clearSession(){ localStorage.removeItem(KEYS.session); }
function currentUser(){
  const s = getSession();
  if(!s) return null;
  return DB.get(KEYS.users).find(u => u.id === s.userId) || null;
}

/* ---------------- Data helpers ---------------- */
function allUsers(){ return DB.get(KEYS.users); }
function allGroups(){ return DB.get(KEYS.groups); }
function studentGroups(userId){ return allGroups().filter(g => g.students.includes(userId)); }
function teacherGroups(userId){ return allGroups().filter(g => g.teacherId === userId); }
function groupById(id){ return allGroups().find(g => g.id === id); }
function userById(id){ return allUsers().find(u => u.id === id); }

function notesForGroup(gid){ return DB.get(KEYS.notes).filter(n => n.groupId === gid).sort((a,b)=>b.date.localeCompare(a.date)); }
function announcementsForGroup(gid){ return DB.get(KEYS.announcements).filter(a => a.groupId === gid).sort((a,b)=>b.date.localeCompare(a.date)); }
function quizzesForGroup(gid){ return DB.get(KEYS.quizzes).filter(q => q.groupId === gid); }
function messagesForGroup(gid){ return DB.get(KEYS.messages).filter(m => m.groupId === gid).sort((a,b)=>b.date.localeCompare(a.date)); }
function attendanceForGroup(gid){ return DB.get(KEYS.attendance).filter(a => a.groupId === gid); }
function missedForGroup(gid){ return DB.get(KEYS.missed).filter(m => m.groupId === gid); }
function resultFor(quizId, studentId){ return DB.get(KEYS.results).find(r => r.quizId === quizId && r.studentId === studentId); }

/* =========================================================
   AUTH
========================================================= */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('loginForm').classList.toggle('hidden', tab!=='login');
    document.getElementById('signupForm').classList.toggle('hidden', tab!=='signup');
  });
});

document.getElementById('signupForm').addEventListener('submit', e=>{
  e.preventDefault();
  const name = document.getElementById('suName').value.trim();
  const email = document.getElementById('suEmail').value.trim().toLowerCase();
  const password = document.getElementById('suPassword').value;
  const role = document.getElementById('suRole').value;
  const errEl = document.getElementById('signupError');
  errEl.textContent = '';

  if(password.length < 4){ errEl.textContent = 'Password must be at least 4 characters.'; return; }
  const users = allUsers();
  if(users.some(u => u.email === email)){ errEl.textContent = 'An account with this email already exists.'; return; }

  const user = { id: uid('u'), name, email, password, role };
  users.push(user);
  DB.set(KEYS.users, users);
  setSession(user.id);
  boot();
});

document.getElementById('loginForm').addEventListener('submit', e=>{
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  const user = allUsers().find(u => u.email === email && u.password === password);
  if(!user){ errEl.textContent = 'Incorrect email or password.'; return; }
  setSession(user.id);
  boot();
});

document.getElementById('logoutBtn').addEventListener('click', ()=>{
  clearSession();
  boot();
});

/* =========================================================
   NAVIGATION
========================================================= */
const STUDENT_NAV = [
  ['s-dashboard','Dashboard'], ['s-groups','My Groups'], ['s-attendance','Attendance'],
  ['s-notes','Notes'], ['s-missed','Missed Notes'], ['s-quizzes','Quizzes'], ['s-notifications','Notifications']
];
const TEACHER_NAV = [
  ['t-dashboard','Dashboard'], ['t-groups','My Groups'], ['t-attendance','Attendance'],
  ['t-notes','Notes'], ['t-announcements','Announcements'], ['t-missed','Missed Class'], ['t-quizzes','Quizzes']
];

let activeGroupId = null; // used by group-detail views

function showView(viewId){
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(viewId);
  if(el) el.classList.remove('hidden');
  document.querySelectorAll('.nav-links button').forEach(b=>{
    b.classList.toggle('active', b.dataset.view === viewId);
  });
  renderView(viewId);
}

document.querySelectorAll('.back-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> showView(btn.dataset.back));
});

function buildNav(role){
  const nav = document.getElementById('navLinks');
  nav.innerHTML = '';
  const items = role === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  items.forEach(([id,label])=>{
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.view = id;
    b.addEventListener('click', ()=> showView(id));
    nav.appendChild(b);
  });
}

/* =========================================================
   BOOT / ROUTER
========================================================= */
function boot(){
  const user = currentUser();
  const topbar = document.getElementById('topbar');
  const authView = document.getElementById('authView');
  const studentApp = document.getElementById('studentApp');
  const teacherApp = document.getElementById('teacherApp');

  if(!user){
    topbar.style.display = 'none';
    authView.classList.remove('hidden');
    studentApp.classList.add('hidden');
    teacherApp.classList.add('hidden');
    document.getElementById('loginForm').reset();
    document.getElementById('signupForm').reset();
    return;
  }

  topbar.style.display = 'flex';
  authView.classList.add('hidden');
  document.getElementById('userTag').textContent = `${user.name} · ${user.role === 'teacher' ? 'Teacher' : 'Student'}`;
  buildNav(user.role);

  if(user.role === 'teacher'){
    studentApp.classList.add('hidden');
    teacherApp.classList.remove('hidden');
    showView('t-dashboard');
  } else {
    teacherApp.classList.add('hidden');
    studentApp.classList.remove('hidden');
    showView('s-dashboard');
  }
}

function renderView(viewId){
  const map = {
    's-dashboard': renderStudentDashboard,
    's-groups': renderStudentGroups,
    's-groupDetail': renderStudentGroupDetail,
    's-attendance': renderStudentAttendance,
    's-notes': renderStudentNotes,
    's-missed': renderStudentMissed,
    's-quizzes': renderStudentQuizzes,
    's-notifications': renderStudentNotifications,
    't-dashboard': renderTeacherDashboard,
    't-groups': renderTeacherGroups,
    't-groupDetail': renderTeacherGroupDetail,
    't-attendance': renderTeacherAttendance,
    't-notes': renderTeacherNotes,
    't-announcements': renderTeacherAnnouncements,
    't-missed': renderTeacherMissed,
    't-quizzes': renderTeacherQuizzes,
  };
  if(map[viewId]) map[viewId]();
}

function listOrEmpty(container, items, renderFn, emptyText){
  if(!items.length){ container.innerHTML = `<p class="empty">${emptyText}</p>`; return; }
  container.innerHTML = items.map(renderFn).join('');
}

/* =========================================================
   STUDENT — DASHBOARD
========================================================= */
function studentAttendanceStats(userId){
  const groups = studentGroups(userId).map(g=>g.id);
  const records = DB.get(KEYS.attendance).filter(a => groups.includes(a.groupId));
  let present=0, total=0;
  const bySubject = {};
  records.forEach(rec=>{
    if(rec.records[userId]){
      total++;
      const status = rec.records[userId];
      if(status === 'present') present++;
      const g = groupById(rec.groupId);
      const name = g ? g.name : 'Unknown';
      if(!bySubject[name]) bySubject[name] = {present:0, total:0};
      bySubject[name].total++;
      if(status === 'present') bySubject[name].present++;
    }
  });
  return {present, total, pct: total ? Math.round(present/total*100) : null, bySubject};
}

function studentMissedList(userId){
  const groups = studentGroups(userId).map(g=>g.id);
  const records = DB.get(KEYS.attendance).filter(a => groups.includes(a.groupId));
  const missedEntries = [];
  records.forEach(rec=>{
    if(rec.records[userId] === 'absent'){
      const content = DB.get(KEYS.missed).find(m => m.groupId === rec.groupId && m.date === rec.date);
      missedEntries.push({groupId: rec.groupId, date: rec.date, content: content || null});
    }
  });
  return missedEntries.sort((a,b)=> b.date.localeCompare(a.date));
}

function renderStudentDashboard(){
  const user = currentUser();
  const groups = studentGroups(user.id);
  const stats = studentAttendanceStats(user.id);
  const missed = studentMissedList(user.id);

  document.getElementById('s-dash-cards').innerHTML = `
    <div class="card"><div class="big">${stats.pct === null ? '—' : stats.pct + '%'}</div><div class="label">Overall attendance</div></div>
    <div class="card"><div class="big">${groups.length}</div><div class="label">Groups joined</div></div>
    <div class="card"><div class="big">${missed.length}</div><div class="label">Missed classes</div></div>
  `;

  const allAnnouncements = groups.flatMap(g => announcementsForGroup(g.id).map(a=>({...a, groupName:g.name})))
    .sort((a,b)=> (b.important - a.important) || b.date.localeCompare(a.date)).slice(0,5);
  listOrEmpty(document.getElementById('s-dash-announcements'), allAnnouncements, a => `
    <div class="item ${a.important?'important':''}">
      <div class="item-meta">${escapeHtml(a.groupName)} · ${fmtDateTime(a.date)}${a.important?' <span class="badge amber">Important</span>':''}</div>
      <div class="item-body">${escapeHtml(a.text)}</div>
    </div>`, 'No announcements yet.');

  const allNotes = groups.flatMap(g => notesForGroup(g.id).map(n=>({...n, groupName:g.name}))).slice(0,5);
  listOrEmpty(document.getElementById('s-dash-notes'), allNotes, n => `
    <div class="item">
      <div class="item-title">${escapeHtml(n.title)}</div>
      <div class="item-meta">${escapeHtml(n.groupName)} · ${fmtDateTime(n.date)}</div>
    </div>`, 'No notes shared yet.');

  listOrEmpty(document.getElementById('s-dash-missed'), missed.slice(0,5), m => {
    const g = groupById(m.groupId);
    return `<div class="item"><div class="item-title">${escapeHtml(g?g.name:'')} <span class="badge absent">Absent</span></div>
    <div class="item-meta">${fmtDate(m.date)}</div>
    <div class="item-body">${m.content ? 'Catch-up material available' : 'Waiting for teacher to add material'}</div></div>`;
  }, 'No missed classes — great job!');

  const upcomingQuizzes = groups.flatMap(g => quizzesForGroup(g.id).map(q=>({...q, groupName:g.name})))
    .filter(q => !resultFor(q.id, user.id)).slice(0,5);
  listOrEmpty(document.getElementById('s-dash-quizzes'), upcomingQuizzes, q => `
    <div class="item"><div class="item-title">${escapeHtml(q.title)}</div>
    <div class="item-meta">${escapeHtml(q.groupName)} · ${q.questions.length} question${q.questions.length===1?'':'s'}</div></div>`,
    'No pending quizzes.');
}

/* =========================================================
   STUDENT — GROUPS
========================================================= */
document.getElementById('joinGroupForm').addEventListener('submit', e=>{
  e.preventDefault();
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  const errEl = document.getElementById('joinGroupError');
  errEl.textContent = '';
  const groups = allGroups();
  const g = groups.find(g => g.code === code);
  const user = currentUser();
  if(!g){ errEl.textContent = 'No group found with that code.'; return; }
  if(g.students.includes(user.id)){ errEl.textContent = 'You already joined this group.'; return; }
  g.students.push(user.id);
  DB.set(KEYS.groups, groups);
  document.getElementById('joinGroupForm').reset();
  renderStudentGroups();
});

function renderStudentGroups(){
  const user = currentUser();
  const groups = studentGroups(user.id);
  listOrEmpty(document.getElementById('s-groups-list'), groups, g => `
    <div class="card clickable" onclick="openStudentGroup('${g.id}')">
      <div class="item-title">${escapeHtml(g.name)}</div>
      <div class="label">Taught by ${escapeHtml(userById(g.teacherId)?.name || 'Unknown')}</div>
    </div>`, "You haven't joined any groups yet. Ask your teacher for a group code.");
}

function openStudentGroup(gid){
  activeGroupId = gid;
  showView('s-groupDetail');
}

function renderStudentGroupDetail(){
  const g = groupById(activeGroupId);
  if(!g){ showView('s-groups'); return; }
  document.getElementById('s-gd-title').textContent = g.name;

  listOrEmpty(document.getElementById('s-gd-announcements'), announcementsForGroup(g.id), a => `
    <div class="item ${a.important?'important':''}">
      <div class="item-meta">${fmtDateTime(a.date)}${a.important?' <span class="badge amber">Important</span>':''}</div>
      <div class="item-body">${escapeHtml(a.text)}</div>
    </div>`, 'No announcements yet.');

  listOrEmpty(document.getElementById('s-gd-notes'), notesForGroup(g.id), n => `
    <div class="item"><div class="item-title">${escapeHtml(n.title)}</div>
    <div class="item-meta">${fmtDateTime(n.date)}</div>
    <div class="item-body">${escapeHtml(n.content)}</div></div>`, 'No notes shared yet.');

  const user = currentUser();
  listOrEmpty(document.getElementById('s-gd-quizzes'), quizzesForGroup(g.id), q => {
    const res = resultFor(q.id, user.id);
    return `<div class="item"><div class="item-title">${escapeHtml(q.title)}</div>
    <div class="item-meta">${q.questions.length} question${q.questions.length===1?'':'s'}</div>
    ${res ? `<span class="badge teal">Score: ${res.score}/${res.total}</span>` :
      `<button class="btn btn-primary btn-small" onclick="openQuiz('${q.id}')">Take quiz</button>`}
    </div>`;
  }, 'No quizzes yet.');

  listOrEmpty(document.getElementById('s-gd-messages'), messagesForGroup(g.id), m => `
    <div class="item"><div class="item-meta">${fmtDateTime(m.date)}</div>
    <div class="item-body">${escapeHtml(m.text)}</div></div>`, 'No messages yet.');
}

/* =========================================================
   STUDENT — ATTENDANCE
========================================================= */
function renderStudentAttendance(){
  const user = currentUser();
  const stats = studentAttendanceStats(user.id);
  document.getElementById('s-att-overall').innerHTML = `
    <div class="pct">${stats.pct === null ? '—' : stats.pct + '%'}</div>
    <div class="sub">${stats.present} present out of ${stats.total} recorded classes</div>`;

  const subjects = Object.entries(stats.bySubject);
  listOrEmpty(document.getElementById('s-att-bysubject'), subjects, ([name,s]) => `
    <div class="item"><div class="item-title">${escapeHtml(name)}</div>
    <div class="item-meta">${s.present}/${s.total} classes attended · ${Math.round(s.present/s.total*100)}%</div></div>`,
    'No attendance recorded yet.');
}

/* =========================================================
   STUDENT — NOTES
========================================================= */
function renderStudentNotes(){
  const user = currentUser();
  const groups = studentGroups(user.id);
  const notes = groups.flatMap(g => notesForGroup(g.id).map(n=>({...n, groupName:g.name})))
    .sort((a,b)=>b.date.localeCompare(a.date));
  listOrEmpty(document.getElementById('s-notes-list'), notes, n => `
    <div class="item"><div class="item-title">${escapeHtml(n.title)}</div>
    <div class="item-meta">${escapeHtml(n.groupName)} · ${fmtDateTime(n.date)}</div>
    <div class="item-body">${escapeHtml(n.content)}</div></div>`, 'No notes shared yet.');
}

/* =========================================================
   STUDENT — MISSED NOTES
========================================================= */
function renderStudentMissed(){
  const user = currentUser();
  const missed = studentMissedList(user.id);
  listOrEmpty(document.getElementById('s-missed-list'), missed, m => {
    const g = groupById(m.groupId);
    if(!m.content){
      return `<div class="item"><div class="item-title">${escapeHtml(g?g.name:'')} <span class="badge absent">Absent</span></div>
      <div class="item-meta">${fmtDate(m.date)}</div>
      <div class="empty">Your teacher hasn't added catch-up material for this class yet.</div></div>`;
    }
    const quiz = m.content.quizId ? DB.get(KEYS.quizzes).find(q=>q.id===m.content.quizId) : null;
    const res = quiz ? resultFor(quiz.id, user.id) : null;
    return `<div class="item"><div class="item-title">${escapeHtml(g?g.name:'')} <span class="badge absent">Absent</span></div>
    <div class="item-meta">${fmtDate(m.date)}</div>
    <div class="item-title">${escapeHtml(m.content.title)}</div>
    <div class="item-body">${escapeHtml(m.content.content)}</div>
    ${quiz ? (res ? `<span class="badge teal">Catch-up quiz score: ${res.score}/${res.total}</span>` :
      `<button class="btn btn-primary btn-small" onclick="openQuiz('${quiz.id}')">Take catch-up quiz</button>`) : ''}
    </div>`;
  }, "You haven't missed any classes — great job!");
}

/* =========================================================
   STUDENT — QUIZZES
========================================================= */
function renderStudentQuizzes(){
  const user = currentUser();
  const groups = studentGroups(user.id);
  const quizzes = groups.flatMap(g => quizzesForGroup(g.id).map(q=>({...q, groupName:g.name})));
  listOrEmpty(document.getElementById('s-quizzes-list'), quizzes, q => {
    const res = resultFor(q.id, user.id);
    return `<div class="item"><div class="item-title">${escapeHtml(q.title)}</div>
    <div class="item-meta">${escapeHtml(q.groupName)} · ${q.questions.length} question${q.questions.length===1?'':'s'}</div>
    ${res ? `<span class="badge teal">Completed — Score: ${res.score}/${res.total}</span>` :
      `<button class="btn btn-primary btn-small" onclick="openQuiz('${q.id}')">Take quiz</button>`}
    </div>`;
  }, 'No quizzes available yet.');
}

let currentQuizId = null;
function openQuiz(quizId){
  currentQuizId = quizId;
  const quiz = DB.get(KEYS.quizzes).find(q=>q.id===quizId);
  const user = currentUser();
  const existing = resultFor(quizId, user.id);
  document.getElementById('s-qt-title').textContent = quiz.title;
  const form = document.getElementById('s-quizForm');

  if(existing){
    form.innerHTML = `<div class="score-banner">You already completed this quiz — Score: ${existing.score}/${existing.total}</div>`;
    showView('s-quizTake');
    return;
  }

  form.innerHTML = quiz.questions.map((q,qi)=>`
    <div class="quiz-q">
      <div class="qtext">${qi+1}. ${escapeHtml(q.text)}</div>
      ${q.options.map((opt,oi)=>`
        <label class="quiz-opt">
          <input type="radio" name="q${qi}" value="${oi}" required>
          ${escapeHtml(opt)}
        </label>`).join('')}
    </div>`).join('') + `<button type="submit" class="btn btn-primary">Submit quiz</button>`;

  form.onsubmit = e => {
    e.preventDefault();
    let score = 0;
    quiz.questions.forEach((q,qi)=>{
      const chosen = form.querySelector(`input[name="q${qi}"]:checked`);
      if(chosen && parseInt(chosen.value) === q.correct) score++;
    });
    const results = DB.get(KEYS.results);
    results.push({id: uid('r'), quizId: quiz.id, studentId: user.id, score, total: quiz.questions.length, date: new Date().toISOString()});
    DB.set(KEYS.results, results);
    form.innerHTML = `<div class="score-banner">Quiz submitted! Your score: ${score}/${quiz.questions.length}</div>`;
  };

  showView('s-quizTake');
}

/* =========================================================
   STUDENT — NOTIFICATIONS
========================================================= */
function renderStudentNotifications(){
  const user = currentUser();
  const groups = studentGroups(user.id);
  const feed = [];

  groups.forEach(g=>{
    announcementsForGroup(g.id).forEach(a => feed.push({type:'Announcement', date:a.date, text:`${g.name}: ${a.text}`, important:a.important}));
    quizzesForGroup(g.id).forEach(q => { if(!resultFor(q.id,user.id)) feed.push({type:'New quiz', date: q.createdAt || todayStr(), text:`${g.name}: "${q.title}" is available`}); });
    missedForGroup(g.id).forEach(m => feed.push({type:'Catch-up material', date:m.date, text:`${g.name}: catch-up content added for ${fmtDate(m.date)}`}));
  });

  feed.sort((a,b)=> String(b.date).localeCompare(String(a.date)));
  listOrEmpty(document.getElementById('s-notif-list'), feed.slice(0,25), n => `
    <div class="item ${n.important?'important':''}">
      <div class="item-meta">${n.type}${n.important?' <span class="badge amber">Important</span>':''}</div>
      <div class="item-body">${escapeHtml(n.text)}</div>
    </div>`, 'No notifications yet.');
}

/* =========================================================
   TEACHER — DASHBOARD
========================================================= */
function renderTeacherDashboard(){
  const user = currentUser();
  const groups = teacherGroups(user.id);
  const totalStudents = new Set(groups.flatMap(g=>g.students)).size;

  document.getElementById('t-dash-cards').innerHTML = `
    <div class="card"><div class="big">${groups.length}</div><div class="label">Groups</div></div>
    <div class="card"><div class="big">${totalStudents}</div><div class="label">Total students</div></div>
  `;

  const activity = [];
  groups.forEach(g=>{
    announcementsForGroup(g.id).forEach(a=>activity.push({date:a.date, text:`Posted announcement in ${g.name}`}));
    notesForGroup(g.id).forEach(n=>activity.push({date:n.date, text:`Shared note "${n.title}" in ${g.name}`}));
    attendanceForGroup(g.id).forEach(a=>activity.push({date:a.date, text:`Marked attendance for ${g.name} on ${fmtDate(a.date)}`}));
  });
  activity.sort((a,b)=> String(b.date).localeCompare(String(a.date)));
  listOrEmpty(document.getElementById('t-dash-activity'), activity.slice(0,8), a => `
    <div class="item"><div class="item-body">${escapeHtml(a.text)}</div></div>`, 'No activity yet — create a group to get started.');
}

/* =========================================================
   TEACHER — GROUPS
========================================================= */
document.getElementById('createGroupForm').addEventListener('submit', e=>{
  e.preventDefault();
  const name = document.getElementById('newGroupName').value.trim();
  const user = currentUser();
  const groups = allGroups();
  const group = { id: uid('g'), name, teacherId: user.id, code: genCode(), students: [] };
  groups.push(group);
  DB.set(KEYS.groups, groups);
  document.getElementById('createGroupForm').reset();
  renderTeacherGroups();
});

function renderTeacherGroups(){
  const user = currentUser();
  const groups = teacherGroups(user.id);
  listOrEmpty(document.getElementById('t-groups-list'), groups, g => `
    <div class="card clickable" onclick="openTeacherGroup('${g.id}')">
      <div class="item-title">${escapeHtml(g.name)}</div>
      <div class="label">Code: ${g.code} · ${g.students.length} student${g.students.length===1?'':'s'}</div>
    </div>`, 'No groups yet. Create one above.');
}

function openTeacherGroup(gid){
  activeGroupId = gid;
  showView('t-groupDetail');
}

function renderTeacherGroupDetail(){
  const g = groupById(activeGroupId);
  if(!g){ showView('t-groups'); return; }
  document.getElementById('t-gd-title').textContent = g.name;
  document.getElementById('t-gd-code').textContent = g.code;

  listOrEmpty(document.getElementById('t-gd-students'), g.students.map(userById).filter(Boolean), s => `
    <div class="item"><div class="item-title">${escapeHtml(s.name)}</div><div class="item-meta">${escapeHtml(s.email)}</div></div>`,
    'No students have joined yet. Share the group code above.');

  listOrEmpty(document.getElementById('t-gd-announcements'), announcementsForGroup(g.id), a => `
    <div class="item ${a.important?'important':''}"><div class="item-meta">${fmtDateTime(a.date)}</div>
    <div class="item-body">${escapeHtml(a.text)}</div></div>`, 'No announcements posted yet.');

  listOrEmpty(document.getElementById('t-gd-notes'), notesForGroup(g.id), n => `
    <div class="item"><div class="item-title">${escapeHtml(n.title)}</div>
    <div class="item-meta">${fmtDateTime(n.date)}</div></div>`, 'No notes shared yet.');

  listOrEmpty(document.getElementById('t-gd-messages'), messagesForGroup(g.id), m => `
    <div class="item"><div class="item-meta">${fmtDateTime(m.date)}</div>
    <div class="item-body">${escapeHtml(m.text)}</div></div>`, 'No messages sent yet.');
}

document.getElementById('t-announceForm').addEventListener('submit', e=>{
  e.preventDefault();
  const text = document.getElementById('t-announceText').value.trim();
  const important = document.getElementById('t-announceImportant').checked;
  const list = DB.get(KEYS.announcements);
  list.push({id: uid('a'), groupId: activeGroupId, text, important, date: new Date().toISOString()});
  DB.set(KEYS.announcements, list);
  e.target.reset();
  renderTeacherGroupDetail();
});

document.getElementById('t-noteForm').addEventListener('submit', e=>{
  e.preventDefault();
  const title = document.getElementById('t-noteTitle').value.trim();
  const content = document.getElementById('t-noteContent').value.trim();
  const list = DB.get(KEYS.notes);
  list.push({id: uid('n'), groupId: activeGroupId, title, content, date: new Date().toISOString()});
  DB.set(KEYS.notes, list);
  e.target.reset();
  renderTeacherGroupDetail();
});

document.getElementById('t-msgForm').addEventListener('submit', e=>{
  e.preventDefault();
  const text = document.getElementById('t-msgText').value.trim();
  const list = DB.get(KEYS.messages);
  list.push({id: uid('m'), groupId: activeGroupId, text, date: new Date().toISOString()});
  DB.set(KEYS.messages, list);
  e.target.reset();
  renderTeacherGroupDetail();
});

/* =========================================================
   TEACHER — ATTENDANCE
========================================================= */
function populateGroupSelect(selectEl, groups, placeholder){
  selectEl.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
    groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
}

function renderTeacherAttendance(){
  const user = currentUser();
  const groups = teacherGroups(user.id);
  const sel = document.getElementById('t-att-group');
  populateGroupSelect(sel, groups);
  const dateInput = document.getElementById('t-att-date');
  if(!dateInput.value) dateInput.value = todayStr();

  function draw(){
    const gid = sel.value;
    const g = groupById(gid);
    const list = document.getElementById('t-att-list');
    document.getElementById('t-att-success').textContent = '';
    if(!g || !g.students.length){
      list.innerHTML = '<p class="empty">No students in this group yet.</p>';
      return;
    }
    const existing = DB.get(KEYS.attendance).find(a => a.groupId === gid && a.date === dateInput.value);
    list.innerHTML = g.students.map(userById).filter(Boolean).map(s => {
      const status = existing ? existing.records[s.id] : null;
      return `<div class="att-row" data-student="${s.id}">
        <span class="name">${escapeHtml(s.name)}</span>
        <span class="att-toggle">
          <button type="button" class="present ${status==='present'?'selected':''}" onclick="setAttStatus('${s.id}','present')">Present</button>
          <button type="button" class="absent ${status==='absent'?'selected':''}" onclick="setAttStatus('${s.id}','absent')">Absent</button>
        </span>
      </div>`;
    }).join('');
  }
  sel.onchange = draw;
  dateInput.onchange = draw;
  if(groups.length) draw();
  else document.getElementById('t-att-list').innerHTML = '<p class="empty">Create a group first.</p>';

  document.getElementById('t-att-save').onclick = ()=>{
    const gid = sel.value;
    if(!gid) return;
    const date = dateInput.value;
    const rows = document.querySelectorAll('#t-att-list .att-row');
    const records = {};
    rows.forEach(row=>{
      const sid = row.dataset.student;
      const sel2 = row.querySelector('.present.selected') ? 'present' : (row.querySelector('.absent.selected') ? 'absent' : null);
      if(sel2) records[sid] = sel2;
    });
    const attendance = DB.get(KEYS.attendance);
    const idx = attendance.findIndex(a => a.groupId === gid && a.date === date);
    const entry = {id: idx>-1 ? attendance[idx].id : uid('att'), groupId: gid, date, records};
    if(idx>-1) attendance[idx] = entry; else attendance.push(entry);
    DB.set(KEYS.attendance, attendance);
    document.getElementById('t-att-success').textContent = 'Attendance saved. Students can now see it.';
  };
}

function setAttStatus(studentId, status){
  const row = document.querySelector(`.att-row[data-student="${studentId}"]`);
  row.querySelector('.present').classList.toggle('selected', status==='present');
  row.querySelector('.absent').classList.toggle('selected', status==='absent');
}

/* =========================================================
   TEACHER — NOTES / ANNOUNCEMENTS (global views)
========================================================= */
function renderTeacherNotes(){
  const user = currentUser();
  const groups = teacherGroups(user.id);
  const notes = groups.flatMap(g => notesForGroup(g.id).map(n=>({...n, groupName:g.name})));
  listOrEmpty(document.getElementById('t-notes-list'), notes, n => `
    <div class="item"><div class="item-title">${escapeHtml(n.title)}</div>
    <div class="item-meta">${escapeHtml(n.groupName)} · ${fmtDateTime(n.date)}</div>
    <div class="item-body">${escapeHtml(n.content)}</div></div>`, 'No notes shared yet.');
}

function renderTeacherAnnouncements(){
  const user = currentUser();
  const groups = teacherGroups(user.id);
  const list = groups.flatMap(g => announcementsForGroup(g.id).map(a=>({...a, groupName:g.name})));
  listOrEmpty(document.getElementById('t-announcements-list'), list, a => `
    <div class="item ${a.important?'important':''}"><div class="item-meta">${escapeHtml(a.groupName)} · ${fmtDateTime(a.date)}</div>
    <div class="item-body">${escapeHtml(a.text)}</div></div>`, 'No announcements posted yet.');
}

/* =========================================================
   TEACHER — MISSED CLASS CONTENT
========================================================= */
function renderTeacherMissed(){
  const user = currentUser();
  const groups = teacherGroups(user.id);
  populateGroupSelect(document.getElementById('t-missed-group'), groups, 'Select group');
  if(!document.getElementById('t-missed-date').value) document.getElementById('t-missed-date').value = todayStr();

  const quizSel = document.getElementById('t-missed-quiz');
  function refreshQuizOptions(){
    const gid = document.getElementById('t-missed-group').value;
    const quizzes = gid ? quizzesForGroup(gid) : [];
    quizSel.innerHTML = '<option value="">None</option>' + quizzes.map(q=>`<option value="${q.id}">${escapeHtml(q.title)}</option>`).join('');
  }
  document.getElementById('t-missed-group').onchange = refreshQuizOptions;
  refreshQuizOptions();

  const list = groups.flatMap(g => missedForGroup(g.id).map(m=>({...m, groupName:g.name})))
    .sort((a,b)=>b.date.localeCompare(a.date));
  listOrEmpty(document.getElementById('t-missed-list'), list, m => `
    <div class="item"><div class="item-title">${escapeHtml(m.groupName)} — ${fmtDate(m.date)}</div>
    <div class="item-meta">${escapeHtml(m.title)}</div>
    <div class="item-body">${escapeHtml(m.content)}</div>
    ${m.quizId ? '<span class="badge teal">Catch-up quiz attached</span>' : ''}</div>`,
    'No missed-class content added yet.');
}

document.getElementById('t-missedForm').addEventListener('submit', e=>{
  e.preventDefault();
  const groupId = document.getElementById('t-missed-group').value;
  const date = document.getElementById('t-missed-date').value;
  const title = document.getElementById('t-missed-title').value.trim();
  const content = document.getElementById('t-missed-content').value.trim();
  const quizId = document.getElementById('t-missed-quiz').value || null;
  if(!groupId){ return; }
  const list = DB.get(KEYS.missed);
  const idx = list.findIndex(m => m.groupId === groupId && m.date === date);
  const entry = {id: idx>-1?list[idx].id:uid('mc'), groupId, date, title, content, quizId};
  if(idx>-1) list[idx] = entry; else list.push(entry);
  DB.set(KEYS.missed, list);
  e.target.reset();
  document.getElementById('t-missed-date').value = todayStr();
  renderTeacherMissed();
});

/* =========================================================
   TEACHER — QUIZZES
========================================================= */
let quizQCount = 0;

function addQuestionRow(){
  quizQCount++;
  const wrap = document.createElement('div');
  wrap.className = 'quiz-q';
  wrap.dataset.qid = quizQCount;
  wrap.innerHTML = `
    <div class="qbuilder-row"><input type="text" placeholder="Question text" class="qtext-input" required></div>
    ${[0,1,2,3].map(i=>`
      <div class="qbuilder-row">
        <input type="radio" name="correct${quizQCount}" value="${i}" ${i===0?'checked':''}>
        <input type="text" placeholder="Option ${i+1}" class="qopt-input" required>
      </div>`).join('')}
    <button type="button" class="remove-q" onclick="this.parentElement.remove()">Remove question</button>
  `;
  document.getElementById('t-quiz-questions').appendChild(wrap);
}
document.getElementById('t-quiz-addQ').addEventListener('click', addQuestionRow);

function renderTeacherQuizzes(){
  const user = currentUser();
  const groups = teacherGroups(user.id);
  populateGroupSelect(document.getElementById('t-quiz-group'), groups, 'Select group');
  document.getElementById('t-quiz-questions').innerHTML = '';
  quizQCount = 0;
  addQuestionRow();

  const quizzes = groups.flatMap(g => quizzesForGroup(g.id).map(q=>({...q, groupName:g.name})));
  listOrEmpty(document.getElementById('t-quizzes-list'), quizzes, q => `
    <div class="item"><div class="item-title">${escapeHtml(q.title)}</div>
    <div class="item-meta">${escapeHtml(q.groupName)} · ${q.questions.length} question${q.questions.length===1?'':'s'}</div>
    <button class="btn btn-ghost btn-small" onclick="openQuizResults('${q.id}')">View results</button>
    </div>`, 'No quizzes created yet.');
}

document.getElementById('t-quizMetaForm').addEventListener('submit', e=>{
  e.preventDefault();
  const groupId = document.getElementById('t-quiz-group').value;
  const title = document.getElementById('t-quiz-title').value.trim();
  if(!groupId){ alert('Please select a group.'); return; }

  const qBlocks = document.querySelectorAll('#t-quiz-questions .quiz-q');
  const questions = [];
  qBlocks.forEach(block=>{
    const text = block.querySelector('.qtext-input').value.trim();
    const opts = Array.from(block.querySelectorAll('.qopt-input')).map(i=>i.value.trim());
    const correctInput = block.querySelector('input[type="radio"]:checked');
    const correct = correctInput ? parseInt(correctInput.value) : 0;
    if(text && opts.every(o=>o)) questions.push({text, options: opts, correct});
  });
  if(!questions.length){ alert('Add at least one complete question.'); return; }

  const quizzes = DB.get(KEYS.quizzes);
  quizzes.push({id: uid('qz'), groupId, title, questions, createdAt: new Date().toISOString()});
  DB.set(KEYS.quizzes, quizzes);
  e.target.reset();
  renderTeacherQuizzes();
});

let activeQuizId = null;
function openQuizResults(quizId){
  activeQuizId = quizId;
  const quiz = DB.get(KEYS.quizzes).find(q=>q.id===quizId);
  document.getElementById('t-qr-title').textContent = 'Results — ' + quiz.title;
  const results = DB.get(KEYS.results).filter(r=>r.quizId===quizId);
  listOrEmpty(document.getElementById('t-qr-list'), results, r => {
    const s = userById(r.studentId);
    return `<div class="item"><div class="item-title">${escapeHtml(s?s.name:'Unknown student')}</div>
    <div class="item-meta">Score: ${r.score}/${r.total} · ${fmtDateTime(r.date)}</div></div>`;
  }, 'No students have taken this quiz yet.');
  showView('t-quizResults');
}

/* =========================================================
   INIT
========================================================= */
boot();0