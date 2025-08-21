import { LineageChart } from './LineageChart.js';
import { extractCellType as pvExtractType } from './PathView.js';

class LineageVis {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.registerEventListeners();
        this.initializeGlobalControls();
    // 状态
    this.treeSessionId = 0;
    this.currentPathsSubset = [];
    this.branchLayout = null; // {root, cols: Map(depth -> columnDiv)}
    this.renderedForkKeys = new Set();
    this.nodePathMap = {};
    this.currentPreviewKey = null;
    // 布局参数
    this.layoutConfig = {
        columnWidth: 300,   // 列固定宽度（保持不变）
        chartWidth: 380,    // 每个 branch-chart 内实际图表卡片宽度（原 520）
        colGap: 24          // 列之间 gap（原来就是 24）
    };
    }

    updateAfterPathMerge(newAllPaths) {
        if (!this.branchLayout) return this.renderTreeExplorer(newAllPaths);
        this.currentPathsSubset = newAllPaths;
        // 重新统计根层分组
        const startGroups = d3.group(newAllPaths, p => {
            const first = p.path_string.split(' -> ')[0];
            return pvExtractType(first.trim());
        });
        const sorted = Array.from(startGroups.entries()).sort((a,b)=> b[1].length - a[1].length);
        const col0 = this.branchLayout.cols.get(0);
        if (!col0) return this.renderTreeExplorer(newAllPaths);
        // 现有根节点 key 集合
        const existing = new Set();
        col0.selectAll('.branch-chart').each(function(){ existing.add(this.getAttribute('data-key')); });
        // 添加缺失的根节点
        let idxAdd = 0;
        sorted.forEach(([type, groupPaths]) => {
            const key = type;
            this.nodePathMap[key] = groupPaths.slice();
            if (!existing.has(key)) {
                const specific = this.getSpecificCellsAtDepth(groupPaths, 0);
                const wrap = col0.append('div')
                    .attr('class','branch-chart')
                    .attr('data-main','0')
                    .attr('data-cell', type)
                    .attr('data-key', key)
                    .attr('data-parent-key','')
                    .attr('data-depth','0')
                    .style('text-align','center')
                    .style('border-top','1px dashed #ddd')
                    .style('padding-top','6px')
                    .style('width', this.layoutConfig.chartWidth + 'px')
                    .style('margin','0 auto');
                wrap.append('div')
                    .attr('class','chart-title')
                    .style('margin-bottom','8px')
                    .text(type);
                const id = `branch-root-added-${this.treeSessionId}-${Date.now()}-${idxAdd++}`;
                wrap.append('div').attr('id', id).classed('lc-host', true);
                new LineageChart(id, type, this.getSpecificCellsAtDepth(groupPaths,0), 0, true);
                this.renderedForkKeys.add(key);
            } else {
                // 已存在根节点：刷新其图表以反映新增路径累计数据
                const nodeSel = col0.select(`.branch-chart[data-key='${key}']`);
                if (!nodeSel.empty()) {
                    // 根节点中隐藏的预览要清理（仅针对根层）
                    nodeSel.selectAll('.lc-preview-host').remove();
                    const hostSel = nodeSel.select('.lc-host');
                    if (!hostSel.empty()) {
                        const hostId = hostSel.attr('id');
                        hostSel.selectAll('*').remove();
                        const specific = this.getSpecificCellsAtDepth(groupPaths, 0);
                        new LineageChart(hostId, type, specific, 0, true);
                    }
                }
            }
        });
        // 重新布局（根节点新增可能影响高度）
        this.reflowBranchLayout();
        this.updateConnectors();
        this.scheduleLinkageUpdate();
    }

    initializeGlobalControls() {
        if (this.container.select('.lv-global-controls').empty()) {
            const bar = this.container
                .append('div')
                .attr('class', 'lv-global-controls')
                .style('display', 'flex')
                .style('justify-content', 'flex-end')
                .style('gap', '8px')
                .style('margin-bottom', '8px');
        }
    }

    registerEventListeners() {
        document.addEventListener('pathSelected', (event) => {
            const selectedPathData = event.detail.selectedPath;
            const isMultiple = event.detail.isMultiple;
            const depthLimit = event.detail.depthLimit; // 选到哪就展示到哪
            
            if (!selectedPathData || selectedPathData.length === 0) return;
            // 合并：多次在 PathView 里点分支，会产生新的路径集合；需要把新的累加进来而不是覆盖
            const mergePaths = (oldArr, newArr) => {
                const map = new Map();
                (oldArr || []).forEach(p => { if (p && p.path_string) map.set(p.path_string, p); });
                (newArr || []).forEach(p => { if (p && p.path_string) map.set(p.path_string, p); });
                return Array.from(map.values());
            };
            if (this.branchLayout) {
                // 已有视图：只更新根节点 & nodePathMap，保留已展开分支
                const merged = mergePaths(this.currentPathsSubset, selectedPathData);
                this.updateAfterPathMerge(merged);
            } else {
                this.renderTreeExplorer(selectedPathData);
            }
        });

        document.addEventListener('treeNodeSelected', (event) => {
            const { chain, paths } = event.detail || {};
            if (!Array.isArray(chain) || chain.length === 0) return;
            this.renderIncrementalBranch(chain, paths || []);
        });
    }







    renderTreeExplorer(pathsData) {
        this.container.selectAll('*').remove();
        this.treeSessionId += 1;
        this.currentPathsSubset = pathsData;
        this.renderedForkKeys.clear();

        const zoomOuter = this.container.append('div')
            .attr('class','lineage-zoom-outer')
            .style('width','100%')
            .style('height','960px')
            .style('overflow','hidden')
            .style('position','relative')
            .style('background','#fff')
            .style('cursor','grab');
        // 顶部右上角清空按钮（绝对定位）
        zoomOuter.append('button')
            .text('清空')
            .attr('class','lv-clear-btn')
            .style('position','absolute')
            .style('top','8px')
            .style('right','8px')
            .style('z-index','10')
            .style('padding','4px 10px')
            .style('border','1px solid #ccc')
            .style('background','#fff')
            .style('border-radius','4px')
            .style('cursor','pointer')
            .on('click', () => this.clearLineageView());
        const zoomInner = zoomOuter.append('div')
            .attr('class','lineage-zoom-inner')
            .style('position','absolute')
            .style('top','0')
            .style('left','0')
            .style('transform-origin','0 0')
            .style('padding','8px');

        const chartsRow = zoomInner.append('div')
            .attr('class', 'charts-row')
            .style('display', 'flex')
            .style('gap', this.layoutConfig.colGap + 'px')
            .style('align-items', 'stretch')
            .style('flex-wrap', 'nowrap')
            .style('position', 'relative')
            .style('padding', '8px 8px 8px 8px');

        // 连接线 overlay 之前设置为 pointer-events:auto 且较高 z-index，会覆盖下方圆弧导致弧的 hover 失效
        // 调整：降低 z-index，并关闭 overlay 自身空白区域的事件，让弧能接收鼠标；保留路径本身的事件（路径已在后面单独设 pointer-events:stroke）
        const overlay = zoomOuter.append('svg')
            .attr('class', 'connector-layer')
            .style('position', 'absolute')
            .style('top', '0')
            .style('left', '0')
            .style('width', '100%')
            .style('height', '100%')
            .style('pointer-events', 'none')
            .style('z-index', '1');
        const overlayG = overlay.append('g');
        const defs = overlay.append('defs');
        defs.append('marker')
            .attr('id', 'lv-arrow')
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 10)
            .attr('refY', 5)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse')
            .append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z')
            .attr('fill', '#999');

        this.branchLayout = {
            root: chartsRow,
            cols: new Map(),
            overlay,
            overlayG
        };

        let scale = 1;
        let translateX = 0, translateY = 0;
        let isPanning = false;
        let panStart = [0,0];
        zoomOuter.on('wheel.zoom', (event)=>{
            event.preventDefault();
            if (event.shiftKey) {
                translateX -= event.deltaY; // shift + 滚轮做水平平移
            } else {
                const mouseX = event.offsetX;
                const mouseY = event.offsetY;
                const prevScale = scale;
                const delta = -event.deltaY * 0.001;
                scale = Math.min(3, Math.max(0.3, scale + delta));
                const k = scale / prevScale;
                translateX = mouseX - k * (mouseX - translateX);
                translateY = mouseY - k * (mouseY - translateY);
            }
            zoomInner.style('transform', `translate(${translateX}px, ${translateY}px) scale(${scale})`);
            this.updateConnectors();
            this.scheduleLinkageUpdate();
        });
        zoomOuter.on('mousedown.pan', (event)=>{
            if (event.button !== 0) return;
            isPanning = true;
            panStart = [event.clientX - translateX, event.clientY - translateY];
            zoomOuter.style('cursor','grabbing');
            event.preventDefault();
        });
        d3.select(window).on('mousemove.panTree', (event)=>{
            if (!isPanning) return;
            translateX = event.clientX - panStart[0];
            translateY = event.clientY - panStart[1];
            zoomInner.style('transform', `translate(${translateX}px, ${translateY}px) scale(${scale})`);
            this.updateConnectors();
            this.scheduleLinkageUpdate();
        }).on('mouseup.panTree', ()=>{
            if (isPanning) { isPanning = false; zoomOuter.style('cursor','grab'); }
        });
        zoomOuter.on('dblclick.reset', ()=>{
            scale = 1; translateX = 0; translateY = 0;
            zoomInner.style('transform', `translate(0px, 0px) scale(1)`);
            this.updateConnectors();
            this.scheduleLinkageUpdate();
        });

        window.addEventListener('resize', () => this.updateConnectors());

        if (!this.branchLayout.cols.has(0)) {
            const col0 = this.branchLayout.root.append('div')
                .attr('class', 'branch-col depth-0')
                .style('display', 'flex')
                .style('flex-direction', 'column')
                .style('gap', '16px')
                .style('align-items', 'center')
                .style('position', 'relative')
                .style('z-index', '2')
                .style('flex', `0 0 ${this.layoutConfig.columnWidth}px`)
                .style('min-width', this.layoutConfig.columnWidth + 'px');
            this.branchLayout.cols.set(0, col0);

            const startGroups = d3.group(pathsData, p => {
                const first = p.path_string.split(' -> ')[0];
                return pvExtractType(first.trim());
            });
            const sorted = Array.from(startGroups.entries()).sort((a,b)=> b[1].length - a[1].length);
            sorted.forEach(([type, groupPaths], idx) => {
                const specific = this.getSpecificCellsAtDepth(groupPaths, 0);
                const key = type;
                this.nodePathMap[key] = groupPaths.slice();
                const wrap = col0.append('div')
                    .attr('class', 'branch-chart')
                    .attr('data-main', idx === 0 ? '1' : '0')
                    .attr('data-cell', type)
                    .attr('data-key', key)
                    .attr('data-parent-key', '')
                    .attr('data-depth', '0')
                    .style('text-align','center')
                    .style('width', this.layoutConfig.chartWidth + 'px')
                    .style('margin','0 auto')
                    .style('padding-top', idx === 0 ? null : '6px')
                    .style('border-top', idx === 0 ? null : '1px dashed #ddd');
                wrap.append('div')
                    .attr('class','chart-title')
                    .style('margin-bottom','8px')
                    .style('font-weight','600')
                    .text(`${type}`);
                const id = `branch-root-${this.treeSessionId}-${idx}`;
                wrap.append('div').attr('id', id).classed('lc-host', true);
                new LineageChart(id, type, specific, 0, true);
                if (idx !== 0) this.renderedForkKeys.add(key);
            });
            this.reflowBranchLayout();
        }
    }

    // 已移除旧的 onTreeNodeClick 与单路径公共前缀比较逻辑

    getSpecificCellsAtDepth(paths, depth) {
        const cells = paths.map(p => {
            const parts = p.path_string.split(' -> ');
            return parts[depth] ? parts[depth].trim() : null;
        }).filter(Boolean);
        return [...new Set(cells)];
    }

    renderIncrementalBranch(chain, pathsAtNode) {
        if (!this.branchLayout) {
            // 若尚未初始化，直接调用多路径初始渲染（统一布局体系）
            this.renderTreeExplorer(this.currentPathsSubset || []);
        }

        for (let depth = 0; depth < chain.length; depth++) {
            if (!this.branchLayout.cols.has(depth)) {
                const col = this.branchLayout.root.append('div')
                    .attr('class', `branch-col depth-${depth}`)
                    .style('display', 'flex')
                    .style('flex-direction', 'column')
                    .style('gap', '16px')
                    .style('align-items', 'center')
                    .style('position', 'relative')
                    .style('z-index', '2')
                    .style('flex', '0 0 560px')
                    .style('min-width', '560px');
                this.branchLayout.cols.set(depth, col);
            }
        }

        const allBasePaths = (Array.isArray(pathsAtNode) && pathsAtNode.length > 0)
            ? pathsAtNode
            : (this.currentPathsSubset || []);

    const prefixSubset = (prefixLen) => {
            const pref = chain.slice(0, prefixLen);
            return allBasePaths.filter(p => {
                const nodes = p.path_string.split(' -> ').map(s => pvExtractType(s.trim()));
                if (nodes.length < pref.length) return false;
                for (let i = 0; i < pref.length; i++) {
                    if (nodes[i] !== pref[i]) return false;
                }
                return true;
            });
        };

    const lastDepth = chain.length - 1;
        for (let i = 0; i <= lastDepth; i++) {
            const type = chain[i];
            const col = this.branchLayout.cols.get(i);
            const mainSel = col.select(`.branch-chart[data-main='1']`);
            const key = chain.slice(0, i + 1).join('->');
            const parentKey = i > 0 ? chain.slice(0, i).join('->') : null;

            if (mainSel.empty()) {
                const used = prefixSubset(i + 1);
                this.nodePathMap[key] = used.slice();
                const specific = this.getSpecificCellsAtDepth(used, i);
                const wrap = col.append('div')
                    .attr('class', 'branch-chart')
                    .attr('data-main', '1')
                    .attr('data-cell', type)
                    .attr('data-key', key)
                    .attr('data-parent-key', parentKey || '')
                    .attr('data-depth', String(i))
                    .style('text-align', 'center')
                    .style('width', this.layoutConfig.chartWidth + 'px')
                    .style('margin', '0 auto');
                wrap.append('div')
                    .attr('class', 'chart-title')
                    .style('margin-bottom', '8px')
                    .style('font-weight', '600')
                    .text(`${type}`);
                const id = `branch-main-${this.treeSessionId}-${i}`;
                wrap.append('div').attr('id', id).classed('lc-host', true);
                new LineageChart(id, type, specific, i, true);
                if (i === lastDepth) this.ensureLeafPanel(key, i, used);
                continue; // 主节点刚建完，本层不再建分叉
            }

            const mainType = mainSel.attr('data-cell');
            const mainParentKey = mainSel.attr('data-parent-key') || '';
            if (mainType !== type || mainParentKey !== (parentKey || '')) {
                if (this.renderedForkKeys.has(key) || !col.selectAll(`.branch-chart[data-key='${key}']`).empty()) {
                } else {
                    const used = prefixSubset(i + 1);
                        this.nodePathMap[key] = used.slice();
                    const specific = this.getSpecificCellsAtDepth(used, i);
                    const wrap = col.append('div')
                        .attr('class', 'branch-chart')
                        .attr('data-main', '0')
                        .attr('data-cell', type)
                        .attr('data-key', key)
                        .attr('data-parent-key', parentKey)
                        .attr('data-depth', String(i))
                        .style('text-align', 'center')
                        .style('border-top', '1px dashed #ddd')
                        .style('padding-top', '6px')
                        .style('width', this.layoutConfig.chartWidth + 'px')
                        .style('margin', '0 auto');
                    wrap.append('div')
                        .attr('class', 'chart-title')
                        .style('margin-bottom', '8px')
                        .text(`${type}`);
                    const id = `branch-fork-${this.treeSessionId}-${i}-${Math.floor(Math.random()*1e6)}`;
                        wrap.append('div').attr('id', id).classed('lc-host', true);
                    new LineageChart(id, type, specific, i, true);
                    this.renderedForkKeys.add(key);
                    if (i === lastDepth) this.ensureLeafPanel(key, i, used);
                }
            }
        }
    this.reflowBranchLayout();
    }

    async ensureLeafPanel(leafKey, depth, usedPaths) {
        if (!this.branchLayout) return;
        const types = leafKey.split('->').map(s => s.trim()).filter(Boolean);
        const basePaths = (Array.isArray(usedPaths) && usedPaths.length > 0) ? usedPaths : (this.currentPathsSubset || []);
        const prefixSubset = (prefLen) => {
            const pref = types.slice(0, prefLen);
            return basePaths.filter(p => {
                const nodes = p.path_string.split(' -> ').map(s => pvExtractType(s.trim()));
                if (nodes.length < pref.length) return false;
                for (let i = 0; i < pref.length; i++) if (nodes[i] !== pref[i]) return false;
                return true;
            });
        };
        const descriptors = types.map((t, i) => ({ label: t, specificCells: this.getSpecificCellsAtDepth(prefixSubset(i+1), i) }));
        const neighbors = await this.getAllNeighborCells(descriptors);
        const evt = new CustomEvent('showNeighborDetails', { detail: { pathCells: descriptors, neighborCells: neighbors } });
        document.dispatchEvent(evt);

        try {
            const nodeSel = this.branchLayout.root.select(`.branch-chart[data-key='${leafKey}']`);
            if (!nodeSel.empty()) {
                nodeSel.attr('data-path-key', leafKey);
                this.scheduleLinkageUpdate();
            }
        } catch(e) {}

    }

    updateConnectors() {
        if (!this.branchLayout) return;
        const row = this.branchLayout.root.node();
        const overlay = this.branchLayout.overlay;
        const g = this.branchLayout.overlayG;
        if (!overlay || !g) return;

        const zoomOuter = this.container.select('.lineage-zoom-outer').node();
        overlay
            .attr('width', zoomOuter ? zoomOuter.clientWidth : row.scrollWidth)
            .attr('height', zoomOuter ? zoomOuter.clientHeight : row.scrollHeight);
        g.selectAll('*').remove();

    const getRect = el => el.getBoundingClientRect();
    // 使用未发生 transform 的外层容器作为基准，避免平移/缩放被相互抵消
    const outer = this.container.select('.lineage-zoom-outer').node();
    const base = outer ? outer.getBoundingClientRect() : row.getBoundingClientRect();
        const sx = row.scrollLeft; // 修正横向滚动
        const sy = row.scrollTop;
        const centerRight = el => {
            const r = getRect(el);
            return { x: (r.right - base.left) + sx, y: (r.top - base.top) + sy + r.height/2 };
        };
        const centerLeft = el => {
            const r = getRect(el);
            return { x: (r.left - base.left) + sx, y: (r.top - base.top) + sy + r.height/2 };
        };

        const cols = [...this.branchLayout.cols.keys()].sort((a,b)=>a-b);
        const allCols = cols.map(d => this.branchLayout.cols.get(d));
        const findParentNode = (parentKey, myDepthIdx) => {
            if (!parentKey) return null;
            // 从前一列往前找，直到找到匹配 key 的节点
            for (let j = myDepthIdx - 1; j >= 0; j--) {
                const col = allCols[j];
                if (!col) continue;
                const n = col.select(`.branch-chart[data-key='${parentKey}']`).node();
                if (n) return n;
            }
            return null;
        };
        const findNearestPrevMain = (myDepthIdx) => {
            for (let j = myDepthIdx - 1; j >= 0; j--) {
                const col = allCols[j];
                if (!col) continue;
                const pm = col.select(`.branch-chart[data-main='1']`).node();
                if (pm) return pm;
            }
            return null;
        };

        cols.forEach((d, idx) => {
            const col = this.branchLayout.cols.get(d);
            if (!col) return;
            col.selectAll('.branch-chart').each((_, i, nodes) => {
                const node = nodes[i];
                const pk = node.getAttribute('data-parent-key') || '';
                const parent = findParentNode(pk, idx) || findNearestPrevMain(idx);
                if (!parent) return;
                const src = centerRight(parent);
                const dst = centerLeft(node);
                const isFork = node.getAttribute('data-main') === '0';
                const childKey = node.getAttribute('data-key');
                const parentKey = parent.getAttribute('data-key');
                const pathSel = this.drawConnector(g, src, dst, isFork);
                pathSel.attr('data-child-key', childKey || '')
                       .attr('data-parent-key', parentKey || '')
                       .attr('data-role','visible');
                const dPath = pathSel.attr('d');
                g.append('path')
                    .attr('class','lv-connector-hit')
                    .attr('d', dPath)
                    .attr('fill','none')
                    .attr('stroke','transparent')
                    .attr('stroke-width', 14)
                    .style('cursor','pointer')
                    .style('pointer-events','stroke')
                    .attr('data-child-key', childKey || '')
                    .attr('data-parent-key', parentKey || '')
                    .attr('data-role','hit');
            });
        });

        g.selectAll('path.lv-connector, path.lv-connector-hit').on('.preview', null);
        g.selectAll('path.lv-connector-hit')
            .on('mouseover.preview', (event) => {
                const childKey = event.currentTarget.getAttribute('data-child-key');
                g.selectAll('path.lv-connector').filter(function(){
                    return this.getAttribute('data-child-key') === childKey;
                }).attr('stroke', '#1e90ff').attr('stroke-width', 3);
                if (childKey) this.previewPathByChildKey(childKey);
            })
            .on('mouseout.preview', (event) => {
                const childKey = event.currentTarget.getAttribute('data-child-key');
                g.selectAll('path.lv-connector').filter(function(){
                    return this.getAttribute('data-child-key') === childKey;
                }).attr('stroke', '#999').attr('stroke-width', 1.5);
                this.clearPreviewPath();
            });
    }

    reflowBranchLayout() {
        if (!this.branchLayout) return;
        const nodeInfos = new Map();
        this.branchLayout.root.selectAll('.branch-chart').each((_, i, nodes) => {
            const el = nodes[i];
            const key = el.getAttribute('data-key');
            const parentKey = el.getAttribute('data-parent-key') || '';
            const depth = +(el.getAttribute('data-depth') || 0);
            nodeInfos.set(key, { key, parentKey, depth, el, children: [], y: 0 });
        });
        nodeInfos.forEach(info => {
            if (info.parentKey && nodeInfos.has(info.parentKey)) {
                nodeInfos.get(info.parentKey).children.push(info);
            }
        });
        const roots = [];
        nodeInfos.forEach(info => {
            if (!info.parentKey || !nodeInfos.has(info.parentKey)) roots.push(info);
        });
        const virtualRoot = { key: '__root__', depth: -1, children: roots, y: 0 };
        const leaves = [];
        nodeInfos.forEach(info => { if (info.children.length === 0) leaves.push(info); });
        leaves.sort((a,b)=> (a.depth - b.depth) || 0);
        const leafGap = 300; // px between leaf centers
        let nextLeafIndex = 0;
        function assignY(node) {
            if (node.children.length === 0) {
                node.y = nextLeafIndex * leafGap;
                nextLeafIndex++;
            } else {
                node.children.forEach(assignY);
                // 父 y = 子 y 平均
                node.y = node.children.reduce((s,c)=>s+c.y,0)/node.children.length;
            }
        }
        assignY(virtualRoot);
        const allNodeArray = Array.from(nodeInfos.values());
        allNodeArray.forEach(n => {
            const rect = n.el.getBoundingClientRect();
            n.height = rect.height || 240;
            n.half = n.height / 2;
        });
        const paddingTop = 30; // 视觉留白
        let minTopCandidate = Infinity;
        allNodeArray.forEach(n => {
            const topIfPlaced = n.y - n.half; // 未加 offset 的 top
            if (topIfPlaced < minTopCandidate) minTopCandidate = topIfPlaced;
        });
        const offset = (minTopCandidate === Infinity ? 0 : -minTopCandidate) + paddingTop;
        let maxBottom = -Infinity;
        allNodeArray.forEach(n => {
            const bottomIfPlaced = n.y + n.half + offset;
            if (bottomIfPlaced > maxBottom) maxBottom = bottomIfPlaced;
        });
        const totalHeight = maxBottom + paddingTop; // 底部再加与顶部相同的留白
        const cols = [...this.branchLayout.cols.keys()].sort((a,b)=>a-b);
        cols.forEach(depth => {
            const col = this.branchLayout.cols.get(depth);
            if (!col) return;
            col.style('position','relative')
                .style('display','block')
                .style('min-width','560px')
                .style('height', totalHeight + 'px');
            const depthNodes = [];
            nodeInfos.forEach(n => { if (n.depth === depth) depthNodes.push(n); });
            depthNodes.forEach(n => {
                const sel = d3.select(n.el);
                sel.style('position','absolute')
                   .style('top', (n.y - n.half + offset) + 'px')
                   .style('left','0');
            });
        });
        requestAnimationFrame(()=>this.updateConnectors());
    }

    drawConnector(g, src, dst, dashed) {
        const mx = (src.x + dst.x) / 2;
        return g.append('path')
            .attr('class', 'lv-connector')
            .attr('d', `M${src.x},${src.y} C${mx},${src.y} ${mx},${dst.y} ${dst.x},${dst.y}`)
            .attr('fill', 'none')
            .attr('stroke', '#999')
            .attr('stroke-width', 1.5)
            .attr('marker-end', 'url(#lv-arrow)')
            .attr('stroke-dasharray', dashed ? '4,3' : null)
            .style('cursor','pointer')
            .style('pointer-events','stroke');
    }

    previewPathByChildKey(childKey) {
        if (!this.branchLayout) return;
        if (this.currentPreviewKey === childKey) return; // 已是当前预览
        this.clearPreviewPath();
        const chain = childKey.split('->').filter(Boolean);
        if (chain.length === 0) return;
        const subsetPaths = this.nodePathMap[childKey];
        if (!Array.isArray(subsetPaths) || subsetPaths.length === 0) return;
        this.currentPreviewKey = childKey;
        for (let depth = 0; depth < chain.length; depth++) {
            const prefixKey = chain.slice(0, depth + 1).join('->');
            const nodeSel = this.branchLayout.root.select(`.branch-chart[data-key='${prefixKey}']`);
            if (nodeSel.empty()) continue;
            nodeSel.selectAll('.lc-host').style('display','none');
            const prefixSubset = subsetPaths.filter(p => {
                const nodes = p.path_string.split(' -> ').map(s => pvExtractType(s.trim()));
                if (nodes.length < depth + 1) return false;
                for (let i=0;i<=depth;i++) if (nodes[i] !== chain[i]) return false;
                return true;
            });
            const specificCells = this.getSpecificCellsAtDepth(prefixSubset, depth);
            const previewId = `preview-${prefixKey.replace(/[^a-zA-Z0-9]/g,'_')}`;
            nodeSel.selectAll(`.lc-preview-host#${previewId}`).remove();
            const host = nodeSel.append('div')
                .attr('class','lc-preview-host')
                .attr('id', previewId)
                .style('position','relative')
                .style('z-index','3');
            new LineageChart(previewId, chain[depth], specificCells, depth, true);
        }
        chain.forEach((_, depth)=>{
            const prefixKey = chain.slice(0, depth + 1).join('->');
            this.branchLayout.root.select(`.branch-chart[data-key='${prefixKey}']`)
                .classed('preview-active', true)
                .style('box-shadow','0 0 0 2px rgba(30,144,255,0.5)');
        });
    }

    clearPreviewPath() {
        if (!this.branchLayout) return;
        if (!this.currentPreviewKey) return;
        this.branchLayout.root.selectAll('.lc-preview-host').remove();
        this.branchLayout.root.selectAll('.lc-host').style('display', null);
        this.branchLayout.root.selectAll('.preview-active')
            .classed('preview-active', false)
            .style('box-shadow', null);
        this.currentPreviewKey = null;
    }

    scheduleLinkageUpdate() {
        if (this._pendingLinkUpdate) return;
        this._pendingLinkUpdate = true;
        requestAnimationFrame(()=>{ this._pendingLinkUpdate = false; this.drawCrossPanelLinks(); });
    }

    drawCrossPanelLinks() {
        const leftRoot = this.container.node();
        const rightRoot = document.querySelector('#neighborDetailsContainer');
        if (!leftRoot || !rightRoot) return;
        let svg = document.querySelector('#lineage-neighbor-link-overlay');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
            svg.setAttribute('id','lineage-neighbor-link-overlay');
            Object.assign(svg.style, { position:'fixed', left:'0', top:'0', width:'100vw', height:'100vh', pointerEvents:'none', zIndex: 40 });
            document.body.appendChild(svg);
            window.addEventListener('resize', ()=> this.scheduleLinkageUpdate());
            document.addEventListener('scroll', ()=> this.scheduleLinkageUpdate(), true); // 捕捉任意滚动
            document.addEventListener('neighborChartAdded', ()=> this.scheduleLinkageUpdate());
        }
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        const g = document.createElementNS('http://www.w3.org/2000/svg','g');
        svg.appendChild(g);
        const neighborBlocks = Array.from(document.querySelectorAll('.neighbor-chart-wrapper[data-path-key]'));
        if (neighborBlocks.length === 0) return;
        const map = new Map(); neighborBlocks.forEach(el=> map.set(el.getAttribute('data-path-key'), el));
        const leftNodes = Array.from(leftRoot.querySelectorAll('.branch-chart[data-path-key]'));
        leftNodes.forEach(node => {
            const key = node.getAttribute('data-path-key');
            if (!map.has(key)) return;
            const target = map.get(key);
            const r1 = node.getBoundingClientRect();
            const r2 = target.getBoundingClientRect();
            const x1 = r1.right;
            const y1 = r1.top + r1.height/2; // 源节点垂直中心
            let x2 = r2.left;
            let y2 = r2.top + r2.height/2;   // 目标元素左边垂直中点
            // 计算 LineageVis 容器右边界，超过则截断，不再绘制外部部分
            const lineageRight = r1.right > r2.left ? Math.max(r1.right, this.container.node().getBoundingClientRect().right)
                                 : this.container.node().getBoundingClientRect().right;
            const clipRight = this.container.node().getBoundingClientRect().right; // 仅可绘制到此
            if (x2 > clipRight) {
                x2 = clipRight - 2; // 留一点像素避免覆盖边框
            }
            if (x2 <= x1) return; // 若目标在可绘制范围外或倒置则跳过
            const mx = (x1 + x2)/2;
            const path = document.createElementNS('http://www.w3.org/2000/svg','path');
            path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
            path.setAttribute('stroke', '#c0c5cc');
            path.setAttribute('stroke-width','2');
            path.setAttribute('fill','none');
            path.setAttribute('class','ln-cross-link');
            g.appendChild(path);
            // 不再绘制终点圆，避免越界显示
        });
    }

    clearLineageView() {
        this.container.selectAll('*').remove();
        this.branchLayout = null;
        this.renderedForkKeys.clear();
        this.currentPathsSubset = [];
    this.nodePathMap = {};
    this.currentPreviewKey = null;
        d3.selectAll('.path-container').remove();
    }

    async getAllNeighborCells(pathCellsOrDescriptors) {
        const allNeighborTypes = new Set();

        for (const item of pathCellsOrDescriptors) {
            const specificCells = typeof item === 'string' ? [item] : (item.specificCells || []);
            for (const cellName of specificCells) {
                try {
                    const totalPath = `./js/components/pathSelection/Every_cell_info_withKJL4/${cellName}/${cellName}_total.csv`;
                    const totalData = await d3.csv(totalPath, d3.autoType);
                    totalData.forEach(d => {
                        if (d.邻居细胞 && !String(d.邻居细胞).endsWith('Target')) {
                            allNeighborTypes.add(d.邻居细胞);
                        }
                    });
                } catch (error) {
                    console.warn(`无法加载${cellName}的数据:`, error);
                }
            }
        }

        const neighborsWithIntensity = [];
        for (const neighborType of allNeighborTypes) {
            let totalIntensity = 0;
            for (const item of pathCellsOrDescriptors) {
                const specificCells = typeof item === 'string' ? [item] : (item.specificCells || []);
                for (const cellName of specificCells) {
                    try {
                        const totalPath = `./js/components/pathSelection/Every_cell_info_withKJL4/${cellName}/${cellName}_total.csv`;
                        const totalData = await d3.csv(totalPath, d3.autoType);
                        const neighborData = totalData.find(d => d.邻居细胞 === neighborType);
                        if (neighborData) {
                            totalIntensity += neighborData.通讯总强度 || 0;
                        }
                    } catch (error) {
                        console.warn(`计算${neighborType}强度时出错:`, error);
                    }
                }
            }
            neighborsWithIntensity.push({ type: neighborType, totalIntensity });
        }

        return neighborsWithIntensity
            .sort((a, b) => b.totalIntensity - a.totalIntensity)
            .map(d => d.type);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 创建全局实例以便在控制台中访问
    window.lineageVis = new LineageVis('#lineageVisContainer');
});