import { LineageChart } from './LineageChart.js';
import { AreaChart } from './AreaChart.js';
import { OverallCommChart } from './OverallCommChart.js';
// 仅复用 PathView 的类型提取逻辑
import { extractCellType as pvExtractType } from './PathView.js';

class LineageVis {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.charts = [];
        this.areaCharts = [];
        this.pathCells = []; // 存储当前路径上的细胞
        this.pathCount = 0; // 用于跟踪路径数量
        this.registerEventListeners();
        this.initializeGlobalControls();
    // 树模式状态
    this.treeSessionId = 0;
    this.currentChain = [];
    this.currentPathsSubset = [];
    // 分叉布局状态：每一列代表 depth
    this.branchLayout = null; // {root, cols: Map(depth -> columnDiv)}
    this.renderedForkKeys = new Set(); // 去重：已渲染的链条 key（chain.join('->')）
    // 仅保留这两类类型的“最新叶子”总览面板
    this.leafPanelTypes = new Set(['AGM', 'Cavity']);
    }

    initializeGlobalControls() {
        // 在容器顶部放置一个全局清空按钮（若不存在）
        if (this.container.select('.lv-global-controls').empty()) {
            const bar = this.container
                .append('div')
                .attr('class', 'lv-global-controls')
                .style('display', 'flex')
                .style('justify-content', 'flex-end')
                .style('gap', '8px')
                .style('margin-bottom', '8px');
            bar.append('button')
                .text('清空')
                .style('padding', '4px 10px')
                .style('border', '1px solid #ccc')
                .style('border-radius', '4px')
                .style('background', '#fff')
                .style('cursor', 'pointer')
                .on('click', () => this.clearLineageView());
        }
    }

    registerEventListeners() {
        document.addEventListener('pathSelected', (event) => {
            const selectedPathData = event.detail.selectedPath;
            const isMultiple = event.detail.isMultiple;
            const depthLimit = event.detail.depthLimit; // 选到哪就展示到哪
            
            if (selectedPathData && selectedPathData.length > 0) {
                if (isMultiple) {
                    // 树状分叉模式：若已在分叉布局中，则只更新可用路径集合；否则创建树探索布局
                    if (this.branchLayout) {
                        this.currentPathsSubset = selectedPathData;
                    } else {
                        this.renderTreeExplorer(selectedPathData);
                    }
                } else {
                    // 单路径显示
                    const pathString = selectedPathData[0].path_string;
                    // 单路径也可按 depthLimit 截断
                    this.renderPath(depthLimit ? pathString.split(' -> ').slice(0, depthLimit).join(' -> ') : pathString, selectedPathData[0]);
                }
            } else {
                // 清空选择时不自动清空已展示的对比，保留用户添加的视图
            }
        });

        // 响应 PathPattern 树中单节点点击，实现“在当前 Lineage 上增量分叉”的需求
        document.addEventListener('treeNodeSelected', (event) => {
            const { chain, paths } = event.detail || {};
            if (!Array.isArray(chain) || chain.length === 0) return;
            this.renderIncrementalBranch(chain, paths || []);
        });
    }

    async renderLeafOverall(chain, pathsAtNode) {
        // 计算该叶子所在深度的具体细胞集合
        const depth = chain.length - 1;
        const allBasePaths = (Array.isArray(pathsAtNode) && pathsAtNode.length > 0)
            ? pathsAtNode
            : (this.currentPathsSubset || []);
        const used = allBasePaths.filter(p => {
            const nodes = p.path_string.split(' -> ').map(s => pvExtractType(s.trim()));
            if (nodes.length < chain.length) return false;
            for (let i = 0; i < chain.length; i++) if (nodes[i] !== chain[i]) return false;
            return true;
        });
        const specificCells = this.getSpecificCellsAtDepth(used, depth);
        if (!this.branchLayout) return;

        // 准备一个“叶子总览”列（在最后追加一列）
        const maxDepth = Math.max(...this.branchLayout.cols.keys(), -1);
        const leafColDepth = maxDepth + 1;
        let leafCol = this.branchLayout.cols.get(leafColDepth);
        if (!leafCol) {
            leafCol = this.branchLayout.root.append('div')
                .attr('class', `branch-col depth-${leafColDepth}`)
                .style('display', 'flex')
                .style('flex-direction', 'column')
                .style('gap', '12px');
            this.branchLayout.cols.set(leafColDepth, leafCol);
        }

        // 渲染 OverallCommChart 面板
        const panel = leafCol.append('div')
            .attr('class', 'leaf-overall')
            .style('background-color', '#f9f9f9')
            .style('border', '1px solid #ddd')
            .style('border-radius', '8px')
            .style('padding', '10px')
            .style('width', '520px')
            .style('height', '260px')
            .style('flex-shrink', '0');

        const containerId = `leaf-overall-${this.treeSessionId}-${Date.now()}`;
        panel.append('div').attr('id', containerId);

        // 统一成描述对象数组
        const descriptors = specificCells.map(c => ({ label: c, specificCells: [c] }));
        const neighbors = await this.getAllNeighborCells(descriptors);
        const chart = new OverallCommChart(containerId, descriptors, neighbors);
        await chart.render(()=>{});

        // 更新连线，使上一列节点连到“叶子总览”面板（以最近主节点为父）
        this.updateConnectors();
    }

    async renderPath(pathString) {
        // 增加路径计数
        this.pathCount++;
        
        // 解析路径字符串
        const pathCells = pathString.split(' -> ').map(s => s.trim());

        // 获取所有邻居细胞类型
        const allNeighborCells = await this.getAllNeighborCells(pathCells);
        
        // 为这个路径创建一个独立的容器
        const pathContainer = this.container.append('div')
            .attr('class', `path-container path-${this.pathCount}`)
            .style('margin-bottom', '40px')
            .style('border', '2px solid #e0e0e0')
            .style('border-radius', '10px')
            .style('padding', '20px')
            .style('background-color', '#fafafa');

        // 添加路径标题
        pathContainer.append('div')
            .attr('class', 'path-title')
            .style('text-align', 'center')
            .style('margin-bottom', '20px')
            .style('font-size', '16px')
            .style('font-weight', 'bold')
            .style('color', '#333')
            .text(`路径 ${this.pathCount}: ${pathString}`);

        // 添加删除按钮
        pathContainer.append('button')
            .attr('class', 'remove-path-btn')
            .style('position', 'absolute')
            .style('top', '10px')
            .style('right', '10px')
            .style('background', '#ff4444')
            .style('color', 'white')
            .style('border', 'none')
            .style('border-radius', '4px')
            .style('padding', '5px 10px')
            .style('cursor', 'pointer')
            .style('font-size', '12px')
            .text('删除')
            .on('click', () => {
                pathContainer.remove();
            });

        // 设置相对定位以便删除按钮定位
        pathContainer.style('position', 'relative');

        // 创建主要的并排容器（AreaChart和LineageCharts）
        const mainContainer = pathContainer.append('div')
            .attr('class', 'main-container')
            .style('display', 'flex')
            .style('gap', '30px')
            .style('justify-content', 'center')
            .style('align-items', 'flex-start');

        // 创建这个路径独有的图表数组
        const pathCharts = [];
        const pathAreaCharts = [];

    // 左侧替换为单一总体强度图（点击打开右侧详细）
    await this.createOverallChart(mainContainer, pathCells, allNeighborCells);

        // 创建LineageCharts容器
        const lineageContainer = mainContainer.append('div')
            .attr('class', 'lineage-container')
            .style('display', 'flex')
            .style('gap', '20px')
            .style('align-items', 'center');

        // 创建 LineageChart 容器
        pathCells.forEach((cellName, index) => {
            if (index > 0) {
                lineageContainer.append('div')
                    .attr('class', 'lineage-arrow')
                    .html('&rarr;')
                    .style('font-size', '24px')
                    .style('color', '#666')
                    .style('flex-shrink', '0')
                    .style('display', 'flex')
                    .style('align-items', 'center');
            }

            const wrapper = lineageContainer.append('div')
                .attr('class', 'lineage-chart-wrapper')
                .style('text-align', 'center')
                .style('flex-shrink', '0');

            wrapper.append('div')
                .attr('class', 'chart-title')
                .text(cellName)
                .style('margin-bottom', '10px')
                .style('font-weight', '600')
                .style('color', '#333');

            const chartContainerId = `lineage-chart-${this.pathCount}-${index}`;
            wrapper.append('div').attr('id', chartContainerId);

            const chart = new LineageChart(chartContainerId, cellName);
            pathCharts.push(chart);
        });

        // 将这个路径的图表添加到全局数组中
        this.charts.push(...pathCharts);
        this.areaCharts.push(...pathAreaCharts);

        this.renderDetailsWhenReady(pathCharts, pathAreaCharts, pathContainer);
    }

    async renderMultiplePaths(pathsData, depthLimit) {
        // 不清空现有内容，允许在下方继续追加展示
        
        if (pathsData.length === 0) return;
        
        this.pathCount++;
        
        // 分析所有路径，找出公共模式
    const mergedPathInfo = this.analyzePaths(pathsData, depthLimit);
        
        // 创建合并路径容器
        const pathContainer = this.container.append('div')
            .attr('class', `path-container path-${this.pathCount}`)
            .style('margin-bottom', '40px')
            .style('border', '2px solid #4CAF50')
            .style('border-radius', '10px')
            .style('padding', '20px')
            .style('background-color', '#f8fff8');

        // 添加标题
        pathContainer.append('div')
            .attr('class', 'path-title')
            .style('text-align', 'center')
            .style('margin-bottom', '20px')
            .style('font-size', '16px')
            .style('font-weight', 'bold')
            .style('color', '#2E7D32')
            .text(`合并路径组 (${pathsData.length} 条路径): ${mergedPathInfo.pattern}`);

        // 添加删除按钮
        pathContainer.append('button')
            .attr('class', 'remove-path-btn')
            .style('position', 'absolute')
            .style('top', '10px')
            .style('right', '10px')
            .style('background', '#ff4444')
            .style('color', 'white')
            .style('border', 'none')
            .style('border-radius', '4px')
            .style('padding', '5px 10px')
            .style('cursor', 'pointer')
            .style('font-size', '12px')
            .text('删除')
            .on('click', () => {
                pathContainer.remove();
            });

        pathContainer.style('position', 'relative');

        // 显示详细路径信息
        const detailsContainer = pathContainer.append('details')
            .style('margin-bottom', '20px');
            
        detailsContainer.append('summary')
            .style('cursor', 'pointer')
            .style('font-weight', 'bold')
            .style('color', '#666')
            .text('查看包含的路径详情');
            
        const pathList = detailsContainer.append('div')
            .style('margin-top', '10px')
            .style('max-height', '200px')
            .style('overflow-y', 'auto')
            .style('border', '1px solid #ddd')
            .style('border-radius', '4px')
            .style('padding', '10px');
            
        pathsData.forEach(path => {
            pathList.append('div')
                .style('margin-bottom', '5px')
                .style('padding', '5px')
                .style('background-color', '#f5f5f5')
                .style('border-radius', '3px')
                .style('font-size', '12px')
                .text(`路径 ${path.path_id}: ${path.path_string}`);
        });

        // 创建主要的并排容器
        const mainContainer = pathContainer.append('div')
            .attr('class', 'main-container')
            .style('display', 'flex')
            .style('gap', '30px')
            .style('justify-content', 'center')
            .style('align-items', 'flex-start');

        // 计算每个位置的具体细胞集合，并据此获取所有邻居细胞类型（合并场景：对具体细胞求和聚合）
    const positionSpecificCells = mergedPathInfo.cellTypes.map((_, index) => this.getSpecificCellsAtPosition(pathsData, index));
        const pathCellDescriptors = mergedPathInfo.cellTypes.map((type, index) => ({
            label: type,
            specificCells: positionSpecificCells[index]
        }));

        const allNeighborCells = await this.getAllNeighborCells(pathCellDescriptors);
        
        const pathCharts = [];
        const pathAreaCharts = [];

    // 左侧替换为单一总体强度图（点击打开右侧详细）
    await this.createOverallChart(mainContainer, pathCellDescriptors, allNeighborCells);

        // 创建LineageCharts容器
        const lineageContainer = mainContainer.append('div')
            .attr('class', 'lineage-container')
            .style('display', 'flex')
            .style('gap', '20px')
            .style('align-items', 'center');

    // 为每个细胞类型创建 LineageChart（按 depthLimit 已截断）
    mergedPathInfo.cellTypes.forEach((cellType, index) => {
            if (index > 0) {
                lineageContainer.append('div')
                    .attr('class', 'lineage-arrow')
                    .html('&rarr;')
                    .style('font-size', '24px')
                    .style('color', '#666')
                    .style('flex-shrink', '0')
                    .style('display', 'flex')
                    .style('align-items', 'center');
            }

            const wrapper = lineageContainer.append('div')
                .attr('class', 'lineage-chart-wrapper')
                .style('text-align', 'center')
                .style('flex-shrink', '0');

            wrapper.append('div')
                .attr('class', 'chart-title')
                .text(cellType)
                .style('margin-bottom', '10px')
                .style('font-weight', '600')
                .style('color', '#333');

            const chartContainerId = `lineage-chart-${this.pathCount}-${index}`;
            wrapper.append('div').attr('id', chartContainerId);

            // 获取该位置的所有具体细胞
            const specificCells = this.getSpecificCellsAtPosition(pathsData, index);
            
            const chart = new LineageChart(chartContainerId, cellType, specificCells, index, true);
            pathCharts.push(chart);
        });

        // 将图表添加到全局数组
        this.charts.push(...pathCharts);
        this.areaCharts.push(...pathAreaCharts);

        this.renderDetailsWhenReady(pathCharts, pathAreaCharts, pathContainer);
    }

    // --- 树状探索模式 ---
    renderTreeExplorer(pathsData) {
        // 清空并进入新的树会话（不再显示左侧树，仅保留右侧分叉区）
        this.container.selectAll('*').remove();
        this.treeSessionId += 1;
        this.currentChain = [];
        this.currentPathsSubset = pathsData;
        this.renderedForkKeys.clear();

        const chartPane = this.container
            .append('div')
            .attr('class', 'lcharts-pane')
            .style('border', '1px solid #ddd')
            .style('border-radius', '8px')
            .style('background', '#fafafa')
            .style('padding', '12px');

        // 控制栏：清空按钮
        const controls = chartPane.append('div')
            .attr('class', 'lv-controls')
            .style('display', 'flex')
            .style('justify-content', 'flex-end')
            .style('margin-bottom', '8px');
        controls.append('button')
            .text('清空')
            .style('padding', '4px 10px')
            .style('border', '1px solid #ccc')
            .style('border-radius', '4px')
            .style('background', '#fff')
            .style('cursor', 'pointer')
            .on('click', () => this.clearLineageView());



        const chartsRow = chartPane.append('div')
            .attr('class', 'charts-row')
            .style('display', 'flex')
            .style('gap', '24px')
            .style('align-items', 'stretch')
            .style('flex-wrap', 'nowrap')
            .style('overflow-x', 'auto')
            .style('position', 'relative')
            .style('padding', '8px 8px 8px 8px');

        // 覆盖连接线层（随着内容滚动）
        const overlay = chartsRow.append('svg')
            .attr('class', 'connector-layer')
            .style('position', 'absolute')
            .style('top', '0')
            .style('left', '0')
            .style('pointer-events', 'none')
            .style('z-index', '1');
        const overlayG = overlay.append('g');
        // 箭头
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

        // 初始化分叉布局容器
        this.branchLayout = {
            root: chartsRow,
            cols: new Map(),
            overlay,
            overlayG
        };

    // 监听滚动与窗口尺寸变化以更新连接线
    chartsRow.on('scroll', () => this.updateConnectors());
    window.addEventListener('resize', () => this.updateConnectors());
    }

    onTreeNodeClick(d, allPaths, chartsRow) {
        // 取从根到该节点（不含 root）的链条
        const chainNodes = d.ancestors().reverse().filter(n => n.data.name !== 'root');
        const newChain = chainNodes.map(n => n.data.name);

        // 计算两条链的最长公共前缀，避免重复绘制
        const common = this.getCommonPrefixLen(this.currentChain, newChain);

        // 移除多余的图（只移除超出公共前缀的部分）
        chartsRow.selectAll('.lchart-wrap')
            .filter(function() { return (+this.getAttribute('data-index')) >= common; })
            .remove();

        // 从公共前缀开始，逐层追加并基于路径子集聚合
        let subset = allPaths.slice();
        for (let i = 0; i < newChain.length; i++) {
            const cellType = newChain[i];
            subset = subset.filter(p => {
                const nodes = p.path_string.split(' -> ').map(s => pvExtractType(s.trim()));
                return nodes[i] === cellType;
            });

            if (i >= common) {
                const specificCells = this.getSpecificCellsAtDepth(subset, i);
                const wrap = chartsRow.append('div')
                    .attr('class', 'lchart-wrap')
                    .attr('data-index', i)
                    .style('text-align', 'center');
                wrap.append('div')
                    .attr('class', 'chart-title')
                    .style('margin-bottom', '8px')
                    .style('font-weight', '600')
                    .text(`${cellType}（${subset.length} 路径平均）`);
                const id = `tree-lineage-${this.treeSessionId}-${i}`;
                wrap.append('div').attr('id', id);
                // 使用合并模式（传 specificCells 列表，内部做平均/聚合）
                new LineageChart(id, cellType, specificCells, i, true);
            }
        }

        this.currentChain = newChain;
        this.currentPathsSubset = subset;
    }

    getCommonPrefixLen(a, b) {
        const len = Math.min(a.length, b.length);
        let i = 0;
        for (; i < len; i++) {
            if (a[i] !== b[i]) break;
        }
        return i;
    }

    getSpecificCellsAtDepth(paths, depth) {
        const cells = paths.map(p => {
            const parts = p.path_string.split(' -> ');
            return parts[depth] ? parts[depth].trim() : null;
        }).filter(Boolean);
        return [...new Set(cells)];
    }

    // 在当前布局基础上增量添加分叉
    renderIncrementalBranch(chain, pathsAtNode) {
        // 确保存在分叉布局容器
        if (!this.branchLayout) {
            // 若用户直接从 PathView 树点击而未开启 LineageVis 左树，我们创建一个简单的横向容器
            this.container.selectAll('*').remove();
            const wrapper = this.container.append('div')
                .attr('class', 'lcharts-pane')
                .style('border', '1px solid #ddd')
                .style('border-radius', '8px')
                .style('background', '#fafafa')
                .style('padding', '12px');
            // 控制栏
            const controls = wrapper.append('div')
                .style('display', 'flex')
                .style('justify-content', 'flex-end')
                .style('margin-bottom', '8px');
            controls.append('button')
                .text('清空')
                .style('padding', '4px 10px')
                .style('border', '1px solid #ccc')
                .style('border-radius', '4px')
                .style('background', '#fff')
                .style('cursor', 'pointer')
                .on('click', () => this.clearLineageView());

            const row = wrapper.append('div')
                .attr('class', 'charts-row')
                .style('display', 'flex')
                .style('gap', '16px')
                .style('align-items', 'flex-start')
                .style('flex-wrap', 'nowrap')
                .style('overflow-x', 'auto')
                .style('position', 'relative');
            const overlay = row.append('svg')
                .attr('class', 'connector-layer')
                .style('position', 'absolute')
                .style('top', '0')
                .style('left', '0')
                .style('pointer-events', 'none');
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
            this.branchLayout = { root: row, cols: new Map(), overlay, overlayG };

            // 监听滚动与窗口尺寸变化
            row.on('scroll', () => this.updateConnectors());
            window.addEventListener('resize', () => this.updateConnectors());
        }

        // 对于链上的每个 depth，准备对应的纵向列
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

        // 计算该节点路径子集：若传入 pathsAtNode 则优先使用，否则基于 currentPathsSubset 过滤
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

        // 路径式增量：
        // - 对每一层 i：若该列无主节点，则按当前链的前缀创建主节点（只建一次）
        // - 若已有主节点但与链上的类型不同，则在该列追加一个“分叉”节点（父为上一层的链前缀节点）
    const lastDepth = chain.length - 1;
        for (let i = 0; i <= lastDepth; i++) {
            const type = chain[i];
            const col = this.branchLayout.cols.get(i);
            const mainSel = col.select(`.branch-chart[data-main='1']`);
            const key = chain.slice(0, i + 1).join('->');
            const parentKey = i > 0 ? chain.slice(0, i).join('->') : null;

            if (mainSel.empty()) {
                // 创建主节点（只建一次）
                // 父已不再是叶子，移除父的叶子总览面板
                if (parentKey) {
                    this.branchLayout.root.selectAll(`.leaf-overall[data-leaf-of='${parentKey}']`).remove();
                }
                const used = prefixSubset(i + 1);
                const specific = this.getSpecificCellsAtDepth(used, i);
                const wrap = col.append('div')
                    .attr('class', 'branch-chart')
                    .attr('data-main', '1')
                    .attr('data-cell', type)
                    .attr('data-key', key)
                    .attr('data-parent-key', parentKey || '')
                    .attr('data-depth', String(i))
                    .style('text-align', 'center')
                    .style('width', '520px')
                    .style('margin', '0 auto');
                wrap.append('div')
                    .attr('class', 'chart-title')
                    .style('margin-bottom', '8px')
                    .style('font-weight', '600')
                    .text(`${type}（${used.length} 路径平均）`);
                const id = `branch-main-${this.treeSessionId}-${i}`;
                wrap.append('div').attr('id', id);
                new LineageChart(id, type, specific, i, true);
                // 仅当是“当前点击链的末端”时，创建该末端的总览面板
                if (i === lastDepth) this.ensureLeafPanel(key, i, used);
                continue; // 主节点刚建完，本层不再建分叉
            }

            // 已有主节点：
            // - 若类型不同 => 追加分叉
            // - 若类型相同但父链不同 => 也应追加分叉（避免不同父分支下的同名节点被误判为同一节点）
            const mainType = mainSel.attr('data-cell');
            const mainParentKey = mainSel.attr('data-parent-key') || '';
            if (mainType !== type || mainParentKey !== (parentKey || '')) {
                // 去重：检查是否已有该 key 的分叉
                if (this.renderedForkKeys.has(key) || !col.selectAll(`.branch-chart[data-key='${key}']`).empty()) {
                    // 已存在，跳过
                } else {
                    // 父已不再是叶子，移除父的叶子总览面板
                    if (parentKey) {
                        this.branchLayout.root.selectAll(`.leaf-overall[data-leaf-of='${parentKey}']`).remove();
                    }
                    const used = prefixSubset(i + 1);
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
                        .style('width', '520px')
                        .style('margin', '0 auto');
                    wrap.append('div')
                        .attr('class', 'chart-title')
                        .style('margin-bottom', '8px')
                        .text(`${type}（${used.length} 路径平均）`);
                    const id = `branch-fork-${this.treeSessionId}-${i}-${Math.floor(Math.random()*1e6)}`;
                    wrap.append('div').attr('id', id);
                    new LineageChart(id, type, specific, i, true);
                    this.renderedForkKeys.add(key);
                    // 仅当是“当前点击链的末端”时，创建该末端的总览面板
                    if (i === lastDepth) this.ensureLeafPanel(key, i, used);
                }
            }
        }

    // 在最后一列（链末端）追加一个分叉子项：以该节点对应的 subset 为基准
    // 最后一层若已有主节点且类型不同，上面的循环已在该层创建了分叉；若该列无主节点，上面的循环已建主节点

        // 更新连线（基于 data-parent-key 连接）
    this.updateConnectors();
    }

    async ensureLeafPanel(leafKey, depth, usedPaths) {
        if (!this.branchLayout) return;
        // 若面板已存在则不重复创建
        if (!this.branchLayout.root.selectAll(`.leaf-overall[data-leaf-of='${leafKey}']`).empty()) return;

        // 下一列用于放置叶子总览
        const colDepth = depth + 1;
        let col = this.branchLayout.cols.get(colDepth);
        if (!col) {
            col = this.branchLayout.root.append('div')
                .attr('class', `branch-col depth-${colDepth}`)
                .style('display', 'flex')
                .style('flex-direction', 'column')
                .style('gap', '12px');
            this.branchLayout.cols.set(colDepth, col);
        }

        // 构建“按深度聚合”的描述：label 使用细胞类型，specificCells 为该深度前缀匹配到的具体细胞集合
    const types = leafKey.split('->').map(s => s.trim()).filter(Boolean);
    // 关键修复：优先使用传入的 usedPaths（该叶子的专属子集），避免不同叶子共享同一总体数据
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
    const type = (types[types.length - 1] || '').trim();
    const neighbors = await this.getAllNeighborCells(descriptors);

        const panel = col.append('div')
            .attr('class', 'leaf-overall')
            .attr('data-leaf-of', leafKey)
            .attr('data-leaf-type', type)
            .attr('data-parent-key', leafKey)
            .attr('data-depth', String(colDepth))
            .style('background-color', '#f9f9f9')
            .style('border', '1px solid #ddd')
            .style('border-radius', '8px')
            .style('padding', '10px')
            .style('width', '520px')
            .style('height', '260px')
            .style('flex-shrink', '0');
        const containerId = `leaf-overall-${this.treeSessionId}-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
        panel.append('div').attr('id', containerId);
    const chart = new OverallCommChart(containerId, descriptors, neighbors);
        await chart.render(() => {
            const evt = new CustomEvent('showNeighborDetails', {
                detail: { pathCells: descriptors, neighborCells: neighbors }
            });
            document.dispatchEvent(evt);
        });

        // 渲染后刷新连线
        this.updateConnectors();
    }

    updateConnectors() {
        if (!this.branchLayout) return;
        const row = this.branchLayout.root.node();
        const overlay = this.branchLayout.overlay;
        const g = this.branchLayout.overlayG;
        if (!overlay || !g) return;

        // 尺寸覆盖整个内容区域
        overlay
            .attr('width', row.scrollWidth)
            .attr('height', row.scrollHeight);
        g.selectAll('*').remove();

        // 工具：取元素中心点（左右边缘中点）
        const getRect = el => el.getBoundingClientRect();
        const base = row.getBoundingClientRect();
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

        // 方案：对每个节点，优先按 data-parent-key 精确连线；找不到父节点时，再退化为“最近前一列的主节点”
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
            col.selectAll('.branch-chart, .leaf-overall').each((_, i, nodes) => {
                const node = nodes[i];
                const pk = node.getAttribute('data-parent-key') || '';
                const parent = findParentNode(pk, idx) || findNearestPrevMain(idx);
                if (!parent) return;
                const src = centerRight(parent);
                const dst = centerLeft(node);
                // 叶子总览使用虚线；分叉节点虚线；主节点实线
                const isLeafPanel = node.classList.contains('leaf-overall');
                const isFork = isLeafPanel || node.getAttribute('data-main') === '0';
                this.drawConnector(g, src, dst, isFork);
            });
        });
    }

    drawConnector(g, src, dst, dashed) {
        const mx = (src.x + dst.x) / 2;
        g.append('path')
            .attr('class', 'lv-connector')
            .attr('d', `M${src.x},${src.y} C${mx},${src.y} ${mx},${dst.y} ${dst.x},${dst.y}`)
            .attr('fill', 'none')
            .attr('stroke', '#999')
            .attr('stroke-width', 1.5)
            .attr('marker-end', 'url(#lv-arrow)')
            .attr('stroke-dasharray', dashed ? '4,3' : null);
    }

    clearLineageView() {
        // 清空分叉布局和旧的路径容器
        this.container.selectAll('*').remove();
        this.branchLayout = null;
        this.renderedForkKeys.clear();
        this.currentChain = [];
        this.currentPathsSubset = [];
        // 也清空旧模式的 path-container
        d3.selectAll('.path-container').remove();
    }

    async getAllNeighborCells(pathCellsOrDescriptors) {
        // 兼容两种输入：
        // 1) ["Cavity_1_78", "Brain_1_12", ...] 单路径具体细胞
        // 2) [{ label: "Cavity", specificCells: ["Cavity_1_78", "Cavity_1_82"] }, ...] 合并场景
        const allNeighborTypes = new Set();

        // 首先收集所有邻居细胞类型
        for (const item of pathCellsOrDescriptors) {
            const specificCells = typeof item === 'string' ? [item] : (item.specificCells || []);
            for (const cellName of specificCells) {
                try {
                    const totalPath = `./js/components/pathSelection/Every_cell_info_withKJ/${cellName}/${cellName}_total.csv`;
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

        // 计算每个邻居细胞的合计通讯强度（对所有具体细胞求和）
        const neighborsWithIntensity = [];
        for (const neighborType of allNeighborTypes) {
            let totalIntensity = 0;
            for (const item of pathCellsOrDescriptors) {
                const specificCells = typeof item === 'string' ? [item] : (item.specificCells || []);
                for (const cellName of specificCells) {
                    try {
                        const totalPath = `./js/components/pathSelection/Every_cell_info_withKJ/${cellName}/${cellName}_total.csv`;
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

    async createOverallChart(parentContainer, pathCellsOrDescriptors, neighborCells) {
        const panel = parentContainer.append('div')
            .attr('class', 'overall-comm-container')
            .style('background-color', '#f9f9f9')
            .style('border', '1px solid #ddd')
            .style('border-radius', '8px')
            .style('padding', '15px')
            .style('width', '500px')
            .style('height', '250px')
            .style('flex-shrink', '0');

        const containerId = `overall-comm-${this.pathCount}`;
        panel.append('div').attr('id', containerId);

        const chart = new OverallCommChart(containerId, pathCellsOrDescriptors, neighborCells);
        await chart.render(async () => {
            // 点击后在右侧显示邻居细节 area charts
            try {
                // 统一成描述对象数组，便于右侧复用 AreaChart
                const descriptors = Array.isArray(pathCellsOrDescriptors)
                    ? pathCellsOrDescriptors.map(item => (typeof item === 'string' ? { label: item, specificCells: [item] } : item))
                    : [];
                const neighbors = await this.getAllNeighborCells(descriptors);
                const event = new CustomEvent('showNeighborDetails', {
                    detail: { pathCells: descriptors, neighborCells: neighbors }
                });
                document.dispatchEvent(event);
            } catch (e) {
                console.warn('Failed to prepare neighbor details:', e);
            }
        });
    }

    renderDetailsWhenReady(pathCharts, pathAreaCharts, pathContainer) {
        const allPromises = [
            ...pathCharts.map(chart => chart.dataLoaded),
            ...pathAreaCharts.map(chart => chart.dataLoaded)
        ];

        Promise.all(allPromises)
            .then(() => {
                this.renderLegend(pathContainer);
            })
            .catch(error => {
                console.error("一个或多个图表加载失败，无法渲染详情:", error);
            });
    }

    renderLegend(pathContainer) {
        pathContainer.select('.lineage-legend').remove();
        const legendContainer = pathContainer.append('div')
            .attr('class', 'lineage-legend');
        const explanationItem = legendContainer.append('div')
            .attr('class', 'legend-item explanation');
    }

    // 添加清空所有路径的方法
    clearAllPaths() {
        this.container.selectAll('.path-container').remove();
        this.charts = [];
        this.areaCharts = [];
        this.pathCount = 0;
    }

    analyzePaths(pathsData, depthLimit) {
        // 分析路径，提取公共模式
        const allPathNodes = pathsData.map(path => 
            path.path_string.split(' -> ').map(s => this.extractCellType(s.trim()))
        );
        
        // 找出最短路径长度作为基准
        const minLength = Math.min(...allPathNodes.map(nodes => nodes.length));
        const limit = depthLimit ? Math.min(depthLimit, minLength) : minLength;
        
        // 构建公共模式
        const pattern = [];
        for (let i = 0; i < limit; i++) {
            const cellTypesAtPosition = allPathNodes.map(nodes => nodes[i]);
            const uniqueCellTypes = [...new Set(cellTypesAtPosition)];
            
            if (uniqueCellTypes.length === 1) {
                pattern.push(uniqueCellTypes[0]);
            } else {
                // 如果有多种细胞类型，选择最常见的
                const counts = {};
                cellTypesAtPosition.forEach(type => {
                    counts[type] = (counts[type] || 0) + 1;
                });
                const mostCommon = Object.keys(counts).reduce((a, b) => 
                    counts[a] > counts[b] ? a : b
                );
                pattern.push(mostCommon);
            }
        }
        
        return {
            pattern: pattern.join(' -> '),
            cellTypes: pattern,
            pathCount: pathsData.length
        };
    }

    getSpecificCellsAtPosition(pathsData, position) {
        const specificCells = pathsData.map(path => {
            const nodes = path.path_string.split(' -> ');
            return nodes[position] ? nodes[position].trim() : null;
        }).filter(cell => cell !== null);
        
        return [...new Set(specificCells)]; // 去重
    }

    extractCellType(nodeName) {
        return nodeName.split('_')[0];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 创建全局实例以便在控制台中访问
    window.lineageVis = new LineageVis('#lineageVisContainer');
});