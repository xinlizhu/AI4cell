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
    // 当前用于映射弧厚度的指标模式：'总强度' | '通道数' | '平均通道强度' | '细胞接收强度'
    this.metricMode = (window.lineageMetricMode) || '总强度';
    // 放大比例（默认 2 倍）
    this.scaleFactor = 2;
    this.baseRadius = 60 * this.scaleFactor;
    this.minInnerRadius = 45 * this.scaleFactor;
    this.maxOuterRadius = 75 * this.scaleFactor;
    this.maxInnerExtension = this.baseRadius - this.minInnerRadius; // 厚度同步放大
    this.maxOuterExtension = this.maxOuterRadius - this.baseRadius;
    this.width = 180 * this.scaleFactor;
    this.height = 180 * this.scaleFactor;
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

        // 监听全局指标切换事件
        document.addEventListener('lineageMetricModeChanged', (e) => {
            const mode = e.detail && e.detail.mode;
            if (mode && mode !== this.metricMode) {
                // 切换模式时，重置该模式下的全局百分位范围，避免串扰
                try {
                    if (!window.__lineageGlobalRangeByMode) window.__lineageGlobalRangeByMode = {};
                    window.__lineageGlobalRangeByMode[mode] = { low: Infinity, high: 0 };
                } catch(_) {}
                this.updateMetricMode(mode);
            }
        });

    // 注册实例用于全局统一尺度
    if (!window.__lineageCharts) window.__lineageCharts = [];
    window.__lineageCharts.push(this);
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
                const totalPath = `./js/components/pathSelection/Every_cell_info_withKJL4/${cell}/${cell}_total.csv`;
                const cellPath = `./js/components/pathSelection/Every_cell_info_withKJL4/${cell}/${cell}.csv`;
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
                const totalPath = `./js/components/pathSelection/Every_cell_info_withKJL4/${specificCellName}/${specificCellName}_total.csv`;
                const cellPath = `./js/components/pathSelection/Every_cell_info_withKJL4/${specificCellName}/${specificCellName}.csv`;

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
        const totalPath = `./js/components/pathSelection/Every_cell_info_withKJL4/${this.cellName}/${this.cellName}_total.csv`;
        const cellPath = `./js/components/pathSelection/Every_cell_info_withKJL4/${this.cellName}/${this.cellName}.csv`;

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
            细胞接收平均强度_sum: 0,
            细胞发送平均强度_sum: 0,
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
        groupedData[key].细胞接收平均强度_sum += d.细胞接收平均强度 || d['细胞接收平均强度'] || 0;
        groupedData[key].细胞发送平均强度_sum += d.细胞发送平均强度 || d['细胞发送平均强度'] || 0;
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
            平均发送通道数: group.发送通道数_sum / Math.max(group.count, 1),
            平均接收通道数: group.接收通道数_sum / Math.max(group.count, 1),
            发送平均强度: group.发送平均强度_sum / Math.max(group.count, 1),
        接收平均强度: group.接收平均强度_sum / Math.max(group.count, 1),
        细胞接收平均强度: group.细胞接收平均强度_sum / Math.max(group.count, 1),
        细胞发送平均强度: group.细胞发送平均强度_sum / Math.max(group.count, 1)
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
    // 缓存原始数据用于后续指标模式切换完整重建
    this._rawTotalDataRef = totalData;
    this._rawCellDataRef = cellData;
    if (!window.__neighborCellGlobalMax) window.__neighborCellGlobalMax = {};
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

    // 缓存用于指标切换

    // 根据当前指标模式选择数值字段
    const metricFields = this._resolveMetricFields(totalData, this.metricMode);
    const maxSendIntensity = metricFields.maxSend;
    const maxReceiveIntensity = metricFields.maxReceive;

    let tempData = [];
    neighborCells.forEach(cellInfo => {
            const commData = totalData.find(d => d.邻居细胞.toLowerCase() === cellInfo.cell_type.toLowerCase());
            const proportion = totalCells > 0 ? (cellInfo.cell_num / totalCells) : 0;

        if (commData) {
                // 当前模式对应的发送/接收值
                const mVals = this._mapCommValues(commData, this.metricMode);
                tempData.push({
                    cellType: cellInfo.cell_type,
                    cellNum: cellInfo.cell_num,
                    proportion: proportion,
                    arcLength: 2 * Math.PI * proportion,
                    sendExtension: (mVals.send / maxSendIntensity) * this.maxOuterExtension,
                    receiveExtension: (mVals.receive / maxReceiveIntensity) * this.maxInnerExtension,
                    sendIntensity: mVals.send,
                    receiveIntensity: mVals.receive,
                    totalIntensity: commData.通讯总强度,
                    sendChannels: commData.发送通道数,
                    receiveChannels: commData.接收通道数,
            avgSendChannels: commData.平均发送通道数,
            avgReceiveChannels: commData.平均接收通道数,
                    sendAvgIntensity: commData.发送平均强度,
                    receiveAvgIntensity: commData.接收平均强度,
                    perCellSend: commData.细胞发送平均强度,
                    perCellReceive: commData.细胞接收平均强度,
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
            avgSendChannels: 0,
            avgReceiveChannels: 0,
                    sendAvgIntensity: 0,
                    receiveAvgIntensity: 0,
                    perCellSend: 0,
                    perCellReceive: 0,
                    color: this.getTypeColor(cellInfo.cell_type),
                    hasComm: false,
                });
            }
        });

        // 根据当前指标模式计算排序值
        const mode = this.metricMode;
    const sortValue = (d) => {
            switch (mode) {
                case '通道数':
                    return (d.sendChannels || 0) + (d.receiveChannels || 0);
        case '平均通道数':
            return (d.avgSendChannels || 0) + (d.avgReceiveChannels || 0);
                case '平均通道强度':
                    return (d.sendAvgIntensity || 0) + (d.receiveAvgIntensity || 0);
                case '细胞接收强度':
                    return (d.perCellSend || 0) + (d.perCellReceive || 0);
                case '总强度':
                default:
                    return (d.sendIntensity || 0) + (d.receiveIntensity || 0); // 等价通讯总强度
            }
        };
        tempData.sort((a, b) => sortValue(b) - sortValue(a));

        let currentAngle = -Math.PI / 2;
        this.data = [];
        tempData.forEach(d => {
            this.data.push({ ...d, startAngle: currentAngle, endAngle: currentAngle + d.arcLength });
            currentAngle += d.arcLength;
            // 更新该邻居的全局最大 cellNum
            const prev = window.__neighborCellGlobalMax[d.cellType] || 0;
            if ((d.cellNum || 0) > prev) window.__neighborCellGlobalMax[d.cellType] = d.cellNum || 0;
        });

    // 基于全局容量为所有实例分配角度
        LineageChart.recomputeAllArcAnglesB();
    }

    drawChart() {
        this.g.selectAll('.base-circle').remove();
        this.g.append('circle')
            .attr('r', this.baseRadius)
            .attr('fill', 'none')
            .attr('stroke', '#ddd')
            .attr('stroke-width', 1)
            .attr('class', 'base-circle');

    const arc = d3.arc();
    this.g.selectAll('path.receive-arc, path.send-arc').remove();
    this.data.forEach(d => {
            if (d.hasComm) {
        this.g.append('path')
                    .datum(d)
                    .attr('d', arc.innerRadius(this.baseRadius - d.receiveExtension).outerRadius(this.baseRadius).startAngle(d.startAngle).endAngle(d.coloredEndAngle || d.endAngle))
                    .attr('fill', d.color)
                    .attr('stroke', 'white')
                    .attr('stroke-width', 0.5)
            .attr('class', 'receive-arc')
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
                    .attr('d', arc.innerRadius(this.baseRadius).outerRadius(this.baseRadius + d.sendExtension).startAngle(d.startAngle).endAngle(d.coloredEndAngle || d.endAngle))
                    .attr('fill', d.color)
                    .attr('fill-opacity', 0.5)
                    .attr('stroke', 'white')
                    .attr('stroke-width', 0.5)
                    .attr('class', 'send-arc')
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

    // 初次绘制后，广播统一缩放（按模式全局 P5–P99 + γ=2）
    this.broadcastGlobalRecompute();
        // 绘制全局空缺指示（可选）暂不绘制实际空缺弧，只保留留白
    }

    // 根据模式映射发送/接收值
    _mapCommValues(commData, mode) {
        switch (mode) {
            case '通道数':
                return { send: commData.发送通道数, receive: commData.接收通道数 };
            case '平均通道数':
                return { send: (+commData.平均发送通道数) || 0, receive: (+commData.平均接收通道数) || 0 };
            case '平均通道强度':
                return { send: commData.发送平均强度, receive: commData.接收平均强度 };
            case '细胞接收强度':
                return { send: commData.细胞发送平均强度 || 0, receive: commData.细胞接收平均强度 || 0 };
            case '总强度':
            default:
                return { send: commData.发送总强度, receive: commData.接收总强度 };
        }
    }

    _resolveMetricFields(totalData, mode) {
        let sendFieldMaxVals = [];
        let receiveFieldMaxVals = [];
        totalData.forEach(d => {
            const m = this._mapCommValues(d, mode);
            sendFieldMaxVals.push(m.send || 0);
            receiveFieldMaxVals.push(m.receive || 0);
        });
        return {
            maxSend: d3.max(sendFieldMaxVals) || 1,
            maxReceive: d3.max(receiveFieldMaxVals) || 1
        };
    }

    updateMetricMode(mode) {
    this.metricMode = mode;
    if (!this._rawTotalDataRef || !this._rawCellDataRef) return;
    // 全量重建，避免增量更新导致的弧消失或数据不同步
    this.processData(this._rawTotalDataRef, this._rawCellDataRef);
    this.drawChart();
        // 指标改变后重新全局尺度
        this.broadcastGlobalRecompute();
    }

    // 计算全局范围并对所有实例应用统一尺度（P5–P99 + γ=2）
    broadcastGlobalRecompute() {
        if (!window.__lineageCharts) return;
        if (!window.__lineageGlobalRangeByMode) window.__lineageGlobalRangeByMode = {};
        const mode = this.metricMode || window.lineageMetricMode || '总强度';
        // 汇总所有实例的本地范围，更新按模式的全局范围
        let aggLow = Infinity, aggHigh = 0;
        window.__lineageCharts.forEach(ch => {
            if (!ch.data) return;
            const r = ch._computeLocalPercentileRange();
            if (!r) return;
            aggLow = Math.min(aggLow, r.low);
            aggHigh = Math.max(aggHigh, r.high);
        });
        if (!(aggHigh > aggLow)) { aggLow = 0; aggHigh = 1; }
        const prev = window.__lineageGlobalRangeByMode[mode] || { low: Infinity, high: 0 };
        const newLow = Math.min(prev.low, aggLow);
        const newHigh = Math.max(prev.high, aggHigh);
        const changed = (newLow !== prev.low) || (newHigh !== prev.high);
        window.__lineageGlobalRangeByMode[mode] = { low: newLow, high: newHigh };
        // 按新的全局范围重绘所有实例
        window.__lineageCharts.forEach(ch => ch.applyGlobalScaling());
    }

    applyGlobalScaling() {
        // 使用“按模式”的全局百分位范围；若无则先广播计算
        if (!window.__lineageGlobalRangeByMode) window.__lineageGlobalRangeByMode = {};
        const mode = this.metricMode || window.lineageMetricMode || '总强度';
        const gr = window.__lineageGlobalRangeByMode[mode];
        if (!gr || !isFinite(gr.low) || !(gr.high > gr.low)) {
            this.broadcastGlobalRecompute();
            return;
        }
        const arc = d3.arc();
        // P5–P99 + γ=2 映射
        const usedLow = isFinite(gr.low) ? gr.low : 0;
        const usedHigh = (gr.high && gr.high > gr.low) ? gr.high : (gr.low + 1);
        const eps = 1e-9;
        const rng = Math.max(usedHigh - usedLow, eps);
        const gamma = 2;
        const T = (v) => {
            let z = ((v || 0) - usedLow) / rng;
            if (!isFinite(z)) z = 0;
            z = Math.max(0, Math.min(1, z));
            return Math.pow(z, gamma);
        };
        this.data && this.data.forEach(d => {
            if (!d.hasComm) return;
            // 统一标尺 + 百分位幂次映射
            d.sendExtension = T(d.sendIntensity) * this.maxOuterExtension;
            d.receiveExtension = T(d.receiveIntensity) * this.maxInnerExtension;
        });
        // 更新路径
        this.g.selectAll('path.receive-arc')
            .attr('d', d => {
                const gen = d3.arc().innerRadius(this.baseRadius - d.receiveExtension).outerRadius(this.baseRadius);
                return gen({ startAngle: d.startAngle, endAngle: d.coloredEndAngle || d.endAngle });
            });
        this.g.selectAll('path.send-arc')
            .attr('d', d => {
                const gen = d3.arc().innerRadius(this.baseRadius).outerRadius(this.baseRadius + d.sendExtension);
                return gen({ startAngle: d.startAngle, endAngle: d.coloredEndAngle || d.endAngle });
            });
    }

    _computeLocalPercentileRange() {
        if (!this.data) return null;
        const vals = [];
        this.data.forEach(d => {
            if (!d.hasComm) return;
            if (isFinite(d.sendIntensity) && d.sendIntensity != null) vals.push(Math.abs(+d.sendIntensity || 0));
            if (isFinite(d.receiveIntensity) && d.receiveIntensity != null) vals.push(Math.abs(+d.receiveIntensity || 0));
        });
        if (vals.length === 0) return { low: 0, high: 1 };
        const sorted = vals.slice().sort((a,b)=>a-b);
        const q = (arr, t) => (arr.length ? d3.quantileSorted(arr, t) || 0 : 0);
        let low = q(sorted, 0.05);
        let high = q(sorted, 0.99);
        if (!(high > low)) { low = 0; high = Math.max(1, d3.max(sorted) || 1); }
        return { low, high };
    }

    // 方案B：按全局最大容量为每个邻居分槽位
    static recomputeAllArcAnglesB() {
        if (!window.__lineageCharts) return;
        if (!window.__neighborCellGlobalMax) window.__neighborCellGlobalMax = {};
        window.__lineageCharts.forEach(ch => {
            if (!ch.data) return;
            // 全部邻居槽容量总和（全局）
            const capacities = ch.data.map(d => window.__neighborCellGlobalMax[d.cellType] || 0);
            const capacitySum = capacities.reduce((a,b)=>a+b,0) || 1;
            const fullCircle = Math.PI * 2;
            let cursor = -Math.PI / 2;
            ch.data.forEach(d => {
                const cap = window.__neighborCellGlobalMax[d.cellType] || 0;
                const slotAngle = (cap / capacitySum) * fullCircle;
                const coloredAngle = cap > 0 ? slotAngle * ((d.cellNum || 0)/cap) : 0;
                d.startAngle = cursor;
                d.coloredEndAngle = cursor + coloredAngle;
                d.endAngle = cursor + slotAngle; // 未填满部分即缺口
                cursor += slotAngle;
            });
            ch._anglesAssignedB = true;
        });
    }

    async drawCenterImage() {
        // 创建中心裁剪区域
        const clipId = `center-clip-${this.containerId}`;
        this.g.append('defs')
            .append('clipPath')
            .attr('id', clipId)
            .append('circle')
            .attr('r', 40 * this.scaleFactor)
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
            .attr('r', 40 * this.scaleFactor)
            .attr('fill', 'none')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 0.5);

        // 使用 CellLocation 渲染迷你位置散点（固定 L6）
        try {
            if (!LineageChart._cellLocation) {
                LineageChart._cellLocation = new CellLocation({ embeddingLevel: 4 });
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
                size: 80 * this.scaleFactor,
                baseType: this.cellName.split('_')[0]
            });

            // 绑定高亮方法以便弧 hover 调用
            const cellLoc = LineageChart._cellLocation;
            this._highlightNeighbor = async (neighborType) => {
                await cellLoc.setNeighborHighlight(centerGroup, neighborType, { size: 80 * this.scaleFactor });
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
    const globalCap = (window.__neighborCellGlobalMax && window.__neighborCellGlobalMax[data.cellType]) || 0;
    const fillPct = globalCap > 0 ? (data.cellNum / globalCap * 100).toFixed(1) : '0.0';
    let content = `<strong>${data.cellType}</strong><br/>细胞数量: ${data.cellNum} / 全局最大 ${globalCap}<br/>槽位占用: ${fillPct}%<br/>本图占比: ${(data.proportion * 100).toFixed(1)}%`;

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