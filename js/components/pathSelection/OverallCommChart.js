
// 计算三个独立图表的数据：细胞总数、发送通信、接收通信
async function computeThreeChartSeries(pathCellsOrDescriptors, neighborCells, metricMode) {
    const descriptors = pathCellsOrDescriptors.map(item => (
        typeof item === 'string' ? { label: item, specificCells: [item] } : item
    ));

    const neighborSet = new Set(Array.isArray(neighborCells) ? neighborCells : []);
    const cellCountPositions = []; // 细胞总数数据
    const receivePositions = []; // 接收通信数据
    const sendPositions = [];    // 发送通信数据

    const mode = metricMode || (typeof window !== 'undefined' && (window.lineageMetricMode || window.__overallCommCurrentMode)) || '总强度';
    const mapVals = (row) => {
        switch (mode) {
            case '通道数':
                return { send: (+row['发送通道数'] || 0), recv: (+row['接收通道数'] || 0) };
            case '平均通道数':
                return { send: (+row['平均发送通道数'] || 0), recv: (+row['平均接收通道数'] || 0) };
            case '平均通道强度':
                return { send: (+row['发送平均强度'] || 0), recv: (+row['接收平均强度'] || 0) };
            case '细胞接收强度':
            case '细胞平均强度':
                return { send: (+row['细胞发送平均强度'] || 0), recv: (+row['细胞接收平均强度'] || 0) };
            case '总强度':
            default:
                return { send: (+row['发送总强度'] || 0), recv: (+row['接收总强度'] || 0) };
        }
    };

    for (let i = 0; i < descriptors.length; i++) {
        const desc = descriptors[i];
        const totalsReceive = {}; // { neighbor: receiveVal }
        const totalsSend = {};    // { neighbor: sendVal }
        let totalCellCount = 0;   // 该位置的总细胞数

        for (const sc of desc.specificCells) {
            // 读取细胞总数
            const cellCsv = `./js/components/pathSelection/Every_cell_info_withKJL4/${sc}/${sc}.csv`;
            try {
                const cellRows = await d3.csv(cellCsv, d3.autoType);
                totalCellCount += d3.sum(cellRows, d => d.cell_num || 0);
            } catch (e) {
                console.warn('读取细胞数据失败（忽略该 specificCell）:', cellCsv, e);
            }

            // 读取通信数据
            const totalCsv = `./js/components/pathSelection/Every_cell_info_withKJL4/${sc}/${sc}_total.csv`;
            try {
                const rows = await d3.csv(totalCsv, d3.autoType);
                for (const r of rows) {
                    const n = r['邻居细胞'];
                    if (!n) continue;
                    if (neighborSet.size > 0 && !neighborSet.has(n)) continue;
                    if (neighborSet.size === 0) neighborSet.add(n);
                    const { send: sendVal, recv: recvVal } = mapVals(r);
                    totalsSend[n] = (totalsSend[n] || 0) + sendVal;
                    totalsReceive[n] = (totalsReceive[n] || 0) + recvVal;
                }
            } catch (e) {
                console.warn('读取通信数据失败（忽略该 specificCell）:', totalCsv, e);
            }
        }

        // 细胞总数数据
        cellCountPositions.push({ index: i, label: desc.label, totalCells: totalCellCount });

        // 接收和发送数据
        const recvObj = { index: i, label: desc.label };
        const sendObj = { index: i, label: desc.label };
        for (const n of neighborSet) {
            recvObj[n] = totalsReceive[n] || 0;
            sendObj[n] = totalsSend[n] || 0;
        }
        receivePositions.push(recvObj);
        sendPositions.push(sendObj);
    }

    const keys = Array.from(neighborSet);
    // 排序依据：接收+发送总量降序
    const totalsByKey = new Map(keys.map(k => [k, (
        d3.sum(receivePositions, d => +d[k] || 0) + d3.sum(sendPositions, d => +d[k] || 0)
    )]));
    keys.sort((a, b) => (totalsByKey.get(b) || 0) - (totalsByKey.get(a) || 0));

    return { cellCountPositions, receivePositions, sendPositions, keys };
}

