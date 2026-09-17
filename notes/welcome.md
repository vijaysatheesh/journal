---
title: Welcome to Your Notes
date: 2026-09-17
tags: [meta, howto]
---

# Welcome to Your Notes

This is a sample note. **Delete it** whenever you like — it's just here to show you how things work.

## How this works

1. Drop any `.md` file into the `notes/` folder.
2. Push it to GitHub.
3. Your homepage automatically finds it, reads its title, and lists it — no build step needed.

## Titles

You can set a title two ways:

- Add a small frontmatter block at the very top of the file, like this one has:
  ```
  ---
  title: My Great Idea
  date: 2026-09-17
  tags: [ideas]
  ---
  ```
- Or just start the file with a `# Heading` — that becomes the title automatically.
- If you do neither, the filename itself is turned into a title.

## Formatting

Everything you'd expect from Markdown renders nicely:

- **Bold**, *italics*, and `inline code`
- Bullet and numbered lists
- > Blockquotes for callouts
- Tables

| Feature | Supported |
|---|---|
| Headings | ✅ |
| Code blocks | ✅ |
| Tables | ✅ |
| Task lists | ✅ |

```js
// Code blocks get syntax highlighting
function hello() {
  console.log("Hello, notes!");
}
```

- [x] Write a sample note
- [ ] Write your own

Happy note-taking!
