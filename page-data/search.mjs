const normalizeText = (value) => String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();

export const parseSearchQuery = (value) => {
    const query = String(value ?? '').trim().replace(/\s+/g, ' ');

    return {
        query,
        normalizedQuery: normalizeText(query),
        terms: normalizeText(query).split(' ').filter(Boolean),
    };
};

export const isMarkdownPath = (filePath) => {
    return String(filePath ?? '').toLocaleLowerCase().endsWith('.md');
};

export const isSearchableEntry = (entry) => {
    return entry.kind === 'text' && !entry.generated;
};

export const createSearchDocument = (node, content) => {
    const text = String(content ?? '').replace(/\r\n?/g, '\n');

    return {
        node,
        path: node.path,
        normalizedPath: normalizeText(node.path),
        lines: text.split('\n').map((line, index) => ({
            line,
            lineNumber: index + 1,
            normalizedLine: normalizeText(line),
        })),
    };
};

const createSnippet = (line, matchIndex, matchLength, maximumLength = 150) => {
    const trimmedStart = line.length - line.trimStart().length;
    const text = line.trim();
    const index = Math.max(0, matchIndex - trimmedStart);

    if (text.length <= maximumLength) {
        return text;
    }

    const contextLength = Math.max(24, Math.floor((maximumLength - matchLength) / 2));
    let start = Math.max(0, index - contextLength);
    let end = Math.min(text.length, index + matchLength + contextLength);

    if (start > 0) {
        const nextSpace = text.indexOf(' ', start);
        start = nextSpace === -1 ? start : nextSpace + 1;
    }

    if (end < text.length) {
        const previousSpace = text.lastIndexOf(' ', end);
        end = previousSpace <= start ? end : previousSpace;
    }

    return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
};

const createLineMatch = (lineRecord, queryDetails) => {
    if (!lineRecord.normalizedLine || queryDetails.terms.length === 0) {
        return null;
    }

    const termIndexes = queryDetails.terms.map((term) => {
        return lineRecord.normalizedLine.indexOf(term);
    });

    if (termIndexes.some((index) => index === -1)) {
        return null;
    }

    const phraseIndex = lineRecord.normalizedLine.indexOf(queryDetails.normalizedQuery);
    const matchIndex = phraseIndex >= 0 ? phraseIndex : Math.min(...termIndexes);
    const matchLength = phraseIndex >= 0
        ? queryDetails.normalizedQuery.length
        : queryDetails.terms[termIndexes.indexOf(matchIndex)].length;
    const trimmedLine = lineRecord.line.trimStart();
    const headingBonus = /^#{1,6}\s/.test(trimmedLine) ? 20 : 0;
    const phraseBonus = phraseIndex >= 0 ? 100 : 50;
    const startBonus = matchIndex === 0 ? 10 : 0;

    return {
        lineNumber: lineRecord.lineNumber,
        column: matchIndex + 1,
        matchLength: Math.max(1, matchLength),
        snippet: createSnippet(lineRecord.line, matchIndex, matchLength),
        score: phraseBonus + headingBonus + startBonus,
    };
};

export const searchDocuments = (
    documents,
    rawQuery,
    options = {},
) => {
    const queryDetails = parseSearchQuery(rawQuery);
    const maximumFiles = options.maximumFiles ?? 40;
    const maximumMatchesPerFile = options.maximumMatchesPerFile ?? 20;

    if (!queryDetails.query) {
        return {
            ...queryDetails,
            groups: [],
            totalFiles: 0,
            totalMatches: 0,
        };
    }

    const groups = [];

    documents.forEach((document) => {
        if (!isMarkdownPath(document.path)) {
            return;
        }

        const matches = document.lines
            .map((lineRecord) => createLineMatch(lineRecord, queryDetails))
            .filter(Boolean);
        const pathMatches = queryDetails.terms.every((term) => {
            return document.normalizedPath.includes(term);
        });

        if (matches.length === 0 && !pathMatches) {
            return;
        }

        if (matches.length === 0) {
            matches.push({
                lineNumber: 1,
                column: 1,
                matchLength: 1,
                snippet: document.path,
                score: 40,
                pathOnly: true,
            });
        }

        groups.push({
            node: document.node,
            path: document.path,
            matchCount: matches.length,
            matches: matches.slice(0, maximumMatchesPerFile),
            score: Math.max(...matches.map((match) => match.score))
                + (pathMatches ? 15 : 0),
        });
    });

    groups.sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        return left.path.localeCompare(right.path);
    });

    const visibleGroups = groups.slice(0, maximumFiles);

    return {
        ...queryDetails,
        groups: visibleGroups,
        totalFiles: groups.length,
        totalMatches: groups.reduce((sum, group) => sum + group.matchCount, 0),
    };
};
