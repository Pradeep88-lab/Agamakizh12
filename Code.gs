/**
 * Online Exam System - Google Apps Script backend
 * Works with the Google Sheet it is attached to (Extensions > Apps Script).
 *
 * Sheets (auto-created):
 *   Exams     : examId, title, category, durationMin, marksPerQ, negMark, active, created
 *   Questions : examId, qId, question, A, B, C, D, correct, explanation
 *   Results   : time, examId, examTitle, name, mobile, correct, wrong, skipped, score, total, timeTakenSec
 *
 * STEP 1: Run setup() once and authorize.
 * STEP 2: Project Settings > Script properties > change ADMIN_PASSWORD.
 * STEP 3: Deploy > New deployment > Web app
 *         Execute as: Me   |   Who has access: Anyone
 *         Copy the Web app URL into API_URL in index.html.
 */

const HEADERS = {
  Exams: ['examId', 'title', 'category', 'durationMin', 'marksPerQ', 'negMark', 'active', 'created'],
  Questions: ['examId', 'qId', 'question', 'A', 'B', 'C', 'D', 'correct', 'explanation'],
  Results: ['time', 'examId', 'examTitle', 'name', 'mobile', 'correct', 'wrong', 'skipped', 'score', 'total', 'timeTakenSec']
};

function setup() {
  Object.keys(HEADERS).forEach(sheet_);
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ADMIN_PASSWORD')) p.setProperty('ADMIN_PASSWORD', 'change-me-123');
  Logger.log('Setup done. Now set ADMIN_PASSWORD in Project Settings > Script properties.');
}

/* ---------- helpers ---------- */
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.appendRow(HEADERS[name]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold');
  }
  return s;
}

function rows_(name) {
  const v = sheet_(name).getDataRange().getValues();
  const head = v.shift();
  return v.map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (k, j) { o[k] = r[j]; });
    return o;
  });
}

function isActive_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function num_(v, d) { const n = parseFloat(v); return isNaN(n) ? d : n; }
function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function isAdmin_(pw) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '';
  return real !== '' && String(pw) === real;
}
function examMeta_(e) {
  return {
    examId: e.examId, title: e.title, category: e.category,
    durationMin: num_(e.durationMin, 30), marksPerQ: num_(e.marksPerQ, 1),
    negMark: num_(e.negMark, 0), active: isActive_(e.active)
  };
}
function qCount_(examId) {
  return rows_('Questions').filter(function (q) { return q.examId === examId; }).length;
}

/* ---------- entry points ---------- */
function doGet(e) {
  return out_(route_({ action: (e && e.parameter && e.parameter.action) || 'listExams' }));
}

function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'Bad request' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return out_(route_(req));
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function route_(r) {
  switch (r.action) {
    // ----- student -----
    case 'listExams': return listExams_();
    case 'getExam': return getExam_(r);
    case 'submit': return submit_(r);
    // ----- admin -----
    case 'adminLogin': return { ok: isAdmin_(r.password) };
    case 'adminListExams': return admin_(r, adminListExams_);
    case 'saveExam': return admin_(r, saveExam_);
    case 'deleteExam': return admin_(r, deleteExam_);
    case 'adminListQuestions': return admin_(r, adminListQuestions_);
    case 'addQuestions': return admin_(r, addQuestions_);
    case 'deleteQuestion': return admin_(r, deleteQuestion_);
    case 'results': return admin_(r, results_);
    default: return { ok: false, error: 'Unknown action' };
  }
}

function admin_(r, fn) {
  if (!isAdmin_(r.password)) return { ok: false, error: 'Wrong admin password' };
  return fn(r);
}

/* ---------- student ---------- */
function listExams_() {
  const counts = {};
  rows_('Questions').forEach(function (q) { counts[q.examId] = (counts[q.examId] || 0) + 1; });
  const exams = rows_('Exams').filter(function (e) { return isActive_(e.active); }).map(function (e) {
    const m = examMeta_(e);
    m.questionCount = counts[e.examId] || 0;
    return m;
  }).filter(function (m) { return m.questionCount > 0; });
  return { ok: true, exams: exams };
}

function getExam_(r) {
  const e = rows_('Exams').filter(function (x) { return x.examId === r.examId && isActive_(x.active); })[0];
  if (!e) return { ok: false, error: 'Exam not found' };
  const qs = rows_('Questions').filter(function (q) { return q.examId === r.examId; }).map(function (q) {
    return { qId: q.qId, question: q.question, options: { A: q.A, B: q.B, C: q.C, D: q.D } };
  });
  return { ok: true, exam: examMeta_(e), questions: qs };   // correct answers are NOT sent
}

