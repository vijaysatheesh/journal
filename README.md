# 📓 QuickNotes — a self-updating notes site for GitHub Pages

Drop Markdown files into `notes/`, push, and your homepage automatically finds
them, reads their titles, and lists them as a searchable table of contents.
Click any note to read it as a nicely styled page (headings, code blocks,
tables, task lists, dark mode, etc.).

No build step, no static-site generator, no server — it's three plain HTML
files that use the GitHub API to see what's in your `notes/` folder.

## 1. Create the repo

1. Create a new **public** GitHub repository (it must be public for the
   automatic listing to work, since it uses GitHub's public API).
   - For a site at `https://yourusername.github.io/`, name the repo
     `yourusername.github.io`.
   - For a project site at `https://yourusername.github.io/reponame/`, name
     it anything, e.g. `notes`.
2. Push everything in this folder to that repo:
   ```bash
   git init
   git add .
   git commit -m "Initial notes site"
   git branch -M main
   git remote add origin https://github.com/yourusername/yourrepo.git
   git push -u origin main
   ```

## 2. Turn on GitHub Pages

1. On GitHub, go to your repo's **Settings → Pages**.
2. Under "Build and deployment", set **Source** to `Deploy from a branch`.
3. Set **Branch** to `main` and folder to `/ (root)`. Save.
4. Wait a minute, then visit the URL GitHub shows you.

## 3. Add your notes

Just add `.md` files to the `notes/` folder and push:

```bash
cp ~/my-note.md notes/
git add notes/my-note.md
git commit -m "Add note"
git push
```

Refresh your site — it's there. No rebuild needed.

### Giving a note a title

Either works:

```markdown
---
title: My Great Idea
date: 2026-09-17
tags: [ideas, project-x]
---

Body of the note...
```

or simply:

```markdown
# My Great Idea

Body of the note...
```

If neither is present, the filename becomes the title (e.g. `my-great-idea.md`
→ "My Great Idea").

## Notes on how it works

- `index.html` calls the GitHub Contents API to list files in `notes/`,
  then fetches each file directly (same-origin, no rate limit) to pull out
  its title/date/tags/excerpt.
- `viewer.html` fetches the single Markdown file you clicked and renders it
  with [marked.js](https://marked.js.org/) (sanitized with DOMPurify) and
  syntax-highlighted with highlight.js.
- Because it relies on the **public**, unauthenticated GitHub API
  (60 requests/hour per IP), this works great for personal use. If you ever
  hit that limit, just wait a bit and refresh.
- `.nojekyll` tells GitHub Pages not to run Jekyll, so your Markdown files
  are served as plain files instead of being (mis)processed.

## Using a custom domain?

Auto-detection reads your GitHub username/repo from the `*.github.io` URL,
which won't be visible once you set up a custom domain. Just open
`assets/config.js` and fill in:

```js
window.SITE_CONFIG = {
  owner: "yourusername",
  repo: "yourrepo",
  ...
};
```

## Customizing

- `assets/config.js` — site title, tagline, notes folder name, branch.
- `assets/style.css` — all colors/fonts/spacing (CSS variables at the top).
- Subfolders inside `notes/` aren't scanned by default — keep it flat, or
  extend `index.html`'s `loadNotes()` to recurse if you want nesting.
