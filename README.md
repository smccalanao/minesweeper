# Minesweeper

A classic Minesweeper game built with plain HTML, CSS, and JavaScript. No build step or server required.

**Play online:** https://smccalanao.github.io/minesweeper/

## Play locally

Open `index.html` in your browser, or serve the folder with any static file server:

```bash
npx serve
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Set **Source** to `main` branch, `/ (root)`.
4. Your site will be live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## Features

- 5×5 board with 5 mines
- Left-click / tap to reveal, flag with shift+right-click or hold on mobile
- Peek button (3 uses per game) to briefly show bomb locations
- Custom win/lose audio (`audio/win.mp3`, `audio/lose.mp3`)
- Fireworks on win, ROYGBIV flash on lose

## File structure

```
Minesweeper/
├── index.html
├── style.css
├── script.js
├── audio/
│   ├── win.mp3
│   └── lose.mp3
└── README.md
```
