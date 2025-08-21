class CellSelectionTest {
    constructor() {
        this.data = [];
        this.selectedCells = new Set(); // 用于存储选中的细胞名称
        this.colors = {
            'Heart': '#d4b365',
            'Neural crest': '#5B9BD5',
            'Branchial arch': '#70AD47',
            'AGM': '#00B050',
            'Liver': '#FF6D01',
            'Cavity': '#404040',
            'Blood vessel': '#E1819E',
            'Brain': '#8B4513',
            'Connective tissue': '#9966CC',
            'Dermomyotome': '#FF69B4',
            'Head mesenchyme': '#20B2AA',
            'Lung primordium': '#FF4500',
            'Mesenchyme': '#DAA520',
            'Notochord': '#4682B4',
            'Sclerotome': '#32CD32',
            'Spinal cord': '#8A2BE2',
            'Surface ectoderm': '#FF1493',
            'Urogenital ridge': '#00CED1'
        };
        this.init();
    }

    async init() {
        await this.loadData();
        this.render();
    }

    async loadData() {
        try {
            const response = await fetch('./js/components/pathSelection/Path/cellcount_KJ.csv');
            const csvText = await response.text();
            const lines = csvText.trim().split('\n');
            const headers = lines[0].split(',');

            this.data = lines.slice(1).map(line => {
                const values = line.split(',');
                return {
                    annotation: values[0],
                    time1: parseInt(values[1]),
                    time2: parseInt(values[2]),
                    total: parseInt(values[3]),
                    ratio: parseFloat(values[4]),
                    out: parseInt(values[5]),
                    in: parseInt(values[6]),
                    outtype: parseInt(values[7]),
                    intype: parseInt(values[8])
                };
            });

            this.data.sort((a, b) => b.ratio - a.ratio);
            console.log('数据加载完成:', this.data);
        } catch (error) {
            console.error('加载数据失败:', error);
        }
    }

    render() {
        const container = d3.select('#cellSelectionContainer');
        container.selectAll('*').remove();

        const header = container.append('div')
            .attr('class', 'cell-selection-header');

        header.append('h2')
            .text('Cell Selection');

        const cellList = container.append('div')
            .attr('class', 'cell-list');

        this.cellList = cellList;
        this.updateItems();
    }

    updateItems() {
        const items = this.cellList.selectAll('.cell-item')
            .data(this.data, d => d.annotation);

        const itemsEnter = items.enter()
            .append('div')
            .attr('class', 'cell-item')
            .on('click', (event, d) => {
                if (this.selectedCells.has(d.annotation)) {
                    this.selectedCells.delete(d.annotation);
                } else {
                    this.selectedCells.add(d.annotation);
                }
                this.updateSelection();
                this.triggerSelectionChange(); // 触发选中状态变化事件
            });

        const itemsUpdate = itemsEnter.merge(items);

        // 清空并重新构建内部结构（两行卡片）
        itemsUpdate.html('');

        const row1 = itemsUpdate.append('div')
            .attr('class', 'cell-row1');

        row1.append('div')
            .attr('class', 'cell-color')
            .style('background-color', d => this.colors[d.annotation] || '#999');

        row1.append('div')
            .attr('class', 'cell-name')
            .text(d => d.annotation);

        row1.append('div')
            .attr('class', 'cell-percentage')
            .text(d => `${(d.ratio * 100).toFixed(1)}%`);

        const row2 = itemsUpdate.append('div')
            .attr('class', 'cell-row2');

        const metrics = ['out','in','outtype','intype'];
        const labels = { out: 'O', in: 'I', outtype: 'oT', intype: 'iT' };
        row2.selectAll('.cell-metric')
            .data(d => metrics.map(k => ({ key: k, value: d[k] })))
            .enter()
            .append('div')
            .attr('class', 'cell-metric')
            .attr('title', m => `${labels[m.key]}: ${m.value}`)
            .text(m => `${labels[m.key]}:${m.value}`);

        items.exit().remove();
        this.updateSelection();
    }
    updateSelection() {
        this.cellList.selectAll('.cell-item')
            .classed('selected', d => this.selectedCells.has(d.annotation));
    }

    triggerSelectionChange() {
        // 触发自定义事件，通知其他脚本选中状态已改变
        const event = new CustomEvent('cellSelectionChange', {
            detail: {
                selectedCells: Array.from(this.selectedCells) // 将选中的细胞名称数组传递出去
            }
        });
        document.dispatchEvent(event); // 改为 document.dispatchEvent
        console.log('触发细胞选择事件:', Array.from(this.selectedCells)); // 添加调试日志
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CellSelectionTest();
});