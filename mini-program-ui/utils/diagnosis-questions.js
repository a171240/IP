const QUESTIONS = [
  {
    id: "q1",
    type: "single",
    question: "你的行业/赛道是？",
    description: "选择你主要从事的领域",
    isClassification: true,
    options: [
      { value: "food", label: "餐饮/食品" },
      { value: "beauty", label: "美业/美妆" },
      { value: "education", label: "教育/培训" },
      { value: "realestate", label: "房产/家居" },
      { value: "finance", label: "金融/保险" },
      { value: "ecommerce", label: "电商/零售" },
      { value: "knowledge", label: "知识付费/咨询" },
      { value: "tech", label: "科技/互联网" },
      { value: "health", label: "健康/医疗" },
      { value: "other", label: "其他行业" },
    ],
  },
  {
    id: "q2",
    type: "multiple",
    question: "你目前遇到的内容困境是？",
    description: "可多选，选择所有符合的情况",
    options: [
      { value: "no_position", label: "不知道怎么定位IP" },
      { value: "no_topic", label: "选题枯竭，不知道拍什么" },
      { value: "slow_script", label: "脚本写不出来/很耗时" },
      { value: "no_traffic", label: "内容没流量/数据差" },
      { value: "no_convert", label: "有流量但不变现" },
      { value: "low_efficiency", label: "团队执行效率低" },
    ],
  },
  {
    id: "q3",
    type: "single",
    question: "你现在的内容产出频率是？",
    options: [
      { value: "not_started", label: "还没开始做" },
      { value: "1-2_week", label: "每周1-2条" },
      { value: "3-5_week", label: "每周3-5条" },
      { value: "daily", label: "日更或以上" },
    ],
  },
  {
    id: "q4",
    type: "single",
    question: "你做IP内容的主要目标是？",
    options: [
      { value: "brand", label: "品牌曝光/知名度" },
      { value: "private", label: "私域引流/加微信" },
      { value: "sales", label: "直接卖货/成交" },
      { value: "influence", label: "建立行业影响力" },
    ],
  },
  {
    id: "q5",
    type: "single",
    question: "你或团队愿意出镜吗？",
    options: [
      { value: "experienced", label: "愿意，且有出镜经验" },
      { value: "willing", label: "愿意，但不知道怎么做" },
      { value: "unwilling", label: "不愿意出镜" },
      { value: "virtual", label: "可以接受虚拟形象" },
    ],
  },
  {
    id: "q6",
    type: "single",
    question: "你目前的内容团队规模？",
    options: [
      { value: "solo", label: "我一个人" },
      { value: "small", label: "2-3人小团队" },
      { value: "medium", label: "5人以上团队" },
      { value: "outsource", label: "外包/代运营" },
    ],
  },
  {
    id: "q7",
    type: "single",
    question: "你期望多久看到效果？",
    options: [
      { value: "1month", label: "1个月内" },
      { value: "3months", label: "3个月" },
      { value: "6months", label: "半年" },
      { value: "unclear", label: "没想清楚" },
    ],
  },
  {
    id: "q8",
    type: "single",
    question: "你最大的障碍是什么？",
    options: [
      { value: "no_execution", label: "执行力差/坚持不下去" },
      { value: "no_method", label: "没有方法论/不知道怎么做" },
      { value: "no_time", label: "没时间" },
      { value: "no_skill", label: "不会写/不会拍" },
      { value: "no_budget", label: "预算有限" },
    ],
  },
]

module.exports = { QUESTIONS }
