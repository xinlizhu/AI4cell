import { OverallCommChart } from '../pathSelection/OverallCommChart.js';

// 右侧邻居详情面板控制器
class NeighborDetailsPanel {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.list = null; // 存放多个 OverallCommChart
        this.chartCount = 0;
        this.init();
    }

    init() {
        this.container.selectAll('*').remove();
        this.container
            .style('display','flex')
            .style('flex-direction','column')
            .style('gap','8px')
            // 更新为固定高度 1000px
            .style('min-height','1020px')
            .style('max-height','1020px')
            .style('height','1020px');

        this.container.append('h4')
            .style('margin','0')
            .style('font-size','14px')
            .text('Neighbor Overall Communication');

        this.list = this.container.append('div')
            .attr('class','neighbor-chart-list')
            .style('display','flex')
            .style('flex-direction','column')
            .style('gap','12px')
            // 让列表填充剩余空间并内部滚动
            .style('flex','1 1 auto')
            // 使用 scroll 而不是 auto 以便始终预留滚动条空间（避免内容被压缩挤成一团）
            .style('overflow-y','scroll');

        // 空状态占位
        this.emptyState = this.list.append('div')
            .attr('class','neighbor-empty')
            .style('flex','1 1 auto')
            .style('display','flex')
            .style('align-items','center')
            .style('justify-content','center')
            .style('color','#999')
            .style('font-size','12px')
            .text('暂无数据');

        // Event listener: each event appends a new chart block
        document.addEventListener('showNeighborDetails', (e)=>{
            const { pathCells, neighborCells } = e.detail || {};
            if (!Array.isArray(pathCells) || pathCells.length===0) return;
            this.appendChart(pathCells, neighborCells || []);
        });
    }

    summarizePath(descriptors) {
        // descriptors: [{label, specificCells}]
        return descriptors.map(d => d.label).join(' -> ');
    }

    appendChart(descriptors, neighborCells) {
        this.chartCount += 1;
    if (this.emptyState) { this.emptyState.remove(); this.emptyState = null; }
        const wrap = this.list.append('div')
            .attr('class','neighbor-chart-wrapper')
            .style('position','relative')
            .style('border','1px solid #ddd')
            .style('border-radius','8px')
            .style('padding','10px')
            .style('background','#fafafa')
            .style('overflow','hidden') // 裁剪内部图表溢出
            // 防止被父 flex 容器压缩导致“挤成一团”
            .style('flex','0 0 auto')
            // 设一个最小高度，保证图表可读
            .style('min-height','110px');

        // Delete button
        wrap.append('button')
            .attr('class','neighbor-chart-remove')
            .text('删除')
            .style('position','absolute')
            .style('top','6px')
            .style('right','6px')
            .style('background','#ff5555')
            .style('color','#fff')
            .style('border','none')
            .style('padding','4px 8px')
            .style('border-radius','4px')
            .style('cursor','pointer')
            .style('font-size','12px')
            .on('click', () => wrap.remove());

        // Title
        wrap.append('div')
            .attr('class','neighbor-chart-title')
            .style('font-weight','600')
            .style('margin-bottom','6px')
            .style('font-size','13px')
            .text(`(${this.chartCount}) ${this.summarizePath(descriptors)}`);

        const chartId = `neighbor-overall-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
    wrap.append('div').attr('id', chartId).style('width','100%');
        const chart = new OverallCommChart(chartId, descriptors, neighborCells);
        chart.render(()=>{});
    }
}

// 初始化
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', ()=>{
        new NeighborDetailsPanel('#neighborDetailsContainer');
    });
}
