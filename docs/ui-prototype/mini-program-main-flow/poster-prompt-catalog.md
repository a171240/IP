# 门店海报 GPT-Image-2 提示词目录

来源口径：根据 `GPT-Image-2 专业提示词库 GitHub Top 10 整理.pdf` 的结构拆解，统一成小程序可渲染的门店海报模板。所有模板都按同一公式组织：

`任务类型 + 行业/主题 + 画面比例 + 主视觉 + 场景/道具 + 风格 + 版式 + 必须出现文字 + 中文准确规则 + 负面约束`

## 通用中文直出规则

所有中文必须清晰、准确、端正、可读；必须严格按照用户填写内容原样显示，不要自动改写，不要添加额外标语。主标题、项目名、价格、日期优先保证准确。

通用负面约束：不要二维码、电话、网址、平台名、水印、医疗承诺、前后对比、针头、恐怖皮肤图、乱码、错别字、廉价红黄促销风、信息过载。

## P01 项目/产品上新

适用：新项目、新仪器、新套盒、新产品集中推广。

字段：`brand_name, city_area, launch_title, product_name, core_benefit, launch_offer, date_range, service_rule, target_customer, product_tags`

提示词骨架：

```text
生成一张竖版 4:5 项目/产品上新商业海报。
行业/主题：皮肤管理门店新项目推广，适合朋友圈和客户群转发。
参考图使用规则：上传的项目/产品图作为唯一主视觉；门店环境图只作为柔和背景氛围参考；Logo/品牌字只作为品牌风格参考，不要喧宾夺主。
主视觉：产品/项目位于画面中心偏下，清晰、真实、高级，不被标签遮挡；门店空间可以进入画面右后方，形成真实到店感，不要只做纯棚拍。
场景道具：精华瓶、修护面膜、奶油色织物、水滴、柔和花材、暖光护理室；允许出现一张小氛围卡片，但卡片文字必须使用指定的 `mood_note`，不要随机生成。
风格：高端护肤商业摄影，奶白、香槟金、浅玫瑰色，干净克制，不像廉价促销传单。
版式：上方小品牌；上中部大标题；标题下方项目名和副标题；产品周围只放 3 个短标签；下方用精致价格牌突出首发权益；底部只放一行服务规则。
唯一允许出现的文字：
{brand_name}
{launch_title}
{product_name}
{core_benefit}
{tag_1}
{tag_2}
{tag_3}
{launch_offer}
{service_rule}
{mood_note}
中文规则：所有中文必须清晰、端正、准确，严格按上面字段原样显示；不要改写；不要添加英文、日文、随机品牌名或额外标语；主标题、项目名、价格优先保证可读。
负面约束：不要二维码、电话、网址、平台名、水印、医疗承诺、前后对比、针头、恐怖皮肤图、乱码、错别字、廉价红黄促销风、信息过载、随机小字。
```

实测推荐字段：

```text
brand_name = 椿舍皮肤管理
launch_title = 新品项目上线
product_name = 屏障修护管理
core_benefit = 敏感期也能安心护理
tag_1 = 温和修护
tag_2 = 稳定屏障
tag_3 = 舒缓维稳
launch_offer = 首发体验 199 起
service_rule = 先评估 · 再定方案
mood_note = 先了解，再护理，你的皮肤值得温柔对待
```

## P02 新客首单体验

适用：低门槛获客、团购封面、朋友圈首单活动。

字段：`brand_name, campaign_title, project_name, first_visit_benefit, offer, date_range, service_rule, target_customer`

提示词骨架：

```text
生成一张竖版 4:5 新客首单体验海报。主题为「{campaign_title}」，门店为「{brand_name}」。
画面为真实门店服务场景，干净明亮，突出第一次到店不会有压力的友好感。使用护理床、毛巾、精华瓶、咨询卡和柔和自然光。
版式：上方大标题，中间项目名，下方价格/权益，底部信任标签。
必须出现文字：{campaign_title}｜{first_visit_benefit}｜{project_name}｜{offer}｜{date_range}｜{service_rule}｜{brand_name}
```

## P03 本地探店/门店环境

适用：本地生活曝光、朋友圈转发、门店环境展示。

字段：`brand_name, city_area, store_scene_title, store_type, recommendation, service_tags, visit_hint`

提示词骨架：

```text
生成一张竖版 3:4 本地探店海报。城市商圈为「{city_area}」，店名为「{brand_name}」。
使用上传的门店实景图作为空间参考，突出门头、前台、产品陈列、休息区和真实到店氛围。
版式：顶部位置标签，中部强标题，底部服务标签。
必须出现文字：{city_area}｜{store_scene_title}｜{store_type}｜{service_tags}｜{visit_hint}｜{brand_name}
```

## P04 节日祝福

适用：端午、中秋、春节、女神节、七夕、520、客户群问候。

字段：`brand_name, festival_name, blessing_title, blessing_subtitle, seasonal_visual, signature`

提示词骨架：

```text
生成一张竖版 4:5 节日祝福海报。节日为「{festival_name}」，门店为「{brand_name}」。
画面温暖克制，不强推项目。根据节日使用应景道具，例如粽子、竹叶、茶、花、礼盒、护肤品和柔和门店氛围。
版式：大祝福标题、短副标题、底部门店署名。
必须出现文字：{blessing_title}｜{blessing_subtitle}｜{festival_name}｜{brand_name}
```

## P05 避坑/攻略封面

适用：小红书封面、知识型引流、顾客教育。

字段：`brand_name, guide_title, guide_subtitle, point_1, point_2, point_3, bottom_note`

提示词骨架：

```text
生成一张竖版 4:5 避坑/攻略知识封面。主题为「{guide_title}」。
画面为咨询桌、检查清单、护肤品和纸张质感，强标题，信息清楚，适合收藏。
版式：顶部大标题，中部 3 个重点标签，底部一句温和提醒。
必须出现文字：{guide_title}｜{guide_subtitle}｜{point_1}｜{point_2}｜{point_3}｜{brand_name}
```

## P06 项目菜单/价目表

适用：门店电子屏、朋友圈服务菜单、客户咨询时发送。

字段：`brand_name, menu_title, item_1, item_2, item_3, item_4, bottom_note`

提示词骨架：

```text
生成一张竖版 4:5 项目菜单/价目表海报。门店为「{brand_name}」。
画面像高端服务菜单，不是廉价价目表。使用米白纸张质感、细线图标、护肤产品小道具和整齐分组。
版式：顶部品牌名，中部项目菜单，四个项目卡片，底部温和提示。
必须出现文字：{menu_title}｜{brand_name}｜{item_1}｜{item_2}｜{item_3}｜{item_4}｜{bottom_note}
```

## 后续可扩展类型

`P07 品牌形象海报`、`P08 会员招募`、`P09 开业宣传`、`P10 爆款套餐转化`、`P11 科普信息图`、`P12 门店电子屏横版`。
