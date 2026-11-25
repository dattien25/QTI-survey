/**
 * QTI – Questionnaire on Teacher Interaction · Backend (Google Apps Script)
 * -------------------------------------------------------------------------
 * Dán toàn bộ file này vào Extensions → Apps Script của Google Sheet.
 * Paste this whole file into Extensions → Apps Script of your Google Sheet.
 *
 * 1) Chạy hàm setup() một lần → cấp quyền, tạo tab, sinh MÃ THIẾT LẬP CHỦ TRANG (xem trong Nhật ký thực thi).
 *    (Hoặc mở lại Google Sheet → menu "QTI" → "Hiện mã thiết lập chủ trang".)
 * 2) Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone.
 * 3) Mở trang web + "#admin", nhập mã thiết lập để tạo tài khoản CHỦ TRANG.
 *
 * KHÔNG có mật khẩu nào nằm trong file này. Mật khẩu chỉ được lưu dạng băm (salt + SHA-256 lặp) trong Script Properties.
 * No passwords live in this file; only salted, iterated SHA-256 hashes are kept in Script Properties.
 */
var SHEET_RESPONSES = 'Responses';
var SHEET_ROSTER = 'Roster';
/* ===================== QTI CORE =====================
 * Logic dùng chung cho backend (Code.gs) và chế độ demo (app.js).
 * Shared logic for the Apps Script backend and the in-browser demo.
 * ==================================================== */
