export class MarkerView {
    constructor(containerId) {
        this.container = d3.select(`#${containerId}`);
        if (this.container.empty()) {
            console.error(`MarkerView Error: Container #${containerId} not found.`);
            return;
        }
        this.cellName = null;
        this.dataCache = new Map(); // 用于缓存已加载的CSV数据，提高性能

        this.init();
        this.addEventListeners();
    }

    /**
     * 初始化视图的基本结构，分为“发送”和“接收”两个区域
     */
    init() {
        this.container.html(''); // 每次初始化时清空容器

        this.container.append('h5').attr('class', 'fw-bold').text('Marker View');

        // “作为发送方” (as send) 的区域
        const sendSection = this.container.append('div').attr('class', 'marker-section mb-3');
        this.sendTitle = sendSection.append('h6');
        this.sendContent = sendSection.append('div').attr('class', 'marker-content');

        // “作为接收方” (as receive) 的区域
        const receiveSection = this.container.append('div').attr('class', 'marker-section');
        this.receiveTitle = receiveSection.append('h6');
        this.receiveContent = receiveSection.append('div').attr('class', 'marker-content');

        this.updateTitles(); // 使用默认标题初始化视图
        this.clearTables(); // 显示初始提示信息
    }

    /**
     * 监听从 LineageChart 派发的全局事件
     */
    addEventListeners() {
        // 监听主细胞选择事件，用于更新标题和清空视图
        document.addEventListener('cellSelected', (e) => {
            const newCellName = e.detail.cellName;
            if (this.cellName !== newCellName) {
                this.cellName = newCellName;
                this.dataCache.clear(); // 更换主细胞时，清空数据缓存
                this.updateTitles();
                this.clearTables();
            }
        });

        // 监听通讯弧点击事件，这是核心的数据加载触发器
        document.addEventListener('communicationArcSelected', (e) => {
            const { cellName, neighborCell, communicationType } = e.detail;
            
            // 确保事件与当前视图的细胞匹配
            if (cellName !== this.cellName) {
                this.cellName = cellName;
                this.dataCache.clear();
                this.updateTitles();
                this.clearTables();
            }
            
            this.loadAndRenderData(neighborCell, communicationType);
        });
    }

    /**
     * 更新两个区域的标题
     */
    updateTitles() {
        const displayName = this.cellName || '...';
        this.sendTitle.text(`${displayName} as send`);
        this.receiveTitle.text(`${displayName} as receive`);
    }

    /**
     * 清空两个表格的内容，并显示引导性提示
     */
    clearTables() {
        this.sendContent.html('<p class="text-muted small">Click an outer arc to see details.</p>');
        this.receiveContent.html('<p class="text-muted small">Click an inner arc to see details.</p>');
    }

    /**
     * 异步加载、过滤并渲染数据
     * @param {string} neighborCell - 邻居细胞名称
     * @param {string} communicationType - 'send' (外环) 或 'receive' (内环)
     */
    async loadAndRenderData(neighborCell, communicationType) {
        if (!this.cellName) return;

        const filePath = `./js/components/pathSelection/Every_cell_info_withKJL4/${this.cellName}/${this.cellName}_every_top_10_new.csv`;
        
        try {
            let allData;
            // 检查缓存中是否已有数据
            if (this.dataCache.has(filePath)) {
                allData = this.dataCache.get(filePath);
            } else {
                // 如果没有，则从文件加载并存入缓存
                allData = await d3.csv(filePath, d3.autoType);
                this.dataCache.set(filePath, allData);
            }

            // 将 'send'/'receive' 映射到 CSV 中的 '发送'/'接收'
            const direction = communicationType === 'send' ? '发送' : '接收';
            
            // 核心过滤逻辑：根据邻居细胞和通讯方向筛选数据
            const filteredData = allData.filter(d => 
                d['邻居细胞'] === neighborCell && d['方向'] === direction
            );

            // 根据通讯类型，选择要更新的 DOM 容器
            const targetContent = communicationType === 'send' ? this.sendContent : this.receiveContent;
            
            this.renderGeneTable(targetContent, filteredData, neighborCell, communicationType);

        } catch (error) {
            console.error(`Error loading or processing data from ${filePath}:`, error);
            const targetContent = communicationType === 'send' ? this.sendContent : this.receiveContent;
            targetContent.html(`<p class="text-danger small">Error: Could not load data file for ${this.cellName}.</p>`);
        }
    }

    /**
     * 将过滤后的数据渲染成一个清晰的表格
     * @param {d3.Selection} container - D3 选择的容器元素 (sendContent 或 receiveContent)
     * @param {Array} data - 过滤后的数据行
     * @param {string} neighborCell - 邻居细胞名称
     * @param {string} communicationType - 'send' 或 'receive'
     */
    renderGeneTable(container, data, neighborCell, communicationType) {
        container.html(''); // 渲染前清空旧内容

        if (data.length === 0) {
            container.append('p')
                .attr('class', 'text-muted small')
                .text(`No ${communicationType} data available for interaction with ${neighborCell}.`);
            return;
        }

        const table = container.append('table')
            .attr('class', 'table table-hover table-sm');

        const thead = table.append('thead');
        const headerRow = thead.append('tr');
        
        // 定义表格列，与 CSV 文件头对应
        const columns = [
            { key: '排名', label: 'Rank' },
            { key: '通道', label: 'Channel' },
            { key: '强度', label: 'Strength' },
            { key: '显著性', label: 'P-Value' }
        ];

        columns.forEach(col => {
            headerRow.append('th').attr('scope', 'col').text(col.label);
        });

        const tbody = table.append('tbody');
        data.forEach(d => {
            const row = tbody.append('tr');
            columns.forEach(col => {
                let value = d[col.key];
                // 对数值进行格式化，使其更易读
                if (typeof value === 'number') {
                    value = value.toPrecision(3);
                }
                row.append('td').text(value);
            });
        });
    }
}

// 【新增】确保在 DOM 加载完成后再初始化
document.addEventListener('DOMContentLoaded', () => {
    new MarkerView('markerViewContainer');
});