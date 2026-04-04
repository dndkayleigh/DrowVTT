# `@drowvtt/vtt-ui-shared`

This package is the planned shared home for the DrowVTT play surface.

## Purpose

`@drowvtt/vtt-ui-shared` exists so:

- OSS remains the source of truth for the VTT UI
- SaaS can consume the same VTT surface instead of maintaining a parallel copy
- play-surface behavior stays aligned across repos

## Ownership Boundary

This package should eventually own the shared VTT UI, including:

- board shell layout
- sidebar structure
- stage shell
- topbar
- token list and turn panel UI
- Tactics Director shell
- shared tactical interaction rules

Host-specific behavior should stay outside this package and be provided through adapters or feature flags.

Examples of host-specific behavior:

- auth/session handling
- persistence backends
- asset storage backends
- billing/account surfaces
- raw debug controls that only belong in OSS

## Initial Extraction Targets

The first extraction wave should focus on:

1. shell markup and CSS structure
2. shared tactical interaction modules
3. host configuration points for hiding or disabling environment-specific controls

## Migration Order

1. Extract shared shell pieces from OSS into this package.
2. Refactor OSS to consume this package first.
3. Add parity tests to detect OSS/SaaS drift in shared UI behavior.
4. Refactor SaaS to consume this package with a thin hosted wrapper.

## Current State

This package is only scaffolded today. It is not yet the active source of any shipped UI.
