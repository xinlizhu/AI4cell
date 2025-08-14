
 (async () => {
    const raw = await d3.csv('./Brain_1_33/Brain_1_33.csv', d3.autoType);
    const center = raw.find(d => d.cell_type === 'Brain_1_33');
    if (!center) { alert('CSV 中未找到 Brain_1_33！'); return; }
    const neighbors = raw.filter(d => d !== center);

    /* ---------- 1. 获取坐标范围 ---------- */
    const xs = raw.map(d => d.x);
    const ys = raw.map(d => d.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);

    /* ---------- 2. 计算等比缩放因子 ---------- */
    const span = Math.max(xMax - xMin, yMax - yMin);
    const scale = span === 0 ? 1 : 40 / span;   // 60 是画布边长

    /* ---------- 3. 平移 + 缩放函数 ---------- */
    const tx = d => 35 + (d.x - (xMin + xMax) / 2) * scale;
    const ty = d => 35 + (d.y - (yMin + yMax) / 2) * scale;

    /* ---------- 4. 其余比例尺 ---------- */
    const rScale = d3.scaleSqrt()
                     .domain(d3.extent(raw, d => d.cell_num))
                     .range([1, 4]);
    const color = d3.scaleOrdinal(d3.schemeCategory10)
                    .domain(raw.map(d => d.cell_type));

    const svg = d3.select('#canvas');

    // 外框圆
    svg.append('circle')
       .attr('cx', 35).attr('cy', 35)
       .attr('r', 35)
       .attr('fill', 'none')
       .attr('stroke', '#333');

    // 连线
    svg.selectAll('.link')
       .data(neighbors)
       .join('line')
       .attr('x1', tx(center))
       .attr('y1', ty(center))
       .attr('x2', d => tx(d))
       .attr('y2', d => ty(d))
       .attr('stroke', '#555')
       .attr('stroke-width', 1)
       .attr('stroke-dasharray', '2,2');

    // 节点
    svg.selectAll('.dot')
       .data(raw)
       .join('circle')
       .attr('cx', d => tx(d))
       .attr('cy', d => ty(d))
       .attr('r', d => rScale(d.cell_num))
       .attr('fill', d => color(d.cell_type))
       .attr('stroke', '#fff')
       .attr('stroke-width', .5);
  })();