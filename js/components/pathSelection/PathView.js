// 读取 CSV 文件
const csvFilePath = './js/components/pathSelection/Path/paths_summary_KJ_L4.csv';

// 用于存储路径数据
let pathsData = [];

// 用于存储选中的细胞
let selectedCells = [];

// 确保在 DOM 加载完成后再注册事件监听器
document.addEventListener('DOMContentLoaded', () => {
    console.log('PathView.js DOM 加载完成，注册事件监听器');
    
    // 监听 cellSelectionChange 事件
    document.addEventListener('cellSelectionChange', (event) => {
        selectedCells = event.detail.selectedCells || [];
        console.log('PathView.js 接收到细胞选择变化:', selectedCells);
        updateVisualization();
    });
    
    // 初始化可视化
    initializeVisualization();
});

// 初始化可视化
function initializeVisualization() {
    console.log('初始化可视化');
    // 初始化容器
    initializeContainer();
    
    d3.csv(csvFilePath).then(data => {
        pathsData = data;
        console.log('加载的路径数据:', pathsData);
        
        // 初始显示所有路径
        updateVisualization();
    }).catch(error => {
        console.error('加载CSV文件失败:', error);
    });
}

// 初始化容器
function initializeContainer() {
    console.log('初始化容器开始'); // 调试日志
    const container = d3.select('#pathViewContainer');
    console.log('PathView容器查找结果:', container); // 调试日志
    console.log('PathView容器是否为空:', container.empty()); // 调试日志
    
    
    container.selectAll('*').remove();
    
    const listContainer = container
        .append('div')
        .attr('class', 'path-list-container')
        .style('max-height', '600px')
        .style('overflow-y', 'auto')
        .style('padding', '10px')
        .style('border', '1px solid #ddd') // 添加边框以便调试
        .style('background-color', '#fff'); // 添加背景色以便调试
    
    console.log('列表容器创建完成:', listContainer); // 调试日志
}

// 根据选中的细胞筛选路径
function filterPathsBySelectedCells(data) {
    if (!selectedCells || selectedCells.length === 0) {
        return data;
    }
    
    return data.filter(path => {
        return selectedCells.every(cellType => 
            path.path_string.toLowerCase().includes(cellType.toLowerCase())
        );
    });
}

// 更新可视化 - 只保留这一个版本
function updateVisualization() {
    console.log('更新可视化，当前选中细胞:', selectedCells);
    
    if (!pathsData || pathsData.length === 0) {
        console.log('路径数据为空，跳过更新');
        return;
    }
    
    const filteredPaths = filterPathsBySelectedCells(pathsData);
    console.log('筛选后的路径:', filteredPaths);
    console.log('筛选后的路径数量:', filteredPaths.length);
    
    // 显示前几条路径的结构
    if (filteredPaths.length > 0) {
        console.log('第一条路径示例:', filteredPaths[0]);
        console.log('路径字符串示例:', filteredPaths[0].path_string);
    }
    
    const container = d3.select('#pathViewContainer .path-list-container');
    console.log('容器查找结果:', container); // 调试容器是否找到
    console.log('容器是否为空:', container.empty()); // 检查容器是否为空
    
    container.selectAll('*').remove();
    
    if (filteredPaths.length === 0) {
        container.append('p')
            .style('color', '#999')
            .style('text-align', 'center')
            .text('没有找到匹配的路径');
        return;
    }
    
    // 添加视图切换按钮
    console.log('准备添加视图切换按钮'); // 调试日志
    const viewToggle = container.append('div')
        .attr('class', 'view-toggle')
        .style('margin-bottom', '15px')
        .style('text-align', 'center')
        .style('background-color', '#f0f0f0') // 添加背景色以便调试
        .style('padding', '10px')
        .style('border', '1px solid #ccc'); // 添加边框以便调试
    
    console.log('视图切换容器创建完成:', viewToggle); // 调试日志
        
    const treeButton = viewToggle.append('button')
        .text('树状视图')
        .style('margin-right', '10px')
        .style('padding', '8px 16px')
        .style('border', 'none')
        .style('border-radius', '4px')
        .style('background-color', '#4CAF50')
        .style('color', 'white')
        .style('cursor', 'pointer')
        .on('click', () => {
            console.log('点击了树状视图按钮'); // 调试日志
            showTreeView(filteredPaths);
        });
    
    console.log('树状视图按钮创建完成:', treeButton); // 调试日志
        
    const listButton = viewToggle.append('button')
        .text('列表视图')
        .style('padding', '8px 16px')
        .style('border', 'none')
        .style('border-radius', '4px')
        .style('background-color', '#2196F3')
        .style('color', 'white')
        .style('cursor', 'pointer')
        .on('click', () => {
            console.log('点击了列表视图按钮'); // 调试日志
            showListView(filteredPaths);
        });
    
    console.log('列表视图按钮创建完成:', listButton); // 调试日志
    
    // 默认显示列表视图
    console.log('准备显示默认列表视图'); // 调试日志
    showTreeView(filteredPaths); // 改为默认显示树状视图
}

