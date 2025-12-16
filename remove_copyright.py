#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量删除提示词文件中的版权声明
删除从 ```copyright 到 ``` 的整个代码块
"""

import os
import re
import glob

def remove_copyright_block(content):
    """删除版权声明代码块"""
    # 使用正则表达式删除 ```copyright 到 ``` 的整个块
    pattern = r'```copyright\n.*?```\n*'
    cleaned = re.sub(pattern, '', content, flags=re.DOTALL)

    # 删除可能的多余空行（最多保留一个空行）
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)

    return cleaned

def process_file(filepath):
    """处理单个文件"""
    try:
        # 读取文件
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # 检查是否包含版权声明
        if '```copyright' not in content:
            return False

        # 删除版权声明
        cleaned_content = remove_copyright_block(content)

        # 写回文件
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(cleaned_content)

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

    # 查找所有 .md 文件（包括子目录）
    md_files = glob.glob(os.path.join(prompts_dir, "**", "*.md"), recursive=True)

    print(f"Found {len(md_files)} Markdown files")
    print("=" * 50)

    processed_count = 0
    for filepath in md_files:
        if process_file(filepath):
            processed_count += 1

    print("=" * 50)
    print(f"Done! Processed {processed_count} files.")

if __name__ == '__main__':
    main()
