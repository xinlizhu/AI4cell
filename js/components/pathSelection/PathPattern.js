import { PathViewer } from './PathView.js';

class PathPattern {
    constructor(containerId) {
        this.container = d3.select(containerId);
        if (this.container.empty()) {
            console.error(`Container ${containerId} not found.`);
            return;
        }
        this.csvFilePath = './js/components/pathSelection/Path/path_analysis_results_KJ.csv';
        this.pathsSummaryPath = './js/components/pathSelection/Path/paths_summary_KJ.csv';
        this.allPatterns = [];
        this.allPaths = [];
        this.selectedCells = [];
        this.colors = {
            'Heart': '#d4b365', 'Neural crest': '#5B9BD5', 'Branchial arch': '#70AD47',
            'AGM': '#00B050', 'Liver': '#FF6D01', 'Cavity': '#404040',
            'Blood vessel': '#E1819E', 'Brain': '#8B4513', 'Connective tissue': '#9966CC',
            'Dermomyotome': '#FF69B4', 'Head mesenchyme': '#20B2AA', 'Lung primordium': '#FF4500',
            'Mesenchyme': '#DAA520', 'Notochord': '#4682B4', 'Sclerotome': '#32CD32',
            'Spinal cord': '#8A2BE2', 'Surface ectoderm': '#FF1493', 'Urogenital ridge': '#00CED1'
        };
        this.init();
    }

    async init() {
        await this.loadData();
        this.render();
        this.addEventListeners();
    }

    async loadData() {
        try {
            const [patternsData, pathsData] = await Promise.all([
                d3.csv(this.csvFilePath, d => ({
                    start: d.start,
                    end: d.end,
                    path_num: +d.path_num,
                    path_length: +d.path_length
                })),
                d3.csv(this.pathsSummaryPath)
            ]);
            
            this.allPatterns = patternsData;
            this.allPaths = pathsData;

            console.log('Path patterns loaded:', this.allPatterns);
            console.log('All detail paths loaded:', this.allPaths);
        } catch (error) {
            console.error('Error loading CSV data:', error);
        }
    }

    addEventListeners() {
        document.addEventListener('cellSelectionChange', (event) => {
            this.selectedCells = event.detail.selectedCells || [];
            console.log('PathPattern received cell selection change:', this.selectedCells);
            this.removePathDetailView();
            this.updateVisualization();
        });
    }

    render() {
        this.container.selectAll('*').remove();
        this.container.append('h3').attr('class', 'pattern-header').text('Path Patterns');
        this.listContainer = this.container.append('div').attr('class', 'pattern-list');
        this.updateVisualization();
    }

