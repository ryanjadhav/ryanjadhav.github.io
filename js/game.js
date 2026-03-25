(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────
  var SECRET_WORD    = 'play';
  var COLS           = 60;
  var ROWS           = 10;
  var GROUND_ROW     = ROWS - 1;             // 9
  var PLAYER_COL     = 5;
  var PLAYER_H_STAND = 5;
  // Standing ground: player.y when feet touch ground (top of 5-row sprite at row 5)
  var STANDING_Y     = GROUND_ROW - PLAYER_H_STAND + 1; // 5
  var JUMP_VEL       = -0.52;
  var GRAVITY        = 0.026;
  var INITIAL_SPEED  = 0.28;
  var SPEED_RAMP     = 0.000012;
  var TICK_MS        = 1000 / 60;
  var BUFFER_MS      = 2000;
  var MIN_OBS_GAP    = 22; // wider obstacles (5 chars): effective gap = MIN_OBS_GAP - OBS_W = 17
  var OBS_W          = 5;  // obstacle width in chars (was hardcoded 3)

  // ── Sprites ───────────────────────────────────────────────────
  // Player running: 4 frames, 5 rows tall, 5 chars wide
  var PLAYER_RUN = [
    ['  o', ' /|\\', '  |', ' /|', '/   '],
    ['  o', ' /|\\', '  |', '  |\\', '   \\'],
    ['  o', ' \\|/', '  |', ' \\|', '  \\ '],
    ['  o', ' \\|/', '  |', '  |/', '  / '],
  ];
  // Player airborne: arms raised, 5 rows (blank 5th row keeps hitbox = PLAYER_H_STAND)
  var PLAYER_JUMP_SPR = ['\\o/', '/|\\', ' |', '/ \\', '   '];
  // Player ducking: 1 row (renders at ground level)
  var PLAYER_DUCK_SPR = ['_\\o/_'];

  // Obstacles (5 chars wide)
  var OBS_TALL  = ['=====', '|===|', '|| ||']; // 3 rows, rows 7-9
  var OBS_SHORT = ['_|||_', '|||||'];           // 2 rows, rows 8-9
  var OBS_BIRD  = ['>-==>'];                    // 1 row, row 5 (player head height)

  // ── State ─────────────────────────────────────────────────────
  var inputBuffer  = '';
  var bufferTimer  = null;
  var gameActive   = false;
  var gameOverFlag = false;
  var rafId        = null;
  var lastTime     = 0;
  var acc          = 0;
  var player       = {};
  var obstacles    = [];
  var score        = 0;
  var speed        = INITIAL_SPEED;

  // ── DOM refs (set on first openGame) ──────────────────────────
  var overlay, canvas, gameOverScreen, gameOverScoreEl;

  // ════════════════════════════════════════════════════════════
  // KEYBOARD BUFFER — secret word detection + nav feedback
  // ════════════════════════════════════════════════════════════

  function handleGlobalKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    if (gameActive || gameOverFlag) {
      handleGameKey(e);
      return;
    }

    if (e.key === 'Escape')    { clearBuffer(); return; }
    if (e.key === 'Backspace') {
      inputBuffer = inputBuffer.slice(0, -1);
      resetTimer();
      updateNavCursor(inputBuffer);
      return;
    }
    if (e.key.length !== 1) return;

    var ch   = e.key.toLowerCase();
    var next = inputBuffer + ch;

    if (next === SECRET_WORD) {
      clearBuffer();
      openGame();
      return;
    }

    if (SECRET_WORD.startsWith(next)) {
      inputBuffer = next;
      resetTimer();
      updateNavCursor(inputBuffer);
    } else {
      // Bad prefix — show error state then clear
      inputBuffer = next;
      updateNavCursor(inputBuffer);
      flashError();
    }
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
    if (buf.length) {
      el.textContent = buf + '_';
      el.classList.add('typing');
    } else {
      el.textContent = '_';
      el.classList.remove('typing');
    }
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
    if (['ArrowUp', 'ArrowDown', ' '].indexOf(e.key) !== -1) e.preventDefault();
    if (e.key === 'Escape') { closeGame(); return; }
    if (gameOverFlag) {
      if (e.key === 'r' || e.key === 'R') restartGame();
      return;
    }
    if (!gameActive) return;
    if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w' || e.key === 'W') jump();
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      // Duck only on ground
      if (player.y >= STANDING_Y - 0.5) player.ducking = true;
    }
  }

  function handleKeyUp(e) {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') player.ducking = false;
  }

  // ════════════════════════════════════════════════════════════
  // OVERLAY LIFECYCLE
  // ════════════════════════════════════════════════════════════

  function buildOverlay() {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div id="game-overlay" class="game-overlay game-overlay--hidden"' +
      ' role="dialog" aria-modal="true" aria-label="ASCII Runner Game">' +
        '<div class="game-window">' +
          '<div class="game-header">' +
            '<span>ryanjadhav@home:~$ ./play</span>' +
            '<button class="game-close" id="game-close-btn" aria-label="Close game">ESC</button>' +
          '</div>' +
          '<pre id="game-canvas" class="game-canvas"></pre>' +
          '<div id="game-over-screen" class="game-over-screen game-over--hidden">' +
            '<p class="game-over-title">GAME  OVER</p>' +
            '<p class="game-over-score" id="game-over-score"></p>' +
            '<p class="game-over-hint">[R] restart &nbsp;&nbsp; [ESC] exit</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap.firstElementChild);

    overlay         = document.getElementById('game-overlay');
    canvas          = document.getElementById('game-canvas');
    gameOverScreen  = document.getElementById('game-over-screen');
    gameOverScoreEl = document.getElementById('game-over-score');
    document.getElementById('game-close-btn').addEventListener('click', closeGame);
  }

  function openGame() {
    if (!overlay) buildOverlay();
    overlay.classList.remove('game-overlay--hidden');
    document.addEventListener('keyup', handleKeyUp);
    startGame();
  }

  function closeGame() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    gameActive   = false;
    gameOverFlag = false;
    if (overlay) overlay.classList.add('game-overlay--hidden');
    document.removeEventListener('keyup', handleKeyUp);
    clearBuffer();
  }

  // ════════════════════════════════════════════════════════════
  // GAME LIFECYCLE
  // ════════════════════════════════════════════════════════════

  function startGame() {
    player = {
      y:         STANDING_Y,
      vy:        0,
      ducking:   false,
      frame:     0,
      frameTick: 0,
    };
    obstacles    = [];
    score        = 0;
    speed        = INITIAL_SPEED;
    gameActive   = true;
    gameOverFlag = false;
    gameOverScreen.classList.add('game-over--hidden');
    lastTime = 0;
    acc      = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function restartGame() { startGame(); }

  function endGame() {
    gameActive   = false;
    gameOverFlag = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    gameOverScoreEl.textContent = 'score: ' + fmtScore(score);
    gameOverScreen.classList.remove('game-over--hidden');
  }

  // ════════════════════════════════════════════════════════════
  // GAME LOOP (fixed-timestep accumulator)
  // ════════════════════════════════════════════════════════════

  function loop(ts) {
    if (!gameActive) return;
    if (!lastTime) lastTime = ts;
    var dt = Math.min(ts - lastTime, 100);
    lastTime = ts;
    acc += dt;
    while (acc >= TICK_MS) {
      tick();
      acc -= TICK_MS;
      if (!gameActive) break;
    }
    if (gameActive) { render(); rafId = requestAnimationFrame(loop); }
  }

  // ════════════════════════════════════════════════════════════
  // PHYSICS & LOGIC
  // ════════════════════════════════════════════════════════════

  function tick() {
    // Player physics
    player.vy += GRAVITY;
    player.y  += player.vy;
    if (player.y >= STANDING_Y) { player.y = STANDING_Y; player.vy = 0; }

    // Speed ramp
    speed += SPEED_RAMP;

    // Advance & cull obstacles
    for (var i = 0; i < obstacles.length; i++) obstacles[i].x -= speed;
    obstacles = obstacles.filter(function (o) { return o.x + OBS_W > 0; });

    // Spawn
    spawnMaybe();

    // Collision
    if (collides()) { endGame(); return; }

    // Score counter + run animation
    score++;
    if (++player.frameTick >= 8) { player.frameTick = 0; player.frame ^= 1; }
  }

  function jump() {
    if (player.vy === 0 && player.y >= STANDING_Y - 0.5) {
      player.vy = JUMP_VEL;
      player.ducking = false;
    }
  }

  function spawnMaybe() {
    if (obstacles.length > 0 &&
        obstacles[obstacles.length - 1].x > COLS - MIN_OBS_GAP) return;

    var rate = Math.min(0.012 + score * 0.000008, 0.025);
    if (Math.random() > rate) return;

    var types = score > 300
      ? [OBS_TALL, OBS_TALL, OBS_SHORT, OBS_BIRD]
      : [OBS_TALL, OBS_TALL, OBS_SHORT];
    var spr = types[Math.floor(Math.random() * types.length)];
    var isBird = spr === OBS_BIRD;

    obstacles.push({
      sprite:    spr,
      x:         COLS,
      // Bird at row 7 (player head-height): must duck or jump high to dodge
      // Ground obstacles: base flush with ground
      rowOffset: isBird ? STANDING_Y : GROUND_ROW - spr.length + 1,
    });
  }

  function collides() {
    // Player hitbox: center column only (PLAYER_COL+1) for leniency
    var pCol = PLAYER_COL + 1;
    var pTop, pBot;
    if (player.ducking) {
      // Duck sprite renders at GROUND_ROW (1 row)
      pTop = GROUND_ROW;
      pBot = GROUND_ROW;
    } else {
      pTop = Math.floor(player.y);
      pBot = pTop + PLAYER_H_STAND - 1;
    }

    for (var i = 0; i < obstacles.length; i++) {
      var o  = obstacles[i];
      var ox = Math.floor(o.x);
      var oTop = o.rowOffset;
      var oBot = o.rowOffset + o.sprite.length - 1;
      // Horizontal: player center within obstacle's 3 chars
      if (pCol >= ox && pCol <= ox + 2 && pTop <= oBot && pBot >= oTop) return true;
    }
    return false;
  }

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  function render() {
    // Build blank char grid
    var g = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(' ');
      g.push(row);
    }

    // Ground line (U+2500 box-drawing horizontal)
    for (var c = 0; c < COLS; c++) g[GROUND_ROW][c] = '\u2500';

    // Score — top-right corner
    var sc = 'SCORE: ' + fmtScore(score);
    for (var i = 0; i < sc.length; i++) {
      var col = COLS - sc.length - 1 + i;
      if (col >= 0) g[0][col] = sc[i];
    }

    // Obstacles
    for (var oi = 0; oi < obstacles.length; oi++) {
      var o  = obstacles[oi];
      var ox = Math.floor(o.x);
      for (var sr = 0; sr < o.sprite.length; sr++) {
        var row = o.rowOffset + sr;
        if (row < 0 || row >= ROWS) continue;
        var line = o.sprite[sr];
        for (var sc2 = 0; sc2 < line.length; sc2++) {
          var col2 = ox + sc2;
          if (col2 >= 0 && col2 < COLS) g[row][col2] = line[sc2];
        }
      }
    }

    // Player
    var sprite, py;
    if (player.ducking) {
      sprite = PLAYER_DUCK_SPR;
      py     = GROUND_ROW;          // single row at ground level
    } else {
      sprite = PLAYER_RUN[player.frame];
      py     = Math.floor(player.y);
    }
    for (var pr = 0; pr < sprite.length; pr++) {
      var prow = py + pr;
      if (prow < 0 || prow >= ROWS) continue;
      var pline = sprite[pr];
      for (var pc = 0; pc < pline.length; pc++) {
        var pcol = PLAYER_COL + pc;
        if (pcol < COLS) g[prow][pcol] = pline[pc];
      }
    }

    canvas.textContent = g.map(function (row) { return row.join(''); }).join('\n');
  }

  // ── Utility ───────────────────────────────────────────────────
  function fmtScore(n) { return String(n).padStart(5, '0'); }

  // ── Bootstrap ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('keydown', handleGlobalKey);
  });

}());
