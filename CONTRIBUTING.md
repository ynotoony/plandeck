<!-- input: 贡献流程 | output: 贡献指引 | position: 贡献文档
     维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。 -->

# Contributing

Thanks for helping improve PlanDeck.

## Before Opening An Issue

- Search existing issues first.
- Include the PlanDeck version, macOS version, and Mac architecture.
- Describe the Tool and configuration shape involved.
- Remove API keys, tokens, usernames, private paths, and session content from logs.

## Development Setup

Use the Node and Rust versions declared in `.node-version` and `rust-toolchain.toml`.

```bash
cd core && npm ci
cd ../app && npm ci
```

## Checks Before A Pull Request

```bash
cd core
npm test
npm run typecheck

cd ../app
npm run typecheck
npm run build

cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

Run E2E when changing the desktop workflow:

```bash
cd app/src-tauri && cargo build
cd .. && npm run e2e
```

## Fixtures And Privacy

Fixtures must be synthetic and deterministic. Do not copy real AI Tool databases, configuration files, API keys, bot tokens, or session logs into the repository. Use obviously invalid values such as `fixture-credential-alpha`.

## Pull Requests

- Keep changes focused.
- Add or update tests for behavior changes.
- Explain macOS-specific assumptions.
- Do not commit generated output, local app data, credentials, certificates, or private release material.
- Use a concise commit title that describes the change.
