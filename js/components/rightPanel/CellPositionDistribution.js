import { AreaChart } from '../pathSelection/AreaChart.js';

export class CellPositionDistribution {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.init();
        this.registerEventListeners();
    }

    init() {
        this.container.html('')
            .style('height','290px'); // 固定宽度 300
        this.container.append('div')
            .attr('class', 'panel-header')
            .style('font-weight', 'bold')
            .style('margin-bottom', '10px')
            ;

        // 详细区域：横向滚动，内含多个 AreaChart
        this.detailsScroll = this.container.append('div')
            .attr('class', 'neighbor-details-scroll')
            .style('overflow-x', 'auto')
            .style('overflow-y', 'hidden')
            .style('border', '1px solid #ddd')
            .style('border-radius', '6px')
            .style('padding', '10px');

        this.detailsRow = this.detailsScroll.append('div')
            .style('display', 'flex')
            .style('gap', '10px')
            .style('width', 'max-content');

        this.showHint();
    }

    registerEventListeners() {
        // 接收来自总体图的请求，显示右侧详细曲线
        document.addEventListener('showNeighborDetails', (e) => {
            const { pathCells, neighborCells } = e.detail;
            this.renderNeighborCharts(pathCells, neighborCells);
        });
    }

    showHint() {
        this.detailsRow.html('');
        this.detailsRow.append('div')
            .style('color', '#666')
            .style('padding', '8px')
            .style('font-style', 'italic')
            .text('点击总体通讯强度图，查看各邻居的详细趋势');
    }

    async renderNeighborCharts(pathCells, neighborCells) {
        this.detailsRow.html('');
        if (!neighborCells || neighborCells.length === 0) {
            this.showHint();
            return;
        }

        // 为每个邻居创建一个 AreaChart
        neighborCells.forEach((neighborType, idx) => {
            const wrap = this.detailsRow.append('div')
                .attr('class', 'neighbor-area-wrapper')
                .style('border', '1px solid #e0e0e0')
                .style('border-radius', '6px')
                .style('padding', '5px')
                .style('background', '#fafafa')
                .style('width', '200px')
                .style('height', '200px')
                .style('flex-shrink', '0');

            const id = `neighbor-detail-${Date.now()}-${idx}`;
            wrap.append('div').attr('id', id);

            // 复用已有 AreaChart 逻辑（支持 pathCells 为描述对象）
            new AreaChart(id, neighborType, pathCells, false);
        });
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new CellPositionDistribution('#cellPositionContainer');
});