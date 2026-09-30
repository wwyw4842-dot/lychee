# Save lifecycle repair

Continued inherited RP-LY-01 patch at ab47f92. Added renderer session replacement, stale response guards, and a global save barrier retaining unmounted tabs. No user profile was used.

Current combined working-tree unit run: 53 files, 1156 normal passes, seven expected failures (1163 total). Native macOS Electron 41.5.1: immediate quit/reopen, slow save, failure, timeout, and reload first-write tests passed. Packaging required checksum-verified manual zip extraction through a temporary Forge wrapper; standard CI packaging remains required. Other editor/tree/security patches in the worktree are being split into their own commits/PRs; combined local results do not substitute for CI on each committed artifact.

Full native suite attempts reached 54/1220 and 93/1220 before the runner received SIGTERM. All three implementation owners report no broad process termination. The source is unresolved; these partial runs are not acceptance.
