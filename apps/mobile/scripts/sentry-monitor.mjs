#!/usr/bin/env node
/**
 * Sentry issue monitor for Casa Companion Mobile.
 *
 * Requires SENTRY_AUTH_TOKEN.
 * Optionally set SENTRY_DSN to auto-resolve org/project; otherwise set
 * SENTRY_PROJECT_ID (numeric) or SENTRY_ORG + SENTRY_PROJECT.
 *
 * Exit codes:
 *   0 = checked, no new issues above threshold
 *   1 = missing config / API error
 *   2 = new issues detected (useful for CI/cron alerting)
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';

function loadEnvFiles() {
  for (const file of ['.env.local', '.env']) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFiles();

const SENTRY_API = 'https://sentry.io/api/0';
const AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const DSN = process.env.SENTRY_DSN;
const TARGET_PROJECT_ID = process.env.SENTRY_PROJECT_ID;
const THRESHOLD = parseInt(process.env.SENTRY_ISSUE_THRESHOLD || '0', 10);
const STATS_PERIOD = process.env.SENTRY_STATS_PERIOD || '24h';

function parseDsnProjectId(dsn) {
  try {
    const url = new URL(dsn);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[0] || undefined;
  } catch {
    return undefined;
  }
}

async function sentryFetch(path) {
  const res = await fetch(`${SENTRY_API}${path}`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sentry API ${path} returned ${res.status}: ${body}`);
  }
  return res.json();
}

async function resolveProject() {
  if (process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) {
    return { orgSlug: process.env.SENTRY_ORG, projectSlug: process.env.SENTRY_PROJECT };
  }

  const wantedId = TARGET_PROJECT_ID || (DSN ? parseDsnProjectId(DSN) : undefined);
  if (!wantedId) {
    throw new Error(
      'Set SENTRY_DSN or SENTRY_PROJECT_ID so the monitor can find the right Sentry project.'
    );
  }

  const projects = await sentryFetch('/projects/');
  const match = projects.find((p) => String(p.id) === String(wantedId));
  if (!match) {
    throw new Error(`Sentry project id ${wantedId} not found for this auth token.`);
  }
  return { orgSlug: match.organization.slug, projectSlug: match.slug };
}

function formatIssue(issue) {
  const count = issue.count ?? '?';
  const users = issue.userCount ?? '?';
  const lastSeen = issue.lastSeen ? new Date(issue.lastSeen).toLocaleString() : '?';
  return `- [${issue.level || 'error'}] ${issue.title}\n  id: ${issue.id} | events: ${count} | users: ${users} | last: ${lastSeen}\n  ${issue.permalink || ''}`;
}

async function main() {
  if (!AUTH_TOKEN) {
    console.error('Missing SENTRY_AUTH_TOKEN environment variable.');
    process.exit(1);
  }

  const { orgSlug, projectSlug } = await resolveProject();
  const issues = await sentryFetch(
    `/projects/${orgSlug}/${projectSlug}/issues/?statsPeriod=${encodeURIComponent(STATS_PERIOD)}`
  );

  if (!Array.isArray(issues)) {
    console.error('Unexpected Sentry response:', JSON.stringify(issues, null, 2));
    process.exit(1);
  }

  const unresolved = issues.filter((i) => i.status === 'unresolved');

  console.log(`Sentry monitor: ${orgSlug}/${projectSlug}`);
  console.log(`Period: ${STATS_PERIOD} | total issues: ${issues.length} | unresolved: ${unresolved.length}`);

  if (issues.length === 0) {
    console.log('No issues in the monitored window. 🎉');
    process.exit(0);
  }

  console.log('\nLatest issues:\n');
  console.log(issues.slice(0, 20).map(formatIssue).join('\n\n'));

  if (THRESHOLD > 0 && unresolved.length > THRESHOLD) {
    console.error(`\nALERT: ${unresolved.length} unresolved issues exceeds threshold (${THRESHOLD}).`);
    process.exit(2);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Monitor failed:', err.message);
  process.exit(1);
});