    updateVisualization() {
        let filteredData = this.allPatterns;

        if (this.selectedCells.length > 0) {
            filteredData = this.allPatterns.filter(p =>
                this.selectedCells.includes(p.start) || this.selectedCells.includes(p.end)
            );
        }

        // 统一右侧节点位置：中间留出固定宽度区域，内部条形的宽度编码平均路径长度，高度编码路径数
    // 收窄列宽与间距以适配左侧 450px 面板，右列更靠左且不产生水平滚动
    const connectorAreaWidth = 150; // 中间连接区更窄
    const leftColWidth = 110;       // 左列更紧凑
    const rightColWidth = 110;      // 右列更紧凑
        const lenExtent = d3.extent(filteredData, d => +d.path_length || 0);
        const safeLenDomain = (lenExtent && isFinite(lenExtent[0]) && isFinite(lenExtent[1]) && lenExtent[0] !== lenExtent[1])
            ? lenExtent
            : [Math.max(1, (lenExtent && lenExtent[0]) || 2), Math.max(2, ((lenExtent && lenExtent[1]) || 8) + 1)];
        const pathLengthScale = d3.scaleLinear().domain(safeLenDomain).range([30, connectorAreaWidth]);

        const numExtent = d3.extent(filteredData, d => +d.path_num || 0);
        const safeNumDomain = (numExtent && isFinite(numExtent[0]) && isFinite(numExtent[1]) && numExtent[0] !== numExtent[1])
            ? numExtent
            : [Math.max(0, (numExtent && numExtent[0]) || 1), Math.max(1, ((numExtent && numExtent[1]) || 30) + 1)];
    // 将条形高度范围翻倍，配合更高的容器实现“框高度翻倍”
    const pathNumScale = d3.scaleLinear().domain(safeNumDomain).range([8, 32]);

        const patterns = this.listContainer.selectAll('.pattern-item')
            .data(filteredData, d => `${d.start}-${d.end}`);

        patterns.exit().remove();

        const patternsEnter = patterns.enter()
            .append('div')
            .attr('class', 'pattern-item')
            .on('click', (event, d) => {
                // 检查点击是否来自下拉框内部
                if (event.target.closest('.path-view-dropdown')) {
                    return; // 如果点击来自下拉框内部，不处理
                }
                
                const currentItem = d3.select(event.currentTarget);
                const isSelected = currentItem.classed('selected');

                this.listContainer.selectAll('.pattern-item').classed('selected', false);
                this.removePathDetailView();

                if (!isSelected) {
                    currentItem.classed('selected', true);
                    this.showPatternTreeView(currentItem, d);
                    this.triggerPatternSelection(d.start, d.end);
                } else {
                    this.triggerPatternSelection(null, null);
                }
            });

        const contentEnter = patternsEnter.append('div')
            .attr('class', 'pattern-item-content')
            // 改为网格三列：左列/连接区/右列固定宽度，锁定起点与终点位置
            .style('display', 'grid')
            .style('grid-template-columns', `${leftColWidth}px ${connectorAreaWidth}px ${rightColWidth}px`)
            .style('align-items', 'center')
            .style('column-gap', '8px')
            .style('padding', '6px 8px')
            .style('width', '100%');

        const leftWrap = contentEnter.append('div')
            .attr('class', 'pattern-node-wrapper')
            .style('width', `${leftColWidth}px`)
            .style('display', 'flex')
            .style('justify-content', 'flex-end')
            .style('align-items', 'center');

        leftWrap.append('div')
            .attr('class', 'pattern-node start-node')
            .style('width', `${leftColWidth}px`)
            .style('white-space', 'nowrap')
            .style('overflow', 'hidden')
            .style('text-overflow', 'ellipsis')
            .style('background-color', d => this.colors[d.start] || '#ccc')
            .text(d => d.start);

        // 固定宽度的中间连接区域，内部条形宽度=平均路径长度，高度=路径数
        const connWrap = contentEnter.append('div')
            .attr('class', 'pattern-connection-wrap')
            .style('width', `${connectorAreaWidth}px`)
            // 将连接区域高度从 24px 提升到 48px，使单项高度近似翻倍
            .style('height', '48px')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'flex-start')
            .style('overflow', 'hidden');

        connWrap.append('div')
            .attr('class', 'pattern-connection')
            .style('height', d => `${pathNumScale(d.path_num)}px`)
            .style('width', d => `${Math.max(4, Math.min(connectorAreaWidth, pathLengthScale(d.path_length)))}px`)
            .style('margin', '0') // 移除左右外边距，避免溢出挤压右列
            .style('background', '#c7ccd4')
            .style('border-radius', '3px')
            .style('flex-shrink', '0');

        const rightWrap = contentEnter.append('div')
            .attr('class', 'pattern-node-wrapper')
            .style('width', `${rightColWidth}px`)
            .style('display', 'flex')
            .style('justify-content', 'flex-start')
            .style('align-items', 'center');

