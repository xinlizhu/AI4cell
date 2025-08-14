/**
 * 主应用入口
 * 负责初始化应用、加载数据和协调各个模块
 */

import { DataProcessor } from './core/DataProcessor.js';
import { StateManager } from './core/StateManager.js';
import { EventBus } from './core/EventBus.js';
import { CSVLoader } from './data/csvLoader.js';

// 组件导入
import { CellSelection } from './components/pathSelection/CellSelection.js';
import { PatternGenerator } from './components/pathSelection/PatternGenerator.js';
import { PatternSelection } from './components/pathSelection/PatternSelection.js';
import { PathView } from './components/pathSelection/PathView.js';

class App {
    constructor() {
        this.dataProcessor = new DataProcessor();
        this.stateManager = new StateManager();
        this.eventBus = new EventBus();
        this.csvLoader = new CSVLoader();
        
        this.components = {};
        this.currentView = 'pathSelection'; // pathSelection, lineageVis, cellChat
        
        this.init();
    }
    
    async init() {
        try {
            // 显示加载界面
            this.showLoading(true);
            
            // 初始化事件监听
            this.setupEventListeners();
            
            // 加载CSV数据
            console.log('Loading CSV data...');
            this.updateStatus('正在加载CSV数据...');
            
            const csvData = await this.csvLoader.loadData('./Path/level7_path_cell_stat_allPath_no_cycle_filtered.csv');
            console.log(`Loaded ${csvData.length} records`);
            
            // 处理数据
            console.log('Processing data...');
            this.updateStatus('正在处理数据...');
            
            const processedData = await this.dataProcessor.processData(csvData);
            
            // 更新状态管理器
            this.stateManager.updateState({
                rawData: csvData,
                cellTypes: processedData.cellTypes,
                allPaths: processedData.allPaths
            });
            
            // 初始化组件
            console.log('Initializing components...');
            this.updateStatus('正在初始化组件...');
            this.initializeComponents();
            
            // 设置PatternGenerator的数据处理器
            this.components.patternGenerator.setDataProcessor(this.dataProcessor);
            
            // 隐藏加载界面
            this.showLoading(false);
            
            // 显示初始界面
            this.showView('pathSelection');
            this.updateStatus('就绪');
            
            console.log('App initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showLoading(false);
            this.showError(`初始化失败: ${error.message}`);
        }
    }
    
    setupEventListeners() {
        // 监听视图切换事件
        this.eventBus.on('switchView', (viewName) => {
            this.showView(viewName);
        });
        
        // 监听数据更新事件
        this.eventBus.on('dataUpdated', () => {
            this.updateComponents();
        });
    }
    
    initializeComponents() {
        // 初始化 Path Selection 组件
        this.components.cellSelection = new CellSelection(this.eventBus, this.stateManager);
        this.components.patternGenerator = new PatternGenerator(this.eventBus, this.stateManager);
        this.components.patternSelection = new PatternSelection(this.eventBus, this.stateManager);
        this.components.pathView = new PathView(this.eventBus, this.stateManager);
    }
    
    showView(viewName) {
        // 隐藏所有视图
        document.querySelectorAll('.view-container').forEach(view => {
            view.classList.add('hidden');
        });
        
        // 显示目标视图
        const targetView = document.getElementById(`${viewName}Container`);
        if (targetView) {
            targetView.classList.remove('hidden');
            this.currentView = viewName;
        }
    }
    
    updateComponents() {
        // 通知所有组件数据已更新
        Object.values(this.components).forEach(component => {
            if (component.onDataUpdate) {
                component.onDataUpdate();
            }
        });
    }
    
    showLoading(show) {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            if (show) {
                loadingOverlay.classList.remove('hidden');
            } else {
                loadingOverlay.classList.add('hidden');
            }
        }
    }
    
    updateStatus(message) {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = message;
        }
        
        // 也更新加载界面的文字
        const loadingText = document.querySelector('.loading-spinner p');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }
    
    showError(message) {
        // 隐藏加载界面
        this.showLoading(false);
        
        // 显示错误信息
        const errorHtml = `
            <div class="error-container">
                <div class="error-icon">⚠️</div>
                <h3>加载失败</h3>
                <p>${message}</p>
                <button onclick="location.reload()">重新加载</button>
            </div>
        `;
        
        document.body.innerHTML = errorHtml;
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
