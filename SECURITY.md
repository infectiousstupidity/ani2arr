# Security Policy

## Supported versions

ani2arr is a personal open source project. Security fixes are handled on a best-effort basis.

Only the latest released version is considered supported for security reports.

| Version | Supported |
| ------- | --------- |
| 2.1.x | Yes |
| 2.0.x | No |
| 1.0.x | No |

## Reporting a vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Use one of these private reporting methods:

1. GitHub private vulnerability reporting:
   https://github.com/infectiousstupidity/ani2arr/security/advisories/new

2. Email:
   infectiousstupidity@proton.me

## What to include

Include as much of the following as possible:

- affected ani2arr version
- browser and browser version
- operating system
- affected provider, if relevant
- Sonarr, Radarr, or Seerr version, if relevant
- clear description of the issue
- steps to reproduce
- expected behavior
- actual behavior
- possible impact
- proof of concept, if available

Do not include real API keys, tokens, passwords, private hostnames, or private IP addresses.

## Security scope

Relevant security issues include:

- API keys exposed to pages that should not receive them
- provider credentials leaked outside browser extension storage
- requests sent to an unintended host
- host permission behavior that grants more access than intended
- unsafe handling of provider URLs
- unsafe handling of AniList, AniChart, or provider response data
- cross-site scripting in extension UI
- privilege escalation through content scripts
- release asset tampering or misleading release artifacts

## Out of scope

The following are usually out of scope:

- issues that require full control of the user's browser profile
- issues caused by a compromised Sonarr, Radarr, or Seerr server
- issues caused by malicious browser extensions installed by the user
- issues caused by exposing self-hosted services without proper authentication
- social engineering
- denial of service against AniList, AniChart, GitHub, Sonarr, Radarr, or Seerr
- reports without a reproducible security impact

## Project architecture notes

ani2arr stores configuration locally in browser extension storage.

Stored configuration can include:

- provider URLs
- API keys
- default add settings
- UI preferences
- manual mappings
- manual Seerr targets
- cached metadata

ani2arr may request data from:

- configured Sonarr servers
- configured Radarr servers
- configured Seerr servers
- AniList GraphQL
- public AniBridge mapping files hosted on GitHub

ani2arr does not:

- operate a developer-owned backend
- include analytics
- include advertising
- include tracking SDKs
- sell user data
- sync settings to a developer service

## Disclosure process

After a valid report is received:

1. The report will be reviewed.
2. The issue will be reproduced if possible.
3. A fix will be prepared if the issue is accepted.
4. A release will be published when the fix is ready.
5. Public disclosure can happen after users have had reasonable time to update.

No response time or fix time is guaranteed.