var QTI_CORE = (function () {
  var N = 48;
  var SCALES = ['Lea', 'Und', 'Unc', 'Adm', 'HFr', 'SRe', 'Dis', 'Str'];
  var DEFAULTS = {
    status: 'closed',        // closed | waiting | running | ended
    timerMode: 'shared',     // shared | individual | off
    durationSec: 180,
    timeoutAction: 'submit', // submit | lock
    allowRetake: false,
    lang: 'both',            // vi | en | both
    subtitle: '',
    sessionId: '',
    startedAt: 0,
    endedAt: 0
  };
  var GRACE_MS = 20000;
  /* Các lệnh cần đăng nhập quản trị (token) / actions that need an admin session token */
  var ADMIN_ACTIONS = { adminState: 1, adminSettings: 1, adminControl: 1, adminRoster: 1,
    adminUsers: 1, adminUserSet: 1, adminUserDel: 1, authChange: 1, authLogout: 1 };
  /* Chỉ chủ trang / owner only */
  var OWNER_ACTIONS = { adminUsers: 1, adminUserSet: 1, adminUserDel: 1 };
  var HASH_ROUNDS = 400, TOKEN_TTL = 6 * 3600, MAX_FAIL = 5, LOCK_SEC = 600, MIN_PW = 6;

  /* ---------- Bảo mật / security ----------
   * Mật khẩu KHÔNG được lưu dạng chữ: chỉ lưu muối ngẫu nhiên + băm SHA-256 lặp nhiều vòng.
   * Đăng nhập thành công → cấp token ngẫu nhiên, hết hạn sau 6 giờ. Sai 5 lần → khoá 10 phút. */
  function hashPw(store, pw, salt) {
    var h = store.sha256(salt + ':' + pw);
    for (var i = 0; i < HASH_ROUNDS; i++) h = store.sha256(h + ':' + salt);
    return h;
  }
  function sameStr(a, b) {
    a = String(a); b = String(b);
    var d = a.length ^ b.length;
    for (var i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return d === 0;
  }
  function authOf(store) { var a = store.getAuth() || {}; a.users = a.users || {}; return a; }
  function ownerOf(a) { for (var k in a.users) if (a.users[k].role === 'owner') return a.users[k]; return null; }
  function adminKeys(a) { var o = {}; for (var k in a.users) o[k] = 1; return o; }
  function setPw(store, u, pw) { u.salt = store.random(16); u.hash = hashPw(store, pw, u.salt); }
  function checkPw(store, u, pw) { return !!(u && u.hash && sameStr(hashPw(store, String(pw || ''), u.salt), u.hash)); }
  function weak(pw) { return String(pw || '').length < MIN_PW; }
  function locked(store, k) { return Number(store.kvGet('fail|' + k) || 0) >= MAX_FAIL; }
  function failed(store, k) { store.kvPut('fail|' + k, String(Number(store.kvGet('fail|' + k) || 0) + 1), LOCK_SEC); }
  function issue(store, u) {
    var t = store.random(24);
    store.kvPut('tok|' + t, key(u.name), TOKEN_TTL);
    return t;
  }
  function sessionOf(store, token) {
    if (!token) return null;
    var k = store.kvGet('tok|' + String(token));
    if (!k) return null;
    var a = authOf(store), u = a.users[k];
    return u ? { a: a, u: u } : null;
  }
  function publicUser(u) { return { name: u.name, role: u.role, mustChange: !!u.mustChange }; }
  function userList(a) {
    return Object.keys(a.users).map(function (k) { return publicUser(a.users[k]); })
      .sort(function (x, y) { return (x.role === 'owner' ? 0 : 1) - (y.role === 'owner' ? 0 : 1) || (x.name < y.name ? -1 : 1); });
  }
  function rosterWithAdmin(store, a) {
    var ks = adminKeys(a);
    return store.getRoster().map(function (r) { return { name: r.name, admin: !!ks[key(r.name)] }; });
  }

  function scaleOf(i) { return SCALES[(i < 24 ? 0 : 4) + (i % 4)]; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function norm(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' '); }
  function key(s) { return norm(s).toLowerCase(); }
  function newAttempt() { return Math.random().toString(36).slice(2, 10); }

  function cleanAnswers(a) {
    var out = [];
    for (var i = 0; i < N; i++) {
      var v = Number(a && a[i]);
      out.push(v >= 1 && v <= 5 && Math.floor(v) === v ? v : null);
    }
    return out;
  }
  function countAnswered(a) {
    var c = 0;
    for (var i = 0; i < (a ? a.length : 0); i++) if (a[i]) c++;
    return c;
  }
  /* Điểm mỗi thang = tổng 6 câu (6–30). Nếu thiếu câu: trung bình các câu đã trả lời × 6. */
  function scores(a) {
    var sum = {}, cnt = {}, out = {};
    SCALES.forEach(function (s) { sum[s] = 0; cnt[s] = 0; });
    for (var i = 0; i < N; i++) {
      if (a[i]) { var s = scaleOf(i); sum[s] += a[i]; cnt[s]++; }
    }
    SCALES.forEach(function (s) { out[s] = cnt[s] ? round1(sum[s] / cnt[s] * 6) : null; });
    return out;
  }
  /* Mã phiên theo giờ Việt Nam (UTC+7) */
  function sessionIdFor(now) {
    var d = new Date(now + 7 * 3600000).toISOString();
    return 'S' + d.slice(0, 10).replace(/-/g, '') + '-' + d.slice(11, 19).replace(/:/g, '');
  }
  function settingsOf(store) {
    var s = store.getSettings() || {}, o = {};
    for (var k in DEFAULTS) o[k] = (s[k] === undefined ? DEFAULTS[k] : s[k]);
    return o;
  }
  function ensureSession(store, s, now) {
    if (!s.sessionId) { s.sessionId = sessionIdFor(now); store.saveSettings(s); }
    return s;
  }
  function deadlineFor(s, prog) {
    if (s.timerMode === 'off') return 0;
    var d = Number(s.durationSec) * 1000;
    if (s.timerMode === 'shared') return s.startedAt ? s.startedAt + d : 0;
    return prog && prog.startedAt ? prog.startedAt + d : 0;
  }
  function findName(store, name) {
    var k = key(name), r = store.getRoster();
    for (var i = 0; i < r.length; i++) if (key(r[i].name) === k) return r[i];
    return null;
  }
  function latestSub(subs, name) {
    var k = key(name), found = null;
    for (var i = 0; i < subs.length; i++) if (key(subs[i].name) === k) found = subs[i];
    return found;
  }
  function freshProg() {
    return { status: 'waiting', answers: [], answered: 0, startedAt: 0, attempt: newAttempt(), seq: 0 };
  }
  function makeSub(s, name, answers, attempt, reason, prog, now) {
    var start = (s.timerMode === 'shared' && s.startedAt) ? s.startedAt : ((prog && prog.startedAt) || 0);
    return {
      ts: now, session: s.sessionId, name: name, attempt: attempt, reason: reason,
      answered: countAnswered(answers),
      duration: start ? Math.max(0, Math.round((now - start) / 1000)) : null,
      scores: scores(answers), answers: answers
    };
  }
  function finalize(store, s, now) {
    return store.lock(function () {
      var subs = store.getSubs(s.sessionId), done = {}, n = 0;
      subs.forEach(function (x) { done[x.attempt] = 1; });
      store.getRoster().forEach(function (r) {
        var p = store.getProg(s.sessionId, r.name);
        if (p && p.status === 'in_progress' && p.answered > 0 && !done[p.attempt]) {
          var sub = makeSub(s, r.name, cleanAnswers(p.answers), p.attempt, 'admin_end', p, now);
          store.addSub(sub); n++;
          p.status = 'submitted'; store.putProg(s.sessionId, r.name, p);
        }
      });
      return n;
    });
  }
  function err(code, extra) { var o = extra || {}; o.ok = false; o.error = code; return o; }

  function handle(req, store, now) {
    now = now || Date.now();
    req = req || {};
    var a = req.action;
    var me = null, auth = null;
    if (ADMIN_ACTIONS[a]) {
      var ses = sessionOf(store, req.token);
      if (!ses) return err('unauthorized');
      me = ses.u; auth = ses.a;
      if (OWNER_ACTIONS[a] && me.role !== 'owner') return err('forbidden');
      if (me.mustChange && a !== 'authChange' && a !== 'authLogout') return err('must_change');
    }
    var s = settingsOf(store), p, prog, subs, sub;

    switch (a) {
      case 'config':
        var au = authOf(store);
        return {
          settings: s, roster: rosterWithAdmin(store, au),
          admins: userList(au).map(function (u) { return u.name; }), needsOwner: !ownerOf(au)
        };

      /* ---------------- ĐĂNG NHẬP / AUTH ---------------- */
      case 'authSetup':
        var a0 = authOf(store);
        if (ownerOf(a0)) return err('owner_exists');
        if (locked(store, 'setup')) return err('locked');
        var code = store.getSetupCode();
        if (!code || !sameStr(String(req.code || '').trim().toUpperCase(), code)) { failed(store, 'setup'); return err('bad_code'); }
        var on = norm(req.name);
        if (!on) return err('no_name');
        if (weak(req.pw)) return err('weak_password');
        var ou = { name: on.slice(0, 120), role: 'owner', mustChange: false };
        setPw(store, ou, String(req.pw));
        a0.users[key(on)] = ou;
        store.saveAuth(a0);
        store.clearSetupCode();
        return { token: issue(store, ou), me: publicUser(ou) };

      case 'authLogin':
        var lk = key(req.name), a1 = authOf(store), lu = a1.users[lk];
        if (locked(store, lk)) return err('locked');
        if (!checkPw(store, lu, req.pw)) { failed(store, lk); return err('bad_login'); }
        store.kvDel('fail|' + lk);
        return { token: issue(store, lu), me: publicUser(lu) };

      case 'authLogout':
        store.kvDel('tok|' + String(req.token));
        return {};

      case 'authChange':
        if (!checkPw(store, me, req.old)) return err('bad_login');
        if (weak(req.pw)) return err('weak_password');
        setPw(store, me, String(req.pw));
        me.mustChange = false;
        store.saveAuth(auth);
        return { me: publicUser(me) };

      case 'adminUsers':
        return { users: userList(auth) };

      case 'adminUserSet':
        var un = norm(req.name);
        if (!un) return err('no_name');
        if (weak(req.pw)) return err('weak_password');
        var uk = key(un), tu = auth.users[uk];
        if (tu && tu.role === 'owner') return err('forbidden');
        tu = tu || { name: un.slice(0, 120), role: 'admin' };
        setPw(store, tu, String(req.pw));
        tu.mustChange = true;   // người được cấp phải đổi mật khẩu ở lần đăng nhập đầu
        auth.users[uk] = tu;
        store.saveAuth(auth);
        return { users: userList(auth) };

      case 'adminUserDel':
        var dk = key(req.name), du = auth.users[dk];
        if (!du) return err('not_found');
        if (du.role === 'owner') return err('forbidden');
        delete auth.users[dk];
        store.saveAuth(auth);
        return { users: userList(auth) };

      case 'poll':
        p = req.name ? findName(store, req.name) : null;
        if (p && s.sessionId) store.touch(s.sessionId, p.name, now);
        return { settings: s };

      case 'join':
        p = findName(store, req.name);
        if (!p) return err('unknown_name');
        s = ensureSession(store, s, now);
        subs = store.getSubs(s.sessionId);
        sub = latestSub(subs, p.name);
        prog = store.getProg(s.sessionId, p.name);
        store.touch(s.sessionId, p.name, now);
        if (sub && (!s.allowRetake || !req.retake)) return { settings: s, person: p, sub: sub, prog: prog };
        if (!prog || (prog.status === 'submitted')) {
          prog = freshProg();
          store.putProg(s.sessionId, p.name, prog);
        }
        return { settings: s, person: p, prog: prog, sub: null };

      case 'start':
        p = findName(store, req.name);
        if (!p) return err('unknown_name');
        if (s.status !== 'running') return err('not_running', { settings: s });
        prog = store.getProg(s.sessionId, p.name) || freshProg();
        if (prog.status === 'submitted') return err('already_submitted', { settings: s });
        if (!prog.startedAt) prog.startedAt = (s.timerMode === 'shared' && s.startedAt) ? s.startedAt : now;
        prog.status = 'in_progress';
        store.putProg(s.sessionId, p.name, prog);
        store.touch(s.sessionId, p.name, now);
        return { settings: s, prog: prog, deadline: deadlineFor(s, prog) };

      case 'progress':
        p = findName(store, req.name);
        if (!p) return err('unknown_name');
        prog = store.getProg(s.sessionId, p.name);
        store.touch(s.sessionId, p.name, now);
        if (!prog || prog.status === 'submitted') return { settings: s };
        var seq = Number(req.seq) || 0;
        if (seq && prog.seq && seq <= prog.seq) return { settings: s };
        prog.answers = cleanAnswers(req.answers);
        prog.answered = countAnswered(prog.answers);
        prog.seq = seq;
        if (prog.status === 'waiting') prog.status = 'in_progress';
        store.putProg(s.sessionId, p.name, prog);
        return { settings: s, deadline: deadlineFor(s, prog) };

      case 'submit':
        p = findName(store, req.name);
        if (!p) return err('unknown_name');
        return store.lock(function () {
          var s2 = settingsOf(store);
          var list = store.getSubs(s2.sessionId);
          var attempt = String(req.attempt || '');
          for (var i = 0; i < list.length; i++) {
            if (attempt && list[i].attempt === attempt && key(list[i].name) === key(p.name)) return { sub: list[i], already: true };
          }
          if (!s2.allowRetake) {
            var ex = latestSub(list, p.name);
            if (ex) return { sub: ex, already: true };
          }
          if (s2.status === 'closed') return err('not_open');
          var pr = store.getProg(s2.sessionId, p.name);
          if (s2.timeoutAction === 'lock') {
            var dl = deadlineFor(s2, pr);
            var late = (dl && now > dl + GRACE_MS) || (s2.status === 'ended' && now > s2.endedAt + GRACE_MS);
            if (late) return err('time_up');
          }
          var ans = cleanAnswers(req.answers);
          var nsub = makeSub(s2, p.name, ans, attempt || newAttempt(), String(req.reason || 'manual'), pr, now);
          store.addSub(nsub);
          pr = pr || freshProg();
          pr.status = 'submitted'; pr.answers = ans; pr.answered = nsub.answered; pr.attempt = nsub.attempt;
          store.putProg(s2.sessionId, p.name, pr);
          return { sub: nsub };
        });

      /* ---------------- ADMIN ---------------- */
      case 'adminState':
        var sess = req.session || s.sessionId;
        var roster = rosterWithAdmin(store, auth);
        var names = roster.map(function (r) { return r.name; });
        return {
          settings: s, roster: roster, session: sess,
          progress: sess ? store.getProgMany(sess, names) : {},
          seen: sess ? store.getSeenMany(sess, names) : {},
          subs: sess ? store.getSubs(sess) : [],
          sessions: store.listSessions(),
          sheetUrl: store.sheetUrl(),
          me: publicUser(me), users: userList(auth)
        };

      case 'adminSettings':
        var pt = req.patch || {};
        if (['shared', 'individual', 'off'].indexOf(pt.timerMode) >= 0) s.timerMode = pt.timerMode;
        if (pt.durationSec !== undefined) {
          var d = Math.round(Number(pt.durationSec));
          if (d >= 10 && d <= 7200) s.durationSec = d;
        }
        if (['submit', 'lock'].indexOf(pt.timeoutAction) >= 0) s.timeoutAction = pt.timeoutAction;
        if (pt.allowRetake !== undefined) s.allowRetake = !!pt.allowRetake;
        if (['vi', 'en', 'both'].indexOf(pt.lang) >= 0) s.lang = pt.lang;
        if (pt.subtitle !== undefined) s.subtitle = norm(pt.subtitle).slice(0, 200);
        store.saveSettings(s);
        return { settings: s };

      case 'adminControl':
        s = ensureSession(store, s, now);
        var cmd = req.cmd, fin = 0;
        if (cmd === 'open') {
          s.status = s.timerMode === 'shared' ? 'waiting' : 'running';
          s.startedAt = s.timerMode === 'shared' ? 0 : now;
          s.endedAt = 0;
        } else if (cmd === 'start') {
          s.status = 'running'; s.startedAt = now; s.endedAt = 0;
        } else if (cmd === 'extend') {
          s.durationSec = Math.min(7200, Number(s.durationSec) + (Number(req.sec) || 60));
        } else if (cmd === 'end') {
          s.status = 'ended'; s.endedAt = now;
        } else if (cmd === 'close') {
          s.status = 'closed';
        } else if (cmd === 'newSession') {
          var id = sessionIdFor(now);
          s.sessionId = id === s.sessionId ? id + 'b' : id;
          s.status = 'closed'; s.startedAt = 0; s.endedAt = 0;
        } else return err('bad_cmd');
        store.saveSettings(s);
        if (cmd === 'end' && s.timeoutAction === 'submit') fin = finalize(store, s, now);
        return { settings: s, finalized: fin };

      case 'adminRoster':
        var seen = {}, list2 = [];
        (req.roster || []).forEach(function (r) {
          var n = norm(r && r.name);
          if (!n || seen[key(n)]) return;
          seen[key(n)] = 1;
          list2.push({ name: n.slice(0, 120) });
        });
        store.saveRoster(list2);
        return { roster: rosterWithAdmin(store, auth) };
    }
    return err('unknown_action');
  }

  return {
    N: N, SCALES: SCALES, scaleOf: scaleOf, scores: scores, cleanAnswers: cleanAnswers,
    countAnswered: countAnswered, deadlineFor: deadlineFor, makeSub: makeSub,
    handle: handle, key: key, DEFAULTS: DEFAULTS, hashPw: hashPw, MIN_PW: MIN_PW
  };
})();

/* ===================== GOOGLE SHEETS STORE ===================== */
var RESP_HEAD = ['Thời gian / Timestamp', 'Phiên / Session', 'Họ tên / Name', 'Mã lượt / Attempt',
  'Cách nộp / Submit type', 'Số câu đã trả lời / Answered', 'Thời gian làm (giây) / Duration (s)']
  .concat(QTI_CORE.SCALES)
  .concat(Array.apply(null, Array(48)).map(function (_, i) { return 'Q' + (i + 1); }));
var ROSTER_HEAD = ['Họ tên / Name'];
var CACHE_TTL = 21600; // 6 giờ – tối đa của CacheService

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var head = name === SHEET_RESPONSES ? RESP_HEAD : ROSTER_HEAD;
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#eef2f7');
    sh.setFrozenRows(1);
    if (name === SHEET_ROSTER) sh.setColumnWidth(1, 320);
  }
  return sh;
}
function hex_(raw) { return raw.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function hash_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s), Utilities.Charset.UTF_8)); }
function props_() { return PropertiesService.getScriptProperties(); }
function newSetupCode_() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', raw = Utilities.getUuid() + Utilities.getUuid(), c = '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  for (var i = 0; i < 8; i++) c += abc[(bytes[i] & 255) % abc.length];
  return 'QTI-' + c.slice(0, 4) + '-' + c.slice(4);
}
function pk_(sess, name) { return 'p|' + sess + '|' + hash_(QTI_CORE.key(name)); }
function sk_(sess, name) { return 's|' + sess + '|' + hash_(QTI_CORE.key(name)); }
function safeCell_(v) { v = String(v); return /^[=+\-@]/.test(v) ? "'" + v : v; }

