/* QTI interactive survey – generated file, edit src/ instead */
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

/* ===================== DỮ LIỆU BẢNG HỎI / QUESTIONNAIRE DATA ===================== */
var QTI_DATA = (function () {
  // [English, Tiếng Việt] — thứ tự đúng như bản gốc (thang đo: Lea, Und, Unc, Adm lặp lại; từ câu 25: HFr, SRe, Dis, Str)
  var ITEMS = [
    ['I talk enthusiastically about my subject.', 'Tôi nói về môn học của mình một cách nhiệt tình.'],
    ['I trust the students.', 'Tôi tin tưởng học sinh.'],
    ['I seem uncertain.', 'Tôi tỏ ra thiếu chắc chắn.'],
    ['I get angry unexpectedly.', 'Tôi nổi giận bất ngờ.'],
    ['I explain things clearly.', 'Tôi giải thích mọi thứ rõ ràng.'],
    ["If students don't agree with me, they can talk about it.", 'Nếu học sinh không đồng ý với tôi, các em có thể nói ra.'],
    ['I am hesitant.', 'Tôi hay do dự.'],
    ['I get angry quickly.', 'Tôi dễ nổi nóng.'],
    ["I hold the students' attention.", 'Tôi thu hút được sự chú ý của học sinh.'],
    ['I am willing to explain things again.', 'Tôi sẵn sàng giải thích lại.'],
    ['I act as if I do not know what to do.', 'Tôi hành xử như thể không biết phải làm gì.'],
    ['I am too quick to correct students when they break a rule.', 'Tôi quá vội nhắc nhở khi học sinh vi phạm nội quy.'],
    ['I know everything that goes on in the classroom.', 'Tôi nắm được mọi việc diễn ra trong lớp.'],
    ['If students have something to say, I will listen.', 'Nếu học sinh có điều muốn nói, tôi sẽ lắng nghe.'],
    ['I let the students take charge.', 'Tôi để học sinh nắm quyền điều khiển lớp.'],
    ['I am impatient.', 'Tôi thiếu kiên nhẫn.'],
    ['I am a good leader.', 'Tôi là người dẫn dắt giỏi.'],
    ["I realise when students don't understand.", 'Tôi nhận ra khi học sinh chưa hiểu bài.'],
    ['I am not sure what to do when students fool around.', 'Tôi lúng túng khi học sinh đùa nghịch.'],
    ['It is easy for students to have an argument with me.', 'Học sinh dễ xảy ra tranh cãi với tôi.'],
    ['I act confidently.', 'Tôi hành xử tự tin.'],
    ['I am patient.', 'Tôi kiên nhẫn.'],
    ["It's easy to make me appear unsure.", 'Người khác dễ làm tôi tỏ ra lúng túng.'],
    ['I make mocking remarks.', 'Tôi hay đưa ra những lời nhận xét chế giễu.'],
    ['I help students with their work.', 'Tôi giúp đỡ học sinh trong việc học.'],
    ['Students can decide some things in my class.', 'Học sinh được quyết định một số việc trong lớp tôi.'],
    ['I think that students cheat.', 'Tôi cho rằng học sinh gian lận.'],
    ['I am strict.', 'Tôi nghiêm khắc.'],
    ['I am friendly.', 'Tôi thân thiện.'],
    ['Students can influence me.', 'Học sinh có thể tác động đến quyết định của tôi.'],
    ["I think that students don't know anything.", 'Tôi cho rằng học sinh chẳng biết gì.'],
    ['Students have to be silent in my class.', 'Học sinh phải giữ im lặng trong lớp tôi.'],
    ['I am someone students can depend on.', 'Tôi là người học sinh có thể dựa vào.'],
    ['I let students decide when they will do the work in class.', 'Tôi để học sinh tự quyết định khi nào làm bài trong lớp.'],
    ['I put students down.', 'Tôi hạ thấp học sinh.'],
    ['My tests are hard.', 'Bài kiểm tra của tôi khó.'],
    ['I have a sense of humour.', 'Tôi có khiếu hài hước.'],
    ['I let students get away with a lot in class.', 'Tôi bỏ qua nhiều hành vi của học sinh trong lớp.'],
    ["I think that students can't do things well.", 'Tôi cho rằng học sinh không làm tốt được việc gì.'],
    ['My standards are very high.', 'Tôi đặt tiêu chuẩn rất cao.'],
    ['I can take a joke.', 'Tôi chấp nhận được những câu đùa.'],
    ['I give students a lot of free time in class.', 'Tôi cho học sinh nhiều thời gian tự do trong lớp.'],
    ['I seem dissatisfied.', 'Tôi tỏ ra không hài lòng.'],
    ['I am severe when marking papers.', 'Tôi chấm bài khắt khe.'],
    ['My class is pleasant.', 'Lớp học của tôi dễ chịu.'],
    ['I am lenient.', 'Tôi dễ dãi.'],
    ['I am suspicious.', 'Tôi hay nghi ngờ.'],
    ['Students are afraid of me.', 'Học sinh sợ tôi.']
  ];

  // Màu: vòng màu phổ (theo bảng màu tham chiếu) — đã kiểm tra độ tách màu cho người mù màu giữa các múi kề nhau.
  // Thứ tự quanh bánh xe (theo chiều kim đồng hồ, bắt đầu từ trên-phải) – mô hình Leary/Wubbels
  var WHEEL = ['Lea', 'HFr', 'Und', 'SRe', 'Unc', 'Dis', 'Adm', 'Str'];
  var SCALE = {
    Lea: { vi: 'Lãnh đạo – Dẫn dắt', viS: 'Dẫn dắt', en: 'Leadership', enS: 'Leadership', code: 'DC', color: '#fb9344', coop: 1 },
    HFr: { vi: 'Thân thiện – Giúp đỡ', viS: 'Thân thiện', en: 'Helpful / Friendly', enS: 'Helpful/Friendly', code: 'CD', color: '#a77b00', coop: 1 },
    Und: { vi: 'Thấu hiểu', viS: 'Thấu hiểu', en: 'Understanding', enS: 'Understanding', code: 'CS', color: '#6ebb5d', coop: 1 },
    SRe: { vi: 'Trao quyền tự chủ cho HS', viS: 'Trao quyền', en: 'Student Responsibility / Freedom', enS: 'Student freedom', code: 'SC', color: '#008f86', coop: 1 },
    Unc: { vi: 'Thiếu quyết đoán', viS: 'Thiếu quyết đoán', en: 'Uncertain', enS: 'Uncertain', code: 'SO', color: '#549de5', coop: 0 },
    Dis: { vi: 'Không hài lòng', viS: 'Không hài lòng', en: 'Dissatisfied', enS: 'Dissatisfied', code: 'OS', color: '#724aab', coop: 0 },
    Adm: { vi: 'Hay khiển trách', viS: 'Khiển trách', en: 'Admonishing', enS: 'Admonishing', code: 'OD', color: '#db5fa1', coop: 0 },
    Str: { vi: 'Nghiêm khắc', viS: 'Nghiêm khắc', en: 'Strict', enS: 'Strict', code: 'DO', color: '#ba2b2e', coop: 0 }
  };
  return { ITEMS: ITEMS, WHEEL: WHEEL, SCALE: SCALE };
})();

/* ===================== GỢI Ý THEO TÀI LIỆU “Gợi ý cho giáo viên sau QTI” =====================
 * Nguồn nội dung: tài liệu của nhóm, dựa trên Williams & Burden (1997), Psychology for Language Teachers.
 * Số trang (tr./p.) là số trang in trong sách. Bản tiếng Anh do Claude dịch từ bản tiếng Việt.
 * Ngưỡng: thấp 6–14 · trung bình 15–21 · cao 22–30 (quy ước thực hành, không phải chuẩn QTI).
 * ============================================================================================ */
