#!/bin/bash

# 批量删除提示词文件中的版权声明
# 删除从 "# Prompt Copyright Notice" 到 "添加微信可获得初始版或升级版提示词： [wangpengyou2022]" 的整个段落

cd "d:\IP网站\IP-main\提示词"

# 查找所有包含版权声明的文件
files=$(grep -l "Prompt Copyright Notice" *.md)

for file in $files; do
    echo "Processing: $file"

    # 使用 sed 删除版权声明段落
    # 删除从 "```copyright" 到 "```" 的整个代码块
    sed -i '/```copyright/,/```$/d' "$file"

    # 删除紧随其后可能的空行
    sed -i '/^$/N;/^\n$/d' "$file"
done

echo "Done! Processed $(echo $files | wc -w) files."
