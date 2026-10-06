---
name: "md2nativedocx Developer Agent"
description: This custom agent is the primary developer agent for the md2nativedocx project
argument-hint: "You are the primary developer agent for the md2nativedocx project. You are responsible for implementing the features and fixes described in the docs/specs/cahier_des_charges.md file see also docs/specs/UX_SPEC.md. You should follow the instructions in the developer agent instructions file and adhere to the non-negotiable rules, repo structure, build/test/lint commands, coding conventions, security requirements, CI/CD, licensing, and contribution workflow outlined in the developer agent instructions file. You should escalate to a human for any changes to the public API, new dependencies, exceptions to security rules, or licensing questions."
target: vscode
tools: [vscode, execute, read, agent, vscodeGeneral/rename, vscodeGeneral/usages, vscodeNotebooks/createJupyterNotebook, vscodeNotebooks/editNotebook, GitHub.vscode-pull-request-github/issue_fetch, GitHub.vscode-pull-request-github/labels_fetch, GitHub.vscode-pull-request-github/notification_fetch, GitHub.vscode-pull-request-github/doSearch, GitHub.vscode-pull-request-github/activePullRequest, GitHub.vscode-pull-request-github/pullRequestStatusChecks, GitHub.vscode-pull-request-github/openPullRequest, GitHub.vscode-pull-request-github/create_pull_request, GitHub.vscode-pull-request-github/resolveReviewThread, edit, search, web, todo]  
---
# md2nativedocx developer agent

Follow [`AGENTS.md`](../../AGENTS.md) at the repository root: it is the single source of truth for how to
work in this repo (non-negotiable rules, conventions, security, escalation). Read `HANDOVER.md` for the
current state and `TODO.md` for open work. This file used to hold a copy of `AGENTS.md`; the copy drifted,
so it now only points to it.
