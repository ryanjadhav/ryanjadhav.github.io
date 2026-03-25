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

Frame timing: advance every 4 ticks (was 8 ticks at 2 frames — keeps the same visual cadence). `player.frame = (player.frame + 1) % 4` replaces the old `^= 1` toggle entirely.

### Player — Jump (5 wide × 5 rows)

Shown whenever the player is airborne (`player.y < STANDING_Y - 0.5`). Arms raised, legs spread. 5 rows tall to match `PLAYER_H_STAND` and keep the collision box consistent with the visible sprite.

```
\o/
/|\
 |
/ \

```

```js
var PLAYER_JUMP_SPR = ['\\o/', '/|\\', ' |', '/ \\', '   '];
```

### Player — Duck (5 wide × 1 row)

```
_\o/_
```

```js
var PLAYER_DUCK_SPR = ['_\\o/_'];
```

### Obstacles (5 wide)

| Name | Rows | Canvas rows (standing player) | Sprite |
|---|---|---|---|
| Pipe (tall) | 3 | 7–9 | `=====` / `\|===\|` / `\|\| \|\|` |
| Fence (short) | 2 | 8–9 | `_\|\|\|_` / `\|\|\|\|\|` |
| Bird | 1 | 5 (head height) | `>-==>` |

```js
var OBS_TALL  = ['=====', '|===|', '|| ||'];  // 3 rows, rows 7–9
var OBS_SHORT = ['_|||_', '|||||'];            // 2 rows, rows 8–9
var OBS_BIRD  = ['>-==>'];                     // 1 row, row 5 (head height)
```

`OBS_TALL` rowOffset = `GROUND_ROW - 3 + 1 = 7`. `OBS_SHORT` rowOffset = `GROUND_ROW - 2 + 1 = 8`. Both are derived by the existing spawn formula `GROUND_ROW - spr.length + 1` — no change needed.

## Constant Changes

| Constant | Old | New | Notes |
|---|---|---|---|
| `PLAYER_H_STAND` | 3 | 5 | Player sprite height in rows |
| `OBS_W` | — | 5 | New constant; replaces hardcoded 3 in collision check |
| `STANDING_Y` | 7 | 5 | Derived: `GROUND_ROW - PLAYER_H_STAND + 1` |
| `MIN_OBS_GAP` | 20 | 22 | Compensates for wider obstacles: effective gap between trailing edge of last obstacle and new obstacle's left edge = `MIN_OBS_GAP - OBS_W = 17` chars (matching the old effective gap of 17 = 20 - 3) |
| `PLAYER_RUN` frames | 2 | 4 | Full stride cycle |
| Frame tick threshold | 8 | 4 | Keeps same visual animation speed |
| `ROWS` | 10 | 10 | Unchanged — jump arc peaks ~row 0, fits |

Note: `PLAYER_W` is not introduced as a named constant — the render loop already bounds-checks against `COLS`, and the collision uses a single center-column hitbox (`PLAYER_COL + 2`) that needs no width constant.

## Render Changes

- Player render loop: check `player.ducking` first (1-row duck sprite at `GROUND_ROW`), then check airborne (`player.y < STANDING_Y - 0.5`) for `PLAYER_JUMP_SPR`, else use `PLAYER_RUN[player.frame]`.
- Obstacle render: replace hardcoded `3` with `OBS_W` when checking column bounds.
- Frame advance: `player.frameTick >= 4` (was `>= 8`); `player.frame = (player.frame + 1) % 4` (replaces `^= 1`).

## Collision Changes

- Player center column stays `PLAYER_COL + 2` (middle of 5-wide sprite) for leniency hitbox.
- Obstacle horizontal check: `pCol >= ox && pCol <= ox + OBS_W - 1` (was `ox + 2`).
- Duck hitbox: unchanged — 1 row at `GROUND_ROW`, center col.
- Jump hitbox: `player.y` through `player.y + PLAYER_H_STAND - 1` (5 rows) — matches the 5-row jump sprite, no special case needed.

## Spawn / Gap Logic

- `MIN_OBS_GAP` raised to 22 so the effective clear distance between back-to-back obstacles stays ~17 chars (`22 - OBS_W = 17`), matching the previous effective gap of `20 - 3 = 17`.
- Bird `rowOffset` stays `STANDING_Y` (now row 5) — correct head height for the taller player.

## Out of Scope

- Canvas size change
- New obstacle types
- Color / CSS changes to the game window
- Sound or particle effects
