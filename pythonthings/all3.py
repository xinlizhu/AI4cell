import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from sklearn.neighbors import BallTree
import os

# 添加颜色映射
color_map = {
    'Heart': '#d4b365', 'Neural crest': '#5B9BD5', 'Branchial arch': '#70AD47',
    'AGM': '#00B050', 'Liver': '#FF6D01', 'Cavity': '#404040',
    'Blood vessel': '#E1819E', 'Brain': '#8B4513', 'Connective tissue': '#9966CC',
    'Dermomyotome': '#FF69B4', 'Head mesenchyme': '#20B2AA', 'Lung primordium': '#FF4500',
    'Mesenchyme': '#DAA520', 'Notochord': '#4682B4', 'Sclerotome': '#32CD32',
    'Spinal cord': '#8A2BE2', 'Surface ectoderm': '#FF1493', 'Urogenital ridge': '#00CED1'
}

# 设置要分析的 embedding_level
embedding_level = 6

# 读取目标细胞类型名称
embedding_names_df = pd.read_csv('./KJ/embedding_level6_names_only.csv')
target_cavity_types = embedding_names_df['embedding_name'].tolist()

# 读取数据
annotation_df = pd.read_csv('./KJ/cell_annotation_all.csv')
embedding_df = pd.read_csv('./KJ/cell_embedding_info.csv')

# 合并数据
merged_df = pd.merge(
    embedding_df[['cell_index', 'embedding_level', 'embedding_index']],
    annotation_df[['cell_index', 'annotation', 'x', 'y', 'time']],
    on='cell_index'
)

# 构建完整的细胞类型标识（annotation_time_embedding）
merged_df['annotation_time_embedding'] = (
    merged_df['annotation'] + '_' + 
    merged_df['time'].astype(int).astype(str) + '_' + 
    merged_df['embedding_index'].astype(str)
)

# 筛选指定embedding_level的数据
level_data = merged_df[merged_df['embedding_level'] == embedding_level]

# 修正Y坐标 - 取绝对值
level_data['y'] = level_data['y'].abs()

# 创建保存图片的目录
output_dir = "F:/2version/js/components/pathSelection/Every_cell_info_withKJ"
os.makedirs(output_dir, exist_ok=True)

# 循环处理每个目标细胞类型
for target_cavity_type in target_cavity_types:
    print(f"=== 查找 {target_cavity_type} 类型细胞及其邻居分析 ===")
    print(f"Level {embedding_level}")

    # 1. 找到所有目标细胞类型的细胞
    cavity_cells = level_data[level_data['annotation_time_embedding'] == target_cavity_type]

    print(f"找到 {len(cavity_cells)} 个 {target_cavity_type} 细胞")

    if len(cavity_cells) == 0:
        print(f"未找到 {target_cavity_type} 细胞")
        print("数据中存在的相关类型：")
        related_types = level_data[level_data['annotation_time_embedding'].str.contains(target_cavity_type.split('_')[0], case=False, na=False)]['annotation_time_embedding'].unique()
        for related_type in sorted(related_types):
            count = len(level_data[level_data['annotation_time_embedding'] == related_type])
            print(f"  {related_type}: {count} 个细胞")
    else:
        # 2. 使用BallTree找到目标细胞的邻居（半径10）
        coordinates = level_data[['x', 'y']].values
        tree = BallTree(coordinates, metric='euclidean')
        cavity_coords = cavity_cells[['x', 'y']].values
        neighbor_indices_list = tree.query_radius(cavity_coords, r=10)  # 搜索半径10

        # 合并所有邻居索引，去重
        all_neighbor_indices = set()
        for neighbor_indices in neighbor_indices_list:
            all_neighbor_indices.update(neighbor_indices)

        neighbor_cell_indices = [level_data.index[i] for i in all_neighbor_indices]
        neighbor_cells = level_data.loc[neighbor_cell_indices]

        print(f"找到 {len(neighbor_cells)} 个邻居细胞（包括 {target_cavity_type} 细胞本身）")

        # 3. 筛选出中间数字为1的细胞类型
        target_time = '1'  # 中间数字为1
        level_data_filtered = level_data[level_data['annotation_time_embedding'].str.contains(f'_{target_time}_')]

        # 4. 绘制真实的散点图
        plt.figure(figsize=(12, 10))

        # 设置透明背景
        plt.gca().set_facecolor('none')
        
        # 获取目标细胞的颜色
        target_cell_type = target_cavity_type.split('_')[0]  # 提取细胞类型名称
        cavity_color = color_map.get(target_cell_type, '#404040')  # 获取颜色，默认为深灰色

        # 绘制所有其他细胞（灰色，透明度40%）
        other_cells = level_data_filtered[~level_data_filtered['cell_index'].isin(neighbor_cells['cell_index'])]
        plt.scatter(other_cells['x'], other_cells['y'], c='gray', alpha=0.4, s=10)

        # 先绘制发光效果（大一点、透明度低）
        plt.scatter(cavity_cells['x'], cavity_cells['y'], 
                    c=cavity_color, alpha=0.3, s=150, 
                    edgecolor='none', zorder=4)

        # 再绘制实际的目标细胞
        plt.scatter(cavity_cells['x'], cavity_cells['y'], 
                    c=cavity_color, alpha=0.9, s=80, edgecolor='white', linewidth=2, zorder=5)

        # 绘制邻居细胞（按类型用不同颜色，透明度70%）
        neighbor_types = neighbor_cells['annotation'].unique()

        for cell_type in neighbor_types:
            if cell_type != target_cavity_type.split('_')[0]:  # 排除目标细胞本身
                type_cells = neighbor_cells[neighbor_cells['annotation'] == cell_type]
                # 使用颜色映射中的颜色
                cell_color = color_map.get(cell_type, 'black')  # 如果没有找到颜色，默认为黑色
                plt.scatter(type_cells['x'], type_cells['y'], 
                            c=cell_color, alpha=0.7, s=30, edgecolor='black', linewidth=0.5)

        # 去掉所有文字、标签、边框、网格
        plt.axis('off')  # 关闭坐标轴
        plt.gca().set_aspect('equal')  # 保持纵横比

        # 保存图片到指定文件夹
        cell_dir = os.path.join(output_dir, target_cavity_type)
        os.makedirs(cell_dir, exist_ok=True)
        output_path = os.path.join(cell_dir, f"{target_cavity_type}_spatial_distribution.png")
        plt.savefig(output_path, bbox_inches='tight', facecolor='none', pad_inches=0)
        plt.close()

print("所有图片已生成并保存到指定文件夹。")