
// 计算堆叠面积图数据：每个位置上，按邻居类型分解 (value = 发送总强度 + 接收总强度)
async function computeStackedSeries(pathCellsOrDescriptors, neighborCells) {
    // 统一为 {label, specificCells[]} 结构
    const descriptors = pathCellsOrDescriptors.map(item => (
        typeof item === 'string' ? { label: item, specificCells: [item] } : item
    ));

    // 邻居集合：优先使用传入的列表，否则在扫描数据时动态汇总
    const neighborSet = new Set(Array.isArray(neighborCells) ? neighborCells : []);
    const positions = [];

    for (let i = 0; i < descriptors.length; i++) {
        const desc = descriptors[i];
        const totals = {}; // { neighbor: value }

        for (const sc of desc.specificCells) {
            const totalCsv = `./js/components/pathSelection/Every_cell_info_withKJ/${sc}/${sc}_total.csv`;
            try {
                const rows = await d3.csv(totalCsv, d3.autoType);
                for (const r of rows) {
                    const n = r['邻居细胞'];
                    if (!n) continue;
                    if (neighborSet.size > 0 && !neighborSet.has(n)) continue; // 传入列表则过滤
                    if (neighborSet.size === 0) neighborSet.add(n); // 动态收集
                    const val = (+r['发送总强度'] || 0) + (+r['接收总强度'] || 0);
                    totals[n] = (totals[n] || 0) + val;
                }
            } catch (e) {
                console.warn('读取失败（忽略该 specificCell）:', totalCsv, e);
            }
        }

        // 保证所有邻居键存在（缺省为 0）
        const posObj = { index: i, label: desc.label };
        for (const n of neighborSet) posObj[n] = totals[n] || 0;
        positions.push(posObj);
    }

    // 将键按总量降序排序，便于更稳定的层叠展示
    const keys = Array.from(neighborSet);
    const totalsByKey = new Map(keys.map(k => [k, d3.sum(positions, d => +d[k] || 0)]));
    keys.sort((a, b) => (totalsByKey.get(b) || 0) - (totalsByKey.get(a) || 0));

    return { positions, keys };
}

export class OverallCommChart {
    constructor(containerId, pathCellsOrDescriptors, neighborCells) {
        this.containerId = containerId;
        this.pathCellsOrDescriptors = pathCellsOrDescriptors;
        this.neighborCells = neighborCells || [];
        this.margin = { top: 10, right: 10, bottom: 30, left: 40 };
        this.width = 500 - this.margin.left - this.margin.right;
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
        const { positions: data, keys } = await computeStackedSeries(this.pathCellsOrDescriptors, this.neighborCells);

        const container = d3.select(`#${this.containerId}`);
        container.selectAll('*').remove();

        const svg = container.append('svg')
            .attr('width', this.width + this.margin.left + this.margin.right)
            .attr('height', this.height + this.margin.top + this.margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        const x = d3.scaleLinear()
            .domain([0, Math.max(1, data.length - 1)])
            .range([0, this.width]);

        // y 轴：堆叠后最大总量
        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d3.sum(keys, k => +d[k] || 0)) || 1])
            .range([this.height, 0]);

        // 生成堆叠层
        const stack = d3.stack()
            .keys(keys)
            .order(d3.stackOrderNone)
            .offset(d3.stackOffsetNone);
        const series = stack(data);

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
            // 稳定哈希回退
            let hash = 0; const s = String(base);
            for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
            const idx = Math.abs(hash) % this.scheme.length;
            return this.scheme[idx];
        };

        // 绘制各层
        g.selectAll('.stack-layer')
            .data(series)
            .enter()
            .append('path')
            .attr('class', 'stack-layer')
            .attr('d', area)
            .attr('fill', s => colorFor(s.key))
            .attr('fill-opacity', 0.9)
            .attr('stroke', 'white')
            .attr('stroke-width', 1);

        const xAxis = d3.axisBottom(x)
            .tickValues(data.map(d => d.index))
            .tickFormat(i => {
                const idx = Math.round(i);
                return data[idx] ? data[idx].label : `${idx}`;
            });

        g.append('g')
            .attr('transform', `translate(0,${this.height})`)
            .call(xAxis)
            .selectAll('text')
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

        // 悬浮交互（逐层）
        g.selectAll('.stack-layer')
            .on('mousemove', (event, layer) => {
                const [mx] = d3.pointer(event, g.node());
                const i = Math.round(x.invert(mx));
                const d = data[Math.max(0, Math.min(data.length - 1, i))];
                const val = +d[layer.key] || 0;
                tip.style('opacity', 1)
                   .style('left', (event.pageX + 10) + 'px')
                   .style('top', (event.pageY - 24) + 'px')
                   .html(`<strong>${layer.key}</strong><br/>总强度: ${val.toFixed(3)}`);
            })
            .on('mouseout', () => tip.style('opacity', 0));

        // 交互：点击整体图，触发回调在右侧展示详细（保持原行为）
        if (typeof onClick === 'function') {
            svg.style('cursor', 'pointer')
               .on('click', () => onClick());
        }
    }
}
