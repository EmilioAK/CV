import assert from 'node:assert/strict';

import {
    createSearchDocument,
    isCareerPath,
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
        textEntry('CV/about.md'),
        '# Résumé\nSecurity-minded engineering and cloud architecture.'
    ),
    createSearchDocument(
        textEntry('index.html'),
        '<title>Cloud source browser</title>\nconst teachingMode = false;'
    ),
];

assert.equal(isCareerPath('README.md'), true);
assert.equal(isCareerPath('CV/about.md'), true);
assert.equal(isCareerPath('page-data/style.css'), false);
assert.equal(isSearchableEntry(textEntry('README.md')), true);
assert.equal(isSearchableEntry({ path: 'resume.pdf', kind: 'binary' }), false);
assert.equal(isSearchableEntry({ path: 'manifest.json', kind: 'text', generated: true }), false);

assert.deepEqual(parseSearchQuery('  Cloud   Architect  ').terms, ['cloud', 'architect']);

const cvResult = searchDocuments(documents, 'cloud');
assert.equal(cvResult.totalFiles, 2);
assert.equal(cvResult.totalMatches, 2);
assert.deepEqual(cvResult.groups.map((group) => group.path), [
    'README.md',
    'CV/about.md',
]);
assert.equal(cvResult.groups[0].matches[0].lineNumber, 2);

const careerOnlyResult = searchDocuments(documents, 'teaching');
assert.equal(careerOnlyResult.totalFiles, 1);
assert.deepEqual(careerOnlyResult.groups.map((group) => group.path), ['README.md']);

const accentResult = searchDocuments(documents, 'resume');
assert.equal(accentResult.groups[0].path, 'CV/about.md');
assert.equal(accentResult.groups[0].matches[0].lineNumber, 1);

const phraseResult = searchDocuments(documents, 'cloud architecture');
assert.equal(phraseResult.totalFiles, 1);
assert.equal(phraseResult.groups[0].path, 'CV/about.md');

const emptyResult = searchDocuments(documents, 'database');
assert.equal(emptyResult.totalFiles, 0);
assert.equal(emptyResult.totalMatches, 0);

console.log('Validated CV search ranking and file boundaries.');
