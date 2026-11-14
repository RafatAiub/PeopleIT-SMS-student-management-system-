// SKIP_DOTENV=true means "use only this process's environment". dotenv in
// env.ts already honours that, but Prisma's generated client also loads
// backend/.env (which points at PRODUCTION) the moment @prisma/client is
// imported, filling every variable the process hasn't set. Claiming each name
// from those files as '' first makes that load a no-op; env.ts treats '' as
// unset. Import this before anything else (server.ts, jest setupFiles, env.ts).
import fs from 'fs';
import path from 'path';

function parseNames(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

if (process.env.SKIP_DOTENV === 'true') {
  const backendDir = path.resolve(__dirname, '..', '..');
  const files = new Set([
    path.join(backendDir, '.env'),
    path.join(backendDir, 'prisma', '.env'),
    path.join(backendDir, '..', '.env'),
    path.resolve(process.cwd(), '.env'),
  ]);
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // file absent
    }
    for (const name of parseNames(text)) {
      if (!(name in process.env)) process.env[name] = '';
    }
  }
}

export {};
