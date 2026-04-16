# Orbyt Engine Versioning and Deprecation Policy

Status: Pre-v1 policy
Scope: Orbyt engine workflows and engine-local compatibility metadata

## Purpose

This policy defines how the Orbyt engine handles workflow versioning, deprecation, and release stability while the engine is still in active development.

## Current release stance

- The engine is pre-v1.
- Backward compatibility guarantees are intentionally deferred until stable v1.
- Compatibility metadata is still accepted and preserved so releases can be planned safely.
- The engine may warn on deprecated workflows, but it does not promise stable compatibility across future major releases yet.

## Version format

- Workflow versions use semantic version style values such as `1.0` or `1.0.0`.
- A leading `v` prefix is allowed for engine parsing convenience.
- The engine treats the major version as the compatibility gate for the current workflow DSL.

## Stability tiers

- `alpha`: experimental behavior and fields may change without long notice.
- `beta`: behavior is usable but still subject to change before v1.
- `stable`: reserved for the post-v1 compatibility promise.

## Deprecation policy

- Deprecation must be explicit in workflow metadata.
- Deprecation notices should include a clear message and, when known, a replacement path or target version.
- Deprecated workflows remain parseable unless they violate structural or security rules.
- Deprecation is communicated through parser and engine warnings, not silent removal.

## Accepted metadata

### Compatibility

```ts
compatibility?: {
  minVersion?: string;
  maxVersion?: string;
  deprecated?: boolean;
}
```

### Deprecation info

```ts
 deprecationInfo?: {
   message: string;
   removedIn?: string;
   replacementPath?: string;
 }
```

## Pre-v1 change handling

The following guidance applies until stable v1 is released:

- New optional fields may be added.
- New warnings or deprecation notices may be introduced.
- Breaking behavior may still be introduced if documented in the release notes and reflected in the plan.
- Compatibility guarantees are not yet contractual.

## Notes for future v1 policy

When v1 is planned, this document should be expanded with:

- strict semver compatibility rules
- major/minor/patch change classification
- minimum deprecation grace period
- removal windows for deprecated fields and behaviors
- consumer migration guidance
