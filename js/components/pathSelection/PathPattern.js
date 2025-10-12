class PathPattern {
    constructor(containerId) {
        this.container = d3.select(containerId);
        if (this.container.empty()) {
            console.error(`Container ${containerId} not found.`);
            return;
        }
        this.csvFilePath = './js/components/pathSelection/Path/path_analysis_results_KJ_L4.csv';
        this.pathsSummaryPath = './js/components/pathSelection/Path/paths_summary_KJ_L4.csv';
        this.allPatterns = [];
        this.allPaths = [];
        this.selectedCells = [];
        this.colors = {
        'Heart': '#EF778C', // 浅红色
        'Neural crest': '#7BC031', // 绿色
        'Branchial arch': '#BA956A', // 棕色
        'AGM': '#B624D9', // 紫色
        'Liver': '#57A4E8', // 蓝色
        'Cavity': '#B13E00', // 橙色
        'Brain': '#F9D7BE', // 米色
        'Connective tissue': '#1B71CE', // 深蓝色
        'Dermomyotome': '#EE4FF9', // 粉紫色
        'Mesenchyme': '#D3245A', // 深红色
        'Notochord': '#EF833A', // 橙色
        'Sclerotome': '#35586D' // 深灰色
        };
        this.init();
    }

    async init() {
        this.addStyles();
        await this.loadData();
        this.render();
        this.addEventListeners();
    }

    addStyles() {
        // 添加CSS样式
        if (!document.getElementById('pathpattern-styles')) {
            const style = document.createElement('style');
            style.id = 'pathpattern-styles';
            style.textContent = `
                .pattern-node .node-circle {
                    transition: all 0.2s ease;
                }
                
                .pattern-node:hover .node-circle {
                    transform: scale(1.1);
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
                }
                
                .pattern-node:hover .node-text {
                    font-weight: 600;
                    color: #222;
                }
                
                .pattern-item:hover {
                    background-color: rgba(0,0,0,0.02);
                }
                
                .pattern-item.selected {
                    background-color: rgba(33, 150, 243, 0.08);
                    border-left: 3px solid #2196F3;
                }
            `;
            document.head.appendChild(style);
        }
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

            // data loaded
        } catch (error) {
            console.error('Error loading CSV data:', error);
        }
    }

    addEventListeners() {
        document.addEventListener('cellSelectionChange', (event) => {
            this.selectedCells = event.detail.selectedCells || [];
            // selection changed
            this.removePathDetailView();
            this.updateVisualization();
        });
    }

    render() {
        this.container.selectAll('*').remove();
        this.container.append('h3').attr('class', 'pattern-header').text('Path Patterns');
        
        // 添加列标题
        const headerContainer = this.container.append('div')
            .attr('class', 'pattern-header-row')
            .style('display', 'grid')
            .style('grid-template-columns', '110px 110px 75px 75px')
            .style('column-gap', '8px')
            .style('padding', '6px 8px')
            .style('background', '#f8f9fa')
            .style('border-bottom', '1px solid #e0e0e0')
            .style('font-size', '11px')
            .style('font-weight', 'bold')
            .style('color', '#666');
            
        headerContainer.append('div').text('Start Node');
        headerContainer.append('div').text('End Node');
        headerContainer.append('div').text('Path Length').style('text-align', 'center');
        headerContainer.append('div').text('Path Count').style('text-align', 'center');
        
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

        // 统一右侧节点位置：中间分为两个独立的bar chart区域
        // 调整布局为四列：起始节点、结束节点、路径长度、路径个数
        const leftColWidth = 110;       // 起始节点列
        const rightColWidth = 110;      // 结束节点列
        const lengthBarWidth = 75;      // 路径长度bar chart列
        const countBarWidth = 75;       // 路径个数bar chart列
        const lenExtent = d3.extent(filteredData, d => +d.path_length || 0);
        const safeLenDomain = (lenExtent && isFinite(lenExtent[0]) && isFinite(lenExtent[1]) && lenExtent[0] !== lenExtent[1])
            ? lenExtent
            : [Math.max(1, (lenExtent && lenExtent[0]) || 2), Math.max(2, ((lenExtent && lenExtent[1]) || 8) + 1)];
        const pathLengthScale = d3.scaleLinear().domain(safeLenDomain).range([10, lengthBarWidth - 10]);

        const numExtent = d3.extent(filteredData, d => +d.path_num || 0);
        const safeNumDomain = (numExtent && isFinite(numExtent[0]) && isFinite(numExtent[1]) && numExtent[0] !== numExtent[1])
            ? numExtent
            : [Math.max(0, (numExtent && numExtent[0]) || 1), Math.max(1, ((numExtent && numExtent[1]) || 30) + 1)];
    // 将条形高度范围翻倍，配合更高的容器实现“框高度翻倍”
    const pathNumScale = d3.scaleLinear().domain(safeNumDomain).range([10, countBarWidth - 10]);

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
            // 改为网格四列：起始节点/结束节点/路径长度/路径个数
            .style('display', 'grid')
            .style('grid-template-columns', `${leftColWidth}px ${rightColWidth}px ${lengthBarWidth}px ${countBarWidth}px`)
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

        // 左侧节点：小圆圈 + 文字
        const leftNodeContainer = leftWrap.append('div')
            .attr('class', 'pattern-node start-node')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'flex-start')
            .style('width', `${leftColWidth}px`);
        
        // 左侧小圆圈（先添加，在文字前面）
        leftNodeContainer.append('div')
            .attr('class', 'node-circle')
            .style('width', '12px')
            .style('height', '12px')
            .style('border-radius', '0')
            .style('background-color', d => this.colors[d.start] || '#ccc')
            .style('border', 'none') /* 移除边框，减少视觉噪音 */
            .style('box-shadow', 'none') /* 移除阴影 */
            .style('flex-shrink', '0')
            .style('margin-right', '6px');
        
        // 左侧文字（放在圆圈后面）
        leftNodeContainer.append('span')
            .attr('class', 'node-text')
            .style('font-size', '12px')
            .style('font-weight', '500')
            .style('color', '#333')
            .style('white-space', 'nowrap')
            .style('overflow', 'hidden')
            .style('text-overflow', 'ellipsis')
            .style('max-width', `${leftColWidth - 20}px`) // 留空间给圆圈
            .text(d => d.start);

        const rightWrap = contentEnter.append('div')
            .attr('class', 'pattern-node-wrapper')
            .style('width', `${rightColWidth}px`)
            .style('display', 'flex')
            .style('justify-content', 'flex-start')
            .style('align-items', 'center');

        // 右侧节点：小圆圈 + 文字
        const rightNodeContainer = rightWrap.append('div')
            .attr('class', 'pattern-node end-node')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'flex-start')
            .style('width', `${rightColWidth}px`);
        
        // 右侧小圆圈（先添加，在文字左侧）
        rightNodeContainer.append('div')
            .attr('class', 'node-circle')
            .style('width', '12px')
            .style('height', '12px')
            .style('border-radius', '0')
            .style('background-color', d => this.colors[d.end] || '#ccc')
            .style('border', 'none') /* 移除边框，减少视觉噪音 */
            .style('box-shadow', 'none') /* 移除阴影 */
            .style('flex-shrink', '0')
            .style('margin-right', '6px');
        
        // 右侧文字
        rightNodeContainer.append('span')
            .attr('class', 'node-text')
            .style('font-size', '12px')
            .style('font-weight', '500')
            .style('color', '#333')
            .style('white-space', 'nowrap')
            .style('overflow', 'hidden')
            .style('text-overflow', 'ellipsis')
            .style('max-width', `${rightColWidth - 20}px`) // 留空间给圆圈
            .text(d => d.end);

        // 路径长度 bar chart
        const lengthBarWrap = contentEnter.append('div')
            .attr('class', 'pattern-length-bar-wrap')
            .style('width', `${lengthBarWidth}px`)
            .style('height', '24px')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'flex-start')
            .style('position', 'relative');

        lengthBarWrap.append('div')
            .attr('class', 'pattern-length-bar')
            .style('height', '12px')
            .style('width', d => `${pathLengthScale(d.path_length)}px`)
            .style('background', '#5d5d5dff') // 改为灰白色
            .style('border-radius', '2px')
            .style('position', 'relative')
            .style('flex-shrink', '0');

        // 添加路径长度数值标签
        lengthBarWrap.append('span')
            .attr('class', 'length-label')
            .style('position', 'absolute')
            .style('left', d => `${pathLengthScale(d.path_length) + 5}px`)
            .style('top', '50%')
            .style('transform', 'translateY(-50%)')
            .style('font-size', '10px')
            .style('color', '#666')
            .text(d => d.path_length);

        // 路径个数 bar chart  
        const countBarWrap = contentEnter.append('div')
            .attr('class', 'pattern-count-bar-wrap')
            .style('width', `${countBarWidth}px`)
            .style('height', '24px')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'flex-start')
            .style('position', 'relative');

        countBarWrap.append('div')
            .attr('class', 'pattern-count-bar')
            .style('height', '12px')
            .style('width', d => `${pathNumScale(d.path_num)}px`)
            .style('background', '#5d5d5dff') // 改为更浅的灰白色
            .style('border-radius', '2px')
            .style('position', 'relative')
            .style('flex-shrink', '0');

        // 添加路径个数数值标签
        countBarWrap.append('span')
            .attr('class', 'count-label')
            .style('position', 'absolute')
            .style('left', d => `${pathNumScale(d.path_num) + 5}px`)
            .style('top', '50%')
            .style('transform', 'translateY(-50%)')
            .style('font-size', '10px')
            .style('color', '#666')
            .text(d => d.path_num);
    }

    showPatternTreeView(patternElement, patternData) {
    // show tree view
        // 根据选中的pattern筛选路径
        const filteredPaths = this.filterPathsByPattern(patternData);
    // filtered paths

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

        const dropdownContainer = patternElement
            .append('div')
            .attr('class', 'path-view-dropdown compact')
            .on('click', (event) => event.stopPropagation());

        new PatternTreeVisualization(dropdownContainer, filteredPaths, this.colors);
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
    // event dispatched
    }
}

