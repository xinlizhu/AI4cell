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
            .style('gap','0px') /* 移除gap，用分隔线代替 */
            .style('flex','1 1 auto')
            .style('overflow-y','auto')
            .style('overflow-x','hidden')
            .style('padding','8px 12px') /* 添加内边距 */
            .style('scrollbar-width','thin') /* Firefox下细滚动条 */
            .style('scrollbar-color','#e0e0e0 transparent'); /* Firefox滚动条颜色 */

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
            .style('border','none') /* 移除边框，减少视觉噪音 */
            .style('border-radius','0px')
            .style('padding','12px 8px') /* 调整padding */
            .style('background','transparent') /* 透明背景 */
            .style('overflow','hidden')
            .style('flex','0 0 auto')
            .style('min-height','280px') /* 增加高度以更好地利用空间 */
            .style('margin-bottom','8px'); /* 添加底部间距 */

        // 只为非最后一个元素添加分隔线
        if (this.chartCount > 1) {
            wrap.style('border-top','1px solid #f5f5f5'); /* 顶部分隔线，而非底部 */
            wrap.style('padding-top','20px'); /* 增加顶部内边距 */
        }

        wrap.append('button')
            .attr('class','neighbor-chart-remove')
            .text('×') /* 使用更简洁的关闭符号 */
            .style('position','absolute')
            .style('top','8px')
            .style('right','8px')
            .style('background','rgba(255,85,85,0.1)') /* 半透明背景 */
            .style('color','#000000ff')
            .style('border','1px solid rgba(255,85,85,0.2)') /* 极淡边框 */
            .style('padding','4px 8px')
            .style('border-radius','50%') /* 圆形按钮更现代 */
            .style('cursor','pointer')
            .style('font-size','14px')
            .style('font-weight','bold')
            .style('width','24px')
            .style('height','24px')
            .style('display','flex')
            .style('align-items','center')
            .style('justify-content','center')
            .style('transition','all 0.2s ease')
            .on('mouseover', function() {
                d3.select(this)
                    .style('background','rgba(255,85,85,0.2)')
                    .style('color','#fff')
                    .style('background','#ff5555');
            })
            .on('mouseout', function() {
                d3.select(this)
                    .style('background','rgba(255,85,85,0.1)')
                    .style('color','#ff5555');
            })
            .on('click', () => wrap.remove());

        const displayTitle = title || `${this.summarizePath(descriptors)}`;
        wrap.append('div')
            .attr('class','neighbor-chart-title')
            .style('font-weight','500') /* 减轻字重 */
            .style('margin-bottom','8px')
            .style('font-size','12px') /* 稍微减小字号 */
            .style('color','#555') /* 使用更淡的颜色 */
            .style('border-left','3px solid #e3f2fd') /* 左侧加一条细的彩色线条作为标识 */
            .style('padding-left','8px')
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