export class OverallCommChart {
    constructor(containerId, pathCellsOrDescriptors, neighborCells) {
        this.containerId = containerId;
        this.pathCellsOrDescriptors = pathCellsOrDescriptors;
        this.neighborCells = neighborCells || [];
        // 指标模式（与 LineageVis 选择同步）
        this.metricMode = (typeof window !== 'undefined' && (window.lineageMetricMode || window.__overallCommCurrentMode)) || '总强度';
        // 全局注册，供统一尺度时广播重绘（按模式隔离最大值）
        if (!window.__overallCommCharts) window.__overallCommCharts = [];
        if (!window.__overallCommGlobalMaxByMode) window.__overallCommGlobalMaxByMode = {};
        if (!window.__overallCommCurrentMode) window.__overallCommCurrentMode = this.metricMode;
        // 如存在旧版全局最大值，迁移到“总强度”模式下
        if (window.__overallCommGlobalMax && !window.__overallCommGlobalMaxByMode['总强度']) {
            window.__overallCommGlobalMaxByMode['总强度'] = Object.assign({ receive: 0, send: 0 }, window.__overallCommGlobalMax);
            try { delete window.__overallCommGlobalMax; } catch(_) {}
        }
        window.__overallCommCharts.push(this);
        // 记录最近一次 render 的点击回调，便于广播时复用
        this._onClick = null;
    this.margin = { top: 10, right: 10, bottom: 30, left: 40 };
    // 宽度改为在 render 时根据父容器自动计算；先设一个基准
    this.baseWidth = 500;
    this.width = null; // 延迟计算
    this.height = 250 - this.margin.top - this.margin.bottom;

        // 颜色映射：优先与既有类型色一致，回退到 Category10
        this.typeColorMap = {
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
        this.scheme = d3.schemeCategory10;

        // 只注册一次模式监听器
        if (!window.__overallCommModeListenerAttached) {
            document.addEventListener('lineageMetricModeChanged', (event) => {
                const mode = (event && event.detail && event.detail.mode) || window.lineageMetricMode || '总强度';
                window.__overallCommCurrentMode = mode;
                // 重置该模式下的全局最大值，避免跨模式串扰
                if (!window.__overallCommGlobalMaxByMode) window.__overallCommGlobalMaxByMode = {};
                window.__overallCommGlobalMaxByMode[mode] = { receive: 0, send: 0 };
                // 同步重置该模式的全局百分位范围
                if (!window.__overallCommGlobalRangeByMode) window.__overallCommGlobalRangeByMode = {};
                window.__overallCommGlobalRangeByMode[mode] = { low: Infinity, high: 0 };
                const list = Array.isArray(window.__overallCommCharts) ? window.__overallCommCharts : [];
                list.forEach(ch => { try { ch.setMetricMode(mode); ch.render(ch._onClick); } catch(_) {} });
            });
            window.__overallCommModeListenerAttached = true;
        }
    }

    setMetricMode(mode) {
        this.metricMode = mode || this.metricMode || '总强度';
    }

    async render(onClick) {
        this._onClick = onClick || this._onClick;
        const mode = this.metricMode || window.__overallCommCurrentMode || window.lineageMetricMode || '总强度';
        const { cellCountPositions, receivePositions, sendPositions, keys } = await computeThreeChartSeries(this.pathCellsOrDescriptors, this.neighborCells, mode);

        const container = d3.select(`#${this.containerId}`);
        container
            .style('position','relative')
            .style('overflow','hidden')
            .style('display', 'flex')
            .style('flex-direction', 'row')
            .style('gap', '8px');
        container.selectAll('*').remove();

        // 动态计算可用宽度
        const bboxParent = container.node().parentNode?.getBoundingClientRect?.() || { width: this.baseWidth };
        const bboxSelf = container.node().getBoundingClientRect();
        const fullWidth = (bboxSelf.width > 40 ? bboxSelf.width : (bboxParent.width > 40 ? bboxParent.width : this.baseWidth));
        // 每个图表容器宽度，减去边框、padding和间隙
        const containerWidth = (fullWidth - 24) / 3; // 3个容器，减去间隙和边距
        // SVG实际绘图宽度，减去左右边距
        this.width = containerWidth - this.margin.left - this.margin.right - 10; // 减去padding

        // 创建三个图表容器，横向排列
        const chartHeight = 120;
        
        // 1. 细胞总数图
        const cellCountContainer = container.append('div')
            .style('border', '1px solid #ddd')
            .style('border-radius', '4px')
            .style('padding', '4px')
            .style('flex', '1')
            .style('min-width', '0');
        
        cellCountContainer.append('div')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('margin-bottom', '4px')
            .style('text-align', 'center')
            .text('Cell Count');

        this.renderCellCountChart(cellCountContainer, cellCountPositions, chartHeight);

        // 2. 接收通信图
        const receiveContainer = container.append('div')
            .style('border', '1px solid #ddd')
            .style('border-radius', '4px')
            .style('padding', '4px')
            .style('flex', '1')
            .style('min-width', '0');
            
        receiveContainer.append('div')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('margin-bottom', '4px')
            .style('text-align', 'center')
            .text('Receive Communication');

        this.renderCommChart(receiveContainer, receivePositions, keys, chartHeight, 'receive');

        // 3. 发送通信图
        const sendContainer = container.append('div')
            .style('border', '1px solid #ddd')
            .style('border-radius', '4px')
            .style('padding', '4px')
            .style('flex', '1')
            .style('min-width', '0');
            
        sendContainer.append('div')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('margin-bottom', '4px')
            .style('text-align', 'center')
            .text('Send Communication');

        this.renderCommChart(sendContainer, sendPositions, keys, chartHeight, 'send');
    }

    renderCellCountChart(container, cellCountPositions, height) {
        const svg = container.append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('class', 'cell-count-svg')
            .attr('viewBox', `0 0 ${this.width + this.margin.left + this.margin.right} ${height}`);

        const g = svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        const x = d3.scaleLinear()
            .domain([0, Math.max(1, cellCountPositions.length - 1)])
            .range([0, this.width]);

        const maxCellCount = d3.max(cellCountPositions, d => d.totalCells) || 1;
        const y = d3.scaleLinear()
            .domain([0, maxCellCount])
            .range([height - this.margin.top - this.margin.bottom, 0]);

        // 绘制折线图
        const line = d3.line()
            .x(d => x(d.index))
            .y(d => y(d.totalCells))
            .curve(d3.curveMonotoneX);

        // 绘制折线
        g.append('path')
            .datum(cellCountPositions)
            .attr('fill', 'none')
            .attr('stroke', '#4CAF50')
            .attr('stroke-width', 2)
            .attr('d', line);

        // 绘制数据点
        g.selectAll('.cell-dot')
            .data(cellCountPositions)
            .enter()
            .append('circle')
            .attr('class', 'cell-dot')
            .attr('cx', d => x(d.index))
            .attr('cy', d => y(d.totalCells))
            .attr('r', 3)
            .attr('fill', '#4CAF50')
            .attr('stroke', 'white')
            .attr('stroke-width', 1);

        // 添加数值标签
        g.selectAll('.cell-label')
            .data(cellCountPositions)
            .enter()
            .append('text')
            .attr('class', 'cell-label')
            .attr('x', d => x(d.index))
            .attr('y', d => y(d.totalCells) - 8)
            .attr('text-anchor', 'middle')
            .attr('font-size', '9px')
            .attr('fill', '#333')
            .text(d => d.totalCells);

        // X轴
        const xAxis = d3.axisBottom(x)
            .tickValues(cellCountPositions.map(d => d.index))
            .tickFormat(i => {
                const idx = Math.round(i);
                return cellCountPositions[idx] ? cellCountPositions[idx].label : `${idx}`;
            });

        g.append('g')
            .attr('transform', `translate(0,${height - this.margin.top - this.margin.bottom})`)
            .call(xAxis)
            .selectAll('text')
            .style('font-size', '8px')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-45)');

        // Y轴
        const yAxis = d3.axisLeft(y).ticks(3);
        g.append('g')
            .call(yAxis)
            .selectAll('text')
            .style('font-size', '8px');
    }

