---
title: "Goal: Establish the JSNode software-development section through actuator relocation"
date-created: 2026-07-28T00:00:00-05:00
authors:
  - emsenn
type: goal
status: accepted
horizon: immediate
tags:
  - JSNode
  - software-development
  - relocation
  - actuation
description: "Make the JSNode software-development section authoritative, complete the ephemeral-provider to receiver actuation chain, and relocate the next JSNode services into it."
---

## Objective

Establish one discoverable JSNode software-development section whose services
are independently addressable actuators. Code movement must preserve package
identity and behavior while making the receiver boundary explicit: ephemeral
computation may produce a bounded artifact set, but accepted delivery is the
only path that admits bytes into a package.

## Scope

This goal includes the first three approved steps:

1. Make `javascript-services-section` authoritative by
   updating discovery, section indexes, and generated circuit projections, then
   proving fresh-process package resolution.
2. Complete the actuator chain from source observation through ephemeral
   computation, static/sandbox verification, accepted delivery, and Git
   induction with receiver-visible evidence.
3. Relocate the next JSNode services into the section, beginning with:
   `software-mission-execution-service`, `software-program-synthesis-service`,
   `sandbox-command-execution-service`, and related Node/runtime services.

Algora's external-provider relocation is explicitly outside this goal's first
three steps; it requires a separately identified external semioverse boundary.

## Acceptance

- A fresh process discovers the section and every admitted child service.
- A real function movement produces bounded source-removal and target-insertion
  artifacts and reaches the accepted-delivery receiver.
- Verification and Git induction preserve typed refusal/receipt evidence.
- The listed JSNode services exist under this section without duplicate live
  implementations or broken package identity.
- No local `node_modules` or ambient workspace authority is part of the
  movement path.

## Current state

The deterministic edit actuator has been moved into this section while keeping
the package name `@red-cup-engineering/software-edit-language-service`.
`function-movement-service` is the first new composition seam and has three
passing tests.