// 触发路径选择事件
function triggerPathSelection(selectedPath) {
    const event = new CustomEvent('pathSelected', {
        detail: {
            selectedPath: selectedPath
        }
    });
    document.dispatchEvent(event);
    console.log('触发路径选择事件:', selectedPath);
}

// 高亮显示选中的细胞类型
function highlightSelectedCells(pathString, selectedCells) {
    if (!selectedCells || selectedCells.length === 0) {
        return pathString;
    }
    
    let highlightedString = pathString;
    
    selectedCells.forEach(cellType => {
        const regex = new RegExp(`(${cellType})`, 'gi');
        highlightedString = highlightedString.replace(regex, 
            '<span style="background-color: #ffeb3b; color: #d84315; font-weight: bold;">$1</span>'
        );
    });
    
    return highlightedString;
}

// 修改提取细胞类型函数
function extractCellType(nodeName) {
    // 处理像 "Neural crest_1_71" 这样的格式
    // 找到最后两个下划线的位置，提取前面的部分作为细胞类型
    const parts = nodeName.split('_');
    if (parts.length >= 3) {
        // 移除最后两个数字部分，保留细胞类型
        return parts.slice(0, -2).join('_');
    }
    return nodeName; // 如果格式不符合预期，返回原始名称
}

// 替换 buildPathTree 函数 - 使用递归方式构建真正的树
function buildPathTree(paths) {
    console.log('Building tree from paths:', paths);
    
    const tree = {
        name: 'root',
        children: {},
        paths: [],
        count: 0,
        id: 'root'
    };
    
    // 为每条路径构建路径数组
    const pathArrays = paths.map(path => ({
        nodes: path.path_string.split(' -> ').map(s => extractCellType(s.trim())),
        pathData: path
    }));
    
    console.log('Path arrays:', pathArrays);
    
    // 递归构建树
    function buildSubTree(parentNode, currentDepth, remainingPaths) {
        if (remainingPaths.length === 0 || currentDepth >= 20) { // 防止无限递归
            return;
        }
        
        // 按当前深度的节点名称分组
        const groups = {};
        remainingPaths.forEach(pathInfo => {
            if (pathInfo.nodes.length > currentDepth) {
                const nodeName = pathInfo.nodes[currentDepth];
                if (!groups[nodeName]) {
                    groups[nodeName] = [];
                }
                groups[nodeName].push(pathInfo);
            }
        });
        
        // 为每个分组创建子节点
        Object.keys(groups).forEach(nodeName => {
            const nodeId = parentNode.id === 'root' ? nodeName : `${parentNode.id}-${nodeName}`;
            
            if (!parentNode.children[nodeId]) {
                parentNode.children[nodeId] = {
                    name: nodeName,
                    children: {},
                    paths: [],
                    count: 0,
                    depth: currentDepth,
                    id: nodeId,
                    parent: parentNode
                };
            }
            
            const childNode = parentNode.children[nodeId];
            
            // 添加路径到当前节点
            groups[nodeName].forEach(pathInfo => {
                childNode.paths.push(pathInfo.pathData);
            });
            childNode.count = groups[nodeName].length;
            
            // 递归构建子树
            buildSubTree(childNode, currentDepth + 1, groups[nodeName]);
        });
    }
    
    // 开始构建树
    buildSubTree(tree, 0, pathArrays);
    
    console.log('Built tree structure:', tree);
    return tree;
}