function subToRow_(x) {
  return [new Date(x.ts), x.session, safeCell_(x.name), x.attempt, x.reason, x.answered,
    x.duration == null ? '' : x.duration]
    .concat(QTI_CORE.SCALES.map(function (s) { return x.scores[s] == null ? '' : x.scores[s]; }))
    .concat(x.answers.map(function (v) { return v == null ? '' : v; }));
}
function rowToSub_(r) {
  var sc = {}, ans = [];
  QTI_CORE.SCALES.forEach(function (s, i) { var v = r[7 + i]; sc[s] = v === '' ? null : Number(v); });
  for (var i = 0; i < 48; i++) { var v = r[15 + i]; ans.push(v === '' || v == null ? null : Number(v)); }
  var ts = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
  return {
    ts: ts, session: String(r[1]), name: String(r[2]).replace(/^'/, ''), attempt: String(r[3]),
    reason: String(r[4]), answered: Number(r[5]) || 0, duration: r[6] === '' ? null : Number(r[6]),
    scores: sc, answers: ans
  };
}
function readResponses_() {
  var sh = sheet_(SHEET_RESPONSES), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, RESP_HEAD.length).getValues().filter(function (r) { return r[2] !== ''; });
}

var STORE = {
  getSettings: function () {
    var v = PropertiesService.getScriptProperties().getProperty('settings');
    return v ? JSON.parse(v) : {};
  },
  saveSettings: function (s) {
    PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(s));
  },
  getRoster: function () {
    var c = CacheService.getScriptCache(), v = c.get('roster');
    if (v) return JSON.parse(v);
    var sh = sheet_(SHEET_ROSTER), last = sh.getLastRow(), out = [], seen = {};
    var rows = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
    rows.forEach(function (r) {
      var n = String(r[0]).replace(/^'/, '').trim().replace(/\s+/g, ' ');
      if (!n || seen[n.toLowerCase()]) return;
      seen[n.toLowerCase()] = 1;
      out.push({ name: n });
    });
    try { c.put('roster', JSON.stringify(out), 30); } catch (e) {}
    return out;
  },
  saveRoster: function (list) {
    var sh = sheet_(SHEET_ROSTER), last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, 1).clearContent();
    if (list.length) sh.getRange(2, 1, list.length, 1).setValues(list.map(function (r) { return [safeCell_(r.name)]; }));
    CacheService.getScriptCache().remove('roster');
  },
  getProg: function (sess, name) {
    var v = CacheService.getScriptCache().get(pk_(sess, name));
    return v ? JSON.parse(v) : null;
  },
  putProg: function (sess, name, obj) {
    CacheService.getScriptCache().put(pk_(sess, name), JSON.stringify(obj), CACHE_TTL);
  },
  getProgMany: function (sess, names) {
    var keys = names.map(function (n) { return pk_(sess, n); });
    var all = keys.length ? CacheService.getScriptCache().getAll(keys) : {}, out = {};
    names.forEach(function (n, i) { if (all[keys[i]]) out[n] = JSON.parse(all[keys[i]]); });
    return out;
  },
  touch: function (sess, name, now) {
    CacheService.getScriptCache().put(sk_(sess, name), String(now), CACHE_TTL);
  },
  getSeenMany: function (sess, names) {
    var keys = names.map(function (n) { return sk_(sess, n); });
    var all = keys.length ? CacheService.getScriptCache().getAll(keys) : {}, out = {};
    names.forEach(function (n, i) { if (all[keys[i]]) out[n] = Number(all[keys[i]]); });
    return out;
  },
  getSubs: function (sess) {
    return readResponses_().filter(function (r) { return sess === '*' || String(r[1]) === sess; }).map(rowToSub_);
  },
  addSub: function (sub) { sheet_(SHEET_RESPONSES).appendRow(subToRow_(sub)); },
  listSessions: function () {
    var seen = {}, out = [];
    readResponses_().forEach(function (r) { var s = String(r[1]); if (!seen[s]) { seen[s] = 1; out.push(s); } });
    return out;
  },
  lock: function (fn) {
    var l = LockService.getScriptLock();
    l.waitLock(30000);
    try { return fn(); } finally { l.releaseLock(); }
  },
  getAuth: function () { var v = props_().getProperty('auth'); return v ? JSON.parse(v) : {}; },
  saveAuth: function (a) { props_().setProperty('auth', JSON.stringify(a)); },
  getSetupCode: function () { return props_().getProperty('setupCode') || ''; },
  clearSetupCode: function () { props_().deleteProperty('setupCode'); },
  sha256: function (str) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(str), Utilities.Charset.UTF_8)); },
  random: function (n) {
    var h = '';
    while (h.length < n * 2) h += Utilities.getUuid().replace(/-/g, '');
    return h.slice(0, n * 2);
  },
  kvGet: function (k) { return CacheService.getScriptCache().get(k); },
  kvPut: function (k, v, ttl) { CacheService.getScriptCache().put(k, String(v), ttl || 600); },
  kvDel: function (k) { CacheService.getScriptCache().remove(k); },
  sheetUrl: function () { return ss_().getUrl(); }
};

