#!/usr/bin/env bun

import { serve } from 'bun';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import os from 'os';
import { URL } from 'url';

// --- CLI Parsing ---
const argv = yargs(hideBin(process.argv))
  .scriptName("local-proxy")
  .usage('Usage: $0 --domain <name> --proxy-target <url> --rewrite-base <path> [options]')
  .option('domain', {
    alias: 'd',
    type: 'string',
    demandOption: true,
    describe: 'Local domain name to map (e.g. "my-app")',
  })
  .option('proxy-target', {
    alias: 't',
    type: 'string',
    demandOption: true,
    describe: 'Target base URL (e.g. "http://localhost:5001")',
  })
  .option('rewrite-base', {
    alias: 'r',
    type: 'string',
    demandOption: true,
    describe: 'Base path on target to forward requests to (e.g. "/api/render")',
  })
  .option('port', {
    alias: 'p',
    type: 'number',
    default: 80,
    describe: 'Port to run proxy on (default: 80)',
  })
  .option('add-to-hosts', {
    alias: 'a',
    type: 'boolean',
    default: false,
    describe: 'Add domain to /etc/hosts as 127.0.0.1',
  })
  .option('dry-run', {
    type: 'boolean',
    default: false,
    describe: 'Print actions without executing',
  })
  .help()
  .argv;

const { domain, proxyTarget, rewriteBase, port, addToHosts, dryRun } = argv;
const normalizedRewrite = rewriteBase.endsWith('/') ? rewriteBase : rewriteBase + '/';

// --- /etc/hosts ---
if (addToHosts) {
  const hostsPath = '/etc/hosts';
  const entry = `127.0.0.1 ${domain}`;
  try {
    const current = fs.readFileSync(hostsPath, 'utf8');
    if (!current.includes(entry)) {
      if (!dryRun) {
        fs.appendFileSync(hostsPath, os.EOL + entry);
        console.log(`[✓] Added '${entry}' to /etc/hosts`);
      } else {
        console.log(`[dry-run] Would add '${entry}' to /etc/hosts`);
      }
    } else {
      console.log(`[i] '${domain}' already in /etc/hosts`);
    }
  } catch (err: any) {
    console.error(`[✗] Could not update /etc/hosts: ${err.message}`);
  }
}

if (dryRun) {
  console.log(`[dry-run] Would start proxy from http://${domain}:${port} → ${proxyTarget}${normalizedRewrite}`);
  process.exit(0);
}

// --- Bun Native HTTP Proxy ---
serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    const proxiedPath = normalizedRewrite + url.pathname.slice(1);
    const proxiedUrl = new URL(proxiedPath, proxyTarget);
    proxiedUrl.search = url.search;

    const newHeaders = new Headers(req.headers);
    newHeaders.set("host", proxiedUrl.host);

    return fetch(proxiedUrl.toString(), {
      method: req.method,
      headers: newHeaders,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });
  },
});

console.log(`🔄 Proxy running: http://${domain}:${port} → ${proxyTarget}${normalizedRewrite}`);