// 将树结构转换为D3层次数据
function convertToD3Hierarchy(treeNode) {
    // 若根为 'root' 且只有一个子节点，直接下沉到其子节点，避免显示一个空白根节点
    if (treeNode.name === 'root') {
        const rootChildren = Object.values(treeNode.children || {});
        if (rootChildren.length === 1) {
            return convertToD3Hierarchy(rootChildren[0]);
        }
    }
    const children = Object.values(treeNode.children);
    return {
        name: treeNode.name,
        id: treeNode.id || 'root',
        depth: treeNode.depth || 0,
        paths: treeNode.paths || [],
        count: treeNode.count || 0,
        children: children.length > 0 ? children.map(child => convertToD3Hierarchy(child)) : null
    };
}

// 树状可视化类
class PathTreeVisualization {
    constructor(container, pathsData) {
        this.container = container;
        this.pathsData = pathsData;
        this.selectedBranches = new Set();
        this.width = 1200; // 增加宽度
        this.height = 800; // 增加高度
        this.nodeSize = [200, 60]; // 增加节点大小以适应长名称
        
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
    
    init() {
        this.container.selectAll('*').remove();
        this.createControlPanel();
        
        this.svg = this.container.append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .style('border', '1px solid #ddd')
            .style('border-radius', '5px');
            
        this.g = this.svg.append('g')
            .attr('transform', 'translate(40, 40)'); // 增加边距
            
        const zoom = d3.zoom()
            .scaleExtent([0.3, 2]) // 允许更小的缩放
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });
            
