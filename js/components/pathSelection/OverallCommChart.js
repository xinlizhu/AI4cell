
// 计算上下两层堆叠面积图数据：上=接收(receive)，下=发送(send)
// metricMode 与 LineageVis 的下拉框保持一致
async function computeStackedSeries(pathCellsOrDescriptors, neighborCells, metricMode) {
    const descriptors = pathCellsOrDescriptors.map(item => (
        typeof item === 'string' ? { label: item, specificCells: [item] } : item
    ));

    const neighborSet = new Set(Array.isArray(neighborCells) ? neighborCells : []);
    const receivePositions = []; // 每个位置：{ index, label, neighborA: recvVal, ... }
    const sendPositions = [];    // 每个位置：{ index, label, neighborA: sendVal, ... }

    const mode = metricMode || (typeof window !== 'undefined' && (window.lineageMetricMode || window.__overallCommCurrentMode)) || '总强度';
    const mapVals = (row) => {
        switch (mode) {
            case '通道数':
                return { send: (+row['发送通道数'] || 0), recv: (+row['接收通道数'] || 0) };
            case '平均通道数':
                return { send: (+row['平均发送通道数'] || 0), recv: (+row['平均接收通道数'] || 0) };
            case '平均通道强度':
                return { send: (+row['发送平均强度'] || 0), recv: (+row['接收平均强度'] || 0) };
            case '细胞接收强度': // 使用细胞层面平均强度（发送/接收）
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

    for (const sc of desc.specificCells) {
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
                console.warn('读取失败（忽略该 specificCell）:', totalCsv, e);
            }
        }

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

    // 计算总体最大值用于 y 轴对称范围
    const maxReceivePerPos = receivePositions.map(p => d3.sum(keys, k => +p[k] || 0));
    const maxSendPerPos = sendPositions.map(p => d3.sum(keys, k => +p[k] || 0));
    const maxReceiveTotal = d3.max(maxReceivePerPos) || 1;
    const maxSendTotal = d3.max(maxSendPerPos) || 1;

    return { receivePositions, sendPositions, keys, maxReceiveTotal, maxSendTotal };
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
            'Heart': '#d4b365', 'Neural crest': '#5B9BD5', 'Branchial arch': '#70AD47',
            'AGM': '#00B050', 'Liver': '#FF6D01', 'Cavity': '#404040',
            'Blood vessel': '#E1819E', 'Brain': '#8B4513', 'Connective tissue': '#9966CC',
            'Dermomyotome': '#FF69B4', 'Head mesenchyme': '#20B2AA', 'Lung primordium': '#FF4500',
            'Mesenchyme': '#DAA520', 'Notochord': '#4682B4', 'Sclerotome': '#32CD32',
            'Spinal cord': '#8A2BE2', 'Surface ectoderm': '#FF1493', 'Urogenital ridge': '#00CED1'
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
        const { receivePositions, sendPositions, keys, maxReceiveTotal, maxSendTotal } = await computeStackedSeries(this.pathCellsOrDescriptors, this.neighborCells, mode);

        const container = d3.select(`#${this.containerId}`);
        container
            .style('position','relative')
            .style('overflow','hidden'); // 避免 SVG 内容（旋转文字、描边）溢出
        container.selectAll('*').remove();

        // 动态计算可用宽度（含 padding），不足时使用基准宽度
        const bboxParent = container.node().parentNode?.getBoundingClientRect?.() || { width: this.baseWidth };
        const bboxSelf = container.node().getBoundingClientRect();
        const fullWidth = (bboxSelf.width > 40 ? bboxSelf.width : (bboxParent.width > 40 ? bboxParent.width : this.baseWidth));
        this.width = fullWidth - this.margin.left - this.margin.right;

        const svg = container.append('svg')
            .attr('width', this.width + this.margin.left + this.margin.right)
            .attr('height', this.height + this.margin.top + this.margin.bottom)
            .attr('class','overall-comm-svg');

        const g = svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        const x = d3.scaleLinear()
            .domain([0, Math.max(1, receivePositions.length - 1)])
            .range([0, this.width]);
    // y 轴：中心 0，上正下负；统一标尺 + P5–P99 百分位截断 + gamma 映射
    const gByMode = window.__overallCommGlobalMaxByMode || {};
    const gMax = gByMode[mode] || { receive: 0, send: 0 };
        // 先基于当前实例的总量计算稳健范围
        const allTotalsAbs = [];
        receivePositions.forEach((p,i)=>{ allTotalsAbs.push(Math.abs(d3.sum(keys, k => +p[k] || 0))); });
        sendPositions.forEach((p,i)=>{ allTotalsAbs.push(Math.abs(d3.sum(keys, k => +p[k] || 0))); });
        const sorted = allTotalsAbs.slice().sort((a,b)=>a-b);
        const q = (arr, t) => (arr.length ? d3.quantileSorted(arr, t) || 0 : 0);
        let localLow = q(sorted, 0.05);
        let localHigh = q(sorted, 0.99);
        if (!(localHigh > localLow)) { localLow = 0; localHigh = Math.max(1, d3.max(sorted) || 1); }

        // 读取/更新全局范围（按模式），用于实例间统一
        if (!window.__overallCommGlobalRangeByMode) window.__overallCommGlobalRangeByMode = {};
        const grStore = window.__overallCommGlobalRangeByMode;
        const prevRange = grStore[mode] || { low: Infinity, high: 0 };
        const newLow = Math.min(prevRange.low, localLow);
        const newHigh = Math.max(prevRange.high, localHigh);
        // 暂不写回，等绘制结束后统一调用 _updateGlobalRangeIfNeeded 再决定是否广播
        const usedLow = isFinite(prevRange.low) ? prevRange.low : localLow;
        const usedHigh = (prevRange.high && prevRange.high > 0) ? prevRange.high : localHigh;

        const eps = 1e-9;
        const rng = Math.max(usedHigh - usedLow, eps);
        const gamma = 1; // 拉大上界、压小下界
        const T = (v) => {
            const s = v >= 0 ? 1 : -1;
            const a = Math.abs(v || 0);
            let z = (a - usedLow) / rng; // P5–P99 范围归一化
            if (!isFinite(z)) z = 0;
            z = Math.max(0, Math.min(1, z));
            const zg = Math.pow(z, gamma);
            return s * zg;
        };
        const y = d3.scaleLinear()
            .domain([-1, 1])
            .range([this.height, 0]);
    const centerY = y(0);
    const gapPx = 1; // 中轴到上下区域各留 2 像素空隙
        // 生成堆叠层（接收 & 发送）
        const stack = d3.stack().keys(keys).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
        const receiveSeries = stack(receivePositions);
        const sendSeriesRaw = stack(sendPositions);
        // 将发送部分转换为负值区间
        const sendSeries = sendSeriesRaw.map(layer => {
            const negLayer = layer.map(seg => {
                const arr = [ -seg[1], -seg[0] ]; // 负值区间
                // 保留原来的 data 引用供 area 访问 d.data.index
                arr.data = seg.data;
                return arr;
            });
            negLayer.key = layer.key;
            return negLayer;
        });
        // 面积生成器（上）
    const areaReceive = d3.area()
            .x(d => x(d.data.index))
            .y0(d => y(T(d[0])) - gapPx)
            .y1(d => y(T(d[1])) - gapPx)
            .curve(d3.curveMonotoneX);
        // 面积生成器（下）
    const areaSend = d3.area()
            .x(d => x(d.data.index))
            .y0(d => y(T(d[0])) + gapPx)
            .y1(d => y(T(d[1])) + gapPx)
            .curve(d3.curveMonotoneX);

        // 颜色函数
        const colorFor = (key) => {
            const base = (key || '').split('_')[0];
            if (this.typeColorMap[base]) return this.typeColorMap[base];
            // 稳定哈希回退
            let hash = 0; const s = String(base);
            for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
            const idx = Math.abs(hash) % this.scheme.length;
            return this.scheme[idx];
        };

        // 绘制接收层（上半）
        g.selectAll('.stack-layer-receive')
            .data(receiveSeries)
            .enter()
            .append('path')
            .attr('class', 'stack-layer-receive')
            .attr('d', areaReceive)
            .attr('fill', s => colorFor(s.key))
            .attr('fill-opacity', 0.95)
            .attr('stroke', 'white')
            .attr('stroke-width', 1);
        // 绘制发送层（下半）
        g.selectAll('.stack-layer-send')
            .data(sendSeries)
            .enter()
            .append('path')
            .attr('class', 'stack-layer-send')
            .attr('d', areaSend)
            .attr('fill', s => colorFor(s.key))
            .attr('fill-opacity', 0.55)
            .attr('stroke', 'white')
            .attr('stroke-width', 1);

        // 计算总接收/总发送用于叠加折线
        const receiveTotals = receivePositions.map(p => ({ index: p.index, total: d3.sum(keys, k => +p[k] || 0) }));
        const sendTotals = sendPositions.map(p => ({ index: p.index, total: d3.sum(keys, k => +p[k] || 0) }));

    const lineReceive = d3.line()
            .x(d => x(d.index))
            .y(d => y(T(d.total)) - gapPx)
            .curve(d3.curveMonotoneX);
    const lineSend = d3.line()
            .x(d => x(d.index))
            .y(d => y(T(-d.total)) + gapPx)
            .curve(d3.curveMonotoneX);

        g.append('path')
            .attr('class','total-line receive')
            .attr('d', lineReceive(receiveTotals))
            .attr('fill','none')
            .attr('stroke','#222')
            .attr('stroke-width',1.5);
        g.append('path')
            .attr('class','total-line send')
            .attr('d', lineSend(sendTotals))
            .attr('fill','none')
            .attr('stroke','#222')
            .attr('stroke-width',1.5)
            .attr('stroke-dasharray','4,3');

        const xAxis = d3.axisBottom(x)
            .tickValues(receivePositions.map(d => d.index))
            .tickFormat(i => {
                const idx = Math.round(i);
                return receivePositions[idx] ? receivePositions[idx].label : `${idx}`;
            });

        const xAxisG = g.append('g')
            .attr('transform', `translate(0,${centerY})`)
            .call(xAxis);
        xAxisG.select('.domain')
            .attr('stroke', '#555')
            .attr('stroke-width', 1); // 实线
        xAxisG.selectAll('text')
            .style('font-size', '10px')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-30)');

        // 简单工具提示：显示层名与该位置值
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

        // 悬浮交互：区分上下
        const bindHover = (selector, isReceive) => {
            g.selectAll(selector)
                .on('mousemove', (event, layer) => {
                    const [mx] = d3.pointer(event, g.node());
                    const i = Math.round(x.invert(mx));
                    const idx = Math.max(0, Math.min(receivePositions.length - 1, i));
                    const dRecv = receivePositions[idx];
                    const dSend = sendPositions[idx];
                    const raw = isReceive ? (+dRecv[layer.key] || 0) : (+dSend[layer.key] || 0);
                    const val = raw;
                    tip.style('opacity', 1)
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY - 24) + 'px')
                        .html(`<strong>${layer.key}</strong><br/>${isReceive?'接收':'发送'}: ${val.toFixed(3)}`);
                })
                .on('mouseout', () => tip.style('opacity', 0));
        };
        bindHover('.stack-layer-receive', true);
        bindHover('.stack-layer-send', false);

        // 总量折线悬浮提示
        const bindTotalHover = (selector, isReceive) => {
            g.selectAll(selector)
                .on('mousemove', (event) => {
                    const [mx] = d3.pointer(event, g.node());
                    const i = Math.round(x.invert(mx));
                    const idx = Math.max(0, Math.min(receivePositions.length - 1, i));
                    const val = isReceive ? receiveTotals[idx].total : sendTotals[idx].total;
                    tip.style('opacity', 1)
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY - 24) + 'px')
                        .html(`<strong>${isReceive?'总接收':'总发送'}</strong><br/>值: ${val.toFixed(3)}`);
                })
                .on('mouseout', () => tip.style('opacity', 0));
        };
        bindTotalHover('.total-line.receive', true);
        bindTotalHover('.total-line.send', false);

        // 交互：点击整体图，触发回调在右侧展示详细（保持原行为）
        if (typeof onClick === 'function') {
            svg.style('cursor', 'pointer')
               .on('click', () => onClick());
        }

        // 渲染结束后，尝试更新全局最大值并广播需要时的统一重绘
    const changedMax = this._updateGlobalMaxIfNeeded(maxReceiveTotal, maxSendTotal, mode);
        const changedRange = this._updateGlobalRangeIfNeeded(localLow, localHigh, mode);
        if (changedMax || changedRange) this._broadcastGlobalRescale();
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
