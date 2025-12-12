# Drag and Drop Bot Builder (Web)

This repository cand how do i run itontains an original Tkinter desktop app and a new static web version that runs entirely in the browser and can be hosted via GitHub Pages.

**Files of interest**
- `test.py` - original Tkinter desktop app.
- `webapp` - Flask app (optional) and static front-end development files.
- `docs` - static site ready for GitHub Pages that contains the same functionality.

## Host on GitHub Pages (recommended)
1. Push your repo to GitHub.
2. In the repository, go to **Settings > Pages**.
3. Select the branch: `main` and folder: `/docs` (or `gh-pages` branch if you prefer).
4. Save. The site will be published at `https://<your_username>.github.io/<repo_name>/` within a few minutes.

## Local usage
- Web: open `docs/index.html` in your browser.
- Desktop: run `test.py`. You may want a Python venv with Tkinter (installed by default on many distributions).

## Export behavior
- Using the web interface you can add nodes and generate `exported_bot.py` that contains minimal bot code.
- Replace `YOUR_TOKEN_HERE` with your real token, install `discord.py`, and run the exported script to run your bot.

## GitHub Actions (deploy automatically)
A GitHub Actions workflow can be added to automatically push the `docs` folder to GitHub Pages; see `.github/workflows/gh-pages.yml`.