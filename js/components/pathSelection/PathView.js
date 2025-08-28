// 仅保留被 LineageVis 使用的提取细胞类型工具函数
export function extractCellType(nodeName) {
    // 处理像 "Neural crest_1_71" 这样的格式
    // 找到最后两个下划线的位置，提取前面的部分作为细胞类型
    const parts = nodeName.split('_');
    if (parts.length >= 3) {
        // 移除最后两个数字部分，保留细胞类型
        return parts.slice(0, -2).join('_');
    }
    return nodeName; // 如果格式不符合预期，返回原始名称
}
// 过去此文件还包含旧的 PathViewer、树构建等逻辑，现已移除以避免重复和混淆。
// 若后续需要这些功能，请从专用模块（如 PathPattern）内部实现或单独创建新模块。