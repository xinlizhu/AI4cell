
// 计算上下两层堆叠面积图数据：上=接收(receive)，下=发送(send)
async function computeStackedSeries(pathCellsOrDescriptors, neighborCells) {
    const descriptors = pathCellsOrDescriptors.map(item => (
        typeof item === 'string' ? { label: item, specificCells: [item] } : item
    ));

    const neighborSet = new Set(Array.isArray(neighborCells) ? neighborCells : []);
    const receivePositions = []; // 每个位置：{ index, label, neighborA: recvVal, ... }
    const sendPositions = [];    // 每个位置：{ index, label, neighborA: sendVal, ... }

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
                    const sendVal = (+r['发送总强度'] || 0);
                    const recvVal = (+r['接收总强度'] || 0);
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
    }

    async render(onClick) {
        const { receivePositions, sendPositions, keys, maxReceiveTotal, maxSendTotal } = await computeStackedSeries(this.pathCellsOrDescriptors, this.neighborCells);

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
        // y 轴：中心 0，上正下负
        const y = d3.scaleLinear()
            .domain([-maxSendTotal, maxReceiveTotal])
            .range([this.height, 0]);
    const centerY = y(0);
    const gapPx = 4; // 中轴到上下区域各留 2 像素空隙
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
            .y0(d => y(d[0]) - gapPx)
            .y1(d => y(d[1]) - gapPx)
            .curve(d3.curveMonotoneX);
        // 面积生成器（下）
        const areaSend = d3.area()
            .x(d => x(d.data.index))
            .y0(d => y(d[0]) + gapPx)
            .y1(d => y(d[1]) + gapPx)
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
            .y(d => y(d.total) - gapPx)
            .curve(d3.curveMonotoneX);
        const lineSend = d3.line()
            .x(d => x(d.index))
            .y(d => y(-d.total) + gapPx)
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
                    const val = isReceive ? (+dRecv[layer.key] || 0) : (+dSend[layer.key] || 0);
                    tip.style('opacity', 1)
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY - 24) + 'px')
                        .html(`<strong>${layer.key}</strong><br/>${isReceive?'接收':'发送'}强度: ${val.toFixed(3)}`);
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
                        .html(`<strong>${isReceive?'总接收':'总发送'}强度</strong><br/>值: ${val.toFixed(3)}`);
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
    }
}
