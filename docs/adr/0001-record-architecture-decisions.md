# 0001: Record architecture decisions

- Status: Accepted
- Date: 2026-10-25

## Context

Decisions without a recorded reason get re-litigated or reversed by accident, by people and by agents. teamtodo has several non-obvious constraints (single `file://` bundle, field-level merge, soft deletes) whose reasons should survive the people who chose them.

## Decision

Significant decisions are recorded as short ADRs in `docs/adr`, numbered and not edited after acceptance (a new ADR supersedes an old one). The format follows kontor: status, date, context, decision, consequences.

## Consequences

A small cost per decision, and a place to answer "why is it like this?".
