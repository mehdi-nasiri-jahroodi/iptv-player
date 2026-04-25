# Repository setup (Git)

This folder is a **project root** for documentation. Initialize Git on your development machine (Finder → Terminal) so you get full history, hooks, and remote publishing.

## One-time: create the repository

From a terminal:

```bash
cd /Users/mehdi/Documents/work/iptv-player
git init -b main
git add README.md AGENTS.md docs/
git commit -m "docs: initial product and architecture reference"
```

## Optional: GitHub (or other remote)

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

## If `git init` reports permission errors

On some systems, `git` may be unable to create `.git` under `Documents/` due to local security or sync tools. Run the same commands from a path where your user has full write access, or use your GUI client (GitHub Desktop, etc.) to create the repo and add these files.
