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
        // 预览锁定（点击切换）
        this.previewLocked = false;
        this.lockedPreviewKey = null;
        // 鼠标操作模式
        this.mouseMode = 'pan'; // 默认拖拽模式
        // 布局参数
        this.layoutConfig = {
            columnWidth: 500,   // 放大 2 倍
            chartWidth: 660,    // 与 LineageChart scaleFactor=2 匹配
            colGap: 200          // 稍微加大间距
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
                    .style('margin-bottom','16px')
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

            // 鼠标操作模式选择框
            const modeGroup = bar.append('div')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('gap', '4px');
            
            modeGroup.append('label')
                .style('font-size', '12px')
                .style('color', '#666')
                .text('鼠标模式:');

            const modeSelect = modeGroup.append('select')
                .attr('class', 'mouse-mode-select')
                .style('padding', '2px 4px')
                .style('font-size', '12px');

            const modeOptions = [
                { value: 'pan', label: '拖拽' },
                { value: 'lasso', label: '套索' }
            ];
            modeSelect.selectAll('option')
                .data(modeOptions)
                .enter()
                .append('option')
                .attr('value', d => d.value)
                .text(d => d.label);

            // 默认拖拽模式
            this.mouseMode = 'pan';
            modeSelect.property('value', 'pan');

            modeSelect.on('change', (event) => {
                this.mouseMode = event.target.value;
                this.updateMouseMode();
            });

            // 指标选择下拉框（控制 LineageChart 内外环使用哪种强度数据）
            const metricSelect = bar.append('select')
                .attr('class', 'lineage-metric-select')
                .style('padding', '2px 4px')
                .style('font-size', '12px');

            const options = [
                { value: '总强度', label: '总强度' },
                { value: '通道数', label: '通道数' },
                { value: '平均通道数', label: '平均通道数' },
                { value: '平均通道强度', label: '平均通道强度' },
                { value: '细胞接收强度', label: '细胞平均强度' } // 使用“细胞接收强度”关键字匹配用户描述
            ];
            metricSelect.selectAll('option')
                .data(options)
                .enter()
                .append('option')
                .attr('value', d => d.value)
                .text(d => d.label);

            // 恢复全局模式（若之前已选择）
            const savedMode = window.lineageMetricMode || '总强度';
            metricSelect.property('value', savedMode);

            metricSelect.on('change', (event) => {
                const mode = event.target.value;
                window.lineageMetricMode = mode; // 记住选择
                document.dispatchEvent(new CustomEvent('lineageMetricModeChanged', { detail: { mode } }));
            });
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
    // 清除内容并重建（保留/恢复全局控制条）
        const hasControls = !this.container.select('.lv-global-controls').empty();
        this.container.selectAll('*').remove();
        if (!hasControls) {
            this.initializeGlobalControls();
        } else {
            // 重新创建控制条后面的内容容器
            this.initializeGlobalControls();
        }
        this.treeSessionId += 1;
        this.currentPathsSubset = pathsData;
        this.renderedForkKeys.clear();

        const zoomOuter = this.container.append('div')
            .attr('class','lineage-zoom-outer')
            .style('width','100%')
            .style('height','600px')
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

    // 连接线 overlay：降低 z-index，并关闭空白区域事件（路径命中区域另设）
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
            overlayG,
            zoomOuter,
            zoomInner
        };

        // 套索相关状态
        this.lassoData = {
            isDrawing: false,
            path: [],
            lassoGroup: null
        };

        let scale = 1;
        let translateX = 0, translateY = 0;
        let isPanning = false;
        let panStart = [0,0];

        // 保存状态供模式切换使用
        this.viewState = { scale, translateX, translateY, isPanning, panStart };

        // 初始化鼠标事件
        this.setupMouseEvents();

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
                    .style('margin-bottom','16px')
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

        // 使用“当前全量合集 ∪ 本次传入子集”的并集，避免只看最后一次点击的那部分
        const allBasePaths = (() => {
            const base = Array.isArray(this.currentPathsSubset) ? this.currentPathsSubset : [];
            if (Array.isArray(pathsAtNode) && pathsAtNode.length > 0) {
                const map = new Map();
                base.forEach(p => { if (p && p.path_string) map.set(p.path_string, p); });
                pathsAtNode.forEach(p => { if (p && p.path_string) map.set(p.path_string, p); });
                return Array.from(map.values());
            }
            return base;
        })();

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
                    .style('margin-bottom', '16px')
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

            // 若主节点已存在且与当前链一致，则刷新该节点为“聚合后的 specificCells”
            if (mainType === type && mainParentKey === (parentKey || '')) {
                const used = prefixSubset(i + 1);
                this.nodePathMap[key] = used.slice();
                const specific = this.getSpecificCellsAtDepth(used, i);
                const hostSel = mainSel.select('.lc-host');
                if (!hostSel.empty()) {
                    const hostId = hostSel.attr('id');
                    // 清理预览与旧图
                    mainSel.selectAll('.lc-preview-host').remove();
                    hostSel.selectAll('*').remove();
                    new LineageChart(hostId, type, specific, i, true);
                }
                if (i === lastDepth) {
                    // 注释掉自动生成 NeighborDetails，只在套索选择时才生成
                    // this.ensureLeafPanel(key, i, used);
                }
                // 同层的分叉逻辑继续判断添加
            }
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
                        .style('padding-top', '12px')
                        .style('width', this.layoutConfig.chartWidth + 'px')
                        .style('margin', '0 auto');
                    wrap.append('div')
                        .attr('class', 'chart-title')
                        .style('margin-bottom', '16px')
                        .text(`${type}`);
                    const id = `branch-fork-${this.treeSessionId}-${i}-${Math.floor(Math.random()*1e6)}`;
                        wrap.append('div').attr('id', id).classed('lc-host', true);
                    new LineageChart(id, type, specific, i, true);
                    this.renderedForkKeys.add(key);
                    if (i === lastDepth) {
                        // 注释掉自动生成 NeighborDetails，只在套索选择时才生成
                        // this.ensureLeafPanel(key, i, used);
                    }
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
        // 注释掉自动生成事件，只在套索选择时才触发
        // const evt = new CustomEvent('showNeighborDetails', { detail: { pathCells: descriptors, neighborCells: neighbors } });
        // document.dispatchEvent(evt);

        try {
            const nodeSel = this.branchLayout.root.select(`.branch-chart[data-key='${leafKey}']`);
            if (!nodeSel.empty()) {
                nodeSel.attr('data-path-key', leafKey);
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
                if (this.previewLocked) return; // 锁定时不响应悬停预览切换
                const childKey = event.currentTarget.getAttribute('data-child-key');
                g.selectAll('path.lv-connector').filter(function(){
                    return this.getAttribute('data-child-key') === childKey;
                }).attr('stroke', '#1e90ff').attr('stroke-width', 3);
                if (childKey) this.previewPathByChildKey(childKey);
            })
            .on('mouseout.preview', (event) => {
                const childKey = event.currentTarget.getAttribute('data-child-key');
                // 若已锁定并且是锁定的路径，则保持高亮与预览
                if (this.previewLocked && this.lockedPreviewKey === childKey) {
                    g.selectAll('path.lv-connector').filter(function(){
                        return this.getAttribute('data-child-key') === childKey;
                    }).attr('stroke', '#1e90ff').attr('stroke-width', 3);
                    return;
                }
                // 恢复该条的默认样式
                g.selectAll('path.lv-connector').filter(function(){
                    return this.getAttribute('data-child-key') === childKey;
                }).attr('stroke', '#999').attr('stroke-width', 1.5);
                // 未锁定时才清理预览
                if (!this.previewLocked) this.clearPreviewPath();
            })
            .on('click.preview', (event) => {
                const childKey = event.currentTarget.getAttribute('data-child-key');
                if (!childKey) return;
                if (!this.previewLocked) {
                    // 锁定当前预览
                    this.previewLocked = true;
                    this.lockedPreviewKey = childKey;
                    this.previewPathByChildKey(childKey);
                    g.selectAll('path.lv-connector').filter(function(){
                        return this.getAttribute('data-child-key') === childKey;
                    }).attr('stroke', '#1e90ff').attr('stroke-width', 3);
                } else {
                    if (this.lockedPreviewKey === childKey) {
                        // 解锁
                        this.previewLocked = false;
                        this.lockedPreviewKey = null;
                        this.clearPreviewPath();
                        // 恢复样式
                        g.selectAll('path.lv-connector').filter(function(){
                            return this.getAttribute('data-child-key') === childKey;
                        }).attr('stroke', '#999').attr('stroke-width', 1.5);
                    } else {
                        // 切换锁定到另一条
                        const prevKey = this.lockedPreviewKey;
                        this.lockedPreviewKey = childKey;
                        if (prevKey) {
                            g.selectAll('path.lv-connector').filter(function(){
                                return this.getAttribute('data-child-key') === prevKey;
                            }).attr('stroke', '#999').attr('stroke-width', 1.5);
                        }
                        this.previewPathByChildKey(childKey);
                        g.selectAll('path.lv-connector').filter(function(){
                            return this.getAttribute('data-child-key') === childKey;
                        }).attr('stroke', '#1e90ff').attr('stroke-width', 3);
                    }
                }
            });

        // 若存在被锁定的预览，重绘后恢复其高亮与内容
        if (this.previewLocked && this.lockedPreviewKey) {
            const k = this.lockedPreviewKey;
            g.selectAll('path.lv-connector').filter(function(){
                return this.getAttribute('data-child-key') === k;
            }).attr('stroke', '#1e90ff').attr('stroke-width', 3);
            this.previewPathByChildKey(k);
        }
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
    const leafGap = 600; // 放大后加大节点垂直间距，避免标题重叠
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
                .style('min-width', this.layoutConfig.chartWidth + 'px')
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

    clearLineageView() {
        // 1) 清空本容器与本实例状态
        this.container.selectAll('*').remove();
        this.branchLayout = null;
        this.renderedForkKeys.clear();
        this.currentPathsSubset = [];
        this.nodePathMap = {};
        this.currentPreviewKey = null;
        this.previewLocked = false;
        this.lockedPreviewKey = null;
        // 重置套索状态
        this.clearLassoPath();
        this.mouseMode = 'pan'; // 重置为拖拽模式
        d3.selectAll('.path-container').remove();

    // 2) 通知右侧面板清空（保留其容器与监听）
    try { document.dispatchEvent(new CustomEvent('clearNeighborDetails')); } catch (_) {}

        // 3) 重置全局变量/注册表/最大值（彻底清空）
        try { window.__lineageCharts = []; } catch (_) {}
        try { window.__neighborCellGlobalMax = {}; } catch (_) {}
        try { window.__overallCommCharts = []; } catch (_) {}
        try { window.__overallCommGlobalMaxByMode = {}; } catch (_) {}
    try { window.__overallCommGlobalRangeByMode = {}; } catch (_) {}
    try { window.__lineageGlobalRangeByMode = {}; } catch (_) {}
        // 指标模式恢复默认
        try { window.lineageMetricMode = '总强度'; } catch (_) {}
        try { window.__overallCommCurrentMode = '总强度'; } catch (_) {}
        // 触发一次模式变化，便于其他监听者同步复位（若存在）
        try { document.dispatchEvent(new CustomEvent('lineageMetricModeChanged', { detail: { mode: '总强度' } })); } catch (_) {}
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

    // 设置鼠标事件
    setupMouseEvents() {
        if (!this.branchLayout) return;
        
        const { zoomOuter, zoomInner } = this.branchLayout;
        
        // 滚轮缩放事件（两种模式都支持）
        zoomOuter.on('wheel.zoom', (event) => {
            event.preventDefault();
            if (event.shiftKey) {
                this.viewState.translateX -= event.deltaY; // shift + 滚轮做水平平移
            } else {
                const mouseX = event.offsetX;
                const mouseY = event.offsetY;
                const prevScale = this.viewState.scale;
                const delta = -event.deltaY * 0.001;
                this.viewState.scale = Math.min(3, Math.max(0.3, this.viewState.scale + delta));
                const k = this.viewState.scale / prevScale;
                this.viewState.translateX = mouseX - k * (mouseX - this.viewState.translateX);
                this.viewState.translateY = mouseY - k * (mouseY - this.viewState.translateY);
            }
            zoomInner.style('transform', `translate(${this.viewState.translateX}px, ${this.viewState.translateY}px) scale(${this.viewState.scale})`);
            this.updateConnectors();
        });

        // 双击重置（两种模式都支持）
        zoomOuter.on('dblclick.reset', () => {
            this.viewState.scale = 1;
            this.viewState.translateX = 0;
            this.viewState.translateY = 0;
            zoomInner.style('transform', `translate(0px, 0px) scale(1)`);
            this.updateConnectors();
        });

        this.updateMouseMode();
    }

    // 更新鼠标模式
    updateMouseMode() {
        if (!this.branchLayout) return;
        
        const { zoomOuter, overlay } = this.branchLayout;
        
        // 清除之前的事件监听器
        zoomOuter.on('mousedown.mode', null);
        d3.select(window).on('mousemove.mode', null).on('mouseup.mode', null);
        
        // 清除套索路径
        this.clearLassoPath();

        if (this.mouseMode === 'pan') {
            this.setupPanMode();
        } else if (this.mouseMode === 'lasso') {
            this.setupLassoMode();
        }
    }

    // 设置拖拽模式
    setupPanMode() {
        const { zoomOuter, zoomInner } = this.branchLayout;
        
        zoomOuter.style('cursor', 'grab');
        
        zoomOuter.on('mousedown.mode', (event) => {
            if (event.button !== 0) return;
            this.viewState.isPanning = true;
            this.viewState.panStart = [event.clientX - this.viewState.translateX, event.clientY - this.viewState.translateY];
            zoomOuter.style('cursor', 'grabbing');
            event.preventDefault();
        });
        
        d3.select(window).on('mousemove.mode', (event) => {
            if (!this.viewState.isPanning) return;
            this.viewState.translateX = event.clientX - this.viewState.panStart[0];
            this.viewState.translateY = event.clientY - this.viewState.panStart[1];
            zoomInner.style('transform', `translate(${this.viewState.translateX}px, ${this.viewState.translateY}px) scale(${this.viewState.scale})`);
            this.updateConnectors();
        }).on('mouseup.mode', () => {
            if (this.viewState.isPanning) {
                this.viewState.isPanning = false;
                zoomOuter.style('cursor', 'grab');
            }
        });
    }

    // 设置套索模式
    setupLassoMode() {
        const { zoomOuter, overlay, overlayG } = this.branchLayout;
        
        zoomOuter.style('cursor', 'crosshair');
        
        zoomOuter.on('mousedown.mode', (event) => {
            if (event.button !== 0) return;
            
            const rect = zoomOuter.node().getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            this.lassoData.isDrawing = true;
            this.lassoData.path = [[x, y]];
            
            // 创建套索路径
            if (!this.lassoData.lassoGroup) {
                this.lassoData.lassoGroup = overlayG.append('g').attr('class', 'lasso-group');
            }
            
            this.lassoData.lassoGroup.selectAll('*').remove();
            this.lassoData.lassoGroup.append('path')
                .attr('class', 'lasso-path')
                .style('fill', 'rgba(0, 100, 255, 0.1)')
                .style('stroke', '#0066ff')
                .style('stroke-width', '2px')
                .style('stroke-dasharray', '5,5')
                .style('pointer-events', 'none');
            
            event.preventDefault();
        });
        
        d3.select(window).on('mousemove.mode', (event) => {
            if (!this.lassoData.isDrawing) return;
            
            const rect = zoomOuter.node().getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            this.lassoData.path.push([x, y]);
            this.updateLassoPath();
        }).on('mouseup.mode', () => {
            if (this.lassoData.isDrawing) {
                this.lassoData.isDrawing = false;
                this.finalizeLasso();
            }
        });
    }

    // 更新套索路径显示
    updateLassoPath() {
        if (!this.lassoData.lassoGroup || this.lassoData.path.length < 2) return;
        
        const line = d3.line()
            .x(d => d[0])
            .y(d => d[1])
            .curve(d3.curveLinear);
        
        // 闭合路径
        const closedPath = [...this.lassoData.path, this.lassoData.path[0]];
        
        this.lassoData.lassoGroup.select('.lasso-path')
            .attr('d', line(closedPath));
    }

    // 完成套索选择
    finalizeLasso() {
        const selectedNodes = this.getNodesInLasso();
        
        if (selectedNodes.length > 0) {
            this.handleLassoSelection(selectedNodes);
        }
        
        // 清除套索路径
        setTimeout(() => this.clearLassoPath(), 500);
    }

    // 获取套索内的节点
    getNodesInLasso() {
        if (!this.lassoData.path || this.lassoData.path.length < 3) return [];
        
        const selectedNodes = [];
        const { zoomOuter, zoomInner } = this.branchLayout;
        
        // 保存对 LineageVis 实例的引用
        const self = this;
        
        // 获取所有 LineageChart 节点
        zoomInner.selectAll('.branch-chart').each(function() {
            const chartElement = d3.select(this);
            const rect = this.getBoundingClientRect();
            const outerRect = zoomOuter.node().getBoundingClientRect();
            
            // 计算节点在 zoomOuter 坐标系中的中心点
            const centerX = rect.left + rect.width / 2 - outerRect.left;
            const centerY = rect.top + rect.height / 2 - outerRect.top;
            
            // 检查点是否在套索内 - 使用 self 而不是 this
            if (self.pointInPolygon([centerX, centerY], self.lassoData.path)) {
                const cellType = chartElement.attr('data-cell');
                const key = chartElement.attr('data-key');
                const depth = +chartElement.attr('data-depth') || 0;
                
                if (cellType && key) {
                    selectedNodes.push({
                        cellType,
                        key,
                        depth,
                        element: this, // 这里的 this 是 DOM 元素，这是正确的
                        paths: self.nodePathMap[key] || []
                    });
                }
            }
        });
        
        return selectedNodes;
    }

    // 点在多边形内判断（射线法）
    pointInPolygon(point, polygon) {
        const [x, y] = point;
        let inside = false;
        
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];
            
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        
        return inside;
    }

    // 处理套索选择结果
    async handleLassoSelection(selectedNodes) {
        console.log('Lasso selected nodes:', selectedNodes);
        
        // 收集所有选中节点的路径和描述符
        const allSelectedPaths = [];
        const pathDescriptors = [];
        
        selectedNodes.forEach(node => {
            if (node.paths && node.paths.length > 0) {
                allSelectedPaths.push(...node.paths);
            }
            
            // 根据节点类型和深度获取具体细胞
            const specificCells = this.getSpecificCellsForNode(node);
            
            if (specificCells.length > 0) {
                // 创建描述符格式，与原有的 ensureLeafPanel 保持一致
                pathDescriptors.push({
                    label: node.cellType,
                    specificCells: specificCells
                });
            }
        });
        
        if (pathDescriptors.length === 0) {
            console.warn('No specific cells found for selected nodes');
            return;
        }
        
        console.log('Selected path descriptors:', pathDescriptors);
        
        // 获取邻居细胞并生成 OverallCommChart
        try {
            const neighborCells = await this.getAllNeighborCells(pathDescriptors);
            
            console.log('Generated neighbor cells:', neighborCells);
            
            // 触发右侧面板显示
            document.dispatchEvent(new CustomEvent('showNeighborDetails', {
                detail: {
                    pathCells: pathDescriptors,
                    neighborCells: neighborCells,
                    title: `套索选择 (${selectedNodes.length} 个节点)`
                }
            }));
            
            console.log('showNeighborDetails event dispatched with detail:', {
                pathCells: pathDescriptors,
                neighborCells: neighborCells,
                title: `套索选择 (${selectedNodes.length} 个节点)`
            });
            
        } catch (error) {
            console.error('Error processing lasso selection:', error);
        }
    }

    // 根据节点获取具体细胞列表
    getSpecificCellsForNode(node) {
        console.log('Getting specific cells for node:', node);
        
        if (node.paths && node.paths.length > 0) {
            // 从路径中提取该深度的具体细胞
            const cells = this.getSpecificCellsAtDepth(node.paths, node.depth);
            console.log(`From paths at depth ${node.depth}:`, cells);
            return cells;
        }
        
        // 如果没有路径信息，尝试从节点映射中获取
        if (this.nodePathMap[node.key]) {
            const cells = this.getSpecificCellsAtDepth(this.nodePathMap[node.key], node.depth);
            console.log(`From nodePathMap[${node.key}] at depth ${node.depth}:`, cells);
            return cells;
        }
        
        console.log('No specific cells found for node:', node);
        return [];
    }

    // 清除套索路径
    clearLassoPath() {
        if (this.lassoData.lassoGroup) {
            this.lassoData.lassoGroup.remove();
            this.lassoData.lassoGroup = null;
        }
        this.lassoData.path = [];
        this.lassoData.isDrawing = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 创建全局实例以便在控制台中访问
    window.lineageVis = new LineageVis('#lineageVisContainer');
});