// 创建专门用于Pattern的树状图可视化类
class PatternTreeVisualization {
    constructor(container, pathsData, colors) {
        this.container = container;
        this.pathsData = pathsData;
        this.colors = colors;
        this.selectedBranches = new Set();
        this.width = 370;
        this.height = 340;
        
        this.init();
    }
    
    init() {
    this.container.selectAll('*').remove();
    this.selectionInfo = null;

        this.svg = this.container.append('svg')
            .attr('class','path-tree-svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .on('click', e => e.stopPropagation());
        this.g = this.svg.append('g').attr('transform','translate(30,30)');
        const zoom = d3.zoom().scaleExtent([0.5,3]).on('zoom', (ev)=> this.g.attr('transform', ev.transform));
        this.svg.call(zoom);
        this.render();
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
        
    // draw tree
        
        // 绘制连接线
        this.g.selectAll('.tree-link')
            .data(links)
            .enter().append('path')
            .attr('class', 'tree-link')
            .attr('d', d => {
                const source = d.source;
                const target = d.target;
                
                // 节点布局：展开按钮(-35) -> 圆圈(-20) -> 文字(-10及以后)
                // 我们需要让连接线从右侧连接到左侧，避开所有元素
                
                // 计算文字长度来确定右边界
                const sourceTextLength = (source.data.name || '').length;
                const targetTextLength = (target.data.name || '').length;
                
                // 源节点右边界：文字结束位置 + 安全距离
                const sourceRightBound = Math.max(sourceTextLength * 5, 40) + 10;
                // 目标节点左边界：展开按钮位置 - 安全距离  
                const targetLeftBound = -45;
                
                // 连接线起点：源节点右侧
                const sourceX = source.x;
                const sourceY = source.y + sourceRightBound;
                
                // 连接线终点：目标节点左侧
                const targetX = target.x; 
                const targetY = target.y + targetLeftBound;
                
                // 使用L形连接线，避免穿过节点
                // 先水平延伸，再垂直，最后水平连接
                const midY = sourceY + (targetY - sourceY) * 0.7;
                
                return `M${sourceY},${sourceX}
                        C${midY},${sourceX}
                         ${midY},${targetX}
                         ${targetY},${targetX}`;
            })
            .style('fill', 'none')
            .style('stroke', '#100f0fff') /* 使用极淡的灰色 */
            .style('stroke-width', 0.5) /* 大幅减少线条粗细 */
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
            
        // 节点小圆圈
        nodeGroups.append('circle')
            .attr('class', 'node-circle')
            .attr('cx', -20) // 圆圈在文字左侧更远的位置
            .attr('cy', 0)
            .attr('r', 6)
            .style('fill', d => {
                if (d.data.name === 'root') return 'transparent';
                return this.colors[d.data.name] || '#e0e0e0';
            })
            .style('stroke', 'none') /* 移除边框 */
            .style('stroke-width', 0)
            .style('filter', 'none'); /* 移除阴影 */
            
        // 节点文本
        nodeGroups.append('text')
            .attr('x', -10) // 文字在圆圈右侧
            .attr('text-anchor', 'start') // 文字左对齐
            .attr('dy', '0.35em')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .style('fill', '#333')
            .style('text-shadow', 'none')
            .text(d => {
                if (d.data.name === 'root') return '';
                return `${d.data.name}`;
            });
            
        // 展开/折叠按钮 - 只为有子节点的节点添加
        const nodesWithChildren = nodeGroups.filter(d => {
            const hasChildren = (d.children || d._children) && d.data.name !== 'root';
            if (hasChildren) {
                // has children
            }
            return hasChildren;
        });
        
        console.log('Nodes with children:', nodesWithChildren.size());
        
        nodesWithChildren.append('circle')
            .attr('class', 'toggle-btn')
            .attr('cx', -35) // 展开按钮放在圆圈左侧固定位置
            .attr('cy', 0)
            .attr('r', 7)
            .style('fill', '#f5f5f5') /* 更淡的背景 */
            .style('stroke', '#d0d0d0') /* 更淡的边框 */
            .style('stroke-width', 1)
            .style('cursor', 'pointer')
            .style('filter', 'none') /* 移除阴影 */
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
            .attr('x', -35) // 展开按钮文字对应位置
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .style('pointer-events', 'none')
            .style('fill', '#666')
            .text(d => d.children ? '−' : '+');
    }
    
    // 添加节点点击处理方法
    handleNodeClick(event, d) {
        if (d.data.name === 'root') return;
        
    // node clicked
        
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
        this.g.selectAll('.tree-node .node-circle')
            .style('stroke-width', d => {
                return this.selectedBranches.has(d.data.id) ? 3 : 2;
            })
            .style('stroke', d => {
                return this.selectedBranches.has(d.data.id) ? '#ff6b6b' : 'white';
            })
            .style('r', d => {
                return this.selectedBranches.has(d.data.id) ? 8 : 6; // 选中时圆圈略大
            });
        
        // 同时更新文字样式
        this.g.selectAll('.tree-node text')
            .style('font-weight', d => {
                return this.selectedBranches.has(d.data.id) ? 'bold' : 'bold';
            })
            .style('fill', d => {
                return this.selectedBranches.has(d.data.id) ? '#ff6b6b' : '#333';
            });
    }
    
    filterAndTriggerPaths() {
        if (this.selectedBranches.size === 0) {
        // 移除数量更新显示
            return;
        }
        
        const selectedPaths = this.getUnionPaths(); // 并集
        if (this.selectionInfo && typeof this.selectionInfo.text === 'function') {
            this.selectionInfo.text(`已选择 ${selectedPaths.length} 条路径 (并集)`);
        }
        
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
    // trigger pathSelected
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
    // toggle node
        
        if (d.children) {
            d._children = d.children;
            d.children = null;
            // collapsed
        } else if (d._children) {
            d.children = d._children;
            d._children = null;
            // expanded
        } else {
            // no children
        }
        // toggled
    }
    
    updateTree() {
    // update tree
        
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
    // expand all
        let expandedCount = 0;
        this.root.descendants().forEach(d => {
            if (d._children) {
                d.children = d._children;
                d._children = null;
                expandedCount++;
            }
        });
    // expanded count: ${expandedCount}
        this.updateTree();
    }
    
    collapseAll() {
    // collapse all
        let collapsedCount = 0;
        this.root.descendants().forEach(d => {
            if (d.children && d.depth > 0) { // 不折叠根节点
                d._children = d.children;
                d.children = null;
                collapsedCount++;
            }
        });
    // collapsed count: ${collapsedCount}
        this.updateTree();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PathPattern('#pathPatternContainer');
});