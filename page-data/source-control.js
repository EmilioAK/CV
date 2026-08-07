(() => {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const graphRowHeight = 28;

    const createElement = (tagName, className, text) => {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    };

    const createIcon = (name, className = '') => {
        const icon = createElement('i', `codicon codicon-${name} ${className}`.trim());
        icon.setAttribute('aria-hidden', 'true');
        return icon;
    };

    const getPathParts = (filePath) => {
        const parts = filePath.split('/');
        return {
            name: parts.pop() || filePath,
            directory: parts.join('/'),
        };
    };

    const getChangeStats = (files) => files.reduce((stats, file) => {
        const beforeLines = (file.before || '').split('\n').filter(Boolean);
        const afterLines = (file.after || '').split('\n').filter(Boolean);

        stats.files += 1;
        stats.insertions += afterLines.filter((line) => !beforeLines.includes(line)).length;
        stats.deletions += beforeLines.filter((line) => !afterLines.includes(line)).length;
        return stats;
    }, { files: 0, insertions: 0, deletions: 0 });

    const validateData = (data) => {
        if (data?.schemaVersion !== 1) {
            throw new Error('The Source Control data schema is not valid.');
        }

        for (const key of ['lanes', 'staged', 'changes', 'commits']) {
            if (!Array.isArray(data[key])) {
                throw new Error(`The Source Control data is missing ${key}.`);
            }
        }

        const laneIds = new Set(data.lanes.map((lane) => lane.id));
        const commitHashes = new Set();

        data.commits.forEach((commit) => {
            if (!laneIds.has(commit.lane)) {
                throw new Error(`Commit ${commit.hash} uses an unknown graph lane.`);
            }
            if (commitHashes.has(commit.hash)) {
                throw new Error(`Commit hash ${commit.hash} is duplicated.`);
            }
            commitHashes.add(commit.hash);
        });
    };

    const renderGraphSvg = (commits, lanes) => {
        const laneMap = new Map(lanes.map((lane, index) => [lane.id, {
            ...lane,
            x: 10 + (index * 14),
        }]));
        const height = commits.length * graphRowHeight;
        const svg = document.createElementNS(svgNamespace, 'svg');
        svg.classList.add('scm-graph-svg');
        svg.setAttribute('viewBox', `0 0 68 ${height}`);
        svg.setAttribute('width', '68');
        svg.setAttribute('height', String(height));
        svg.setAttribute('aria-hidden', 'true');

        commits.forEach((commit, index) => {
            if (index >= commits.length - 1) return;

            const startY = (index * graphRowHeight) + (graphRowHeight / 2);
            const endY = startY + graphRowHeight;

            commit.edges.forEach((edge) => {
                const fromLane = laneMap.get(edge.from);
                const toLane = laneMap.get(edge.to);
                if (!fromLane || !toLane) return;

                const path = document.createElementNS(svgNamespace, 'path');
                const colorLane = edge.from === 'main' ? toLane : fromLane;
                const middleY = startY + (graphRowHeight / 2);
                const pathData = fromLane.x === toLane.x
                    ? `M ${fromLane.x} ${startY} L ${toLane.x} ${endY}`
                    : `M ${fromLane.x} ${startY} C ${fromLane.x} ${middleY}, ${toLane.x} ${middleY}, ${toLane.x} ${endY}`;

                path.setAttribute('d', pathData);
                path.setAttribute('stroke', colorLane.color);
                path.setAttribute('class', 'scm-graph-edge');
                svg.appendChild(path);
            });
        });

        commits.forEach((commit, index) => {
            const lane = laneMap.get(commit.lane);
            if (!lane) return;

            const node = document.createElementNS(svgNamespace, 'circle');
            node.setAttribute('cx', String(lane.x));
            node.setAttribute('cy', String((index * graphRowHeight) + (graphRowHeight / 2)));
            node.setAttribute('r', commit.kind === 'merge' ? '4.5' : '3.8');
            node.setAttribute('stroke', lane.color);
            node.setAttribute('fill', commit.kind === 'merge' ? '#181818' : lane.color);
            node.setAttribute('class', `scm-graph-node ${commit.kind === 'merge' ? 'merge' : ''}`.trim());
            node.dataset.hash = commit.hash;
            svg.appendChild(node);
        });

        return svg;
    };

    const createTooltip = () => {
        const tooltip = createElement('div', 'scm-commit-tooltip');
        tooltip.id = 'scm-commit-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.hidden = true;
        document.body.appendChild(tooltip);
        return tooltip;
    };

    const populateTooltip = (tooltip, commit) => {
        const stats = getChangeStats(commit.files);
        const authorLine = createElement('div', 'scm-tooltip-author');
        const author = createElement('strong', '', commit.author);
        const date = createElement('span', '', commit.date);
        const message = createElement('div', 'scm-tooltip-message', commit.message);
        const statsLine = createElement('div', 'scm-tooltip-stats');
        const hashLine = createElement('div', 'scm-tooltip-hash');

        authorLine.append(createIcon('account'), author, date);
        statsLine.append(
            createElement('span', '', `${stats.files} ${stats.files === 1 ? 'file' : 'files'} changed`),
            createElement('span', 'insertions', `${stats.insertions} insertion${stats.insertions === 1 ? '' : 's'}(+)`),
            createElement('span', 'deletions', `${stats.deletions} deletion${stats.deletions === 1 ? '' : 's'}(-)`)
        );
        hashLine.append(createIcon('git-commit'), createElement('span', '', commit.hash));
        tooltip.replaceChildren(authorLine, message, statsLine, hashLine);
    };

    const positionTooltip = (tooltip, row, sidebar) => {
        const rowRect = row.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();
        const gap = 8;
        const left = Math.min(sidebarRect.right + gap, window.innerWidth - 332);

        tooltip.style.left = `${Math.max(8, left)}px`;
        tooltip.style.top = `${Math.max(8, Math.min(rowRect.top, window.innerHeight - tooltip.offsetHeight - 8))}px`;
    };

    const create = async ({
        container,
        dataUrl,
        onOpenChange,
        onOpenCommit,
        onCountChange,
    }) => {
        if (!container) throw new Error('The Source Control container is missing.');

        const loading = createElement('div', 'scm-loading');
        loading.append(
            createElement('span', 'tree-skeleton tree-skeleton-wide'),
            createElement('span', 'tree-skeleton'),
            createElement('span', 'tree-skeleton tree-skeleton-short')
        );
        container.replaceChildren(loading);

        const response = await fetch(dataUrl, { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`The Source Control data returned status ${response.status}.`);
        }

        const data = await response.json();
        validateData(data);

        const itemButtons = new Map();
        let selectedKey = null;
        const tooltip = createTooltip();
        const sidebar = container.closest('.sidebar');

        const select = (key) => {
            if (selectedKey && itemButtons.has(selectedKey)) {
                const previous = itemButtons.get(selectedKey);
                previous.classList.remove('selected');
                previous.setAttribute('aria-selected', 'false');
            }

            selectedKey = key;
            const next = itemButtons.get(key);
            if (next) {
                next.classList.add('selected');
                next.setAttribute('aria-selected', 'true');
            }

            container.querySelectorAll('.scm-graph-node').forEach((node) => {
                node.classList.toggle('selected', key === `commit:${node.dataset.hash}`);
            });
        };

        const createGroup = (label, items, staged) => {
            const section = createElement('section', 'scm-group');
            const header = createElement('button', 'scm-group-header');
            const chevron = createIcon('chevron-down');
            const title = createElement('span', 'scm-group-title', label);
            const count = createElement('span', 'scm-count', String(items.length));
            const list = createElement('div', 'scm-file-list');
            let open = true;

            header.type = 'button';
            header.setAttribute('aria-expanded', 'true');
            header.append(chevron, title, count);
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', label);

            items.forEach((item) => {
                const key = `change:${item.id}`;
                const parts = getPathParts(item.path);
                const row = createElement('button', 'scm-file-row scm-navigable');
                const statusIconName = item.status === 'A'
                    ? 'diff-added'
                    : item.status === 'D'
                        ? 'diff-removed'
                        : 'diff-modified';

                row.type = 'button';
                row.dataset.scmKey = key;
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', 'false');
                row.setAttribute('aria-label', `${parts.name}, ${item.summary}`);
                row.title = item.summary;
                row.append(
                    createIcon(statusIconName, `scm-change-icon ${staged ? 'staged' : ''}`),
                    createElement('span', 'scm-file-name', parts.name),
                    createElement('span', 'scm-file-directory', parts.directory),
                    createElement('span', `scm-status status-${item.status.toLowerCase()}`, item.status)
                );
                row.addEventListener('click', () => {
                    select(key);
                    onOpenChange(item, { staged });
                });
                itemButtons.set(key, row);
                list.appendChild(row);
            });

            header.addEventListener('click', () => {
                open = !open;
                header.setAttribute('aria-expanded', String(open));
                chevron.classList.toggle('codicon-chevron-down', open);
                chevron.classList.toggle('codicon-chevron-right', !open);
                list.hidden = !open;
            });

            section.append(header, list);
            return section;
        };

        const changesPane = createElement('div', 'scm-changes-pane');
        const repositoryHeader = createElement('div', 'scm-repository-header');
        const repositoryName = createElement('strong', '', 'CHANGES');
        const repositoryMeta = createElement('span', '', data.repository);
        repositoryHeader.append(repositoryName, repositoryMeta);
        changesPane.append(
            repositoryHeader,
            createGroup('Staged Changes', data.staged, true),
            createGroup('Changes', data.changes, false)
        );

        const graphPane = createElement('section', 'scm-graph-pane');
        const graphHeader = createElement('div', 'scm-graph-header');
        const graphTitle = createElement('strong', '', 'GRAPH');
        const branch = createElement('span', 'scm-current-branch');
        const graphList = createElement('div', 'scm-graph-list');
        const graphRows = createElement('div', 'scm-graph-rows');
        branch.append(createIcon('git-branch'), createElement('span', '', data.branch));
        graphHeader.append(graphTitle, branch);
        graphList.setAttribute('role', 'listbox');
        graphList.setAttribute('aria-label', 'Life story commit graph');
        graphList.append(renderGraphSvg(data.commits, data.lanes), graphRows);

        const hideTooltip = () => {
            tooltip.hidden = true;
        };

        data.commits.forEach((commit) => {
            const key = `commit:${commit.hash}`;
            const row = createElement('button', 'scm-commit-row scm-navigable');
            const message = createElement('span', 'scm-commit-message', commit.message);
            const date = createElement('span', 'scm-commit-date', commit.date);

            row.type = 'button';
            row.dataset.scmKey = key;
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', 'false');
            row.setAttribute('aria-describedby', tooltip.id);
            row.setAttribute('aria-label', `${commit.message}, ${commit.date}`);
            row.append(message, date);

            if (commit.branch) {
                const branchLabel = createElement('span', 'scm-branch-label');
                branchLabel.append(createIcon('git-branch'), createElement('span', '', commit.branch));
                row.appendChild(branchLabel);
            }

            const showTooltip = () => {
                if (window.innerWidth <= 767) return;
                populateTooltip(tooltip, commit);
                tooltip.hidden = false;
                positionTooltip(tooltip, row, sidebar);
            };

            row.addEventListener('mouseenter', showTooltip);
            row.addEventListener('mouseleave', hideTooltip);
            row.addEventListener('focus', showTooltip);
            row.addEventListener('blur', hideTooltip);
            row.addEventListener('click', () => {
                select(key);
                hideTooltip();
                onOpenCommit(commit);
            });
            itemButtons.set(key, row);
            graphRows.appendChild(row);
        });

        graphList.addEventListener('scroll', hideTooltip, { passive: true });
        graphPane.append(graphHeader, graphList);

        const resizer = createElement('div', 'scm-resizer');
        resizer.tabIndex = 0;
        resizer.setAttribute('role', 'separator');
        resizer.setAttribute('aria-label', 'Resize changes and graph');
        resizer.setAttribute('aria-orientation', 'horizontal');
        resizer.setAttribute('aria-valuemin', '120');

        const setChangesHeight = (height) => {
            const minimum = 120;
            const maximum = Math.max(minimum, container.clientHeight - 170);
            const nextHeight = Math.max(minimum, Math.min(maximum, height));
            container.style.setProperty('--scm-changes-height', `${nextHeight}px`);
            resizer.setAttribute('aria-valuemax', String(maximum));
            resizer.setAttribute('aria-valuenow', String(Math.round(nextHeight)));
        };

        resizer.addEventListener('pointerdown', (event) => {
            resizer.setPointerCapture(event.pointerId);
            resizer.classList.add('dragging');
        });
        resizer.addEventListener('pointermove', (event) => {
            if (!resizer.hasPointerCapture(event.pointerId)) return;
            const bounds = container.getBoundingClientRect();
            setChangesHeight(event.clientY - bounds.top);
        });
        const stopResize = (event) => {
            if (resizer.hasPointerCapture(event.pointerId)) {
                resizer.releasePointerCapture(event.pointerId);
            }
            resizer.classList.remove('dragging');
        };
        resizer.addEventListener('pointerup', stopResize);
        resizer.addEventListener('pointercancel', stopResize);
        resizer.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            const current = Number.parseInt(resizer.getAttribute('aria-valuenow') || '220', 10);
            event.preventDefault();
            setChangesHeight(current + (event.key === 'ArrowDown' ? 20 : -20));
        });

        container.addEventListener('keydown', (event) => {
            const current = event.target.closest('.scm-navigable');
            if (!current) return;

            const items = Array.from(container.querySelectorAll('.scm-navigable'))
                .filter((item) => item.offsetParent !== null);
            const currentIndex = items.indexOf(current);
            let next = null;

            if (event.key === 'ArrowDown') {
                next = items[Math.min(currentIndex + 1, items.length - 1)];
            } else if (event.key === 'ArrowUp') {
                next = items[Math.max(currentIndex - 1, 0)];
            } else if (event.key === 'Home') {
                next = items[0];
            } else if (event.key === 'End') {
                next = items[items.length - 1];
            } else {
                return;
            }

            event.preventDefault();
            next?.focus();
        });

        container.replaceChildren(changesPane, resizer, graphPane);
        resizer.setAttribute('aria-valuemax', '500');
        resizer.setAttribute('aria-valuenow', '250');
        onCountChange(data.staged.length + data.changes.length);

        return {
            data,
            select,
            hideTooltip,
        };
    };

    window.SourceControlView = { create };
})();