var QTI_ADVICE = {
  group: { Lea: 'A', Und: 'A', HFr: 'A', Unc: 'B', Dis: 'B', Adm: 'B', Str: 'C', SRe: 'C' },
  groupName: {
    A: ['Nhóm A – Hành vi hợp tác cần củng cố', 'Group A – Cooperative behaviours to strengthen'],
    B: ['Nhóm B – Hành vi cần giảm', 'Group B – Behaviours to reduce'],
    C: ['Nhóm C – Cặp cần cân bằng', 'Group C – A pair to balance']
  },
  want: {
    Lea: ['Cao', 'High'], Und: ['Cao', 'High'], HFr: ['Cao', 'High'],
    Unc: ['Thấp', 'Low'], Dis: ['Thấp', 'Low'], Adm: ['Thấp', 'Low'],
    Str: ['Vừa phải', 'Moderate'], SRe: ['Vừa phải, có khuôn khổ', 'Moderate, within a clear frame']
  },
  scales: {
    Lea: {
      meaning: ['nói về môn học nhiệt tình, giải thích rõ, giữ được sự chú ý, nắm được lớp, hành động tự tin.',
        'talking about the subject with enthusiasm, explaining clearly, holding attention, knowing what goes on in class, acting confidently.'],
      tips: [
        ['Trước mỗi hoạt động, tự hỏi: vì sao chọn hoạt động này, nó có giá trị gì với học sinh, và làm sao để các em thấy được giá trị đó (“Significance”, tr. 69–70).',
          'Before each activity, ask yourself why you chose it, what value it has for students, and how they will see that value (“Significance”, pp. 69–70).'],
        ['Nói rõ cả mục tiêu ngôn ngữ lẫn kỹ năng mang được ra ngoài bài, ví dụ học từ vựng kèm cách ghi nhớ từ (“Purpose beyond the here and now”, tr. 71).',
          'State both the language aim and the skill students can take beyond the lesson, e.g. new words plus a way to remember them (“Purpose beyond the here and now”, p. 71).'],
        ['Đưa hướng dẫn rõ ràng và kiểm tra học sinh đã hiểu: vừa làm mẫu vừa giải thích, yêu cầu học sinh nhắc lại hướng dẫn, hoặc cho một nhóm làm mẫu (“Shared intention”, tr. 71–72).',
          'Give clear instructions and check understanding: demonstrate while explaining, ask students to repeat the instructions, or have one group model the task (“Shared intention”, pp. 71–72).'],
        ['Giữ sự chú ý bằng sự tò mò và thử thách vừa sức: nhiệm vụ có yếu tố bất ngờ nhưng không quá phức tạp (tr. 75, 126).',
          'Hold attention through curiosity and a manageable challenge: tasks with an element of surprise that are not too complex (pp. 75, 126).'],
        ['Thể hiện sự tự tin khi dùng ngoại ngữ, đồng thời tôn trọng nỗ lực diễn đạt của học sinh (tr. 62–63).',
          'Show confidence in using the foreign language while respecting students’ efforts to express themselves (pp. 62–63).'],
        ['Sau mỗi nhiệm vụ, cho học sinh điền phiếu hai cột “Hoạt động – Vì sao tôi làm” (tr. 71).',
          'After each task, have students fill in a two-column sheet: “Activity – Why I did it” (p. 71).']
      ],
      high: ['Đừng để “dẫn dắt” thành “quyết định mọi thứ”. Trung gian (mediation) là quá trình hai chiều, ngày càng có thương lượng với học sinh (tr. 68, 71); kết hợp với gợi ý trao quyền ở Nhóm C.',
        'Don’t let “leading” become “deciding everything”. Mediation is a two-way process with growing negotiation with students (pp. 68, 71); combine with the Student Responsibility suggestions in Group C.']
    },
    Und: {
      meaning: ['tin tưởng học sinh, cho phép bất đồng, sẵn sàng giải thích lại, lắng nghe, nhận ra khi học sinh chưa hiểu, kiên nhẫn.',
        'trusting students, allowing disagreement, explaining again, listening, noticing when students don’t understand, being patient.'],
      tips: [
        ['Đồng cảm và tìm hiểu học sinh như những cá nhân, hiểu cách các em nhìn nhận thế giới thay vì luôn áp đặt quan điểm của mình (Rogers, Hamachek, tr. 35–36).',
          'Empathise with and get to know students as individuals; understand how they see the world instead of always imposing your own view (Rogers, Hamachek, pp. 35–36).'],
        ['Trò chuyện với học sinh về điều kiện học ưa thích: thời điểm trong ngày, mức độ cấu trúc, học một mình hay theo cặp, nhóm, ai ảnh hưởng đến động lực. Không cần bài test chính thức (tr. 191–192).',
          'Talk with students about how they prefer to learn: time of day, how much structure, alone or in pairs and groups, who influences their motivation. No formal test is needed (pp. 191–192).'],
        ['Nhớ rằng một số hành vi tưởng là vô lễ có thể chỉ là khác biệt văn hoá (tr. 192).',
          'Remember that some behaviour that looks rude may simply be a cultural difference (p. 192).'],
        ['Xem học sinh như “đối tác”: hỏi các em muốn làm hoạt động nào, quan tâm chủ đề gì, cho tự chọn sách đọc (tr. 59).',
          'See students as “partners”: ask which activities they want, which topics interest them, and let them choose their own reading (p. 59).'],
        ['Tự quan sát xem mình có lắng nghe và kiên nhẫn đều với cả học sinh giỏi lẫn học sinh yếu không. Học sinh rất nhạy với sự đối xử khác nhau này (Weinstein, tr. 98).',
          'Check whether you listen and are equally patient with strong and weaker students. Students are very sensitive to such differences (Weinstein, p. 98).']
      ],
      high: ['Dùng sự tin tưởng sẵn có để thương lượng nhiệm vụ và mục tiêu với từng học sinh, đặc biệt học sinh đã “tắt điện” với môn học (“attunement strategy”, tr. 132–133).',
        'Use the trust you already have to negotiate tasks and goals with individual students, especially those who have “switched off” from the subject (“attunement strategy”, pp. 132–133).']
    },
    HFr: {
      meaning: ['giúp học sinh làm bài, thân thiện, đáng tin cậy, hài hước, chấp nhận đùa, lớp học dễ chịu.',
        'helping students with their work, being friendly, dependable and humorous, taking a joke, keeping the class pleasant.'],
      tips: [
        ['Tạo môi trường an toàn, nơi học sinh thấy mình thuộc về lớp và được tôn trọng (Maslow, tr. 34–35).',
          'Create a safe environment where students feel they belong and are respected (Maslow, pp. 34–35).'],
        ['Tổ chức hoạt động hình thành nhóm bằng ngoại ngữ, hoặc dự án chung cả lớp mà ai cũng đóng góp, ví dụ làm báo lớp (“Sense of belonging”, tr. 79).',
          'Run group-forming activities in the foreign language, or a whole-class project everyone contributes to, such as a class newspaper (“Sense of belonging”, p. 79).'],
        ['Cùng lớp thảo luận bằng ngoại ngữ về quy tắc làm việc nhóm: ra hiệu khi muốn nói, để người khác nói hết, lắng nghe nhau (tr. 78).',
          'Discuss group-work rules with the class in the foreign language: signal before speaking, let others finish, listen to each other (p. 78).'],
        ['Lấy đặc điểm của nhóm thành công theo Hadfield làm mục tiêu: lắng nghe, luân phiên, khoan dung, tin tưởng, đồng cảm (tr. 195).',
          'Aim for Hadfield’s features of a successful group: listening, taking turns, tolerance, trust, empathy (p. 195).'],
        ['Tạo khí hậu nơi mắc lỗi không đáng sợ, mọi đóng góp đều được ghi nhận và hoạt động mang lại cảm giác thành công (tr. 73).',
          'Build a climate where mistakes are not frightening, every contribution is acknowledged and activities give a sense of success (p. 73).']
      ],
      high: ['Giữ sự ấm áp nhưng gắn với nhiệm vụ học tập cụ thể. Lớp chỉ chú trọng quan hệ khiến học sinh hài lòng nhưng kết quả học thuật có thể kém hơn; kết quả tốt nhất đến từ sự kết hợp ấm áp, trọng tâm nhiệm vụ và cấu trúc rõ ràng (tr. 196–197).',
        'Keep the warmth but tie it to concrete learning tasks. Classes focused only on relationships leave students satisfied but may achieve less; the best results come from warmth, task focus and clear structure together (pp. 196–197).']
    },
    Unc: {
      meaning: ['tỏ ra không chắc chắn, ngập ngừng, không biết xử lý khi học sinh đùa nghịch, dễ bị làm cho lúng túng.',
        'seeming unsure or hesitant, not knowing what to do when students fool around, being easily thrown.'],
      tips: [
        ['Chuẩn bị ý định rõ ràng trước giờ: biết chính xác mình muốn học sinh làm gì và vì sao, soạn sẵn câu hướng dẫn bằng ngoại ngữ (“Shared intention”, tr. 71–72).',
          'Prepare a clear intention before class: know exactly what you want students to do and why, and script your instructions in the foreign language (“Shared intention”, pp. 71–72).'],
        ['Xây dựng cấu trúc lớp rõ ràng, có trật tự: quy tắc và nền nếp cố định. Đây là một trong ba thành phần của lớp học hiệu quả (tr. 197).',
          'Build a clear, orderly class structure with fixed rules and routines — one of the three components of an effective classroom (p. 197).'],
        ['Thương lượng trước với học sinh về quy tắc và hệ quả, để khi có tình huống bạn chỉ cần áp dụng điều đã thống nhất (tr. 198).',
          'Negotiate rules and consequences with students in advance, so in the moment you only apply what was agreed (p. 198).'],
        ['Phản tư sau hành động: ghi lại tình huống khiến bạn lúng túng, phân tích và chuẩn bị phương án cho lần sau (Schön, “reflection-on-action”, tr. 54).',
          'Reflect on action: note situations that threw you, analyse them and prepare a response for next time (Schön, “reflection-on-action”, p. 54).'],
        ['Nhờ đồng nghiệp dự giờ hoặc quay video bài dạy rồi xem lại cùng người quan sát (tr. 83).',
          'Ask a colleague to observe, or video a lesson and review it with the observer (p. 83).'],
        ['Chăm sóc sự tự tin nghề nghiệp của chính mình: giáo viên thiếu tự trọng sẽ khó xây dựng tự trọng cho học sinh (tr. 62).',
          'Look after your own professional confidence: teachers with low self-esteem find it hard to build students’ self-esteem (p. 62).']
      ],
      note: ['Câu 15 “I let the students take charge” được xếp vào thang này. Nếu bạn trao quyền có chủ đích, hãy đọc câu này cùng thang SRe.',
        'Item 15 “I let the students take charge” belongs to this scale. If you hand over control on purpose, read it together with the SRe scale.']
    },
    Dis: {
      meaning: ['nghĩ học sinh gian lận, không biết gì, không làm tốt được; hạ thấp học sinh; tỏ ra bất mãn, nghi ngờ.',
        'thinking students cheat, know nothing or can’t do things well; putting students down; seeming dissatisfied or suspicious.'],
      tips: [
        ['Xem lại niềm tin về người học. Meighan mô tả bảy cách nhìn, từ “người chống đối”, “bình chứa” đến “đối tác”, “người khám phá”. Cách nhìn “chống đối” dẫn đến ép buộc và trừng phạt, điều chưa từng tỏ ra hiệu quả trong dạy ngoại ngữ (tr. 57–58).',
          'Revisit your beliefs about learners. Meighan describes seven views, from “resisters” and “receptacles” to “partners” and “explorers”. Seeing learners as resisters leads to coercion and punishment, which has never proved effective in language teaching (pp. 57–58).'],
        ['Nuôi dưỡng “niềm tin vào kết quả tích cực”: ai cũng có thể học được ngoại ngữ; khi giáo viên tin như vậy, họ sẽ tiếp tục tìm cách giúp học sinh thành công (tr. 76–77).',
          'Nurture “optimism about outcomes”: everyone can learn a language; teachers who believe this keep finding ways to help students succeed (pp. 76–77).'],
        ['Chú ý cách bạn giải thích thành công và thất bại cho học sinh: gắn thất bại với nỗ lực và chiến lược (thay đổi được), không gắn với năng lực cố định (“reattribution training”, tr. 104–107, 109).',
          'Watch how you explain success and failure: link failure to effort and strategy (which can change), not to fixed ability (“reattribution training”, pp. 104–107, 109).'],
        ['Học sinh biết mình “giỏi đến đâu” chủ yếu qua điểm, lời nhận xét, lời khen chê của giáo viên (Weinstein, tr. 98). Tránh nhận xét mang tính dán nhãn.',
          'Students learn “how good they are” mainly from the teacher’s marks, comments, praise and criticism (Weinstein, p. 98). Avoid labelling remarks.'],
        ['Ghi nhận tiến bộ so với chính học sinh trước đó thay vì so với bạn khác; khi đó các em quy thành công cho nỗ lực nhiều hơn (tr. 193).',
          'Recognise progress against the student’s own earlier work rather than against classmates; students then attribute success more to effort (p. 193).'],
        ['Tự hỏi theo câu hỏi phản tư của Smyth: “Thực hành của tôi nói gì về giả định, giá trị, niềm tin của tôi? Những ý tưởng này từ đâu ra?” (tr. 55).',
          'Ask Smyth’s reflective questions: “What do my practices say about my assumptions, values and beliefs? Where did these ideas come from?” (p. 55).']
      ]
    },
    Adm: {
      meaning: ['nổi giận bất ngờ hoặc nhanh, sửa quá nhanh khi học sinh phạm quy, thiếu kiên nhẫn, dễ cãi nhau với học sinh, nói mỉa mai.',
        'getting angry suddenly or quickly, correcting rule-breaking too fast, impatience, arguing with students, making mocking remarks.'],
      tips: [
        ['Giảm trừng phạt, tăng ghi nhận: khen thưởng hiệu quả hơn trừng phạt, còn trừng phạt có thể gây tác dụng ngược (tr. 134–135).',
          'Punish less, acknowledge more: rewards work better than punishment, and punishment can backfire (pp. 134–135).'],
        ['Nhớ rằng ngay cả sự chú ý tiêu cực cũng có thể củng cố hành vi bạn muốn dừng (tr. 134).',
          'Remember that even negative attention can reinforce the behaviour you want to stop (p. 134).'],
        ['Tuyệt đối tránh mỉa mai, chê bai trước lớp: khi hình ảnh bản thân bị đe doạ, học sinh sẽ kháng cự việc học (Rogers, tr. 35).',
          'Never use sarcasm or criticise in front of the class: when their self-image is threatened, students resist learning (Rogers, p. 35).'],
        ['Góp ý riêng và luôn nêu lý do cụ thể; học sinh đánh giá khen riêng tư cao hơn khen công khai (Caffyn, tr. 135).',
          'Give feedback privately with specific reasons; students value private praise more than public praise (Caffyn, p. 135).'],
        ['Với học sinh “né tránh nỗ lực” (làm cực chậm, làm ẩu, viện cớ), phản ứng tiêu cực chỉ làm tăng xu hướng này. Hãy thương lượng nhiệm vụ, mục tiêu, cách làm, cho em dự đoán độ khó rồi xem lại sau khi làm (tr. 132–133).',
          'With effort-avoiding students (working very slowly, carelessly, making excuses), negative reactions make it worse. Negotiate the task, goal and method, let them predict the difficulty and review it afterwards (pp. 132–133).'],
        ['Tách việc sửa lỗi ngôn ngữ khỏi việc xử lý vi phạm: lớp ngoại ngữ cần là nơi học sinh dám mắc lỗi mà không sợ hãi (tr. 73, 202).',
          'Separate correcting language errors from dealing with misbehaviour: the language class must be a place where students dare to make mistakes (pp. 73, 202).']
      ]
    },
    Str: {
      meaning: ['nghiêm khắc, yêu cầu lớp im lặng, bài kiểm tra khó, chuẩn rất cao, chấm khắt khe, học sinh sợ giáo viên.',
        'being strict, demanding silence, hard tests, very high standards, severe marking, students being afraid of the teacher.'],
      head: ['Gợi ý khi điểm ≥ 22 hoặc câu 48 “Students are afraid of me” ≥ 3:', 'When the score is ≥ 22 or item 48 “Students are afraid of me” is ≥ 3:'],
      tips: [
        ['Ưu tiên giảm nỗi sợ: học ngoại ngữ cần môi trường nơi học sinh dám thử nói, dám sai (tr. 193, 202).',
          'Reduce fear first: language learning needs a place where students dare to try speaking and to get it wrong (pp. 193, 202).'],
        ['Giữ chuẩn cao nhưng làm nó vừa sức: nhiệm vụ đủ khó để thử thách, không quá khó (tr. 75), kèm hỗ trợ (giàn giáo) rồi giảm dần (tr. 162).',
          'Keep standards high but reachable: tasks challenging but not too hard (p. 75), with scaffolding that is gradually removed (p. 162).'],
        ['Chấm và nhận xét theo hướng cung cấp thông tin, không theo hướng kiểm soát: chỉ ra phần nào đạt, phần nào cần cải thiện và cải thiện bằng cách nào (tr. 135–136).',
          'Mark and comment to inform, not to control: show what was achieved, what needs work and how to improve it (pp. 135–136).'],
        ['Xem lại cơ cấu cạnh tranh: nó chỉ có lợi cho người làm tốt và khiến học sinh sợ mắc lỗi. Kết hợp thêm học hợp tác và đánh giá theo tiến bộ cá nhân (tr. 193–194).',
          'Rethink competitive structures: they only reward those who already do well and make students afraid of mistakes. Add cooperative learning and assessment of individual progress (pp. 193–194).'],
        ['Thương lượng thay vì chỉ siết chặt. Trong một nghiên cứu, cô giáo lớp 6 nghiêm khắc, tiêu cực lo học sinh sẽ lợi dụng nếu cô nới lỏng. Hai bên thỏa thuận: học sinh không quậy, cô cho các em tham gia nhiều hơn và phản hồi tích cực hơn. Sáu tháng sau, cả hai bên đều hài lòng hơn (tr. 198).',
          'Negotiate rather than only tighten. In one study a strict, negative Year 6 teacher feared students would take advantage if she relaxed. They agreed: students would not disrupt, and she would involve them more and give more positive feedback. Six months later both sides were happier (p. 198).']
      ],
      note: ['Hỏi học sinh trước khi nới lỏng. Một giáo viên nhân văn tự thấy mình quá trang trọng, nhưng học sinh lại cho rằng phong cách đó vừa đúng vì sắp thi (tr. 198–199).',
        'Ask students before relaxing. One humanistic teacher felt too formal, but her students found the style just right because exams were near (pp. 198–199).']
    },
    SRe: {
      meaning: ['học sinh được quyết định một số việc, có thể ảnh hưởng tới giáo viên, tự chọn lúc làm bài, được “cho qua” nhiều, có nhiều thời gian tự do, giáo viên dễ dãi. Câu 26, 30, 34 là trao quyền có chủ đích; câu 38, 42, 46 là buông lỏng.',
        'students deciding some things, influencing the teacher, choosing when to work, getting away with a lot, having much free time, a lenient teacher. Items 26, 30, 34 are purposeful empowerment; items 38, 42, 46 are looseness.'],
      lowHead: ['Gợi ý khi điểm ≤ 12 (học sinh gần như không có tiếng nói):', 'When the score is ≤ 12 (students have almost no say):'],
      low: [
        ['Giúp học sinh cảm thấy mình kiểm soát được việc học: xác định điểm mạnh, điểm yếu, lập kế hoạch học riêng, chịu trách nhiệm thực hiện, tự đánh giá, tham gia chọn hoạt động và giúp đỡ nhau (“locus of control”, tr. 101–103).',
          'Help students feel in control of their learning: identify strengths and weaknesses, plan their own learning, take responsibility, self-assess, help choose activities and help each other (“locus of control”, pp. 101–103).'],
        ['Cho học sinh tự đặt mục tiêu, vì mục tiêu tự đặt dễ đạt hơn mục tiêu được giao. Mẫu đơn giản: “Cuối khoá tôi muốn…” và “Tuần này tôi sẽ…” (tr. 74).',
          'Let students set their own goals — self-set goals are reached more often than imposed ones. A simple template: “By the end of the course I want…” and “This week I will…” (p. 74).'],
        ['Cho học sinh tự theo dõi tiến bộ: “từ đã học tuần này”, “sách đã đọc học kỳ này”, hồ sơ bài làm tốt nhất, hoặc bảng “Hoạt động – Đã học gì – Làm thế nào – Còn khó gì” (tr. 75–76).',
          'Let students track their own progress: “words learned this week”, “books read this term”, a portfolio of best work, or a table “Activity – What I learned – How – What is still hard” (pp. 75–76).'],
        ['Dạy chiến lược học theo trình tự: nhận diện chiến lược đang dùng, giới thiệu và làm mẫu chiến lược mới, luyện có hỗ trợ rồi giảm dần, cuối cùng tự đánh giá (tr. 162).',
          'Teach learning strategies in sequence: identify current strategies, introduce and model a new one, practise with support that fades, then self-evaluate (p. 162).'],
        ['Thận trọng với phần thưởng: thưởng cho việc học sinh vốn thích có thể làm giảm động lực nội tại (tr. 128, 135–136).',
          'Be careful with rewards: rewarding what students already enjoy can reduce intrinsic motivation (pp. 128, 135–136).']
      ],
      highHead: ['Gợi ý khi điểm ≥ 22, nhất là do câu 38, 42, 46 cao:', 'When the score is ≥ 22, especially because items 38, 42, 46 are high:'],
      high: [
        ['Tự chủ không có nghĩa để học sinh tự xoay xở. Giáo viên cần hỗ trợ các em làm việc với tài liệu cho đến khi thật sự tự định hướng (tr. 68).',
          'Autonomy does not mean leaving students to cope alone. Support them in working with materials until they can truly direct themselves (p. 68).'],
        ['Điều chỉnh theo lứa tuổi: trẻ nhỏ cần nhiều chỉ dẫn hơn và được chuyển dần trách nhiệm; người lớn có thể thương lượng nhiều hơn ngay từ đầu (tr. 71).',
          'Adjust to age: younger learners need more guidance with responsibility handed over gradually; adults can negotiate more from the start (p. 71).'],
        ['Mỗi khoảng tự do cần có mục tiêu, sản phẩm và thời hạn rõ. Học cá nhân hoá đòi hỏi giáo viên chuẩn bị và theo dõi nhiều hơn, không ít hơn (tr. 194).',
          'Every stretch of free time needs a clear goal, product and deadline. Individualised learning needs more preparation and monitoring from the teacher, not less (p. 194).'],
        ['Kết hợp với các gợi ý Leadership ở Nhóm A. Lớp linh hoạt, có định hướng giúp học sinh làm việc độc lập và giải quyết vấn đề tốt hơn (tr. 196).',
          'Combine with the Leadership suggestions in Group A. Flexible but well-directed classes help students work independently and solve problems better (p. 196).']
      ]
    }
  },
  profiles: [
    { id: 'trusted', name: ['Nghiêm khắc nhưng được tin cậy', 'Strict but trusted'], sign: ['Str cao; Lea, Und, HFr cũng cao; Adm, Dis thấp', 'Str high; Lea, Und, HFr also high; Adm, Dis low'],
      action: ['Không nhất thiết phải thay đổi. Hỏi học sinh trước, nhất là lớp chuẩn bị thi (tr. 198–199); chỉ chú ý câu 48 về nỗi sợ.',
        'No change is necessarily needed. Ask students first, especially exam classes (pp. 198–199); only watch item 48 about fear.'] },
    { id: 'warm', name: ['Dẫn dắt ấm áp', 'Warm leadership'], sign: ['Lea, Und, HFr cao; Unc, Dis, Adm thấp', 'Lea, Und, HFr high; Unc, Dis, Adm low'],
      action: ['Duy trì. Tăng dần trao quyền: học sinh tự đặt mục tiêu, tự theo dõi tiến bộ. Cho học sinh làm phiếu để kiểm chứng cảm nhận của bạn.',
        'Keep it up. Gradually hand over more responsibility: students set their own goals and track their progress. Ask students to fill in the questionnaire to check your perception.'] },
    { id: 'control', name: ['Kiểm soát chặt, ít ấm áp', 'Tight control, little warmth'], sign: ['Str, Adm cao; HFr, Und, SRe thấp', 'Str, Adm high; HFr, Und, SRe low'],
      action: ['Giảm trừng phạt, chuyển sang phản hồi mang tính thông tin. Thương lượng với lớp như nghiên cứu lớp 6 (tr. 198). Bổ sung hoạt động tạo cảm giác thuộc về nhóm.',
        'Punish less and move to informative feedback. Negotiate with the class as in the Year 6 study (p. 198). Add activities that build a sense of belonging.'] },
    { id: 'tense', name: ['Căng thẳng, thiếu tin tưởng', 'Tense, low trust'], sign: ['Dis, Adm cao; Und thấp', 'Dis, Adm high; Und low'],
      action: ['Xem lại niềm tin về người học (tr. 57–60). Tập giải thích thất bại bằng nỗ lực và chiến lược. Góp ý riêng, có lý do cụ thể.',
        'Revisit your beliefs about learners (pp. 57–60). Practise explaining failure through effort and strategy. Give feedback privately, with specific reasons.'] },
    { id: 'drift', name: ['Thân thiện nhưng thiếu định hướng', 'Friendly but lacking direction'], sign: ['HFr cao; SRe cao (câu 38, 42, 46); Lea thấp hoặc Unc cao', 'HFr high; SRe high (items 38, 42, 46); Lea low or Unc high'],
      action: ['Làm rõ mục đích và hướng dẫn từng nhiệm vụ, xây nền nếp lớp. Giữ sự ấm áp nhưng gắn với nhiệm vụ học tập cụ thể.',
        'Clarify the purpose and instructions of each task and build class routines. Keep the warmth but tie it to concrete learning tasks.'] },
    { id: 'unsure', name: ['Thiếu tự tin', 'Lacking confidence'], sign: ['Unc cao; Lea thấp; Str và Adm không cao', 'Unc high; Lea low; Str and Adm not high'],
      action: ['Chuẩn bị kỹ hướng dẫn bằng ngoại ngữ, thống nhất quy tắc lớp trước. Phản tư sau giờ dạy, nhờ đồng nghiệp dự giờ hoặc quay video.',
        'Prepare instructions in the foreign language carefully and agree class rules in advance. Reflect after lessons; ask a colleague to observe or video a lesson.'] }
  ],
  roadmap: [
    ['**Tính điểm 8 thang** và đánh dấu các thang “cần chú ý”.', '**Score the eight scales** and mark the ones that “need attention”.'],
    ['**Làm thêm bản “lý tưởng”:** trả lời lại 48 câu theo cách bạn muốn mình được nhìn nhận. Khoảng cách giữa thực tế và lý tưởng cho biết cần thay đổi ở đâu (tr. 198).',
      '**Add an “ideal” version:** answer the 48 items again as you would like to be seen. The gap between actual and ideal shows where to change (p. 198).'],
    ['**Cho học sinh cùng lớp làm phiên bản học sinh**, ẩn danh. Chỗ nào cảm nhận của bạn và của học sinh lệch nhau nhiều, chỗ đó cần trao đổi trước (tr. 198, 202).',
      '**Have the same class do the student version**, anonymously. Where your view and theirs differ most, talk about that first (pp. 198, 202).'],
    ['**Chọn 1–2 thang ưu tiên** và 2–3 gợi ý cụ thể; viết thành kế hoạch ngắn: sẽ làm gì, trong giờ nào, nhận biết thay đổi bằng dấu hiệu gì.',
      '**Choose 1–2 priority scales** and 2–3 concrete suggestions; write a short plan: what you will do, in which lessons, and what signs will show change.'],
    ['**Chia sẻ kết quả với học sinh và thương lượng:** mỗi bên cam kết một điều, như nghiên cứu lớp 6 (tr. 198).',
      '**Share the result with students and negotiate:** each side commits to one thing, as in the Year 6 study (p. 198).'],
    ['**Phản tư định kỳ:** ghi nhật ký ngắn sau giờ dạy, dùng các câu hỏi của Smyth (tr. 55); nhờ đồng nghiệp dự giờ hoặc quay video để xem lại (tr. 83).',
      '**Reflect regularly:** keep a short journal after lessons using Smyth’s questions (p. 55); ask a colleague to observe or video a lesson to review (p. 83).'],
    ['**Làm lại questionnaire sau khoảng 6 tháng** (cả bản giáo viên và học sinh) để đo mức thay đổi, rồi chọn thang ưu tiên tiếp theo.',
      '**Retake the questionnaire after about 6 months** (teacher and student versions) to measure change, then choose the next priority scale.']
  ],
  caveats: [
    ['**Đây là cảm nhận của bạn về một lớp cụ thể.** Cảm nhận của học sinh thường khác giáo viên, và chính cảm nhận của học sinh ảnh hưởng mạnh nhất đến kết quả học (tr. 98, 198, 202). Nên cho học sinh làm phiên bản dành cho học sinh để đối chiếu.',
      '**This is your view of one particular class.** Students’ views often differ from the teacher’s, and it is the students’ view that most affects learning (pp. 98, 198, 202). Use the student version to compare.'],
    ['**Không có một lớp học “tối ưu” duy nhất.** Kiểu tổ chức khác nhau dẫn đến kết quả khác nhau (Moos, tr. 196); hỏi học sinh trước khi thay đổi lớn.',
      '**There is no single “optimal” classroom.** Different set-ups lead to different outcomes (Moos, p. 196); ask students before making big changes.'],
    ['**Chọn 1–2 thang ưu tiên**, không cố sửa cả tám thang cùng lúc.', '**Choose 1–2 priority scales**; don’t try to fix all eight at once.']
  ],
  evidence: ['Theo Williams & Burden (tr. 199–200), các nghiên cứu ở Hà Lan, Mỹ và Úc cho thấy giáo viên thể hiện nhiều hành vi dẫn dắt, thân thiện, thấu hiểu giúp học sinh đạt kết quả cao hơn và có thái độ tích cực hơn với môn học; hành vi do dự, không hài lòng, khiển trách gây hiệu ứng ngược lại.',
    'According to Williams & Burden (pp. 199–200), studies in the Netherlands, the USA and Australia show that more leadership, friendly and understanding behaviour goes with higher achievement and more positive attitudes, while uncertain, dissatisfied and admonishing behaviour has the opposite effect.'],
  source: ['Williams, M. & Burden, R. L. (1997). Psychology for Language Teachers: A Social Constructivist Approach. Cambridge University Press. Số trang là số trang in trong sách. Ngưỡng 6–14 / 15–21 / 22–30 và các hồ sơ kết hợp là quy ước thực hành, không phải chuẩn QTI.',
    'Williams, M. & Burden, R. L. (1997). Psychology for Language Teachers: A Social Constructivist Approach. Cambridge University Press. Page numbers refer to the printed book. The 6–14 / 15–21 / 22–30 bands and the combined profiles are practical conventions, not QTI norms.']
};

