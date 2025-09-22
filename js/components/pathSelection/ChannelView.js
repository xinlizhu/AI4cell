export class ChannelView {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = d3.select(containerId);
        this.width = 350;
        this.height = 750;
        this.margin = { top: 20, right: 20, bottom: 20, left: 20 };
        
        this.init();
        this.registerEventListeners();
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
            .text('细胞通信通道');

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
            .text('接收 Top 10');

        // 创建发送区域（下半部分）
        this.sendGroup = this.svg.append('g')
            .attr('class', 'send-group')
            .attr('transform', `translate(${this.margin.left}, ${this.height / 2 + this.margin.top})`);

        this.sendGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('font-size', '16px')
            .text('发送 Top 10');

        // 创建提示文本
        this.showEmptyState();
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
        this.receiveGroup.selectAll('.channel-item').remove();
        this.sendGroup.selectAll('.channel-item').remove();

        this.receiveGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 50)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#666')
            .text('点击弧线查看通道详情');

        this.sendGroup.append('text')
            .attr('x', (this.width - this.margin.left - this.margin.right) / 2)
            .attr('y', 50)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#666')
            .text('点击弧线查看通道详情');
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

            // 读取并合并数据
            const mergedData = await this.loadAndMergeChannelData(currentCellSubTypes, neighborCellName);

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

    async loadAndMergeChannelData(subTypes, targetCellName) {
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

        return this.mergeChannelData(allChannelData);
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

    mergeChannelData(allData) {
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

        // 分离发送和接收数据，并排序取前10
        const sendData = Array.from(channelMap.values())
            .filter(item => item.direction === '发送')
            .sort((a, b) => b.intensity - a.intensity)
            .slice(0, 10);

        const receiveData = Array.from(channelMap.values())
            .filter(item => item.direction === '接收')
            .sort((a, b) => b.intensity - a.intensity)
            .slice(0, 10);

        return { send: sendData, receive: receiveData };
    }

    renderChannelData(data, sourceCellName, targetCellName) {
        // 清除之前的数据
        this.receiveGroup.selectAll('.channel-item').remove();
        this.sendGroup.selectAll('.channel-item').remove();

        // 更新标题
        this.receiveGroup.select('text')
            .text(`${targetCellName} → ${sourceCellName} (接收 Top 10)`);
        
        this.sendGroup.select('text')
            .text(`${sourceCellName} → ${targetCellName} (发送 Top 10)`);

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
            
            // 更新接收区域标题：currentCellName 接收来自 neighborCellName 的通道
            this.receiveGroup.select('text')
                .text(`${neighborCellName} → ${currentCellName} (接收 Top 10)`);
            
            // 在CSV数据中，方向='发送'且邻居细胞=neighborCellName 表示neighborCellName发送给currentCellName
            // 这就是currentCellName的接收数据
            const receiveData = data.send; // 实际上这里的send数据就是接收数据
            this.renderChannelList(this.receiveGroup, receiveData, 'receive');
            
        } else if (clickedType === 'send') {
            // 点击外环（发送弧线）：只更新下半部分  
            // 显示 currentCellName 发送给 neighborCellName 的通道
            
            // 清除发送区域的旧数据
            this.sendGroup.selectAll('.channel-item').remove();
            
            // 更新发送区域标题：currentCellName 发送给 neighborCellName 的通道
            this.sendGroup.select('text')
                .text(`${currentCellName} → ${neighborCellName} (发送 Top 10)`);
            
            // 在CSV数据中，方向='接收'且邻居细胞=neighborCellName 表示currentCellName发送给neighborCellName
            // 这就是currentCellName的发送数据
            const sendData = data.receive; // 实际上这里的receive数据就是发送数据
            this.renderChannelList(this.sendGroup, sendData, 'send');
        }
    }

    renderChannelList(group, channelData, type) {
        const itemHeight = 25;
        const maxWidth = this.width - this.margin.left - this.margin.right;

        const items = group.selectAll('.channel-item')
            .data(channelData)
            .enter()
            .append('g')
            .attr('class', 'channel-item')
            .attr('transform', (d, i) => `translate(0, ${30 + i * itemHeight})`);

        // 添加背景矩形
        items.append('rect')
            .attr('width', maxWidth)
            .attr('height', itemHeight - 2)
            .attr('fill', (d, i) => i % 2 === 0 ? '#f8f9fa' : '#ffffff')
            .attr('stroke', '#dee2e6')
            .attr('stroke-width', 0.5);

        // 添加排名
        items.append('text')
            .attr('x', 5)
            .attr('y', itemHeight / 2)
            .attr('dy', '0.35em')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .text((d, i) => `${i + 1}.`);

        // 添加通道名称
        items.append('text')
            .attr('x', 25)
            .attr('y', itemHeight / 2)
            .attr('dy', '0.35em')
            .attr('font-size', '11px')
            .text(d => d.channel)
            .each(function(d) {
                // 截断过长的文本
                const textElement = this;
                const maxTextWidth = maxWidth - 120;
                let text = d.channel;
                textElement.textContent = text;
                
                while (textElement.getComputedTextLength() > maxTextWidth && text.length > 3) {
                    text = text.slice(0, -4) + '...';
                    textElement.textContent = text;
                }
            });

        // 添加强度值
        items.append('text')
            .attr('x', maxWidth - 55)
            .attr('y', itemHeight / 2)
            .attr('dy', '0.35em')
            .attr('font-size', '11px')
            .attr('text-anchor', 'end')
            .attr('font-weight', 'bold')
            .attr('fill', type === 'send' ? '#d73027' : '#1a9850')
            .text(d => d.intensity.toFixed(2));

        // 添加显著性
        items.append('text')
            .attr('x', maxWidth - 5)
            .attr('y', itemHeight / 2)
            .attr('dy', '0.35em')
            .attr('font-size', '9px')
            .attr('text-anchor', 'end')
            .attr('fill', '#666')
            .text(d => `p=${d.significance.toFixed(3)}`);

        // 添加鼠标悬停效果
        items.on('mouseover', function(event, d) {
            d3.select(this).select('rect')
                .attr('fill', '#e3f2fd');
            
            // 显示详细信息的tooltip
            d3.select('body').selectAll('.channel-tooltip').remove();
            const tooltip = d3.select('body').append('div')
                .attr('class', 'channel-tooltip')
                .style('position', 'absolute')
                .style('background', 'rgba(0,0,0,0.8)')
                .style('color', 'white')
                .style('padding', '8px')
                .style('border-radius', '4px')
                .style('font-size', '13px')
                .style('pointer-events', 'none')
                .style('z-index', '1000')
                .html(`
                    <strong>通道:</strong> ${d.channel}<br>
                    <strong>强度:</strong> ${d.intensity.toFixed(3)}<br>
                    <strong>显著性:</strong> ${d.significance.toFixed(4)}<br>
                    <strong>邻居基因:</strong> ${d.neighborGene || 'N/A'}<br>
                    <strong>目标基因:</strong> ${d.targetGene || 'N/A'}
                `);

            tooltip.style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function(event, d) {
            d3.select(this).select('rect')
                .attr('fill', (d, i) => i % 2 === 0 ? '#f8f9fa' : '#ffffff');
            
            d3.select('body').selectAll('.channel-tooltip').remove();
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
            .text(`错误: ${message}`);
    }
}