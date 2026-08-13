# Security Policy

## Scope

PlanDeck is a local desktop application that reads and writes AI Tool configuration files and stores Plan metadata. Security reports are especially important for:

- credential exposure or accidental credential transmission;
- arbitrary file reads or writes outside the intended configuration and data paths;
- unsafe backup or restore behavior;
- Tauri capability, command, or sandbox escapes;
- vulnerabilities in the public build and release workflow.

## Reporting A Vulnerability

Please do not open a public issue for an undisclosed vulnerability. Use GitHub's private vulnerability reporting if it is enabled for the repository. Otherwise, contact the maintainer through the email address listed on the maintainer's GitHub profile and include:

- a short description and severity estimate;
- affected version or commit;
- reproducible steps or a minimal proof of concept;
- any logs that do not contain real credentials.

Never include API keys, access tokens, private configuration files, or private keys in a report.

## Credential Handling

PlanDeck is not a secrets manager. Users are responsible for protecting their local app data directory and source Tool configurations. Public issues, pull requests, fixtures, screenshots, and logs must use clearly synthetic credentials.

## Supported Versions

Only the latest public release and the current `main` branch receive security fixes while this project is in Beta.
