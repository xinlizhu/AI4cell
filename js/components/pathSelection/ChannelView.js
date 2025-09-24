export class ChannelView {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = d3.select(containerId);
        this.width = 350;
        this.height = 990;
        this.margin = { top: 20, right: 20, bottom: 20, left: 20 };
        
        // 悬浮窗管理
        this.floatingWindows = [];
        this.windowCounter = 0;
        
        this.init();
        this.registerEventListeners();
        this.initFloatingWindowStyles();
    }

    init() {
        // 清空容器
        this.container.selectAll('*').remove();
        
        // 创建标题
        this.container.append('div')
            .attr('class', 'channel-view-title')
            .style('text-align', 'center')
            .style('font-weight', 'bold')
            .style('margin-bottom', '10px')
            .style('font-size', '18px')
            .text('Cell Communication Channels');

        // 创建SVG容器
        this.svg = this.container.append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .style('border', '1px solid #ddd');

        // 创建接收区域（上半部分）
        this.receiveGroup = this.svg.append('g')
            .attr('class', 'receive-group')
            .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`);

        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('font-size', '16px')
            .text('Receive Top 10');

        // 创建发送区域（下半部分）
        this.sendGroup = this.svg.append('g')
            .attr('class', 'send-group')
            .attr('transform', `translate(${this.margin.left}, ${this.height * 0.52 + this.margin.top})`);

        this.sendGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('font-size', '16px')
            .text('Send Top 10');

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
                        border: 2px solid #3498db;
                        border-radius: 8px;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                        z-index: 1000;
                        min-width: 320px;
                        max-width: 400px;
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    }
                    .floating-window-header {
                        background: #3498db;
                        color: white;
                        padding: 8px 12px;
                        cursor: move;
                        border-radius: 6px 6px 0 0;
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
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .floating-window-close:hover {
                        background: rgba(255,255,255,0.2);
                    }
                    .floating-window-content {
                        padding: 12px;
                        max-height: 500px;
                        overflow-y: auto;
                    }
                    .compare-channel-item {
                        display: flex;
                        align-items: center;
                        padding: 6px 8px;
                        margin: 2px 0;
                        background: #f8f9fa;
                        border-radius: 4px;
                        border-left: 4px solid #dee2e6;
                    }
                    .compare-rank {
                        background: #6c757d;
                        color: white;
                        border-radius: 50%;
                        width: 20px;
                        height: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 11px;
                        font-weight: bold;
                        margin-right: 8px;
                        flex-shrink: 0;
                    }
                    .compare-channel-name {
                        flex: 1;
                        font-size: 12px;
                        margin-right: 8px;
                    }
                    .compare-intensity {
                        font-size: 11px;
                        font-weight: bold;
                        color: #2c3e50;
                    }
                `);
        }
    }

    registerEventListeners() {
        document.addEventListener('communicationArcSelected', (event) => {
            const { cellName, neighborCell, communicationType, specificCells } = event.detail;
            
            // 重要：无论点击内环还是外环，我们都应该查找当前节点（cellName）的子类型数据
            // 而不是邻居细胞的数据
            const currentCellName = cellName;        // 当前点击的节点（如AGM）
            const neighborCellName = neighborCell;   // 邻居细胞（如Brain）
            
            this.updateChannelData(currentCellName, neighborCellName, communicationType, specificCells);
        });
    }

    showEmptyState() {
        // 清除所有卡片和旧的条目
        this.receiveGroup.selectAll('.channel-item').remove();
        this.sendGroup.selectAll('.channel-item').remove();
        this.receiveGroup.selectAll('.channel-card').remove();
        this.sendGroup.selectAll('.channel-card').remove();

        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 200)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#666')
            .text('Click arc to view channel details');

        this.sendGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 180)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#666')
            .text('Click arc to view channel details');
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

            // 根据点击类型渲染数据
            this.renderChannelDataByType(mergedData, currentCellName, neighborCellName, clickedType);
            
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
                const filePath = `${baseDir}/${subType}/${subType}_every_top_10.csv`;
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
                const filePath = `./js/components/pathSelection/Every_cell_info_withKJL4/${subType}/${subType}_every_top_10.csv`;
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
            .sort((a, b) => b.averageIntensity - a.averageIntensity)
            .slice(0, 10);

        const receiveData = processedData
            .filter(item => item.direction === '接收')
            .sort((a, b) => b.averageIntensity - a.averageIntensity)
            .slice(0, 10);

        return { send: sendData, receive: receiveData };
    }

    renderChannelData(data, sourceCellName, targetCellName) {
        // 清除之前的数据
        this.receiveGroup.selectAll('.channel-item').remove();
        this.sendGroup.selectAll('.channel-item').remove();
        this.receiveGroup.selectAll('.channel-card').remove();
        this.sendGroup.selectAll('.channel-card').remove();

        // 更新标题
        this.receiveGroup.select('text')
            .text(`${targetCellName} → ${sourceCellName} (Avg Intensity Per Cell)`);
        
        this.sendGroup.select('text')
            .text(`${sourceCellName} → ${targetCellName} (Avg Intensity Per Cell)`);

        // 渲染接收数据
        this.renderChannelList(this.receiveGroup, data.receive, 'receive');
        
        // 渲染发送数据
        this.renderChannelList(this.sendGroup, data.send, 'send');
    }

    renderChannelDataByType(data, currentCellName, neighborCellName, clickedType) {
        if (clickedType === 'receive') {
            // 点击内环（接收弧线）：只更新上半部分
            // 显示 currentCellName 接收来自 neighborCellName 的通道
            
            // 清除接收区域的旧数据
            this.receiveGroup.selectAll('.channel-item').remove();
            this.receiveGroup.selectAll('.channel-card').remove();
            
            // 更新接收区域标题：currentCellName 接收来自 neighborCellName 的通道
            this.receiveGroup.select('text')
                .text(`${neighborCellName} → ${currentCellName} (Avg Intensity Per Cell)`);
            
            // 在CSV数据中，方向='发送'且邻居细胞=neighborCellName 表示neighborCellName发送给currentCellName
            // 这就是currentCellName的接收数据
            const receiveData = data.send; // 实际上这里的send数据就是接收数据
            this.renderChannelList(this.receiveGroup, receiveData, 'receive');
            
        } else if (clickedType === 'send') {
            // 点击外环（发送弧线）：只更新下半部分  
            // 显示 currentCellName 发送给 neighborCellName 的通道
            
            // 清除发送区域的旧数据
            this.sendGroup.selectAll('.channel-item').remove();
            this.sendGroup.selectAll('.channel-card').remove();
            
            // 更新发送区域标题：currentCellName 发送给 neighborCellName 的通道
            this.sendGroup.select('text')
                .text(`${currentCellName} → ${neighborCellName} (Avg Intensity Per Cell)`);
            
            // 在CSV数据中，方向='接收'且邻居细胞=neighborCellName 表示currentCellName发送给neighborCellName
            // 这就是currentCellName的发送数据
            const sendData = data.receive; // 实际上这里的receive数据就是发送数据
            this.renderChannelList(this.sendGroup, sendData, 'send');
        }
    }

    renderChannelList(group, channelData, type) {
        if (!channelData || channelData.length === 0) return;
        
        const cardHeight = 35; // 缩小高度
        const cardWidth = this.width - this.margin.left - this.margin.right - 20;
        const cardMargin = 3; // 缩小间距
        
        // 计算最大强度用于归一化进度条
        const maxIntensity = d3.max(channelData, d => d.averageIntensity || d.intensity) || 1;
        
        const items = group.selectAll('.channel-card')
            .data(channelData)
            .enter()
            .append('g')
            .attr('class', 'channel-card')
            .attr('transform', (d, i) => `translate(10, ${45 + i * (cardHeight + cardMargin)})`);

        // 创建卡片容器
        const cardContainer = items.append('g')
            .attr('class', 'card-container')
            .style('cursor', 'pointer');

        // 外框边框
        cardContainer.append('rect')
            .attr('class', 'card-border')
            .attr('width', cardWidth)
            .attr('height', cardHeight)
            .attr('rx', 6)
            .attr('ry', 6)
            .attr('fill', '#ffffff')
            .attr('stroke', '#e1e5e9')
            .attr('stroke-width', 1.5)
            .style('filter', 'drop-shadow(0px 2px 4px rgba(0,0,0,0.1))');

        // 进度条背景
        cardContainer.append('rect')
            .attr('class', 'progress-bg')
            .attr('x', 2)
            .attr('y', 2)
            .attr('width', cardWidth - 4)
            .attr('height', cardHeight * 0.4)
            .attr('rx', 4)
            .attr('ry', 4)
            .attr('fill', '#f8f9fa');

        // 进度条填充 (根据强度比例)
        cardContainer.append('rect')
            .attr('class', 'progress-fill')
            .attr('x', 2)
            .attr('y', 2)
            .attr('width', d => {
                const intensity = d.averageIntensity || d.intensity;
                const ratio = intensity / maxIntensity;
                return Math.max(0, (cardWidth - 4) * ratio);
            })
            .attr('height', cardHeight * 0.4)
            .attr('rx', 4)
            .attr('ry', 4)
            .attr('fill', d => {
                const colors = type === 'send' 
                    ? ['#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#d32f2f']
                    : ['#e8f5e8', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#388e3c'];
                const intensity = d.averageIntensity || d.intensity;
                const ratio = intensity / maxIntensity;
                const colorIndex = Math.min(Math.floor(ratio * colors.length), colors.length - 1);
                return colors[colorIndex];
            })
            .style('transition', 'width 0.3s ease');

        // 排名标签 (左上角小圆圈，调小)
        cardContainer.append('circle')
            .attr('cx', 12)
            .attr('cy', 10)
            .attr('r', 6) // 缩小半径
            .attr('fill', type === 'send' ? '#d73027' : '#1a9850')
            .attr('opacity', 0.9);

        cardContainer.append('text')
            .attr('x', 12)
            .attr('y', 10)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('font-size', '9px') // 缩小字体
            .attr('font-weight', 'bold')
            .attr('fill', 'white')
            .text((d, i) => i + 1);

        // 强度数值 (左侧，排名后面)
        cardContainer.append('text')
            .attr('x', 28)
            .attr('y', 10)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'start')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#000000') // 改为黑色
            .text(d => `${(d.averageIntensity || d.intensity).toFixed(1)}×10⁻⁴`);

        // 通道名称 (下半部分居中)
        cardContainer.append('text')
            .attr('x', cardWidth / 2)
            .attr('y', cardHeight * 0.75) // 调整位置适应新高度
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px') // 缩小字体
            .attr('font-weight', '500')
            .attr('fill', '#2c3e50')
            .text(d => d.channel)
            .each(function(d) {
                // 截断过长的文本
                const textElement = this;
                const maxTextWidth = cardWidth - 40;
                let text = d.channel;
                textElement.textContent = text;
                
                while (textElement.getComputedTextLength() > maxTextWidth && text.length > 3) {
                    text = text.slice(0, -4) + '...';
                    textElement.textContent = text;
                }
            });

        // 鼠标悬停效果
        cardContainer.on('mouseover', function(event, d) {
            // 卡片悬停效果
            d3.select(this).select('.card-border')
                .attr('stroke', type === 'send' ? '#d73027' : '#1a9850')
                .attr('stroke-width', 2)
                .style('filter', 'drop-shadow(0px 4px 8px rgba(0,0,0,0.15))');

            // 进度条高亮
            d3.select(this).select('.progress-fill')
                .attr('opacity', 0.8);
            
            // 显示详细信息的tooltip
            d3.select('body').selectAll('.channel-tooltip').remove();
            const tooltip = d3.select('body').append('div')
                .attr('class', 'channel-tooltip')
                .style('position', 'absolute')
                .style('background', 'rgba(0,0,0,0.85)')
                .style('color', 'white')
                .style('padding', '10px 12px')
                .style('border-radius', '6px')
                .style('font-size', '13px')
                .style('box-shadow', '0 4px 12px rgba(0,0,0,0.2)')
                .style('pointer-events', 'none')
                .style('z-index', '1000')
                .style('max-width', '250px')
                .html(`
                    <div style="font-weight: bold; margin-bottom: 6px; color: #fff;">${d.channel}</div>
                    <div><strong>Average Intensity Per Cell:</strong> ${(d.averageIntensity || d.intensity).toFixed(2)}×10⁻⁴</div>
                    <div><strong>Total Intensity:</strong> ${(d.originalIntensity || d.intensity).toFixed(3)}</div>
                    <div><strong>Total Cell Count:</strong> ${d.totalCellCount || 'N/A'}</div>
                    <div><strong>Significance:</strong> ${d.significance.toFixed(4)}</div>
                    <div><strong>Neighbor Gene:</strong> ${d.neighborGene || 'N/A'}</div>
                    <div><strong>Target Gene:</strong> ${d.targetGene || 'N/A'}</div>
                `);

            tooltip.style('left', (event.pageX + 15) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function(event, d) {
            // 恢复卡片样式
            d3.select(this).select('.card-border')
                .attr('stroke', '#e1e5e9')
                .attr('stroke-width', 1.5)
                .style('filter', 'drop-shadow(0px 2px 4px rgba(0,0,0,0.1))');

            d3.select(this).select('.progress-fill')
                .attr('opacity', 1);
            
            d3.select('body').selectAll('.channel-tooltip').remove();
        })
        .on('contextmenu', (event, d) => {
            event.preventDefault(); // 阻止默认右键菜单
            this.createComparisonWindow(channelData, type);
        });
    }

    showErrorState(message) {
        this.receiveGroup.selectAll('.channel-item').remove();
        this.sendGroup.selectAll('.channel-item').remove();

        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 50)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#d73027')
            .text(`Error: ${message}`);
    }

    createComparisonWindow(channelData, type) {
        this.windowCounter++;
        const windowId = `floating-window-${this.windowCounter}`;
        
        // 创建悬浮窗
        const floatingWindow = d3.select('body')
            .append('div')
            .attr('id', windowId)
            .attr('class', 'floating-channel-window')
            .style('left', '50%')
            .style('top', '30%')
            .style('transform', 'translate(-50%, -50%)');

        // 窗口标题栏
        const header = floatingWindow.append('div')
            .attr('class', 'floating-window-header');

        header.append('div')
            .attr('class', 'floating-window-title')
            .text(`Channel Comparison - ${type === 'send' ? 'Send' : 'Receive'}`);

        header.append('button')
            .attr('class', 'floating-window-close')
            .html('×')
            .on('click', () => {
                floatingWindow.remove();
                // 从列表中移除
                this.floatingWindows = this.floatingWindows.filter(w => w.id !== windowId);
            });

        // 窗口内容
        const content = floatingWindow.append('div')
            .attr('class', 'floating-window-content');

        // 添加说明
        content.append('div')
            .style('font-size', '12px')
            .style('color', '#666')
            .style('margin-bottom', '10px')
            .text('Channel intensity comparison (×10⁻⁴):');

        // 渲染通道列表
        const items = content.selectAll('.compare-channel-item')
            .data(channelData.slice(0, 10)) // 只显示前10个
            .enter()
            .append('div')
            .attr('class', 'compare-channel-item')
            .style('border-left-color', type === 'send' ? '#d73027' : '#1a9850');

        // 排名
        items.append('div')
            .attr('class', 'compare-rank')
            .style('background', type === 'send' ? '#d73027' : '#1a9850')
            .text((d, i) => i + 1);

        // 通道名称
        items.append('div')
            .attr('class', 'compare-channel-name')
            .text(d => d.channel);

        // 强度值
        items.append('div')
            .attr('class', 'compare-intensity')
            .text(d => `${(d.averageIntensity || d.intensity).toFixed(2)}`);

        // 保存窗口引用
        this.floatingWindows.push({
            id: windowId,
            element: floatingWindow,
            data: channelData,
            type: type
        });

        // 启用拖拽
        this.enableWindowDragging(floatingWindow, header);
    }

    enableWindowDragging(windowElement, headerElement) {
        const windowId = windowElement.attr('id');
        
        // 为每个窗口创建独立的拖拽处理函数
        const startDrag = (event) => {
            event.preventDefault();
            
            const startX = event.clientX;
            const startY = event.clientY;
            
            // 获取当前窗口位置
            const rect = windowElement.node().getBoundingClientRect();
            const startLeft = rect.left;
            const startTop = rect.top;
            
            // 设置拖拽状态样式
            headerElement.style('cursor', 'grabbing');
            d3.select('body').style('user-select', 'none');
            
            // 创建拖拽移动处理函数
            const handleDrag = (moveEvent) => {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                const newLeft = startLeft + dx;
                const newTop = startTop + dy;
                
                windowElement
                    .style('left', `${newLeft}px`)
                    .style('top', `${newTop}px`)
                    .style('transform', 'none'); // 移除居中变换
            };
            
            // 创建拖拽结束处理函数
            const endDrag = () => {
                headerElement.style('cursor', 'move');
                d3.select('body').style('user-select', '');
                
                // 移除临时事件监听器
                document.removeEventListener('mousemove', handleDrag);
                document.removeEventListener('mouseup', endDrag);
            };
            
            // 添加临时事件监听器
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', endDrag);
        };
        
        // 绑定鼠标按下事件
        headerElement.on('mousedown', startDrag);
    }

    // 清理所有悬浮窗
    clearAllFloatingWindows() {
        this.floatingWindows.forEach(window => {
            window.element.remove();
        });
        this.floatingWindows = [];
    }
}