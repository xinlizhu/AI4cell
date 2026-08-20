import { OverallCommChart } from '../pathSelection/OverallCommChart.js';

class NeighborDetailsPanel {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.list = null;
        this.chartCount = 0;
        
        // 颜色映射：与OverallCommChart保持一致
        this.typeColorMap = {
            'Heart': '#EF778C', // 浅红色
            'Neural crest': '#7BC031', // 绿色
            'Branchial arch': '#BA956A', // 棕色
            'AGM': '#B624D9', // 紫色
            'Liver': '#D4A017', // 金黄色，和路径选中蓝色区分
            'Cavity': '#B13E00', // 橙色
            'Brain': '#F9D7BE', // 米色
            'Connective tissue': '#008C95', // 青绿色，和路径选中蓝色区分
            'Dermomyotome': '#EE4FF9', // 粉紫色
            'Mesenchyme': '#D3245A', // 深红色
            'Notochord': '#EF833A', // 橙色
            'Sclerotome': '#35586D' // 深灰色
        };
        this.scheme = d3.schemeCategory10;
        
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

    getColorForCellType(cellType) {
        // 获取细胞类型的颜色
        if (this.typeColorMap[cellType]) {
            return this.typeColorMap[cellType];
        }
        // 如果没有预定义颜色，使用哈希算法生成
        let hash = 0;
        const s = String(cellType);
        for (let i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash |= 0;
        }
        const idx = Math.abs(hash) % this.scheme.length;
        return this.scheme[idx];
    }

    createColoredPathDisplay(descriptors) {
        // 创建带颜色编码的路径显示
        const pathContainer = document.createElement('span');
        pathContainer.style.display = 'inline-flex';
        pathContainer.style.alignItems = 'center';
        pathContainer.style.gap = '4px';
        pathContainer.style.flexWrap = 'wrap';

        descriptors.forEach((descriptor, index) => {
            const cellType = descriptor.label;
            const color = this.getColorForCellType(cellType);
            
            // 创建颜色指示器
            const colorIndicator = document.createElement('span');
            colorIndicator.style.display = 'inline-block';
            colorIndicator.style.width = '8px';
            colorIndicator.style.height = '8px';
            colorIndicator.style.backgroundColor = color;
            colorIndicator.style.borderRadius = '50%';
            colorIndicator.style.marginRight = '2px';
            colorIndicator.style.border = '1px solid rgba(0,0,0,0.1)';
            
            // 创建文本标签
            const textLabel = document.createElement('span');
            textLabel.textContent = cellType;
            textLabel.style.fontSize = '10px';
            textLabel.style.fontWeight = '500';
            
            // 创建包装容器
            const cellContainer = document.createElement('span');
            cellContainer.style.display = 'inline-flex';
            cellContainer.style.alignItems = 'center';
            cellContainer.appendChild(colorIndicator);
            cellContainer.appendChild(textLabel);
            
            pathContainer.appendChild(cellContainer);
            
            // 添加箭头（除了最后一个元素）
            if (index < descriptors.length - 1) {
                const arrow = document.createElement('span');
                arrow.textContent = '→';
                arrow.style.margin = '0 3px';
                arrow.style.color = '#666';
                arrow.style.fontSize = '9px';
                pathContainer.appendChild(arrow);
            }
        });

        return pathContainer;
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
            .style('color','#64748b')
            .style('align-items','center');
            
        // 路径显示部分 - 使用带颜色编码的显示
        const pathSection = detailsRow.append('div')
            .style('display','flex')
            .style('align-items','center')
            .style('gap','4px');
            
        pathSection.append('span')
            .html('<strong>Path:</strong>')
            .style('margin-right','4px');
            
        // 添加带颜色编码的路径
        const coloredPath = this.createColoredPathDisplay(descriptors);
        pathSection.node().appendChild(coloredPath);
            
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
