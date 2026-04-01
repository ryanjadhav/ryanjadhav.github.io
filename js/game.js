(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────
  var SECRET_WORD        = 'play';
  var BUFFER_MS          = 2000;
  var LEADERBOARD_ENABLED = true;  // set false to disable Firebase entirely

  // Board geometry
  var COLS = 10;
  var ROWS = 20;
  var CELL = 26;   // px per cell
  var SIDE = 96;   // sidebar px
  var BW   = COLS * CELL;  // 260
  var BH   = ROWS * CELL;  // 520
  var CW   = BW + SIDE;    // 356
  var CH   = BH;            // 520

  // Canvas colours (always dark — it's a game)
  var C_BG    = '#0f0f0f';
  var C_GRID  = 'rgba(255,255,255,0.04)';
  var C_TEXT  = '#e4e4e7';
  var C_MUTED = '#52525b';

  // Tetrominoes: shape + fill colour
  var PIECES = [
    { s: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], c: '#00e5ff' }, // I
    { s: [[1,1],[1,1]],                              c: '#ffd700' }, // O
    { s: [[0,1,0],[1,1,1],[0,0,0]],                 c: '#b44be1' }, // T
    { s: [[0,1,1],[1,1,0],[0,0,0]],                 c: '#4caf50' }, // S
    { s: [[1,1,0],[0,1,1],[0,0,0]],                 c: '#ff4444' }, // Z
    { s: [[1,0,0],[1,1,1],[0,0,0]],                 c: '#4488ff' }, // J
    { s: [[0,0,1],[1,1,1],[0,0,0]],                 c: '#ff9800' }, // L
  ];

  // ── State ─────────────────────────────────────────────────────
  var inputBuffer  = '';
  var bufferTimer  = null;
  var gameActive   = false;
  var gameOverFlag = false;
  var rafId        = null;
  var playerName   = '???';
  var currentPanel = null; // 'name-entry' | 'score-entry' | 'leaderboard-view' | null
  var board, cur, nxt, score, linesCleared, level, lastDrop, dropInterval, animations;

  // ── DOM refs ──────────────────────────────────────────────────
  var overlay, gameWindow, gameCanvas, ctx;
  var initialsInput, playBtnEl, gameOverScoreEl, leaderboardListEl, quitSaveBtnEl;
  var PANELS = ['name-entry', 'score-entry', 'leaderboard-view'];

  // ── Touch support ─────────────────────────────────────────────
  var isTouchDevice = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  if (isTouchDevice) document.documentElement.classList.add('touch-device');
  var touchX0, touchY0;

  // ════════════════════════════════════════════════════════════
  // KEYBOARD BUFFER — secret word detection + nav feedback
  // ════════════════════════════════════════════════════════════

  function handleGlobalKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    if (gameActive || gameOverFlag) { handleGameKey(e); return; }

    if (e.key === 'Escape')    { clearBuffer(); return; }
    if (e.key === 'Backspace') {
      inputBuffer = inputBuffer.slice(0, -1);
      resetTimer(); updateNavCursor(inputBuffer); return;
    }
    if (e.key.length !== 1) return;

    var ch  = e.key.toLowerCase();
    var buf = inputBuffer + ch;

    if (buf === SECRET_WORD)          { clearBuffer(); openGame(); return; }
    if (SECRET_WORD.startsWith(buf))  { inputBuffer = buf; resetTimer(); updateNavCursor(buf); }
    else                              { inputBuffer = buf; updateNavCursor(buf); flashError(); }
  }

  function resetTimer() {
    clearTimeout(bufferTimer);
    bufferTimer = setTimeout(clearBuffer, BUFFER_MS);
  }

  function clearBuffer() {
    clearTimeout(bufferTimer);
    inputBuffer = '';
    updateNavCursor('');
  }

  function updateNavCursor(buf) {
    var el = document.getElementById('prompt-cursor');
    if (!el) return;
    el.classList.remove('error');
    if (buf.length) { el.textContent = buf + '_'; el.classList.add('typing'); }
    else            { el.textContent = '_'; el.classList.remove('typing'); }
  }

  function flashError() {
    var el = document.getElementById('prompt-cursor');
    if (!el) return;
    el.classList.add('error');
    setTimeout(clearBuffer, 350);
  }

  // ════════════════════════════════════════════════════════════
  // GAME CONTROLS
  // ════════════════════════════════════════════════════════════

  function handleGameKey(e) {
    if (e.key === 'Escape') {
      if (gameActive) quitAndSave(); else closeGame();
      return;
    }
    if (gameOverFlag) {
      if ((e.key === 'r' || e.key === 'R') && currentPanel === 'leaderboard-view') startGame();
      return;
    }
    if (!gameActive) return;
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); shift(-1);   break;
      case 'ArrowRight': case 'd': case 'D': e.preventDefault(); shift(1);    break;
      case 'ArrowDown':  case 's': case 'S': e.preventDefault(); softDrop();  break;
      case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); rotateCur(); break;
      case ' ':                              e.preventDefault(); hardDrop();  break;
    }
  }

  // ════════════════════════════════════════════════════════════
  // TOUCH CONTROLS  tap=rotate  swipe←→=move  swipe↓=hard drop
  // ════════════════════════════════════════════════════════════

  function onTouchStart(e) {
    e.preventDefault();
    touchX0 = e.touches[0].clientX;
    touchY0 = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    e.preventDefault();
    if (gameOverFlag) {
      if (currentPanel === 'leaderboard-view') startGame();
      return;
    }
    if (!gameActive) return;
    var dx  = e.changedTouches[0].clientX - touchX0;
    var dy  = e.changedTouches[0].clientY - touchY0;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 20 && ady < 20)  { rotateCur(); }
    else if (adx > ady)        { shift(dx > 0 ? 1 : -1); }
    else if (dy > 0)           { hardDrop(); }
    else                       { rotateCur(); }
  }

  // ════════════════════════════════════════════════════════════
  // PANEL HELPERS
  // ════════════════════════════════════════════════════════════

  function showPanel(id) {
    currentPanel = id;
    PANELS.forEach(function (p) {
      document.getElementById(p).classList.toggle('game-panel--hidden', p !== id);
    });
    document.getElementById('game-panel-overlay').classList.remove('game-over--hidden');
  }

  function hidePanel() {
    currentPanel = null;
    document.getElementById('game-panel-overlay').classList.add('game-over--hidden');
  }

  // ════════════════════════════════════════════════════════════
  // OVERLAY LIFECYCLE
  // ════════════════════════════════════════════════════════════

  function buildOverlay() {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div id="game-overlay" class="game-overlay game-overlay--hidden"' +
      ' role="dialog" aria-modal="true" aria-label="Tetris">' +
        '<div id="game-window" class="game-window game-window--tetris">' +
          '<div class="game-header">' +
            '<span>ryanjadhav@home:~$ ./play</span>' +
            '<div class="header-btns">' +
              '<button id="quit-save-btn" class="quit-save-btn" aria-label="Save and quit">SAVE &amp; QUIT</button>' +
              '<button id="game-close-btn" class="game-close" aria-label="Close game">ESC</button>' +
            '</div>' +
          '</div>' +
          '<div class="tetris-wrap">' +
            '<canvas id="game-canvas"></canvas>' +
          '</div>' +
          '<div id="game-panel-overlay" class="game-panel-overlay game-over--hidden">' +
            '<div id="name-entry" class="game-panel">' +
              '<p class="panel-title">TETRIS</p>' +
              '<p class="panel-label">ENTER INITIALS</p>' +
              '<input id="initials-input" class="initials-input" type="text" maxlength="3"' +
              ' placeholder="AAA" autocomplete="off" spellcheck="false" />' +
              '<button id="play-btn" class="play-btn">&#9654; PLAY</button>' +
            '</div>' +
            '<div id="score-entry" class="game-panel game-panel--hidden">' +
              '<p class="panel-title">GAME  OVER</p>' +
              '<p id="game-over-score" class="panel-score"></p>' +
              '<p class="panel-label">saving\u2026</p>' +
            '</div>' +
            '<div id="leaderboard-view" class="game-panel game-panel--hidden">' +
              '<p class="panel-title">LEADERBOARD</p>' +
              '<ol id="leaderboard-list" class="leaderboard-list"></ol>' +
              '<p class="panel-hint">[R] / tap &nbsp;restart &nbsp;&nbsp; [ESC] exit</p>' +
            '</div>' +
          '</div>' +
          '<div id="game-touch-hint" class="game-touch-hint">' +
            'tap rotate &nbsp;\xb7&nbsp; swipe \u2190\u2192 move &nbsp;\xb7&nbsp; swipe \u2193 drop' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap.firstElementChild);

    overlay          = document.getElementById('game-overlay');
    gameWindow       = document.getElementById('game-window');
    gameCanvas       = document.getElementById('game-canvas');
    ctx              = gameCanvas.getContext('2d');
    initialsInput    = document.getElementById('initials-input');
    playBtnEl        = document.getElementById('play-btn');
    gameOverScoreEl  = document.getElementById('game-over-score');
    leaderboardListEl= document.getElementById('leaderboard-list');
    quitSaveBtnEl    = document.getElementById('quit-save-btn');

    document.getElementById('game-close-btn').addEventListener('click', onCloseClick);
    quitSaveBtnEl.addEventListener('click', quitAndSave);
    playBtnEl.addEventListener('click', onPlayClick);
    initialsInput.addEventListener('keydown', onInitialsKey);
    initialsInput.addEventListener('input', function () {
      initialsInput.value = initialsInput.value.toUpperCase();
    });

    gameCanvas.width  = CW;
    gameCanvas.height = CH;
    scaleCanvas();
  }

  function scaleCanvas() {
    var available = Math.min(window.innerWidth, 600) - 52;
    var scale     = Math.min(1, available / CW);
    gameCanvas.style.width  = Math.round(CW * scale) + 'px';
    gameCanvas.style.height = Math.round(CH * scale) + 'px';
  }

  function onCloseClick() {
    if (gameActive) quitAndSave(); else closeGame();
  }

  function onPlayClick() {
    playerName = (initialsInput.value.trim().toUpperCase() || '???').slice(0, 3);
    hidePanel();
    startGame();
  }

  function onInitialsKey(e) {
    if (e.key === 'Enter')  { onPlayClick(); }
    if (e.key === 'Escape') { closeGame(); }
  }

  function openGame() {
    if (!overlay) buildOverlay();
    overlay.classList.remove('game-overlay--hidden');
    if (isTouchDevice) {
      gameWindow.addEventListener('touchstart', onTouchStart, { passive: false });
      gameWindow.addEventListener('touchend',   onTouchEnd,   { passive: false });
    }
    initialsInput.value = '';
    showPanel('name-entry');
    setTimeout(function () { initialsInput.focus(); }, 150);
  }

  function closeGame() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    gameActive = false; gameOverFlag = false;
    if (overlay)     overlay.classList.add('game-overlay--hidden');
    if (gameWindow) {
      gameWindow.removeEventListener('touchstart', onTouchStart);
      gameWindow.removeEventListener('touchend',   onTouchEnd);
    }
    clearBuffer();
  }

  // ════════════════════════════════════════════════════════════
  // GAME LIFECYCLE
  // ════════════════════════════════════════════════════════════

  function startGame() {
    board        = [];
    for (var i = 0; i < ROWS; i++) board.push(new Array(COLS).fill(0));
    score        = 0;
    linesCleared = 0;
    level        = 1;
    cur          = spawnPiece();
    nxt          = spawnPiece();
    gameActive   = true;
    gameOverFlag = false;
    dropInterval = levelInterval();
    lastDrop     = 0;
    animations   = [];
    hidePanel();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function spawnPiece() {
    var t     = PIECES[Math.floor(Math.random() * PIECES.length)];
    var shape = t.s.map(function (r) { return r.slice(); });
    return { shape: shape, color: t.c, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
  }

  function levelInterval() { return Math.max(80, 800 - (level - 1) * 70); }

  // ════════════════════════════════════════════════════════════
  // GAME LOOP
  // ════════════════════════════════════════════════════════════

  function loop(ts) {
    if (!gameActive) return;
    if (!lastDrop) lastDrop = ts;
    if (ts - lastDrop >= dropInterval) {
      lastDrop = ts;
      if (!drop()) lock();
    }
    render(ts);
    if (gameActive) rafId = requestAnimationFrame(loop);
  }

  // ════════════════════════════════════════════════════════════
  // PHYSICS & LOGIC
  // ════════════════════════════════════════════════════════════

  function fits(shape, px, py) {
    for (var r = 0; r < shape.length; r++) {
      for (var c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        var nx = px + c, ny = py + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
        if (ny >= 0 && board[ny][nx])           return false;
      }
    }
    return true;
  }

  function drop()     { if (fits(cur.shape, cur.x, cur.y + 1)) { cur.y++; return true; } return false; }
  function shift(d)   { if (fits(cur.shape, cur.x + d, cur.y)) cur.x += d; }
  function softDrop() { if (!drop()) lock(); else score += 1; }

  function hardDrop() {
    var fromY = cur.y;
    var n = 0;
    while (fits(cur.shape, cur.x, cur.y + 1)) { cur.y++; n++; }
    score += n * 2;
    if (n > 0) animations.push({ type: 'streak', shape: cur.shape.map(function (r) { return r.slice(); }), x: cur.x, fromY: fromY, toY: cur.y, color: cur.color, t0: performance.now(), dur: 160 });
    lock();
  }

  function rotateCur() {
    var rot   = rotateShape(cur.shape);
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      if (fits(rot, cur.x + kicks[i], cur.y)) { cur.shape = rot; cur.x += kicks[i]; return; }
    }
  }

  function rotateShape(s) {
    var R = s.length, C = s[0].length, out = [];
    for (var c = 0; c < C; c++) {
      var row = [];
      for (var r = R - 1; r >= 0; r--) row.push(s[r][c]);
      out.push(row);
    }
    return out;
  }

  function lock() {
    var locked = [];
    for (var r = 0; r < cur.shape.length; r++) {
      for (var c = 0; c < cur.shape[r].length; c++) {
        if (!cur.shape[r][c]) continue;
        var ny = cur.y + r, nx = cur.x + c;
        if (ny < 0) { endGame(); return; }
        board[ny][nx] = cur.color;
        locked.push({ col: nx, row: ny });
      }
    }
    animations.push({ type: 'flash', cells: locked, t0: performance.now(), dur: 220 });
    sweepLines();
    cur = nxt;
    nxt = spawnPiece();
    dropInterval = levelInterval();
    if (!fits(cur.shape, cur.x, cur.y)) endGame();
  }

  function sweepLines() {
    var cleared = 0;
    for (var r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(function (c) { return c !== 0; })) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++; r++;
      }
    }
    if (!cleared) return;
    score        += [0, 100, 300, 500, 800][Math.min(cleared, 4)] * level;
    linesCleared += cleared;
    level         = Math.floor(linesCleared / 10) + 1;
  }

  function endGame() {
    gameActive = false; gameOverFlag = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    gameOverScoreEl.textContent = 'score: ' + score + '  \xb7  level: ' + level;
    showPanel('score-entry');
    saveScore().then(showLeaderboard);
  }

  function quitAndSave() {
    if (!gameActive) return;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    gameActive = false; gameOverFlag = true;
    gameOverScoreEl.textContent = 'score: ' + score + '  \xb7  level: ' + level;
    showPanel('score-entry');
    saveScore().then(showLeaderboard);
  }

  // ════════════════════════════════════════════════════════════
  // FIREBASE LEADERBOARD
  // ════════════════════════════════════════════════════════════

  function saveScore() {
    if (!LEADERBOARD_ENABLED || typeof window.db === 'undefined') return Promise.resolve();
    return window.db.collection('tetris_scores').add({
      name:  playerName,
      score: score,
      level: level,
      date:  firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(function () {});
  }

  function showLeaderboard() {
    showPanel('leaderboard-view');
    leaderboardListEl.innerHTML = '<li class="lb-row lb-loading">loading\u2026</li>';

    if (!LEADERBOARD_ENABLED || typeof window.db === 'undefined') {
      leaderboardListEl.innerHTML = '<li class="lb-row lb-loading">leaderboard unavailable</li>';
      return;
    }

    window.db.collection('tetris_scores').orderBy('score', 'desc').limit(10).get()
      .then(function (snap) {
        var i = 0, html = '';
        snap.forEach(function (doc) {
          i++;
          var d    = doc.data();
          var date = d.date ? new Date(d.date.seconds * 1000).toLocaleDateString() : '';
          html +=
            '<li class="lb-row">' +
              '<span class="lb-rank">' + i + '</span>' +
              '<span class="lb-name">' + escHtml(d.name) + '</span>' +
              '<span class="lb-score">' + d.score + '</span>' +
              '<span class="lb-meta">lvl\u00a0' + d.level + ' \xb7 ' + date + '</span>' +
            '</li>';
        });
        leaderboardListEl.innerHTML = html || '<li class="lb-row lb-loading">no scores yet</li>';
      })
      .catch(function () {
        leaderboardListEl.innerHTML = '<li class="lb-row lb-loading">could not load scores</li>';
      });
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  function ghostY() {
    var gy = cur.y;
    while (fits(cur.shape, cur.x, gy + 1)) gy++;
    return gy;
  }

  function render(ts) {
    var progress = Math.min((ts - lastDrop) / dropInterval, 1);
    var renderY  = cur.y + progress;

    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, CW, CH);

    // Grid lines
    ctx.strokeStyle = C_GRID;
    ctx.lineWidth   = 0.5;
    for (var c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, BH); ctx.stroke();
    }
    for (var r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(BW, r * CELL); ctx.stroke();
    }

    // Locked cells
    for (var row = 0; row < ROWS; row++) {
      for (var col = 0; col < COLS; col++) {
        if (board[row][col]) drawCell(col, row, board[row][col], 1);
      }
    }

    // Ghost piece
    var gy = ghostY();
    if (gy !== cur.y) drawPiece(cur.shape, cur.x, gy, cur.color, 0.18);

    // Current piece (interpolated for smooth motion)
    drawPiece(cur.shape, cur.x, renderY, cur.color, 1);

    // Hard-drop animations
    renderAnimations();

    // Sidebar divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(BW + 0.5, 0); ctx.lineTo(BW + 0.5, CH); ctx.stroke();

    drawSidebar(BW + 10);
  }

  function drawCell(col, row, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = color;
    ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 2, 3);
    ctx.globalAlpha = 1;
  }

  function renderAnimations() {
    var now   = performance.now();
    var alive = [];
    for (var i = 0; i < animations.length; i++) {
      var a = animations[i];
      var t = (now - a.t0) / a.dur;
      if (t >= 1) continue;
      alive.push(a);
      if (a.type === 'streak') {
        ctx.globalAlpha = (1 - t) * 0.55;
        ctx.fillStyle   = a.color;
        for (var r = 0; r < a.shape.length; r++) {
          for (var c = 0; c < a.shape[r].length; c++) {
            if (!a.shape[r][c]) continue;
            var cx = (a.x + c) * CELL + Math.floor(CELL / 2) - 1;
            var y1 = (a.fromY + r) * CELL;
            var y2 = (a.toY   + r) * CELL;
            if (y2 > y1) ctx.fillRect(cx, y1, 2, y2 - y1);
          }
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.fillStyle   = '#ffffff';
        for (var j = 0; j < a.cells.length; j++) {
          ctx.fillRect(a.cells[j].col * CELL + 1, a.cells[j].row * CELL + 1, CELL - 2, CELL - 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    animations = alive;
  }

  function drawPiece(shape, px, py, color, alpha) {
    for (var r = 0; r < shape.length; r++) {
      for (var c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) drawCell(px + c, py + r, color, alpha);
      }
    }
  }

  function drawSidebar(x) {
    var PC = 18;
    ctx.textBaseline = 'top';

    function label(t, y) {
      ctx.fillStyle = C_MUTED;
      ctx.font      = '10px JetBrains Mono, monospace';
      ctx.fillText(t, x, y);
    }
    function value(t, y) {
      ctx.fillStyle = C_TEXT;
      ctx.font      = 'bold 13px JetBrains Mono, monospace';
      ctx.fillText(String(t), x, y);
    }

    label('SCORE',  16); value(score,        30);
    label('LEVEL',  62); value(level,         76);
    label('LINES', 108); value(linesCleared, 122);
    label('NEXT',  158);

    var ny = 174;
    var ns = nxt.shape;
    for (var r = 0; r < ns.length; r++) {
      for (var c = 0; c < ns[r].length; c++) {
        if (!ns[r][c]) continue;
        ctx.globalAlpha = 1;
        ctx.fillStyle   = nxt.color;
        ctx.fillRect(x + c * PC + 1, ny + r * PC + 1, PC - 2, PC - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + c * PC + 1, ny + r * PC + 1, PC - 2, 3);
      }
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('keydown', handleGlobalKey);

    if (isTouchDevice) {
      var logo = document.querySelector('.nav-logo');
      if (logo) {
        logo.style.cursor = 'pointer';
        logo.addEventListener('click', function () {
          if (!gameActive && !gameOverFlag) openGame();
        });
      }
    }
  });

}());
