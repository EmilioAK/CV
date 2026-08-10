import assert from 'node:assert/strict';

import {
    createSearchDocument,
    isMarkdownPath,
    isSearchableEntry,
    parseSearchQuery,
    searchDocuments,
} from '../page-data/search.mjs';

const textEntry = (path) => ({
    path,
    kind: 'text',
    generated: false,
});

const documents = [
    createSearchDocument(
        textEntry('README.md'),
        '# Emilio Alvarez\nCloud Solution Architect Intern at Microsoft.\nTeaching systems and web technology.'
    ),
    createSearchDocument(
        textEntry('CV/README.md'),
        '# Résumé\nSecurity-minded engineering and cloud architecture.'
    ),
    createSearchDocument(
        textEntry('CV/work/microsoft.md'),
        '# Cloud Architecture at Microsoft\nProduction delivery for Microsoft 365.'
    ),
    createSearchDocument(
        textEntry('CV/university/teaching.md'),
        '# Teaching Computer Science\nTeaching systems and web technology.'
    ),
    createSearchDocument(
        textEntry('index.html'),
        '<title>Cloud source browser</title>\nconst teachingMode = false;'
    ),
];

assert.equal(isMarkdownPath('README.md'), true);
assert.equal(isMarkdownPath('CV/README.md'), true);
assert.equal(isMarkdownPath('CV/work/microsoft.md'), true);
assert.equal(isMarkdownPath('NOTES.MD'), true);
assert.equal(isMarkdownPath('page-data/style.css'), false);
assert.equal(isSearchableEntry(textEntry('README.md')), true);
assert.equal(isSearchableEntry({ path: 'resume.pdf', kind: 'binary' }), false);
assert.equal(isSearchableEntry({ path: 'manifest.json', kind: 'text', generated: true }), false);

assert.deepEqual(parseSearchQuery('  Cloud   Architect  ').terms, ['cloud', 'architect']);

const cvResult = searchDocuments(documents, 'cloud');
assert.equal(cvResult.totalFiles, 3);
assert.equal(cvResult.totalMatches, 3);
assert.deepEqual(cvResult.groups.map((group) => group.path), [
    'CV/work/microsoft.md',
    'README.md',
    'CV/README.md',
]);
assert.equal(cvResult.groups[0].matches[0].lineNumber, 1);

const markdownResult = searchDocuments(documents, 'teaching');
assert.equal(markdownResult.totalFiles, 2);
assert.deepEqual(markdownResult.groups.map((group) => group.path), [
    'CV/university/teaching.md',
    'README.md',
]);

const accentResult = searchDocuments(documents, 'resume');
assert.equal(accentResult.groups[0].path, 'CV/README.md');
assert.equal(accentResult.groups[0].matches[0].lineNumber, 1);

const phraseResult = searchDocuments(documents, 'cloud architecture');
assert.equal(phraseResult.totalFiles, 2);
assert.deepEqual(phraseResult.groups.map((group) => group.path), [
    'CV/work/microsoft.md',
    'CV/README.md',
]);

const emptyResult = searchDocuments(documents, 'database');
assert.equal(emptyResult.totalFiles, 0);
assert.equal(emptyResult.totalMatches, 0);

console.log('Validated Markdown search ranking and file boundaries.');
