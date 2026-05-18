# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-05-18

### Changed

- Package renamed from `mina-sdk` to `@o1-labs/mina-sdk` and moved to the `o1-labs` GitHub organization.
- First release published via npm OIDC trusted publishing (provenance attestation included).

### Added

- Initial scaffold of the Mina JavaScript SDK.
- `MinaClient` with retry-aware GraphQL transport.
- `Currency` value type backed by `bigint`.
- Daemon queries: `getSyncStatus`, `getDaemonStatus`, `getNetworkId`,
  `getAccount`, `getBestChain`, `getPeers`, `getPooledUserCommands`, `executeQuery`.
- Daemon mutations: `sendPayment`, `sendDelegation`, `setSnarkWorker`, `setSnarkWorkFee`.
- ESM + CJS build via `tsup`; declaration files emitted.
- Vitest unit suite covering `Currency` arithmetic and `MinaClient` transport behaviour.
- GitHub Actions workflows for CI and release-on-tag npm publish (trusted-publisher ready).
