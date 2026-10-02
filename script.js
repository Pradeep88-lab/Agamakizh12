
    /* ===================== CONFIG ===================== */
    // Paste your Apps Script Web app URL here (ends with /exec)
    const API_URL = "https://script.google.com/macros/s/AKfycby-olADCQt5_GPfXFK0_KCl0YH7jPamcTHyow2c0ZUZKBGmzusRxwuradxo1EGU5ync/exec";
    const CATEGORIES = ["TNPSC", "SSC", "Railway", "TRT", "TET", "Other"];
    /* ================================================== */

    const $app = document.getElementById('app');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    async function api(action, data = {}) {
      if (API_URL.startsWith("PASTE")) throw new Error("Set API_URL in index.html first.");
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // avoids CORS preflight with Apps Script
        body: JSON.stringify(Object.assign({ action }, data))
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Request failed');
      return j;
    }
    const loading = t => { $app.innerHTML = `<div class="spin">${esc(t || 'Loading…')}</div>`; };
    const showErr = (el, e) => { el.innerHTML = `<div class="msg err">${esc(e.message || e)}</div>`; };

    // document.getElementById('lnkHome').onclick = () => { stopTimer(); location.hash = ''; home(); };

    /* ===================== STUDENT ===================== */
    let S = {};          // current exam state
    let timerId = null;
    function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }

    function userAuth(isRegister = false) {
      $app.innerHTML = `
      <div class="card" style="max-width:420px;margin:30px auto">
        <h2>${isRegister ? 'Create Account' : 'Student Login'}</h2>
        <label>Username</label><input id="un" type="text" style="margin-bottom:10px">
        <label>Password</label><input id="pw" type="password" style="margin-bottom:10px">
        ${isRegister ? `
          <label>Full Name</label><input id="nm" type="text" style="margin-bottom:10px">
          <label>Mobile Number</label><input id="mb" type="text" inputmode="numeric" maxlength="10" style="margin-bottom:10px">
        ` : ''}
        <div id="uerr"></div>
        <button class="btn primary" id="btnAuth" style="margin-top:12px">${isRegister ? 'Create Account' : 'Login'}</button>
        <div style="margin-top:14px; font-size: 0.9rem; text-align: center;">
          ${isRegister ? `Already have an account? <a href="#" id="sw">Login here</a>` : `Don't have an account? <a href="#" id="sw">Create one</a>`}
        </div>
      </div>`;
      
      document.getElementById('sw').onclick = (e) => { e.preventDefault(); userAuth(!isRegister); };
      document.getElementById('btnAuth').onclick = () => {
        const un = document.getElementById('un').value.trim();
        const pw = document.getElementById('pw').value.trim();
        const err = document.getElementById('uerr');
        
        let users = JSON.parse(localStorage.getItem('mockUsers') || '{}');
        
        if (isRegister) {
          const nm = document.getElementById('nm') ? document.getElementById('nm').value.trim() : '';
          const mb = document.getElementById('mb') ? document.getElementById('mb').value.trim() : '';
          if (!un || !pw || !nm || !mb) return showErr(err, 'All fields are required.');
          if (users[un]) return showErr(err, 'Username already exists.');
          
          users[un] = { password: pw, name: nm, mobile: mb };
          localStorage.setItem('mockUsers', JSON.stringify(users));
          
          sessionStorage.setItem('cand', JSON.stringify({ name: nm, mobile: mb, username: un }));
          home();
        } else {
          if (!un || !pw) return showErr(err, 'Username and password required.');
          const user = users[un];
          if (!user || user.password !== pw) return showErr(err, 'Invalid username or password.');
          
          sessionStorage.setItem('cand', JSON.stringify({ name: user.name, mobile: user.mobile, username: un }));
          home();
        }
      };
    }

    async function home() {
      const saved = JSON.parse(sessionStorage.getItem('cand') || '{}');
      if (!saved.username) return userAuth();
      loading('Loading tests…');
      let exams = [];
      try { exams = (await api('listExams')).exams; } catch (e) { $app.innerHTML = ''; const d = document.createElement('div'); showErr(d, e); $app.appendChild(d); return; }
      let cat = 'All';
      // Duplicate removed
      const draw = () => {
        const cats = ['All', ...CATEGORIES.filter(c => exams.some(e => e.category === c))];
        const list = exams.filter(e => cat === 'All' || e.category === cat);
        $app.innerHTML = `
      <div class="card" style="margin-bottom:14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2 style="margin-bottom:4px">Welcome, ${esc(saved.name)}!</h2>
          <div class="muted">Mobile: ${esc(saved.mobile)}</div>
        </div>
        <button class="btn" id="btnLogOut">Log out</button>
      </div>
      <div class="chips">${cats.map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="grid">${list.length ? list.map(e => `
        <div class="card exam">
          <span class="tag">${esc(e.category)}</span>
          <h3 style="margin-top:8px">${esc(e.title)}</h3>
          <div class="facts">
            <span><b>${e.questionCount}</b> questions</span>
            <span><b>${e.durationMin}</b> min</span>
            <span><b>${e.marksPerQ}</b> mark each</span>
            <span>Negative: <b>${e.negMark ? '−' + e.negMark : 'none'}</b></span>
          </div>
          <button class="btn primary" data-start="${esc(e.examId)}">Start test</button>
        </div>`).join('') : '<div class="card muted">No tests available yet. Please check back soon.</div>'}
      </div><div id="homeErr"></div>`;
        $app.querySelectorAll('.chip').forEach(b => b.onclick = () => { keep(); cat = b.dataset.c; draw(); });
        $app.querySelectorAll('[data-start]').forEach(b => b.onclick = () => begin(b.dataset.start));
        const btnOut = document.getElementById('btnLogOut');
        if (btnOut) btnOut.onclick = () => { sessionStorage.removeItem('cand'); userAuth(); };
      };
      const keep = () => {
        const n = document.getElementById('nm'), m = document.getElementById('mb');
        if (n && m) { saved.name = n.value; saved.mobile = m.value; sessionStorage.setItem('cand', JSON.stringify(saved)); }
      };
      async function begin(id) {
        keep();
        const err = document.getElementById('homeErr');
        if (!saved.name || !/^\d{10}$/.test(saved.mobile)) {
          err.innerHTML = '<div class="msg err">Invalid name or mobile number in your account.</div>'; return;
        }
        loading('Preparing your test…');
        try {
          const j = await api('getExam', { examId: id });
          startExam(j.exam, j.questions, saved);
        } catch (e) { home(); }
      }
      draw();
    }

    function startExam(exam, questions, cand) {
      S = { exam, questions, cand, i: 0, ans: {}, mark: {}, seen: { 0: true }, endAt: Date.now() + exam.durationMin * 60000, t0: Date.now(), done: false };
      renderExam();
      stopTimer();
      timerId = setInterval(tick, 500);
      window.onbeforeunload = e => { if (!S.done) { e.preventDefault(); e.returnValue = ''; } };
    }

    function tick() {
      const left = Math.max(0, S.endAt - Date.now());
      const el = document.getElementById('tm');
      if (el) {
        const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
        el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        el.classList.toggle('low', left < 5 * 60000);
      }
      if (left <= 0) { stopTimer(); submitExam(true); }
    }

    function renderExam() {
      const { exam, questions: Q, i } = S;
      const q = Q[i];
      const cnt = Object.keys(S.ans).length;
      $app.style.maxWidth = '100%'; $app.style.padding = '0';
      $app.innerHTML = `
    <div class="bar"><div class="in">
      <div><b>${esc(exam.title)}</b><div class="muted">${esc(S.cand.name)} · ${cnt}/${Q.length} answered</div></div>
      <div class="timer" id="tm">--:--</div>
    </div></div>
    <div class="wrap"><div class="layout">
      <div class="card">
        <div class="muted">Question ${i + 1} of ${Q.length}</div>
        <div class="q">${esc(q.question)}</div>
        ${['A', 'B', 'C', 'D'].filter(k => q.options[k]).map(k => `
          <button class="opt ${S.ans[q.qId] === k ? 'sel' : ''}" data-k="${k}">
            <span class="bub">${k}</span><span style="white-space:pre-wrap">${esc(q.options[k])}</span>
          </button>`).join('')}
        <div class="nav">
          <button class="btn" id="bPrev" ${i === 0 ? 'disabled' : ''}>Previous</button>
          <button class="btn primary" id="bNext" ${i === Q.length - 1 ? 'disabled' : ''}>Save &amp; next</button>
          <button class="btn" id="bMark">${S.mark[q.qId] ? 'Unmark review' : 'Mark for review'}</button>
          <button class="btn" id="bClear" ${S.ans[q.qId] ? '' : 'disabled'}>Clear answer</button>
        </div>
      </div>
      <div>
        <div class="card">
          <h3>Question palette</h3>
          <div class="pal">${Q.map((x, n) => {
        let c = S.mark[x.qId] ? 'rev' : S.ans[x.qId] ? 'ans' : S.seen[n] ? 'seen' : '';
        return `<button class="${c} ${n === i ? 'cur' : ''}" data-n="${n}">${n + 1}</button>`;
      }).join('')}</div>
          <div class="legend">
            <span><i style="background:var(--green)"></i>Answered</span>
            <span><i style="background:var(--violet)"></i>Review</span>
            <span><i style="background:var(--amber-soft);border:1px solid var(--amber)"></i>Not answered</span>
            <span><i style="border:1px solid var(--line)"></i>Not visited</span>
          </div>
          <button class="btn primary" id="bSubmit" style="width:100%;margin-top:14px">Submit test</button>
        </div>
      </div>
    </div></div>`;
      const go = n => { S.i = n; S.seen[n] = true; renderExam(); window.scrollTo(0, 0); };
      $app.querySelectorAll('.opt').forEach(b => b.onclick = () => { S.ans[q.qId] = b.dataset.k; renderExam(); });
      $app.querySelectorAll('.pal button').forEach(b => b.onclick = () => go(+b.dataset.n));
      document.getElementById('bPrev').onclick = () => go(i - 1);
      document.getElementById('bNext').onclick = () => go(i + 1);
      document.getElementById('bMark').onclick = () => { S.mark[q.qId] = !S.mark[q.qId]; renderExam(); };
      document.getElementById('bClear').onclick = () => { delete S.ans[q.qId]; renderExam(); };
      document.getElementById('bSubmit').onclick = () => {
        const un = S.questions.length - Object.keys(S.ans).length;
        if (confirm(un ? `${un} question(s) are unanswered. Submit the test now?` : 'Submit the test now?')) submitExam(false);
      };
      tick();
    }

    async function submitExam(auto) {
      if (S.done) return;
      S.done = true; stopTimer(); window.onbeforeunload = null;
      $app.style.maxWidth = ''; $app.style.padding = '';
      loading(auto ? 'Time is up. Submitting…' : 'Submitting…');
      try {
        const j = await api('submit', {
          examId: S.exam.examId, name: S.cand.name, mobile: S.cand.mobile, answers: S.ans,
          timeTakenSec: Math.round((Date.now() - S.t0) / 1000)
        });
        showResult(j, auto);
      } catch (e) {
        S.done = false;
        $app.innerHTML = `<div class="card"><div class="msg err">${esc(e.message)}</div>
      <p class="muted">Your answers are still saved on this screen. Check your internet and try again.</p>
      <button class="btn primary" id="retry">Retry submit</button></div>`;
        document.getElementById('retry').onclick = () => submitExam(auto);
      }
    }

    function showResult(r, auto) {
      const e = S.exam, acc = r.correct + r.wrong ? Math.round(r.correct / (r.correct + r.wrong) * 100) : 0;
      $app.innerHTML = `
    <div class="card">
      ${auto ? '<div class="msg err">Time ran out, so the test was submitted automatically.</div>' : ''}
      <div class="muted">${esc(e.title)} · ${esc(S.cand.name)}</div>
      <div class="score">${r.score} <span class="muted" style="font-size:1.1rem">/ ${r.total}</span></div>
      <div class="stats">
        <div class="stat g"><b>${r.correct}</b>Correct (+${r.correct * e.marksPerQ})</div>
        <div class="stat r"><b>${r.wrong}</b>Wrong (−${Math.round(r.wrong * e.negMark * 100) / 100})</div>
        <div class="stat a"><b>${r.skipped}</b>Skipped</div>
        <div class="stat"><b>${acc}%</b>Accuracy</div>
      </div>
      <button class="btn primary" id="again">Back to tests</button>
    </div>
    <h2 style="margin:20px 0 10px">Answer review</h2>
    ${r.review.map((q, n) => `
      <div class="card" style="margin-bottom:10px">
        <div class="muted">Question ${n + 1} · ${!q.given ? 'Skipped' : q.given === q.correct ? 'Correct' : 'Wrong'}</div>
        <div class="q">${esc(q.question)}</div>
        ${['A', 'B', 'C', 'D'].filter(k => q.options[k]).map(k => `
          <div class="opt ${k === q.correct ? 'right' : k === q.given ? 'bad' : ''}" style="cursor:default">
            <span class="bub">${k}</span><span style="white-space:pre-wrap">${esc(q.options[k])}</span>
          </div>`).join('')}
        ${q.explanation ? `<div class="expl">${esc(q.explanation)}</div>` : ''}
      </div>`).join('')}`;
      document.getElementById('again').onclick = home;
      window.scrollTo(0, 0);
    }

    /* ===================== ADMIN ===================== */
    let PW = '';
    const adm = (a, d = {}) => api(a, Object.assign({ password: PW }, d));

    function adminEntry() {
      $app.style.maxWidth = ''; $app.style.padding = '';
      if (PW) return adminShell('exams');
      $app.innerHTML = `
    <div class="card" style="max-width:420px;margin:30px auto">
      <h2>Admin login</h2>
      <label for="pw">Admin password</label>
      <input id="pw" type="password" autocomplete="current-password">
      <div id="lerr"></div>
      <button class="btn primary" id="lg" style="margin-top:12px">Sign in</button>
    </div>`;
      const go = async () => {
        PW = document.getElementById('pw').value;
        try { const j = await api('adminLogin', { password: PW }); if (!j.ok) throw new Error('Wrong password'); adminShell('exams'); }
        catch (e) { PW = ''; showErr(document.getElementById('lerr'), e.message === 'Wrong password' ? e : e); }
      };
      document.getElementById('lg').onclick = go;
      document.getElementById('pw').onkeydown = e => { if (e.key === 'Enter') go(); };
    }

    function adminShell(tab, examId) {
      $app.innerHTML = `
    <div class="tabs">
      ${[['exams', 'Exams'], ['questions', 'Questions'], ['results', 'Results']].map(([k, n]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}
      <button id="out" style="margin-left:auto">Sign out</button>
    </div><div id="pane"></div>`;
      $app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => adminShell(b.dataset.t, examId));
      document.getElementById('out').onclick = () => { PW = ''; adminEntry(); };
      const pane = document.getElementById('pane');
      if (tab === 'exams') adminExams(pane);
      if (tab === 'questions') adminQuestions(pane, examId);
      if (tab === 'results') adminResults(pane, examId);
    }

    async function adminExams(pane) {
      pane.innerHTML = '<div class="spin">Loading…</div>';
      let exams;
      try { exams = (await adm('adminListExams')).exams; } catch (e) { return showErr(pane, e); }
      pane.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <h2 id="fh">Create exam</h2>
      <input type="hidden" id="eid">
      <div class="row">
        <div style="flex:2 1 260px"><label>Exam title</label><input id="et" placeholder="TNPSC Group 4 – Mock Test 1"></div>
        <div><label>Category</label><select id="ec">${CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>
      </div>
      <div class="row" style="margin-top:10px">
        <div><label>Duration (minutes)</label><input id="ed" type="number" min="1" value="60"></div>
        <div><label>Marks per question</label><input id="em" type="number" step="0.01" min="0" value="1"></div>
        <div><label>Negative mark per wrong answer</label><input id="en" type="number" step="0.01" min="0" value="0.25"></div>
        <div><label>Visible to students</label><select id="ea"><option value="1">Yes</option><option value="0">No (draft)</option></select></div>
      </div>
      <div id="eerr"></div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn primary" id="esave">Save exam</button>
        <button class="btn hide" id="ecancel">Cancel edit</button>
      </div>
    </div>
    <div class="card scroll">
      <h2>All exams</h2>
      ${exams.length ? `<table><tr><th>Title</th><th>Category</th><th>Qs</th><th>Time</th><th>+ / −</th><th>Status</th><th></th></tr>
      ${exams.map(e => `<tr>
        <td>${esc(e.title)}</td><td>${esc(e.category)}</td><td>${e.questionCount}</td><td>${e.durationMin}m</td>
        <td>${e.marksPerQ} / −${e.negMark}</td><td>${e.active ? 'Live' : 'Draft'}</td>
        <td style="white-space:nowrap">
          <button class="btn small" data-q="${esc(e.examId)}">Questions</button>
          <button class="btn small" data-r="${esc(e.examId)}">Results</button>
          <button class="btn small" data-e="${esc(e.examId)}">Edit</button>
          <button class="btn small danger" data-d="${esc(e.examId)}">Delete</button>
        </td></tr>`).join('')}</table>` : '<p class="muted">No exams yet. Create your first one above.</p>'}
    </div>`;
      const $ = id => document.getElementById(id);
      $('esave').onclick = async () => {
        try {
          await adm('saveExam', {
            exam: {
              examId: $('eid').value || undefined, title: $('et').value.trim(), category: $('ec').value,
              durationMin: +$('ed').value, marksPerQ: +$('em').value, negMark: +$('en').value, active: $('ea').value === '1'
            }
          });
          adminExams(pane);
        } catch (e) { showErr($('eerr'), e); }
      };
      $('ecancel').onclick = () => adminExams(pane);
      pane.querySelectorAll('[data-q]').forEach(b => b.onclick = () => adminShell('questions', b.dataset.q));
      pane.querySelectorAll('[data-r]').forEach(b => b.onclick = () => adminShell('results', b.dataset.r));
      pane.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
        const e = exams.find(x => x.examId === b.dataset.e);
        $('fh').textContent = 'Edit exam'; $('eid').value = e.examId; $('et').value = e.title; $('ec').value = e.category;
        $('ed').value = e.durationMin; $('em').value = e.marksPerQ; $('en').value = e.negMark; $('ea').value = e.active ? '1' : '0';
        $('ecancel').classList.remove('hide'); window.scrollTo(0, 0);
      });
      pane.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
        if (!confirm('Delete this exam and all its questions? Past results stay in the sheet.')) return;
        try { await adm('deleteExam', { examId: b.dataset.d }); adminExams(pane); } catch (e) { showErr($('eerr'), e); }
      });
    }

    async function adminQuestions(pane, examId) {
      pane.innerHTML = '<div class="spin">Loading…</div>';
      let exams;
      try { exams = (await adm('adminListExams')).exams; } catch (e) { return showErr(pane, e); }
      if (!exams.length) { pane.innerHTML = '<div class="card muted">Create an exam first.</div>'; return; }
      if (!examId || !exams.some(e => e.examId === examId)) examId = exams[0].examId;
      let qs = [];
      try { qs = (await adm('adminListQuestions', { examId })).questions; } catch (e) { return showErr(pane, e); }
      pane.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <label>Exam</label>
      <select id="sel">${exams.map(e => `<option value="${esc(e.examId)}" ${e.examId === examId ? 'selected' : ''}>${esc(e.category)} – ${esc(e.title)} (${e.questionCount} Qs)</option>`).join('')}</select>
    </div>
    <div class="card" style="margin-bottom:14px">
      <h2>Add one question</h2>
      <label>Question</label><textarea id="qq" style="min-height:70px"></textarea>
      <div class="row" style="margin-top:10px">
        <div><label>Option A</label><input id="oa"></div><div><label>Option B</label><input id="ob"></div>
        <div><label>Option C</label><input id="oc"></div><div><label>Option D</label><input id="od"></div>
      </div>
      <div class="row" style="margin-top:10px">
        <div style="flex:0 1 160px"><label>Correct answer</label><select id="ok"><option>A</option><option>B</option><option>C</option><option>D</option></select></div>
        <div style="flex:3 1 260px"><label>Explanation (optional)</label><input id="ox"></div>
      </div>
      <div id="qerr"></div>
      <button class="btn primary" id="qadd" style="margin-top:12px">Add question</button>
    </div>
    <div class="card" style="margin-bottom:14px">
      <h2>Bulk upload from Google Sheets or Excel</h2>
      <p class="muted">Copy rows with 7 columns and paste below. Columns: <code>Question</code> <code>A</code> <code>B</code> <code>C</code> <code>D</code> <code>Correct (A/B/C/D)</code> <code>Explanation</code>. Tab-separated (from a sheet) or separated by <code>|</code>. Tamil text works.</p>
      <textarea id="bulk" placeholder="Capital of India?&#9;Mumbai&#9;New Delhi&#9;Kolkata&#9;Chennai&#9;B&#9;New Delhi is the capital."></textarea>
      <div id="berr"></div>
      <button class="btn primary" id="badd" style="margin-top:12px">Upload questions</button>
    </div>
    <div class="card scroll">
      <h2>Questions in this exam (${qs.length})</h2>
      ${qs.length ? `<table><tr><th>#</th><th>Question</th><th>Options</th><th>Ans</th><th></th></tr>
      ${qs.map((q, n) => `<tr><td>${n + 1}</td><td>${esc(q.question)}</td>
        <td class="muted">A) ${esc(q.A)}<br>B) ${esc(q.B)}<br>${q.C ? 'C) ' + esc(q.C) + '<br>' : ''}${q.D ? 'D) ' + esc(q.D) : ''}</td>
        <td><b>${esc(q.correct)}</b></td>
        <td><button class="btn small danger" data-x="${esc(q.qId)}">Delete</button></td></tr>`).join('')}</table>` : '<p class="muted">No questions yet.</p>'}
    </div>`;
      const $ = id => document.getElementById(id);
      $('sel').onchange = () => adminShell('questions', $('sel').value);
      $('qadd').onclick = async () => {
        try {
          await adm('addQuestions', { examId, questions: [{ question: $('qq').value.trim(), A: $('oa').value.trim(), B: $('ob').value.trim(), C: $('oc').value.trim(), D: $('od').value.trim(), correct: $('ok').value, explanation: $('ox').value.trim() }] });
          adminShell('questions', examId);
        } catch (e) { showErr($('qerr'), e); }
      };
      $('badd').onclick = async () => {
        const lines = $('bulk').value.split(/\r?\n/).filter(l => l.trim());
        const list = lines.map(l => {
          const p = (l.includes('\t') ? l.split('\t') : l.split('|')).map(x => x.trim());
          return { question: p[0], A: p[1], B: p[2], C: p[3], D: p[4], correct: p[5], explanation: p[6] || '' };
        });
        try {
          const j = await adm('addQuestions', { examId, questions: list });
          $('berr').innerHTML = `<div class="msg ok">${j.added} questions added.</div>`;
          setTimeout(() => adminShell('questions', examId), 700);
        } catch (e) { showErr($('berr'), e); }
      };
      pane.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
        if (!confirm('Delete this question?')) return;
        try { await adm('deleteQuestion', { examId, qId: b.dataset.x }); adminShell('questions', examId); } catch (e) { showErr($('qerr'), e); }
      });
    }

    async function adminResults(pane, examId) {
      pane.innerHTML = '<div class="spin">Loading…</div>';
      let exams, rs;
      try {
        exams = (await adm('adminListExams')).exams;
        rs = (await adm('results', { examId: examId || '' })).results;
      } catch (e) { return showErr(pane, e); }
      pane.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <label>Filter by exam</label>
      <select id="sel"><option value="">All exams</option>${exams.map(e => `<option value="${esc(e.examId)}" ${e.examId === examId ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}</select>
    </div>
    <div class="card scroll">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h2 style="margin:0">Latest ${rs.length} attempts</h2>
        <button class="btn small" id="csv" ${rs.length ? '' : 'disabled'}>Download CSV</button>
      </div>
      ${rs.length ? `<table><tr><th>Time</th><th>Name</th><th>Mobile</th><th>Exam</th><th>Right</th><th>Wrong</th><th>Skip</th><th>Score</th></tr>
      ${rs.map(r => `<tr><td>${esc(new Date(r.time).toLocaleString())}</td><td>${esc(r.name)}</td><td>${esc(r.mobile)}</td><td>${esc(r.examTitle)}</td>
        <td>${r.correct}</td><td>${r.wrong}</td><td>${r.skipped}</td><td><b>${r.score}</b> / ${r.total}</td></tr>`).join('')}</table>` : '<p class="muted">No attempts yet.</p>'}
    </div>`;
      document.getElementById('sel').onchange = e => adminShell('results', e.target.value);
      const csv = document.getElementById('csv');
      if (csv) csv.onclick = () => {
        const q = v => '"' + String(v).replace(/"/g, '""') + '"';
        const body = [['Time', 'Name', 'Mobile', 'Exam', 'Correct', 'Wrong', 'Skipped', 'Score', 'Total']]
          .concat(rs.map(r => [r.time, r.name, r.mobile, r.examTitle, r.correct, r.wrong, r.skipped, r.score, r.total]))
          .map(r => r.map(q).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv' }));
        a.download = 'results.csv'; a.click();
      };
    }

    /* ===================== START ===================== */
    if (location.hash === '#admin') adminEntry(); else home();
  