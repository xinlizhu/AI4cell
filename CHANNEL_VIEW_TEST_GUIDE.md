# ChannelView 弧线点击功能测试指南

## 功能概述
在 LineageVis 中点击任意弧线，会在横坐标 2200-2500 位置的 ChannelView 中显示对应的细胞通信通道 Top 10 信息。

## 实现的功能

### 1. 弧线点击检测
- **接收弧线**（内弧）：显示从邻居细胞发送到当前细胞的通道
- **发送弧线**（外弧）：显示从当前细胞发送到邻居细胞的通道

### 2. 数据合并逻辑
- **强度加和**：同类型通道的强度值累加
- **显著性平均**：同类型通道的显著性值取平均
- **自动排序**：按强度重新排序，取前10名

### 3. 视图显示
- **上半部分**：接收 Top 10 通道
- **下半部分**：发送 Top 10 通道
- **详细信息**：通道名称、强度、显著性、基因信息

## 测试步骤

### 1. 准备工作
1. 确保浏览器开发者工具已打开（F12）
2. 查看 Console 标签页查看调试信息

### 2. 测试点击
1. 在 LineageVis 中找到任意细胞节点的弧线
2. 点击弧线（内弧或外弧）
3. 观察右侧 ChannelView 的显示

### 3. 验证结果
1. **Console 输出**：应该看到以下调试信息
   ```
   ChannelView: 接收到弧线点击事件 {cellName: "Neural crest", neighborCell: "Brain", communicationType: "send"}
   源细胞子类型: ["Neural crest_1_2", "Neural crest_1_3", ...]
   合并后的通道数据: {send: [...], receive: [...]}
   ```

2. **ChannelView 显示**：
   - 标题应显示正确的细胞名称
   - 上半部分显示接收通道列表
   - 下半部分显示发送通道列表
   - 每行显示：排名、通道名、强度、显著性

### 4. 交互测试
1. **鼠标悬停**：悬停在通道条目上应显示详细信息
2. **多次点击**：点击不同弧线应更新显示内容
3. **错误处理**：点击没有数据的弧线应显示适当提示

## 调试信息

### Console 输出解释
- `ChannelView: 接收到弧线点击事件`: 确认事件监听正常
- `源细胞子类型`: 显示找到的子类型文件
- `找到子类型: Neural crest_1_X`: 确认数据文件加载成功
- `合并后的通道数据`: 显示最终处理的数据

### 常见问题
1. **ChannelView 不显示**：检查 CSS 定位和容器创建
2. **数据加载失败**：检查 CSV 文件路径和文件是否存在
3. **合并数据为空**：检查细胞名称匹配和数据过滤逻辑

## 数据文件路径格式
```
./js/components/pathSelection/Every_cell_info_withKJL4/${cellType}/${cellType}_every_top_10.csv
```

例如：
- `Neural crest_1_2_every_top_10.csv`
- `Neural crest_1_3_every_top_10.csv`
- `Brain_1_0_every_top_10.csv`

## 预期效果
点击 Neural crest 节点到 Branchial arch 的外弧，应该显示：
- 发送部分：Neural crest → Branchial arch 的 Top 10 通道
- 接收部分：Branchial arch → Neural crest 的 Top 10 通道

数据将自动合并所有 Neural crest 子类型（如 Neural crest_1_2, Neural crest_1_3）的结果。