        rightWrap.append('div')
            .attr('class', 'pattern-node end-node')
            .style('width', `${rightColWidth}px`)
            .style('white-space', 'nowrap')
            .style('overflow', 'hidden')
            .style('text-overflow', 'ellipsis')
            .style('background-color', d => this.colors[d.end] || '#ccc')
            .text(d => d.end);
    }

    // 修改为显示树状图而不是原来的PathViewer
    showPatternTreeView(patternElement, patternData) {
        console.log('Showing pattern tree view for:', patternData);
        
        // 根据选中的pattern筛选路径
        const filteredPaths = this.filterPathsByPattern(patternData);
        console.log('Filtered paths for pattern:', filteredPaths);

        if (filteredPaths.length === 0) {
            const dropdownContainer = patternElement
                .append('div')
                .attr('class', 'path-view-dropdown')
                .style('padding', '20px')
                .style('text-align', 'center')
                .style('color', '#999')
                .on('click', (event) => {
                    event.stopPropagation(); // 阻止事件冒泡
                });
            
            dropdownContainer.append('p')
                .text('没有找到匹配该模式的路径');
            return;
        }

        // 创建下拉容器
        const dropdownContainer = patternElement
            .append('div')
            .attr('class', 'path-view-dropdown')
            .style('margin-top', '10px')
            // 固定为整行宽度
            .style('align-self', 'stretch')
            // 抵消父容器 .pattern-item 的左右 5px 内边距，左右贴边
            .style('width', 'calc(100% + 10px)')
            .style('margin-left', '-5px')
            .style('margin-right', '-5px')
            .style('box-sizing', 'border-box')
            .style('border', '1px solid #ddd')
            .style('border-radius', '5px')
            .style('background-color', '#fff')
            .style('box-shadow', '0 2px 8px rgba(0,0,0,0.1)')
            .on('click', (event) => {
                event.stopPropagation(); // 阻止事件冒泡
            });

        // 添加标题和关闭按钮
        const titleBar = dropdownContainer.append('div')
            .style('padding', '10px 14px')
            .style('border-bottom', '1px solid #eee')
            .style('background-color', '#f8f9fa')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('align-items', 'center');
            
        titleBar.append('span')
            .style('font-weight', 'bold')
            .text(`${patternData.start} → ${patternData.end} 路径树 (${filteredPaths.length} 条路径)`);
            
        // 添加关闭按钮
        titleBar.append('button')
            .text('×')
            .style('border', 'none')
            .style('background', 'none')
            .style('font-size', '18px')
            .style('cursor', 'pointer')
            .style('color', '#666')
            .style('padding', '0 5px')
            .on('click', (event) => {
                event.stopPropagation();
                patternElement.classed('selected', false);
                this.removePathDetailView();
                this.triggerPatternSelection(null, null);
            });

        // 创建树状图容器
        const treeContainer = dropdownContainer.append('div')
            .attr('class', 'pattern-tree-container')
            .style('width', '100%')
            .style('height', '500px')
            .style('overflow', 'auto')
            .style('padding', '10px');

        // 创建树状图可视化
        new PatternTreeVisualization(treeContainer, filteredPaths, this.colors);
    }

    // 根据pattern筛选路径的函数
    filterPathsByPattern(patternData) {
        return this.allPaths.filter(path => {
            // 检查路径是否以指定的起点和终点开始和结束
            const pathNodes = path.path_string.split(' -> ');
            if (pathNodes.length === 0) return false;

            const startNode = pathNodes[0].trim();
            const endNode = pathNodes[pathNodes.length - 1].trim();

            // 提取细胞类型（去掉数字后缀）
            const startCellType = this.extractCellType(startNode);
            const endCellType = this.extractCellType(endNode);

            return startCellType === patternData.start && endCellType === patternData.end;
        });
    }

    // 提取细胞类型的辅助函数
    extractCellType(nodeName) {
        const parts = nodeName.split('_');
        if (parts.length >= 3) {
            return parts.slice(0, -2).join('_');
        }
        return nodeName;
    }

    removePathDetailView() {
        this.listContainer.selectAll('.path-view-dropdown').remove();
    }

    triggerPatternSelection(startCell, endCell) {
        const event = new CustomEvent('patternSelected', {
            detail: {
                start_cell: startCell,
                end_cell: endCell
            }
        });
        document.dispatchEvent(event);
        console.log(`Pattern selected, dispatched event with:`, { start_cell: startCell, end_cell: endCell });
    }
}

// 创建专门用于Pattern的树状图可视化类
class PatternTreeVisualization {
    constructor(container, pathsData, colors) {
        this.container = container;
        this.pathsData = pathsData;
        this.colors = colors;
        this.selectedBranches = new Set();
        this.width = 800;
        this.height = 450;
        
        this.init();
    }
    