/* ===================== WEB APP ENTRY ===================== */
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  return json_({ ok: true, app: 'QTI backend', msg: 'Backend đang chạy / Backend is running', now: Date.now() });
}
function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: 'bad_json', now: Date.now() }); }
  try {
    var out = QTI_CORE.handle(req, STORE, Date.now()) || {};
    if (out.ok !== false) out.ok = true;
    out.now = Date.now();
    return json_(out);
  } catch (x) {
    return json_({ ok: false, error: String(x && x.message || x), now: Date.now() });
  }
}

function hasOwner_() {
  var a = STORE.getAuth(); a.users = a.users || {};
  for (var k in a.users) if (a.users[k].role === 'owner') return a.users[k];
  return null;
}
function ensureSetupCode_() {
  var c = props_().getProperty('setupCode');
  if (!c) { c = newSetupCode_(); props_().setProperty('setupCode', c); }
  return c;
}
function say_(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* chạy từ trình soạn thảo: xem Nhật ký thực thi */ }
}

/** Danh sách lớp ban đầu: giảng viên + 48 học viên (Cao học LLPP1 – Tâm lí học giảng dạy ngoại ngữ).
 *  setup() chỉ THÊM những tên còn thiếu vào tab Roster; không xoá, không ghi đè tên đã có. */
