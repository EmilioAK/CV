(() => {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const graphRowHeight = 22;
    const graphLaneStart = 10;
    const graphLaneGap = 11;
    const graphWidth = 44;

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
            if (!Array.isArray(commit.files) || !Array.isArray(commit.edges)) {
                throw new Error(`Commit ${commit.hash} is missing graph data.`);
            }
            if (!Number.isInteger(commit.graphColumns) || commit.graphColumns < 1) {
                throw new Error(`Commit ${commit.hash} is missing its graph width.`);
            }
            commitHashes.add(commit.hash);
        });
    };

    const renderGraphSvg = (commits, lanes) => {
        const laneMap = new Map(lanes.map((lane, index) => [lane.id, {
            ...lane,
            x: graphLaneStart + ((lane.column ?? index) * graphLaneGap),
        }]));
        const height = commits.length * graphRowHeight;
        const svg = document.createElementNS(svgNamespace, 'svg');
        svg.classList.add('scm-graph-svg');
        svg.setAttribute('viewBox', `0 0 ${graphWidth} ${height}`);
        svg.setAttribute('width', String(graphWidth));
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
            node.setAttribute('r', commit.kind === 'merge' ? '3.75' : '3.25');
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

    const createToolbarButton = (iconName, label, disabled = false) => {
        const button = createElement('button', 'scm-graph-action');
        button.type = 'button';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.disabled = disabled;
        button.appendChild(createIcon(iconName));
        return button;
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
        const collapseSections = [];
        const tooltip = createTooltip();
        const sidebar = container.closest('.sidebar');
        let selectedKey = null;
        let resizeObserver = null;
        let userResized = false;

        if (!sidebar) throw new Error('The Source Control sidebar is missing.');

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

            const setOpen = (nextOpen) => {
                open = nextOpen;
                header.setAttribute('aria-expanded', String(open));
                chevron.classList.toggle('codicon-chevron-down', open);
                chevron.classList.toggle('codicon-chevron-right', !open);
                list.hidden = !open;
            };

            header.type = 'button';
            header.append(chevron, title, count);
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', label);

            items.forEach((item) => {
                const key = `change:${item.id}`;
                const parts = getPathParts(item.path);
                const row = createElement('button', 'scm-file-row scm-navigable');

                row.type = 'button';
                row.dataset.scmKey = key;
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', 'false');
                row.setAttribute('aria-label', `${parts.name}, ${item.summary}`);
                row.title = item.summary;
                row.classList.toggle('deleted', item.status === 'D');
                row.append(
                    createIcon('arrow-down', `scm-change-icon ${staged ? 'staged' : ''}`),
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

            header.addEventListener('click', () => setOpen(!open));
            collapseSections.push(() => setOpen(false));
            setOpen(true);
            section.append(header, list);
            return section;
        };

        const createCommitComposer = () => {
            const form = createElement('form', 'scm-commit-composer');
            const inputWrap = createElement('div', 'scm-commit-input-wrap');
            const input = createElement('input', 'scm-commit-input');
            const actions = createElement('div', 'scm-commit-actions');
            const primary = createElement('button', 'scm-commit-primary');
            const menuToggle = createElement('button', 'scm-commit-menu-toggle');
            const menu = createElement('div', 'scm-commit-options');
            let menuOpen = false;

            const setMenuOpen = (nextOpen) => {
                menuOpen = nextOpen;
                menu.hidden = !menuOpen;
                menuToggle.setAttribute('aria-expanded', String(menuOpen));
            };

            const previewCommit = (mode) => {
                const message = input.value.trim();
                if (!message) {
                    input.setCustomValidity('Enter a commit message.');
                    input.reportValidity();
                    input.focus();
                    return;
                }

                input.setCustomValidity('');
                const files = mode === 'all'
                    ? [...data.staged, ...data.changes]
                    : data.staged;
                onOpenCommit({
                    hash: 'preview',
                    message,
                    author: 'You',
                    date: 'Preview',
                    lane: 'main',
                    branch: data.branch,
                    kind: 'commit',
                    summary: 'This commit preview exists only in this browser.',
                    files,
                    edges: [],
                });
                input.value = '';
                setMenuOpen(false);
            };

            input.type = 'text';
            input.placeholder = `Message (⌘Enter to commit on "${data.branch}")`;
            input.setAttribute('aria-label', 'Commit message');
            input.autocomplete = 'off';
            input.addEventListener('input', () => input.setCustomValidity(''));
            input.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' || !event.metaKey) return;
                event.preventDefault();
                previewCommit('staged');
            });
            inputWrap.append(input, createIcon('sparkle'));

            primary.type = 'submit';
            primary.append(createIcon('check'), createElement('span', '', 'Commit'));
            menuToggle.type = 'button';
            menuToggle.title = 'More Commit Actions';
            menuToggle.setAttribute('aria-label', 'More Commit Actions');
            menuToggle.setAttribute('aria-haspopup', 'menu');
            menuToggle.appendChild(createIcon('chevron-down'));
            menuToggle.addEventListener('click', () => setMenuOpen(!menuOpen));

            [
                ['Commit Staged', 'staged'],
                ['Commit All', 'all'],
            ].forEach(([label, mode]) => {
                const option = createElement('button', 'scm-commit-option', label);
                option.type = 'button';
                option.setAttribute('role', 'menuitem');
                option.addEventListener('click', () => previewCommit(mode));
                menu.appendChild(option);
            });
            menu.setAttribute('role', 'menu');
            menu.hidden = true;

            form.addEventListener('submit', (event) => {
                event.preventDefault();
                previewCommit('staged');
            });
            actions.append(primary, menuToggle, menu);
            form.append(inputWrap, actions);
            return form;
        };

        const changesPane = createElement('div', 'scm-changes-pane');
        const repository = createElement('section', 'scm-repository');
        const repositoryHeader = createElement('button', 'scm-repository-header');
        const repositoryChevron = createIcon('chevron-down');
        const repositoryName = createElement('strong', '', 'CHANGES');
        const repositoryBody = createElement('div', 'scm-repository-body');
        let repositoryOpen = true;

        const setRepositoryOpen = (nextOpen) => {
            repositoryOpen = nextOpen;
            repositoryHeader.setAttribute('aria-expanded', String(repositoryOpen));
            repositoryChevron.classList.toggle('codicon-chevron-down', repositoryOpen);
            repositoryChevron.classList.toggle('codicon-chevron-right', !repositoryOpen);
            repositoryBody.hidden = !repositoryOpen;
        };

        repositoryHeader.type = 'button';
        repositoryHeader.append(repositoryChevron, repositoryName);
        repositoryHeader.addEventListener('click', () => setRepositoryOpen(!repositoryOpen));
        repositoryBody.append(
            createCommitComposer(),
            createGroup('Staged Changes', data.staged, true),
            createGroup('Changes', data.changes, false)
        );
        collapseSections.unshift(() => setRepositoryOpen(false));
        setRepositoryOpen(true);
        repository.append(repositoryHeader, repositoryBody);
        changesPane.appendChild(repository);

        const graphPane = createElement('section', 'scm-graph-pane');
        const graphHeader = createElement('div', 'scm-graph-header');
        const graphTitleWrap = createElement('div', 'scm-graph-title');
        const graphTitleChevron = createIcon('chevron-down');
        const graphTitle = createElement('strong', '', 'GRAPH');
        const graphToolbar = createElement('div', 'scm-graph-toolbar');
        const autoButton = createElement('button', 'scm-graph-action scm-auto-action');
        const locateButton = createToolbarButton('target', 'Locate Current Commit');
        const fetchButton = createToolbarButton('repo-fetch', 'Fetch is unavailable in this portfolio.', true);
        const pushButton = createToolbarButton('repo-pull', 'Pull is unavailable in this portfolio.', true);
        const syncButton = createToolbarButton('cloud-upload', 'Remote sync is unavailable in this portfolio.', true);
        const refreshButton = createToolbarButton('refresh', 'Refresh Current Commit');
        const moreButton = createToolbarButton('more', 'More graph actions are unavailable.', true);
        const graphList = createElement('div', 'scm-graph-list');
        const graphRows = createElement('div', 'scm-graph-rows');
        let autoLayout = true;

        graphTitleWrap.append(graphTitleChevron, graphTitle);
        autoButton.type = 'button';
        autoButton.title = 'Graph Layout: Auto';
        autoButton.setAttribute('aria-label', 'Graph Layout: Auto');
        autoButton.setAttribute('aria-pressed', 'true');
        autoButton.append(createIcon('git-branch'), createElement('span', '', 'Auto'));
        autoButton.addEventListener('click', () => {
            autoLayout = !autoLayout;
            autoButton.classList.toggle('active', autoLayout);
            autoButton.setAttribute('aria-pressed', String(autoLayout));
        });
        autoButton.classList.add('active');
        graphToolbar.setAttribute('role', 'toolbar');
        graphToolbar.setAttribute('aria-label', 'Graph actions');
        graphToolbar.append(
            autoButton,
            locateButton,
            fetchButton,
            pushButton,
            syncButton,
            refreshButton,
            moreButton
        );
        graphHeader.append(graphTitleWrap, graphToolbar);
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
            const author = createElement('span', 'scm-commit-author', commit.author);
            const action = createIcon('open-preview', 'scm-commit-open');

            row.type = 'button';
            row.dataset.scmKey = key;
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', 'false');
            row.setAttribute('aria-describedby', tooltip.id);
            row.setAttribute('aria-label', `${commit.message}, ${commit.author}, ${commit.date}`);
            row.style.setProperty(
                '--scm-graph-indent',
                `${graphLaneStart + (commit.graphColumns * graphLaneGap)}px`
            );
            row.appendChild(message);

            if (commit.branch) {
                const branchLabel = createElement('span', 'scm-branch-label');
                branchLabel.append(createIcon('target'), createElement('span', '', commit.branch));
                row.appendChild(branchLabel);
            }

            row.append(author, action);

            const showTooltip = () => {
                container.querySelector(`.scm-graph-node[data-hash="${commit.hash}"]`)
                    ?.classList.add('hovered');
                if (window.innerWidth <= 767) return;
                populateTooltip(tooltip, commit);
                tooltip.hidden = false;
                positionTooltip(tooltip, row, sidebar);
            };

            const hideRowTooltip = () => {
                container.querySelector(`.scm-graph-node[data-hash="${commit.hash}"]`)
                    ?.classList.remove('hovered');
                hideTooltip();
            };

            row.addEventListener('mouseenter', showTooltip);
            row.addEventListener('mouseleave', hideRowTooltip);
            row.addEventListener('focus', showTooltip);
            row.addEventListener('blur', hideRowTooltip);
            row.addEventListener('click', () => {
                select(key);
                hideRowTooltip();
                onOpenCommit(commit);
            });
            itemButtons.set(key, row);
            graphRows.appendChild(row);
        });

        const currentKey = data.commits[0] ? `commit:${data.commits[0].hash}` : null;
        const locateCurrentCommit = () => {
            if (!currentKey) return;
            select(currentKey);
            const row = itemButtons.get(currentKey);
            row?.scrollIntoView({ block: 'nearest' });
        };

        locateButton.addEventListener('click', () => {
            locateCurrentCommit();
            itemButtons.get(currentKey)?.focus();
        });
        refreshButton.addEventListener('click', locateCurrentCommit);
        graphList.addEventListener('scroll', hideTooltip, { passive: true });
        graphPane.append(graphHeader, graphList);

        const resizer = createElement('div', 'scm-resizer');
        resizer.tabIndex = 0;
        resizer.setAttribute('role', 'separator');
        resizer.setAttribute('aria-label', 'Resize changes and graph');
        resizer.setAttribute('aria-orientation', 'horizontal');
        resizer.setAttribute('aria-valuemin', '160');

        const setChangesHeight = (height) => {
            const minimum = 160;
            const maximum = Math.max(minimum, container.clientHeight - 170);
            const nextHeight = Math.max(minimum, Math.min(maximum, height));
            container.style.setProperty('--scm-changes-height', `${nextHeight}px`);
            resizer.setAttribute('aria-valuemax', String(maximum));
            resizer.setAttribute('aria-valuenow', String(Math.round(nextHeight)));
        };

        const syncDefaultHeight = () => {
            if (userResized || container.clientHeight <= 0) return;
            const height = Math.round(container.clientHeight * 0.52);
            resizer.setAttribute('aria-valuemax', String(Math.max(160, container.clientHeight - 170)));
            resizer.setAttribute('aria-valuenow', String(height));
        };

        resizer.addEventListener('pointerdown', (event) => {
            userResized = true;
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
            userResized = true;
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
        resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(syncDefaultHeight)
            : null;
        resizeObserver?.observe(container);
        syncDefaultHeight();
        locateCurrentCommit();
        onCountChange(data.staged.length + data.changes.length);

        return {
            data,
            select,
            ensureSelection: () => {
                if (!selectedKey) locateCurrentCommit();
            },
            hideTooltip,
            collapseAll: () => collapseSections.forEach((collapse) => collapse()),
            destroy: () => {
                resizeObserver?.disconnect();
                tooltip.remove();
            },
        };
    };

    window.SourceControlView = { create };
})();
