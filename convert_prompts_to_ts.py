#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 Markdown 提示词文件转换为 TypeScript 模块
"""

import os
import re

def md_to_ts(md_filepath, ts_filepath, export_name, description):
    """将 Markdown 文件转换为 TypeScript 模块"""
    with open(md_filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 移除可能残留的版权声明
    content = re.sub(r'```copyright\n.*?```\n*', '', content, flags=re.DOTALL)

    # 移除多余空行
    content = re.sub(r'\n{3,}', '\n\n', content)

    # 移除开头和结尾的空行
    content = content.strip()

    # 转义反引号
    content = content.replace('`', '\\`')

    # 转义 ${
    content = content.replace('${', '\\${')

    # 生成 TypeScript 内容
    ts_content = f'''// {description}
export const {export_name} = `{content}`
'''

    # 写入文件
    with open(ts_filepath, 'w', encoding='utf-8') as f:
        f.write(ts_content)

    print(f"[OK] Created {ts_filepath}")

def main():
    base_dir = r"d:\IP网站\IP-main"
    prompts_dir = os.path.join(base_dir, "提示词")
    lib_prompts = os.path.join(base_dir, "lib", "prompts")

    # 配置：源文件 -> 目标文件
    conversions = [
        {
            "source": os.path.join(prompts_dir, "IP行业分析工作台", "P1.md"),
            "target": os.path.join(lib_prompts, "research", "p1-industry.ts"),
            "export_name": "p1IndustryPrompt",
            "description": "P1: 行业目标分析师提示词"
        },
        {
            "source": os.path.join(prompts_dir, "IP行业分析工作台", "P2.md"),
            "target": os.path.join(lib_prompts, "research", "p2-cognition.ts"),
            "export_name": "p2CognitionPrompt",
            "description": "P2: 行业认知深度分析助手提示词"
        },
        {
            "source": os.path.join(prompts_dir, "IP行业分析工作台", "P3.md"),
            "target": os.path.join(lib_prompts, "research", "p3-emotion.ts"),
            "export_name": "p3EmotionPrompt",
            "description": "P3: 情绪价值分析专家提示词"
        },
        {
            "source": os.path.join(prompts_dir, "IP传记采访机器人v1.3（情绪深挖版）.md"),
            "target": os.path.join(lib_prompts, "research", "ip-biography.ts"),
            "export_name": "ipBiographyPrompt",
            "description": "IP传记: 记者型操盘手提示词"
        },
    ]

    print("=" * 50)
    print("Converting Markdown prompts to TypeScript modules")
    print("=" * 50)

    for conv in conversions:
        if not os.path.exists(conv["source"]):
            print(f"[SKIP] Source not found: {conv['source']}")
            continue

        # 确保目标目录存在
        os.makedirs(os.path.dirname(conv["target"]), exist_ok=True)

        try:
            md_to_ts(
                conv["source"],
                conv["target"],
                conv["export_name"],
                conv["description"]
            )
        except Exception as e:
            print(f"[FAIL] {conv['source']}: {e}")

    print("=" * 50)
    print("Conversion complete!")

if __name__ == '__main__':
    main()
