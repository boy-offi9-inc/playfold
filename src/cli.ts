#!/usr/bin/env node
import { checkUrl } from './check';
import type { Level } from './check';
import { VERSION } from './version';

const HELP = `playfold-check ${VERSION}

Usage: playfold-check <url> [--json]

Fetches the URL the way WhatsApp, Telegram, Discord, X, Facebook and Slack crawlers do,
then reports what they see and what is likely to stop a rich preview.

  --json   print the full report as JSON
  --help   show this message

Exit code is 1 when any error is found.`;

const MARK: Record<Level, string> = { error: '✖', warn: '▲', info: '·' };

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || !args.length) {
    console.log(HELP);
    return args.length ? 0 : 1;
  }
  const url = args.find((a) => !a.startsWith('-'));
  if (!url) {
    console.error(HELP);
    return 1;
  }

  const report = await checkUrl(url);
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  console.log(`\n${report.url}\n`);
  for (const c of report.crawlers) {
    const status = c.error ? `failed: ${c.error}` : `HTTP ${c.status}`;
    const seen = c.error ? '' : `  title: ${c.title ? 'yes' : 'NO'}  image: ${c.hasImage ? 'yes' : 'NO'}`;
    console.log(`  ${c.name.padEnd(10)} ${status}${seen}`);
  }
  console.log('');
  if (!report.findings.length) console.log('  No problems found.');
  for (const f of report.findings) console.log(`  ${MARK[f.level]} ${f.message}`);
  console.log('\nThis checks the tags and files. Whether a platform plays media inline is its own decision.\n');
  return report.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
