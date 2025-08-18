export class AreaChart {
    constructor(containerId, neighborCellType, pathCells, showSelector = true) {
        this.containerId = containerId;
        this.neighborCellType = neighborCellType;
        this.pathCells = pathCells;
        this.showSelector = showSelector;
        this.width = 200;
        this.height = 140;
        this.margin = { top: 30, right: 15, bottom: 30, left: 15 };
        this.chartWidth = this.width - this.margin.left - this.margin.right;
        this.chartHeight = this.height - this.margin.top - this.margin.bottom;
        
        // 颜色：与细胞类型一致；回退到 schemeCategory10（基于哈希稳定映射）
        this.typeColorMap = {
            'Heart': '#d4b365', 'Neural crest': '#5B9BD5', 'Branchial arch': '#70AD47',
            'AGM': '#00B050', 'Liver': '#FF6D01', 'Cavity': '#404040',
            'Blood vessel': '#E1819E', 'Brain': '#8B4513', 'Connective tissue': '#9966CC',
            'Dermomyotome': '#FF69B4', 'Head mesenchyme': '#20B2AA', 'Lung primordium': '#FF4500',
            'Mesenchyme': '#DAA520', 'Notochord': '#4682B4', 'Sclerotome': '#32CD32',
            'Spinal cord': '#8A2BE2', 'Surface ectoderm': '#FF1493', 'Urogenital ridge': '#00CED1'
        };
        this.scheme = d3.schemeCategory10;
        
        this.dataLoaded = new Promise((resolve, reject) => {
            this.resolveDataLoaded = resolve;
            this.rejectDataLoaded = reject;
        });
        
        this.init();
    }

    init() {
        const container = d3.select(`#${this.containerId}`);
        
        // 创建SVG
        this.svg = container.append('svg')
            .attr('width', this.width)
            .attr('height', this.height);

        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`);

        this.loadData();
    }

    async loadData() {
        try {
            const allData = [];
            // 路径上每一位细胞可能是具体字符串，或合并模式下的描述对象
            for (const item of this.pathCells) {
                const specificCells = typeof item === 'string' ? [item] : (item.specificCells || []);
                const label = typeof item === 'string' ? item : (item.label || '');

                let agg = {
                    cellName: label,
                    neighborCellType: this.neighborCellType,
                    totalChannels: 0,
                    totalAvgIntensity_sum: 0,
                    totalCommIntensity: 0,
                    sendIntensity: 0,
                    receiveIntensity: 0,
                    sendChannels: 0,
                    receiveChannels: 0,
                    count: 0
                };

                for (const cellName of specificCells) {
                    const totalPath = `./js/components/pathSelection/Every_cell_info_withKJL4/${cellName}/${cellName}_total.csv`;
                    try {
                        const totalData = await d3.csv(totalPath, d3.autoType);
                        const neighborData = totalData.find(d => d.邻居细胞 && d.邻居细胞.toLowerCase() === this.neighborCellType.toLowerCase());
                        if (neighborData) {
                            agg.totalChannels += neighborData.总通道数 || 0;
                            agg.totalAvgIntensity_sum += neighborData.总平均强度 || 0;
                            agg.totalCommIntensity += neighborData.通讯总强度 || 0;
                            agg.sendIntensity += neighborData.发送总强度 || 0;
                            agg.receiveIntensity += neighborData.接收总强度 || 0;
                            agg.sendChannels += neighborData.发送通道数 || 0;
                            agg.receiveChannels += neighborData.接收通道数 || 0;
                            agg.count++;
                        }
                    } catch (error) {
                        console.warn(`无法加载${cellName}的数据:`, error);
                    }
                }

                // 平均强度取均值，其它指标取和
                const finalized = {
                    cellName: label,
                    neighborCellType: this.neighborCellType,
                    totalChannels: agg.totalChannels,
                    totalAvgIntensity: agg.count > 0 ? (agg.totalAvgIntensity_sum / agg.count) : 0,
                    totalCommIntensity: agg.totalCommIntensity,
                    sendIntensity: agg.sendIntensity,
                    receiveIntensity: agg.receiveIntensity,
                    sendChannels: agg.sendChannels,
                    receiveChannels: agg.receiveChannels
                };

                allData.push(finalized);
            }

            this.processData(allData);
            this.drawChart();
            this.resolveDataLoaded();
        } catch (error) {
            console.error(`AreaChart 数据加载失败 for ${this.neighborCellType}:`, error);
            this.g.append('text')
                .attr('x', this.chartWidth / 2)
                .attr('y', this.chartHeight / 2)
                .attr('text-anchor', 'middle')
                .text('无数据')
                .style('font-size', '12px')
                .style('fill', '#999');
            this.rejectDataLoaded(error);
        }
    }

    processData(allData) {
        this.data = allData;

        // 创建X轴比例尺 - 路径上的细胞位置（支持字符串或描述对象）
        // 使用位置索引作为 domain key，避免相同标签在不同位置重叠；显示时仍用标签
    const domainKeys = this.pathCells.map((_, idx) => idx.toString());
    this.labelsByIndex = this.pathCells.map(item => typeof item === 'string' ? item : (item.label || ''));
        this.xScale = d3.scalePoint()
            .domain(domainKeys)
            .range([0, this.chartWidth])
            .padding(0.1);

        // 计算最大值用于对称的Y轴
        const maxReceive = d3.max(this.data, d => d.receiveIntensity) || 1;
        const maxSend = d3.max(this.data, d => d.sendIntensity) || 1;
        const maxValue = Math.max(maxReceive, maxSend);
        
        // Y轴中心线在图表中心，上方为正值（接收），下方为负值（发送）
        this.centerY = this.chartHeight / 2;
        
        // 为接收强度创建比例尺（上半部分）
        this.receiveScale = d3.scaleLinear()
            .domain([0, maxValue])
            .range([this.centerY, 0]);
            
        // 为发送强度创建比例尺（下半部分）
        this.sendScale = d3.scaleLinear()
            .domain([0, maxValue])
            .range([this.centerY, this.chartHeight]);
    }

    drawChart() {
        // 清空之前的内容
        this.g.selectAll('*').remove();

        if (this.data.length === 0) {
            this.g.append('text')
                .attr('x', this.chartWidth / 2)
                .attr('y', this.chartHeight / 2)
                .attr('text-anchor', 'middle')
                .text('无数据')
                .style('font-size', '12px')
                .style('fill', '#999');
            return;
        }

        // 添加标题
        this.svg.append('text')
            .attr('x', this.width / 2)
            .attr('y', 15)
            .attr('text-anchor', 'middle')
            .text(`${this.neighborCellType}`)
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('fill', '#333');

        const maxReceive = d3.max(this.data, d => d.receiveIntensity);
        const maxSend = d3.max(this.data, d => d.sendIntensity);
        
        if (maxReceive > 0 || maxSend > 0) {
            // 基于邻居细胞类型确定统一颜色（与 lineage vis 一致）
            const baseType = (this.neighborCellType || '').split('_')[0];
            const baseColor = this.typeColorMap[baseType] || this.colorFromScheme(baseType);
            const receiveColor = baseColor;        // 上半：不透明
            const sendColor = baseColor;           // 下半：半透明

            // 创建接收强度的area生成器（上半部分）
            const receiveArea = d3.area()
                .x((d, i) => this.xScale(i.toString()))
                .y0(this.centerY)
                .y1(d => this.receiveScale(d.receiveIntensity))
                .curve(d3.curveMonotoneX);

            // 创建发送强度的area生成器（下半部分）
            const sendArea = d3.area()
                .x((d, i) => this.xScale(i.toString()))
                .y0(this.centerY)
                .y1(d => this.sendScale(d.sendIntensity))
                .curve(d3.curveMonotoneX);

            // 创建接收强度的line生成器
            const receiveLine = d3.line()
                .x((d, i) => this.xScale(i.toString()))
                .y(d => this.receiveScale(d.receiveIntensity))
                .curve(d3.curveMonotoneX);

            // 创建发送强度的line生成器
            const sendLine = d3.line()
                .x((d, i) => this.xScale(i.toString()))
                .y(d => this.sendScale(d.sendIntensity))
                .curve(d3.curveMonotoneX);

            // 绘制接收强度区域（上半部分，不透明）
            this.g.append('path')
                .datum(this.data)
                .attr('d', receiveArea)
                .attr('fill', receiveColor)
                .attr('fill-opacity', 1.0);

            // 绘制发送强度区域（下半部分，透明一点）
            this.g.append('path')
                .datum(this.data)
                .attr('d', sendArea)
                .attr('fill', sendColor)
                .attr('fill-opacity', 0.5);

            // 绘制接收强度线条（不透明）
            this.g.append('path')
                .datum(this.data)
                .attr('d', receiveLine)
                .attr('fill', 'none')
                .attr('stroke', receiveColor)
                .attr('stroke-width', 2);

            // 绘制发送强度线条（同色，略透明）
            this.g.append('path')
                .datum(this.data)
                .attr('d', sendLine)
                .attr('fill', 'none')
                .attr('stroke', sendColor)
                .attr('stroke-width', 2)
                .attr('stroke-opacity', 0.85);

            // 绘制中心线（0轴）
            this.g.append('line')
                .attr('x1', 0)
                .attr('x2', this.chartWidth)
                .attr('y1', this.centerY)
                .attr('y2', this.centerY)
                .attr('stroke', '#666')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '2,2');

            // 绘制接收强度数据点（不透明）
            this.g.selectAll('.receive-point')
                .data(this.data)
                .join('circle')
                .attr('class', 'receive-point')
                .attr('cx', (d, i) => this.xScale(i.toString()))
                .attr('cy', d => this.receiveScale(d.receiveIntensity))
                .attr('r', 3)
                .attr('fill', receiveColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 1)
                .style('cursor', 'pointer')
                .on('mouseover', (event, d) => {
                    this.showTooltip(event, d, '接收');
                })
                .on('mouseout', () => {
                    this.hideTooltip();
                });

            // 绘制发送强度数据点（半透明）
            this.g.selectAll('.send-point')
                .data(this.data)
                .join('circle')
                .attr('class', 'send-point')
                .attr('cx', (d, i) => this.xScale(i.toString()))
                .attr('cy', d => this.sendScale(d.sendIntensity))
                .attr('r', 3)
                .attr('fill', sendColor)
                .attr('fill-opacity', 0.85)
                .attr('stroke', 'white')
                .attr('stroke-width', 1)
                .style('cursor', 'pointer')
                .on('mouseover', (event, d) => {
                    this.showTooltip(event, d, '发送');
                })
                .on('mouseout', () => {
                    this.hideTooltip();
                });

        }

        // 添加X轴
        const xAxis = d3.axisBottom(this.xScale)
            .tickSize(0)
            .tickPadding(8)
            .tickFormat((d) => this.labelsByIndex[+d] ?? '');

        // 绘制X轴（放在底部边缘）
        const xAxisG = this.g.selectAll('.x-axis').data([null]);
        xAxisG.join(enter => enter.append('g').attr('class', 'x-axis'))
            .attr('transform', `translate(0, ${this.chartHeight})`)
            .call(xAxis)
            .selectAll('text')
            .style('font-size', '9px')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-30)');
        // 移除X轴线
        this.g.select('.x-axis .domain').remove();

        // 创建工具提示
        this.tooltip = d3.select('body').select('.area-chart-tooltip');
        if (this.tooltip.empty()) {
            this.tooltip = d3.select('body').append('div')
                .attr('class', 'area-chart-tooltip')
                .style('opacity', 0)
                .style('position', 'absolute')
                .style('pointer-events', 'none')
                .style('background', 'rgba(0,0,0,0.8)')
                .style('color', 'white')
                .style('padding', '8px')
                .style('border-radius', '4px')
                .style('font-size', '11px')
                .style('z-index', '1000');
        }
    }

    showTooltip(event, data, type) {
        const content = `
            <strong>${data.cellName} ← ${data.neighborCellType}</strong><br/>
            ${type}强度: ${type === '接收' ? data.receiveIntensity.toFixed(3) : data.sendIntensity.toFixed(3)}<br/>
            总通道数: ${data.totalChannels}<br/>
            通讯总强度: ${data.totalCommIntensity.toFixed(3)}
        `;

        this.tooltip
            .style('opacity', 1)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
            .html(content);
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style('opacity', 0);
        }
    }

    // 工具：基于字符串生成稳定的调色板颜色（schemeCategory10）
    colorFromScheme(label) {
        // 简单哈希到 0..9
        let hash = 0;
        const s = String(label || 'unknown');
        for (let i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash |= 0;
        }
        const idx = Math.abs(hash) % this.scheme.length;
        return this.scheme[idx];
    }
}