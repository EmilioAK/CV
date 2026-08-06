import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const manifestRelativePath = 'page-data/file-manifest.json';
const manifestPath = path.join(repositoryRoot, manifestRelativePath);
const sourceBranch = process.env.SITE_SOURCE_BRANCH || 'main';

const mediaTypes = new Map([
    ['.css', 'text/css'],
    ['.csv', 'text/csv'],
    ['.gif', 'image/gif'],
    ['.html', 'text/html'],
    ['.ico', 'image/x-icon'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.js', 'text/javascript'],
    ['.json', 'application/json'],
    ['.md', 'text/markdown'],
    ['.mjs', 'text/javascript'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.txt', 'text/plain'],
    ['.webp', 'image/webp'],
    ['.xml', 'text/xml'],
    ['.yaml', 'text/yaml'],
    ['.yml', 'text/yaml'],
]);

const languages = new Map([
    ['.css', 'css'],
    ['.csv', 'plaintext'],
    ['.html', 'html'],
    ['.ini', 'ini'],
    ['.js', 'javascript'],
    ['.json', 'json'],
    ['.jsx', 'javascript'],
    ['.md', 'markdown'],
    ['.mjs', 'javascript'],
    ['.py', 'python'],
    ['.rb', 'ruby'],
    ['.sh', 'shell'],
    ['.toml', 'ini'],
    ['.ts', 'typescript'],
    ['.tsx', 'typescript'],
    ['.txt', 'plaintext'],
    ['.xml', 'xml'],
    ['.yaml', 'yaml'],
    ['.yml', 'yaml'],
    ['.zsh', 'shell'],
]);

const textExtensions = new Set([
    '.css',
    '.csv',
    '.html',
    '.ini',
    '.js',
    '.json',
    '.jsx',
    '.md',
    '.mjs',
    '.py',
    '.rb',
    '.sh',
    '.toml',
    '.ts',
    '.tsx',
    '.txt',
    '.xml',
    '.yaml',
    '.yml',
    '.zsh',
]);

const imageExtensions = new Set([
    '.gif',
    '.ico',
    '.jpeg',
    '.jpg',
    '.png',
    '.svg',
    '.webp',
]);

const textFileNames = new Set([
    '.editorconfig',
    '.gitignore',
    '.nojekyll',
    'cname',
    'license',
]);

const runGit = (...args) => execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
}).trim();

const getRepositoryName = () => {
    if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;

    const remoteUrl = runGit('remote', 'get-url', 'origin').replace(/\/$/, '');
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+)$/);

    if (!match) {
        throw new Error('The origin remote is not a GitHub repository.');
    }

    return `${match[1]}/${match[2].replace(/\.git$/, '')}`;
};

const encodePath = (relativePath) => relativePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

const getSourceFiles = () => runGit(
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

const getFileEntry = async (relativePath, repositoryName) => {
    const bytes = await readFile(path.join(repositoryRoot, relativePath));
    const extension = path.extname(relativePath).toLowerCase();
    const lowerName = path.basename(relativePath).toLowerCase();
    const isText = textExtensions.has(extension) || textFileNames.has(lowerName);
    const kind = imageExtensions.has(extension)
        ? 'image'
        : isText
            ? 'text'
            : 'binary';
    const sourceUrl = encodePath(relativePath);

    return {
        path: relativePath,
        sourceUrl,
        rawUrl: `https://raw.githubusercontent.com/${repositoryName}/${sourceBranch}/${sourceUrl}`,
        kind,
        mediaType: mediaTypes.get(extension) || (kind === 'text' ? 'text/plain' : 'application/octet-stream'),
        language: languages.get(extension) || 'plaintext',
        size: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
    };
};

export const generateManifest = async () => {
    const repositoryName = getRepositoryName();
    const sourceFiles = getSourceFiles().filter((relativePath) => {
        return relativePath !== manifestRelativePath;
    });
    const entries = [];

    for (const relativePath of sourceFiles) {
        entries.push(await getFileEntry(relativePath, repositoryName));
    }

    const manifestSourceUrl = encodePath(manifestRelativePath);
    entries.push({
        path: manifestRelativePath,
        sourceUrl: manifestSourceUrl,
        rawUrl: `https://raw.githubusercontent.com/${repositoryName}/${sourceBranch}/${manifestSourceUrl}`,
        kind: 'text',
        mediaType: 'application/json',
        language: 'json',
        generated: true,
    });
    entries.sort((left, right) => left.path.localeCompare(right.path));

    const manifest = {
        schemaVersion: 2,
        repository: repositoryName,
        branch: sourceBranch,
        files: entries,
    };

    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    return manifest;
};

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
    const manifest = await generateManifest();
    console.log(`Generated a root manifest for ${manifest.files.length} source files.`);
}
