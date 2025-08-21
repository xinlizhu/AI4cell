
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