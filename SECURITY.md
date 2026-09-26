# Security Policy

**Last Updated:** September 25, 2026

## Reporting a Vulnerability

If you believe you have found a security vulnerability in AgenticCoder / NEO,
please report it privately rather than opening a public issue.

**Email:** security@lumorix.studio
**GitHub:** Use GitHub's "Report a vulnerability" button on the Security tab of
the repository.

Please include:

* A description of the issue and the potential impact
* Steps to reproduce, or a proof of concept
* The affected version, build, or commit
* Any relevant logs or screenshots (redact secrets, API keys, and tokens)

We aim to acknowledge reports within 72 hours and to provide an initial
assessment within 7 days. We will keep you updated as we investigate and will
credit you in the release notes if you would like to be credited.

## Scope

In scope:

* The AgenticCoder / NEO application and its source code
* The `api-keys` Supabase Edge Function
* The Lumorix Studios website account and authentication flows
* The Supabase database schema, RLS policies, and access control

Out of scope:

* Vulnerabilities in third-party AI providers or their APIs
* Vulnerabilities in third-party dependencies with no demonstrated impact in
  Lumorix code
* Findings that require physical access to an already-compromised device
* Denial-of-service testing without prior written permission
* Social engineering or phishing attempts against users

## Handling API Keys

AgenticCoder stores provider API keys (BYOK) encrypted server-side with
AES-256-GCM. If you believe a key has been exposed:

1. Revoke and rotate the key at the provider immediately.
2. Remove the key from your account in Settings → AI.
3. Report it to us at security@lumorix.studio so we can investigate server-side
   exposure.

Never commit API keys to a repository, and never paste one into an issue,
screenshot, or log.

## Supported Versions

AgenticCoder is an early-stage project. Security fixes are applied to the latest
release on the main branch. We recommend always running the latest version.

## Disclosure

We ask that you give us a reasonable opportunity to fix an issue before public
disclosure. We do not take legal action against good-faith research that stays
within this policy, avoids privacy violations, and does not degrade service for
others.
