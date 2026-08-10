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
const extensionsRelativePath = 'page-data/extensions.json';
const extensionsPath = path.join(repositoryRoot, extensionsRelativePath);

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
    extensionsRelativePath,
    'page-data/file-manifest.json',
    'page-data/search.mjs',
    'page-data/source-control.js',
    'page-data/source-control.json',
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
const extensionsManifest = JSON.parse(await readFile(extensionsPath, 'utf8'));
const sourceControlScript = await readFile(
    path.join(repositoryRoot, 'page-data', 'source-control.js'),
    'utf8'
);
const sourceControlData = JSON.parse(await readFile(
    path.join(repositoryRoot, 'page-data', 'source-control.json'),
    'utf8'
));

for (const requiredText of [
    'name="viewport"',
    'page-data/file-manifest.json',
    'role="tree"',
    'role="tablist" aria-label="Open files"',
    'id="media-viewer"',
    'id="pdf-viewer"',
    'id="search-toggle"',
    'id="search-input"',
    'id="search-results"',
    "from './page-data/search.mjs?v=20260810-1'",
    'isMarkdownPath(entry.path)',
    'buildSearchDocuments',
    'openSearchMatch',
    'Shift+Command+F',
    'id="extensions-toggle"',
    'id="extensions-sidebar-view"',
    'id="extension-viewer"',
    'id="extension-documents"',
    'Search skills',
    'Project stories',
    '<h2>Evidence</h2>',
    '<dt>Linked stories</dt>',
    'renderPdfFile',
    'openExtensionById',
    'data-file-path="README.md"',
    'data-file-path="CV/Emilio_Alvarez_Resume.pdf"',
    "node.mediaType === 'application/pdf'",
    'node.rawUrl',
    'id="source-control-toggle"',
    'id="source-control-view"',
    'id="scm-detail-viewer"',
    'id="scm-diff-editor"',
    'buildSourceControlView',
    'openSourceControlCommit',
    'openSourceControlChange',
    "file.openMode === 'file'",
]) {
    if (!indexHtml.includes(requiredText)) {
        fail(`index.html is missing ${requiredText}.`);
    }
}

const openExtensionStart = indexHtml.indexOf('const openExtensionById =');
const openExtensionEnd = indexHtml.indexOf('const openTabByKey =', openExtensionStart);
const openExtensionSource = indexHtml.slice(openExtensionStart, openExtensionEnd);

if (!openExtensionSource.includes("activateSidebarView('extensions');")) {
    fail('Opening an extension tab must activate the Extensions sidebar.');
}

const openCommitStart = indexHtml.indexOf('const openSourceControlCommit =');
const openCommitEnd = indexHtml.indexOf('const openSourceControlTabNode =', openCommitStart);
const openCommitSource = indexHtml.slice(openCommitStart, openCommitEnd);

if (!openCommitSource.includes("file.path.endsWith('.md')")
    || !openCommitSource.includes('openFileByPath(')) {
    fail('Opening a history commit must open its linked Markdown story.');
}

for (const removedControl of [
    'id="extensions-sidebar-actions"',
    'class="extensions-search-actions"',
    'extension-list-settings',
    'codicon-verified-filled',
    'id="extension-view-files"',
    '<span class="extension-detail-tab">FEATURES</span>',
    '<span class="extension-detail-tab">CHANGELOG</span>',
    '<h2>Marketplace</h2>',
    '<h2>Installation</h2>',
    'Repository notes',
]) {
    if (indexHtml.includes(removedControl)) {
        fail(`index.html still includes the removed control ${removedControl}.`);
    }
}

if ((indexHtml.match(/class="extension-detail-tab(?:\s|")/g) ?? []).length !== 1) {
    fail('The extension view must contain one working Details tab.');
}

if (extensionsManifest.schemaVersion !== 1 || !Array.isArray(extensionsManifest.extensions)) {
    fail('The extensions manifest schema is not version 1.');
}

const extensionIds = new Set();
let linkedMarkdownCount = 0;

for (const extension of extensionsManifest.extensions) {
    if (!extension.id || !extension.name || !extension.description || !extension.overview) {
        fail('Each extension must include its core text fields.');
    }

    if (extensionIds.has(extension.id)) {
        fail(`The extension identifier ${extension.id} is duplicated.`);
    }
    extensionIds.add(extension.id);

    if (!extension.icon?.label || !extension.icon.background || !extension.icon.color) {
        fail(`The extension ${extension.id} is missing its icon treatment.`);
    }

    if (!Array.isArray(extension.categories) || extension.categories.length === 0) {
        fail(`The extension ${extension.id} must include a category.`);
    }

    if (!Array.isArray(extension.documents)) {
        fail(`The extension ${extension.id} must include a documents list.`);
    }

    for (const documentLink of extension.documents) {
        if (!documentLink.path.endsWith('.md')) {
            fail(`${documentLink.path} is not a Markdown file.`);
        }

        const sourceEntry = manifest.files.find((entry) => entry.path === documentLink.path);
        if (!sourceEntry || sourceEntry.mediaType !== 'text/markdown') {
            fail(`${documentLink.path} is not available as Markdown in Explorer.`);
        }

        if (!documentLink.label || !documentLink.description) {
            fail(`${documentLink.path} is missing link text.`);
        }

        linkedMarkdownCount += 1;
    }
}

if (!extensionIds.has('python')) {
    fail('The extensions manifest must include Python.');
}

if (linkedMarkdownCount === 0) {
    fail('At least one extension must link to an Explorer Markdown file.');
}

if (sourceControlData.schemaVersion !== 1) {
    fail('The Source Control data schema is not version 1.');
}

