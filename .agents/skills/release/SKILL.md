---
name: release
description: User-invoked ReviewInbox release procedure. Use only when explicitly invoked as /release.
disable-model-invocation: true
---

# Release

Create a ReviewInbox release from the local machine: bump the root package version, write release notes to `/tmp`, create an annotated semver tag, push after explicit confirmation, then create the GitHub Release.

Do not create or modify GitHub Actions workflows. Image publishing is handled by the existing image workflow.

## Inputs

- Optional requested version from the user, such as `0.4.0` or `v0.4.0`.
- If no version is provided, inspect the changes since the latest `v*` tag and propose `major`, `minor`, or `patch`.

## Preconditions

Stop and ask the user before making release changes unless every condition is true:

- The current branch is `main`.
- The worktree is clean before the release starts.
- `gh auth status` succeeds for GitHub.
- The latest remote refs and tags have been fetched.
- The target version is valid semver `X.Y.Z` after stripping an optional leading `v`.
- The target tag `vX.Y.Z` does not already exist locally or remotely.
- The target version is greater than the latest semver `v*` tag, unless this is the first release.

## Procedure

1. Establish the target version.
   - Normalize the version to `X.Y.Z` for `package.json` and `vX.Y.Z` for the tag and release title.
   - If the user did not provide a version, inspect commits and merged PRs since the latest `v*` tag, then propose a version and wait for approval.
   - Completion criterion: the user has approved one exact target tag, such as `v0.4.0`.

2. Collect release inputs.
   - Use `git log <last-tag>..HEAD` for commits.
   - Use `gh` to find merged PRs associated with the commits when available.
   - Include commits that are not associated with a PR so direct commits are not lost.
   - Collect PR authors for contributor acknowledgements. Prefer GitHub handles from `gh`; use git author names only when no handle is available.
   - Detect first-time contributors by checking whether the same GitHub handle or git author appears before the latest release range.
   - Completion criterion: every commit since the latest release tag is accounted for by a PR entry or a direct commit entry.

3. Draft release notes in `/tmp/reviewinbox-release-vX.Y.Z.md`.
   - Keep the style consistent between releases even when commit messages do not follow Conventional Commits.
   - Prefer user-facing wording over raw commit titles.
   - Do not mention that Docker images may take time to publish.
   - Use this structure:

```markdown
## Highlights

- ...

## Changes

- ...

## Fixes

- ...

## Self-hosted notes

- No self-hosted action required.

## Contributors

- Thanks @alice for improving store sync reliability.
- First contribution from @bob.
```

   - Omit empty `Highlights`, `Changes`, or `Fixes` sections only when there is genuinely nothing to say.
   - Always include `Self-hosted notes`; replace the default sentence when migrations, environment variables, compose changes, or operator action matter.
   - Include `Contributors` only when at least one contributor beyond the release author is detected.
   - Use `First contribution from @user.` for first-time contributors.
   - Use `Thanks @user for ...` for returning contributors when the PR title or change summary makes a concise acknowledgement possible.
   - Completion criterion: the notes file exists in `/tmp`, has the final approved version in its filename, and covers every release input.

4. Apply the version bump.
   - Update the root `package.json` `version` field to `X.Y.Z`.
   - Run `pnpm install --lockfile-only` if `pnpm-lock.yaml` needs to reflect the package version change.
   - Do not edit changelog files for this release flow.
   - Completion criterion: the only intended tracked changes are the root version bump and any lockfile update caused by it.

5. Commit and tag locally.
   - Commit the intended tracked changes with `chore: release vX.Y.Z`.
   - Create an annotated tag `vX.Y.Z` on that commit using the `/tmp` release notes as the tag message.
   - Verify that `HEAD` is the release commit and that `vX.Y.Z` points to `HEAD`.
   - Completion criterion: the release commit and annotated tag exist locally and point at the same commit.

6. Ask for explicit publication confirmation.
   - Show the target tag, commit hash, release notes path, and the exact commands that will publish.
   - Require a clear yes from the user before any push.
   - Do not push if the user is ambiguous or changes their mind.
   - Completion criterion: the user explicitly confirms publication.

7. Publish.
   - Run `git push --follow-tags`.
   - Run `gh release create vX.Y.Z --title vX.Y.Z --notes-file /tmp/reviewinbox-release-vX.Y.Z.md`.
   - If the GitHub Release already exists after the push, stop and ask whether to edit it instead of overwriting intent.
   - Completion criterion: the tag is on the remote and the GitHub Release exists for `vX.Y.Z`.

## Safety Rules

- Never push before the explicit confirmation step.
- Never use `git push --tags`; use `git push --follow-tags` only.
- Never use destructive git commands to recover from a release failure.
- If any command fails after the local commit or tag is created, explain the current state and ask before modifying the commit, tag, or release.
- If unrelated local changes appear during the release, stop and ask the user how to proceed.
