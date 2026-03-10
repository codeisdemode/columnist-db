# Publishing Changes

Use this checklist when you want to publish the current local state of `columnist-db`.

## 1. Verify The Local Tree

```bash
git status --short
git branch -vv
```

Make sure you understand:

- which branch you are on
- which files are modified or untracked
- whether you are ahead of or behind the remote

## 2. Run The Verified Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run pack:check
```

These commands are the validated repo-level checks for this project.

## 3. Commit The Intended Changes

```bash
git add .
git commit -m "Describe the change"
```

If the worktree contains unrelated local changes, stage only the files you intend to publish.

## 4. Push The Current Branch

```bash
git push --set-upstream origin <branch-name>
```

Replace `<branch-name>` with the branch you are currently using.

## 5. Open A Pull Request

Open a pull request from the pushed branch into the branch you want to merge into, usually `main`.

## Notes

- This repository may contain local-only work until you push it.
- Always rely on `git status` and `git branch -vv` instead of old branch-specific notes.
- `npm run pack:check` confirms that the publishable packages build and pack with real `dist/` outputs.
