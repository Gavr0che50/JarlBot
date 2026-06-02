const fs = require('fs');
const path = require('path');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {}

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(DIST, `JarlBot-portable-${stamp}`);

const entries = [
  '.env.example',
  'README.md',
  'INSTALLATION-WINDOWS.md',
  'INSTALLATION-LINUX.md',
  'troubleshoot.md',
  'LICENSE',
  'package.json',
  'package-lock.json',
  'config.js',
  'deploy-commands.js',
  'index.js',
  'JarlBot Launcher.cmd',
  'launcher.sh',
  'utils',
  'scripts',
];

function copyIfExists(relativePath) {
  const source = path.join(ROOT, relativePath);
  const destination = path.join(target, relativePath);
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function copyDatabase(relativePath) {
  const source = path.join(ROOT, relativePath);
  const destination = path.join(target, relativePath);
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (DatabaseSync) {
    try {
      if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
      const db = new DatabaseSync(source, { readOnly: true });
      db.exec(`VACUUM INTO ${sqlQuote(destination)}`);
      db.close();
      return;
    } catch (err) {
      console.warn(`SQLite export compact impossible pour ${relativePath}: ${err.message}`);
    }
  }
  fs.copyFileSync(source, destination);
  for (const suffix of ['-shm', '-wal']) {
    const extra = `${source}${suffix}`;
    if (fs.existsSync(extra)) fs.copyFileSync(extra, `${destination}${suffix}`);
  }
}

fs.mkdirSync(target, { recursive: true });
for (const entry of entries) copyIfExists(entry);

for (const dbFile of ['eva-cache.db', 'bot-state.db']) copyDatabase(dbFile);

fs.mkdirSync(path.join(target, 'logs'), { recursive: true });
fs.writeFileSync(path.join(target, 'README-PORTABLE.txt'), [
  'JarlBot portable',
  '',
  '1. Installer Node.js 24+ si besoin.',
  '2. Double-cliquer sur "JarlBot Launcher.cmd" sous Windows.',
  '   Sous Linux: chmod +x launcher.sh puis ./launcher.sh',
  '3. Renseigner les IDs Discord et sauvegarder.',
  '4. Suivre INSTALLATION-WINDOWS.md ou INSTALLATION-LINUX.md pour creer et inviter le bot depuis le portail Discord.',
  '5. Cliquer sur "Sauvegarder et lancer". Les slash commands sont enregistrees automatiquement.',
  '',
  'La base EVA locale eva-cache.db est incluse si elle existait au moment de l export.',
  'La base bot-state.db est incluse si elle existait pour conserver les defis/sessions programmes.',
  'Ne partage pas ton fichier .env s il contient un token Discord.',
  '',
].join('\n'), 'utf8');

console.log(target);
