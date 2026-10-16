# Dependabot Merge App

`.github/workflows/dependabot-merge.yml` merges Dependabot patch and minor
PRs as soon as every required status check on `main` is green, with no human
review. It does this as a dedicated GitHub App, because:

- the `main protection` ruleset requires a code-owner approval, which no bot
  can give;
- native auto-merge never applies a ruleset bypass, so the app calls the merge
  endpoint itself;
- a bypass covers every rule in a ruleset, so the review rule moves into its
  own ruleset (the only one the app bypasses) and the required checks stay
  enforced for the app.

Until the setup below is done, the job is skipped and Dependabot PRs behave as
before: `dependabot-automerge.yml` enables native auto-merge, which completes
after a maintainer approves.

## Setup (org admin, once)

1. **Create the app** in the `keep-starknet-strange` organization
   (Settings → Developer settings → GitHub Apps → New GitHub App):
   - Webhook: inactive.
   - Repository permissions: Contents **read and write**, Workflows **read and
     write** (needed to merge the GitHub Actions bump PRs), Metadata read.
     Nothing else.
   - Installable only on this account. Install it on `starknet-agentic` only.
   - Note the **App ID** and **Client ID**, and generate a private key.
2. **Create the `dependabot-merge` environment** (repo Settings →
   Environments): deployment branches limited to `main`, no required
   reviewers. Add the secret `DEPENDABOT_MERGE_APP_PRIVATE_KEY` with the
   private key, then delete the downloaded key file.
3. **Split the review rule out of `main protection`.** Creating the new
   ruleset before removing the rule means `main` is never unprotected:

   ```bash
   R=keep-starknet-strange/starknet-agentic
   APP_ID=<numeric App ID>
   gh api repos/$R/rulesets/16100058 > main-protection.json
   jq --argjson app "$APP_ID" '{name: "main review", target, enforcement, conditions,
       bypass_actors: (.bypass_actors + [{actor_id: $app, actor_type: "Integration", bypass_mode: "pull_request"}]),
       rules: [.rules[] | select(.type == "pull_request")]}' main-protection.json \
     | gh api -X POST repos/$R/rulesets --input -
   jq '{rules: [.rules[] | select(.type != "pull_request")]}' main-protection.json \
     | gh api -X PUT repos/$R/rulesets/16100058 --input -
   ```

   Then check `gh api repos/$R/rules/branches/main`: it must still list the
   `pull_request` and `required_status_checks` rules, and the app must appear
   only in the `main review` bypass list.
4. **Turn it on** by adding the repository variable
   `DEPENDABOT_MERGE_APP_CLIENT_ID` (repo Settings → Secrets and variables →
   Actions → Variables) set to the Client ID.

To verify, re-run the failed jobs of an open patch or minor Dependabot PR (or
wait for the next one): once its last required check passes, the
`Dependabot merge` run should squash-merge it as the app.

## What the workflow checks before merging

It runs on `workflow_run` after CI, Dependency Review or CodeQL completes, so
it never checks out or executes pull-request code. It merges only when all of
the following hold, and otherwise exits with a notice:

- the PR is open, not a draft, opened by `dependabot[bot]` from a branch in
  this repository, targets `main`, and its head is the commit the checks ran
  on;
- every commit is authored by `dependabot[bot]` and has a verified GitHub
  signature, so a pushed-in human commit stops the merge;
- every dependency in the commit metadata is a `semver-patch` or
  `semver-minor` update (majors, and updates Dependabot does not classify,
  still need a human);
- every status check that `main` requires, read from the live rules, has
  passed on that commit;
- the branch is not behind `main`.

The merge call pins the head SHA, so GitHub rejects it if the branch moved in
the meantime. The ruleset enforces the required checks again on the app's
merge.

## Residual risk and limits

- Auto-merging trusts upstream patch and minor releases once CI passes. The
  `cooldown` in `.github/dependabot.yml`, Dependency Review and the CI audit
  gate are the remaining defenses.
- Anyone who obtains the private key can merge PRs into `main` without review
  (not without green checks). It lives only in an environment that `main`
  workflows can use; rotate it from the app settings if exposed.
- Dependabot rebases a PR only when it conflicts. A PR that is merely behind
  `main` (typically the GitHub Actions group after an npm group merges) waits
  until someone comments `@dependabot rebase`.

## Disabling

Delete the `DEPENDABOT_MERGE_APP_CLIENT_ID` variable to stop merges at once.
To remove the setup entirely, uninstall the app, delete the environment, and
move the `pull_request` rule back into `main protection`.
