import { CellLocation } from './CellLocation.js';

export class LineageChart {
    constructor(containerId, cellName, detailedPaths = null, pathIndex = null) {
        this.containerId = containerId;
        this.cellName = cellName;
        this.detailedPaths = detailedPaths; // 详细路径信息或具体细胞数组
        this.pathIndex = pathIndex; // 在路径中的位置
        this.aggregateMode = Array.isArray(detailedPaths) && (typeof detailedPaths[0] === 'string');
        this.dataLoaded = new Promise((resolve, reject) => {
            this.resolveDataLoaded = resolve;
            this.rejectDataLoaded = reject;
        });
        this.baseRadius = 60;
        this.minInnerRadius = 45;
        this.maxOuterRadius = 75;
        this.maxInnerExtension = this.baseRadius - this.minInnerRadius; // 15
        this.maxOuterExtension = this.maxOuterRadius - this.baseRadius; // 15
        this.width = 180;
        this.height = 180;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        // 统一配色：与 PathPattern 一致的类型颜色映射
        this.typeColors = {
            'Heart': '#d4b365',
            'Neural crest': '#5B9BD5',
            'Branchial arch': '#70AD47',
            'AGM': '#00B050',
            'Liver': '#FF6D01',
            'Cavity': '#404040',
            'Blood vessel': '#E1819E',
            'Brain': '#8B4513',
            'Connective tissue': '#9966CC',
            'Dermomyotome': '#FF69B4',
            'Head mesenchyme': '#20B2AA',
            'Lung primordium': '#FF4500',
            'Mesenchyme': '#DAA520',
            'Notochord': '#4682B4',
            'Sclerotome': '#32CD32',
            'Spinal cord': '#8A2BE2',
            'Surface ectoderm': '#FF1493',
            'Urogenital ridge': '#00CED1'
        };
        // 稳定的兜底调色（当遇到未在映射表中的类型）
        this.fallbackPalette = d3.schemeCategory10;

        // 绑定方法的上下文
        this.showTooltip = this.showTooltip.bind(this);
        this.hideTooltip = this.hideTooltip.bind(this);

        this.init();
    }

