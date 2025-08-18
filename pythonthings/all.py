import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from sklearn.neighbors import BallTree
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler
from matplotlib.patches import Circle
import matplotlib.patches as mpatches
from collections import defaultdict
import os
import warnings
warnings.filterwarnings('ignore')
level=4
class CellAnalyzer:
    def __init__(self, base_path="F:/allCellChat_level4_withKJ/", output_base="F:/2version/js/components/pathSelection/Every_cell_info_withKJ_L4"):
        self.base_path = base_path
        self.output_base = output_base
        
        # 创建输出基础目录
        os.makedirs(output_base, exist_ok=True)
        
        # 读取基础数据
        try:
            self.annotation_df = pd.read_csv('./KJ/cell_annotation_all.csv')
            self.embedding_df = pd.read_csv('./KJ/cell_embedding_info.csv')
            self.embedding_names = pd.read_csv('./KJ/embedding_level4_names_only.csv')
            print(f"✅ 成功加载数据文件")
        except FileNotFoundError as e:
            print(f"❌ 无法找到文件: {e}")
            return
        
        # 合并数据
        self.merged_df = pd.merge(
            self.embedding_df[['cell_index', 'embedding_level', 'embedding_index']],
            self.annotation_df[['cell_index', 'annotation', 'x', 'y', 'time']],
            on='cell_index'
        )
        
        # 构建完整的细胞类型标识
        self.merged_df['annotation_time_embedding'] = (
            self.merged_df['annotation'] + '_' + 
            self.merged_df['time'].astype(int).astype(str) + '_' + 
            self.merged_df['embedding_index'].astype(str)
        )
        # 筛选embedding_level=level的数据
        self.level_data = self.merged_df[self.merged_df['embedding_level'] == level].copy()
        # 修正Y坐标
        self.level_data['y'] = self.level_data['y'].abs()

        print(f"📊 Level {level} 数据包含 {len(self.level_data)} 个细胞")
         # 定义颜色映射
        self.color_map = {
            'Heart': '#d4b365', 'Neural crest': '#5B9BD5', 'Branchial arch': '#70AD47',
            'AGM': '#00B050', 'Liver': '#FF6D01', 'Cavity': '#404040',
            'Blood vessel': '#E1819E', 'Brain': '#8B4513', 'Connective tissue': '#9966CC',
            'Dermomyotome': '#FF69B4', 'Head mesenchyme': '#20B2AA', 'Lung primordium': '#FF4500',
            'Mesenchyme': '#DAA520', 'Notochord': '#4682B4', 'Sclerotome': '#32CD32',
            'Spinal cord': '#8A2BE2', 'Surface ectoderm': '#FF1493', 'Urogenital ridge': '#00CED1'
        }

    # def visualize_target_cell_with_neighbors(self, target_cell_id, output_dir):
    #     """可视化目标细胞及其邻居细胞的空间位置"""
    #     # 解析细胞ID
    #     parts = target_cell_id.split('_')
    #     if len(parts) < 3:
    #         print(f"❌ 细胞ID格式错误: {target_cell_id}")
    #         return
        
    #     target_cell_name = parts[0]
    #     time_point = int(parts[1])
    #     embedding_index = int(parts[2])
        
    #     print(f"🎯 目标细胞: {target_cell_id}")
        
    #     # 筛选指定时间点的数据
    #     time_data = self.annotation_df[self.annotation_df['time'] == time_point].copy()
        
    #     if len(time_data) == 0:
    #         print(f"❌ 时间点 {time_point} 无数据")
    #         return
        
    #     # 构建完整细胞标识
    #     time_data['full_cell_id'] = (time_data['annotation'] + '_' + 
    #                                 time_data['time'].astype(str) + '_' + 
    #                                 time_data['embedding_index'].astype(str))
        
    #     # 找到目标细胞
    #     target_cells = time_data[time_data['full_cell_id'] == target_cell_id]
        
    #     if len(target_cells) == 0:
    #         print(f"❌ 未找到细胞 {target_cell_id}")
    #         return
        
    #     print(f"✅ 找到 {len(target_cells)} 个目标细胞")
        
    #     # 修正Y坐标
    #     time_data['y_corrected'] = time_data['y'].abs()
    #     target_cells['y_corrected'] = target_cells['y'].abs()
        
    #     # 创建图形
    #     plt.figure(figsize=(12, 10))
        
    #     # 绘制其他细胞（灰色，透明度40%）
    #     other_cells = time_data[~time_data['full_cell_id'].isin([target_cell_id])]
    #     plt.scatter(other_cells['x'], other_cells['y_corrected'], 
    #                 c='gray', s=20, alpha=0.4, label=None)
        
    #     # 使用BallTree找到目标细胞的邻居
    #     coordinates = time_data[['x', 'y']].values
    #     tree = BallTree(coordinates, metric='euclidean')
    #     target_coords = target_cells[['x', 'y']].values
    #     neighbor_indices_list = tree.query_radius(target_coords, r=10)
        
    #     # 合并所有邻居索引，去重
    #     all_neighbor_indices = set()
    #     for neighbor_indices in neighbor_indices_list:
    #         all_neighbor_indices.update(neighbor_indices)
        
    #     neighbor_cell_indices = [time_data.index[i] for i in all_neighbor_indices]
    #     neighbor_cells = time_data.loc[neighbor_cell_indices]
        
    #     # 绘制邻居细胞（透明度80%）
    #     for cell_type in neighbor_cells['annotation'].unique():
    #         cell_type_data = neighbor_cells[neighbor_cells['annotation'] == cell_type]
    #         plt.scatter(cell_type_data['x'], cell_type_data['y_corrected'], 
    #                     c=self.color_map.get(cell_type, 'gray'), s=20, alpha=0.8, label=None)
        
    #     # 绘制目标细胞（不透明）
    #     plt.scatter(target_cells['x'], target_cells['y_corrected'], 
    #                 c=self.color_map.get(target_cell_name, 'black'), s=100, marker='o', 
    #                 label=f'{target_cell_id} ({len(target_cells)} cells)', 
    #                 edgecolors='white', linewidths=1, zorder=5)
        
    #     # 设置图形属性
    #     plt.xlabel('X coordinate', fontsize=12)
    #     plt.ylabel('Y coordinate', fontsize=12)
    #     plt.title(f'Cell Spatial Distribution - Time Point {time_point}\nTarget Cell: {target_cell_id}', 
    #             fontsize=14, fontweight='bold')
    #     plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
    #     plt.grid(True, alpha=0.3)
    #     plt.axis('equal')
        
    #     # 保存图片
    #     filename = os.path.join(output_dir, f'{target_cell_id}_spatial_distribution_with_neighbors.png')
    #     plt.savefig(filename, dpi=300, bbox_inches='tight', transparent=True)  # 添加 transparent=True
    #     plt.close()
    #     print(f"📸 图片已保存: {filename}")


    def analyze_cellphone_channels(self, target_cell_id, output_dir):
        """分析CellPhoneDB通讯通道"""
        # 解析细胞ID获取群体名称
        group_name = target_cell_id
        results_dir = os.path.join(self.base_path, group_name)
        
        if not os.path.exists(results_dir):
            print(f"⚠️ CellPhoneDB数据目录不存在: {results_dir}")
            return
        
        # 加载CellPhoneDB结果
        significant_means = None
        pvalues = None
        
        for file in os.listdir(results_dir):
            file_lower = file.lower()
            if 'significant_means' in file_lower and file.endswith('.txt'):
                significant_means = pd.read_csv(os.path.join(results_dir, file), sep='\t')
            elif 'pvalue' in file_lower and file.endswith('.txt'):
                pvalues = pd.read_csv(os.path.join(results_dir, file), sep='\t')
        
        if significant_means is None:
            print(f"⚠️ 未找到significant_means文件")
            return
        
        # 获取细胞类型对列
        cell_pair_columns = [col for col in significant_means.columns 
                           if '|' in col and col != 'interacting_pair']
        
        # 解析目标细胞类型
        target_cell = target_cell_id.split('_')[0]
        
        # 分析通讯数据
        neighbor_channels = {}  # 存储每个邻居的通道详细信息
        
        for _, row in significant_means.iterrows():
            interaction_pair = row['interacting_pair']
            
            # 获取p值
            pvalue_row = None
            if pvalues is not None:
                pvalue_match = pvalues[pvalues['interacting_pair'] == interaction_pair]
                if not pvalue_match.empty:
                    pvalue_row = pvalue_match.iloc[0]
            
            # 解析配体受体
            ligand, receptor = "", ""
            if '_' in interaction_pair:
                parts = interaction_pair.split('_')
                if len(parts) >= 2:
                    ligand, receptor = parts[0], parts[1]
            
            # 检查每个细胞类型对
            for col in cell_pair_columns:
                if col in significant_means.columns:
                    score = row[col]
                    
                    if pd.notna(score) and score > 0:
                        cell_types = col.split('|')
                        if len(cell_types) == 2:
                            sender, receiver_cell = cell_types
                            
                            # 获取p值
                            pvalue = None
                            if pvalue_row is not None and col in pvalue_row.index:
                                pvalue = pvalue_row[col]
                            # 目标细胞作为发送方
                            if sender == target_cell:
                                # 添加到邻居详细通道信息
                                if receiver_cell not in neighbor_channels:
                                    neighbor_channels[receiver_cell] = {'send': [], 'receive': []}
                                
                                neighbor_channels[receiver_cell]['send'].append({
                                    '通道': interaction_pair,
                                    '接收方': receiver_cell,
                                    '接收方基因': receptor,
                                    '发送方': sender,
                                    '发送方基因': ligand,
                                    '强度': score,
                                    '显著性': pvalue
                                })
                            
                            # 目标细胞作为接收方
                            if receiver_cell == target_cell:
                                # 添加到邻居详细通道信息
                                if sender not in neighbor_channels:
                                    neighbor_channels[sender] = {'send': [], 'receive': []}
                                
                                neighbor_channels[sender]['receive'].append({
                                    '通道': interaction_pair,
                                    '接收方': receiver_cell,
                                    '接收方基因': receptor,
                                    '发送方': sender,
                                    '发送方基因': ligand,
                                    '强度': score,
                                    '显著性': pvalue
                                })
        
        # 不需要统计数据，直接处理每个邻居的top10通道
        
        # 生成每个邻居细胞与目标细胞的前10个通道详细信息
        all_channels = []
        
        for neighbor, channels in neighbor_channels.items():
            # 目标细胞发送给该邻居的前10个通道
            send_channels = sorted(channels['send'], key=lambda x: x['强度'], reverse=True)[:10]
            for rank, channel in enumerate(send_channels, 1):
                all_channels.append({
                    '邻居细胞': neighbor,
                    '方向': '发送',
                    '排名': rank,
                    '通道': channel['通道'],
                    '目标细胞': target_cell,
                    '目标细胞基因': channel['发送方基因'],
                    '邻居细胞基因': channel['接收方基因'],
                    '强度': channel['强度'],
                    '显著性': channel['显著性']
                })
            
            # 目标细胞接收该邻居的前10个通道
            receive_channels = sorted(channels['receive'], key=lambda x: x['强度'], reverse=True)[:10]
            for rank, channel in enumerate(receive_channels, 1):
                all_channels.append({
                    '邻居细胞': neighbor,
                    '方向': '接收',
                    '排名': rank,
                    '通道': channel['通道'],
                    '目标细胞': target_cell,
                    '目标细胞基因': channel['接收方基因'],
                    '邻居细胞基因': channel['发送方基因'],
                    '强度': channel['强度'],
                    '显著性': channel['显著性']
                })
        
        # 按邻居细胞和方向分组，然后按强度排序
        top10_channels_df = pd.DataFrame(all_channels)
        if not top10_channels_df.empty:
            # 重新排序：先按邻居细胞，再按方向，最后按强度
            top10_channels_df = top10_channels_df.sort_values(
                ['邻居细胞', '方向', '强度'], 
                ascending=[True, True, False]
            ).reset_index(drop=True)
        
        # 保存文件
        top10_filename = os.path.join(output_dir, f"{target_cell_id}_every_top_10_new.csv")
        
        try:
            # 只保存每个邻居的前10个通道
            if not top10_channels_df.empty:
                top10_channels_df.to_csv(top10_filename, index=False, encoding='utf-8-sig')
                print(f"📊 CellPhoneDB分析完成:")
                print(f"  每邻居前10通道: {top10_filename}")
            else:
                print(f"⚠️ 没有找到有效的通讯通道数据")
            
        except Exception as e:
            print(f"❌ 保存CellPhoneDB结果时出错: {str(e)}")
    
    def process_all_cells(self):
        """处理所有细胞"""
        total_cells = len(self.embedding_names)
        print(f"🚀 开始处理 {total_cells} 个细胞...")
        
        for idx, row in self.embedding_names.iterrows():
            cell_id = row['embedding_name']
            
            print(f"\n{'='*60}")
            print(f"处理进度: {idx+1}/{total_cells} - {cell_id}")
            print(f"{'='*60}")
            
            # 创建输出目录
            output_dir = os.path.join(self.output_base, cell_id)
            os.makedirs(output_dir, exist_ok=True)
            
            try:
                # # 生成空间分布图（包含邻居细胞）
                # print("🎯 生成空间分布图（包含邻居细胞）...")
                # self.visualize_target_cell_with_neighbors(cell_id, output_dir)
                
                # 分析CellPhoneDB通讯
                print("📞 分析细胞通讯...")
                self.analyze_cellphone_channels(cell_id, output_dir)
                
                print(f"✅ {cell_id} 处理完成!")
                
            except Exception as e:
                print(f"❌ 处理 {cell_id} 时出错: {str(e)}")
                continue
        print(f"\n🎉 所有细胞处理完成! 结果保存在: {self.output_base}")


def main():
    """主函数"""
    print("=" * 80)
    print("细胞分析系统启动")
    print("=" * 80)
    
    # 创建分析器
    analyzer = CellAnalyzer()
    
    # 处理所有细胞
    analyzer.process_all_cells()

if __name__ == "__main__":
    main()