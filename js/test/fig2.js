// 细胞通讯强度可视化 - 从CSV文件加载数据

class CellCommunicationChart {
    constructor(containerId) {
        this.containerId = containerId;
        this.baseRadius = 120;
        this.minInnerRadius = 90; // 最小内环半径
        this.maxOuterRadius = 150; // 最大外环半径
        this.maxInnerExtension = this.baseRadius - this.minInnerRadius; // 30
        this.maxOuterExtension = this.maxOuterRadius - this.baseRadius; // 30
        this.centerX = 300;
        this.centerY = 300;
        
        // 细胞类型颜色配置 - 与fig1保持一致
        this.colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        
        this.init();
    }
    
    init() {
        // 创建SVG
        this.svg = d3.select(`#${this.containerId}`)
            .append('svg')
            .attr('width', 600)
            .attr('height', 600);
        
        // 创建主要绘图组
        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.centerX}, ${this.centerY})`);
        
        // 创建tooltip
        this.tooltip = d3.select('#tooltip');
        
        this.loadData();
    }
    
    async loadData() {
        try {
            // 从CSV文件加载数据
            const totalData = await d3.csv('./Cavity_2_20/Cavity_2_20_total.csv');
            const cellData = await d3.csv('./Cavity_2_20/Cavity_2_20.csv', d3.autoType);
            
            // 转换数值类型
            totalData.forEach(d => {
                d.发送通道数 = +d.发送通道数;
                d.接收通道数 = +d.接收通道数;
                d.总通道数 = +d.总通道数;
                d.发送总强度 = +d.发送总强度;
                d.接收总强度 = +d.接收总强度;
                d.通讯总强度 = +d.通讯总强度;
                d.发送平均强度 = +d.发送平均强度;
                d.接收平均强度 = +d.接收平均强度;
                d.总平均强度 = +d.总平均强度;
            });
            
            // 设置颜色比例尺域
            this.colorScale.domain(cellData.map(d => d.cell_type));
            
            console.log('总强度数据:', totalData);
            console.log('细胞数据:', cellData);
            
            this.processData(totalData, cellData);
            this.drawChart();
            this.drawCenterChart(cellData); // 绘制中心小图
            this.updateLegend();
            
        } catch (error) {
            console.error('数据加载失败:', error);
            alert('数据文件加载失败，请检查文件路径和格式！');
        }
    }
    
    processData(totalData, cellData) {
        // 计算总细胞数（除了Brain）
        const nonBrainCells = cellData.filter(d => d.cell_type !== 'Cavity' && d.cell_type !== 'Cavity_2_20');
        const totalCells = nonBrainCells.reduce((sum, d) => sum + d.cell_num, 0);
        
        console.log('非Brain细胞:', nonBrainCells);
        console.log('总细胞数:', totalCells);
        
        // 获取强度的最大值用于归一化
        const maxSendIntensity = Math.max(...totalData.map(d => d.发送总强度));
        const maxReceiveIntensity = Math.max(...totalData.map(d => d.接收总强度));
        
        console.log('最大发送强度:', maxSendIntensity);
        console.log('最大接收强度:', maxReceiveIntensity);
        
        // 处理数据并合并通讯强度信息
        let tempData = [];
        
        nonBrainCells.forEach(cellInfo => {
            // 尝试多种匹配方式
            const commData = totalData.find(d => {
                const neighbor = d.邻居细胞;
                const cellType = cellInfo.cell_type;
                
                return neighbor === cellType || 
                       neighbor.includes(cellType) ||
                       cellType.includes(neighbor) ||
                       neighbor.toLowerCase() === cellType.toLowerCase();
            });
            
            if (commData) {
                // 计算弧度（基于细胞数量占比）
                const proportion = cellInfo.cell_num / totalCells;
                const arcLength = 2 * Math.PI * proportion;
                
                // 计算向外和向内的延伸距离
                const sendExtension = (commData.发送总强度 / maxSendIntensity) * this.maxOuterExtension;
                const receiveExtension = (commData.接收总强度 / maxReceiveIntensity) * this.maxInnerExtension;
                
                tempData.push({
                    cellType: cellInfo.cell_type,
                    cellNum: cellInfo.cell_num,
                    proportion: proportion,
                    arcLength: arcLength,
                    sendIntensity: commData.发送总强度,
                    receiveIntensity: commData.接收总强度,
                    totalIntensity: commData.通讯总强度,
                    sendExtension: sendExtension,
                    receiveExtension: receiveExtension,
                    sendChannels: commData.发送通道数,
                    receiveChannels: commData.接收通道数,
                    color: this.colorScale(cellInfo.cell_type), // 使用一致的颜色
                    发送平均强度: commData.发送平均强度,
                    接收平均强度: commData.接收平均强度,
                    总平均强度: commData.总平均强度
                });
                
                console.log(`匹配成功: ${cellInfo.cell_type} -> ${commData.邻居细胞}`);
            } else {
                console.warn(`未找到匹配的通讯数据: ${cellInfo.cell_type}`);
            }
        });
        
        console.log('处理后的数据:', tempData);
        
        // 按总通讯强度降序排序
        tempData.sort((a, b) => b.totalIntensity - a.totalIntensity);
        
        // 分配角度 - 从12点钟方向开始顺时针排列
        let currentAngle = -Math.PI / 2; // 从12点钟方向开始
        this.data = [];
        
        tempData.forEach(d => {
            this.data.push({
                ...d,
                startAngle: currentAngle,
                endAngle: currentAngle + d.arcLength
            });
            currentAngle += d.arcLength;
        });
        
        console.log('最终数据:', this.data);
    }
    
    drawChart() {
        // 绘制基础圆环
        this.g.append('circle')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', this.baseRadius)
            .attr('fill', 'none')
            .attr('stroke', '#ddd')
            .attr('stroke-width', 2);
        
        // 绘制细胞弧段
        this.data.forEach((d, i) => {
            this.drawCellArc(d, i);
        });
    }
    
    drawCenterChart(cellData) {
        // 找到Brain细胞
        const center = cellData.find(d => d.cell_type === 'Brain_1_33' || d.cell_type === 'Brain');
        if (!center) {
            console.warn('未找到Brain细胞数据');
            return;
        }
        
        const neighbors = cellData.filter(d => d !== center);
        
        // 计算坐标范围
        const xs = cellData.map(d => d.x);
        const ys = cellData.map(d => d.y);
        const xMin = Math.min(...xs), xMax = Math.max(...xs);
        const yMin = Math.min(...ys), yMax = Math.max(...ys);
        
        // 计算等比缩放因子（缩放到70x70的空间）
        const span = Math.max(xMax - xMin, yMax - yMin);
        const scale = span === 0 ? 1 : 85 / span; // 缩放到60像素范围内

        // 平移 + 缩放函数
        const tx = d => (d.x - (xMin + xMax) / 2) * scale;
        const ty = d => (d.y - (yMin + yMax) / 2) * scale;
        
        // 半径比例尺
        const rScale = d3.scaleSqrt()
            .domain(d3.extent(cellData, d => d.cell_num))
            .range([1, 10]);
        
        // 创建中心图组
        const centerGroup = this.g.append('g')
            .attr('class', 'center-chart');
        

        // 绘制外框圆
        centerGroup.append('circle')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', 75)
            .attr('fill', 'none')
            .attr('stroke', '#333')
            .attr('stroke-width', 1);
        
        // 绘制连线
        centerGroup.selectAll('.center-link')
            .data(neighbors)
            .join('line')
            .attr('class', 'center-link')
            .attr('x1', tx(center))
            .attr('y1', ty(center))
            .attr('x2', d => tx(d))
            .attr('y2', d => ty(d))
            .attr('stroke', '#555')
            .attr('stroke-width', 0.5)
            .attr('stroke-dasharray', '1,1');
        
        // 绘制节点
        centerGroup.selectAll('.center-dot')
            .data(cellData)
            .join('circle')
            .attr('class', 'center-dot')
            .attr('cx', d => tx(d))
            .attr('cy', d => ty(d))
            .attr('r', d => rScale(d.cell_num))
            .attr('fill', d => this.colorScale(d.cell_type))
            .attr('stroke', '#fff')
            .attr('stroke-width', 0.3);
    }
    
    drawCellArc(data, index) {
        const group = this.g.append('g')
            .attr('class', `cell-group-${index}`);
        
        // 创建弧生成器
        const arc = d3.arc();
        
        // 绘制接收强度弧（向内，不透明）
        const innerRadius = Math.max(this.minInnerRadius, this.baseRadius - data.receiveExtension);
        const innerArc = arc
            .innerRadius(innerRadius)
            .outerRadius(this.baseRadius)
            .startAngle(data.startAngle)
            .endAngle(data.endAngle);
        
        group.append('path')
            .attr('d', innerArc)
            .attr('fill', data.color)
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .on('mouseover', (event) => this.showTooltip(event, data, '接收'))
            .on('mouseout', () => this.hideTooltip());
        
        // 绘制发送强度弧（向外，50%透明度）
        const outerRadius = Math.min(this.maxOuterRadius, this.baseRadius + data.sendExtension);
        const outerArc = arc
            .innerRadius(this.baseRadius)
            .outerRadius(outerRadius)
            .startAngle(data.startAngle)
            .endAngle(data.endAngle);
        
        group.append('path')
            .attr('d', outerArc)
            .attr('fill', data.color)
            .attr('fill-opacity', 0.5) // 50%透明度
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .on('mouseover', (event) => this.showTooltip(event, data, '发送'))
            .on('mouseout', () => this.hideTooltip());
    }
    
    updateLegend() {
        // 更新图例，显示每种细胞类型的颜色
        const legendContainer = d3.select('.legend');
        legendContainer.selectAll('.legend-item').remove();
        
        // 添加颜色图例
        this.data.forEach(d => {
            const legendItem = legendContainer.append('div')
                .attr('class', 'legend-item');
            
            legendItem.append('div')
                .attr('class', 'legend-color')
                .style('background', d.color);
            
            legendItem.append('span')
                .text(`${d.cellType} (总强度: ${d.totalIntensity.toFixed(1)})`);
        });
        
        // 添加说明
        const explanationItem = legendContainer.append('div')
            .attr('class', 'legend-item')
            .style('margin-top', '10px')
            .style('font-size', '12px')
            .style('color', '#666');
        
        explanationItem.append('span')
            .text('内环: 接收强度 | 外环: 发送强度(50%透明) | 顺时针按总强度排序 | 中心: 空间分布图');
    }
    
    showTooltip(event, data, type) {
        const intensity = type === '发送' ? data.sendIntensity : data.receiveIntensity;
        const channels = type === '发送' ? data.sendChannels : data.receiveChannels;
        const avgIntensity = type === '发送' ? data.发送平均强度 : data.接收平均强度;
        
        this.tooltip
            .style('opacity', 1)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px')
            .html(`
                <strong>${data.cellType}</strong><br/>
                ${type}强度: ${intensity.toFixed(3)}<br/>
                ${type}通道数: ${channels}<br/>
                平均强度: ${avgIntensity.toFixed(4)}<br/>
                总通讯强度: ${data.totalIntensity.toFixed(3)}<br/>
                细胞数量: ${data.cellNum}<br/>
                占比: ${(data.proportion * 100).toFixed(1)}%
            `);
    }
    
    hideTooltip() {
        this.tooltip.style('opacity', 0);
    }
}

// 初始化图表
document.addEventListener('DOMContentLoaded', function() {
    new CellCommunicationChart('chart');
});