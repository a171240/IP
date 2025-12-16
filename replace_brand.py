#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量替换提示词文件中的品牌名称和记者名称
- 将 "星盒" 替换为 "IP内容工厂"
- 将 "记者Aim（艾米）" 替换为 "小艾"
- 将 "记者Aim" 替换为 "小艾"
"""

import os
import glob

def replace_brand_names(content):
    """替换品牌名称和记者名称"""
    replacements = [
        ("星盒", "IP内容工厂"),
        ("记者Aim（艾米）", "小艾"),
        ("记者Aim", "小艾"),
    ]

    for old, new in replacements:
        content = content.replace(old, new)

    return content

def process_file(filepath):
    """处理单个文件"""
    try:
        # 读取文件
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # 检查是否包含需要替换的内容
        has_changes = any(old in content for old, _ in [
            ("星盒", "IP内容工厂"),
            ("记者Aim（艾米）", "小艾"),
            ("记者Aim", "小艾"),
        ])

        if not has_changes:
            return False

        # 执行替换
        new_content = replace_brand_names(content)

        # 写回文件
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

        print(f"[OK] {os.path.basename(filepath)}")
        return True

    except Exception as e:
        print(f"[FAIL] {os.path.basename(filepath)} - {str(e)}")
        return False

def main():
    # 提示词目录路径
    prompts_dir = r"d:\IP网站\IP-main\提示词"

    if not os.path.exists(prompts_dir):
        print(f"Error: Directory not found - {prompts_dir}")
        return

    # 查找所有 .md 文件
    md_files = glob.glob(os.path.join(prompts_dir, "*.md"))

    # 也处理子目录
    sub_dirs = [
        "IP行业分析工作台",
        "Ai挖词工具"
    ]
    for sub_dir in sub_dirs:
        sub_path = os.path.join(prompts_dir, sub_dir)
        if os.path.exists(sub_path):
            md_files.extend(glob.glob(os.path.join(sub_path, "*.*")))

    print(f"Found {len(md_files)} files")
    print("=" * 50)

    processed_count = 0
    for filepath in md_files:
        if process_file(filepath):
            processed_count += 1

    print("=" * 50)
    print(f"Done! Processed {processed_count} files.")

if __name__ == '__main__':
    main()
