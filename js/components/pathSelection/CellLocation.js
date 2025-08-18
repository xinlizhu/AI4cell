export class CellLocation {
    constructor(options = {}) {
        this.annotationPath = options.annotationPath || './js/components/KJ/cell_annotation_all.csv';
        this.embeddingPath = options.embeddingPath || './js/components/KJ/cell_embedding_info.csv';
        this.embeddingLevel = options.embeddingLevel || 4;
        this.cache = {
            loaded: false,
            merged: [],
            byLevel: new Map()
        };
        this.colors = options.colors || {
            'Heart': '#d4b365', 'Neural crest': '#5B9BD5', 'Branchial arch': '#70AD47',
            'AGM': '#00B050', 'Liver': '#FF6D01', 'Cavity': '#404040',
            'Blood vessel': '#E1819E', 'Brain': '#8B4513', 'Connective tissue': '#9966CC',
            'Dermomyotome': '#FF69B4', 'Head mesenchyme': '#20B2AA', 'Lung primordium': '#FF4500',
            'Mesenchyme': '#DAA520', 'Notochord': '#4682B4', 'Sclerotome': '#32CD32',
            'Spinal cord': '#8A2BE2', 'Surface ectoderm': '#FF1493', 'Urogenital ridge': '#00CED1'
        };
    }

    async load() {
        if (this.cache.loaded) return;
        const [annotation, embedding] = await Promise.all([
            d3.csv(this.annotationPath, d3.autoType),
            d3.csv(this.embeddingPath, d3.autoType)
        ]);
        const annoByIndex = new Map(annotation.map(d => [d.cell_index, d]));
        const merged = [];
        for (const e of embedding) {
            const a = annoByIndex.get(e.cell_index) || {};
            const timeInt = a.time != null ? parseInt(a.time) : null;
            const yAbs = a.y != null ? Math.abs(+a.y) : null;
            const ann = a.annotation;
            const embIdx = e.embedding_index;
            const annoTimeEmb = (ann != null && timeInt != null && embIdx != null)
                ? `${ann}_${timeInt}_${embIdx}`
                : null;
            merged.push({
                cell_index: e.cell_index,
                embedding_level: e.embedding_level,
                embedding_index: e.embedding_index,
                annotation: ann,
                x: a.x,
                y: yAbs,
                time: timeInt,
                annotation_time_embedding: annoTimeEmb
            });
        }
        this.cache.merged = merged;
        this.cache.loaded = true;
    }

    getLevelData(level) {
        const lvl = level ?? this.embeddingLevel;
        if (this.cache.byLevel.has(lvl)) return this.cache.byLevel.get(lvl);
        const data = this.cache.merged.filter(d => d.embedding_level === lvl && d.x != null && d.y != null);
        this.cache.byLevel.set(lvl, data);
        return data;
    }

    /**
     * 渲染中心位置散点图
     * @param {d3.Selection} groupSel 需要渲染到的分组（已处于中心并带有裁剪）
     * @param {string[]} specificNames 具体细胞名数组，如 ["Liver_1_118", "Liver_1_122"]
     * @param {{size?:number, embeddingLevel?:number, baseType?:string}} opts 
     */
    async renderInto(groupSel, specificNames, opts = {}) {
        try {
            await this.load();
            const level = opts.embeddingLevel ?? this.embeddingLevel;
            const levelData = this.getLevelData(level);
            const size = opts.size ?? 80;
            const baseType = opts.baseType; // 可用于统一颜色

            // 目标集合
            const targetSet = new Set((specificNames || []).filter(Boolean));

            const otherCells = levelData.filter(d => !targetSet.has(d.annotation_time_embedding));
            const targetCells = levelData.filter(d => targetSet.has(d.annotation_time_embedding));

            // 比例尺（填满 size x size）
            const xExtent = d3.extent(levelData, d => d.x);
            const yExtent = d3.extent(levelData, d => d.y);
            const xScale = d3.scaleLinear().domain(xExtent).range([-size/2, size/2]);
            const yScale = d3.scaleLinear().domain(yExtent).range([size/2, -size/2]);

            // 容器
            const g = groupSel.append('g')
                .attr('class', 'cell-location-mini')
                .attr('opacity', 0);

            // 其他细胞（灰色、较小、透明）
            g.selectAll('.other-cell')
                .data(otherCells)
                .enter()
                .append('circle')
                .attr('class', 'other-cell')
                .attr('cx', d => xScale(d.x))
                .attr('cy', d => yScale(d.y))
                .attr('r', 0.8)
                .attr('fill', 'gray')
                .attr('fill-opacity', 0.4)
                .attr('stroke', 'none');

            // 目标细胞（按类型上色）
            g.selectAll('.target-cell')
                .data(targetCells)
                .enter()
                .append('circle')
                .attr('class', 'target-cell')
                .attr('cx', d => xScale(d.x))
                .attr('cy', d => yScale(d.y))
                .attr('r', 1.4)
                .attr('fill', d => {
                    const key = baseType || (d.annotation ? d.annotation.split('_')[0] : null);
                    return this.colors[key] || 'steelblue';
                })
                .attr('fill-opacity', 0.85)
                .attr('stroke', 'none');

            // 淡入
            g.transition().duration(200).attr('opacity', 1);
        } catch (err) {
            console.warn('CellLocation render failed:', err);
            // 降级：显示占位文本
            groupSel.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.3em')
                .text('无图片')
                .style('font-size', '10px')
                .style('fill', '#999');
        }
    }

    /**
     * 在已有中心图上覆盖高亮某个邻居类型（按 annotation 基类型匹配）。
     * @param {d3.Selection} groupSel 与 renderInto 使用的相同中心分组（含裁剪）。
     * @param {string|null} neighborType 邻居类型名，如 'Heart'；为 null 时清除高亮。
     * @param {{embeddingLevel?:number,size?:number}} opts 可选。
     */
    async setNeighborHighlight(groupSel, neighborType, opts = {}) {
        try {
            await this.load();
            // 先移除旧的覆盖层
            groupSel.selectAll('.neighbor-highlight-layer').remove();
            if (!neighborType) return;

            const level = opts.embeddingLevel ?? this.embeddingLevel;
            const levelData = this.getLevelData(level);
            const size = opts.size ?? 80;

            const data = levelData.filter(d => (d.annotation || '').split('_')[0] === neighborType);
            if (data.length === 0) return;

            const xExtent = d3.extent(levelData, d => d.x);
            const yExtent = d3.extent(levelData, d => d.y);
            const xScale = d3.scaleLinear().domain(xExtent).range([-size/2, size/2]);
            const yScale = d3.scaleLinear().domain(yExtent).range([size/2, -size/2]);

            const layer = groupSel.append('g')
                .attr('class', 'neighbor-highlight-layer')
                .attr('opacity', 0);

            layer.selectAll('circle')
                .data(data)
                .enter()
                .append('circle')
                .attr('cx', d => xScale(d.x))
                .attr('cy', d => yScale(d.y))
                .attr('r', 1.2)
                .attr('fill', this.colors[neighborType] || 'crimson')
                .attr('fill-opacity', 0.9)
                .attr('stroke', 'none');

            layer.transition().duration(120).attr('opacity', 1);
        } catch (err) {
            // 忽略高亮失败
        }
    }

    clearNeighborHighlight(groupSel) {
        groupSel.selectAll('.neighbor-highlight-layer').remove();
    }
}