var ROSTER_SEED = [
  "TS. Tạ Thanh Hoa",
  "Nguyễn Thanh An",
  "Bùi Thị Phương Anh",
  "Chu Thúy Hồng Anh",
  "Đặng Hà Anh",
  "Đào Nguyễn Phương Anh",
  "Đào Quế Anh",
  "Hà Vũ Quỳnh Anh",
  "Hoàng Thị Chung Anh",
  "Hoàng Tuấn Anh",
  "Lê Ngọc Anh",
  "Mai Thị Minh Anh",
  "Nguyễn Phương Anh",
  "Nguyễn Quỳnh Anh",
  "Nguyễn Thị Lan Anh",
  "Nguyễn Thị Mai Anh",
  "Nguyễn Thị Ngọc Anh (26045018)",
  "Nguyễn Thị Ngọc Anh (26045019)",
  "Nguyễn Thị Trúc Anh",
  "Phạm Nguyễn Quỳnh Anh",
  "Phạm Phương Anh",
  "Phạm Việt Anh",
  "Phan Anh",
  "Tạ Quỳnh Anh",
  "Trần Lan Anh",
  "Trần Thị Anh",
  "Phùng Thị Ngọc Ánh",
  "Lê Xuân Bách",
  "Nguyễn Thị Bích",
  "Trần Thị Ngọc Bích",
  "Nguyễn Thị Bình",
  "Lê Thị Bảo Châu",
  "Lê Thị Châu",
  "Bùi Thị Huệ Chi",
  "Phan Hà Chi",
  "Ngô Tiến Đạt",
  "Nguyễn Thành Đạt",
  "Giáp Thị Ngọc Diệp",
  "Nguyễn Thị Xuân Diệp",
  "Phan Hoàng Diệp",
  "Lê Quang Độ",
  "Ngô Phương Dung",
  "Nguyễn Phương Dung",
  "Nguyễn Tiến Dũng",
  "Nguyễn Ngọc Thùy Dương",
  "Trần Mỹ Duyên",
  "Bành Thị Giang",
  "Hoàng Thế Sơn",
  "Nguyễn Hương Giang"
  ];

