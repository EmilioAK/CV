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
    'CV/Emilio_Alvarez_Resume.pdf',
    'README.md',
    'index.html',
    'page-data/file-manifest.json',
    'page-data/search.mjs',
    'page-data/style.css',
    'scripts/generate-manifest.mjs',
    'scripts/test-search.mjs',
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
const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
const styleCss = await readFile(path.join(repositoryRoot, 'page-data', 'style.css'), 'utf8');

for (const requiredText of [
    'name="viewport"',
    'page-data/file-manifest.json',
    'role="tree"',
    'role="toolbar" aria-label="Open files"',
    'id="media-viewer"',
    'id="pdf-viewer"',
    'id="search-toggle"',
    'id="search-input"',
    'id="search-results"',
    "from './page-data/search.mjs'",
    'isCareerPath(entry.path)',
    'buildSearchDocuments',
    'openSearchMatch',
    'Shift+Command+F',
    'renderPdfFile',
    "node.mediaType === 'application/pdf'",
    'node.rawUrl',
]) {
    if (!indexHtml.includes(requiredText)) {
        fail(`index.html is missing ${requiredText}.`);
    }
}

if (indexHtml.includes('id="resume-download"')) {
    fail('The activity bar must not contain a separate resume shortcut.');
}

if (indexHtml.includes('data-search-scope') || indexHtml.includes('REPOSITORY MATCHES')) {
    fail('The Search view must not contain repository scope controls.');
}

if (indexHtml.includes('Find relevant experience')
    || styleCss.includes('.search-empty-copy')) {
    fail('The Search view must not contain the introductory empty-state block.');
}

for (const actionLabel of [
    'Open my resume',
    'Email me',
    'Open my LinkedIn',
    'Open my GitHub',
]) {
    if (!indexHtml.includes(`label: '${actionLabel}'`)) {
        fail(`The Search view is missing the ${actionLabel} action.`);
    }
}

if (!readme.includes('[Download my resume](CV/Emilio_Alvarez_Resume.pdf)')) {
    fail('README.md must keep the direct resume download link.');
}

const resumeEntry = manifest.files.find((entry) => {
    return entry.path === 'CV/Emilio_Alvarez_Resume.pdf';
});

if (!resumeEntry || resumeEntry.kind !== 'binary') {
    fail('The resume must be available as a binary download.');
}

if (resumeEntry.mediaType !== 'application/pdf') {
    fail('The resume must use the application/pdf media type.');
}

const cssRuleBody = (selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return styleCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
};

const pdfModeStyles = cssRuleBody('.media-viewer.pdf-mode');
const pdfPreviewStyles = cssRuleBody('.media-viewer.pdf-mode .media-preview');
const pdfDetailsStyles = cssRuleBody('.media-viewer.pdf-mode .media-details');
const pdfViewerStyles = cssRuleBody('.pdf-viewer');

if (!pdfModeStyles.includes('padding: 0;') || !pdfModeStyles.includes('overflow: hidden;')) {
    fail('PDF mode must fill the editor without outer spacing.');
}

if (!pdfPreviewStyles.includes('height: 100%;')) {
    fail('The PDF preview container must fill the editor height.');
}

if (!pdfDetailsStyles.includes('display: none;')) {
    fail('The PDF metadata panel must be hidden in the full-tab viewer.');
}

if (!pdfViewerStyles.includes('height: 100%;') || !pdfViewerStyles.includes('border: 0;')) {
    fail('The PDF frame must fill its container without a border.');
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

for (const requiredSelector of [
    '.search-input-shell',
    '.search-status:empty',
    '.search-result-match',
    '.search-message-error',
    '.monaco-editor .search-match-highlight',
]) {
    if (!styleCss.includes(requiredSelector)) {
        fail(`The search interface is missing ${requiredSelector}.`);
    }
}

if (/[—–]/.test(indexHtml)) {
    fail('The visible interface must use regular hyphens instead of long dashes.');
}

if (!styleCss.includes('100dvh')) {
    fail('The stable viewport height rule is missing.');
}

console.log(`Validated ${manifest.files.length} root source files.`);