    renderCommChart(container, positions, keys, height, type) {
        const svg = container.append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('class', `${type}-comm-svg`)
            .attr('viewBox', `0 0 ${this.width + this.margin.left + this.margin.right} ${height}`);

        const g = svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        const x = d3.scaleLinear()
            .domain([0, Math.max(1, positions.length - 1)])
            .range([0, this.width]);

        // 计算最大值
        const maxTotal = d3.max(positions, p => d3.sum(keys, k => +p[k] || 0)) || 1;
        const y = d3.scaleLinear()
            .domain([0, maxTotal])
            .range([height - this.margin.top - this.margin.bottom, 0]);

        // 生成堆叠数据
        const stack = d3.stack().keys(keys).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
        const series = stack(positions);

        // 面积生成器
        const area = d3.area()
            .x(d => x(d.data.index))
            .y0(d => y(d[0]))
            .y1(d => y(d[1]))
            .curve(d3.curveMonotoneX);

        // 颜色函数
        const colorFor = (key) => {
            const base = (key || '').split('_')[0];
            if (this.typeColorMap[base]) return this.typeColorMap[base];
            let hash = 0; const s = String(base);
            for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
            const idx = Math.abs(hash) % this.scheme.length;
            return this.scheme[idx];
        };

        // 绘制堆叠面积图
        g.selectAll('.stack-layer')
            .data(series)
            .enter()
            .append('path')
            .attr('class', 'stack-layer')
            .attr('d', area)
            .attr('fill', s => colorFor(s.key))
            .attr('fill-opacity', 0.8)
            .attr('stroke', 'white')
            .attr('stroke-width', 0.5);

        // X轴
        const xAxis = d3.axisBottom(x)
            .tickValues(positions.map(d => d.index))
            .tickFormat(i => {
                const idx = Math.round(i);
                return positions[idx] ? positions[idx].label : `${idx}`;
            });

        g.append('g')
            .attr('transform', `translate(0,${height - this.margin.top - this.margin.bottom})`)
            .call(xAxis)
            .selectAll('text')
            .style('font-size', '7px')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-45)');

