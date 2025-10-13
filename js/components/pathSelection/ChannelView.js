export class ChannelView {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = d3.select(containerId);
        this.width = 370; // 稍微增加宽度，更好利用空间
        this.height = 970; // 减少高度，避免过长
        this.margin = { top: 20, right: 15, bottom: 20, left: 15 }; // 减少边距，更紧凑
        
        // 悬浮窗管理
        this.floatingWindows = [];
        this.windowCounter = 0;
        
        // 套索模式状态
        this.isLassoMode = false;
        this.currentLassoData = null;
        
        // 控制台状态
        this.selectedGene = null;
        this.channelDisplayCount = 20;
        this.availableGenes = new Set();
        this.currentHeatmapData = null;
        this.sortByNode = null; // 排序基准节点
        
        this.init();
        this.registerEventListeners();
        this.initFloatingWindowStyles();
    }

    updateSVGHeight(height) {
        if (this.svg) {
            this.svg.attr('height', height);
        }
    }

    init() {
        // 清空容器
        this.container.selectAll('*').remove();
        
        // 创建标题
        this.container.append('div')
            .attr('class', 'channel-view-title')
            .style('text-align', 'center')
            .style('font-weight', '600') // 稍微减轻字重
            .style('margin-bottom', '8px') // 减少底部间距
            .style('font-size', '16px') // 减小字号，更紧凑
            .style('color', '#333')
            .text('Gene Communication View');

        // 创建控制台
        this.createControlPanel();

        // 创建滚动容器
        this.scrollContainer = this.container.append('div')
            .style('width', this.width + 'px')
            .style('height', (this.height - 78) + 'px') // 减少控制台占用空间
            .style('overflow-y', 'auto')
            .style('overflow-x', 'hidden')
            .style('border', 'none') /* 移除边框，减少视觉噪音 */
            .style('background-color', '#fbfbfb') /* 使用更淡的背景色 */
            .style('border-radius', '6px') /* 添加轻微圆角 */;

        // 在滚动容器内创建SVG
        this.svg = this.scrollContainer.append('svg')
            .attr('width', this.width)
            .style('background-color', 'transparent'); /* 透明背景，与容器颜色保持一致 */
        
        // 初始时设置一个默认高度
        this.updateSVGHeight(400);

        // 创建接收区域（上半部分）
        this.receiveGroup = this.svg.append('g')
            .attr('class', 'receive-group')
            .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`);

        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-weight', '600') // 减轻字重
            .attr('font-size', '14px') // 减小字号
            .attr('fill', '#555') // 更柔和的颜色
            .text('Receive Channels');

        // 创建发送区域（下半部分）
        this.sendGroup = this.svg.append('g')
            .attr('class', 'send-group')
            .attr('transform', `translate(${this.margin.left}, ${this.height * 0.50 + this.margin.top})`); // 调整位置比例

        this.sendGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-weight', '600') // 减轻字重
            .attr('font-size', '14px') // 减小字号
            .attr('fill', '#555') // 更柔和的颜色
            .text('Send Channels');

        // 创建提示文本
        this.showEmptyState();
    }

    initFloatingWindowStyles() {
        // 只添加一次样式
        if (d3.select('#floating-window-styles').empty()) {
            d3.select('head').append('style')
                .attr('id', 'floating-window-styles')
                .text(`
                    .floating-channel-window {
                        position: fixed;
                        background: white;
                        border: none; /* 移除边框 */
                        border-radius: 8px; /* 增加圆角 */
                        box-shadow: 0 12px 32px rgba(0,0,0,0.12); /* 更现代的阴影 */
                        z-index: 1000;
                        min-width: 320px;
                        max-width: 400px;
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                        overflow: hidden; /* 确保圆角效果 */
                    }
                    .floating-window-header {
                        background: linear-gradient(135deg, #4a90e2, #357abd); /* 渐变背景 */
                        color: white;
                        padding: 12px 16px; /* 增加内边距 */
                        cursor: move;
                        user-select: none;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .floating-window-title {
                        font-size: 14px;
                        font-weight: 600;
                    }
                    .floating-window-close {
                        background: none;
                        border: none;
                        color: white;
                        font-size: 18px;
                        cursor: pointer;
                        padding: 0;
                        width: 28px; /* 稍微增大 */
                        height: 28px;
                        border-radius: 50%; /* 圆形按钮 */
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: background-color 0.2s ease;
                    }
                    .floating-window-close:hover {
                        background: rgba(255,255,255,0.2);
                        transform: scale(1.05); /* 轻微放大效果 */
                    }
                    .floating-window-content {
                        padding: 12px;
                        max-height: 500px;
                        overflow-y: auto;
                    }

                    .lasso-heatmap-container {
                        background: white;
                        border-radius: 0px;
                        padding: 15px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        margin: 10px 0;
                    }
                    .heatmap-title {
                        font-size: 16px;
                        font-weight: bold;
                        margin-bottom: 15px;
                        text-align: center;
                        color: #2c3e50;
                    }
                    .heatmap-cell {
                        stroke: #f8f8f8; /* 使用极淡的边框色 */
                        stroke-width: 0.5; /* 更细的边框 */
                        cursor: pointer;
                    }
                    .heatmap-cell:hover {
                        stroke: #666; /* 悬停时稍微突出 */
                        stroke-width: 1.5; /* 悬停时稍微加粗 */
                        filter: brightness(1.1); /* 悬停时稍微提亮 */
                    }
                    .heatmap-label {
                        font-size: 14px; /* 放大字体 */
                        fill: #555; /* 使用更柔和的颜色 */
                        font-weight: 600; /* 增加字重提升可读性 */
                    }
                    .heatmap-channel-label {
                        font-size: 12px; /* 放大字体 */
                        fill: #777; /* 更柔和的标签色 */
                        text-anchor: end;
                        font-weight: 500;
                    }
                    .heatmap-node-label {
                        font-size: 12px; /* 放大字体 */
                        fill: #777; /* 更柔和的标签色 */
                        text-anchor: middle;
                        font-weight: 600; /* 增加字重 */
                    }
                    .channel-tag {
                        font-size: 11px; /* 放大字体 */
                        fill: white;
                        text-anchor: middle;
                        font-weight: 700; /* 增加字重，提升可读性 */
                    }
                    .channel-tag-bg {
                        stroke: none;
                        rx: 4; /* 增加圆角，更现代 */
                        ry: 4;
                    }
                    .ligand-tag {
                        fill: #555; /* 使用深灰色代替蓝色 */
                    }
                    .receptor-tag {
                        fill: #777; /* 使用中灰色代替橙色 */
                    }
                    .arrow-symbol {
                        font-size: 12px; /* 放大箭头符号 */
                        fill: #666;
                        text-anchor: middle;
                        font-weight: bold;
                    }
                    .control-panel {
                        background: #f8fafe; /* 更淡的背景 */
                        border: 1px solid #e8f0fe; /* 极淡的边框 */
                        border-radius: 6px; /* 增加圆角 */
                        padding: 8px 10px; /* 减少内边距，更紧凑 */
                        margin-bottom: 8px; /* 减少底部间距 */
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.05); /* 添加轻微阴影 */
                    }
                    .control-row {
                        display: flex;
                        align-items: center;
                        gap: 8px; /* 减少元素间距 */
                        margin-bottom: 5px; /* 减少行间距 */
                    }
                    .control-row:last-child {
                        margin-bottom: 0;
                    }
                    .control-label {
                        font-size: 11px; /* 稍微减小标签字号 */
                        font-weight: 600;
                        color: #495057;
                        min-width: 50px; /* 减少标签宽度 */
                    }
                    .gene-select {
                        flex: 1;
                        max-width: 160px; /* 减少最大宽度 */
                        padding: 5px 8px; /* 减少内边距 */
                        border: 1px solid #d6e4ff; /* 更柔和的边框色 */
                        border-radius: 4px; /* 增加圆角 */
                        font-size: 11px; /* 减小字号 */
                        background: white;
                        transition: border-color 0.2s ease; /* 添加过渡效果 */
                    }
                    .gene-select:focus {
                        outline: none;
                        border-color: #4a90e2; /* 聚焦时的边框色 */
                        box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.1); /* 聚焦时的阴影 */
                    }
                    .channel-count-select {
                        padding: 5px 8px; /* 减少内边距 */
                        border: 1px solid #d6e4ff;
                        border-radius: 4px;
                        font-size: 11px; /* 减小字号 */
                        background: white;
                        min-width: 160px; /* 减少最小宽度 */
                        transition: border-color 0.2s ease;
                    }
                    .channel-count-select:focus {
                        outline: none;
                        border-color: #4a90e2;
                        box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.1);
                    }
                    .sort-node-select {
                        padding: 5px 8px; /* 减少内边距 */
                        border: 1px solid #d6e4ff;
                        border-radius: 4px;
                        font-size: 11px; /* 减小字号 */
                        background: white;
                        min-width: 160px; /* 减少最小宽度 */
                        max-width: 160px; /* 减少最大宽度 */
                        transition: border-color 0.2s ease;
                    }
                    .sort-node-select:focus {
                        outline: none;
                        border-color: #4a90e2;
                        box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.1);
                    }
                    .clear-btn {
                        background: linear-gradient(135deg, #ff6b6b, #ee5a52); /* 渐变背景 */
                        color: white;
                        border: none;
                        padding: 6px 12px; /* 减少内边距 */
                        border-radius: 4px; /* 减少圆角 */
                        font-size: 11px; /* 减小字号 */
                        cursor: pointer;
                        font-weight: 600;
                        transition: all 0.2s ease; /* 添加过渡效果 */
                        box-shadow: 0 1px 3px rgba(238, 90, 82, 0.2); /* 减轻阴影 */
                    }
                    .clear-btn:hover {
                        background: linear-gradient(135deg, #ff5252, #e53935);
                        transform: translateY(-1px); /* 悬停时轻微上移 */
                        box-shadow: 0 4px 8px rgba(238, 90, 82, 0.3);
                    }
                    .clear-btn:active {
                        transform: translateY(0); /* 点击时恢复位置 */
                    }
                    .control-divider {
                        margin-left: auto;
                    }
                `);
        }
    }

    registerEventListeners() {
        document.addEventListener('communicationArcSelected', (event) => {
            const { cellName, neighborCell, communicationType, specificCells } = event.detail;
            
            // 检查是否处于套索选择状态
            if (this.isLassoMode && this.currentLassoData) {
                // 套索模式：显示对应类型的热图
                this.showLassoChannelHeatmap(this.currentLassoData.pathCells, this.currentLassoData.neighborCells, communicationType, neighborCell);
            } else {
                // 普通模式：显示单个节点的通道数据
                const currentCellName = cellName;        // 当前点击的节点（如AGM）
                const neighborCellName = neighborCell;   // 邻居细胞（如Brain）
                
                this.updateChannelData(currentCellName, neighborCellName, communicationType, specificCells);
            }
        });

        // 监听套索选择事件
        document.addEventListener('showNeighborDetails', (event) => {
            const { pathCells, neighborCells, lassoSelection } = event.detail;
            
            if (lassoSelection && pathCells && pathCells.length > 1) {
                // 进入套索模式，保存数据但不立即显示热图
                this.isLassoMode = true;
                this.currentLassoData = { pathCells, neighborCells };
                this.showLassoModeInstruction();
            } else {
                // 退出套索模式
                this.isLassoMode = false;
                this.currentLassoData = null;
            }
        });
    }

    showEmptyState() {
        // 清除所有内容
        if (this.receiveGroup) this.receiveGroup.selectAll('*').remove();
        if (this.sendGroup) this.sendGroup.selectAll('*').remove();
        
        // 重置SVG高度
        this.updateSVGHeight(400);

        if (this.receiveGroup) {
            this.receiveGroup.append('text')
                .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
                .attr('y', 200)
                .attr('text-anchor', 'middle')
                .attr('font-size', '14px')
                .attr('fill', '#666')
                .text('Click arc to view channel details');
        }

        if (this.sendGroup) {
            this.sendGroup.append('text')
                .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
                .attr('y', 180)
                .attr('text-anchor', 'middle')
                .attr('font-size', '14px')
                .attr('fill', '#666')
                .text('Click arc to view channel details');
        }
    }

    createControlPanel() {
        // 创建控制台容器
        const controlPanel = this.container.append('div')
            .attr('class', 'control-panel');

        // 第一行：基因选择
        const row1 = controlPanel.append('div')
            .attr('class', 'control-row');

        row1.append('span')
            .attr('class', 'control-label')
            .text('Gene:');

        this.geneSelect = row1.append('select')
            .attr('class', 'gene-select')
            .on('change', (event) => {
                this.selectedGene = event.target.value === 'all' ? null : event.target.value;
                this.applyFilters();
            });

        // 默认选项
        this.geneSelect.append('option')
            .attr('value', 'all')
            .text('all');

        // 第二行：排序选择
        const row2 = controlPanel.append('div')
            .attr('class', 'control-row');

        row2.append('span')
            .attr('class', 'control-label')
            .text('Rank:');

        this.sortNodeSelect = row2.append('select')
            .attr('class', 'sort-node-select')
            .on('change', (event) => {
                this.sortByNode = event.target.value === 'default' ? null : event.target.value;
                this.applyFilters();
            });

        // 默认排序选项
        this.sortNodeSelect.append('option')
            .attr('value', 'default')
            .text('default');

        // 第三行：通道数量选择和清除按钮
        const row3 = controlPanel.append('div')
            .attr('class', 'control-row');

        row3.append('span')
            .attr('class', 'control-label')
            .text('Count:');

        this.channelCountSelect = row3.append('select')
            .attr('class', 'channel-count-select')
            .on('change', (event) => {
                this.channelDisplayCount = parseInt(event.target.value);
                this.applyFilters();
            });

        // 通道数量选项
        const countOptions = [5, 10, 20, 50, 100, 200];
        countOptions.forEach(count => {
            const option = this.channelCountSelect.append('option')
                .attr('value', count)
                .text(count);
            if (count === this.channelDisplayCount) {
                option.attr('selected', 'selected');
            }
        });

        // 清除按钮
        row3.append('div')
            .attr('class', 'control-divider');

        row3.append('button')
            .attr('class', 'clear-btn')
            .text('Clean')
            .on('click', () => {
                this.clearHeatmap();
            });
    }

    updateGeneOptions(channels) {
        // 提取所有基因
        const genes = new Set();
        channels.forEach(channelKey => {
            const parts = channelKey.split('_');
            const channel = parts[0];
            const channelParts = channel.split('_');
            if (channelParts.length >= 2) {
                genes.add(channelParts[0]); // 配体
                genes.add(channelParts[1]); // 受体
            } else {
                genes.add(channel);
            }
        });

        // 清除旧选项（保留“所有基因”）
        this.geneSelect.selectAll('option:not([value="all"])').remove();

        // 添加新选项
        Array.from(genes).sort().forEach(gene => {
            this.geneSelect.append('option')
                .attr('value', gene)
                .text(gene);
        });

        this.availableGenes = genes;
    }

    updateSortNodeOptions(nodes) {
        if (!this.sortNodeSelect) return;
        
        // 清除旧选项（保留“默认排序”）
        this.sortNodeSelect.selectAll('option:not([value="default"])').remove();

        // 添加节点选项
        nodes.forEach(node => {
            this.sortNodeSelect.append('option')
                .attr('value', node)
                .text(node.length > 16 ? node.substring(0, 15) + '...' : node);
        });
    }

    filterChannelsByGene(channels) {
        if (!this.selectedGene) {
            return channels;
        }

        return channels.filter(channelKey => {
            const parts = channelKey.split('_');
            const channel = parts[0];
            return channel.includes(this.selectedGene);
        });
    }

    sortChannelsByNode(channels, intensityMap, nodes) {
        if (!this.sortByNode || !nodes.includes(this.sortByNode)) {
            return channels; // 使用默认排序
        }

        // 按指定节点的强度排序
        return channels.slice().sort((a, b) => {
            const channelDataA = intensityMap.get(a);
            const channelDataB = intensityMap.get(b);
            
            const intensityA = (channelDataA && channelDataA.intensities) ? 
                (channelDataA.intensities[this.sortByNode] || 0) : 
                (channelDataA?.[this.sortByNode] || 0);
            const intensityB = (channelDataB && channelDataB.intensities) ? 
                (channelDataB.intensities[this.sortByNode] || 0) : 
                (channelDataB?.[this.sortByNode] || 0);
                
            return intensityB - intensityA; // 降序排列
        });
    }

    applyFilters() {
        if (!this.currentHeatmapData) {
            return;
        }

        // 重新渲染热图，应用过滤器
        this.renderFilteredHeatmap(this.currentHeatmapData);
    }

    clearHeatmap() {
        // 清除热图
        if (this.receiveGroup) this.receiveGroup.selectAll('*').remove();
        if (this.sendGroup) this.sendGroup.selectAll('*').remove();
        
        // 重置滚动位置
        if (this.scrollContainer) {
            this.scrollContainer.node().scrollTop = 0;
        }
        
        // 重置SVG高度
        this.updateSVGHeight(400);

        // 重置状态
        this.currentHeatmapData = null;
        this.selectedGene = null;
        this.sortByNode = null;
        this.availableGenes.clear();

        // 重置选择框
        if (this.geneSelect) {
            this.geneSelect.property('value', 'all');
            this.geneSelect.selectAll('option:not([value="all"])').remove();
        }
        
        if (this.sortNodeSelect) {
            this.sortNodeSelect.property('value', 'default');
            this.sortNodeSelect.selectAll('option:not([value="default"])').remove();
        }

        // 显示初始状态
        this.showEmptyState();
    }

    async updateChannelData(currentCellName, neighborCellName, clickedType, specificCells = null) {
        try {
            let currentCellSubTypes;
            
            // 使用传递过来的具体细胞列表
            if (specificCells && Array.isArray(specificCells)) {
                // 从 detailedPaths 中提取与当前细胞类型匹配的细胞名
                currentCellSubTypes = specificCells.filter(cell => 
                    cell.includes(currentCellName)
                );
            } else {
                // 如果没有传递具体细胞列表，回退到原来的方法
                currentCellSubTypes = await this.getSubTypes(currentCellName);
            }

            // 获取当前细胞类型的总细胞数
            const totalCellCount = await this.getTotalCellCount(currentCellSubTypes);

            // 读取并合并数据，传入细胞总数用于计算平均强度
            const mergedData = await this.loadAndMergeChannelData(currentCellSubTypes, neighborCellName, totalCellCount);

            // 直接显示热图（不使用列表展示）
            console.log('Channel data loaded, but list display removed. Use heatmap view instead.');
            
        } catch (error) {
            this.showErrorState(error.message);
        }
    }

    async getSubTypes(cellName) {
        // 根据细胞名称获取所有可能的子类型
        const baseDir = './js/components/pathSelection/Every_cell_info_withKJL4';
        const subTypes = [];

        // 常见的子类型模式，根据实际数据减少范围
        const possibleSubTypes = [];
        
        // 检查直接名称匹配
        possibleSubTypes.push(cellName);
        
        // 检查带数字后缀的子类型，但限制范围以减少无效请求
        // 基于观察，大部分子类型是 _1_X 格式
        for (let i = 1; i <= 5; i++) {  // 减少从10到5
            for (let j = 0; j <= 30; j++) {
                possibleSubTypes.push(`${cellName}_${i}_${j}`);
            }
        }

        let foundCount = 0;
        
        // 测试每个可能的子类型
        for (const subType of possibleSubTypes) {
            try {
                const filePath = `${baseDir}/${subType}/${subType}_every_top_100.csv`;
                const response = await fetch(filePath);
                if (response.ok) {
                    subTypes.push(subType);
                    foundCount++;
                } else {
                    // 不记录404错误，减少console噪音
                }
            } catch (error) {
                // 忽略文件不存在的错误，不打印日志
            }
        }

        if (subTypes.length === 0) {
            return [cellName]; // 返回原始名称作为fallback
        }

        return subTypes;
    }

    async getTotalCellCount(subTypes) {
        let totalCellCount = 0;
        
        for (const subType of subTypes) {
            try {
                const filePath = `./js/components/pathSelection/Every_cell_info_withKJL4/${subType}/${subType}.csv`;
                const response = await fetch(filePath);
                
                if (!response.ok) {
                    continue;
                }
                
                const csvText = await response.text();
                const data = this.parseCSV(csvText);
                
                // 计算该subType的总细胞数
                const cellCount = data.reduce((sum, row) => {
                    return sum + (parseInt(row['cell_num']) || 0);
                }, 0);
                
                totalCellCount += cellCount;
                
            } catch (error) {
                // 忽略加载错误
            }
        }
        
        return Math.max(totalCellCount, 1); // 避免除以0
    }

    async loadAndMergeChannelData(subTypes, targetCellName, totalCellCount = 1) {
        const allChannelData = [];
        
        for (const subType of subTypes) {
            try {
                const filePath = `./js/components/pathSelection/Every_cell_info_withKJL4/${subType}/${subType}_every_top_100.csv`;
                const response = await fetch(filePath);
                
                if (!response.ok) {
                    continue;
                }
                
                const csvText = await response.text();
                const data = this.parseCSV(csvText);
                
                // 过滤出目标邻居细胞的数据
                const targetData = data.filter(row => 
                    row['邻居细胞'] && row['邻居细胞'].includes(targetCellName)
                );
                
                allChannelData.push(...targetData);
                
            } catch (error) {
                // 忽略加载错误
            }
        }

        return this.mergeChannelData(allChannelData, totalCellCount);
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return [];
        
        const headers = lines[0].split(',');
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((header, index) => {
                row[header.trim()] = values[index] ? values[index].trim() : '';
            });
            data.push(row);
        }
        
        return data;
    }

    mergeChannelData(allData, totalCellCount = 1) {
        console.log(`mergeChannelData: Processing ${allData.length} raw channel records`);
        if (allData.length === 0) return { send: [], receive: [] };

        // 按通道和方向分组
        const channelMap = new Map();

        allData.forEach(row => {
            const channel = row['通道'];
            const direction = row['方向'];
            const intensity = parseFloat(row['强度']) || 0;
            const significance = parseFloat(row['显著性']) || 0;
            
            if (!channel || !direction) return;

            const key = `${channel}_${direction}`;
            
            if (channelMap.has(key)) {
                const existing = channelMap.get(key);
                // 强度加和
                existing.intensity += intensity;
                // 显著性取平均
                existing.significanceSum += significance;
                existing.count += 1;
                existing.significance = existing.significanceSum / existing.count;
            } else {
                channelMap.set(key, {
                    channel: channel,
                    direction: direction,
                    intensity: intensity,
                    significance: significance,
                    significanceSum: significance,
                    count: 1,
                    neighborCell: row['邻居细胞'],
                    targetCell: row['目标细胞'],
                    neighborGene: row['邻居细胞基因'],
                    targetGene: row['目标细胞基因']
                });
            }
        });

        // 计算平均强度并分离发送和接收数据
        const processedData = Array.from(channelMap.values()).map(item => ({
            ...item,
            // 将总强度除以细胞总数得到平均强度，乘以10000提高可读性
            averageIntensity: (item.intensity / totalCellCount) * 10000,
            originalIntensity: item.intensity, // 保留原始强度用于tooltip显示
            totalCellCount: totalCellCount
        }));

        const sendData = processedData
            .filter(item => item.direction === '发送')
            .sort((a, b) => b.averageIntensity - a.averageIntensity);

        const receiveData = processedData
            .filter(item => item.direction === '接收')
            .sort((a, b) => b.averageIntensity - a.averageIntensity);

        console.log(`mergeChannelData: Returning ${sendData.length} send channels, ${receiveData.length} receive channels`);
        return { send: sendData, receive: receiveData };
    }




    showErrorState(message) {
        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 50)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#d73027')
            .text(`Error: ${message}`);
    }







    async showLassoHeatmap(pathCells, neighborCells) {
        console.log('Showing lasso heatmap for:', pathCells);
        
        // 清除现有内容
        this.receiveGroup.selectAll('*').remove();
        this.sendGroup.selectAll('*').remove();
        
        // 重置滚动位置
        if (this.scrollContainer) {
            this.scrollContainer.node().scrollTop = 0;
        }

        // 创建热图标题
        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('font-size', '16px')
            .text(`Lasso Selection Heatmap (${pathCells.length} nodes)`);

        try {
            // 收集所有节点的通道数据
            const heatmapData = await this.collectLassoChannelData(pathCells, neighborCells);
            
            // 渲染热图
            this.renderChannelHeatmap(heatmapData, pathCells);
            
        } catch (error) {
            console.error('Error creating lasso heatmap:', error);
            this.showErrorState('Failed to create heatmap: ' + error.message);
        }
    }

    async collectLassoChannelData(pathCells, neighborCells) {
        const channelIntensityMap = new Map(); // channel -> {node1: intensity, node2: intensity, ...}
        const allChannels = new Set();
        
        // 为每个路径节点收集通道数据（保持路径顺序和节点的具体子集）
        for (let i = 0; i < pathCells.length; i++) {
            const pathCell = pathCells[i];
            const cellType = pathCell.label;
            const specificCells = pathCell.specificCells || [];
            
            // 创建节点标识符：节点类型 + 在路径中的位置
            const nodeId = `${cellType}_${i}`;
            
            console.log(`Processing path node: ${cellType} at position ${i}, specific cells:`, specificCells);
            
            try {
                // 获取该路径节点的子类型
                let subTypes;
                if (specificCells && specificCells.length > 0) {
                    subTypes = specificCells.filter(cell => cell.includes(cellType));
                } else {
                    subTypes = await this.getSubTypes(cellType);
                }
                
                console.log(`SubTypes for ${nodeId}:`, subTypes);
                
                // 获取细胞总数
                const totalCellCount = await this.getTotalCellCount(subTypes);
                
                // 为每个邻居细胞收集通道数据
                for (const neighborCell of neighborCells) {
                    const channelData = await this.loadAndMergeChannelData(subTypes, neighborCell, totalCellCount);
                    
                    // 合并发送和接收数据
                    const allChannels_temp = [...channelData.send, ...channelData.receive];
                    
                    allChannels_temp.forEach(channel => {
                        const channelKey = `${channel.channel}_${neighborCell}`;
                        allChannels.add(channelKey);
                        
                        if (!channelIntensityMap.has(channelKey)) {
                            channelIntensityMap.set(channelKey, {
                                targetGene: channel.targetGene,
                                neighborGene: channel.neighborGene,
                                intensities: {}
                            });
                        }
                        
                        // 使用节点标识符作为列名（保持路径位置信息）
                        channelIntensityMap.get(channelKey).intensities[nodeId] = channel.averageIntensity || 0;
                    });
                }
                
            } catch (error) {
                console.warn(`Error processing ${nodeId}:`, error);
            }
        }
        
        // 生成节点列表，包含位置信息但显示为可读的标签
        const nodeColumns = pathCells.map((pathCell, i) => {
            const cellType = pathCell.label;
            const nodeId = `${cellType}_${i}`;
            // 如果有多个同类型节点，显示位置信息；否则只显示类型
            const sameTypeCounts = pathCells.filter(p => p.label === cellType).length;
            const displayName = sameTypeCounts > 1 ? `${cellType}(${i+1})` : cellType;
            return { id: nodeId, displayName: displayName };
        });
        
        return {
            channels: Array.from(allChannels),
            nodes: nodeColumns.map(n => n.id), // 内部使用的ID
            nodeDisplayNames: nodeColumns, // 用于显示的名称映射
            intensityMap: channelIntensityMap
        };
    }

    renderChannelHeatmap(heatmapData, pathCells) {
        // 保存当前数据用于过滤
        this.currentHeatmapData = heatmapData;
        
        // 更新基因选项
        if (heatmapData.channels) {
            this.updateGeneOptions(heatmapData.channels);
        }
        
        // 更新排序节点选项
        if (heatmapData.nodes) {
            this.updateSortNodeOptions(heatmapData.nodes, heatmapData.nodeDisplayNames);
        }
        
        // 渲染过滤后的热图
        this.renderFilteredHeatmap(heatmapData);
    }

    renderFilteredHeatmap(heatmapData) {
        const { channels, nodes, intensityMap } = heatmapData;
        
        if (channels.length === 0 || nodes.length === 0) {
            // 清除现有内容
            this.receiveGroup.selectAll('.lasso-heatmap').remove();
            this.receiveGroup.append('text')
                .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
                .attr('y', 100)
                .attr('text-anchor', 'middle')
                .attr('font-size', '14px')
                .attr('fill', '#666')
                .text('No channel data found for selected nodes');
            return;
        }
        
        // 应用基因过滤
        let filteredChannels = this.filterChannelsByGene(channels);
        
        if (filteredChannels.length === 0) {
            // 清除现有内容
            this.receiveGroup.selectAll('.lasso-heatmap').remove();
            this.receiveGroup.append('text')
                .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
                .attr('y', 100)
                .attr('text-anchor', 'middle')
                .attr('font-size', '14px')
                .attr('fill', '#666')
                .text(`No channels found containing gene: ${this.selectedGene}`);
            return;
        }
        
        // 应用排序
        filteredChannels = this.sortChannelsByNode(filteredChannels, intensityMap, nodes);

        // 热图参数
        const availableWidth = this.width - this.margin.left - this.margin.right - 200; // 增加预留空间给标签
        const cellWidth = Math.min(Math.max(18, availableWidth / nodes.length), 28); // 减小单元格宽度范围
        const cellHeight = 16;
        const labelWidth = 150; // 减少标签区域宽度，让热图更靠近标签
        const labelHeight = 60; // 减少上方空间，让热图更靠近标题
        const startX = labelWidth;
        const startY = labelHeight;
        
        // 清除之前的热图
        this.receiveGroup.selectAll('.lasso-heatmap').remove();
        
        // 应用数量限制
        const maxChannels = Math.min(filteredChannels.length, this.channelDisplayCount);
        const displayChannels = filteredChannels.slice(0, maxChannels);
        
        console.log(`renderFilteredHeatmap: Showing ${displayChannels.length} out of ${filteredChannels.length} filtered channels (limit: ${this.channelDisplayCount})`);
        
        // 计算并更新SVG高度
        const heatmapHeight = startY + displayChannels.length * cellHeight + 100; // 额外空间给图例
        this.updateSVGHeight(heatmapHeight);
        
        // 计算所有强度的范围
        let minIntensity = Infinity;
        let maxIntensity = -Infinity;
        
        intensityMap.forEach(channelData => {
            if (channelData.intensities) {
                // 新数据结构
                Object.values(channelData.intensities).forEach(intensity => {
                    if (intensity > 0) {
                        minIntensity = Math.min(minIntensity, intensity);
                        maxIntensity = Math.max(maxIntensity, intensity);
                    }
                });
            } else {
                // 旧数据结构兼容
                Object.values(channelData).forEach(intensity => {
                    if (intensity > 0) {
                        minIntensity = Math.min(minIntensity, intensity);
                        maxIntensity = Math.max(maxIntensity, intensity);
                    }
                });
            }
        });
        
        if (minIntensity === Infinity) {
            minIntensity = 0;
            maxIntensity = 1;
        }
        
        // 创建颜色比例尺 - 使用黑灰色调
        const colorScale = d3.scaleSequential(d3.interpolateGreys)
            .domain([minIntensity, maxIntensity]);
        
        // 创建热图SVG组
        const heatmapGroup = this.receiveGroup.append('g')
            .attr('class', 'lasso-heatmap')
            .attr('transform', `translate(0, 0)`);
        
        // 绘制节点标签（列标签）
        const nodeDisplayNames = heatmapData.nodeDisplayNames || nodes.map(n => ({ id: n, displayName: n }));
        heatmapGroup.selectAll('.heatmap-node-label')
            .data(nodes)
            .enter()
            .append('text')
            .attr('class', 'heatmap-node-label')
            .attr('x', (d, i) => startX + i * cellWidth + cellWidth / 2)
            .attr('y', startY - 25) // 增加上方空间，避免倾斜标签被截断
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .attr('transform', (d, i) => `rotate(-45, ${startX + i * cellWidth + cellWidth / 2}, ${startY - 25})`)
            .text((nodeId, i) => {
                const nodeInfo = nodeDisplayNames.find(n => n.id === nodeId);
                const displayName = nodeInfo ? nodeInfo.displayName : nodeId;
                return displayName.length > 7 ? displayName.substring(0, 7) + '...' : displayName;
            });
        
        // 绘制通道标签（行标签）- 使用两个tag形式
        displayChannels.forEach((channelKey, i) => {
            const parts = channelKey.split('_');
            const channel = parts[0];
            const neighbor = parts.slice(1).join('_');
            
            // 从intensityMap中获取正确的基因信息
            const channelData = intensityMap.get(channelKey);
            let ligand, receptor;
            
            if (channelData && channelData.targetGene && channelData.neighborGene) {
                // 使用数据中的真实基因信息
                ligand = channelData.targetGene;  // 目标细胞基因
                receptor = channelData.neighborGene;  // 邻居细胞基因
            } else {
                // 回退到解析通道名称
                const channelParts = channel.split('_');
                ligand = channelParts[0] || channel;
                receptor = channelParts[1] || channel;
            }
            
            const yPos = startY + i * cellHeight + cellHeight / 2;
            
            // 创建标签组
            const labelGroup = heatmapGroup.append('g')
                .attr('class', 'channel-label-group')
                .attr('transform', `translate(0, ${yPos})`); // 从左边开始布局
            
            // 重新计算标签布局，使用固定列宽确保对齐
            const ligandText = ligand.length > 10 ? ligand.substring(0, 9) + '...' : ligand;
            const receptorText = receptor.length > 10 ? receptor.substring(0, 9) + '...' : receptor;
            
            // 使用固定宽度确保所有标签对齐
            const ligandWidth = 60;  // 固定配体标签宽度
            const arrowWidth = 20;   // 固定箭头区域宽度
            const receptorWidth = 60; // 固定受体标签宽度
            
            // 从左往右依次排列，确保对齐
            // 配体标签（最左侧）
            const ligandX = 5;
            labelGroup.append('rect')
                .attr('class', 'channel-tag-bg ligand-tag')
                .attr('x', ligandX)
                .attr('y', -6)
                .attr('width', ligandWidth)
                .attr('height', 12)
                .attr('rx', 2)
                .attr('fill', '#555'); // 使用深灰色
            
            labelGroup.append('text')
                .attr('class', 'channel-tag')
                .attr('x', ligandX + ligandWidth/2)
                .attr('y', 0)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('font-size', '9px')
                .attr('fill', 'white')
                .attr('font-weight', 'bold')
                .text(ligandText);
            
            // 箭头符号（中间）
            const arrowX = ligandX + ligandWidth;
            labelGroup.append('text')
                .attr('class', 'arrow-symbol')
                .attr('x', arrowX + arrowWidth/2)
                .attr('y', 0)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('fill', '#666')
                .attr('font-weight', 'bold')
                .text('→');
            
            // 受体标签（最右侧）
            const receptorX = arrowX + arrowWidth;
            labelGroup.append('rect')
                .attr('class', 'channel-tag-bg receptor-tag')
                .attr('x', receptorX)
                .attr('y', -6)
                .attr('width', receptorWidth)
                .attr('height', 12)
                .attr('rx', 2)
                .attr('fill', '#777'); // 使用中灰色
            
            labelGroup.append('text')
                .attr('class', 'channel-tag')
                .attr('x', receptorX + receptorWidth/2)
                .attr('y', 0)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('font-size', '9px')
                .attr('fill', 'white')
                .attr('font-weight', 'bold')
                .text(receptorText);
        });
        
        // 绘制热图单元格
        displayChannels.forEach((channel, rowIndex) => {
            nodes.forEach((node, colIndex) => {
                const channelData = intensityMap.get(channel);
                const intensity = (channelData && channelData.intensities) ? 
                    (channelData.intensities[node] || 0) : 
                    (intensityMap.get(channel)?.[node] || 0);
                
                heatmapGroup.append('rect')
                    .attr('class', 'heatmap-cell')
                    .attr('x', startX + colIndex * cellWidth)
                    .attr('y', startY + rowIndex * cellHeight)
                    .attr('width', cellWidth)
                    .attr('height', cellHeight)
                    .attr('fill', intensity > 0 ? colorScale(intensity) : '#fafafa') /* 更淡的空值颜色 */
                    .on('mouseover', function(event) {
                        // 显示tooltip
                        d3.select('body').selectAll('.heatmap-tooltip').remove();
                        const tooltip = d3.select('body').append('div')
                            .attr('class', 'heatmap-tooltip')
                            .style('position', 'absolute')
                            .style('background', 'rgba(0,0,0,0.8)')
                            .style('color', 'white')
                            .style('padding', '8px')
                            .style('border-radius', '0px')
                            .style('font-size', '12px')
                            .style('pointer-events', 'none')
                            .style('z-index', '1000')
                            .html(`
                                <strong>Node:</strong> ${node}<br>
                                <strong>Channel:</strong> ${channel}<br>
                                <strong>Intensity:</strong> ${intensity.toFixed(2)}×10⁻⁴
                            `);

                        tooltip.style('left', (event.pageX + 10) + 'px')
                            .style('top', (event.pageY - 10) + 'px');
                    })
                    .on('mouseout', function() {
                        d3.select('body').selectAll('.heatmap-tooltip').remove();
                    });
            });
        });
        
        // 添加颜色图例
        this.addHeatmapLegend(heatmapGroup, colorScale, minIntensity, maxIntensity, 
            startX + nodes.length * cellWidth + 15, startY); // 减少图例与热图的间距
    }

    addHeatmapLegend(parentGroup, colorScale, minValue, maxValue, x, y) {
        const legendHeight = 150;
        const legendWidth = 15;
        const steps = 20;
        
        // 创建图例组
        const legendGroup = parentGroup.append('g')
            .attr('class', 'heatmap-legend')
            .attr('transform', `translate(${x}, ${y})`);
        
        // 绘制图例色块
        for (let i = 0; i < steps; i++) {
            const value = minValue + (maxValue - minValue) * i / (steps - 1);
            
            legendGroup.append('rect')
                .attr('x', 0)
                .attr('y', legendHeight - (i + 1) * legendHeight / steps)
                .attr('width', legendWidth)
                .attr('height', legendHeight / steps)
                .attr('fill', colorScale(value))
                .attr('stroke', 'none');
        }
        
        // 添加图例标签
        legendGroup.append('text')
            .attr('x', legendWidth + 5)
            .attr('y', 0)
            .attr('dy', '0.35em')
            .attr('font-size', '14px') /* 进一步放大字体 */
            .attr('fill', '#333')
            .attr('font-weight', '700') /* 增加字重 */
            .text(maxValue.toFixed(1));
        
        legendGroup.append('text')
            .attr('x', legendWidth + 5)
            .attr('y', legendHeight)
            .attr('dy', '0.35em')
            .attr('font-size', '14px') /* 进一步放大字体 */
            .attr('fill', '#333')
            .attr('font-weight', '700') /* 增加字重 */
            .text(minValue.toFixed(1));
        
        legendGroup.append('text')
            .attr('x', legendWidth + 5)
            .attr('y', legendHeight + 15)
            .attr('dy', '0.35em')
            .attr('font-size', '11px') /* 放大字体 */
            .attr('fill', '#666')
            .attr('font-weight', '500')
            .text('×10⁻⁴');
    }

    showLassoModeInstruction() {
        // 清除现有内容
        this.receiveGroup.selectAll('*').remove();
        this.sendGroup.selectAll('*').remove();
        
        // 重置SVG高度
        this.updateSVGHeight(400);

        // 显示套索模式说明
        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('font-size', '16px')
            .text(`Lasso Mode (${this.currentLassoData.pathCells.length} nodes selected)`);

        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 100)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#666')
            .html('Click inner arc to view receive channels');

        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 130)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#666')
            .html('Click outer arc to view send channels');

        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 160)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', '#999')
            .html('Heatmap will show all selected nodes');
    }

    async showLassoChannelHeatmap(pathCells, neighborCells, communicationType, targetNeighbor) {
        console.log('Showing lasso channel heatmap:', {
            pathCells: pathCells.length,
            communicationType,
            targetNeighbor
        });
        
        // 清除现有内容
        this.receiveGroup.selectAll('*').remove();
        this.sendGroup.selectAll('*').remove();
        
        // 重置滚动位置
        if (this.scrollContainer) {
            this.scrollContainer.node().scrollTop = 0;
        }

        // 创建热图标题
        const titleText = communicationType === 'receive' 
            ? `Receive Channels: → ${targetNeighbor} (${pathCells.length} nodes)`
            : `Send Channels: ${targetNeighbor} → (${pathCells.length} nodes)`;
            
        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('font-size', '16px')
            .text(titleText);

        try {
            // 收集指定类型的通道数据
            const heatmapData = await this.collectLassoChannelDataByType(
                pathCells, 
                [targetNeighbor], 
                communicationType
            );
            
            // 渲染热图
            this.renderChannelHeatmap(heatmapData, pathCells);
            
        } catch (error) {
            console.error('Error creating lasso channel heatmap:', error);
            this.showErrorState('Failed to create heatmap: ' + error.message);
        }
    }

    async collectLassoChannelDataByType(pathCells, neighborCells, communicationType) {
        const channelIntensityMap = new Map(); // channel -> {node1: intensity, node2: intensity, ...}
        const allChannels = new Set();
        
        // 为每个路径节点收集指定类型的通道数据
        for (let i = 0; i < pathCells.length; i++) {
            const pathCell = pathCells[i];
            const cellType = pathCell.label;
            const specificCells = pathCell.specificCells || [];
            
            // 创建节点标识符：节点类型 + 在路径中的位置
            const nodeId = `${cellType}_${i}`;
            
            console.log(`Processing path node: ${cellType} at position ${i}, type: ${communicationType}`);
            
            try {
                // 获取该路径节点的子类型
                let subTypes;
                if (specificCells && specificCells.length > 0) {
                    subTypes = specificCells.filter(cell => cell.includes(cellType));
                } else {
                    subTypes = await this.getSubTypes(cellType);
                }
                
                console.log(`SubTypes for ${nodeId}:`, subTypes);
                
                // 获取细胞总数
                const totalCellCount = await this.getTotalCellCount(subTypes);
                
                // 为每个邻居细胞收集通道数据
                for (const neighborCell of neighborCells) {
                    const channelData = await this.loadAndMergeChannelData(subTypes, neighborCell, totalCellCount);
                    
                    // 根据通信类型选择对应的数据
                    const selectedChannels = communicationType === 'receive' ? channelData.send : channelData.receive;
                    
                    console.log(`Channel data for ${nodeId} -> ${neighborCell}:`, selectedChannels.length, 'channels');
                    
                    selectedChannels.forEach(channel => {
                        const channelKey = `${channel.channel}_${neighborCell}`;
                        allChannels.add(channelKey);
                        
                        if (!channelIntensityMap.has(channelKey)) {
                            channelIntensityMap.set(channelKey, {
                                targetGene: channel.targetGene,
                                neighborGene: channel.neighborGene,
                                intensities: {}
                            });
                        }
                        
                        // 使用节点标识符作为列名（保持路径位置信息）
                        channelIntensityMap.get(channelKey).intensities[nodeId] = channel.averageIntensity || 0;
                    });
                }
                
            } catch (error) {
                console.warn(`Error processing ${nodeId}:`, error);
            }
        }
        
        // 生成节点列表，包含位置信息但显示为可读的标签
        const nodeColumns = pathCells.map((pathCell, i) => {
            const cellType = pathCell.label;
            const nodeId = `${cellType}_${i}`;
            // 如果有多个同类型节点，显示位置信息；否则只显示类型
            const sameTypeCounts = pathCells.filter(p => p.label === cellType).length;
            const displayName = sameTypeCounts > 1 ? `${cellType}(${i+1})` : cellType;
            return { id: nodeId, displayName: displayName };
        });
        
        return {
            channels: Array.from(allChannels),
            nodes: nodeColumns.map(n => n.id), // 内部使用的ID
            nodeDisplayNames: nodeColumns, // 用于显示的名称映射
            intensityMap: channelIntensityMap
        };
    }

    createUniqueNodeId(pathCell, index, allPathCells) {
        const cellType = pathCell.label;
        
        // 检查是否有其他节点具有相同的label
        const sameTypeCells = allPathCells.filter(p => p.label === cellType);
        
        if (sameTypeCells.length === 1) {
            // 如果只有一个同类型节点，直接使用label
            return cellType;
        } else {
            // 如果有多个同类型节点，添加索引或使用specificCells的特征
            const specificCells = pathCell.specificCells || [];
            if (specificCells.length > 0) {
                // 使用第一个specific cell的后缀作为区分
                const firstCell = specificCells[0];
                const parts = firstCell.split('_');
                if (parts.length >= 3) {
                    return `${cellType}_${parts[parts.length-2]}_${parts[parts.length-1]}`;
                }
            }
            
            // 回退方案：使用索引
            const sameTypeIndex = allPathCells.filter((p, i) => i <= index && p.label === cellType).length;
            return `${cellType}_${sameTypeIndex}`;
        }
    }
}