function seedRoster_() {
  CacheService.getScriptCache().remove('roster');
  var cur = STORE.getRoster(), have = {};
  cur.forEach(function (r) { have[QTI_CORE.key(r.name)] = 1; });
  var add = ROSTER_SEED.filter(function (n) { return !have[QTI_CORE.key(n)]; });
  if (!add.length) return 0;
  var list = cur.length ? cur.concat(add.map(function (n) { return { name: n }; }))
    : ROSTER_SEED.map(function (n) { return { name: n }; });
  STORE.saveRoster(list);
  return add.length;
}

/** Chạy hàm này MỘT LẦN sau khi dán code: cấp quyền + tạo tab + nạp danh sách lớp + sinh mã thiết lập chủ trang. */
function setup() {
  sheet_(SHEET_ROSTER);
  sheet_(SHEET_RESPONSES);
  var n = seedRoster_();
  if (n) Logger.log('Đã thêm ' + n + ' tên vào tab Roster.');
  var sh = ss_().getSheetByName('Sheet1') || ss_().getSheetByName('Trang tính1');
  if (sh && sh.getLastRow() === 0 && ss_().getSheets().length > 2) ss_().deleteSheet(sh);
  CacheService.getScriptCache().remove('roster');
  showSetupCode();
}

/** Menu trong Google Sheet */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('QTI')
    .addItem('Hiện mã thiết lập chủ trang', 'showSetupCode')
    .addItem('Đặt lại chủ trang (quên mật khẩu)', 'resetOwner')
    .addToUi();
}

function showSetupCode() {
  var o = hasOwner_();
  if (o) return say_('Đã có chủ trang: ' + o.name + '. Nếu quên mật khẩu, dùng "Đặt lại chủ trang".');
  say_('MÃ THIẾT LẬP CHỦ TRANG / OWNER SETUP CODE:\n\n' + ensureSetupCode_() +
    '\n\nMở trang web, thêm #admin vào cuối địa chỉ, nhập mã này để tạo tài khoản chủ trang. Mã chỉ dùng được một lần.');
}

/** Quên mật khẩu chủ trang: xoá tài khoản chủ trang (giữ nguyên các quản trị viên khác) và tạo mã thiết lập mới. */
function resetOwner() {
  var a = STORE.getAuth(); a.users = a.users || {};
  for (var k in a.users) if (a.users[k].role === 'owner') delete a.users[k];
  STORE.saveAuth(a);
  props_().deleteProperty('setupCode');
  showSetupCode();
}