        this.svg.call(zoom);
        this.render();
    }
    
    createControlPanel() {
        const controlPanel = this.container.append('div')
            .attr('class', 'tree-control-panel')
            .style('margin-bottom', '10px')
            .style('padding', '10px')
            .style('background-color', '#f5f5f5')
            .style('border-radius', '5px')
            .style('display', 'flex')
            .style('gap', '10px')
            .style('align-items', 'center');
            
        controlPanel.append('span')
            .style('font-weight', 'bold')
            .text('路径树控制:');
            
        // 添加模式切换按钮
        this.isUnionMode = true; // 默认使用并集模式
        
        this.modeButton = controlPanel.append('button')
            .text('模式: 并集 (OR)')
            .style('padding', '5px 10px')
            .style('border', 'none')
            .style('border-radius', '3px')
            .style('background-color', '#28a745')
            .style('color', 'white')
            .style('cursor', 'pointer')
            .on('click', () => this.toggleMode());
            
        controlPanel.append('button')
            .text('清除选择')
            .style('padding', '5px 10px')
            .style('border', 'none')
            .style('border-radius', '3px')
            .style('background-color', '#ff6b6b')
            .style('color', 'white')
            .style('cursor', 'pointer')
            .on('click', () => this.clearSelection());
            
        controlPanel.append('button')
            .text('展开全部')
            .style('padding', '5px 10px')
            .style('border', 'none')
            .style('border-radius', '3px')
            .style('background-color', '#4ecdc4')
            .style('color', 'white')
            .style('cursor', 'pointer')
            .on('click', () => this.expandAll());
            
        controlPanel.append('button')
            .text('折叠全部')
            .style('padding', '5px 10px')
            .style('border', 'none')
            .style('border-radius', '3px')
            .style('background-color', '#45b7d1')
            .style('color', 'white')
            .style('cursor', 'pointer')
            .on('click', () => this.collapseAll());
            
        this.selectionInfo = controlPanel.append('span')
            .style('margin-left', 'auto')
            .style('font-weight', 'bold')
            .style('color', '#333')
            .text('未选择路径');
    }
    
    render() {
        console.log('Rendering tree with data:', this.pathsData);
        
        // 构建树结构
        const treeData = buildPathTree(this.pathsData);
        console.log('Tree data built:', treeData);
        
        let hierarchyData = convertToD3Hierarchy(treeData);
        // 兜底：如果仍为 'root' 且只有一个子对象，直接使用该子对象
        if (hierarchyData && hierarchyData.name === 'root' && Array.isArray(hierarchyData.children) && hierarchyData.children.length === 1) {
            hierarchyData = hierarchyData.children[0];
        }
        console.log('Hierarchy data:', hierarchyData);

        const root = d3.hierarchy(hierarchyData);
        console.log('D3 hierarchy root:', root);
        
        // 计算树的深度和节点数量来动态调整尺寸
        const maxDepth = root.height;
        const nodeCount = root.descendants().length;
        
        // 动态调整画布尺寸
        this.width = Math.max(1200, maxDepth * 180 + 200);
        this.height = Math.max(800, nodeCount * 60 + 200);
        
        // 更新SVG尺寸
        this.svg.attr('width', this.width).attr('height', this.height);
        
        // 创建D3树布局 - 使用nodeSize来避免重叠
        const treeLayout = d3.tree()
            .nodeSize([80, 200]) // 增加垂直和水平间距
            .separation((a, b) => {
                // 根据节点名称长度动态调整间距
                const aNameLength = a.data.name ? a.data.name.length : 0;
                const bNameLength = b.data.name ? b.data.name.length : 0;
                const baseSpacing = a.parent === b.parent ? 1.5 : 2;
                const lengthFactor = Math.max(aNameLength, bNameLength) / 10;
                return baseSpacing + lengthFactor;
            });
        
        // 初始折叠深度大于2的节点，减少重叠
        root.descendants().forEach(d => {
            if (d.depth > 2) {
                d._children = d.children;
                d.children = null;
            }
        });
        
        treeLayout(root);
        
        // 调整根节点位置到合适的起始位置
        root.x0 = this.height / 2;
        root.y0 = 100;
        
        this.root = root;
        this.drawTree(root);
    }
    
    drawTree(root) {
        console.log('Drawing tree, root descendants:', root.descendants());
        
        // 清除现有内容
        this.g.selectAll('*').remove();
        
        const nodes = root.descendants();
        const links = root.links();
        
        // 绘制连接线
        const linkSelection = this.g.selectAll('.tree-link')
            .data(links);
            
        const linkEnter = linkSelection.enter()
            .append('path')
            .attr('class', 'tree-link');
            
        linkEnter.merge(linkSelection)
            .attr('d', d => {
                // 使用贝塞尔曲线来避免线条重叠
                const source = d.source;
                const target = d.target;
                return `M${source.y},${source.x}
                        C${(source.y + target.y) / 2},${source.x}
                         ${(source.y + target.y) / 2},${target.x}
                         ${target.y},${target.x}`;
            })
            .style('fill', 'none')
            .style('stroke', '#999')
            .style('stroke-width', 1.5)
            .style('stroke-opacity', 0.6);
            
        // 绘制节点
        const nodeSelection = this.g.selectAll('.tree-node')
            .data(nodes);
            
        const nodeEnter = nodeSelection.enter()
            .append('g')
            .attr('class', 'tree-node');
            
        const nodeUpdate = nodeEnter.merge(nodeSelection);
        
        nodeUpdate
            .attr('transform', d => `translate(${d.y}, ${d.x})`)
            .style('cursor', 'pointer')
            .on('click', (event, d) => this.handleNodeClick(event, d));
            
        // 动态计算节点矩形大小 - 修复this上下文问题
        nodeEnter.append('rect')
            .attr('class', 'node-bg');
    
        // 保存colors引用，避免this上下文问题
        const colors = this.colors;
        
        nodeUpdate.select('.node-bg')
            .attr('x', d => {
                const textLength = (d.data.name || '').length;
                const width = Math.max(120, textLength * 8 + 40);
                return -width/2;
            })
            .attr('y', -17.5) // height/2 = 35/2 = 17.5
            .attr('width', d => {
                const textLength = (d.data.name || '').length;
                return Math.max(120, textLength * 8 + 40);
            })
            .attr('height', 35)
            .attr('rx', 6)
            .style('fill', d => {
                if (d.data.name === 'root') return 'transparent';
                return colors[d.data.name] || '#e0e0e0';
            })
            .style('stroke', d => (d.data.name === 'root' ? 'none' : '#333'))
            .style('stroke-width', 1)
            .style('opacity', 0.9);
            
        // 添加节点文本
        nodeEnter.append('text')
            .attr('class', 'node-text');
            
        nodeUpdate.select('.node-text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('fill', 'white')
            .style('text-shadow', '1px 1px 1px rgba(0,0,0,0.7)')
            .text(d => {
                if (d.data.name === 'root') return '';
                const name = d.data.name;
                const count = d.data.count;
                return `${name} (${count})`;
            });
            
        // 添加展开/折叠按钮
    const nodesWithChildren = nodeUpdate.filter(d => (d.children || d._children) && d.data.name !== 'root');
        
        nodeUpdate.selectAll('.toggle-btn, .toggle-text').remove();
        
        nodesWithChildren.append('circle')
            .attr('class', 'toggle-btn')
            .attr('cx', d => {
                const textLength = (d.data.name || '').length;
                const width = Math.max(120, textLength * 8 + 40);
                return width/2 + 15;
            })
            .attr('cy', 0)
            .attr('r', 12)
            .style('fill', '#fff')
            .style('stroke', '#333')
            .style('stroke-width', 2)
            .on('click', (event, d) => {
                event.stopPropagation();
                this.toggle(d);
                this.updateTree();
            });
            
        nodesWithChildren.append('text')
            .attr('class', 'toggle-text')
            .attr('x', d => {
                const textLength = (d.data.name || '').length;
                const width = Math.max(120, textLength * 8 + 40);
                return width/2 + 15;
            })
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .style('pointer-events', 'none')
            .text(d => d.children ? '−' : '+');
    }
    
    handleNodeClick(event, d) {
        if (d.data.name === 'root') return;
        
        const nodeId = d.data.id;
        
        if (this.selectedBranches.has(nodeId)) {
            this.selectedBranches.delete(nodeId);
        } else {
            this.selectedBranches.add(nodeId);
        }
        
        this.updateNodeSelection();
        this.filterAndTriggerPaths();
    }
    
    updateNodeSelection() {
        this.g.selectAll('.tree-node .node-bg')
            .style('stroke-width', d => {
                return this.selectedBranches.has(d.data.id) ? 4 : 1;
            })
            .style('stroke', d => {
                return this.selectedBranches.has(d.data.id) ? '#ff6b6b' : '#333';
            })
            .style('opacity', d => {
                return this.selectedBranches.has(d.data.id) ? 1 : 0.8;
            });
    }
    
    // 修改 PathTreeVisualization 类中的 filterAndTriggerPaths 和 getIntersectionPaths 方法
    filterAndTriggerPaths() {
        if (this.selectedBranches.size === 0) {
            this.selectionInfo.text('未选择路径');
            this.triggerPathSelection([]);
            return;
        }
        
        const selectedPaths = this.isUnionMode ? 
            this.getUnionPaths() : 
            this.getIntersectionPaths();
            
        const modeText = this.isUnionMode ? '并集' : '交集';
        this.selectionInfo.text(`已选择 ${selectedPaths.length} 条路径 (${modeText})`);
        this.triggerPathSelection(selectedPaths);
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
    
    // 保留原来的交集方法，以备将来可能需要切换模式
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
    
    // 新增：切换并集/交集模式
    toggleMode() {
        this.isUnionMode = !this.isUnionMode;
        
        if (this.isUnionMode) {
            this.modeButton
                .text('模式: 并集 (OR)')
                .style('background-color', '#28a745');
        } else {
            this.modeButton
                .text('模式: 交集 (AND)')
                .style('background-color', '#17a2b8');
        }
        
        // 重新计算并触发路径选择
        this.filterAndTriggerPaths();
    }
    
    toggle(d) {
        if (d.children) {
            d._children = d.children;
            d.children = null;
        } else {
            d.children = d._children;
            d._children = null;
        }
    }
    
    updateTree() {
        // 重新计算布局
        const treeLayout = d3.tree()
            .nodeSize([80, 200])
            .separation((a, b) => {
                const aNameLength = a.data.name ? a.data.name.length : 0;
                const bNameLength = b.data.name ? b.data.name.length : 0;
                const baseSpacing = a.parent === b.parent ? 1.5 : 2;
                const lengthFactor = Math.max(aNameLength, bNameLength) / 10;
                return baseSpacing + lengthFactor;
            });
        
        treeLayout(this.root);
        
        // 重新绘制整个树
        this.drawTree(this.root);
        
        // 保持选择状态
        this.updateNodeSelection();
    }
    
    clearSelection() {
        this.selectedBranches.clear();
        this.updateNodeSelection();
        this.filterAndTriggerPaths();
    }
    
    expandAll() {
        this.root.descendants().forEach(d => {
            if (d._children) {
                d.children = d._children;
                d._children = null;
            }
        });
        this.updateTree();
    }
    
    collapseAll() {
        this.root.descendants().forEach(d => {
            if (d.children) {
                d._children = d.children;
                d.children = null;
            }
        });
        this.updateTree();
    }
    
    triggerPathSelection(selectedPaths) {
        const event = new CustomEvent('pathSelected', {
            detail: {
                selectedPath: selectedPaths,
                isMultiple: true
            }
        });
        document.dispatchEvent(event);
        console.log('触发树状路径选择事件:', selectedPaths);
    }
}


function showTreeView(filteredPaths) {
    console.log('Showing tree view with paths:', filteredPaths); // 调试日志
    
    const container = d3.select('#pathViewContainer .path-list-container');
    container.selectAll(':not(.view-toggle)').remove();
    
    if (filteredPaths.length === 0) {
        container.append('p')
            .style('color', '#999')
            .style('text-align', 'center')
            .text('没有路径数据可显示');
        return;
    }
    
    container.append('h3')
        .style('margin-bottom', '15px')
        .text(`路径树视图 (${filteredPaths.length} 条路径)`);
    
    // 创建滚动容器
    const scrollContainer = container.append('div')
        .style('width', '100%')
        .style('height', '600px')
        .style('overflow', 'auto')
        .style('border', '1px solid #ddd')
        .style('border-radius', '5px');
    
    const treeContainer = scrollContainer.append('div')
        .attr('class', 'tree-visualization-container')
        .style('width', '1200px') // 设置固定宽度
        .style('height', '800px'); // 设置固定高度
        
    console.log('Creating PathTreeVisualization...'); // 调试日志
    new PathTreeVisualization(treeContainer, filteredPaths);
}

function showListView(filteredPaths) {
    const container = d3.select('#pathViewContainer .path-list-container');
    container.selectAll(':not(.view-toggle)').remove();
    
    container.append('h3')
        .style('margin-bottom', '15px')
        .text(`找到 ${filteredPaths.length} 条路径`);
    
    const pathItems = container.selectAll('.path-item')
        .data(filteredPaths)
        .enter()
        .append('div')
        .attr('class', 'path-item')
        .style('border', '1px solid #ddd')
        .style('border-radius', '5px')
        .style('margin-bottom', '10px')
        .style('padding', '10px')
        .style('background-color', '#f9f9f9')
        .style('cursor', 'pointer')
        .on('click', function(event, d) {
            console.log('点击路径:', d);
            triggerPathSelection([d]);
            
            container.selectAll('.path-item')
                .style('background-color', '#f9f9f9')
                .style('border-color', '#ddd');
            
            d3.select(this)
                .style('background-color', '#e3f2fd')
                .style('border-color', '#2196f3');
        });
    
    pathItems.append('div')
        .style('font-weight', 'bold')
        .style('color', '#333')
        .style('margin-bottom', '5px')
        .text(d => `路径 ${d.path_id}`);
    
    pathItems.append('div')
        .style('font-size', '12px')
        .style('color', '#666')
        .style('margin-bottom', '8px')
        .text(d => `长度: ${d.length} | 权重: ${d.weight} | 起点: ${d.start_node} | 终点: ${d.end_node}`);
    
    pathItems.append('div')
        .style('font-size', '14px')
        .style('line-height', '1.4')
        .html(d => highlightSelectedCells(d.path_string));
}

// 导出工具函数供其他模块使用
export { extractCellType, buildPathTree, convertToD3Hierarchy, triggerPathSelection, highlightSelectedCells };

export class PathViewer {
    constructor(container, pathsData, selectedPattern) {
        this.container = container;
        this.pathsData = pathsData;
        this.selectedPattern = selectedPattern;
        this.colors = {
            'Heart': '#d4b365', 'Neural crest': '#5B9BD5', 'Branchial arch': '#70AD47',
            'AGM': '#00B050', 'Liver': '#FF6D01', 'Cavity': '#404040',
            'Blood vessel': '#E1819E', 'Brain': '#8B4513', 'Connective tissue': '#9966CC',
            'Dermomyotome': '#FF69B4', 'Head mesenchyme': '#20B2AA', 'Lung primordium': '#FF4500',
            'Mesenchyme': '#DAA520', 'Notochord': '#4682B4', 'Sclerotome': '#32CD32',
            'Spinal cord': '#8A2BE2', 'Surface ectoderm': '#FF1493', 'Urogenital ridge': '#00CED1'
        };
        this.render();
    }

    render() {
        this.container.selectAll('*').remove();

        const filteredPaths = this.pathsData.filter(path =>
            path.start_node.startsWith(this.selectedPattern.start) && 
            path.end_node.startsWith(this.selectedPattern.end)
        );

        if (filteredPaths.length === 0) {
            this.container.append('p')
                .attr('class', 'path-view-message')
                .text('没有找到匹配的详细路径。');
            return;
        }

        const pathItems = this.container.selectAll('.path-detail-item')
            .data(filteredPaths)
            .enter()
            .append('div')
            .attr('class', 'path-detail-item')
            .on('click', (event, d) => {
                event.stopPropagation();
                this.container.selectAll('.path-detail-item').classed('selected', false);
                d3.select(event.currentTarget).classed('selected', true);
                this.triggerPathSelection([d]);
            });

        pathItems.append('div')
            .attr('class', 'path-detail-id')
            .text(d => `路径 ${d.path_id}`);

        pathItems.append('div')
            .attr('class', 'path-detail-info')
            .html(d => this.highlightPathString(d.path_string));
    }

    highlightPathString(pathString) {
        const allCellTypes = Object.keys(this.colors);
        let highlightedString = pathString;
        allCellTypes.forEach(cell => {
            const regex = new RegExp(`\\b(${cell})\\b`, 'g');
            const color = this.colors[cell] || '#999';
            highlightedString = highlightedString.replace(regex, 
                `<span class="path-cell-node" style="background-color:${color};">$1</span>`);
        });
        return highlightedString;
    }

    triggerPathSelection(selectedPath) {
        const event = new CustomEvent('pathSelected', {
            detail: { selectedPath: selectedPath }
        });
        document.dispatchEvent(event);
        console.log('触发路径选择事件:', selectedPath);
    }
}