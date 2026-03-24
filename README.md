# ryanjadhav.github.io

Personal portfolio website for [Ryan Jadhav](https://ryanjadhav.com).

---

## Overview

Static single-page site hosted on [GitHub Pages](https://pages.github.com/) at [ryanjadhav.com](https://ryanjadhav.com). No build step, no framework — just HTML, CSS, and a small JS file.

**Stack:**
- `index.html` — all page content
- `css/reset.css` — baseline style reset
- `css/main.css` — all site styles, including light/dark theme via `prefers-color-scheme`
- `js/app.js` — adds a `loaded` class to `<body>` on DOMContentLoaded (used for fade-in transitions)
- `CNAME` — maps the custom domain `ryanjadhav.com` to GitHub Pages
- `ryanjadhav.pdf` — [Resume](ryanjadhav.pdf)

---

## Local Development

No dependencies to install. Just open `index.html` in a browser:

```bash
open index.html
```

Or serve it locally to avoid any path quirks:

```bash
npx serve .
# or
python3 -m http.server
```

---

## Deployment

Pushing to `master` automatically deploys via GitHub Pages. The `CNAME` file ensures the site is served at `ryanjadhav.com`.
