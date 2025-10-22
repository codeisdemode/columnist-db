# Publishing Local Changes to GitHub

The feature work tracked on the `work` branch only exists in this local repository snapshot. The public GitHub project at `https://github.com/codeisdemode/columnist-db` still reflects its default branch because the updates have not been pushed upstream.

To publish the changes:

1. Make sure you have a fork with push access on GitHub (e.g., `git@github.com:codeisdemode/columnist-db.git`).
2. Add it as a remote if it is not already configured:
   ```bash
   git remote add origin git@github.com:codeisdemode/columnist-db.git
   ```
3. Confirm the remote is reachable by listing configured remotes:
   ```bash
   git remote -v
   ```
   If `origin` is missing, repeat step 2 with the correct SSH or HTTPS URL for your fork.
4. Push the branch that contains the new commits (use `--set-upstream` the first time so future pushes can omit the remote/branch):
   ```bash
   git push --set-upstream origin work
   ```
5. Open a pull request from `work` to your main branch on GitHub to review and merge the changes.

Until the `git push` step runs successfully, the upstream repository will not display the new commits.