    init() {
        this.svg = d3.select(`#${this.containerId}`)
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height);

        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.centerX}, ${this.centerY})`);

        this.tooltip = d3.select('body').select('.lineage-tooltip');
        if (this.tooltip.empty()) {
            this.tooltip = d3.select('body').append('div')
                .attr('class', 'lineage-tooltip')
                .style('opacity', 0)
                .style('position', 'absolute')
                .style('pointer-events', 'none')
                .style('background', 'rgba(0,0,0,0.7)')
                .style('color', 'white')
                .style('padding', '8px')
                .style('border-radius', '4px')
                .style('font-size', '12px');
        }

        this.loadData();
    }

    getTypeColor(name) {
        const key = (name || '').trim();
        if (this.typeColors[key]) return this.typeColors[key];
        // 稳定哈希到调色板索引
        let h = 0;
        for (let i = 0; i < key.length; i++) {
            h = (h * 31 + key.charCodeAt(i)) >>> 0;
        }
        return this.fallbackPalette[h % this.fallbackPalette.length];
    }

    async loadData() {
        try {
            if (this.aggregateMode) {
                await this.loadAggregateSpecificCells();
            } else if (this.detailedPaths && this.pathIndex !== null) {
                await this.loadMergedData();
            } else {
                await this.loadSingleData();
            }
        } catch (e) {
            console.warn('LineageChart loadData error', e);
            this.handleLoadError();
        }
    }

    async loadAggregateSpecificCells() {
        // detailedPaths 为具体细胞名称数组，聚合其 total/cell 数据
        const totalAll = [];
        const cellAll = [];
        for (const cell of this.detailedPaths) {
            try {
                const totalPath = `./js/components/pathSelection/Every_cell_info_withKJ/${cell}/${cell}_total.csv`;
                const cellPath = `./js/components/pathSelection/Every_cell_info_withKJ2/${cell}/${cell}.csv`;
                const totalData = await d3.csv(totalPath, d3.autoType);
                const cellData = await d3.csv(cellPath, d3.autoType);
                totalAll.push(...totalData);
                cellAll.push(...cellData);
            } catch (err) {
                console.warn('聚合加载失败', cell, err);
            }
        }
        const aggTotal = this.calculateAggregatedTotalData(totalAll);
        const aggCell = this.calculateAggregatedCellData(cellAll);
        this.processData(aggTotal, aggCell);
        this.drawChart();
        await this.drawCenterImage();
        this.resolveDataLoaded();
    }

    async loadMergedData() {
        // 获取该位置对应的所有具体细胞名称
        // 兼容两种输入：
        // 1) this.detailedPaths 为具体细胞名字符串数组
        // 2) this.detailedPaths 为包含 path_string 的路径对象数组
        const specificCellNames = (this.detailedPaths || [])
            .map(item => {
                if (typeof item === 'string') return item;
                if (item && typeof item.path_string === 'string') {
                    const nodes = item.path_string.split(' -> ');
                    return nodes[this.pathIndex];
                }
                return null;
            })
            .filter(name => !!name);

        if (specificCellNames.length === 0) {
            throw new Error('No specific cell names found for this position');
        }

    // 加载所有相关细胞的数据并进行求和聚合（通讯强度与通道数量合计；平均强度取均值）
        const allTotalData = [];
        const allCellData = [];

        for (const specificCellName of specificCellNames) {
            try {
                const totalPath = `./js/components/pathSelection/Every_cell_info_withKJ/${specificCellName}/${specificCellName}_total.csv`;
                const cellPath = `./js/components/pathSelection/Every_cell_info_withKJ/${specificCellName}/${specificCellName}.csv`;

                const totalData = await d3.csv(totalPath, d3.autoType);
                const cellData = await d3.csv(cellPath, d3.autoType);

                allTotalData.push(...totalData);
                allCellData.push(...cellData);
            } catch (error) {
                console.warn(`Failed to load data for ${specificCellName}:`, error);
            }
        }

    // 计算聚合值
    const aggregatedTotalData = this.calculateAggregatedTotalData(allTotalData);
    const aggregatedCellData = this.calculateAggregatedCellData(allCellData);

    this.processData(aggregatedTotalData, aggregatedCellData);
    this.drawChart();
    await this.drawCenterImage();
        this.resolveDataLoaded();
    }

    async loadSingleData() {
        // 原有的加载逻辑
        const totalPath = `./js/components/pathSelection/Every_cell_info_withKJ/${this.cellName}/${this.cellName}_total.csv`;
        const cellPath = `./js/components/pathSelection/Every_cell_info_withKJ/${this.cellName}/${this.cellName}.csv`;

        const totalData = await d3.csv(totalPath, d3.autoType);
        const cellData = await d3.csv(cellPath, d3.autoType);

        this.processData(totalData, cellData);
    this.drawChart();
    await this.drawCenterImage();
        this.resolveDataLoaded();
    }

    calculateAggregatedTotalData(allTotalData) {
        // 按邻居细胞类型分组：强度/通道做求和，平均强度做均值
        const groupedData = {};
        
        allTotalData.forEach(d => {
            const key = d.邻居细胞;
            if (!groupedData[key]) {
                groupedData[key] = {
                    邻居细胞: key,
                    发送总强度_sum: 0,
                    接收总强度_sum: 0,
                    通讯总强度_sum: 0,
                    发送通道数_sum: 0,
                    接收通道数_sum: 0,
                    发送平均强度_sum: 0,
                    接收平均强度_sum: 0,
                    count: 0
                };
            }
            
            groupedData[key].发送总强度_sum += d.发送总强度 || 0;
            groupedData[key].接收总强度_sum += d.接收总强度 || 0;
            groupedData[key].通讯总强度_sum += d.通讯总强度 || 0;
            groupedData[key].发送通道数_sum += d.发送通道数 || 0;
            groupedData[key].接收通道数_sum += d.接收通道数 || 0;
            groupedData[key].发送平均强度_sum += d.发送平均强度 || 0;
            groupedData[key].接收平均强度_sum += d.接收平均强度 || 0;
            groupedData[key].count++;
        });

        // 输出：强度/通道=和；平均强度=均值
        return Object.values(groupedData).map(group => ({
            邻居细胞: group.邻居细胞,
            发送总强度: group.发送总强度_sum,
            接收总强度: group.接收总强度_sum,
            通讯总强度: group.通讯总强度_sum,
            发送通道数: group.发送通道数_sum,
            接收通道数: group.接收通道数_sum,
            发送平均强度: group.发送平均强度_sum / Math.max(group.count, 1),
            接收平均强度: group.接收平均强度_sum / Math.max(group.count, 1)
        }));
    }

    calculateAggregatedCellData(allCellData) {
        // 按细胞类型分组：数量求和，以显示总体组成
        const groupedData = {};
        
        allCellData.forEach(d => {
            const key = d.cell_type;
            if (!groupedData[key]) {
                groupedData[key] = {
                    cell_type: key,
                    cell_num_sum: 0
                };
            }
            
            groupedData[key].cell_num_sum += d.cell_num || 0;
        });

        return Object.values(groupedData).map(group => ({
            cell_type: group.cell_type,
            cell_num: group.cell_num_sum
        }));
    }

    processData(totalData, cellData) {
        const getBaseName = (name) => name.split('_')[0].toLowerCase();
        const centerBaseName = getBaseName(this.cellName);

        // 包含：不同类型 + 同类型且 cluster_id 不是 target（或没有 cluster_id 信息时默认包含）
        const neighborCells = cellData.filter(d => {
            const base = getBaseName(d.cell_type || '');
            if (base !== centerBaseName) return true;
            const cluster = (d.cluster_id || '').toString().toLowerCase();
            return cluster !== 'target';
        });
        const totalCells = d3.sum(neighborCells, d => d.cell_num);

        const maxSendIntensity = d3.max(totalData, d => d.发送总强度) || 1;
        const maxReceiveIntensity = d3.max(totalData, d => d.接收总强度) || 1;

    let tempData = [];
    neighborCells.forEach(cellInfo => {
            const commData = totalData.find(d => d.邻居细胞.toLowerCase() === cellInfo.cell_type.toLowerCase());
            const proportion = totalCells > 0 ? (cellInfo.cell_num / totalCells) : 0;

            if (commData) {
                tempData.push({
                    cellType: cellInfo.cell_type,
                    cellNum: cellInfo.cell_num,
                    proportion: proportion,
                    arcLength: 2 * Math.PI * proportion,
                    sendExtension: (commData.发送总强度 / maxSendIntensity) * this.maxOuterExtension,
                    receiveExtension: (commData.接收总强度 / maxReceiveIntensity) * this.maxInnerExtension,
                    sendIntensity: commData.发送总强度,
                    receiveIntensity: commData.接收总强度,
                    totalIntensity: commData.通讯总强度,
                    sendChannels: commData.发送通道数,
                    receiveChannels: commData.接收通道数,
                    sendAvgIntensity: commData.发送平均强度,
                    receiveAvgIntensity: commData.接收平均强度,
                    color: this.getTypeColor(cellInfo.cell_type),
                    hasComm: true,
                });
            } else {
                tempData.push({
                    cellType: cellInfo.cell_type,
                    cellNum: cellInfo.cell_num,
                    proportion: proportion,
                    arcLength: 2 * Math.PI * proportion,
                    sendExtension: 0,
                    receiveExtension: 0,
                    sendIntensity: 0,
                    receiveIntensity: 0,
                    totalIntensity: 0,
                    sendChannels: 0,
                    receiveChannels: 0,
                    sendAvgIntensity: 0,
                    receiveAvgIntensity: 0,
                    color: this.getTypeColor(cellInfo.cell_type),
                    hasComm: false,
                });
            }
        });

        tempData.sort((a, b) => b.totalIntensity - a.totalIntensity);

        let currentAngle = -Math.PI / 2;
        this.data = [];
        tempData.forEach(d => {
            this.data.push({ ...d, startAngle: currentAngle, endAngle: currentAngle + d.arcLength });
            currentAngle += d.arcLength;
        });
    }

    drawChart() {
        this.g.append('circle')
            .attr('r', this.baseRadius)
            .attr('fill', 'none')
            .attr('stroke', '#ddd')
            .attr('stroke-width', 1);

        const arc = d3.arc();
        this.data.forEach(d => {
            if (d.hasComm) {
        this.g.append('path')
                    .datum(d)
                    .attr('d', arc.innerRadius(this.baseRadius - d.receiveExtension).outerRadius(this.baseRadius).startAngle(d.startAngle).endAngle(d.endAngle))
                    .attr('fill', d.color)
                    .attr('stroke', 'white')
                    .attr('stroke-width', 0.5)
                    .on('mouseover', (event, d) => {
                        d3.select(event.currentTarget)
                            .attr('stroke', '#333')
                            .attr('stroke-width', 1.5);
                        this.showTooltip(event, d, '接收');
            if (this._highlightNeighbor) this._highlightNeighbor(d.cellType.split('_')[0]);
                    })
                    .on('mouseout', (event) => {
                        d3.select(event.currentTarget)
                            .attr('stroke', 'white')
                            .attr('stroke-width', 0.5);
                        this.hideTooltip();
            if (this._clearHighlight) this._clearHighlight();
                    })
                    .on('click', (event, d) => {
                        document.dispatchEvent(new CustomEvent('cellSelected', {
                            detail: { cellName: this.cellName }
                        }));
                        document.dispatchEvent(new CustomEvent('communicationArcSelected', {
                            detail: {
                                cellName: this.cellName,
                                neighborCell: d.cellType,
                                communicationType: 'receive'
                            }
                        }));
                    });

        this.g.append('path')
                    .datum(d)
                    .attr('d', arc.innerRadius(this.baseRadius).outerRadius(this.baseRadius + d.sendExtension).startAngle(d.startAngle).endAngle(d.endAngle))
                    .attr('fill', d.color)
                    .attr('fill-opacity', 0.5)
                    .attr('stroke', 'white')
                    .attr('stroke-width', 0.5)
                    .on('mouseover', (event, d) => {
                        d3.select(event.currentTarget)
                            .attr('stroke', '#333')
                            .attr('stroke-width', 1.5)
                            .attr('fill-opacity', 0.7);
                        this.showTooltip(event, d, '发送');
            if (this._highlightNeighbor) this._highlightNeighbor(d.cellType.split('_')[0]);
                    })
                    .on('mouseout', (event) => {
                        d3.select(event.currentTarget)
                            .attr('stroke', 'white')
                            .attr('stroke-width', 0.5)
                            .attr('fill-opacity', 0.5);
                        this.hideTooltip();
            if (this._clearHighlight) this._clearHighlight();
                    })
                    .on('click', (event, d) => {
                        document.dispatchEvent(new CustomEvent('cellSelected', {
                            detail: { cellName: this.cellName }
                        }));
                        document.dispatchEvent(new CustomEvent('communicationArcSelected', {
                            detail: {
                                cellName: this.cellName,
                                neighborCell: d.cellType,
                                communicationType: 'send'
                            }
                        }));
                    });
            }
        });
    }

    async drawCenterImage() {
        // 创建中心裁剪区域
        const clipId = `center-clip-${this.containerId}`;
        this.g.append('defs')
            .append('clipPath')
            .attr('id', clipId)
            .append('circle')
            .attr('r', 40)
            .attr('cx', 0)
            .attr('cy', 0);

        // 创建中心组
        const centerGroup = this.g.append('g')
            .attr('class', 'center-image')
            .attr('clip-path', `url(#${clipId})`)
            .style('cursor', 'pointer')
            .on('click', () => {
                // 点击中心图，联动右侧 Spatial（和 Marker 标题）
                document.dispatchEvent(new CustomEvent('cellSelected', {
                    detail: { cellName: this.cellName }
                }));
            });

        // 添加边框圆圈
        centerGroup.append('circle')
            .attr('r', 40)
            .attr('fill', 'none')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 0.5);

        // 使用 CellLocation 渲染迷你位置散点（固定 L6）
        try {
            if (!LineageChart._cellLocation) {
                LineageChart._cellLocation = new CellLocation({ embeddingLevel: 6 });
            }
            // 计算该位置具体细胞集合
            let specificCells = [];
            if (this.detailedPaths && this.pathIndex !== null) {
                specificCells = (this.detailedPaths || []).map(item => {
                    if (typeof item === 'string') return item;
                    if (item && typeof item.path_string === 'string') {
                        const nodes = item.path_string.split(' -> ');
                        return nodes[this.pathIndex];
                    }
                    return null;
                }).filter(Boolean);
            } else {
                specificCells = [this.cellName];
            }

            await LineageChart._cellLocation.renderInto(centerGroup, specificCells, {
                size: 80,
                baseType: this.cellName.split('_')[0]
            });

            // 绑定高亮方法以便弧 hover 调用
            const cellLoc = LineageChart._cellLocation;
            this._highlightNeighbor = async (neighborType) => {
                await cellLoc.setNeighborHighlight(centerGroup, neighborType, { size: 80 });
            };
            this._clearHighlight = () => cellLoc.clearNeighborHighlight(centerGroup);
        } catch (e) {
            // 降级占位
            centerGroup.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.3em')
                .text('无图片')
                .style('font-size', '10px')
                .style('fill', '#999');
        }

        // After existing rendering, overlay same-type count if aggregateMode
    // 移除先前的文字提示，不再单独显示同型细胞数量
    }

    showTooltip(event, data, type) {
        let content = `<strong>${data.cellType}</strong><br/>细胞数量: ${data.cellNum}<br/>占比: ${(data.proportion * 100).toFixed(1)}%`;

        if (data.hasComm) {
            const intensity = type === '发送' ? data.sendIntensity : data.receiveIntensity;
            const channels = type === '发送' ? data.sendChannels : data.receiveChannels;
            const avgIntensity = type === '发送' ? data.sendAvgIntensity : data.receiveAvgIntensity;
            content += `<hr style="margin: 4px 0; border-color: #555;">
                        ${type}强度: ${intensity.toFixed(3)}<br/>
                        ${type}通道数: ${channels}<br/>
                        平均强度: ${avgIntensity.toFixed(4)}<br/>
                        总通讯强度: ${data.totalIntensity.toFixed(3)}`;
        } else {
            content += `<hr style="margin: 4px 0; border-color: #555;">无通讯数据`;
        }

        this.tooltip
            .style('opacity', 1)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
            .html(content);
    }

    hideTooltip() {
        this.tooltip.style('opacity', 0);
    }

    // 补充缺失的错误处理，避免未定义函数报错
    handleLoadError() {
        try {
            // 清空并显示占位
            this.g && this.g.selectAll('*').remove();
            this.g && this.g.append('text')
                .attr('text-anchor', 'middle')
                .attr('x', 0)
                .attr('y', 0)
                .text('无数据')
                .style('font-size', '12px')
                .style('fill', '#999');
        } catch (_) {
            // 忽略绘制错误
        }
        // 不中断整体渲染
        if (this.resolveDataLoaded) this.resolveDataLoaded();
    }
}