function submit_(r) {
  const e = rows_('Exams').filter(function (x) { return x.examId === r.examId; })[0];
  if (!e) return { ok: false, error: 'Exam not found' };
  const m = examMeta_(e);
  const qs = rows_('Questions').filter(function (q) { return q.examId === r.examId; });
  const ans = r.answers || {};
  let correct = 0, wrong = 0, skipped = 0;
  const review = qs.map(function (q) {
    const given = ans[q.qId] || '';
    const right = String(q.correct).toUpperCase();
    if (!given) skipped++; else if (given === right) correct++; else wrong++;
    return {
      qId: q.qId, question: q.question, options: { A: q.A, B: q.B, C: q.C, D: q.D },
      correct: right, given: given, explanation: q.explanation || ''
    };
  });
  const score = Math.round((correct * m.marksPerQ - wrong * m.negMark) * 100) / 100;
  const total = qs.length * m.marksPerQ;
  sheet_('Results').appendRow([
    new Date(), m.examId, m.title, String(r.name || '').slice(0, 80),
    "'" + String(r.mobile || '').slice(0, 15), correct, wrong, skipped, score, total, num_(r.timeTakenSec, 0)
  ]);
  return { ok: true, correct: correct, wrong: wrong, skipped: skipped, score: score, total: total, review: review };
}

/* ---------- admin ---------- */
function adminListExams_() {
  const counts = {};
  rows_('Questions').forEach(function (q) { counts[q.examId] = (counts[q.examId] || 0) + 1; });
  return {
    ok: true,
    exams: rows_('Exams').map(function (e) {
      const m = examMeta_(e); m.questionCount = counts[e.examId] || 0; return m;
    })
  };
}

function saveExam_(r) {
  const s = sheet_('Exams');
  const d = r.exam || {};
  if (!d.title) return { ok: false, error: 'Title is required' };
  const vals = [
    d.examId || 'EX' + Date.now().toString(36).toUpperCase(),
    d.title, d.category || 'Other', num_(d.durationMin, 30),
    num_(d.marksPerQ, 1), num_(d.negMark, 0), d.active !== false, new Date()
  ];
  if (d.examId) {
    const row = rows_('Exams').filter(function (x) { return x.examId === d.examId; })[0];
    if (row) {
      vals[7] = row.created;
      s.getRange(row._row, 1, 1, vals.length).setValues([vals]);
      return { ok: true, examId: d.examId };
    }
  }
  s.appendRow(vals);
  return { ok: true, examId: vals[0] };
}

function deleteExam_(r) {
  const ex = sheet_('Exams'), qs = sheet_('Questions');
  rows_('Questions').filter(function (q) { return q.examId === r.examId; })
    .map(function (q) { return q._row; }).sort(function (a, b) { return b - a; })
    .forEach(function (row) { qs.deleteRow(row); });
  rows_('Exams').filter(function (e) { return e.examId === r.examId; })
    .forEach(function (e) { ex.deleteRow(e._row); });
  return { ok: true };
}

function adminListQuestions_(r) {
  return {
    ok: true,
    questions: rows_('Questions').filter(function (q) { return q.examId === r.examId; }).map(function (q) {
      return { qId: q.qId, question: q.question, A: q.A, B: q.B, C: q.C, D: q.D, correct: q.correct, explanation: q.explanation };
    })
  };
}

function addQuestions_(r) {
  const list = r.questions || [];
  const rows = [];
  for (var i = 0; i < list.length; i++) {
    const q = list[i];
    const c = String(q.correct || '').trim().toUpperCase();
    if (!q.question || !q.A || !q.B || ['A', 'B', 'C', 'D'].indexOf(c) < 0) {
      return { ok: false, error: 'Question ' + (i + 1) + ' is incomplete or the correct answer is not A/B/C/D' };
    }
    rows.push([r.examId, Utilities.getUuid().slice(0, 8), q.question, q.A, q.B, q.C || '', q.D || '', c, q.explanation || '']);
  }
  if (!rows.length) return { ok: false, error: 'No questions to add' };
  const s = sheet_('Questions');
  s.getRange(s.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, added: rows.length };
}

function deleteQuestion_(r) {
  const row = rows_('Questions').filter(function (q) { return q.examId === r.examId && q.qId === r.qId; })[0];
  if (row) sheet_('Questions').deleteRow(row._row);
  return { ok: true };
}

function results_(r) {
  let rs = rows_('Results');
  if (r.examId) rs = rs.filter(function (x) { return x.examId === r.examId; });
  rs = rs.reverse().slice(0, 500).map(function (x) {
    return {
      time: x.time instanceof Date ? x.time.toISOString() : String(x.time),
      examTitle: x.examTitle, name: x.name, mobile: String(x.mobile).replace(/^'/, ''),
      correct: x.correct, wrong: x.wrong, skipped: x.skipped, score: x.score, total: x.total, timeTakenSec: x.timeTakenSec
    };
  });
  return { ok: true, results: rs };
}
