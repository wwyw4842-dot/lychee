# Renderer and image boundaries

Every IPC request must come from the main frame of a registered application window at the exact configured renderer URL (fragment-only changes allowed). Navigation away from that renderer is rejected and renderer window creation is denied. The content policy permits the existing image/YouTube surfaces while scripts remain local or explicitly hashed.

The image protocol only resolves expected image names beneath the profile image directory. URL components, traversal and symlinks resolving outside that directory are rejected before file reads. Removing the scheme's CSP bypass makes the production policy effective.

Unit tests use trusted synthetic senders explicitly when exercising repositories; untrusted-sender tests assert all IPC handlers reject before repository effects. Protocol tests use real filesystem paths and external symlinks. Real packaged application checks and release CSP validation remain required alongside these unit checks.
