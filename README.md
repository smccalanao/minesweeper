# Minesweeper

A classic Minesweeper game built with plain HTML, CSS, and JavaScript. No build step or server required — ideal for free static hosting on [InfinityFree](https://www.infinityfree.com/).

## Play locally

Open `index.html` in your browser, or serve the folder with any static file server:

```bash
# Python 3
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to InfinityFree

1. **Create an account** at [infinityfree.com](https://www.infinityfree.com/) and add a new hosting account.
2. **Open the control panel** (cPanel or similar) for your site.
3. **Upload these files** to `htdocs` (or `public_html`):
   - `index.html`
   - `style.css`
   - `script.js`
4. Visit your domain — the game loads from `index.html` automatically.

### Tips

- Upload via **File Manager** in the control panel, or use **FTP** (credentials are in your InfinityFree dashboard).
- Keep all three files in the same folder so paths like `style.css` and `script.js` resolve correctly.
- No PHP or database is needed; the game runs entirely in the browser.

## Features

- Three difficulty levels: Beginner, Intermediate, Expert
- First click is always safe (mines placed after your first reveal)
- Left-click to reveal, right-click to flag
- Mine counter and timer
- Responsive layout for mobile and desktop

## File structure

```
Minesweeper/
├── index.html   # Page structure
├── style.css    # Styling
├── script.js    # Game logic
└── README.md    # This file
```
