# Security Policy

Only the latest tagged beta or stable release receives security fixes.

Do not open a public issue for a vulnerability or suspected secret leak. Use GitHub private vulnerability reporting on the repository Security tab. If unavailable, use the repository owner's non-public profile contact.

Include affected version, platform, minimal reproduction and impact. Never include real credentials, private media or personal data.

The Studio is loopback-only. Publicly exposing its port, adding cloud services or running unreviewed third-party skills is unsupported. Setup scripts do not require administrator rights and must not disable antivirus, browser sandboxing or OS protections.

Release archives have SHA-256 sidecars and an internal per-file manifest. Verify both before installation.
