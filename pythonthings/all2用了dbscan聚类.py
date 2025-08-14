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
level=6
class CellAnalyzer:
    def __init__(self, base_path="F:/allCellChat_level6_withKJ/", output_base="F:/2version/js/components/pathSelection/Every_cell_info_withKJ"):
        self.base_path = base_path
        self.output_base = output_base
        
        # 创建输出基础目录
        os.makedirs(output_base, exist_ok=True)
        
        # 读取基础数据
        try:
            self.annotation_df = pd.read_csv('./KJ/cell_annotation_all.csv')
            self.embedding_df = pd.read_csv('./KJ/cell_embedding_info.csv')
            self.embedding_names = pd.read_csv('./KJ/embedding_level6_names_only.csv')
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

    def analyze_neighbors(self, target_cell_id, output_dir):
        """使用DBSCAN聚类分析邻居细胞 - 记录每个簇的重心位置"""
        # 解析细胞ID获取基本信息
        parts = target_cell_id.split('_')
        if len(parts) < 3:
            print(f"❌ 细胞ID格式错误: {target_cell_id}")
            return
        
        target_cell_name = parts[0]
        time_point = int(parts[1])
        embedding_index = int(parts[2])
        
        # 筛选指定时间点和embedding_level=level的数据
        level_data = self.merged_df[
            (self.merged_df['embedding_level'] == level) & 
            (self.merged_df['time'] == time_point)
        ].copy()
        
        # 修正Y坐标
        level_data['y'] = level_data['y'].abs()
        
        if len(level_data) == 0:
            print(f"❌ 时间点 {time_point} 的 Level  数据为空")
            return
        
        # 找到目标细胞
        target_cells = level_data[level_data['annotation'] == target_cell_name]
        
        if len(target_cells) == 0:
            print(f"❌ 未找到细胞类型 {target_cell_name}")
            return
        
        print(f"🔍 找到 {len(target_cells)} 个 {target_cell_name} 细胞")
        
        # 计算目标细胞重心
        target_centroid_x = target_cells['x'].mean()
        target_centroid_y = target_cells['y'].mean()
        target_count = len(target_cells)
        
        print(f"重心位置: ({target_centroid_x:.1f}, {target_centroid_y:.1f})")
        
        # 使用BallTree找到目标细胞的邻居
        coordinates = level_data[['x', 'y']].values
        tree = BallTree(coordinates, metric='euclidean')
        target_coords = target_cells[['x', 'y']].values
        neighbor_indices_list = tree.query_radius(target_coords, r=10)
        
        # 合并所有邻居索引，去重
        all_neighbor_indices = set()
        for neighbor_indices in neighbor_indices_list:
            all_neighbor_indices.update(neighbor_indices)
        
        neighbor_cell_indices = [level_data.index[i] for i in all_neighbor_indices]
        neighbor_cells = level_data.loc[neighbor_cell_indices]
        
        print(f"邻居细胞总数: {len(neighbor_cells)}")
        
        # 存储所有簇的信息
        neighbor_stats = []
        
        # 添加目标细胞本身（作为一个簇）
        neighbor_stats.append({
            'cell_type': target_cell_name,
            'cluster_id': 'target',
            'cell_num': target_count,
            'x': round(target_centroid_x, 1),
            'y': round(target_centroid_y, 1),
            'distance_to_target': 0.0,
            'compactness': 0.0
        })
        
        print(f"\n=== 使用DBSCAN分析各种细胞类型的聚类簇 ===")
        
        for annotation in neighbor_cells['annotation'].unique():
            if annotation == target_cell_name:
                continue  # 跳过目标细胞本身
                
            annotation_cells = neighbor_cells[neighbor_cells['annotation'] == annotation]
            
            if len(annotation_cells) < 5:  # 细胞数量太少，使用传统方法
                centroid_x = annotation_cells['x'].mean()
                centroid_y = annotation_cells['y'].mean()
                cell_count = len(annotation_cells)
                distance_to_target = np.sqrt((centroid_x - target_centroid_x)**2 + 
                                           (centroid_y - target_centroid_y)**2)
                
                neighbor_stats.append({
                    'cell_type': annotation,
                    'cluster_id': 'single_cluster',
                    'cell_num': cell_count,
                    'x': round(centroid_x, 1),
                    'y': round(centroid_y, 1),
                    'distance_to_target': round(distance_to_target, 1),
                    'compactness': 0.0
                })
                continue
                
            print(f"\n--- {annotation} ({len(annotation_cells)} 个细胞) ---")
            
            # 准备DBSCAN数据
            coords = annotation_cells[['x', 'y']].values
            cell_indices = annotation_cells.index.values
            
            # 标准化坐标
            scaler = StandardScaler()
            coords_scaled = scaler.fit_transform(coords)
            
            # 应用DBSCAN聚类
            eps_value = 0.4
            min_samples = max(3, len(annotation_cells) // 10)
            dbscan = DBSCAN(eps=eps_value, min_samples=min_samples)
            cluster_labels = dbscan.fit_predict(coords_scaled)
            
            # 分析聚类结果
            n_clusters = len(set(cluster_labels)) - (1 if -1 in cluster_labels else 0)
            n_noise = list(cluster_labels).count(-1)
            
            print(f"  DBSCAN结果: {n_clusters} 个聚类, {n_noise} 个噪声点")
            
            # 记录每个聚类簇的信息
            for cluster_id in set(cluster_labels):
                if cluster_id == -1:  # 处理噪声点
                    continue
                    
                # 获取该簇的细胞
                cluster_mask = cluster_labels == cluster_id
                cluster_coords = coords[cluster_mask]
                cluster_cell_count = len(cluster_coords)
                
                if cluster_cell_count < 3:  # 跳过过小的簇
                    continue
                
                # 计算簇的重心
                cluster_centroid_x = cluster_coords[:, 0].mean()
                cluster_centroid_y = cluster_coords[:, 1].mean()
                
                # 计算到目标细胞的距离
                distance_to_target = np.sqrt((cluster_centroid_x - target_centroid_x)**2 + 
                                           (cluster_centroid_y - target_centroid_y)**2)
                
                # 计算簇的紧密度
                if cluster_cell_count > 1:
                    intra_distances = []
                    for i in range(len(cluster_coords)):
                        for j in range(i+1, len(cluster_coords)):
                            dist = np.sqrt(np.sum((cluster_coords[i] - cluster_coords[j])**2))
                            intra_distances.append(dist)
                    cluster_compactness = np.mean(intra_distances) if intra_distances else 0
                else:
                    cluster_compactness = 0
                
                # 记录这个簇的信息
                neighbor_stats.append({
                    'cell_type': annotation,
                    'cluster_id': f'cluster_{cluster_id}',
                    'cell_num': cluster_cell_count,
                    'x': round(cluster_centroid_x, 1),
                    'y': round(cluster_centroid_y, 1),
                    'distance_to_target': round(distance_to_target, 1),
                    'compactness': round(cluster_compactness, 2)
                })
                
                print(f"    簇 {cluster_id}: 重心({cluster_centroid_x:.1f}, {cluster_centroid_y:.1f}), "
                      f"{cluster_cell_count}个细胞, 距目标 {distance_to_target:.1f}, "
                      f"紧密度 {cluster_compactness:.2f}")
    
        # 创建DataFrame并保存
        neighbor_stats_df = pd.DataFrame(neighbor_stats)
        neighbor_stats_df = neighbor_stats_df.sort_values(['cell_type', 'cell_num'], ascending=[True, False])
        
        output_filename = os.path.join(output_dir, f'{target_cell_id}.csv')
        neighbor_stats_df.to_csv(output_filename, index=False)
        print(f"📄 邻居统计已保存: {output_filename}")
    
        return neighbor_stats_df
    
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
        send_stats = {}
        receive_stats = {}
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
                                if receiver_cell not in send_stats:
                                    send_stats[receiver_cell] = []
                                send_stats[receiver_cell].append(score)
                                
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
                                if sender not in receive_stats:
                                    receive_stats[sender] = []
                                receive_stats[sender].append(score)
                                
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
        
        # 计算统计数据
        send_summary = []
        receive_summary = []
        total_summary = []
        
        all_neighbors = set(send_stats.keys()) | set(receive_stats.keys())
        
        for neighbor in all_neighbors:
            # 发送统计
            send_scores = send_stats.get(neighbor, [])
            send_total = sum(send_scores)
            send_count = len(send_scores)
            send_avg = send_total / send_count if send_count > 0 else 0
            
            send_summary.append({
                '邻居细胞': neighbor,
                '通道数量': send_count,
                '总强度': send_total,
                '平均强度': send_avg,
                '最大强度': max(send_scores) if send_scores else 0,
                '最小强度': min(send_scores) if send_scores else 0
            })
            
            # 接收统计
            receive_scores = receive_stats.get(neighbor, [])
            receive_total = sum(receive_scores)
            receive_count = len(receive_scores)
            receive_avg = receive_total / receive_count if receive_count > 0 else 0
            
            receive_summary.append({
                '邻居细胞': neighbor,
                '通道数量': receive_count,
                '总强度': receive_total,
                '平均强度': receive_avg,
                '最大强度': max(receive_scores) if receive_scores else 0,
                '最小强度': min(receive_scores) if receive_scores else 0
            })
            
            # 总和统计
            total_intensity = send_total + receive_total
            total_count = send_count + receive_count
            total_avg = total_intensity / total_count if total_count > 0 else 0
            
            total_summary.append({
                '邻居细胞': neighbor,
                '发送通道数': send_count,
                '接收通道数': receive_count,
                '总通道数': total_count,
                '发送总强度': send_total,
                '接收总强度': receive_total,
                '通讯总强度': total_intensity,
                '发送平均强度': send_avg,
                '接收平均强度': receive_avg,
                '总平均强度': total_avg
            })
        
        # 转换为DataFrame并排序
        send_df = pd.DataFrame(send_summary).sort_values('总强度', ascending=False)
        receive_df = pd.DataFrame(receive_summary).sort_values('总强度', ascending=False)
        total_df = pd.DataFrame(total_summary).sort_values('通讯总强度', ascending=False)
        
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
        send_filename = os.path.join(output_dir, f"{target_cell_id}_as_Sent.csv")
        receive_filename = os.path.join(output_dir, f"{target_cell_id}_as_receive.csv")
        total_filename = os.path.join(output_dir, f"{target_cell_id}_total.csv")
        top10_filename = os.path.join(output_dir, f"{target_cell_id}_every_top_10.csv")
        
        try:
            send_df.to_csv(send_filename, index=False, encoding='utf-8-sig')
            receive_df.to_csv(receive_filename, index=False, encoding='utf-8-sig')
            total_df.to_csv(total_filename, index=False, encoding='utf-8-sig')
            
            # 保存每个邻居的前10个通道
            if not top10_channels_df.empty:
                top10_channels_df.to_csv(top10_filename, index=False, encoding='utf-8-sig')
                print(f"  每邻居前10通道: {top10_filename}")
            
            print(f"📊 CellPhoneDB分析完成:")
            print(f"  发送强度: {send_filename}")
            print(f"  接收强度: {receive_filename}")
            print(f"  总强度: {total_filename}")
            
        except Exception as e:
            print(f"❌ 保存CellPhoneDB结果时出错: {str(e)}")
    
    def process_all_cells(self):
        """处理所有细胞"""
        total_cells = len(self.embedding_names)
        print(f"🚀 开始处理 {total_cells} 个细胞...")
        
        processed_count = 0
        skipped_count = 0
        
        for idx, row in self.embedding_names.iterrows():
            cell_id = row['embedding_name']
            
            print(f"\n{'='*60}")
            print(f"处理进度: {idx+1}/{total_cells} - {cell_id}")
            print(f"{'='*60}")
            
            # 创建输出目录路径
            output_dir = os.path.join(self.output_base, cell_id)
            
            # 检查文件夹是否已存在
            if os.path.exists(output_dir):
                print(f"⏭️ {cell_id} 文件夹已存在，跳过处理")
                skipped_count += 1
                continue
            
            # 创建输出目录
            os.makedirs(output_dir, exist_ok=True)
            
            try:

                # 2. 分析邻居细胞
                print("🔍 分析邻居细胞...")
                self.analyze_neighbors(cell_id, output_dir)
                
                # 3. 分析CellPhoneDB通讯
                print("📞 分析细胞通讯...")
                self.analyze_cellphone_channels(cell_id, output_dir)
                
                print(f"✅ {cell_id} 处理完成!")
                processed_count += 1
                
            except Exception as e:
                print(f"❌ 处理 {cell_id} 时出错: {str(e)}")
                continue
        
        print(f"\n🎉 所有细胞处理完成!")
        print(f"📊 统计信息:")
        print(f"  - 总细胞数: {total_cells}")
        print(f"  - 新处理: {processed_count}")
        print(f"  - 已跳过: {skipped_count}")
        print(f"  - 结果保存在: {self.output_base}")

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