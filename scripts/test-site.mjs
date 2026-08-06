import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const manifestRelativePath = 'page-data/file-manifest.json';
const manifestPath = path.join(repositoryRoot, manifestRelativePath);

const fail = (message) => {
    throw new Error(message);
};

const runGit = (...args) => execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
}).trim();

const encodePath = (relativePath) => relativePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

const sourceFiles = runGit(
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
)
    .split('\0')
    .filter(Boolean)
    .filter((relativePath) => existsSync(path.join(repositoryRoot, relativePath)))
    .filter((relativePath) => !relativePath.startsWith('_site/'))
    .filter((relativePath) => !relativePath.startsWith('page-data/source/'))
    .sort((left, right) => left.localeCompare(right));

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifestPaths = manifest.files
    .map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right));
const sourceUrls = new Set();
const rawUrls = new Set();

if (manifest.schemaVersion !== 2) {
    fail('The source manifest schema is not version 2.');
}

if (JSON.stringify(manifestPaths) !== JSON.stringify(sourceFiles)) {
    fail('The manifest file set does not match the repository root.');
}

for (const requiredPath of [
    '.github/workflows/validate-site.yml',
    'README.md',
    'index.html',
    'page-data/file-manifest.json',
    'page-data/style.css',
    'scripts/generate-manifest.mjs',
    'scripts/test-site.mjs',
]) {
    if (!manifestPaths.includes(requiredPath)) {
        fail(`The manifest is missing required source ${requiredPath}.`);
    }
}

for (const entry of manifest.files) {
    const expectedSourceUrl = encodePath(entry.path);
    const expectedRawUrl = `https://raw.githubusercontent.com/${manifest.repository}/${manifest.branch}/${expectedSourceUrl}`;

    if (entry.sourceUrl !== expectedSourceUrl) {
        fail(`The direct source URL is incorrect for ${entry.path}.`);
    }

    if (entry.rawUrl !== expectedRawUrl) {
        fail(`The GitHub source URL is incorrect for ${entry.path}.`);
    }

    if (sourceUrls.has(entry.sourceUrl)) {
        fail(`The direct source URL is duplicated for ${entry.path}.`);
    }
    sourceUrls.add(entry.sourceUrl);

    if (rawUrls.has(entry.rawUrl)) {
        fail(`The GitHub source URL is duplicated for ${entry.path}.`);
    }
    rawUrls.add(entry.rawUrl);

    if (entry.generated) {
        if (entry.path !== manifestRelativePath) {
            fail(`An unexpected generated source exists at ${entry.path}.`);
        }
        continue;
    }

    const bytes = await readFile(path.join(repositoryRoot, entry.path));
    const sourceHash = createHash('sha256').update(bytes).digest('hex');

    if (sourceHash !== entry.sha256) {
        fail(`The manifest hash is incorrect for ${entry.path}.`);
    }

    if (entry.size !== bytes.byteLength) {
        fail(`The manifest size is incorrect for ${entry.path}.`);
    }
}

if (existsSync(path.join(repositoryRoot, '_site'))) {
    fail('The legacy _site artifact still exists.');
}

if (manifestPaths.some((sourcePath) => sourcePath.startsWith('page-data/source/'))) {
    fail('The manifest still contains generated source mirrors.');
}

const indexHtml = await readFile(path.join(repositoryRoot, 'index.html'), 'utf8');
const styleCss = await readFile(path.join(repositoryRoot, 'page-data', 'style.css'), 'utf8');

for (const requiredText of [
    'name="viewport"',
    'page-data/file-manifest.json',
    'role="tree"',
    'role="tablist"',
    'id="media-viewer"',
    'node.rawUrl',
]) {
    if (!indexHtml.includes(requiredText)) {
        fail(`index.html is missing ${requiredText}.`);
    }
}

const codiconsStylesheetIndex = indexHtml.indexOf('@vscode/codicons');
const siteStylesheetIndex = indexHtml.indexOf('page-data/style.css');

if (codiconsStylesheetIndex === -1 || siteStylesheetIndex === -1) {
    fail('The site must load both the Codicons and local stylesheets.');
}

if (codiconsStylesheetIndex > siteStylesheetIndex) {
    fail('The site stylesheet must load after Codicons so local icon sizes take precedence.');
}

if (!/\.activity-bar \.activity-button \.codicon\s*\{[^}]*font-size:\s*24px;/s.test(styleCss)) {
    fail('The activity bar icon size must match the 24px VS Code treatment.');
}

if (!styleCss.includes('@media (max-width: 767px)')) {
    fail('The mobile layout rule is missing.');
}

if (!styleCss.includes('100dvh')) {
    fail('The stable viewport height rule is missing.');
}

console.log(`Validated ${manifest.files.length} root source files.`);