    init() {
        this.container.selectAll('*').remove();
        this.createControlPanel();
        
        this.svg = this.container.append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .style('border', '1px solid #ddd')
            .style('border-radius', '3px')
            .on('click', (event) => {
                event.stopPropagation(); // 阻止SVG点击事件冒泡
            });
            
        this.g = this.svg.append('g')
            .attr('transform', 'translate(30, 30)');
            
        const zoom = d3.zoom()
            .scaleExtent([0.5, 3])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });
            
        this.svg.call(zoom);
        this.render();
    }
    
    createControlPanel() {
        const controlPanel = this.container.append('div')
            .style('margin-bottom', '8px')
            .style('padding', '8px')
            .style('background-color', '#f8f9fa')
            .style('border-radius', '3px')
            .style('display', 'flex')
            .style('gap', '8px')
            .style('align-items', 'center')
            .style('font-size', '12px')
            .on('click', (event) => {
                event.stopPropagation(); // 阻止控制面板点击事件冒泡
            });
            
        controlPanel.append('span')
            .style('font-weight', 'bold')
            .text('控制:');
            
        controlPanel.append('button')
            .text('展开')
            .style('padding', '4px 8px')
            .style('border', 'none')
            .style('border-radius', '2px')
            .style('background-color', '#4ecdc4')
            .style('color', 'white')
            .style('cursor', 'pointer')
            .style('font-size', '11px')
            .on('click', (event) => {
                event.stopPropagation(); // 阻止按钮点击事件冒泡
                this.expandAll();
            });
            
        controlPanel.append('button')
            .text('折叠')
            .style('padding', '4px 8px')
            .style('border', 'none')
            .style('border-radius', '2px')
            .style('background-color', '#45b7d1')
            .style('color', 'white')
            .style('cursor', 'pointer')
            .style('font-size', '11px')
            .on('click', (event) => {
                event.stopPropagation(); // 阻止按钮点击事件冒泡
                this.collapseAll();
            });
            
        this.selectionInfo = controlPanel.append('span')
            .style('margin-left', 'auto')
            .style('font-weight', 'bold')
            .style('color', '#333')
            .style('font-size', '11px')
            .text(`${this.pathsData.length} 条路径`);
    }
    
    render() {
        // 使用PathView.js中的相同函数构建树
        const treeData = this.buildPathTree(this.pathsData);
        const hierarchyData = this.convertToD3Hierarchy(treeData);
        const root = d3.hierarchy(hierarchyData);
        
        // 适应较小尺寸的布局
        const treeLayout = d3.tree()
            .nodeSize([60, 150]) // 更紧凑的节点间距
            .separation((a, b) => {
                const aNameLength = a.data.name ? a.data.name.length : 0;
                const bNameLength = b.data.name ? b.data.name.length : 0;
                const baseSpacing = a.parent === b.parent ? 1.2 : 1.8;
                const lengthFactor = Math.max(aNameLength, bNameLength) / 15;
                return baseSpacing + lengthFactor;
            });
        
        // 初始折叠深度大于1的节点，保持紧凑
        root.descendants().forEach(d => {
            if (d.depth > 1) {
                d._children = d.children;
                d.children = null;
            }
        });
        
        treeLayout(root);
        this.root = root;
        this.drawTree(root);
    }
    
    buildPathTree(paths) {
        const tree = { name: 'root', children: {}, paths: [], count: 0, id: 'root' };
        
        const pathArrays = paths.map(path => ({
            // 规范化节点：trim、去后缀，并过滤空白/无效项
            nodes: path.path_string
                .split(' -> ')
                .map(s => this.extractCellType(String(s || '').trim()))
                .filter(n => n && n.toLowerCase() !== 'root'),
            pathData: path
        }));
        
    const buildSubTree = (parentNode, currentDepth, remainingPaths) => {
            if (remainingPaths.length === 0 || currentDepth >= 15) return;
            
            const groups = {};
            remainingPaths.forEach(pathInfo => {
                if (pathInfo.nodes.length > currentDepth) {
            const nodeName = pathInfo.nodes[currentDepth];
            if (!nodeName || nodeName.toLowerCase() === 'root') return; // 跳过空节点
                    if (!groups[nodeName]) groups[nodeName] = [];
                    groups[nodeName].push(pathInfo);
                }
            });
            
            Object.keys(groups).forEach(nodeName => {
                const nodeId = parentNode.id === 'root' ? nodeName : `${parentNode.id}-${nodeName}`;
                
                if (!parentNode.children[nodeId]) {
                    parentNode.children[nodeId] = {
                        name: nodeName, children: {}, paths: [], count: 0,
                        depth: currentDepth, id: nodeId, parent: parentNode
                    };
                }
                
                const childNode = parentNode.children[nodeId];
                groups[nodeName].forEach(pathInfo => childNode.paths.push(pathInfo.pathData));
                childNode.count = groups[nodeName].length;
                buildSubTree(childNode, currentDepth + 1, groups[nodeName]);
            });
        };
        
        buildSubTree(tree, 0, pathArrays);
        return tree;
    }
    
    convertToD3Hierarchy(treeNode) {
        // 如果是虚拟根且只有一个子节点，直接返回该子节点，避免出现空节点
        if (treeNode.name === 'root') {
            const rootChildren = Object.values(treeNode.children || {});
            if (rootChildren.length === 1) {
                return this.convertToD3Hierarchy(rootChildren[0]);
            }
        }

        const children = Object.values(treeNode.children);
        return {
            name: treeNode.name, id: treeNode.id || 'root', depth: treeNode.depth || 0,
            paths: treeNode.paths || [], count: treeNode.count || 0,
            children: children.length > 0 ? children.map(child => this.convertToD3Hierarchy(child)) : null
        };
    }
    
    extractCellType(nodeName) {
        const parts = nodeName.split('_');
        if (parts.length >= 3) {
            return parts.slice(0, -2).join('_');
        }
        return nodeName;
    }
    
    drawTree(root) {
        this.g.selectAll('*').remove();
        
        const nodes = root.descendants();
        const links = root.links();
        
        console.log('Drawing tree with nodes:', nodes.length, 'links:', links.length);
        
        // 绘制连接线
        this.g.selectAll('.tree-link')
            .data(links)
            .enter().append('path')
            .attr('class', 'tree-link')
            .attr('d', d => {
                const source = d.source;
                const target = d.target;
                return `M${source.y},${source.x}
                        C${(source.y + target.y) / 2},${source.x}
                         ${(source.y + target.y) / 2},${target.x}
                         ${target.y},${target.x}`;
            })
            .style('fill', 'none')
            .style('stroke', '#999')
            .style('stroke-width', 1)
            .style('stroke-opacity', 0.6);
            
        // 绘制节点
        const nodeGroups = this.g.selectAll('.tree-node')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'tree-node')
            .attr('transform', d => `translate(${d.y}, ${d.x})`)
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                event.stopPropagation();
                this.handleNodeClick(event, d);
            });
            
        // 节点背景
        nodeGroups.append('rect')
            .attr('class', 'node-bg')
            .attr('x', d => {
                const textLength = (d.data.name || '').length;
                const width = Math.max(80, textLength * 6 + 20);
                return -width/2;
            })
            .attr('y', -12)
            .attr('width', d => {
                const textLength = (d.data.name || '').length;
                return Math.max(80, textLength * 6 + 20);
            })
            .attr('height', 24)
            .attr('rx', 4)
            .style('fill', d => {
                if (d.data.name === 'root') return 'transparent';
                return this.colors[d.data.name] || '#e0e0e0';
            })
            .style('stroke', d => (d.data.name === 'root' ? 'none' : '#333'))
            .style('stroke-width', 1)
            .style('opacity', 0.9);
            
        // 节点文本
        nodeGroups.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .style('fill', 'white')
            .style('text-shadow', '1px 1px 1px rgba(0,0,0,0.7)')
            .text(d => {
                if (d.data.name === 'root') return '';
                return `${d.data.name} (${d.data.count})`;
            });
            
        // 展开/折叠按钮 - 只为有子节点的节点添加
        const nodesWithChildren = nodeGroups.filter(d => {
            const hasChildren = (d.children || d._children) && d.data.name !== 'root';
            if (hasChildren) {
                console.log(`Node ${d.data.name} has children:`, !!d.children, 'or _children:', !!d._children);
            }
            return hasChildren;
        });
        
        console.log('Nodes with children:', nodesWithChildren.size());
        
        nodesWithChildren.append('circle')
            .attr('class', 'toggle-btn')
            .attr('cx', d => {
                const textLength = (d.data.name || '').length;
                const width = Math.max(80, textLength * 6 + 20);
                return width/2 + 10;
            })
            .attr('cy', 0)
            .attr('r', 8)
            .style('fill', '#fff')
            .style('stroke', '#333')
            .style('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                event.stopPropagation();
                console.log('Toggle button clicked for:', d.data.name);
                console.log('Node state before toggle:', {
                    hasChildren: !!d.children,
                    hasHiddenChildren: !!d._children
                });
                this.toggle(d);
                this.updateTree();
            });
            
        nodesWithChildren.append('text')
            .attr('x', d => {
                const textLength = (d.data.name || '').length;
                const width = Math.max(80, textLength * 6 + 20);
                return width/2 + 10;
            })
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .style('pointer-events', 'none')
            .text(d => {
                const symbol = d.children ? '−' : '+';
                console.log(`Button symbol for ${d.data.name}:`, symbol, 'children:', !!d.children);
                return symbol;
            });
    }
    
    // 添加节点点击处理方法
    handleNodeClick(event, d) {
        if (d.data.name === 'root') return;
        
        console.log('Node clicked:', d.data.name); // 调试日志
        
        const nodeId = d.data.id;
        
        // 默认单选；按住 Ctrl/Shift/Meta 时进行多选切换
        const isMulti = event.ctrlKey || event.shiftKey || event.metaKey;
        if (!isMulti) {
            this.selectedBranches.clear();
        }

        if (this.selectedBranches.has(nodeId)) {
            this.selectedBranches.delete(nodeId);
        } else {
            this.selectedBranches.add(nodeId);
        }
        
        this.updateNodeSelection();
        this.filterAndTriggerPaths();

        // 额外：向 LineageVis 通知“单个树节点被点击”，用于增量分叉渲染
        try {
            const chain = d.ancestors()
                .reverse()
                .filter(n => n.data.name !== 'root')
                .map(n => n.data.name);
        const evt = new CustomEvent('treeNodeSelected', {
                detail: {
                    nodeId,
                    depth: d.depth,
                    chain,
            isLeaf: !(d.children || d._children),
                    // 该节点下包含的路径集合（已聚合）
                    paths: d.data.paths || [],
                    // 模式下的全部路径集合，用于计算每一层的前缀聚合
                    allPaths: this.pathsData || []
                }
            });
            document.dispatchEvent(evt);
        } catch (e) {
            console.warn('treeNodeSelected 事件派发失败:', e);
        }
    }
    
    updateNodeSelection() {
        this.g.selectAll('.tree-node .node-bg')
            .style('stroke-width', d => {
                return this.selectedBranches.has(d.data.id) ? 3 : 1;
            })
            .style('stroke', d => {
                return this.selectedBranches.has(d.data.id) ? '#ff6b6b' : '#333';
            })
            .style('opacity', d => {
                return this.selectedBranches.has(d.data.id) ? 1 : 0.9;
            });
    }
    
    filterAndTriggerPaths() {
        if (this.selectedBranches.size === 0) {
            this.selectionInfo.text(`${this.pathsData.length} 条路径`);
            return;
        }
        
        const selectedPaths = this.getUnionPaths(); // 并集
        this.selectionInfo.text(`已选择 ${selectedPaths.length} 条路径 (并集)`);
        
        // 计算所选分支的最大深度，用于限制展示层级（选到哪就展示到哪）
        let depthLimit = null;
        if (this.selectedBranches.size > 0) {
            let maxDepth = -1;
            Array.from(this.selectedBranches).forEach(branchId => {
                const node = this.findNodeById(this.root, branchId);
                if (node && typeof node.data.depth === 'number') {
                    if (node.data.depth > maxDepth) maxDepth = node.data.depth;
                }
            });
            if (maxDepth >= 0) depthLimit = maxDepth + 1; // depth 从0开始，展示位数=depth+1
        }
        
        // 触发路径选择事件，传递给其他组件
        const event = new CustomEvent('pathSelected', {
            detail: {
                selectedPath: selectedPaths,
                isMultiple: true,
                depthLimit
            }
        });
        document.dispatchEvent(event);
        console.log('触发Pattern树状路径选择事件:', selectedPaths);
    }
    
    // 新的方法：获取所有选中分支的路径并集
    getUnionPaths() {
        if (this.selectedBranches.size === 0) return [];
        
        const allSelectedPaths = new Map(); // 使用Map避免重复路径
        
        // 收集所有选中分支的路径
        Array.from(this.selectedBranches).forEach(branchId => {
            const node = this.findNodeById(this.root, branchId);
            if (node && node.data.paths) {
                node.data.paths.forEach(path => {
                    // 使用path_id作为key避免重复
                    allSelectedPaths.set(path.path_id, path);
                });
            }
        });
        
        return Array.from(allSelectedPaths.values());
    }
    
    // 保留原来的交集方法
    getIntersectionPaths() {
        if (this.selectedBranches.size === 0) return [];
        
        const branchPaths = Array.from(this.selectedBranches).map(branchId => {
            const node = this.findNodeById(this.root, branchId);
            return node ? node.data.paths : [];
        });
        
        let intersectionPaths = branchPaths[0] || [];
        
        for (let i = 1; i < branchPaths.length; i++) {
            intersectionPaths = intersectionPaths.filter(path => 
                branchPaths[i].some(otherPath => otherPath.path_id === path.path_id)
            );
        }
        
        return intersectionPaths;
    }
    
    findNodeById(node, id) {
        if (node.data.id === id) return node;
        
        if (node.children) {
            for (const child of node.children) {
                const found = this.findNodeById(child, id);
                if (found) return found;
            }
        }
        
        if (node._children) {
            for (const child of node._children) {
                const found = this.findNodeById(child, id);
                if (found) return found;
            }
        }
        
        return null;
    }
    
    toggle(d) {
        console.log('Toggling node:', d.data.name);
        console.log('Before toggle - children:', d.children, '_children:', d._children);
        
        if (d.children) {
            d._children = d.children;
            d.children = null;
            console.log('Collapsed node:', d.data.name);
        } else if (d._children) {
            d.children = d._children;
            d._children = null;
            console.log('Expanded node:', d.data.name);
        } else {
            console.log('Node has no children to toggle:', d.data.name);
        }
        
        console.log('After toggle - children:', d.children, '_children:', d._children);
    }
    
    updateTree() {
        console.log('Updating tree...'); // 调试日志
        
        // 不要重新调用 render()，而是重新计算布局并更新现有树
        const treeLayout = d3.tree()
            .nodeSize([60, 150])
            .separation((a, b) => {
                const aNameLength = a.data.name ? a.data.name.length : 0;
                const bNameLength = b.data.name ? b.data.name.length : 0;
                const baseSpacing = a.parent === b.parent ? 1.2 : 1.8;
                const lengthFactor = Math.max(aNameLength, bNameLength) / 15;
                return baseSpacing + lengthFactor;
            });
        
        // 重新计算布局
        treeLayout(this.root);
        
        // 重新绘制树，但保持状态
        this.drawTree(this.root);
        
        // 恢复选择状态
        this.updateNodeSelection();
    }
    
    expandAll() {
        console.log('Expanding all nodes...');
        let expandedCount = 0;
        this.root.descendants().forEach(d => {
            if (d._children) {
                d.children = d._children;
                d._children = null;
                expandedCount++;
            }
        });
        console.log(`Expanded ${expandedCount} nodes`);
        this.updateTree();
    }
    
    collapseAll() {
        console.log('Collapsing all nodes...');
        let collapsedCount = 0;
        this.root.descendants().forEach(d => {
            if (d.children && d.depth > 0) { // 不折叠根节点
                d._children = d.children;
                d.children = null;
                collapsedCount++;
            }
        });
        console.log(`Collapsed ${collapsedCount} nodes`);
        this.updateTree();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PathPattern('#pathPatternContainer');
});