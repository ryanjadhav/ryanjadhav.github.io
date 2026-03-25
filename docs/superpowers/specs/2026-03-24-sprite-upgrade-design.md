# Sprite Upgrade Design

**Date:** 2026-03-24
**Status:** Approved

## Overview

Upgrade the ASCII runner game's sprites from 3×3 to 5×5 (wider and taller), add a 4-frame run cycle, introduce a dedicated jump pose, and redesign all obstacles to be 5 chars wide. Implementation uses an in-place constant-and-sprite swap with no structural changes to the game loop.

## Sprite Definitions

### Player — Run (5 wide × 5 tall, 4 frames)

```
Frame 1       Frame 2       Frame 3       Frame 4
  o             o             o             o
 /|\           /|\           \|/           \|/
  |             |             |             |
 /|             |\           \|             |/
/               \             \            /
```

Array form:
```js
var PLAYER_RUN = [
  ['  o', ' /|\\', '  |', ' /|', '/   '],
  ['  o', ' /|\\', '  |', '  |\\', '   \\'],
  ['  o', ' \\|/', '  |', ' \\|', '  \\ '],
  ['  o', ' \\|/', '  |', '  |/', '  / '],
];
```

Frame timing: advance every 4 ticks (was 8 ticks at 2 frames — keeps the same visual cadence).

### Player — Jump (5 wide × 4 rows)

Shown whenever the player is airborne (`player.vy !== 0` or `player.y < STANDING_Y`). Arms raised, legs spread.

```
\o/
/|\
 |
/ \
```

```js
var PLAYER_JUMP_SPR = ['\\o/', '/|\\', ' |', '/ \\'];
```

### Player — Duck (5 wide × 1 row)

```
_\o/_
```

```js
var PLAYER_DUCK_SPR = ['_\\o/_'];
```

### Obstacles (5 wide)

| Name | Rows | Sprite |
|---|---|---|
| Pipe (tall) | 3 | `=====` / `\|===\|` / `\|\| \|\|` |
| Fence (short) | 2 | `_\|\|\|_` / `\|\|\|\|\|` |
| Bird | 1 | `>-==>` |

```js
var OBS_TALL  = ['=====', '|===|', '|| ||'];  // 3 rows, rows 5–9
var OBS_SHORT = ['_|||_', '|||||'];            // 2 rows, rows 8–9
var OBS_BIRD  = ['>-==>'];                     // 1 row, row 5 (head height)
```

## Constant Changes

| Constant | Old | New | Notes |
|---|---|---|---|
| `PLAYER_H_STAND` | 3 | 5 | Player sprite height in rows |
| `PLAYER_W` | — | 5 | New constant; was hardcoded as 3 |
| `OBS_W` | — | 5 | New constant; was hardcoded as 3 |
| `STANDING_Y` | 7 | 5 | Derived: `GROUND_ROW - PLAYER_H_STAND + 1` |
| `PLAYER_RUN` frames | 2 | 4 | Full stride cycle |
| Frame tick threshold | 8 | 4 | Keeps same visual animation speed |
| `ROWS` | 10 | 10 | Unchanged — jump arc peaks ~row 0, fits |

## Render Changes

- Player render loop: check `player.ducking` first (1-row duck sprite at `GROUND_ROW`), then check airborne (`player.y < STANDING_Y - 0.5`) for jump sprite, else use `PLAYER_RUN[player.frame]`.
- Obstacle render: replace hardcoded `3` with `OBS_W` when checking column bounds.
- Frame advance: `player.frameTick >= 4` (was 8), `player.frame = (player.frame + 1) % 4` (was `^= 1`).

## Collision Changes

- Player center column stays `PLAYER_COL + 2` (middle of 5-wide sprite) for leniency hitbox — no change needed.
- Obstacle horizontal check: `pCol >= ox && pCol <= ox + OBS_W - 1` (was `ox + 2`).
- Duck hitbox: unchanged — 1 row at `GROUND_ROW`, center col.
- Jump hitbox: uses `player.y` (top row) through `player.y + PLAYER_H_STAND - 1` — same as run, no special case.

## Spawn / Gap Logic

- `MIN_OBS_GAP` stays 20 — obstacles are wider but the canvas is still 60 cols, so gap remains playable.
- Bird `rowOffset` stays `STANDING_Y` (row 5) — now at the player's head height with the taller sprite, which is correct.

## Out of Scope

- Canvas size change
- New obstacle types
- Color / CSS changes to the game window
- Sound or particle effects