/* ===================== ỨNG DỤNG / APP ===================== */
(function () {
  'use strict';
  var CFG = window.QTI_CONFIG || {};
  var DEMO_MODE = !CFG.API_URL;
  var N = 48, C = QTI_CORE, D = QTI_DATA;

  /* ---------- tiện ích ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function mkStore(area) {
    return {
      get: function (k, def) { try { var v = window[area].getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
      set: function (k, v) { try { window[area].setItem(k, JSON.stringify(v)); } catch (e) { } },
      del: function (k) { try { window[area].removeItem(k); } catch (e) { } }
    };
  }
  var LS = mkStore('localStorage'), SS = mkStore('sessionStorage');
  function fmtScore(v) { return v == null ? '–' : (v % 1 ? v.toFixed(1) : String(v)); }
  function mmss(ms) {
    ms = Math.max(0, ms); var t = Math.ceil(ms / 1000);
    return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2);
  }
  function fmtTime(ts) {
    var d = new Date(ts);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  /* ---------- ngôn ngữ / i18n ---------- */
  var L = {
    appTitle: ['Bảng hỏi về Tương tác của Giáo viên', 'Questionnaire on Teacher Interaction'],
    selfQ: ['Phiếu tự đánh giá của giáo viên · 48 câu', 'Teacher self questionnaire · 48 items'],
    intro: ['Bảng hỏi gồm 48 câu về cách bạn tương tác với học sinh trong một lớp học cụ thể. Với mỗi câu, hãy chọn mức độ từ 1 (Không bao giờ) đến 5 (Luôn luôn).',
      'This questionnaire has 48 sentences about your behaviour in a particular class. For each sentence, choose from 1 (Never) to 5 (Always).'],
    pickName: ['Chọn tên của bạn', 'Select your name'],
    searchPh: ['Gõ để tìm tên…', 'Type to search…'],
    noMatch: ['Không tìm thấy tên phù hợp.', 'No matching name.'],
    emptyRoster: ['Chưa có danh sách lớp. Người quản trị cần thêm danh sách trước.', 'No class list yet. An admin needs to add it first.'],
    cont: ['Tiếp tục', 'Continue'],
    back: ['Quay lại', 'Back'],
    adminLink: ['Quản trị', 'Admin'],
    hello: ['Xin chào', 'Hello'],
    roleQ: ['Bạn muốn làm gì?', 'What would you like to do?'],
    roleTake: ['Tham gia khảo sát', 'Take the survey'],
    roleTakeD: ['Làm bài 48 câu như mọi người', 'Answer the 48 items like everyone else'],
    roleAdmin: ['Quản trị', 'Admin dashboard'],
    roleAdminD: ['Điều khiển phiên, theo dõi tiến trình, xem bài của mọi người', 'Control the session, watch progress, see everyone\'s answers'],
    notYou: ['Không phải bạn? Đổi tên', 'Not you? Change name'],
    howTo: ['Cách làm', 'How it works'],
    how1: ['Mỗi câu chọn 1 mức: 1 = Không bao giờ … 5 = Luôn luôn.', 'Pick one level per item: 1 = Never … 5 = Always.'],
    how2: ['Bấm chọn xong sẽ tự chuyển sang câu tiếp theo. Có thể quay lại sửa.', 'After you tap, the next item appears. You can go back to change.'],
    how3t: ['Thời gian làm bài: {m}.', 'Time allowed: {m}.'],
    how3s: ['Đồng hồ chạy chung cho cả lớp khi người điều phối bấm Bắt đầu.', 'One shared clock starts when the facilitator presses Start.'],
    how3i: ['Đồng hồ bắt đầu khi bạn bấm “Bắt đầu làm bài”.', 'Your clock starts when you press “Start”.'],
    how3o: ['Không giới hạn thời gian.', 'No time limit.'],
    how4s: ['Hết giờ, phần đã làm sẽ được tự động nộp.', 'When time is up, your answers are submitted automatically.'],
    how4l: ['Hết giờ, bài sẽ bị khoá và không được ghi nhận — hãy nộp trước khi hết giờ.', 'When time is up, the survey locks and is not recorded — submit before then.'],
    stClosed: ['Khảo sát chưa mở. Vui lòng chờ người điều phối.', 'The survey is not open yet. Please wait for the facilitator.'],
    stWaiting: ['Bạn đã vào phòng chờ. Bài sẽ tự bắt đầu khi người điều phối bấm Bắt đầu.', 'You are in the waiting room. The survey starts automatically when the facilitator presses Start.'],
    stEnded: ['Phiên khảo sát đã kết thúc.', 'This survey session has ended.'],
    startBtn: ['Bắt đầu làm bài', 'Start'],
    resume: ['Làm tiếp', 'Resume'],
    qOf: ['Câu {i}/{n}', 'Item {i}/{n}'],
    never: ['Không bao giờ', 'Never'],
    always: ['Luôn luôn', 'Always'],
    prev: ['Câu trước', 'Previous'],
    next: ['Câu sau', 'Next'],
    allItems: ['Danh sách câu', 'All items'],
    submit: ['Nộp bài', 'Submit'],
    confirmMissing: ['Bạn còn {k} câu chưa trả lời. Vẫn nộp bài?', 'You have {k} unanswered item(s). Submit anyway?'],
    confirmSubmit: ['Nộp bài ngay bây giờ?', 'Submit now?'],
    yes: ['Đồng ý', 'Yes'],
    cancel: ['Huỷ', 'Cancel'],
    submitting: ['Đang nộp bài…', 'Submitting…'],
    submitFail: ['Chưa gửi được bài (lỗi kết nối). Câu trả lời của bạn vẫn còn trên máy.', 'Could not send (connection problem). Your answers are still on this device.'],
    retry: ['Thử lại', 'Try again'],
    timeUpLock: ['Đã hết giờ. Bài làm không được ghi nhận.', 'Time is up. Your answers were not recorded.'],
    yourResult: ['Kết quả của bạn', 'Your result'],
    partial: ['Kết quả dựa trên {k}/48 câu đã trả lời.', 'Based on {k}/48 answered items.'],
    scale: ['Thang đo', 'Scale'],
    score: ['Điểm', 'Score'],
    avgItem: ['TB/câu', 'Mean/item'],
    summary: ['Nhận xét ngắn', 'Brief summary'],
    disclaimerT: ['Lưu ý', 'Please note'],
    disclaimer: ['Đây là kết quả tự đánh giá, chỉ mang tính tham khảo — không phải đánh giá chính thức về năng lực giảng dạy. Cách giáo viên tự nhìn nhận thường khác với cảm nhận của học sinh. Để có bức tranh đầy đủ và khách quan hơn, bạn nên tham khảo thêm ý kiến của học sinh (ví dụ cho học sinh làm phiên bản QTI dành cho học sinh) rồi so sánh hai kết quả.',
      'This is a self-assessment and is for reference only — it is not an official evaluation of your teaching. How teachers see themselves often differs from how students see them. For a fuller, more objective picture, also gather your students\' views (e.g. with the student version of the QTI) and compare the two.'],
    retake: ['Làm lại', 'Retake'],
    home: ['Về trang đầu', 'Back to start'],
    halves: ['Nửa phải: nhóm hợp tác (gần gũi) · Nửa trái: nhóm đối lập (xa cách)', 'Right half: cooperation · Left half: opposition'],
    wheelNote: ['Múi càng dài, điểm càng cao (tối đa 30).', 'Longer slice = higher score (max 30).'],
    loading: ['Đang tải…', 'Loading…'],
    errLoad: ['Không kết nối được máy chủ. Kiểm tra lại đường dẫn API trong config.js hoặc mạng.', 'Cannot reach the server. Check the API URL in config.js or your connection.'],
    demoBadge: ['Chế độ demo — dữ liệu chỉ lưu trên trình duyệt này. Bấm “Đăng nhập quản trị” ở cuối trang, chọn “Chủ trang Demo”, mật khẩu: demo', 'Demo mode — data stays in this browser. Press “Admin sign-in” at the bottom, pick “Chủ trang Demo”, password: demo'],
    // admin
    adminLogin: ['Đăng nhập quản trị', 'Admin sign-in'],
    password: ['Mật khẩu', 'Password'],
    login: ['Đăng nhập', 'Sign in'],
    adviceT: ['Gợi ý cho bạn', 'Suggestions for you'],
    suggT: ['Bắt đầu ngay', 'Start right away'],
    suggD: ['Những việc nhỏ, dễ làm trong 1–2 tuần tới, dựa trên kết quả của bạn.', 'Small, easy actions for the next 1–2 weeks, based on your result.'],
    profileL: ['Hồ sơ gần nhất với kết quả của bạn', 'The profile closest to your result'],
    profileAct: ['Hướng ưu tiên:', 'Priority:'],
    prioLead: ['Gợi ý chi tiết cho {n} thang ưu tiên (không cố sửa cả tám thang cùng lúc):', 'Detailed suggestions for {n} priority scale(s) (don’t try to fix all eight at once):'],
    meaningL: ['Ý nghĩa:', 'What it means:'],
    noteL: ['Lưu ý:', 'Note:'],
    moreTips: ['Xem thêm {n} gợi ý', 'Show {n} more'],
    noPrio: ['Không có thang nào ở mức “cần chú ý”. Hãy duy trì, và cho học sinh làm phiên bản dành cho học sinh để kiểm chứng.', 'No scale is at a “needs attention” level. Keep it up, and use the student version to check your view.'],
    strengthT: ['Phát huy điểm mạnh', 'Building on strengths'],
    roadmapT: ['Lộ trình hành động trong một học kỳ (7 bước)', 'An action plan for one term (7 steps)'],
    caveatT: ['Ba điều cần nhớ khi đọc gợi ý', 'Three things to keep in mind'],
    sourceL: ['Nguồn:', 'Source:'],
    lv_low: ['Thấp', 'Low'], lv_mid: ['Trung bình', 'Medium'], lv_high: ['Cao', 'High'],
    wantL: ['nên', 'aim'],
    attn: ['Cần chú ý', 'Needs attention'],
    exportT: ['Lưu kết quả:', 'Save your result:'],
    exportImg: ['Xuất ảnh', 'Save image'],
    exportDocx: ['Báo cáo Word', 'Word report'],
    exporting: ['Đang tạo…', 'Creating…'],
    exportFail: ['Không tạo được tệp. Vui lòng thử lại.', 'Could not create the file. Please try again.'],
    imgReady: ['Ảnh kết quả', 'Result image'],
    holdToSave: ['Trên điện thoại: nhấn giữ vào ảnh để lưu vào thư viện, hoặc bấm “Tải về”.', 'On a phone: press and hold the image to save it, or tap “Download”.'],
    download: ['Tải về', 'Download'],
    adminSignIn: ['Đăng nhập quản trị', 'Admin sign-in'],
    adminOnly: ['Chỉ những người thuộc nhóm quản trị do chủ trang cấp quyền mới đăng nhập được.', 'Only members of the admin group set by the site owner can sign in.'],
    adminName: ['Tên quản trị viên', 'Admin name'],
    forgotPw: ['Quên mật khẩu? Nhờ chủ trang đặt lại. Chủ trang quên mật khẩu: mở Google Sheet → menu QTI → “Đặt lại chủ trang”.', 'Forgot your password? Ask the site owner to reset it. Owner forgot: open the Google Sheet → QTI menu → “Reset owner”.'],
    badLogin: ['Sai tên hoặc mật khẩu.', 'Wrong name or password.'],
    lockedMsg: ['Nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.', 'Too many failed attempts. Please try again in 10 minutes.'],
    weakPw: ['Mật khẩu cần ít nhất {n} ký tự.', 'Password needs at least {n} characters.'],
    pwMismatch: ['Hai mật khẩu mới không khớp.', 'The two new passwords do not match.'],
    badCode: ['Mã thiết lập không đúng.', 'Setup code is incorrect.'],
    ownerExists: ['Trang đã có chủ trang.', 'This site already has an owner.'],
    forbiddenMsg: ['Chỉ chủ trang mới làm được việc này.', 'Only the site owner can do this.'],
    noName: ['Vui lòng nhập tên.', 'Please enter a name.'],
    ownerSetupT: ['Thiết lập chủ trang', 'Set up site owner'],
    ownerSetupD: ['Trang chưa có chủ trang. Nhập mã thiết lập (lấy trong Google Sheet → menu QTI → “Hiện mã thiết lập chủ trang”), tên và mật khẩu của bạn. Mã chỉ dùng được một lần.',
      'This site has no owner yet. Enter the setup code (Google Sheet → QTI menu → “Show owner setup code”), your name and a password. The code works only once.'],
    setupCode: ['Mã thiết lập', 'Setup code'],
    yourName: ['Tên của bạn', 'Your name'],
    createOwner: ['Tạo chủ trang', 'Create owner'],
    ownerCreated: ['Đã tạo tài khoản chủ trang', 'Owner account created'],
    oldPw: ['Mật khẩu hiện tại', 'Current password'],
    newPw: ['Mật khẩu mới', 'New password'],
    newPw2: ['Nhập lại mật khẩu mới', 'Repeat new password'],
    minChars: ['tối thiểu {n} ký tự', 'at least {n} characters'],
    changePwT: ['Đổi mật khẩu', 'Change password'],
    mustChangeMsg: ['Bạn đang dùng mật khẩu tạm do chủ trang cấp. Hãy đặt mật khẩu riêng để tiếp tục.', 'You are using a temporary password. Set your own password to continue.'],
    pwChanged: ['Đã đổi mật khẩu', 'Password changed'],
    signedInAs: ['Đăng nhập:', 'Signed in:'],
    roleOwner: ['Chủ trang', 'Owner'],
    roleAdminS: ['Quản trị', 'Admin'],
    tabUsers: ['Quản trị viên', 'Admins'],
    usersHelp: ['Chỉ những người trong danh sách này mới vào được trang quản trị. Thêm người bằng tên (chọn từ danh sách lớp hoặc gõ mới) và một mật khẩu tạm; họ sẽ phải đổi mật khẩu ở lần đăng nhập đầu. Mật khẩu chỉ được lưu dạng mã băm, không ai xem lại được.',
      'Only people on this list can open the admin page. Add someone by name with a temporary password; they must change it at first sign-in. Passwords are stored only as hashes and cannot be viewed.'],
    pendingPw: ['chưa đổi mật khẩu tạm', 'temporary password pending'],
    notInRosterAdm: ['không có trong danh sách lớp — dùng link #admin', 'not in class list — use the #admin link'],
    resetPw: ['Đặt lại mật khẩu', 'Reset password'],
    remove: ['Gỡ quyền', 'Remove'],
    addAdmin: ['Thêm quản trị viên', 'Add an admin'],
    pickFromList: ['Chọn hoặc gõ tên…', 'Pick or type a name…'],
    tempPw: ['Mật khẩu tạm', 'Temporary password'],
    add: ['Thêm', 'Add'],
    alreadyAdmin: ['Người này đã là quản trị viên.', 'This person is already an admin.'],
    confirmReset: ['Đặt lại mật khẩu cho {n}? Mật khẩu cũ sẽ hết hiệu lực.', 'Reset the password for {n}? The old one will stop working.'],
    confirmRemove: ['Gỡ quyền quản trị của {n}?', 'Remove admin rights from {n}?'],
    adminAdded: ['Đã thêm quản trị viên', 'Admin added'],
    pwReset: ['Đã đặt lại mật khẩu', 'Password reset'],
    shareTemp: ['Gửi riêng mật khẩu tạm này cho {n}:', 'Send this temporary password privately to {n}:'],
    tempNote: ['Mật khẩu này chỉ hiện một lần. Người nhận sẽ phải đổi sang mật khẩu riêng ngay khi đăng nhập.', 'It is shown only once. They must set their own password when they sign in.'],
    copy: ['Sao chép', 'Copy'],
    copied: ['Đã sao chép', 'Copied'],
    tabOverview: ['Tiến trình', 'Progress'],
    tabResults: ['Kết quả', 'Results'],
    tabSettings: ['Cài đặt', 'Settings'],
    tabRoster: ['Danh sách lớp', 'Class list'],
    takeSurvey: ['Làm khảo sát', 'Take survey'],
    logout: ['Thoát', 'Sign out'],
    session: ['Phiên', 'Session'],
    s_closed: ['Chưa mở', 'Closed'],
    s_waiting: ['Phòng chờ', 'Waiting room'],
    s_running: ['Đang diễn ra', 'Running'],
    s_ended: ['Đã kết thúc', 'Ended'],
    c_openW: ['Mở phòng chờ', 'Open waiting room'],
    c_open: ['Mở khảo sát', 'Open survey'],
    c_start: ['Bắt đầu tính giờ', 'Start timer'],
    c_extend: ['+1 phút', '+1 min'],
    c_end: ['Kết thúc', 'End'],
    c_reopen: ['Mở lại', 'Reopen'],
    c_new: ['Phiên mới', 'New session'],
    confirmEnd: ['Kết thúc phiên? Những bài đang làm dở sẽ được xử lý theo cài đặt “khi hết giờ”.', 'End the session? Unfinished answers will be handled per the “when time is up” setting.'],
    confirmNew: ['Tạo phiên mới? Mọi người sẽ làm lại từ đầu. Dữ liệu cũ vẫn còn trong Google Sheet.', 'Start a new session? Everyone starts over. Old data stays in the Google Sheet.'],
    perPerson: ['mỗi người {m}', '{m} per person'],
    noLimit: ['Không giới hạn', 'No limit'],
    p_none: ['Chưa vào', 'Not joined'],
    p_waiting: ['Đang chờ', 'Waiting'],
    p_doing: ['Đang làm', 'Answering'],
    p_done: ['Đã nộp', 'Submitted'],
    all: ['Tất cả', 'All'],
    total: ['Tổng', 'Total'],
    online: ['đang trực tuyến', 'online'],
    left: ['còn {t}', '{t} left'],
    auto: ['tự nộp', 'auto'],
    classAvg: ['Trung bình cả lớp', 'Class average'],
    nSub: ['{k} bài đã nộp', '{k} submissions'],
    noSubs: ['Chưa có bài nộp trong phiên này.', 'No submissions in this session yet.'],
    openSheet: ['Mở Google Sheet', 'Open Google Sheet'],
    csv: ['Tải CSV', 'Download CSV'],
    name: ['Họ tên', 'Name'],
    answered: ['Số câu', 'Answered'],
    time: ['Thời gian', 'Time'],
    viewing: ['Đang xem phiên', 'Viewing session'],
    current: ['hiện tại', 'current'],
    timerMode: ['Cách tính giờ', 'Timer mode'],
    tm_shared: ['Cả lớp cùng lúc', 'Whole class together'],
    tm_sharedD: ['Bạn bấm “Bắt đầu tính giờ”, mọi người đếm ngược trên cùng một đồng hồ. Ai vào muộn sẽ còn ít thời gian hơn.', 'You press “Start timer”; everyone shares one countdown. Late joiners get less time.'],
    tm_ind: ['Riêng từng người', 'Per person'],
    tm_indD: ['Mỗi người có đủ thời gian, tính từ lúc họ tự bấm “Bắt đầu làm bài”.', 'Everyone gets the full time, counted from when they press “Start”.'],
    tm_off: ['Không giới hạn thời gian', 'No time limit'],
    tm_offD: ['Không có đồng hồ. Bạn tự kết thúc phiên khi muốn.', 'No clock. You end the session when you like.'],
    duration: ['Thời gian (phút)', 'Duration (minutes)'],
    timeout: ['Khi hết giờ', 'When time is up'],
    to_submit: ['Tự động nộp phần đã làm', 'Auto-submit answered items'],
    to_lock: ['Khoá bài, không ghi nhận', 'Lock — not recorded'],
    retakeOpt: ['Cho phép làm lại trong cùng một phiên', 'Allow retakes within a session'],
    defLang: ['Ngôn ngữ mặc định cho người tham gia', 'Default language for participants'],
    subtitle: ['Dòng phụ đề (vd: tên lớp, tên giảng viên)', 'Subtitle line (e.g. class, lecturer name)'],
    save: ['Lưu', 'Save'],
    saved: ['Đã lưu', 'Saved'],
    rosterHelp: ['Mỗi dòng một tên (có thể dán thẳng một cột từ Google Sheet/Excel). Quyền quản trị được cấp ở tab “Quản trị viên” (chỉ chủ trang).',
      'One name per line (paste a column straight from Sheets/Excel). Admin rights are granted in the “Admins” tab (owner only).'],
    rosterCount: ['{k} tên', '{k} names'],
    changedTimer: ['Thay đổi cách tính giờ có hiệu lực từ lần “Mở” tiếp theo.', 'Timer changes take effect the next time you open the survey.'],
    detailAnswers: ['Câu trả lời theo thang đo', 'Answers by scale'],
    close: ['Đóng', 'Close'],
    langVI: ['Tiếng Việt', 'Vietnamese'],
    langEN: ['Tiếng Anh', 'English'],
    langBoth: ['Song ngữ', 'Bilingual'],
    notInRoster: ['(không còn trong danh sách)', '(no longer in list)'],
    genDemo: ['Tạo 12 bài mẫu (demo)', 'Add 12 sample submissions (demo)'],
    errGeneric: ['Có lỗi xảy ra: {e}', 'Something went wrong: {e}'],
    newSessionMsg: ['Người điều phối vừa tạo phiên mới.', 'The facilitator started a new session.'],
    unitMin: ['{n} phút', '{n} min'],
    unitSec: ['{n} giây', '{n} s']
  };

  function lang() { return S.lang || (S.settings && S.settings.lang) || 'both'; }
  function fill(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }
  /* HTML song ngữ: CSS ẩn/hiện theo body[data-lang] */
  function bi(k, vars, block) {
    var p = L[k] || [k, k];
    return '<span class="bi' + (block ? ' blk' : '') + '"><span class="vi">' + esc(fill(p[0], vars)) +
      '</span><span class="en">' + esc(fill(p[1], vars)) + '</span></span>';
  }
  function biRaw(vi, en, block) {
    return '<span class="bi' + (block ? ' blk' : '') + '"><span class="vi">' + vi + '</span><span class="en">' + en + '</span></span>';
  }
  /* chuỗi thuần (cho placeholder, title…) */
  function tx(k, vars) {
    var p = L[k] || [k, k], l = lang();
    var vi = fill(p[0], vars), en = fill(p[1], vars);
    return l === 'vi' ? vi : l === 'en' ? en : vi + ' · ' + en;
  }
  function durBi(sec) {
    var m = Math.round(sec / 6) / 10;
    var vi = sec < 60 ? sec + ' giây' : m + ' phút', en = sec < 60 ? sec + ' s' : m + ' min';
    return { vi: vi, en: en };
  }

  /* ---------- trạng thái ---------- */
  var S = {
    lang: LS.get('qti_lang', null), settings: null, roster: [], person: null, prog: null, sub: null,
    answers: new Array(N).fill(null), attempt: '', seq: 0, idx: 0, pick: null, search: '',
    token: SS.get('qti_tok', ''), me: null, admins: [], needsOwner: false, adminTab: 'overview', adminData: null, adminSession: null,
    pFilter: 'all', pSearch: '', timeUpHandled: false, submitting: false
  };
  var timers = {};
  function stopTimer(k) { if (timers[k]) { clearInterval(timers[k]); clearTimeout(timers[k]); timers[k] = null; } }
  function stopAll() { Object.keys(timers).forEach(stopTimer); }

  /* ---------- API ---------- */
  var clockOffset = 0;
  function now() { return Date.now() + clockOffset; }

  async function api(action, data) {
    var payload = Object.assign({ action: action }, data || {});
    if (action.indexOf('admin') === 0 || action === 'authChange' || action === 'authLogout') payload.token = S.token;
    var res;
    if (DEMO_MODE) {
      await sleep(80);
      res = DEMO.call(payload);
    } else {
      var r = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' });
      res = await r.json();
    }
    if (res.now) clockOffset = res.now - Date.now();
    if (res.ok === false) { var e = new Error(res.error || 'error'); e.code = res.error; e.res = res; throw e; }
    return res;
  }

  /* SHA-256 (đồng bộ) – chỉ dùng cho chế độ demo; backend thật dùng Utilities.computeDigest */
  function sha256(str) {
    var K = [], H = [1779033703, -1150833019, 1013904242, -1521486534, 1359893119, -1694144372, 528734635, 1541459225], n = 2, c = 0;
    while (c < 64) { var p = true; for (var f = 2; f * f <= n; f++) if (n % f === 0) { p = false; break; } if (p) { K[c++] = (Math.pow(n, 1 / 3) % 1) * 4294967296 | 0; } n++; }
    var bytes = unescape(encodeURIComponent(String(str))), l = bytes.length, w = [], i, j;
    for (i = 0; i < l; i++) w[i >> 2] |= bytes.charCodeAt(i) << ((3 - i % 4) * 8);
    w[l >> 2] |= 0x80 << ((3 - l % 4) * 8);
    w[((l + 8) >> 6 << 4) + 15] = l * 8;
    for (j = 0; j < w.length; j += 16) {
      var a = H.slice(0), W = [];
      for (i = 0; i < 64; i++) {
        if (i < 16) W[i] = w[j + i] | 0;
        else {
          var x = W[i - 15], y = W[i - 2];
          W[i] = (((x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ (x >>> 3)) + W[i - 16] + ((y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ (y >>> 10)) + W[i - 7]) | 0;
        }
        var e = a[4], t1 = (a[7] + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + ((e & a[5]) ^ (~e & a[6])) + K[i] + W[i]) | 0;
        var b0 = a[0], t2 = (((b0 >>> 2 | b0 << 30) ^ (b0 >>> 13 | b0 << 19) ^ (b0 >>> 22 | b0 << 10)) + ((b0 & a[1]) ^ (b0 & a[2]) ^ (a[1] & a[2]))) | 0;
        a = [(t1 + t2) | 0].concat(a); a[4] = (a[4] + t1) | 0; a.length = 8;
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + a[i]) | 0;
    }
    return H.map(function (h) { return ('00000000' + (h >>> 0).toString(16)).slice(-8); }).join('');
  }

  /* ---------- DEMO backend (localStorage) ---------- */
  var DEMO = (function () {
    var KEY = 'qti_demo_db_v4';
    var ROSTER = (CFG.DEMO_ROSTER || ['Cô Nguyễn Thị Lan (GV)', 'Trần Minh Anh', 'Lê Hoàng Bảo', 'Phạm Thu Chi', 'Đỗ Quang Dũng', 'Vũ Ngọc Hà', 'Bùi Gia Huy',
      'Hoàng Mai Khanh', 'Ngô Đức Long', 'Đặng Thảo My', 'Phan Nhật Nam', 'Trịnh Bảo Ngọc', 'Lý Thanh Phong', 'Mai Phương Quỳnh',
      'Cao Minh Quân', 'Tạ Hồng Sơn', 'Lâm Khánh Thư', 'Dương Anh Tuấn', 'Hồ Bích Uyên', 'Kiều Văn Vinh', 'Châu Hải Yến'])
      .map(function (n) { return { name: n }; });
    // Demo: tài khoản quản trị giả lập (không phải người trong lớp). Mật khẩu demo: "demo"
    var DEMO_ADMINS = [['Chủ trang Demo', 'owner'], ['Quản trị Demo 1', 'admin'], ['Quản trị Demo 2', 'admin'], ['Quản trị Demo 3', 'admin']];
    function db() {
      var d = LS.get(KEY, null);
      if (!d) {
        d = { settings: { durationSec: 180 }, roster: ROSTER, prog: {}, seen: {}, subs: [], auth: { users: {} }, kv: {} };
        DEMO_ADMINS.forEach(function (x) {
          var u = { name: x[0], role: x[1], mustChange: false, salt: store.random(16) };
          u.hash = C.hashPw(store, 'demo', u.salt);
          d.auth.users[C.key(x[0])] = u;
        });
        LS.set(KEY, d);
      }
      return d;
    }
    function save(d) { LS.set(KEY, d); }
    var store = {
      getSettings: function () { return db().settings; },
      saveSettings: function (s) { var d = db(); d.settings = s; save(d); },
      getRoster: function () { return db().roster; },
      saveRoster: function (l) { var d = db(); d.roster = l; save(d); },
      getProg: function (ss, n) { return db().prog[ss + '|' + n] || null; },
      putProg: function (ss, n, o) { var d = db(); d.prog[ss + '|' + n] = o; save(d); },
      getProgMany: function (ss, names) { var d = db(), o = {}; names.forEach(function (n) { if (d.prog[ss + '|' + n]) o[n] = d.prog[ss + '|' + n]; }); return o; },
      touch: function (ss, n, t) { var d = db(); d.seen[ss + '|' + n] = t; save(d); },
      getSeenMany: function (ss, names) { var d = db(), o = {}; names.forEach(function (n) { if (d.seen[ss + '|' + n]) o[n] = d.seen[ss + '|' + n]; }); return o; },
      getSubs: function (ss) { return db().subs.filter(function (x) { return ss === '*' || x.session === ss; }); },
      addSub: function (x) { var d = db(); d.subs.push(x); save(d); },
      listSessions: function () { var seen = {}, o = []; db().subs.forEach(function (x) { if (!seen[x.session]) { seen[x.session] = 1; o.push(x.session); } }); return o; },
      lock: function (fn) { return fn(); },
      sheetUrl: function () { return ''; },
      getAuth: function () { return db().auth; },
      saveAuth: function (a) { var d = db(); d.auth = a; save(d); },
      getSetupCode: function () { return ''; },
      clearSetupCode: function () { },
      sha256: sha256,
      random: function (n) {
        var b = new Uint8Array(n);
        try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < n; i++) b[i] = Math.random() * 256 | 0; }
        return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      },
      kvGet: function (k) { var v = db().kv[k]; return v && v.e > Date.now() ? v.v : null; },
      kvPut: function (k, v, ttl) { var d = db(); d.kv[k] = { v: String(v), e: Date.now() + (ttl || 600) * 1000 }; save(d); },
      kvDel: function (k) { var d = db(); delete d.kv[k]; save(d); }
    };
    function call(p) {
      var out = C.handle(JSON.parse(JSON.stringify(p)), store, Date.now()) || {};
      out = JSON.parse(JSON.stringify(out));
      if (out.ok !== false) out.ok = true;
      out.now = Date.now();
      return out;
    }
    function sample() {
      var d = db(), s = Object.assign({}, C.DEFAULTS, d.settings);
      if (!s.sessionId) return;
      var done = {}; d.subs.forEach(function (x) { if (x.session === s.sessionId) done[C.key(x.name)] = 1; });
      var cand = d.roster.filter(function (r) { return !done[C.key(r.name)]; }).slice(0, 12);
      cand.forEach(function (r, j) {
        var bias = { Lea: 4, Und: 4.2, Unc: 1.8, Adm: 2, HFr: 4, SRe: 2.6, Dis: 1.7, Str: 3.1 };
        var ans = []; for (var i = 0; i < N; i++) {
          var b = bias[C.scaleOf(i)] + (Math.random() - 0.5) * 2.2;
          ans.push(Math.max(1, Math.min(5, Math.round(b))));
        }
        var sub = C.makeSub(s, r.name, ans, Math.random().toString(36).slice(2, 10), 'manual', null, Date.now() - j * 7000);
        sub.duration = 90 + Math.round(Math.random() * 85);
        d.subs.push(sub);
      });
      save(d);
    }
    return { call: call, sample: sample };
  })();

  /* ---------- khung trang ---------- */
  function applyLang() {
    document.body.setAttribute('data-lang', lang());
    document.documentElement.lang = lang() === 'en' ? 'en' : 'vi';
    $$('.lang-switch button').forEach(function (b) { b.classList.toggle('on', b.dataset.l === lang()); });
  }
  function setLang(l) { S.lang = l; LS.set('qti_lang', l); applyLang(); render(); }

  function shell() {
    document.body.innerHTML =
      '<header class="top"><div class="top-in">' +
      '<div class="brand"><div class="logo" aria-hidden="true">' + miniWheel() + '</div><div><div class="t1">' + bi('appTitle') + '</div>' +
      '<div class="t2" id="subtitle"></div></div></div>' +
      '<div class="lang-switch" role="group" aria-label="Language">' +
      '<button data-l="vi">VI</button><button data-l="en">EN</button><button data-l="both">VI+EN</button></div>' +
      '</div></header>' +
      (DEMO_MODE ? '<div class="demo">' + bi('demoBadge') + '</div>' : '') +
      '<main id="view"></main>' +
      '<footer class="foot"><span>QTI · Wubbels &amp; Levy · Dr Tony Rickards</span>' +
      '<a href="#admin" id="adminLink" class="admin-link"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' + bi('adminSignIn') + '</a></footer>' +
      '<div id="modal" class="modal" hidden></div><div id="toast" class="toast" hidden></div>';
    $$('.lang-switch button').forEach(function (b) { b.onclick = function () { setLang(b.dataset.l); }; });
    $('#adminLink').onclick = function (e) { e.preventDefault(); goAdminLogin(); };
    applyLang();
  }
  function miniWheel() {
    var g = '';
    D.WHEEL.forEach(function (s, i) {
      var r = [15, 13, 14, 10, 7, 6, 8, 11][i];
      g += '<path d="' + arc(r, i * 45, i * 45 + 45) + '" fill="' + D.SCALE[s].color + '" stroke="#fff" stroke-width="1"/>';
    });
    return '<svg viewBox="-16 -16 32 32" width="34" height="34">' + g + '</svg>';
  }
  function setSubtitle() {
    var el = $('#subtitle'); if (!el) return;
    var st = S.settings && S.settings.subtitle;
    el.innerHTML = st ? esc(st) : bi('selfQ');
  }
  var curView = 'loading';
  function show(v) { curView = v; render(); window.scrollTo(0, 0); }
  function render() {
    setSubtitle();
    var f = VIEWS[curView]; if (f) f();
  }
  function view(html) { $('#view').innerHTML = html; }
  /* chỉ thay nội dung khi thực sự đổi — tránh mất cú bấm khi tự làm mới */
  function setHTML(el, html) { if (el && el.__h !== html) { el.innerHTML = html; el.__h = html; return true; } return false; }
  function toast(html) {
    var t = $('#toast'); t.innerHTML = html; t.hidden = false;
    clearTimeout(timers.toast); timers.toast = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function modal(html, onClose) {
    var m = $('#modal');
    m.innerHTML = '<div class="modal-bg" data-x></div><div class="modal-box" role="dialog" aria-modal="true">' + html + '</div>';
    m.hidden = false; document.body.classList.add('noscroll');
    function close() { m.hidden = true; m.innerHTML = ''; document.body.classList.remove('noscroll'); document.removeEventListener('keydown', key); if (onClose) onClose(); }
    function key(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', key);
    $$('[data-x]', m).forEach(function (b) { b.onclick = close; });
    return close;
  }
  function confirmBox(msgHtml, okKey) {
    return new Promise(function (res) {
      var answered = false;
      var close = modal('<p class="confirm-msg">' + msgHtml + '</p><div class="row end">' +
        '<button class="btn ghost" data-x>' + bi('cancel') + '</button>' +
        '<button class="btn primary" id="okb">' + bi(okKey || 'yes') + '</button></div>', function () { if (!answered) res(false); });
      $('#okb').onclick = function () { answered = true; close(); res(true); };
      $('#okb').focus();
    });
  }
  function errMsg(e) { return bi('errGeneric', { e: (e && (e.code || e.message)) || '?' }); }

  /* ---------- VIEWS ---------- */
  var VIEWS = {};

  VIEWS.loading = function () { view('<div class="center pad"><div class="spinner"></div><p class="muted">' + bi('loading') + '</p></div>'); };
  VIEWS.error = function () {
    view('<section class="card narrow center"><p>' + bi('errLoad', null, true) + '</p><p class="muted small">' + esc(S.lastError || '') + '</p>' +
      '<button class="btn primary" id="rl">' + bi('retry') + '</button></section>');
    $('#rl').onclick = function () { boot(); };
  };

  /* --- Chọn tên --- */
  VIEWS.pick = function () {
    var empty = !S.roster.length;
    view('<section class="card narrow">' +
      '<h1 class="h1">' + bi('appTitle', null, true) + '</h1>' +
      '<p class="lead">' + bi('intro', null, true) + '</p>' +
      '<div class="scale-demo" aria-hidden="true"><span>' + bi('never') + '</span><b>1</b><b>2</b><b>3</b><b>4</b><b>5</b><span>' + bi('always') + '</span></div>' +
      '<label class="lbl" for="q">' + bi('pickName') + '</label>' +
      (empty ? '<p class="note">' + bi('emptyRoster') + '</p>' :
        '<div class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' +
        '<input id="q" type="search" autocomplete="off" placeholder="' + esc(tx('searchPh')) + '" value="' + esc(S.search) + '"></div>' +
        '<div class="names" id="names" role="listbox"></div>') +
      '<button class="btn primary block" id="go" disabled>' + bi('cont') + '</button>' +
      '</section>');
    if (empty) return;
    var q = $('#q');
    function list() {
      var f = fold(S.search);
      var rows = S.roster.filter(function (r) { return !f || fold(r.name).indexOf(f) >= 0; });
      $('#names').innerHTML = rows.length ? rows.map(function (r) {
        var on = S.pick && S.pick.name === r.name;
        return '<button class="name' + (on ? ' on' : '') + '" role="option" aria-selected="' + on + '" data-n="' + esc(r.name) + '">' +
          '<span class="av">' + esc(initials(r.name)) + '</span><span class="nm">' + esc(r.name) + '</span>' +
          (on ? '<svg class="ck" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>' : '') + '</button>';
      }).join('') : '<p class="muted pad-s">' + bi('noMatch') + '</p>';
      $$('#names .name').forEach(function (b) {
        b.onclick = function () { S.pick = findPerson(b.dataset.n); list(); $('#go').disabled = false; };
        b.ondblclick = function () { S.pick = findPerson(b.dataset.n); proceed(); };
      });
      $('#go').disabled = !S.pick;
    }
    q.oninput = function () { S.search = q.value; list(); };
    q.onkeydown = function (e) {
      if (e.key === 'Enter') {
        var f = fold(S.search), m = S.roster.filter(function (r) { return fold(r.name).indexOf(f) >= 0; });
        if (m.length === 1) { S.pick = m[0]; proceed(); } else if (S.pick) proceed();
      }
    };
    $('#go').onclick = proceed;
    list();
    if (window.innerWidth > 700) q.focus();
    function proceed() {
      if (!S.pick) return;
      S.person = S.pick;
      if (S.person.admin) show('role'); else join(false);
    }
  };
  function initials(n) {
    var p = n.replace(/\(.*?\)/g, '').trim().split(/\s+/);
    return ((p.length > 1 ? p[p.length - 2][0] : '') + (p[p.length - 1] || '?')[0]).toUpperCase();
  }
  function findPerson(n) {
    var k = C.key(n);
    for (var i = 0; i < S.roster.length; i++) if (C.key(S.roster[i].name) === k) return S.roster[i];
    return null;
  }

  /* --- Chọn vai trò (admin) --- */
  VIEWS.role = function () {
    view('<section class="card narrow">' +
      '<p class="muted">' + bi('hello') + ',</p><h2 class="h2 mely">' + esc(S.person.name) + '</h2>' +
      '<p class="lbl">' + bi('roleQ') + '</p>' +
      '<div class="choices">' +
      '<button class="choice" id="rt"><b>' + bi('roleTake', null, true) + '</b><small>' + bi('roleTakeD', null, true) + '</small></button>' +
      '<button class="choice" id="ra"><b>' + bi('roleAdmin', null, true) + '</b><small>' + bi('roleAdminD', null, true) + '</small></button>' +
      '</div><button class="link" id="bk">' + bi('notYou') + '</button></section>');
    $('#rt').onclick = function () { join(false); };
    $('#ra').onclick = function () { goAdminLogin(); };
    $('#bk').onclick = resetToPick;
  };

  function resetToPick() {
    stopAll(); LS.del('qti_me'); S.person = null; S.pick = null; S.sub = null; S.prog = null; S.search = '';
    show('pick');
  }

  /* --- Vào phiên --- */
  async function join(retake) {
    stopAll(); show('loading');
    try {
      var r = await api('join', { name: S.person.name, retake: !!retake });
      S.settings = r.settings; S.person = r.person || S.person;
      LS.set('qti_me', { name: S.person.name, session: S.settings.sessionId });
      if (r.sub && !retake) { S.sub = r.sub; return show('result'); }
      S.prog = r.prog; S.sub = null; S.timeUpHandled = false; S.submitting = false;
      restoreAnswers();
      if (S.settings.status === 'running' && S.prog.status === 'in_progress') return startQuiz();
      show('lobby'); lobbyPoll();
    } catch (e) {
      if (e.code === 'unknown_name') return resetToPick();
      S.lastError = e.message; show('error');
    }
  }
  function restoreAnswers() {
    var loc = LS.get('qti_ans', null), p = S.prog;
    var srv = C.cleanAnswers(p.answers || []);
    S.attempt = p.attempt; S.seq = p.seq || 0;
    if (loc && loc.name === S.person.name && loc.session === S.settings.sessionId && loc.attempt === p.attempt &&
      C.countAnswered(loc.answers) >= C.countAnswered(srv)) {
      S.answers = C.cleanAnswers(loc.answers); S.seq = Math.max(S.seq, loc.seq || 0);
    } else S.answers = srv;
  }
  function saveLocal() {
    LS.set('qti_ans', { name: S.person.name, session: S.settings.sessionId, attempt: S.attempt, answers: S.answers, seq: S.seq });
  }

  /* --- Phòng chờ --- */
  VIEWS.lobby = function () {
    var s = S.settings, d = durBi(s.durationSec);
    var how3 = s.timerMode === 'off' ? bi('how3o') :
      biRaw(esc(fill(L.how3t[0], { m: d.vi })) + ' ' + esc(L[s.timerMode === 'shared' ? 'how3s' : 'how3i'][0]),
        esc(fill(L.how3t[1], { m: d.en })) + ' ' + esc(L[s.timerMode === 'shared' ? 'how3s' : 'how3i'][1]));
    var st = '';
    var resumable = S.prog && S.prog.status === 'in_progress';
    if (s.status === 'closed') st = '<div class="status wait"><span class="pulse"></span>' + bi('stClosed') + '</div>';
    else if (s.status === 'waiting') st = '<div class="status wait"><span class="pulse"></span>' + bi('stWaiting') + '</div>';
    else if (s.status === 'ended') st = '<div class="status end">' + bi('stEnded') + '</div>';
    else if (s.status === 'running') st = '<button class="btn primary block big" id="startb">' + bi(resumable ? 'resume' : 'startBtn') + '</button>';
    view('<section class="card narrow">' +
      '<p class="muted">' + bi('hello') + ',</p><h2 class="h2 mely">' + esc(S.person.name) + '</h2>' +
      '<h3 class="h3">' + bi('howTo') + '</h3><ul class="how">' +
      '<li>' + bi('how1') + '</li><li>' + bi('how2') + '</li><li>' + how3 + '</li>' +
      (s.timerMode !== 'off' ? '<li>' + bi(s.timeoutAction === 'lock' ? 'how4l' : 'how4s') + '</li>' : '') +
      '</ul>' + st +
      '<button class="link" id="bk">' + bi('notYou') + '</button></section>');
    var b = $('#startb'); if (b) b.onclick = startQuiz;
    $('#bk').onclick = resetToPick;
  };
  function lobbyPoll() {
    stopTimer('poll');
    var tick = async function () {
      try {
        var r = await api('poll', { name: S.person.name });
        var old = S.settings; S.settings = r.settings;
        if (old.sessionId !== r.settings.sessionId) { toast(bi('newSessionMsg')); return join(false); }
        if (r.settings.status === 'running' && r.settings.timerMode === 'shared' && curView === 'lobby') return startQuiz();
        if (curView === 'lobby' && (old.status !== r.settings.status || old.timerMode !== r.settings.timerMode ||
          old.durationSec !== r.settings.durationSec || old.timeoutAction !== r.settings.timeoutAction)) render();
      } catch (e) { }
    };
    timers.poll = setInterval(tick, 2500 + Math.random() * 1000);
  }

  /* --- Làm bài --- */
  async function startQuiz() {
    stopTimer('poll');
    try {
      var r = await api('start', { name: S.person.name });
      S.settings = r.settings; S.prog = r.prog;
      if (S.prog.attempt !== S.attempt) { S.attempt = S.prog.attempt; }
    } catch (e) {
      if (e.code === 'not_running') { S.settings = e.res.settings; show('lobby'); return lobbyPoll(); }
      if (e.code === 'already_submitted') return join(false);
      S.lastError = e.message; return show('error');
    }
    S.timeUpHandled = false;
    S.idx = firstUnanswered(); if (S.idx < 0) S.idx = N - 1;
    show('quiz'); tickStart(); quizPoll();
  }
  function firstUnanswered() { for (var i = 0; i < N; i++) if (!S.answers[i]) return i; return -1; }
  function nextUnanswered(from) {
    for (var k = 1; k <= N; k++) { var i = (from + k) % N; if (!S.answers[i]) return i; }
    return -1;
  }
  function deadline() { return C.deadlineFor(S.settings, S.prog); }

  VIEWS.quiz = function () {
    var timed = S.settings.timerMode !== 'off';
    view('<div class="quiz">' +
      '<div class="qbar"><div class="qbar-in">' +
      (timed ? '<div class="timer" id="timer" aria-live="off">--:--</div>' : '') +
      '<div class="prog"><div class="prog-t"><span id="pcount"></span><span class="muted small">' + esc(S.person.name) + '</span></div>' +
      '<div class="bar"><i id="pbar"></i></div></div>' +
      '</div></div>' +
      '<section class="card narrow qcard" id="qcard"></section>' +
      '<details class="card narrow grid-wrap"><summary>' + bi('allItems') + '</summary><div class="qgrid" id="qgrid"></div></details>' +
      '<div class="narrow submit-row"><button class="btn primary block" id="subb">' + bi('submit') + '</button></div>' +
      '</div>');
    $('#subb').onclick = function () { askSubmit(); };
    renderCard(); tickRender();
  };
  function renderCard() {
    var i = S.idx, it = D.ITEMS[i], v = S.answers[i];
    var btns = '';
    for (var k = 1; k <= 5; k++) btns += '<button class="opt' + (v === k ? ' on' : '') + '" data-v="' + k + '" aria-pressed="' + (v === k) + '">' + k + '</button>';
    $('#qcard').innerHTML =
      '<div class="qnum">' + bi('qOf', { i: i + 1, n: N }) + '</div>' +
      '<p class="qtext">' + biRaw(esc(it[1]), esc(it[0]), true) + '</p>' +
      '<div class="opts">' + btns + '</div>' +
      '<div class="opt-l"><span>' + bi('never') + '</span><span>' + bi('always') + '</span></div>' +
      '<div class="row between nav"><button class="btn ghost" id="pv"' + (i === 0 ? ' disabled' : '') + '>‹ ' + bi('prev') + '</button>' +
      '<button class="btn ghost" id="nx"' + (i === N - 1 ? ' disabled' : '') + '>' + bi('next') + ' ›</button></div>';
    $$('#qcard .opt').forEach(function (b) { b.onclick = function () { answer(Number(b.dataset.v)); }; });
    $('#pv').onclick = function () { go(S.idx - 1); };
    $('#nx').onclick = function () { go(S.idx + 1); };
    var cnt = C.countAnswered(S.answers);
    $('#pcount').innerHTML = '<b>' + cnt + '</b>/' + N;
    $('#pbar').style.width = (cnt / N * 100) + '%';
    var g = '';
    for (var j = 0; j < N; j++) g += '<button class="qc' + (S.answers[j] ? ' a' : '') + (j === i ? ' cur' : '') + '" data-i="' + j + '">' + (j + 1) + '</button>';
    $('#qgrid').innerHTML = g;
    $$('#qgrid .qc').forEach(function (b) { b.onclick = function () { go(Number(b.dataset.i)); }; });
    $('#subb').classList.toggle('pulse-btn', cnt === N);
  }
  function go(i) { if (i < 0 || i >= N) return; clearTimeout(timers.adv); S.idx = i; renderCard(); }
  function answer(v) {
    if (S.submitting) return;
    S.answers[S.idx] = v; S.seq++; saveLocal(); queueProgress();
    renderCard();
    clearTimeout(timers.adv);
    timers.adv = setTimeout(function () {
      var nx = nextUnanswered(S.idx);
      if (nx >= 0) go(nx);
      else { var b = $('#subb'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }, 230);
  }
  function queueProgress() {
    clearTimeout(timers.prog);
    timers.prog = setTimeout(sendProgress, 1200);
  }
  function sendProgress() {
    clearTimeout(timers.prog);
    if (!S.person || S.submitting) return;
    api('progress', { name: S.person.name, answers: S.answers, seq: S.seq, attempt: S.attempt })
      .then(function (r) { applySettingsDuringQuiz(r.settings); }).catch(function () { });
  }
  function tickStart() { stopTimer('tick'); timers.tick = setInterval(tickRender, 250); }
  function tickRender() {
    var el = $('#timer'); var dl = deadline();
    if (!el || !dl) return;
    var left = dl - now();
    el.textContent = mmss(left);
    el.classList.toggle('warn', left < 30000);
    el.classList.toggle('crit', left < 10000);
    if (left <= 0 && !S.timeUpHandled) onTimeUp();
  }
  function onTimeUp() {
    S.timeUpHandled = true;
    if (S.settings.timeoutAction === 'lock') { stopAll(); sendProgress(); show('locked'); }
    else submit('timeout');
  }
  function quizPoll() {
    stopTimer('poll');
    timers.poll = setInterval(async function () {
      try { var r = await api('poll', { name: S.person.name }); applySettingsDuringQuiz(r.settings); } catch (e) { }
    }, 4000 + Math.random() * 1500);
  }
  function applySettingsDuringQuiz(ns) {
    if (!ns || curView !== 'quiz') return;
    var old = S.settings; S.settings = ns;
    if (old.sessionId !== ns.sessionId) { stopAll(); toast(bi('newSessionMsg')); return join(false); }
    if (ns.status === 'ended' && !S.timeUpHandled) return onTimeUp();
    if (ns.status === 'closed') { stopAll(); show('lobby'); return lobbyPoll(); }
  }
  async function askSubmit() {
    var miss = N - C.countAnswered(S.answers);
    var ok = await confirmBox(miss ? bi('confirmMissing', { k: miss }) : bi('confirmSubmit'), 'submit');
    if (ok) submit('manual');
  }
  async function submit(reason) {
    if (S.submitting) return;
    S.submitting = true; stopAll(); S.lastReason = reason;
    show('submitting');
    for (var t = 1; t <= 4; t++) {
      try {
        var r = await api('submit', { name: S.person.name, answers: S.answers, attempt: S.attempt, reason: reason });
        S.sub = r.sub; LS.del('qti_ans'); S.submitting = false;
        return show('result');
      } catch (e) {
        if (e.code === 'time_up') { S.submitting = false; return show('locked'); }
        if (e.code) { S.submitting = false; S.lastError = e.code; return show('submitFail'); }
        await sleep(800 * t);
      }
    }
    S.submitting = false; show('submitFail');
  }
  VIEWS.submitting = function () { view('<div class="center pad"><div class="spinner"></div><p>' + bi('submitting') + '</p></div>'); };
  VIEWS.submitFail = function () {
    view('<section class="card narrow center"><p>' + bi('submitFail', null, true) + '</p><p class="muted small">' + esc(S.lastError || '') + '</p>' +
      '<button class="btn primary" id="rt">' + bi('retry') + '</button></section>');
    $('#rt').onclick = function () { submit(S.lastReason || 'manual'); };
  };
  VIEWS.locked = function () {
    view('<section class="card narrow center"><div class="big-ico">⏱</div><p class="lead">' + bi('timeUpLock', null, true) + '</p>' +
      '<button class="btn ghost" id="hm">' + bi('home') + '</button></section>');
    $('#hm').onclick = resetToPick;
  };

  /* --- Kết quả --- */
  VIEWS.result = function () {
    var x = S.sub;
    view('<section class="card narrow result">' +
      '<p class="muted">' + esc(x.name) + '</p><h2 class="h2 mely">' + bi('yourResult', null, true) + '</h2>' +
      (x.answered < N ? '<p class="note">' + bi('partial', { k: x.answered }) + '</p>' : '') +
      resultBlock(x.scores, x.answers) +
      '<div class="disclaimer"><b>' + bi('disclaimerT') + '</b><p>' + bi('disclaimer', null, true) + '</p></div>' +
      exportButtons('me') +
      '<div class="row center gap">' +
      (S.settings && S.settings.allowRetake && S.settings.status === 'running' ? '<button class="btn ghost" id="rtk">' + bi('retake') + '</button>' : '') +
      '<button class="btn primary" id="hm">' + bi('home') + '</button></div></section>');
    var r = $('#rtk'); if (r) r.onclick = function () { join(true); };
    $('#hm').onclick = resetToPick;
    bindExport($('#view'), x);
    resultPoll();
  };
  /* Ở trang kết quả: nếu quản trị tạo phiên mới → tự đưa người dùng vào phiên mới */
  function resultPoll() {
    stopTimer('poll');
    if (!S.person) return;
    var sid = S.settings && S.settings.sessionId;
    timers.poll = setInterval(async function () {
      if (curView !== 'result' || document.hidden) return;
      try {
        var r = await api('poll', { name: S.person.name });
        if (r.settings.sessionId !== sid) { stopTimer('poll'); S.settings = r.settings; toast(bi('newSessionMsg')); join(false); }
        else if (!!r.settings.allowRetake !== !!S.settings.allowRetake || r.settings.status !== S.settings.status) { S.settings = r.settings; render(); }
      } catch (e) { }
    }, 5000 + Math.random() * 2000);
  }
  function resultBlock(sc, ans) {
    var c = conclusion(sc), an = analyze(sc, ans); an._ans = ans;
    return '<div class="wheel-wrap">' + wheelSVG(sc) + '</div>' + legend() + scoreTable(sc, an.flags) +
      (c ? '<div class="summary"><h3 class="h3">' + bi('summary') + '</h3>' +
        c.map(function (p) { return '<p>' + biRaw(esc(p[0]), esc(p[1]), true) + '</p>'; }).join('') + '</div>' : '') +
      adviceBlock(sc, an);
  }
  function legend() {
    return '<div class="legend"><span class="muted">' + bi('halves') + '</span><span class="muted">' + bi('wheelNote') + '</span></div>';
  }
  function scoreTable(sc, flags) {
    flags = flags || {};
    return '<table class="scores"><thead><tr><th>' + bi('scale') + '</th><th class="num">' + bi('score') + '</th><th class="barcol"></th></tr></thead><tbody>' +
      D.WHEEL.map(function (s) {
        var v = sc[s], I = D.SCALE[s], lv = level(v);
        return '<tr><td>' + sw(s) + biRaw(esc(I.vi), esc(I.en)) +
          (lv ? '<div class="lvls"><span class="lvl lvl-' + lv + '">' + bi('lv_' + lv) + '</span>' +
            '<span class="want">' + bi('wantL') + ' ' + biRaw(esc(QTI_ADVICE.want[s][0].toLowerCase()), esc(QTI_ADVICE.want[s][1].toLowerCase())) + '</span>' +
            (flags[s] ? '<span class="flag">' + bi('attn') + '</span>' : '') + '</div>' : '') + '</td>' +
          '<td class="num"><b>' + fmtScore(v) + '</b><span class="muted">/30</span></td>' +
          '<td class="barcol"><div class="hbar"><i style="background:' + I.color + ';width:' + (v == null ? 0 : (v / 30 * 100)) + '%"></i></div></td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ---------- Biểu đồ tròn 8 múi ---------- */
  function mix(hex, w) { // pha màu với trắng: w = tỉ lệ trắng (0–1)
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255;
    var f = function (c) { return ('0' + Math.round(c + (255 - c) * w).toString(16)).slice(-2); };
    return '#' + f(r) + f(g) + f(b);
  }
  function sw(s) { return '<i class="sw" style="background:' + D.SCALE[s].color + '"></i>'; }
  function arc(r, a0, a1) {
    function p(a) { var t = a * Math.PI / 180; return [(r * Math.sin(t)).toFixed(2), (-r * Math.cos(t)).toFixed(2)]; }
    var s = p(a0), e = p(a1);
    return 'M0 0L' + s[0] + ' ' + s[1] + 'A' + r + ' ' + r + ' 0 0 1 ' + e[0] + ' ' + e[1] + 'Z';
  }
  function wheelSVG(sc) {
    var R = 118, g = '', lab = '', l = lang(), uid = 'w' + Math.random().toString(36).slice(2, 7), defs = '';
    // vòng trắng chia mức điểm 6·12·18·24 như bánh xe màu
    [6, 12, 18, 24].forEach(function (v) { g += '<circle r="' + (R * v / 30) + '" class="w-ring"/>'; });
    var tracks = '', vals = '', seps = '';
    D.WHEEL.forEach(function (s, i) {
      var a0 = i * 45, a1 = a0 + 45, v = sc[s], I = D.SCALE[s];
      var nm = l === 'en' ? I.enS : I.viS;
      defs += '<radialGradient id="' + uid + s + '" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="' + R + '">' +
        '<stop offset="0" stop-color="' + mix(I.color, 0.78) + '"/><stop offset="0.55" stop-color="' + mix(I.color, 0.25) + '"/>' +
        '<stop offset="1" stop-color="' + I.color + '"/></radialGradient>';
      tracks += '<path d="' + arc(R, a0, a1) + '" fill="' + mix(I.color, 0.86) + '"/>';
      if (v != null) vals += '<path d="' + arc(R * v / 30, a0, a1) + '" fill="url(#' + uid + s + ')" class="w-val-s"><title>' +
        esc(I.vi + ' / ' + I.en + ': ' + fmtScore(v) + '/30') + '</title></path>';
      var t = a0 * Math.PI / 180;
      seps += '<line x1="0" y1="0" x2="' + (R * Math.sin(t)).toFixed(2) + '" y2="' + (-R * Math.cos(t)).toFixed(2) + '" class="w-sep"/>';
      var m = (a0 + 22.5) * Math.PI / 180, rr = R + 12;
      var x = rr * Math.sin(m), y = -rr * Math.cos(m);
      var anchor = x > 0 ? 'start' : 'end';
      var compact = window.innerWidth <= 520;
      var lines = [nm]; if (l === 'both' && !compact) lines.push(I.enS);
      var n = lines.length + 1, lh = compact ? 19 : 14, side = Math.abs(Math.cos(m)) < 0.5;
      var y0 = side ? y - (n - 1) * lh / 2 + 4 : (y < 0 ? y - (n - 1) * lh : y + (compact ? 15 : 11));
      lab += '<text x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" text-anchor="' + anchor + '" class="w-lab">';
      lines.forEach(function (t, j) {
        lab += '<tspan x="' + x.toFixed(1) + '" dy="' + (j ? lh : 0) + '"' + (j ? ' class="w-sub"' : '') + '>' + esc(t) + '</tspan>';
      });
      lab += '<tspan x="' + x.toFixed(1) + '" dy="' + lh + '" class="w-val">' + fmtScore(v) + '</tspan></text>';
    });
    return '<svg class="wheel" viewBox="-245 -172 490 344" role="img" aria-label="QTI wheel"><defs>' + defs + '</defs>' +
      tracks + vals + g + seps + '<circle r="' + (R * 2 / 30) + '" class="w-hub"/>' + lab + '</svg>';
  }

  /* ---------- Nhận xét ngắn ---------- */
  function conclusion(sc) {
    var ang = { Lea: 22.5, HFr: 67.5, Und: 112.5, SRe: 157.5, Unc: 202.5, Dis: 247.5, Adm: 292.5, Str: 337.5 };
    var ds = 0, co = 0, any = false, m = {};
    D.WHEEL.forEach(function (s) {
      if (sc[s] == null) return; any = true;
      m[s] = sc[s] / 6; var t = ang[s] * Math.PI / 180;
      ds += m[s] * Math.cos(t); co += m[s] * Math.sin(t);
    });
    if (!any) return null;
    var inf = ds > 1 ? 0 : ds < -1 ? 2 : 1, prox = co > 1 ? 0 : co < -1 ? 2 : 1;
    var INF = [['chủ động dẫn dắt và định hướng lớp học', 'taking an active, guiding role in class'],
      ['cân bằng giữa dẫn dắt và trao quyền cho học sinh', 'balancing leadership with student autonomy'],
      ['nhường nhiều quyền chủ động cho học sinh', 'leaving much of the initiative to students']];
    var PROX = [['gần gũi, hợp tác với học sinh', 'close to and cooperative with students'],
      ['không quá gần gũi cũng không quá xa cách với học sinh', 'neither especially close to nor distant from students'],
      ['khá giữ khoảng cách và nghiêm với học sinh', 'rather distant and stern with students']];
    var out = [];
    out.push(['Nhìn chung, bạn tự nhận thấy mình ' + INF[inf][0] + ', và ' + PROX[prox][0] + '.',
      'Overall, your self-view leans towards ' + INF[inf][1] + ', and you see yourself as ' + PROX[prox][1] + '.']);
    var ranked = D.WHEEL.filter(function (s) { return sc[s] != null; }).sort(function (a, b) { return sc[b] - sc[a]; });
    if (ranked.length >= 2) {
      var A = D.SCALE[ranked[0]], B = D.SCALE[ranked[1]];
      out.push(['Hai khía cạnh nổi bật nhất: ' + A.vi + ' (' + fmtScore(sc[ranked[0]]) + '/30) và ' + B.vi + ' (' + fmtScore(sc[ranked[1]]) + '/30).',
        'Your most prominent dimensions: ' + A.en + ' (' + fmtScore(sc[ranked[0]]) + '/30) and ' + B.en + ' (' + fmtScore(sc[ranked[1]]) + '/30).']);
    }
    var neg = ['Unc', 'Dis', 'Adm'].filter(function (s) { return sc[s] != null; });
    var high = neg.filter(function (s) { return sc[s] >= 15; });
    if (high.length) {
      out.push(['Cần lưu ý: ' + high.map(function (s) { return D.SCALE[s].vi; }).join(', ') + ' từ mức trung bình trở lên (≥ 15) — nhóm hành vi nên giảm, thường là nơi nên ưu tiên trước.',
        'Worth noting: ' + high.map(function (s) { return D.SCALE[s].en; }).join(', ') + (high.length > 1 ? ' are' : ' is') + ' at a medium level or above (≥ 15) — behaviours to reduce, usually the first priority.']);
    } else if (neg.length) {
      out.push(['Các khía cạnh ' + neg.map(function (s) { return D.SCALE[s].vi; }).join(', ') + ' ở mức thấp — đây là tín hiệu tích cực.',
        neg.map(function (s) { return D.SCALE[s].en; }).join(', ') + ' are low — a positive sign.']);
    }
    return out;
  }

  /* ===================== GỢI Ý HOẠT ĐỘNG / NEXT-STEP SUGGESTIONS ===================== */
  var ACT = {
    Lea: ['Mở đầu mỗi tiết bằng 1–2 mục tiêu rõ ràng ghi lên bảng, và kết thúc bằng 1 phút tóm tắt cùng cả lớp.',
      'Open each lesson with 1–2 clear objectives on the board and close with a one-minute recap together.'],
    HFr: ['Dành 2–3 phút đầu giờ chào học sinh bằng tên, hỏi han ngắn hoặc chơi một trò khởi động vui.',
      'Spend the first 2–3 minutes greeting students by name, with a quick check-in or a light warm-up game.'],
    Und: ['Dùng “phiếu ra về” cuối tiết: mỗi em ghi 1 điều đã hiểu và 1 điều còn băn khoăn; giải đáp ngay đầu tiết sau.',
      'Use an exit ticket: each student writes one thing they understood and one question; answer them at the start of the next lesson.'],
    SRe: ['Mỗi tuần cho học sinh một lựa chọn nhỏ: chọn chủ đề, chọn làm cặp hay nhóm, hoặc chọn thứ tự làm bài.',
      'Give students one small choice each week: the topic, pair or group work, or the order of tasks.'],
    SReHigh: ['Giữ sự tự do nhưng có khung: nêu rõ thời hạn, tiêu chí hoàn thành và vai trò trong nhóm.',
      'Keep the freedom but add structure: clear deadlines, success criteria and group roles.'],
    Unc: ['Thống nhất 3 quy tắc lớp học và chuẩn bị sẵn câu nói ngắn, bình tĩnh cho 2–3 tình huống hay gặp (ồn ào, làm việc riêng, đi muộn).',
      'Agree on three class rules and prepare short, calm phrases for 2–3 common situations (noise, off-task talk, lateness).'],
    Dis: ['Mỗi tiết khen cụ thể ít nhất 3 học sinh về việc các em làm được; thử giữ tỉ lệ 4 lời khen cho 1 lời nhắc.',
      'Give specific praise to at least three students per lesson; aim for four positive comments to every correction.'],
    Adm: ['Thay lời trách trước lớp bằng nhắc nhở riêng; dùng tín hiệu không lời (ánh mắt, đứng gần) trước khi lên tiếng.',
      'Replace public reprimands with private reminders; try non-verbal cues (eye contact, moving closer) before speaking.'],
    Str: ['Giải thích lý do của từng quy định và cho học sinh xem tiêu chí chấm (rubric) trước khi làm bài.',
      'Explain the reason behind each rule and share the marking rubric before students start a task.'],
    keep: ['Phát huy điểm mạnh “{vi}”: ghi lại một hoạt động bạn hay dùng và chia sẻ với đồng nghiệp trong nhóm.',
      'Build on your strength in “{en}”: write down one activity you often use and share it with colleagues.'],
    ask: ['Hỏi ý kiến học sinh: cho lớp làm phiên bản QTI dành cho học sinh (hoặc 3 câu hỏi nhanh ẩn danh) rồi so sánh với kết quả này.',
      'Ask your students: run the student version of the QTI (or three quick anonymous questions) and compare with this result.'],
    peer: ['Nhờ một đồng nghiệp dự giờ 15 phút, chỉ quan sát đúng khía cạnh bạn muốn cải thiện, rồi trao đổi 5 phút sau giờ.',
      'Ask a colleague to observe 15 minutes of a lesson, focusing only on the area you want to improve, then debrief for 5 minutes.'],
    goal: ['Chọn 1 mục tiêu nhỏ cho 2 tuần tới, ghi nhật ký 3 dòng sau mỗi tiết, rồi làm lại bảng hỏi này để xem thay đổi.',
      'Pick one small goal for the next two weeks, keep a three-line journal after each lesson, then retake this questionnaire.']
  };
  /* ---------- Phân tích theo ngưỡng của tài liệu: thấp 6–14 · trung bình 15–21 · cao 22–30 ---------- */
  function level(v) { return v == null ? null : v <= 14 ? 'low' : v <= 21 ? 'mid' : 'high'; }
  function md(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
  function analyze(sc, ans) {
    ans = ans || [];
    var att = [], desc = function (a, b) { return sc[b] - sc[a]; }, asc = function (a, b) { return sc[a] - sc[b]; };
    ['Unc', 'Dis', 'Adm'].filter(function (s) { return sc[s] != null && sc[s] >= 15; }).sort(desc).forEach(function (s) { att.push({ s: s }); });
    ['Lea', 'Und', 'HFr'].filter(function (s) { return sc[s] != null && sc[s] <= 21; }).sort(asc).forEach(function (s) { att.push({ s: s }); });
    if (sc.Str != null && (sc.Str >= 22 || ans[47] >= 3)) att.push({ s: 'Str' });
    if (sc.SRe != null && (sc.SRe <= 12 || sc.SRe >= 22)) att.push({ s: 'SRe', mode: sc.SRe <= 12 ? 'low' : 'high' });
    var flags = {}; att.forEach(function (x) { flags[x.s] = 1; });
    var strengths = ['Lea', 'Und', 'HFr'].filter(function (s) { return sc[s] != null && sc[s] >= 22; }).sort(desc);
    var pid = detectProfile(sc), profile = null;
    QTI_ADVICE.profiles.forEach(function (p) { if (p.id === pid) profile = p; });
    return { att: att, priority: att.slice(0, 2), flags: flags, strengths: strengths, profile: profile };
  }
  function detectProfile(sc) {
    if (D.WHEEL.some(function (s) { return sc[s] == null; })) return null;
    var hiA = function (s) { return sc[s] >= 22; }, loA = function (s) { return sc[s] <= 21; };
    var hiB = function (s) { return sc[s] >= 15; }, loB = function (s) { return sc[s] <= 14; };
    var warmA = hiA('Lea') && hiA('Und') && hiA('HFr');
    if (sc.Str >= 22 && warmA && loB('Adm') && loB('Dis')) return 'trusted';
    if (warmA && loB('Unc') && loB('Dis') && loB('Adm')) return 'warm';
    if (sc.Str >= 22 && hiB('Adm') && (loA('HFr') || loA('Und'))) return 'control';
    if (hiB('Dis') && hiB('Adm') && loA('Und')) return 'tense';
    if (hiA('HFr') && sc.SRe >= 22 && (loA('Lea') || hiB('Unc'))) return 'drift';
    if (hiB('Unc') && loA('Lea') && sc.Str < 22 && loB('Adm')) return 'unsure';
    return null;
  }
  /* Danh sách gợi ý chi tiết của một thang ưu tiên (theo tài liệu) */
  function scaleTips(x) {
    var A = QTI_ADVICE.scales[x.s];
    if (x.s === 'SRe') return { head: x.mode === 'low' ? A.lowHead : A.highHead, tips: x.mode === 'low' ? A.low : A.high };
    return { head: A.head || null, tips: A.tips };
  }
  /* “Bắt đầu ngay”: 1 việc dễ làm cho mỗi thang ưu tiên + việc chung */
  function suggestions(sc, ans) {
    var an = analyze(sc, ans), out = [];
    an.priority.forEach(function (x) { out.push({ k: x.s, t: x.s === 'SRe' && x.mode === 'high' ? ACT.SReHigh : ACT[x.s] }); });
    if (!an.priority.length && an.strengths.length) {
      var best = an.strengths[0];
      out.push({ k: best, t: [fill(ACT.keep[0], { vi: D.SCALE[best].vi }), fill(ACT.keep[1], { en: D.SCALE[best].en })] });
    }
    out.push({ k: '', t: ACT.ask });
    if (an.priority.length) out.push({ k: '', t: ACT.peer });
    out.push({ k: '', t: ACT.goal });
    return out.slice(0, 5);
  }
  function adviceBlock(sc, an) {
    if (!D.WHEEL.some(function (s) { return sc[s] != null; })) return '';
    var AD = QTI_ADVICE, h = '<div class="advice"><h3 class="h3">' + bi('adviceT') + '</h3>';
    if (an.profile) {
      h += '<div class="profile"><span class="muted small">' + bi('profileL') + '</span><b class="pname">' + biRaw(esc(an.profile.name[0]), esc(an.profile.name[1]), true) + '</b>' +
        '<span class="muted small">' + biRaw(esc(an.profile.sign[0]), esc(an.profile.sign[1])) + '</span>' +
        '<p><b>' + bi('profileAct') + '</b> ' + biRaw(esc(an.profile.action[0]), esc(an.profile.action[1]), true) + '</p></div>';
    }
    // Bắt đầu ngay
    h += '<div class="sugg"><h4 class="h4">' + bi('suggT') + '</h4><p class="muted small">' + bi('suggD') + '</p><ul>' +
      suggestions(sc, an._ans).map(function (x) {
        var dot = x.k ? '<i class="sdot" style="background:' + D.SCALE[x.k].color + '"></i>' : '<i class="sdot gen"></i>';
        return '<li>' + dot + '<span>' + biRaw(esc(x.t[0]), esc(x.t[1]), true) + '</span></li>';
      }).join('') + '</ul></div>';
    // Thang ưu tiên
    if (an.priority.length) {
      h += '<p class="muted small prio-lead">' + bi('prioLead', { n: an.priority.length }) + '</p>';
      an.priority.forEach(function (x, i) {
        var I = D.SCALE[x.s], st = scaleTips(x), A = AD.scales[x.s], first = st.tips.slice(0, 3), rest = st.tips.slice(3);
        var li = function (t) { return '<li>' + biRaw(esc(t[0]), esc(t[1]), true) + '</li>'; };
        h += '<div class="prio" style="--c:' + I.color + '"><div class="prio-h"><span class="pnum">' + (i + 1) + '</span><div><b>' + biRaw(esc(I.vi), esc(I.en)) + '</b>' +
          '<span class="muted small"> · ' + fmtScore(sc[x.s]) + '/30 · ' + bi('lv_' + level(sc[x.s])) + ' · ' + biRaw(esc(AD.groupName[AD.group[x.s]][0]), esc(AD.groupName[AD.group[x.s]][1])) + '</span></div></div>' +
          '<p class="small"><b>' + bi('meaningL') + '</b> ' + biRaw(esc(A.meaning[0]), esc(A.meaning[1])) + '</p>' +
          (st.head ? '<p class="small"><b>' + biRaw(esc(st.head[0]), esc(st.head[1])) + '</b></p>' : '') +
          '<ul class="tips">' + first.map(li).join('') + '</ul>' +
          (rest.length ? '<details class="more"><summary>' + bi('moreTips', { n: rest.length }) + '</summary><ul class="tips">' + rest.map(li).join('') + '</ul></details>' : '') +
          (A.note ? '<p class="small note2"><b>' + bi('noteL') + '</b> ' + biRaw(esc(A.note[0]), esc(A.note[1])) + '</p>' : '') + '</div>';
      });
    } else {
      h += '<p class="ok-note">' + bi('noPrio') + '</p>';
    }
    // Phát huy điểm mạnh
    if (an.strengths.length) {
      h += '<details class="more"><summary>' + bi('strengthT') + '</summary>' + an.strengths.slice(0, 2).map(function (s) {
        return '<p class="small"><b>' + biRaw(esc(D.SCALE[s].vi), esc(D.SCALE[s].en)) + ':</b> ' + biRaw(esc(AD.scales[s].high[0]), esc(AD.scales[s].high[1])) + '</p>';
      }).join('') + '</details>';
    }
    // Lộ trình 7 bước + lưu ý
    h += '<details class="more"><summary>' + bi('roadmapT') + '</summary><ol class="road">' +
      AD.roadmap.map(function (t) { return '<li>' + biRaw(md(t[0]), md(t[1]), true) + '</li>'; }).join('') + '</ol></details>';
    h += '<details class="more"><summary>' + bi('caveatT') + '</summary><ul class="tips">' +
      AD.caveats.map(function (t) { return '<li>' + biRaw(md(t[0]), md(t[1]), true) + '</li>'; }).join('') + '</ul>' +
      '<p class="small muted">' + biRaw(esc(AD.evidence[0]), esc(AD.evidence[1]), true) + '</p></details>';
    h += '<p class="src">' + bi('sourceL') + ' ' + biRaw(esc(AD.source[0]), esc(AD.source[1])) + '</p></div>';
    return h;
  }
  function exportButtons(id) {
    return '<div class="exp" data-sub="' + esc(id) + '"><span class="muted small">' + bi('exportT') + '</span>' +
      '<button class="btn ghost sm" data-exp="png"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/></svg>' + bi('exportImg') + '</button>' +
      '<button class="btn ghost sm" data-exp="docx"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/></svg>' + bi('exportDocx') + '</button></div>';
  }
  function bindExport(root, sub) {
    $$('[data-exp]', root).forEach(function (b) {
      b.onclick = async function () {
        if (b.disabled) return;
        var old = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="mini-spin"></span>' + bi('exporting');
        try { if (b.dataset.exp === 'png') await exportPNG(sub); else await exportDOCX(sub); }
        catch (e) { toast(bi('exportFail')); if (window.console) console.error(e); }
        b.disabled = false; b.innerHTML = old;
      };
    });
  }

  /* ===================== XUẤT ẢNH & BÁO CÁO / EXPORTS ===================== */
  var EXPORT_FONT = 'QTI Canvas Text', fontsP = null;
  function ensureFonts() {
    if (fontsP) return fontsP;
    var ps = [];
    try {
      // Bản "Text" (SRFF 2) của CDA Independence – canvas không đặt được trục SRFF nên dùng file riêng
      var ff = new FontFace(EXPORT_FONT, 'url(' + (CFG.FONT_DIR || 'fonts/') + 'CDAIndependenceText.ttf)', { weight: '300 900' });
      document.fonts.add(ff); ps.push(ff.load());
    } catch (e) { }
    try { ps.push(document.fonts.load('700 40px "CDA Mê Ly Display"')); } catch (e) { }
    fontsP = Promise.all(ps.map(function (p) { return p.catch(function () { return null; }); }));
    return fontsP;
  }
  function fT(w, px) { return w + ' ' + px + 'px "' + EXPORT_FONT + '", "CDA Independence VAR", system-ui, sans-serif'; }
  function fD(px) { return '700 ' + px + 'px "CDA Mê Ly Display", "Arial Narrow", sans-serif'; }
  function wrapText(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  function pickL(pair) { var l = lang(); return l === 'en' ? pair[1] : pair[0]; }
  function headL(pair) { var l = lang(); return l === 'en' ? pair[1] : l === 'vi' ? pair[0] : pair[0] + ' · ' + pair[1]; }
  function scaleName(s, short) { var I = D.SCALE[s], l = lang(); return l === 'en' ? (short ? I.enS : I.en) : (short ? I.viS : I.vi); }
  function dateStr(ts) {
    var d = new Date(ts || Date.now());
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear() + ' ' + fmtTime(ts || Date.now());
  }
  function fileBase(sub) {
    return 'QTI_' + fold(sub.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '_' + new Date(sub.ts || Date.now()).toISOString().slice(0, 10);
  }

  function drawWheelCanvas(ctx, cx, cy, R, sc, o) {
    o = o || {};
    var fs = o.fs || 24, both = lang() === 'both';
    ctx.save(); ctx.translate(cx, cy);
    D.WHEEL.forEach(function (s, i) {
      var a0 = (i * 45 - 90) * Math.PI / 180, a1 = ((i + 1) * 45 - 90) * Math.PI / 180, I = D.SCALE[s], v = sc[s];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath(); ctx.fillStyle = mix(I.color, 0.86); ctx.fill();
      if (v != null) {
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        g.addColorStop(0, mix(I.color, 0.78)); g.addColorStop(0.55, mix(I.color, 0.25)); g.addColorStop(1, I.color);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * v / 30, a0, a1); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      }
    });
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, R / 75);
    [6, 12, 18, 24].forEach(function (v) { ctx.beginPath(); ctx.arc(0, 0, R * v / 30, 0, Math.PI * 2); ctx.stroke(); });
    ctx.lineWidth = Math.max(3, R / 50);
    for (var k = 0; k < 8; k++) { var a = (k * 45 - 90) * Math.PI / 180; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * Math.cos(a), R * Math.sin(a)); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, R * 2 / 30, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    D.WHEEL.forEach(function (s, i) {
      var m = (i * 45 + 22.5) * Math.PI / 180, rr = R + fs * 0.7;
      var x = rr * Math.sin(m), y = -rr * Math.cos(m);
      var lines = [[scaleName(s, true), fT(650, fs), '#2b211c']];
      if (both) lines.push([D.SCALE[s].enS, fT(420, fs * 0.82), '#87746a']);
      lines.push([fmtScore(sc[s]), fD(fs * 1.35), '#2b211c']);
      var lh = fs * 1.3, n = lines.length, side = Math.abs(Math.cos(m)) < 0.5;
      var y0 = side ? y - (n - 1) * lh / 2 + fs * 0.35 : (y < 0 ? y - (n - 1) * lh : y + fs * 0.9);
      ctx.textAlign = x > 0 ? 'left' : 'right'; ctx.textBaseline = 'alphabetic';
      lines.forEach(function (ln, j) { ctx.font = ln[1]; ctx.fillStyle = ln[2]; ctx.fillText(ln[0], x, y0 + j * lh); });
    });
    ctx.restore();
  }

  /* Ảnh kết quả dọc 1080px (vừa màn hình điện thoại) */
  function renderReportCanvas(sub) {
    var W = 1080, P = 72, big = document.createElement('canvas');
    big.width = W; big.height = 5200;
    var ctx = big.getContext('2d'), y = 0, sc = sub.scores;
    ctx.fillStyle = '#fbf6f0'; ctx.fillRect(0, 0, W, big.height);
    // dải tiêu đề
    var hg = ctx.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, '#8f1d2c'); hg.addColorStop(0.55, '#b3322a'); hg.addColorStop(1, '#c8501f');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, 230);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.font = fD(68); ctx.fillText(pickL(L.yourResult) + ' · QTI', P, 118);
    ctx.font = fT(500, 28); ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillText(headL(L.appTitle), P, 172);
    y = 300;
    ctx.fillStyle = '#2b211c'; ctx.font = fT(700, 42); ctx.fillText(sub.name, P, y);
    y += 46; ctx.font = fT(420, 26); ctx.fillStyle = '#87746a';
    var meta = dateStr(sub.ts) + ' · ' + sub.answered + '/48' + (sub.duration != null ? ' · ' + mmss(sub.duration * 1000) : '');
    ctx.fillText(meta, P, y);
    if (S.settings && S.settings.subtitle) { y += 36; ctx.fillText(S.settings.subtitle, P, y); }
    // bánh xe (chừa chỗ cho nhãn phía trên/dưới)
    var lab = lang() === 'both' ? 3 : 2;
    y += 232 + 40 + lab * 33 + 20;
    drawWheelCanvas(ctx, W / 2, y, 232, sc, { fs: 25 });
    y += 232 + 40 + lab * 33 + 30;
    ctx.textAlign = 'center'; ctx.font = fT(420, 22); ctx.fillStyle = '#87746a';
    wrapText(ctx, headL(L.halves), W - 2 * P).forEach(function (ln) { ctx.fillText(ln, W / 2, y); y += 30; });
    // bảng điểm
    var an = analyze(sc, sub.answers);
    y += 26; ctx.textAlign = 'left';
    D.WHEEL.forEach(function (s) {
      var I = D.SCALE[s], v = sc[s];
      ctx.fillStyle = I.color; ctx.fillRect(P, y - 22, 22, 22);
      ctx.fillStyle = '#2b211c'; ctx.font = fT(560, 27); ctx.fillText(scaleName(s), P + 38, y);
      var wv = ctx.measureText(scaleName(s)).width, tag = pickL(L['lv_' + level(v)] || ['', '']) + (an.flags[s] ? ' · ' + pickL(L.attn) : '');
      ctx.font = fT(an.flags[s] ? 650 : 420, 22); ctx.fillStyle = an.flags[s] ? '#b3322a' : '#87746a';
      ctx.fillText('  ' + tag, P + 38 + wv, y);
      ctx.textAlign = 'right'; ctx.font = fD(40); ctx.fillStyle = '#2b211c';
      var sv = fmtScore(v); ctx.fillText(sv, W - P - 54, y + 4);
      ctx.font = fT(500, 24); ctx.fillStyle = '#87746a'; ctx.fillText('/30', W - P, y + 4); ctx.textAlign = 'left';
      ctx.fillStyle = '#f3e9df'; ctx.fillRect(P + 38, y + 14, W - 2 * P - 38 - 150, 10);
      ctx.fillStyle = I.color; ctx.fillRect(P + 38, y + 14, (W - 2 * P - 38 - 150) * (v || 0) / 30, 10);
      y += 70;
    });
    // nhận xét + gợi ý
    function section(titlePair, items, bullets) {
      y += 46;
      ctx.font = fT(700, 32); ctx.fillStyle = '#b3322a'; ctx.fillText(headL(titlePair), P, y); y += 20;
      items.forEach(function (it) {
        var txt = pickL(it.t || it), indent = bullets ? 34 : 0;
        ctx.font = fT(420, 26);
        var lines = wrapText(ctx, txt, W - 2 * P - indent);
        y += 40;
        if (bullets) { ctx.beginPath(); ctx.arc(P + 9, y - 9, 8, 0, Math.PI * 2); ctx.fillStyle = it.k ? D.SCALE[it.k].color : '#e0731f'; ctx.fill(); }
        ctx.fillStyle = '#2b211c';
        lines.forEach(function (ln, j) { ctx.fillText(ln, P + indent, y + j * 38); });
        y += (lines.length - 1) * 38 + (bullets ? 8 : 0);
      });
      y += 18;
    }
    var c = conclusion(sc);
    if (c) section(L.summary, c, false);
    if (an.profile) section(L.profileL, [[an.profile.name[0] + ' — ' + an.profile.action[0], an.profile.name[1] + ' — ' + an.profile.action[1]]], false);
    section(L.suggT, suggestions(sc, sub.answers), true);
    an.priority.forEach(function (x, i) {
      var I = D.SCALE[x.s];
      section([(i + 1) + '. ' + I.vi + ' (' + fmtScore(sc[x.s]) + '/30)', (i + 1) + '. ' + I.en + ' (' + fmtScore(sc[x.s]) + '/30)'],
        scaleTips(x).tips.slice(0, 3).map(function (t) { return { k: x.s, t: t }; }), true);
    });
    y += 6; ctx.font = fT(420, 22); ctx.fillStyle = '#87746a';
    wrapText(ctx, pickL(['Lộ trình 7 bước, gợi ý đầy đủ và nguồn tham chiếu có trong báo cáo Word. Nguồn: Williams & Burden (1997).',
      'The 7-step plan, full suggestions and references are in the Word report. Source: Williams & Burden (1997).']), W - 2 * P)
      .forEach(function (ln) { y += 30; ctx.fillText(ln, P, y); });
    y += 26;
    // lưu ý
    y += 10; ctx.font = fT(420, 22);
    var dl = wrapText(ctx, pickL(L.disclaimerT) + ': ' + pickL(L.disclaimer), W - 2 * P - 30);
    var bh = dl.length * 32 + 34;
    ctx.fillStyle = '#fdf0e2'; ctx.fillRect(P, y, W - 2 * P, bh);
    ctx.fillStyle = '#e0731f'; ctx.fillRect(P, y, 6, bh);
    ctx.fillStyle = '#5a4a40'; dl.forEach(function (ln, j) { ctx.fillText(ln, P + 26, y + 40 + j * 32); });
    y += bh + 50;
    ctx.font = fT(420, 20); ctx.fillStyle = '#87746a';
    ctx.fillText('QTI · Questionnaire on Teacher Interaction (Wubbels & Levy)', P, y);
    y += 40;
    var out = document.createElement('canvas'); out.width = W; out.height = Math.ceil(y);
    out.getContext('2d').drawImage(big, 0, 0);
    return out;
  }
  function canvasBlob(cv) { return new Promise(function (res) { cv.toBlob(res, 'image/png'); }); }
  function saveBlob(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  async function shareOrSave(blob, name) {
    try {
      var file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && window.matchMedia('(pointer:coarse)').matches) {
        await navigator.share({ files: [file], title: name }); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    saveBlob(blob, name);
  }
  async function exportPNG(sub) {
    await ensureFonts();
    var cv = renderReportCanvas(sub), blob = await canvasBlob(cv), name = fileBase(sub) + '.png';
    var url = URL.createObjectURL(blob);
    modal('<div class="modal-h"><h3 class="h2">' + bi('imgReady') + '</h3><button class="btn ghost sm" data-x>' + bi('close') + '</button></div>' +
      '<p class="muted small">' + bi('holdToSave', null, true) + '</p>' +
      '<div class="img-prev"><img src="' + url + '" alt="QTI"></div>' +
      '<div class="row end gap"><button class="btn primary" id="dlimg">' + bi('download') + '</button></div>', function () { URL.revokeObjectURL(url); });
    $('#dlimg').onclick = function () { shareOrSave(blob, name); };
  }
  /* Bỏ các mục "thư mục" trong file zip (Word trên OneDrive/SharePoint có thể từ chối file có các mục này) */
  function stripZipDirs(buf) {
    var u = new Uint8Array(buf), dv = new DataView(buf), e = -1;
    for (var i = u.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return u;
    var n = dv.getUint16(e + 10, true), cdOff = dv.getUint32(e + 16, true), p = cdOff;
    var locals = [], centrals = [], outLen = 0;
    for (var k = 0; k < n; k++) {
      var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      var name = u.subarray(p + 46, p + 46 + nl), cen = u.subarray(p, p + 46 + nl + xl + cl);
      p += 46 + nl + xl + cl;
      if (name[name.length - 1] === 47) continue;            // '/' → thư mục
      var lo = dv.getUint32(cen.byteOffset + 42, true), flags = dv.getUint16(lo + 6, true);
      var csz = dv.getUint32(cen.byteOffset + 20, true);
      var len = 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true) + csz;
      if (flags & 8) len += dv.getUint32(lo + len, true) === 0x08074b50 ? 16 : 12;
      locals.push(u.subarray(lo, lo + len)); centrals.push({ c: cen, off: outLen }); outLen += len;
    }
    var cdLen = centrals.reduce(function (a, x) { return a + x.c.length; }, 0);
    var out = new Uint8Array(outLen + cdLen + 22), ov = new DataView(out.buffer), q = 0;
    locals.forEach(function (l) { out.set(l, q); q += l.length; });
    var cdStart = q;
    centrals.forEach(function (x) { out.set(x.c, q); ov.setUint32(q + 42, x.off, true); q += x.c.length; });
    out.set(u.subarray(e, e + 22), q);
    ov.setUint16(q + 8, centrals.length, true); ov.setUint16(q + 10, centrals.length, true);
    ov.setUint32(q + 12, cdLen, true); ov.setUint32(q + 16, cdStart, true); ov.setUint16(q + 20, 0, true);
    return out;
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  async function exportDOCX(sub) {
    if (!window.docx) await loadScript((CFG.VENDOR_DIR || 'vendor/') + 'docx.min.js');
    await ensureFonts();
    var X = window.docx, l = lang(), sc = sub.scores, BRAND = 'B3322A', MUTED = '87746A', FONT = 'Arial';
    // ảnh bánh xe
    var wc = document.createElement('canvas'); wc.width = 1300; wc.height = 1000;
    var wx = wc.getContext('2d'); wx.fillStyle = '#ffffff'; wx.fillRect(0, 0, 1300, 1000);
    drawWheelCanvas(wx, 650, 500, 300, sc, { fs: 30 });
    var wheelBuf = new Uint8Array(await (await canvasBlob(wc)).arrayBuffer());

    function run(t, o) { return new X.TextRun(Object.assign({ text: String(t), font: FONT }, o || {})); }
    function para(t, o, ro) { return new X.Paragraph(Object.assign({ children: [run(t, ro)] }, o || {})); }
    function biParas(pair, o, ro) {
      var out = [];
      if (l !== 'en') out.push(para(pair[0], o, ro));
      if (l !== 'vi') out.push(para(pair[1], o, Object.assign({}, ro, l === 'both' ? { color: MUTED } : {})));
      return out;
    }
    function h1(pair) { return new X.Paragraph({ heading: X.HeadingLevel.HEADING_1, children: [run(headL(pair))] }); }
    var border = { style: X.BorderStyle.SINGLE, size: 4, color: 'E3D3C3' };
    var borders = { top: border, bottom: border, left: border, right: border };
    function cell(children, w, shade) {
      return new X.TableCell({
        width: { size: w, type: X.WidthType.DXA }, borders: borders,
        shading: shade ? { fill: shade, type: X.ShadingType.CLEAR, color: 'auto' } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: Array.isArray(children) ? children : [children]
      });
    }
    function table(widths, rows) {
      return new X.Table({
        width: { size: widths.reduce(function (a, b) { return a + b; }, 0), type: X.WidthType.DXA }, columnWidths: widths,
        rows: rows.map(function (r, ri) {
          return new X.TableRow({ tableHeader: ri === 0, children: r.map(function (c, ci) { return cell(c, widths[ci], ri === 0 ? 'F7E6DD' : null); }) });
        })
      });
    }
    function cellText(t, o) { return para(t, { spacing: { before: 0, after: 0 } }, o); }
    function cellBi(pair) {
      var a = [];
      if (l !== 'en') a.push(cellText(pair[0]));
      if (l !== 'vi') a.push(cellText(pair[1], l === 'both' ? { color: MUTED, size: 18 } : {}));
      return a;
    }
    var info = [
      [L.name, sub.name], [['Ngày làm', 'Date'], dateStr(sub.ts)], [L.session, sub.session],
      [['Số câu đã trả lời', 'Items answered'], sub.answered + '/48'],
      [['Thời gian làm', 'Time taken'], sub.duration != null ? mmss(sub.duration * 1000) : '—']
    ];
    if (S.settings && S.settings.subtitle) info.push([['Lớp / Ghi chú', 'Class / Note'], S.settings.subtitle]);
    var content = [];
    content.push(new X.Paragraph({ heading: X.HeadingLevel.TITLE, children: [run(headL(['Báo cáo kết quả QTI', 'QTI result report']))] }));
    content.push(para(headL(L.appTitle), { spacing: { after: 240 } }, { color: MUTED }));
    content.push(table([2800, 6226], [[cellText(headL(['Thông tin', 'Details']), { bold: true }), cellText('')]].concat(
      info.map(function (r) { return [cellText(headL(r[0]), { bold: true }), cellText(r[1])]; }))));
    content.push(h1(['Biểu đồ 8 thang đo', 'Eight-scale chart']));
    content.push(new X.Paragraph({ alignment: X.AlignmentType.CENTER, spacing: { line: 240, lineRule: X.LineRuleType.AUTO, after: 60 }, children: [new X.ImageRun({ type: 'png', data: wheelBuf, transformation: { width: 520, height: 400 }, altText: { title: 'QTI', description: 'QTI wheel', name: 'qti-wheel' } })] }));
    content = content.concat(biParas(L.halves, { alignment: X.AlignmentType.CENTER, spacing: { after: 60 } }, { size: 18, color: MUTED }));
    content.push(h1(['Điểm theo thang đo', 'Scores by scale']));
    var an = analyze(sc, sub.answers), AD = QTI_ADVICE;
    content.push(table([3526, 1300, 2300, 1900], [[cellText(headL(L.scale), { bold: true }), cellText(headL(['Điểm (6–30)', 'Score (6–30)']), { bold: true }), cellText(headL(['Mức · Hướng mong muốn', 'Level · Desired']), { bold: true }), cellText(headL(['TB/câu (1–5)', 'Mean (1–5)']), { bold: true })]]
      .concat(D.WHEEL.map(function (s) {
        var v = sc[s];
        var lvTxt = v == null ? '–' : headL(L['lv_' + level(v)]) + ' · ' + headL(['nên ' + AD.want[s][0].toLowerCase(), 'aim ' + AD.want[s][1].toLowerCase()]);
        return [cellBi([D.SCALE[s].vi, D.SCALE[s].en]), cellText(fmtScore(v), { bold: true }),
          [cellText(lvTxt)].concat(an.flags[s] ? [cellText(headL(L.attn), { bold: true, color: BRAND })] : []), cellText(v == null ? '–' : (v / 6).toFixed(2))];
      }))));
    var c = conclusion(sc);
    if (c) { content.push(h1(L.summary)); c.forEach(function (p) { content = content.concat(biParas(p)); }); }
    function mdRuns(t, o) {
      return String(t).split(/(\*\*.+?\*\*)/).filter(Boolean).map(function (part) {
        var bold = /^\*\*.+\*\*$/.test(part);
        return run(bold ? part.slice(2, -2) : part, Object.assign({}, o || {}, bold ? { bold: true } : {}));
      });
    }
    function listBi(pair, ref, level) {
      var out = [], num = { reference: ref, level: level || 0 };
      if (l !== 'en') out.push(new X.Paragraph({ numbering: num, spacing: { after: l === 'both' ? 20 : 80 }, children: mdRuns(pair[0]) }));
      if (l === 'en') out.push(new X.Paragraph({ numbering: num, spacing: { after: 80 }, children: mdRuns(pair[1]) }));
      else if (l === 'both') out.push(new X.Paragraph({ indent: { left: 540 }, spacing: { after: 100 }, children: mdRuns(pair[1], { color: MUTED, size: 20 }) }));
      return out;
    }
    function h2(pair) { return new X.Paragraph({ heading: X.HeadingLevel.HEADING_2, children: [run(headL(pair))] }); }
    content.push(h1(L.adviceT));
    content = content.concat(biParas(['Mức điểm dùng trong phần gợi ý: thấp 6–14 · trung bình 15–21 · cao 22–30. Nhóm A (Dẫn dắt, Thấu hiểu, Thân thiện) cần chú ý khi ≤ 21; Nhóm B (Thiếu quyết đoán, Không hài lòng, Khiển trách) khi ≥ 15; Nghiêm khắc khi ≥ 22 hoặc câu 48 ≥ 3; Trao quyền khi ≤ 12 hoặc ≥ 22.',
      'Bands used here: low 6–14 · medium 15–21 · high 22–30. Group A (Leadership, Understanding, Helpful/Friendly) needs attention at ≤ 21; Group B (Uncertain, Dissatisfied, Admonishing) at ≥ 15; Strict at ≥ 22 or item 48 ≥ 3; Student Responsibility at ≤ 12 or ≥ 22.'], {}, { color: MUTED, size: 20 }));
    if (an.profile) {
      content.push(h2(L.profileL));
      content.push(para(headL(an.profile.name), {}, { bold: true }));
      content = content.concat(biParas(an.profile.sign, {}, { color: MUTED, size: 20 }));
      content = content.concat(biParas([L.profileAct[0] + ' ' + an.profile.action[0], L.profileAct[1] + ' ' + an.profile.action[1]]));
    }
    content.push(h2(L.suggT));
    content = content.concat(biParas(L.suggD, {}, { color: MUTED }));
    suggestions(sc, sub.answers).forEach(function (x) { content = content.concat(listBi(x.t, 'bul')); });
    if (an.priority.length) {
      an.priority.forEach(function (x, i) {
        var I = D.SCALE[x.s], st = scaleTips(x), A = AD.scales[x.s];
        content.push(h2([(i + 1) + '. Thang ưu tiên: ' + I.vi + ' – ' + fmtScore(sc[x.s]) + '/30 (' + L['lv_' + level(sc[x.s])][0].toLowerCase() + ')',
          (i + 1) + '. Priority scale: ' + I.en + ' – ' + fmtScore(sc[x.s]) + '/30 (' + L['lv_' + level(sc[x.s])][1].toLowerCase() + ')']));
        content = content.concat(biParas([L.meaningL[0] + ' ' + A.meaning[0], L.meaningL[1] + ' ' + A.meaning[1]]));
        if (st.head) content = content.concat(biParas(st.head, {}, { bold: true }));
        st.tips.forEach(function (t) { content = content.concat(listBi(t, 'bul')); });
        if (A.note) content = content.concat(biParas([L.noteL[0] + ' ' + A.note[0], L.noteL[1] + ' ' + A.note[1]], {}, { color: MUTED }));
      });
    } else {
      content = content.concat(biParas(L.noPrio));
    }
    if (an.strengths.length) {
      content.push(h2(L.strengthT));
      an.strengths.slice(0, 2).forEach(function (s) {
        content = content.concat(listBi([D.SCALE[s].vi + ': ' + AD.scales[s].high[0], D.SCALE[s].en + ': ' + AD.scales[s].high[1]], 'bul'));
      });
    }
    content.push(h2(L.roadmapT));
    AD.roadmap.forEach(function (t) { content = content.concat(listBi(t, 'num')); });
    content.push(h1(L.disclaimerT));
    content = content.concat(biParas(L.disclaimer));
    AD.caveats.forEach(function (t) { content = content.concat(listBi(t, 'bul')); });
    content = content.concat(biParas(AD.evidence, {}, { color: MUTED, size: 20 }));
    content.push(h1(['Nguồn tham chiếu', 'References']));
    content = content.concat(listBi(AD.source, 'bul'));
    content = content.concat(listBi(['Questionnaire on Teacher Interaction – Teacher Self Questionnaire (Dr Tony Rickards), 48 câu, 8 thang đo dựa trên mô hình của Wubbels và cộng sự.',
      'Questionnaire on Teacher Interaction – Teacher Self Questionnaire (Dr Tony Rickards), 48 items, 8 scales based on the model of Wubbels et al.'], 'bul'));
    content.push(h1(['Phụ lục: câu trả lời chi tiết', 'Appendix: answers']));
    content = content.concat(biParas(['Thang trả lời: 1 = Không bao giờ … 5 = Luôn luôn.', 'Scale: 1 = Never … 5 = Always.'], {}, { color: MUTED }));
    content.push(table([700, 6026, 1100, 1200], [[cellText('#', { bold: true }), cellText(headL(['Nội dung', 'Statement']), { bold: true }), cellText(headL(L.scale), { bold: true }), cellText(headL(['Trả lời', 'Answer']), { bold: true })]]
      .concat(D.ITEMS.map(function (it, i) {
        return [cellText(i + 1), cellBi([it[1], it[0]]), cellText(C.scaleOf(i)), cellText(sub.answers[i] || '–', { bold: true })];
      }))));
    var doc = new X.Document({
      creator: 'QTI survey', title: 'QTI – ' + sub.name,
      styles: {
        default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 100, line: 300, lineRule: X.LineRuleType.AUTO } } } },
        paragraphStyles: [
          { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 40, bold: true, color: BRAND }, paragraph: { spacing: { before: 0, after: 80 }, keepNext: true } },
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: BRAND }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: '5A4A40' }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true, outlineLevel: 1 } }
        ]
      },
      numbering: { config: [
        { reference: 'bul', levels: [{ level: 0, format: X.LevelFormat.BULLET, text: '•', alignment: X.AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
        { reference: 'num', levels: [{ level: 0, format: X.LevelFormat.DECIMAL, text: '%1.', alignment: X.AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] }] },
      sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: content }]
    });
    var raw = await (await X.Packer.toBlob(doc)).arrayBuffer();
    var blob = new Blob([stripZipDirs(raw)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await shareOrSave(blob, fileBase(sub) + '.docx');
  }

  /* ===================== QUẢN TRỊ / ADMIN ===================== */
  function goAdminLogin() {
    stopAll();
    if (S.token) return enterAdmin();
    show(S.needsOwner ? 'ownerSetup' : 'adminLogin');
  }
  function authErr(e) {
    var m = { bad_login: 'badLogin', locked: 'lockedMsg', weak_password: 'weakPw', bad_code: 'badCode',
      owner_exists: 'ownerExists', forbidden: 'forbiddenMsg', no_name: 'noName', not_found: 'noName' }[e && e.code];
    return m ? bi(m, { n: C.MIN_PW }) : errMsg(e);
  }
  function setToken(t, me) { S.token = t; S.me = me; SS.set('qti_tok', t); }
  function clearToken() { S.token = ''; S.me = null; SS.del('qti_tok'); }
  function backFromAdmin() { if (S.person) show(S.person.admin ? 'role' : 'pick'); else show('pick'); }

  /* Đăng nhập: chỉ những người có trong nhóm quản trị */
  VIEWS.adminLogin = function () {
    var pre = S.person && S.admins.some(function (n) { return C.key(n) === C.key(S.person.name); }) ? S.person.name : '';
    var opts = S.admins.map(function (n) { return '<option' + (C.key(n) === C.key(pre) ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
    view('<section class="card narrow"><h2 class="h2">' + bi('adminLogin') + '</h2>' +
      '<p class="muted small">' + bi('adminOnly', null, true) + '</p>' +
      '<label class="lbl" for="un">' + bi('adminName') + '</label>' +
      '<select id="un" class="inp">' + (pre ? '' : '<option value="">—</option>') + opts + '</select>' +
      '<label class="lbl" for="pw">' + bi('password') + '</label>' +
      '<input id="pw" type="password" class="inp" autocomplete="current-password">' +
      '<p class="err" id="pwerr" hidden></p>' +
      '<p class="muted small">' + bi('forgotPw', null, true) + '</p>' +
      '<div class="row between"><button class="btn ghost" id="bk">' + bi('back') + '</button>' +
      '<button class="btn primary" id="lg">' + bi('login') + '</button></div></section>');
    var pw = $('#pw'), un = $('#un');
    (pre ? pw : un).focus();
    async function login() {
      if (!un.value) return un.focus();
      $('#lg').disabled = true;
      try {
        var r = await api('authLogin', { name: un.value, pw: pw.value });
        pw.value = '';
        setToken(r.token, r.me);
        if (r.me.mustChange) return show('changePw');
        enterAdmin();
      } catch (e) { var el = $('#pwerr'); el.innerHTML = authErr(e); el.hidden = false; $('#lg').disabled = false; pw.select(); }
    }
    $('#lg').onclick = login;
    pw.onkeydown = function (e) { if (e.key === 'Enter') login(); };
    $('#bk').onclick = backFromAdmin;
  };

  /* Lần đầu: tạo tài khoản chủ trang bằng mã thiết lập lấy từ Google Sheet */
  VIEWS.ownerSetup = function () {
    view('<section class="card narrow"><h2 class="h2">' + bi('ownerSetupT') + '</h2>' +
      '<p class="muted">' + bi('ownerSetupD', null, true) + '</p>' +
      '<label class="lbl" for="oc">' + bi('setupCode') + '</label>' +
      '<input id="oc" class="inp" autocomplete="off" placeholder="QTI-XXXX-XXXX" style="text-transform:uppercase">' +
      '<label class="lbl" for="on">' + bi('yourName') + '</label>' +
      '<input id="on" class="inp" list="rl" autocomplete="off"><datalist id="rl">' +
      S.roster.map(function (r) { return '<option value="' + esc(r.name) + '">'; }).join('') + '</datalist>' +
      pwFields() +
      '<p class="err" id="oerr" hidden></p>' +
      '<div class="row between"><button class="btn ghost" id="bk">' + bi('back') + '</button>' +
      '<button class="btn primary" id="go">' + bi('createOwner') + '</button></div></section>');
    if (S.person) $('#on').value = S.person.name;
    $('#oc').focus();
    $('#bk').onclick = backFromAdmin;
    $('#go').onclick = async function () {
      var pw = readPw('#oerr'); if (!pw) return;
      try {
        var r = await api('authSetup', { code: $('#oc').value, name: $('#on').value, pw: pw });
        setToken(r.token, r.me); S.needsOwner = false;
        var c = await api('config'); S.roster = c.roster; S.admins = c.admins;
        toast(bi('ownerCreated')); enterAdmin();
      } catch (e) { var el = $('#oerr'); el.innerHTML = authErr(e); el.hidden = false; }
    };
  };
  function pwFields(withOld) {
    return (withOld ? '<label class="lbl" for="p0">' + bi('oldPw') + '</label><input id="p0" type="password" class="inp" autocomplete="current-password">' : '') +
      '<label class="lbl" for="p1">' + bi('newPw') + ' <span class="muted small">(' + tx('minChars', { n: C.MIN_PW }) + ')</span></label>' +
      '<input id="p1" type="password" class="inp" autocomplete="new-password">' +
      '<label class="lbl" for="p2">' + bi('newPw2') + '</label><input id="p2" type="password" class="inp" autocomplete="new-password">';
  }
  function readPw(errSel) {
    var a = $('#p1').value, b = $('#p2').value, el = $(errSel);
    var bad = a.length < C.MIN_PW ? 'weakPw' : a !== b ? 'pwMismatch' : '';
    if (bad) { el.innerHTML = bi(bad, { n: C.MIN_PW }); el.hidden = false; return null; }
    return a;
  }

  /* Đổi mật khẩu (bắt buộc ở lần đăng nhập đầu với mật khẩu tạm) */
  VIEWS.changePw = function () {
    view('<section class="card narrow"><h2 class="h2">' + bi('changePwT') + '</h2>' +
      (S.me && S.me.mustChange ? '<p class="note">' + bi('mustChangeMsg') + '</p>' : '') +
      '<p class="muted small">' + esc(S.me ? S.me.name : '') + '</p>' +
      pwFields(true) + '<p class="err" id="cerr" hidden></p>' +
      '<div class="row between"><button class="btn ghost" id="bk">' + bi(S.me && S.me.mustChange ? 'logout' : 'back') + '</button>' +
      '<button class="btn primary" id="sv">' + bi('save') + '</button></div></section>');
    $('#p0').focus();
    $('#bk').onclick = function () { if (S.me && S.me.mustChange) logout(); else enterAdmin(); };
    $('#sv').onclick = async function () {
      var pw = readPw('#cerr'); if (!pw) return;
      try { var r = await api('authChange', { old: $('#p0').value, pw: pw }); S.me = r.me; toast(bi('pwChanged')); enterAdmin(); }
      catch (e) { var el = $('#cerr'); el.innerHTML = authErr(e); el.hidden = false; }
    };
  };
  async function logout() {
    stopAll();
    try { if (S.token) await api('authLogout'); } catch (e) { }
    clearToken(); S.adminData = null;
    if (S.person) show(S.person.admin ? 'role' : 'pick'); else resetToPick();
  }
  async function enterAdmin() {
    show('loading');
    try { await loadAdmin(); show('admin'); adminPoll(); }
    catch (e) { handleAdminErr(e); }
  }
  function handleAdminErr(e) {
    if (e.code === 'unauthorized') { clearToken(); stopAll(); show(S.needsOwner ? 'ownerSetup' : 'adminLogin'); return true; }
    if (e.code === 'must_change') { stopAll(); show('changePw'); return true; }
    if (curView === 'loading') { S.lastError = e.message; show('error'); } else toast(authErr(e));
    return false;
  }
  async function loadAdmin() {
    var r = await api('adminState', { session: S.adminSession || '' });
    S.adminData = r; S.settings = r.settings; S.roster = r.roster; S.me = r.me;
    S.admins = r.users.map(function (u) { return u.name; });
    return r;
  }
  function adminPoll() {
    stopTimer('apoll'); stopTimer('atick');
    timers.apoll = setInterval(async function () {
      if (document.hidden || curView !== 'admin') return;
      try { await loadAdmin(); refreshAdmin(); } catch (e) { if (e.code) handleAdminErr(e); }
    }, 3000);
    timers.atick = setInterval(adminTick, 500);
  }

  VIEWS.admin = function () {
    var owner = S.me && S.me.role === 'owner';
    var tabs = [['overview', 'tabOverview'], ['results', 'tabResults'], ['settings', 'tabSettings'], ['roster', 'tabRoster']];
    if (owner) tabs.push(['users', 'tabUsers']);
    if (S.adminTab === 'users' && !owner) S.adminTab = 'overview';
    view('<div class="admin">' +
      '<div class="who"><span>' + bi('signedInAs') + ' <b>' + esc(S.me.name) + '</b> <em class="tag ' + (owner ? 'own' : '') + '">' + bi(owner ? 'roleOwner' : 'roleAdminS') + '</em></span>' +
      '<span class="row gap wrap"><button class="link" id="take">' + bi('takeSurvey') + '</button><button class="link" id="cpw">' + bi('changePwT') + '</button><button class="link" id="out">' + bi('logout') + '</button></span></div>' +
      '<section class="card ctl" id="ctl"></section>' +
      '<nav class="tabs" role="tablist">' + tabs.map(function (t) {
        return '<button role="tab" data-t="' + t[0] + '" class="' + (S.adminTab === t[0] ? 'on' : '') + '">' + bi(t[1]) + '</button>';
      }).join('') +
      '</nav>' +
      '<div id="tab"></div></div>');
    $$('.tabs [data-t]').forEach(function (b) {
      b.onclick = function () { S.adminTab = b.dataset.t; $$('.tabs [data-t]').forEach(function (x) { x.classList.toggle('on', x === b); }); renderTab(); };
    });
    $('#out').onclick = logout;
    $('#cpw').onclick = function () { stopAll(); show('changePw'); };
    $('#take').onclick = function () {
      stopAll();
      var mine = S.me && findPerson(S.me.name);
      if (mine) { S.person = mine; join(false); } else if (S.person) join(false); else resetToPick();
    };
    renderCtl(); renderTab();
  };
  function refreshAdmin() {
    if (curView !== 'admin') return;
    renderCtl();
    if (S.adminTab === 'overview') renderPeople();
    if (S.adminTab === 'results') renderResultsBody();
  }

  function renderCtl() {
    var s = S.adminData.settings, st = s.status, d = durBi(s.durationSec);
    var btn = function (cmd, k, cls) { return '<button class="btn ' + (cls || 'ghost') + '" data-c="' + cmd + '">' + bi(k) + '</button>'; };
    var b = '';
    if (st === 'closed') b += btn('open', s.timerMode === 'shared' ? 'c_openW' : 'c_open', 'primary');
    if (st === 'waiting') b += btn('start', 'c_start', 'primary') + btn('end', 'c_end');
    if (st === 'running') b += (s.timerMode !== 'off' ? btn('extend', 'c_extend') : '') + btn('end', 'c_end', 'danger');
    if (st === 'ended') b += btn('open', 'c_reopen');
    b += btn('newSession', 'c_new');
    var mode = s.timerMode === 'off' ? bi('noLimit') : s.timerMode === 'shared' ? biRaw(esc(L.tm_shared[0]) + ' · ' + d.vi, esc(L.tm_shared[1]) + ' · ' + d.en)
      : biRaw(esc(fill(L.perPerson[0], { m: d.vi })), esc(fill(L.perPerson[1], { m: d.en })));
    var changed = setHTML($('#ctl'),
      '<div class="ctl-l"><div class="pill st-' + st + '"><i></i>' + bi('s_' + st) + '</div>' +
      '<div class="muted small">' + bi('session') + ': <code>' + esc(s.sessionId || '—') + '</code> · ' + mode + '</div></div>' +
      '<div class="clock" id="aclock"></div>' +
      '<div class="ctl-b">' + b + '</div>');
    if (!changed) return adminTick();
    $$('#ctl [data-c]').forEach(function (x) { x.onclick = function () { control(x.dataset.c); }; });
    adminTick();
  }
  function adminTick() {
    var el = $('#aclock'); if (!el || !S.adminData) return;
    var s = S.adminData.settings;
    if (s.status === 'running' && s.timerMode === 'shared') {
      var left = s.startedAt + s.durationSec * 1000 - now();
      el.textContent = mmss(left); el.className = 'clock' + (left < 30000 ? ' warn' : '') + (left <= 0 ? ' crit' : '');
    } else if (s.status === 'running' && s.startedAt) {
      el.textContent = mmss(now() - s.startedAt); el.className = 'clock up';
    } else { el.textContent = ''; el.className = 'clock'; }
    $$('[data-left]').forEach(function (x) {
      var l = Number(x.dataset.left) - now();
      x.textContent = l > 0 ? mmss(l) : '0:00';
    });
  }
  async function control(cmd) {
    if (cmd === 'end' && !(await confirmBox(bi('confirmEnd'), 'c_end'))) return;
    if (cmd === 'newSession' && !(await confirmBox(bi('confirmNew'), 'c_new'))) return;
    try {
      await api('adminControl', { cmd: cmd });
      S.adminSession = null;
      await loadAdmin(); renderCtl(); renderTab();
    } catch (e) { handleAdminErr(e); }
  }
  function renderTab() {
    var f = { overview: tabOverview, results: tabResults, settings: tabSettings, roster: tabRoster, users: tabUsers }[S.adminTab];
    f();
  }

  /* --- Tab Tiến trình --- */
  function people() {
    var d = S.adminData, by = {}, out = [], inRoster = {};
    d.subs.forEach(function (x) { by[C.key(x.name)] = x; });
    d.roster.forEach(function (r) {
      inRoster[C.key(r.name)] = 1;
      var sub = by[C.key(r.name)], p = d.progress[r.name], seen = Number(d.seen[r.name] || 0);
      var st = sub ? 'done' : p && p.status === 'in_progress' ? 'doing' : p && p.status === 'waiting' ? 'waiting' : 'none';
      out.push({ name: r.name, admin: r.admin, st: st, sub: sub, prog: p, online: seen && now() - seen < 15000,
        answered: sub ? sub.answered : (p ? p.answered || 0 : 0) });
    });
    d.subs.forEach(function (x) {
      if (!inRoster[C.key(x.name)]) { inRoster[C.key(x.name)] = 1; out.push({ name: x.name, st: 'done', sub: by[C.key(x.name)], answered: x.answered, gone: true }); }
    });
    return out;
  }
  function tabOverview() {
    $('#tab').innerHTML = '<div class="tiles" id="tiles"></div>' +
      '<section class="card"><div class="ptools"><div class="chips" id="chips"></div>' +
      '<div class="search sm"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' +
      '<input id="ps" type="search" placeholder="' + esc(tx('searchPh')) + '" value="' + esc(S.pSearch) + '"></div></div>' +
      '<div class="plist" id="plist"></div>' +
      (DEMO_MODE ? '<button class="link" id="gen">' + bi('genDemo') + '</button>' : '') + '</section>';
    $('#ps').oninput = function () { S.pSearch = this.value; renderPeople(); };
    var g = $('#gen'); if (g) g.onclick = async function () { DEMO.sample(); await loadAdmin(); refreshAdmin(); };
    renderPeople();
  }
  function renderPeople() {
    var ps = people(), cnt = { none: 0, waiting: 0, doing: 0, done: 0 };
    ps.forEach(function (p) { cnt[p.st]++; });
    var tile = function (k, v, cls) { return '<div class="tile ' + cls + '"><b>' + v + '</b><span>' + bi(k) + '</span></div>'; };
    setHTML($('#tiles'), tile('p_done', cnt.done + '<small>/' + ps.length + '</small>', 't-done') + tile('p_doing', cnt.doing, 't-doing') +
      tile('p_waiting', cnt.waiting, 't-wait') + tile('p_none', cnt.none, 't-none'));
    var chips = [['all', 'all', ps.length], ['done', 'p_done', cnt.done], ['doing', 'p_doing', cnt.doing], ['waiting', 'p_waiting', cnt.waiting], ['none', 'p_none', cnt.none]];
    setHTML($('#chips'), chips.map(function (c) {
      return '<button class="chip' + (S.pFilter === c[0] ? ' on' : '') + '" data-f="' + c[0] + '">' + bi(c[1]) + ' <span>' + c[2] + '</span></button>';
    }).join(''));
    $$('#chips .chip').forEach(function (b) { b.onclick = function () { S.pFilter = b.dataset.f; renderPeople(); }; });
    var f = fold(S.pSearch), s = S.adminData.settings;
    var order = { doing: 0, waiting: 1, done: 2, none: 3 };
    var rows = ps.filter(function (p) { return (S.pFilter === 'all' || p.st === S.pFilter) && (!f || fold(p.name).indexOf(f) >= 0); })
      .sort(function (a, b) { return order[a.st] - order[b.st] || a.name.localeCompare(b.name, 'vi'); });
    var html = rows.map(function (p) {
      var right = '';
      if (p.st === 'done') right = (p.sub.duration != null ? mmss(p.sub.duration * 1000) : fmtTime(p.sub.ts)) + (p.sub.reason !== 'manual' ? ' · ' + tx('auto') : '');
      else if (p.st === 'doing') {
        var dl = C.deadlineFor(s, p.prog);
        right = dl ? '<span data-left="' + dl + '"></span>' : '';
      }
      return '<button class="prow st-' + p.st + '" data-n="' + esc(p.name) + '"' + (p.st === 'none' ? ' disabled' : '') + '>' +
        '<span class="dot' + (p.online ? ' on' : '') + '" title="' + esc(p.online ? tx('online') : '') + '"></span>' +
        '<span class="pn">' + esc(p.name) + (p.admin ? ' <em class="tag">admin</em>' : '') + (p.gone ? ' <em class="muted small">' + bi('notInRoster') + '</em>' : '') + '</span>' +
        '<span class="chipst">' + bi('p_' + p.st) + '</span>' +
        '<span class="pbar"><i style="width:' + (p.answered / N * 100) + '%"></i></span>' +
        '<span class="pcount">' + p.answered + '/' + N + '</span>' +
        '<span class="pright">' + right + '</span></button>';
    }).join('') || '<p class="muted pad-s">' + bi('noMatch') + '</p>';
    if (!setHTML($('#plist'), html)) return;
    adminTick();
    $$('#plist .prow').forEach(function (b) { b.onclick = function () { openDetail(b.dataset.n); }; });
  }

  function openDetail(name) {
    var p = people().filter(function (x) { return x.name === name; })[0]; if (!p) return;
    var ans = p.sub ? p.sub.answers : C.cleanAnswers((p.prog && p.prog.answers) || []);
    var sc = p.sub ? p.sub.scores : C.scores(ans);
    var groups = D.WHEEL.map(function (s) {
      var I = D.SCALE[s], items = '';
      for (var i = 0; i < N; i++) if (C.scaleOf(i) === s) {
        items += '<li><span class="qn">' + (i + 1) + '</span><span class="qt">' + biRaw(esc(D.ITEMS[i][1]), esc(D.ITEMS[i][0])) + '</span><b class="qv">' + (ans[i] || '–') + '</b></li>';
      }
      return '<div class="grp"><div class="grp-h">' + sw(s) + biRaw(esc(I.vi), esc(I.en)) +
        ' <code>' + s + '</code><b>' + fmtScore(sc[s]) + '</b></div><ul>' + items + '</ul></div>';
    }).join('');
    modal('<div class="modal-h"><div><h3 class="h2">' + esc(p.name) + '</h3><span class="chipst st-' + p.st + '">' + bi('p_' + p.st) + '</span> ' +
      '<span class="muted small">' + C.countAnswered(ans) + '/' + N + (p.sub && p.sub.duration != null ? ' · ' + mmss(p.sub.duration * 1000) : '') + '</span></div>' +
      '<button class="btn ghost" data-x>' + bi('close') + '</button></div>' +
      (C.countAnswered(ans) ? resultBlock(sc, ans) : '') +
      (p.sub ? exportButtons('adm') : '') +
      '<h3 class="h3">' + bi('detailAnswers') + '</h3><div class="groups">' + groups + '</div>');
    if (p.sub) bindExport($('#modal'), p.sub);
  }

  /* --- Tab Kết quả --- */
  function tabResults() {
    var d = S.adminData, cur = d.settings.sessionId;
    var sess = d.sessions.slice(); if (cur && sess.indexOf(cur) < 0) sess.push(cur);
    sess.sort().reverse();
    $('#tab').innerHTML = '<section class="card"><div class="row between wrap gap">' +
      '<label class="inline">' + bi('viewing') + ' <select id="sess" class="inp sm">' + sess.map(function (x) {
        return '<option value="' + esc(x) + '"' + (x === d.session ? ' selected' : '') + '>' + esc(x) + (x === cur ? ' (' + tx('current') + ')' : '') + '</option>';
      }).join('') + '</select></label>' +
      '<div class="row gap">' + (d.sheetUrl ? '<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(d.sheetUrl) + '">' + bi('openSheet') + '</a>' : '') +
      '<button class="btn ghost" id="csv">' + bi('csv') + '</button></div></div>' +
      '<div id="resbody"></div></section>';
    $('#sess').onchange = async function () { S.adminSession = this.value === cur ? null : this.value; await loadAdmin(); renderResultsBody(); renderPeopleSafe(); };
    $('#csv').onclick = downloadCSV;
    renderResultsBody();
  }
  function renderPeopleSafe() { if (S.adminTab === 'overview') renderPeople(); }
  function renderResultsBody() {
    var el = $('#resbody'); if (!el) return;
    var subs = latestPerPerson(S.adminData.subs);
    if (!subs.length) { setHTML(el, '<p class="muted pad">' + bi('noSubs') + '</p>'); return; }
    var avg = {};
    D.WHEEL.forEach(function (s) {
      var v = subs.filter(function (x) { return x.scores[s] != null; });
      avg[s] = v.length ? Math.round(v.reduce(function (a, x) { return a + x.scores[s]; }, 0) / v.length * 10) / 10 : null;
    });
    var html = '<div class="res-grid"><div><h3 class="h3">' + bi('classAvg') + ' <span class="muted small">· ' + bi('nSub', { k: subs.length }) + '</span></h3>' +
      '<div class="wheel-wrap">' + wheelSVG(avg) + '</div>' + legend() + '</div><div>' + scoreTable(avg) + '</div></div>' +
      '<div class="tscroll"><table class="grid"><thead><tr><th>' + bi('name') + '</th>' +
      D.WHEEL.map(function (s) { return '<th class="num" title="' + esc(D.SCALE[s].vi + ' / ' + D.SCALE[s].en) + '">' + sw(s) + s + '</th>'; }).join('') +
      '<th class="num">' + bi('answered') + '</th><th class="num">' + bi('time') + '</th></tr></thead><tbody>' +
      subs.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); }).map(function (x) {
        return '<tr data-n="' + esc(x.name) + '"><td>' + esc(x.name) + '</td>' + D.WHEEL.map(function (s) { return '<td class="num">' + fmtScore(x.scores[s]) + '</td>'; }).join('') +
          '<td class="num">' + x.answered + '</td><td class="num">' + (x.duration != null ? mmss(x.duration * 1000) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    if (!setHTML(el, html)) return;
    $$('#resbody tr[data-n]').forEach(function (r) { r.onclick = function () { openDetail(r.dataset.n); }; });
  }
  function latestPerPerson(subs) {
    var m = {}; subs.forEach(function (x) { m[C.key(x.name)] = x; });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function downloadCSV() {
    var subs = S.adminData.subs;
    var head = ['Timestamp', 'Session', 'Name', 'Answered', 'Duration_s', 'SubmitType'].concat(C.SCALES).concat(D.ITEMS.map(function (_, i) { return 'Q' + (i + 1); }));
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = subs.map(function (x) {
      return [new Date(x.ts).toLocaleString('vi-VN'), x.session, x.name, x.answered, x.duration, x.reason]
        .concat(C.SCALES.map(function (s) { return x.scores[s]; })).concat(x.answers).map(q).join(',');
    });
    var blob = new Blob(['﻿' + head.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'QTI_' + (S.adminData.session || 'results') + '.csv'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* --- Tab Cài đặt --- */
  function tabSettings() {
    var s = S.adminData.settings;
    var radio = function (name, val, k, kd, cur) {
      return '<label class="radio"><input type="radio" name="' + name + '" value="' + val + '"' + (cur === val ? ' checked' : '') + '>' +
        '<span><b>' + bi(k) + '</b>' + (kd ? '<small>' + bi(kd, null, true) + '</small>' : '') + '</span></label>';
    };
    $('#tab').innerHTML = '<section class="card form">' +
      '<fieldset><legend>' + bi('timerMode') + '</legend>' +
      radio('tm', 'shared', 'tm_shared', 'tm_sharedD', s.timerMode) + radio('tm', 'individual', 'tm_ind', 'tm_indD', s.timerMode) + radio('tm', 'off', 'tm_off', 'tm_offD', s.timerMode) +
      '<p class="muted small">' + bi('changedTimer') + '</p></fieldset>' +
      '<div class="frow"><label class="lbl" for="dur">' + bi('duration') + '</label><input id="dur" class="inp sm" type="number" min="0.5" max="120" step="0.5" value="' + (s.durationSec / 60) + '"></div>' +
      '<fieldset><legend>' + bi('timeout') + '</legend>' + radio('to', 'submit', 'to_submit', null, s.timeoutAction) + radio('to', 'lock', 'to_lock', null, s.timeoutAction) + '</fieldset>' +
      '<label class="check"><input type="checkbox" id="rtk"' + (s.allowRetake ? ' checked' : '') + '> ' + bi('retakeOpt') + '</label>' +
      '<div class="frow"><label class="lbl" for="dl">' + bi('defLang') + '</label><select id="dl" class="inp sm">' +
      [['both', 'langBoth'], ['vi', 'langVI'], ['en', 'langEN']].map(function (o) { return '<option value="' + o[0] + '"' + (s.lang === o[0] ? ' selected' : '') + '>' + esc(tx(o[1])) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="frow"><label class="lbl" for="sub">' + bi('subtitle') + '</label><input id="sub" class="inp" maxlength="200" value="' + esc(s.subtitle) + '"></div>' +
      '<div class="row end"><button class="btn primary" id="sv">' + bi('save') + '</button></div></section>';
    $('#sv').onclick = async function () {
      var patch = {
        timerMode: ($('input[name=tm]:checked') || {}).value, timeoutAction: ($('input[name=to]:checked') || {}).value,
        durationSec: Math.round(Number($('#dur').value) * 60), allowRetake: $('#rtk').checked, lang: $('#dl').value, subtitle: $('#sub').value
      };
      try { await api('adminSettings', { patch: patch }); await loadAdmin(); renderCtl(); setSubtitle(); toast(bi('saved')); }
      catch (e) { handleAdminErr(e); }
    };
  }

  /* --- Tab Danh sách lớp --- */
  function tabRoster() {
    var r = S.adminData.roster;
    $('#tab').innerHTML = '<section class="card form"><p class="muted">' + bi('rosterHelp', null, true) + '</p>' +
      '<textarea id="ros" class="inp ta" spellcheck="false">' + esc(r.map(function (x) { return x.name; }).join('\n')) + '</textarea>' +
      '<div class="row between"><span class="muted small" id="rc"></span><button class="btn primary" id="rs">' + bi('save') + '</button></div></section>';
    var ta = $('#ros');
    function parse() {
      return ta.value.split(/\r?\n/).map(function (l) { var n = l.split(/\t|\|/)[0].trim(); return n ? { name: n } : null; }).filter(Boolean);
    }
    function count() { $('#rc').innerHTML = bi('rosterCount', { k: parse().length }); }
    ta.oninput = count; count();
    $('#rs').onclick = async function () {
      try { await api('adminRoster', { roster: parse() }); await loadAdmin(); toast(bi('saved')); tabRoster(); }
      catch (e) { handleAdminErr(e); }
    };
  }

  /* --- Tab Quản trị viên (chỉ chủ trang) --- */
  function tempPw() {
    var abc = 'abcdefghjkmnpqrstuvwxyz23456789', b = new Uint8Array(8), o = '';
    try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 8; i++) b[i] = Math.random() * 256 | 0; }
    for (var j = 0; j < 8; j++) o += abc[b[j] % abc.length];
    return o;
  }
  function tabUsers() {
    var users = S.adminData.users;
    var inRoster = {}; S.roster.forEach(function (r) { inRoster[C.key(r.name)] = 1; });
    $('#tab').innerHTML = '<section class="card"><p class="muted">' + bi('usersHelp', null, true) + '</p>' +
      '<div class="ulist">' + users.map(function (u) {
        var own = u.role === 'owner';
        return '<div class="urow"><span class="av">' + esc(initials(u.name)) + '</span>' +
          '<span class="un"><b>' + esc(u.name) + '</b> <em class="tag ' + (own ? 'own' : '') + '">' + bi(own ? 'roleOwner' : 'roleAdminS') + '</em>' +
          (u.mustChange ? ' <span class="muted small">· ' + bi('pendingPw') + '</span>' : '') +
          (!inRoster[C.key(u.name)] ? ' <span class="muted small">· ' + bi('notInRosterAdm') + '</span>' : '') + '</span>' +
          (own ? '' : '<span class="row gap"><button class="btn ghost sm" data-reset="' + esc(u.name) + '">' + bi('resetPw') + '</button>' +
            '<button class="btn ghost sm danger-t" data-del="' + esc(u.name) + '">' + bi('remove') + '</button></span>') + '</div>';
      }).join('') + '</div>' +
      '<h3 class="h3">' + bi('addAdmin') + '</h3>' +
      '<div class="addrow"><div><label class="lbl" for="an">' + bi('name') + '</label><input id="an" class="inp" list="arl" autocomplete="off" placeholder="' + esc(tx('pickFromList')) + '">' +
      '<datalist id="arl">' + S.roster.filter(function (r) { return !r.admin; }).map(function (r) { return '<option value="' + esc(r.name) + '">'; }).join('') + '</datalist></div>' +
      '<div><label class="lbl" for="ap">' + bi('tempPw') + '</label><input id="ap" class="inp" autocomplete="off" value="' + tempPw() + '"></div>' +
      '<button class="btn primary" id="add">' + bi('add') + '</button></div>' +
      '<p class="err" id="uerr" hidden></p></section>';
    $('#add').onclick = function () { setUser($('#an').value, $('#ap').value, true); };
    $$('[data-reset]').forEach(function (b) {
      b.onclick = async function () {
        var pw = tempPw();
        if (await confirmBox(bi('confirmReset', { n: b.dataset.reset }), 'resetPw')) setUser(b.dataset.reset, pw, false);
      };
    });
    $$('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!(await confirmBox(bi('confirmRemove', { n: b.dataset.del }), 'remove'))) return;
        try { await api('adminUserDel', { name: b.dataset.del }); await loadAdmin(); tabUsers(); toast(bi('saved')); }
        catch (e) { handleAdminErr(e); }
      };
    });
  }
  async function setUser(name, pw, isNew) {
    var el = $('#uerr');
    name = String(name || '').trim();
    if (!name) { el.innerHTML = bi('noName'); el.hidden = false; return; }
    if (isNew && S.admins.some(function (n) { return C.key(n) === C.key(name); })) { el.innerHTML = bi('alreadyAdmin'); el.hidden = false; return; }
    try {
      await api('adminUserSet', { name: name, pw: pw });
      await loadAdmin(); tabUsers();
      modal('<h3 class="h2">' + bi(isNew ? 'adminAdded' : 'pwReset') + '</h3>' +
        '<p>' + bi('shareTemp', { n: name }, true) + '</p>' +
        '<div class="temp"><code id="tp">' + esc(pw) + '</code><button class="btn ghost sm" id="cp">' + bi('copy') + '</button></div>' +
        '<p class="muted small">' + bi('tempNote', null, true) + '</p>' +
        '<div class="row end"><button class="btn primary" data-x>' + bi('close') + '</button></div>');
      $('#cp').onclick = function () {
        try { navigator.clipboard.writeText(pw).then(function () { toast(bi('copied')); }, function () { }); } catch (e) { }
      };
    } catch (e) { if (!handleAdminErr(e)) { el.innerHTML = authErr(e); el.hidden = false; } }
  }

  /* ---------- khởi động ---------- */
  document.addEventListener('keydown', function (e) {
    if (curView !== 'quiz' || $('#modal').hidden === false) return;
    if (/^[1-5]$/.test(e.key)) { answer(Number(e.key)); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') go(S.idx - 1);
    else if (e.key === 'ArrowRight') go(S.idx + 1);
  });
  window.addEventListener('hashchange', function () {
    if (location.hash === '#admin' && S.settings && curView !== 'admin' && curView !== 'adminLogin' && curView !== 'ownerSetup') goAdminLogin();
  });
  window.addEventListener('beforeunload', function () { if (curView === 'quiz') sendProgress(); });

  async function boot() {
    show('loading');
    try {
      var r = await api('config');
      S.settings = r.settings; S.roster = r.roster; S.admins = r.admins || []; S.needsOwner = !!r.needsOwner; applyLang();
    } catch (e) { S.lastError = e.message; return show('error'); }
    if (location.hash === '#admin') return goAdminLogin();
    var me = LS.get('qti_me', null);
    if (me && me.name && findPerson(me.name) && me.session === S.settings.sessionId) { S.person = findPerson(me.name); return join(false); }
    show('pick');
  }
  shell();
  boot();
})();
