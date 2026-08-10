const SAFE_EXTERNAL_SCHEMES = new Set(['https:', 'mailto:']);

const readDestination = (value) => {
    const trimmedStart = value.search(/\S/);
    if (trimmedStart === -1) return null;

    const remainder = value.slice(trimmedStart);

    if (remainder.startsWith('<')) {
        const closingBracket = remainder.indexOf('>');
        if (closingBracket <= 1) return null;

        return {
            target: remainder.slice(1, closingBracket),
            offset: trimmedStart + 1,
        };
    }

    const target = remainder.match(/^\S+/)?.[0];
    if (!target) return null;

    return { target, offset: trimmedStart };
};

export const findMarkdownLinks = (markdown) => {
    const links = [];
    let inFence = false;

    markdown.split('\n').forEach((line, lineIndex) => {
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            return;
        }

        if (inFence) return;

        const pattern = /\[[^\]\n]+\]\(([^)\n]+)\)/g;

        for (const match of line.matchAll(pattern)) {
            if (match.index > 0 && line[match.index - 1] === '!') continue;

            const destination = readDestination(match[1]);
            if (!destination) continue;

            const valueOffset = match[0].indexOf(match[1]);
            const startColumn = match.index + valueOffset + destination.offset + 1;

            links.push({
                target: destination.target,
                lineNumber: lineIndex + 1,
                startColumn,
                endColumn: startColumn + destination.target.length,
            });
        }
    });

    return links;
};

const normalizeWorkspacePath = (value) => {
    const segments = [];

    for (const segment of value.split('/')) {
        if (!segment || segment === '.') continue;

        if (segment === '..') {
            if (segments.length === 0) return null;
            segments.pop();
            continue;
        }

        segments.push(segment);
    }

    return segments.join('/');
};

export const resolveMarkdownTarget = (sourcePath, rawTarget) => {
    const target = rawTarget.trim();
    if (!target) return null;

    const scheme = target.match(/^([a-z][a-z\d+.-]*:)/i)?.[1]?.toLowerCase();

    if (scheme) {
        if (!SAFE_EXTERNAL_SCHEMES.has(scheme)) return null;
        return { kind: 'external', href: target };
    }

    const [targetWithoutFragment] = target.split('#', 1);
    const [targetPath] = targetWithoutFragment.split('?', 1);
    let decodedTarget;

    try {
        decodedTarget = decodeURIComponent(targetPath);
    } catch {
        return null;
    }

    if (!decodedTarget) {
        return { kind: 'internal', path: sourcePath };
    }

    const sourceDirectory = sourcePath.includes('/')
        ? sourcePath.slice(0, sourcePath.lastIndexOf('/'))
        : '';
    const workspacePath = decodedTarget.startsWith('/')
        ? decodedTarget.slice(1)
        : [sourceDirectory, decodedTarget].filter(Boolean).join('/');
    const path = normalizeWorkspacePath(workspacePath);

    if (!path) return null;
    return { kind: 'internal', path };
};
