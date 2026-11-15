# Save lifecycle repair

Continued inherited RP-LY-01 patch at ab47f92. Added renderer session replacement, stale response guards, and a global save barrier retaining unmounted tabs. No user profile was used.

Current combined working-tree unit run: 53 files, 1156 normal passes, seven expected failures (1163 total). Native macOS Electron 41.5.1: immediate quit/reopen, slow save, failure, timeout, and reload first-write tests passed. Packaging required checksum-verified manual zip extraction through a temporary Forge wrapper; standard CI packaging remains required. Other editor/tree/security patches in the worktree are being split into their own commits/PRs; combined local results do not substitute for CI on each committed artifact.

Full native suite attempts reached 54/1220 and 93/1220 before the runner received SIGTERM. All three implementation owners report no broad process termination. The source is unresolved; these partial runs are not acceptance.


Follow-up review found a rejected promise alone could not recover a closed tab's unsaved content. `queueSave` now retains the actual write closure until commit and retries it once per explicit flush. A real SQLite BEFORE UPDATE trigger forced the packaged application's write transaction to fail after input and tab closure; removing the trigger, retrying, quitting and reopening retained the original title and full Unicode body (2.1s). Renderer queue/revision regressions pass 17 tests. The new test uses Node's SQLite API only to fault the isolated test profile; production code retains better-sqlite3.

Exact-head Ubuntu CI identified a separate baseline native failure: Node 24.21.0 aborts in better-sqlite3 12.9.0 Statement destruction / RemoveEnvironmentCleanupHook. Native dependency repair remains required; failed jobs have not been counted as passes.