for (const key of ['lanes', 'staged', 'changes', 'commits']) {
    if (!Array.isArray(sourceControlData[key]) || sourceControlData[key].length === 0) {
        fail(`The Source Control data must include ${key}.`);
    }
}

if (sourceControlData.branch !== 'main') {
    fail('The Source Control story must identify the main branch.');
}

if (sourceControlData.staged.length !== 4 || sourceControlData.changes.length !== 3) {
    fail('The Source Control view must keep the VS Code 4 staged and 3 changed file composition.');
}

const expectedStagedChanges = [
    ['life/teaching/computer-science.md', 'R'],
    ['life/next.md', 'A'],
    ['CV/about.md', 'M'],
    ['life/old-direction.md', 'D'],
];
const expectedWorkingChanges = [
    ['life/projects/macsights.md', 'M'],
    ['life/next.md', 'U'],
    ['life/now.md', 'M'],
];
const expectedCommitMessages = [
    'docs(story): connect the current chapters',
    'feat(work): build production software at Capisoft',
    'merge: connect independent projects with the main story',
    'feat(projects): build a native capture system',
    'feat(projects): make the portfolio its own workspace',
    'merge: connect cloud architecture with the main story',
    'feat(work): ship a reusable cloud agent integration',
    'merge: connect teaching with the main story',
    'feat(teaching): improve systems explanations and setup',
    'feat(teaching): begin teaching computer science',
    'merge: connect education with the main story',
    'feat(education): focus on systems and infrastructure',
    'feat(education): study computer science in Amsterdam',
    'chore(story): begin learning to program',
];

for (const [items, expected, label] of [
    [sourceControlData.staged, expectedStagedChanges, 'staged'],
    [sourceControlData.changes, expectedWorkingChanges, 'working'],
]) {
    const actual = items.map((item) => [item.path, item.status]);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(`The ${label} changes must match the inspected VS Code repository.`);
    }
}

if (JSON.stringify(sourceControlData.commits.map((commit) => commit.message))
    !== JSON.stringify(expectedCommitMessages)) {
    fail('The Source Control graph must match the inspected VS Code history.');
}

const laneIds = new Set(sourceControlData.lanes.map((lane) => lane.id));
const commitHashes = new Set();

for (const commit of sourceControlData.commits) {
    if (!commit.hash || commitHashes.has(commit.hash)) {
        fail('Each Source Control commit must have a unique hash.');
    }
    commitHashes.add(commit.hash);

    if (!laneIds.has(commit.lane)) {
        fail(`Commit ${commit.hash} uses an unknown lane.`);
    }

    if (!Number.isInteger(commit.graphColumns) || commit.graphColumns < 1) {
        fail(`Commit ${commit.hash} must declare its visible graph columns.`);
    }

    if (!Array.isArray(commit.files) || commit.files.length === 0) {
        fail(`Commit ${commit.hash} must include at least one changed file.`);
    }

    for (const file of commit.files) {
        if (file.openMode === 'file'
            && !manifest.files.some((entry) => entry.path === file.path)) {
            fail(`Commit ${commit.hash} links to missing story file ${file.path}.`);
        }
    }

    for (const edge of commit.edges) {
        if (!laneIds.has(edge.from) || !laneIds.has(edge.to)) {
            fail(`Commit ${commit.hash} contains an invalid graph edge.`);
        }
    }
}

if (/[–—]/.test(JSON.stringify(sourceControlData))) {
    fail('The Source Control story must use plain punctuation.');
}

for (const requiredText of [
    'window.SourceControlView',
    'scm-commit-composer',
    'scm-graph-toolbar',
    'scm-graph-svg',
    'scm-commit-tooltip',
    'role',
    'separator',
]) {
    if (!sourceControlScript.includes(requiredText)) {
        fail(`The Source Control script is missing ${requiredText}.`);
    }
}

for (const requiredSelector of [
    '.source-control-view',
    '.scm-commit-composer',
    '.scm-graph-toolbar',
    '.scm-graph-svg',
    '.scm-commit-row',
    '.scm-detail-viewer',
    '.scm-detail-file',
]) {
    if (!styleCss.includes(requiredSelector)) {
        fail(`The site stylesheet is missing ${requiredSelector}.`);
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

if (!readme.includes('Software Engineer at Capisoft')
    || !readme.includes('[Explore the life repository](life/README.md)')) {
    fail('README.md must identify the current role and link to the life repository.');
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

if (!/href="page-data\/style\.css\?v=[^"]+"/.test(indexHtml)) {
    fail('The local stylesheet URL must include a cache version.');
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

const extensionViewerStyles = cssRuleBody('.extension-viewer');

if (!extensionViewerStyles.includes('container-name: extension-content;')
    || !extensionViewerStyles.includes('container-type: inline-size;')) {
    fail('The extension view must provide a responsive content container.');
}

if (!/@container extension-content \(max-width: 860px\)[\s\S]*?\.extension-detail-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s.test(styleCss)) {
    fail('The extension details must stack when the editor workspace is narrow.');
}

if (!styleCss.includes('@container extension-content (max-width: 760px)')) {
    fail('The compact extension header rule is missing.');
}

if (!styleCss.includes('100dvh')) {
    fail('The stable viewport height rule is missing.');
}

for (const requiredSelector of [
    '.extension-list-item',
    '.extension-viewer',
    '.extension-detail-layout',
    '.extension-documents',
]) {
    if (!styleCss.includes(requiredSelector)) {
        fail(`The extension view is missing ${requiredSelector}.`);
    }
}

console.log(`Validated ${manifest.files.length} root source files.`);