        // 工具提示
        const tooltip = d3.select('body').select('.overall-stacked-tooltip');
        const tip = tooltip.empty() ? d3.select('body').append('div')
            .attr('class', 'overall-stacked-tooltip')
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('opacity', 0)
            .style('background', 'rgba(0,0,0,0.75)')
            .style('color', '#fff')
            .style('padding', '6px 8px')
            .style('border-radius', '4px')
            .style('font-size', '11px')
          : tooltip;

        // 悬浮交互
        g.selectAll('.stack-layer')
            .on('mousemove', (event, layer) => {
                const [mx] = d3.pointer(event, g.node());
                const i = Math.round(x.invert(mx));
                const idx = Math.max(0, Math.min(positions.length - 1, i));
                const d = positions[idx];
                const val = +d[layer.key] || 0;
                tip.style('opacity', 1)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 24) + 'px')
                    .html(`<strong>${layer.key}</strong><br/>${type === 'receive' ? 'Receive' : 'Send'}: ${val.toFixed(3)}`);
            })
            .on('mouseout', () => tip.style('opacity', 0));
    }

    _updateGlobalMaxIfNeeded(localReceiveMax, localSendMax, mode) {
        if (!window.__overallCommGlobalMaxByMode) window.__overallCommGlobalMaxByMode = {};
        const m = mode || window.__overallCommCurrentMode || '总强度';
        if (!window.__overallCommGlobalMaxByMode[m]) window.__overallCommGlobalMaxByMode[m] = { receive: 0, send: 0 };
        const g = window.__overallCommGlobalMaxByMode[m];
    // 统一标尺存储：仍分别维护，但下游取 max(receive, send)
    const newReceive = Math.max(g.receive || 0, localReceiveMax || 0);
    const newSend = Math.max(g.send || 0, localSendMax || 0);
    const changed = (newReceive !== (g.receive || 0)) || (newSend !== (g.send || 0));
    if (changed) { g.receive = newReceive; g.send = newSend; }
        return changed;
    }

    _updateGlobalRangeIfNeeded(localLow, localHigh, mode) {
        if (!window.__overallCommGlobalRangeByMode) window.__overallCommGlobalRangeByMode = {};
        const m = mode || window.__overallCommCurrentMode || '总强度';
        const g = window.__overallCommGlobalRangeByMode[m] || { low: Infinity, high: 0 };
        const newLow = Math.min(g.low, localLow);
        const newHigh = Math.max(g.high, localHigh);
        const changed = (newLow !== g.low) || (newHigh !== g.high);
        if (changed) window.__overallCommGlobalRangeByMode[m] = { low: newLow, high: newHigh };
        return changed;
    }

    _broadcastGlobalRescale() {
        const list = Array.isArray(window.__overallCommCharts) ? window.__overallCommCharts : [];
        // 触发所有实例按新的全局尺度重绘；避免自触发死循环，因为更新后不再增加全局最大值
        list.forEach(ch => {
            try { ch.render(ch._onClick); } catch (e) { /* noop */ }
        });
    }
}
