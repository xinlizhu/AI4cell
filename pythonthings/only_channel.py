import pandas as pd
import os
import warnings
warnings.filterwarnings('ignore')

level = 4

class ChannelAnalyzer:
    def __init__(self, base_path="F:/allCellChat_level4_withKJ/", 
                 output_base="F:/3version_L4/js/components/pathSelection/Every_cell_info_withKJL4"):
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
        
        print(f"📊 数据加载完成，包含 {len(self.merged_df)} 个细胞")

    def analyze_cellphone_channels(self, target_cell_id, output_dir):
        """分析CellPhoneDB通讯通道 - 只输出前100个通道"""
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
        
        # 生成每个邻居细胞与目标细胞的前100个通道详细信息
        all_channels = []
        
        for neighbor, channels in neighbor_channels.items():
            # 目标细胞发送给该邻居的前100个通道
            send_channels = sorted(channels['send'], key=lambda x: x['强度'], reverse=True)[:100]
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
            
            # 目标细胞接收该邻居的前100个通道
            receive_channels = sorted(channels['receive'], key=lambda x: x['强度'], reverse=True)[:100]
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
        top100_channels_df = pd.DataFrame(all_channels)
        if not top100_channels_df.empty:
            # 重新排序：先按邻居细胞，再按方向，最后按强度
            top100_channels_df = top100_channels_df.sort_values(
                ['邻居细胞', '方向', '强度'], 
                ascending=[True, True, False]
            ).reset_index(drop=True)
        
        # 保存前100通道文件
        top100_filename = os.path.join(output_dir, f"{target_cell_id}_every_top_100.csv")
        
        try:
            if not top100_channels_df.empty:
                top100_channels_df.to_csv(top100_filename, index=False, encoding='utf-8-sig')
                print(f"📊 每邻居前100通道已保存: {top100_filename}")
            else:
                print(f"⚠️ 没有找到有效的通道数据: {target_cell_id}")
            
        except Exception as e:
            print(f"❌ 保存文件时出错: {str(e)}")
    
    def process_all_cells(self):
        """处理所有细胞"""
        total_cells = len(self.embedding_names)
        print(f"🚀 开始处理 {total_cells} 个细胞...")
        
        processed_count = 0
        
        for idx, row in self.embedding_names.iterrows():
            cell_id = row['embedding_name']
            
            print(f"\n{'='*60}")
            print(f"处理进度: {idx+1}/{total_cells} - {cell_id}")
            print(f"{'='*60}")
            
            # 创建输出目录路径
            output_dir = os.path.join(self.output_base, cell_id)
            
            # 创建输出目录
            os.makedirs(output_dir, exist_ok=True)
            
            try:
                # 分析CellPhoneDB通讯 - 输出前100个通道
                print("📞 分析细胞通讯通道...")
                self.analyze_cellphone_channels(cell_id, output_dir)
                
                print(f"✅ {cell_id} 处理完成!")
                processed_count += 1
                
            except Exception as e:
                print(f"❌ 处理 {cell_id} 时出错: {str(e)}")
                continue
        
        print(f"\n🎉 所有细胞处理完成!")
        print(f"📊 统计信息:")
        print(f"  - 总细胞数: {total_cells}")
        print(f"  - 处理完成: {processed_count}")
        print(f"  - 结果保存在: {self.output_base}")

def main():
    """主函数"""
    print("=" * 80)
    print("细胞通道分析系统启动 (仅输出前100通道)")
    print("=" * 80)
    
    # 创建分析器
    analyzer = ChannelAnalyzer()
    
    # 处理所有细胞
    analyzer.process_all_cells()

if __name__ == "__main__":
    main()
