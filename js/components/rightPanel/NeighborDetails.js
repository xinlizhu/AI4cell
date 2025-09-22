import { OverallCommChart } from '../pathSelection/OverallCommChart.js';

class NeighborDetailsPanel {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.list = null;
        this.chartCount = 0;
        this.init();
    }

    init() {
        this.container.selectAll('*').remove();
        this.container
            .style('display','flex')
            .style('flex-direction','column')
            .style('gap','8px')
            .style('min-height','350px')
            .style('max-height','350px')
            .style('height','350px');

        this.list = this.container.append('div')
            .attr('class','neighbor-chart-list')
            .style('display','flex')
            .style('flex-direction','column')
            .style('gap','12px')
            .style('flex','1 1 auto')
            .style('overflow-y','scroll');

        this.emptyState = this.list.append('div')
            .attr('class','neighbor-empty')
            .style('flex','1 1 auto')
            .style('display','flex')
            .style('align-items','center')
            .style('justify-content','center')
            .style('color','#999')
            .style('font-size','12px')
            .text('No data available');

        document.addEventListener('showNeighborDetails', (e)=>{
            const { pathCells, neighborCells, title } = e.detail || {};
            if (!Array.isArray(pathCells) || pathCells.length===0) {
                return;
            }
            this.appendChart(pathCells, neighborCells || [], title);
        });

        document.addEventListener('clearNeighborDetails', ()=>{
            try {
                this.list.selectAll('*').remove();
                this.chartCount = 0;
                this.emptyState = this.list.append('div')
                    .attr('class','neighbor-empty')
                    .style('flex','1 1 auto')
                    .style('display','flex')
                    .style('align-items','center')
                    .style('justify-content','center')
                    .style('color','#999')
                    .style('font-size','12px')
                    .text('No data available');
            } catch(_) {}
        });
    }

    summarizePath(descriptors) {
        return descriptors.map(d => d.label).join(' -> ');
    }

    appendChart(descriptors, neighborCells, title = null) {
        this.chartCount += 1;
        if (this.emptyState) { 
            this.emptyState.remove(); 
            this.emptyState = null; 
        }
        const pathKey = descriptors.map(d=>d.label).join('->');
        const wrap = this.list.append('div')
            .attr('class','neighbor-chart-wrapper')
            .attr('data-path-key', pathKey)
            .style('position','relative')
            .style('border','1px solid #ddd')
            .style('border-radius','8px')
            .style('padding','10px')
            .style('background','#fafafa')
            .style('overflow','hidden')
            .style('flex','0 0 auto')
            .style('min-height','300px');

        wrap.append('button')
            .attr('class','neighbor-chart-remove')
            .text('Delete')
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

        const displayTitle = title || `(${this.chartCount}) ${this.summarizePath(descriptors)}`;
        wrap.append('div')
            .attr('class','neighbor-chart-title')
            .style('font-weight','600')
            .style('margin-bottom','6px')
            .style('font-size','13px')
            .text(displayTitle);

        const chartId = `neighbor-overall-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
        wrap.append('div').attr('id', chartId).style('width','100%');
        const chart = new OverallCommChart(chartId, descriptors, neighborCells);
        chart.render(()=>{});

        document.dispatchEvent(new CustomEvent('neighborChartAdded', { 
            detail: { pathKey, wrapper: wrap.node() } 
        }));
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', ()=>{
        new NeighborDetailsPanel('#neighborDetailsContainer');
    });
}
