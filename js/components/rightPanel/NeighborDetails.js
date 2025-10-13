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
            .style('gap','0px')
            .style('min-height','345px')
            .style('max-height','345px')
            .style('height','345px');

        // 添加标题
        this.container.append('h3')
            .attr('class', 'neighbor-header')
            .style('margin', '0 0 0px 0')
            .style('padding', '0px 0px')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .style('color', '#333')
            .text('🔬 Micro-environment Exploration View');

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



        const pathSummary = this.summarizePath(descriptors);
        const nodeCount = descriptors.length;
        const neighborCount = neighborCells ? neighborCells.length : 0;
        
        // 创建更丰富的标题容器
        const titleContainer = wrap.append('div')
            .attr('class','neighbor-chart-title-container')
            .style('margin-bottom','12px')
            .style('padding','8px 12px')
            .style('background','linear-gradient(135deg, #f8faff 0%, #e8f2ff 100%)')
            .style('border-radius','6px')
            .style('border','1px solid #e3efff')
            .style('position','relative'); /* 添加相对定位，为删除按钮提供定位上下文 */
        
        // 主标题行
        const mainTitle = titleContainer.append('div')
            .style('display','flex')
            .style('align-items','center')
            .style('justify-content','space-between')
            .style('margin-bottom','4px');
            
        const titleLeft = mainTitle.append('div')
            .style('display','flex')
            .style('align-items','center');
            
        titleLeft.append('span')
            .style('font-weight','600')
            .style('font-size','13px')
            .style('color','#2c3e50')
            .style('letter-spacing','0.3px')
            .text(title || 'Multi-Node Analysis');
        
        // 详细信息行
        const detailsRow = titleContainer.append('div')
            .style('display','flex')
            .style('gap','12px')
            .style('font-size','10px')
            .style('color','#64748b');
            
        detailsRow.append('span')
            .html(`<strong>Path:</strong> ${pathSummary}`);
            
        detailsRow.append('span')
            .html(`<strong>Nodes:</strong> ${nodeCount}`);
            
        if (neighborCount > 0) {
            detailsRow.append('span')
                .html(`<strong>Neighbors:</strong> ${neighborCount}`);
        }
        
        // 在titleContainer中添加删除按钮，位于容器的垂直中央
        titleContainer.append('button')
            .attr('class','neighbor-chart-remove')
            .text('×')
            .style('position','absolute')
            .style('top','50%') /* 相对于titleContainer垂直居中 */
            .style('transform','translateY(-50%)')
            .style('right','8px')
            .style('background','rgba(255,85,85,0.1)')
            .style('color','#ff5555')
            .style('border','1px solid rgba(255,85,85,0.3)')
            .style('padding','0')
            .style('border-radius','50%')
            .style('cursor','pointer')
            .style('font-size','14px')
            .style('font-weight','bold')
            .style('width','24px')
            .style('height','24px')
            .style('display','flex')
            .style('align-items','center')
            .style('justify-content','center')
            .style('transition','all 0.2s ease')
            .style('z-index','10')
            .on('mouseover', function() {
                d3.select(this)
                    .style('background','#ff5555')
                    .style('color','white');
            })
            .on('mouseout', function() {
                d3.select(this)
                    .style('background','rgba(255,85,85,0.1)')
                    .style('color','#ff5555');
            })
            .on('click', () => wrap.remove());

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
