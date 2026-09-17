/**
 * QuickNotes site configuration.
 *
 * By default this auto-detects your GitHub username/repo from the URL
 * (works for the standard *.github.io hosting GitHub gives every Pages site).
 *
 * If you are using a CUSTOM DOMAIN, auto-detection can't work (the browser
 * only sees your custom domain, not your GitHub username/repo). In that
 * case, fill in `owner` and `repo` below manually and everything will work.
 */
window.SITE_CONFIG = {
  // Leave both as null to auto-detect from the URL. Only needed for custom domains.
  owner: null,      // e.g. "yourusername"
  repo: null,       // e.g. "my-notes"

  // The branch your notes live on (GitHub Pages usually deploys from this branch)
  branch: "main",

  // The folder (relative to the repo root) where you drop your .md files
  notesFolder: "notes",

  // Site title shown on the homepage
  siteTitle: "My Notes",
  siteTagline: "A personal notebook, organized automatically.",
};

/**
 * Works out {owner, repo, basePath} from the current URL when not set above.
 * basePath is the URL prefix under which the site is served
 * ("" for a user/org page, "/reponame" for a project page).
 */
function resolveRepoInfo() {
  const cfg = window.SITE_CONFIG || {};
  const host = location.hostname; // e.g. "username.github.io"
  const pathParts = location.pathname.split("/").filter(Boolean);

  let owner = cfg.owner;
  let repo = cfg.repo;
  let basePath = "";

  const looksLikeGithubIo = /\.github\.io$/i.test(host);

  if (owner && repo) {
    // Manually configured (needed for custom domains). Guess basePath from config too.
    basePath = repo.toLowerCase() === host.toLowerCase() ? "" : (pathParts.length ? "/" + pathParts[0] : "");
  } else if (looksLikeGithubIo) {
    owner = host.split(".")[0];
    if (pathParts.length === 0) {
      // User/org page: repo is named "<owner>.github.io", served at the root
      repo = host;
      basePath = "";
    } else {
      // Project page: served at /<repo>/
      repo = pathParts[0];
      basePath = "/" + pathParts[0];
    }
  } else {
    // Custom domain and no manual config — best effort, but listing will likely
    // need manual owner/repo configuration in assets/config.js.
    owner = null;
    repo = null;
    basePath = "";
  }

  return { owner, repo, basePath, branch: cfg.branch || "main" };
}
