import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    findMarkdownLinks,
    resolveMarkdownTarget,
} from '../page-data/markdown-links.mjs';

const markdown = [
    '# Links',
    '',
    '- [Profile](CV/README.md)',
    '- [Current role](<CV/work/capisoft.md> "Capisoft")',
    '- ![Preview](preview.png)',
    '```md',
    '[Example only](ignored.md)',
    '```',
].join('\n');

assert.deepEqual(findMarkdownLinks(markdown), [
    {
        target: 'CV/README.md',
        lineNumber: 3,
        startColumn: 13,
        endColumn: 25,
    },
    {
        target: 'CV/work/capisoft.md',
        lineNumber: 4,
        startColumn: 19,
        endColumn: 38,
    },
]);

assert.deepEqual(
    resolveMarkdownTarget('CV/README.md', 'origin/first-program.md'),
    { kind: 'internal', path: 'CV/origin/first-program.md' },
);
assert.deepEqual(
    resolveMarkdownTarget(
        'CV/work/capisoft.md',
        'accounting-integrations.md',
    ),
    { kind: 'internal', path: 'CV/work/accounting-integrations.md' },
);
assert.deepEqual(
    resolveMarkdownTarget('README.md', '/CV/Emilio_Alvarez_Resume.pdf'),
    { kind: 'internal', path: 'CV/Emilio_Alvarez_Resume.pdf' },
);
assert.deepEqual(
    resolveMarkdownTarget('README.md', 'https://example.com/profile'),
    { kind: 'external', href: 'https://example.com/profile' },
);
assert.deepEqual(
    resolveMarkdownTarget('README.md', 'mailto:me@example.com'),
    { kind: 'external', href: 'mailto:me@example.com' },
);
assert.deepEqual(
    resolveMarkdownTarget('CV/README.md', '#the-thread'),
    { kind: 'internal', path: 'CV/README.md' },
);
assert.equal(resolveMarkdownTarget('README.md', '../outside.md'), null);
assert.equal(resolveMarkdownTarget('README.md', 'javascript:alert(1)'), null);
assert.equal(resolveMarkdownTarget('README.md', 'broken%path.md'), null);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const sourcePaths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repositoryRoot, encoding: 'utf8' },
)
    .split('\0')
    .filter(Boolean)
    .filter((sourcePath) => existsSync(path.join(repositoryRoot, sourcePath)));
const availablePaths = new Set(sourcePaths);
const markdownPaths = sourcePaths.filter((sourcePath) => sourcePath.endsWith('.md'));

for (const sourcePath of markdownPaths) {
    const source = await readFile(path.join(repositoryRoot, sourcePath), 'utf8');

    for (const link of findMarkdownLinks(source)) {
        const target = resolveMarkdownTarget(sourcePath, link.target);
        assert.ok(target, `${sourcePath} contains an unsupported link to ${link.target}.`);

        if (target.kind === 'internal') {
            assert.ok(
                availablePaths.has(target.path),
                `${sourcePath} links to missing workspace file ${target.path}.`,
            );
        }
    }
}

console.log(`Validated Markdown navigation across ${markdownPaths.length} source files.`);
