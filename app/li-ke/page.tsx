import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Check,
  ClipboardCheck,
  ExternalLink,
  MapPin,
  MessageCircle,
  Target,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react"

const LINKS = {
  post1: "https://scys.com/articleDetail/xq_topic/14588128422212882",
  post2: "https://scys.com/articleDetail/xq_topic/1524481581154282",
}

const pageVars = {
  "--foreground": "#14120f",
  "--foreground-secondary": "#28241d",
  "--foreground-muted": "#635d52",
  "--background": "#f6f1e7",
  "--border": "rgba(20,18,15,0.16)",
} as CSSProperties

const contact = {
  wechat: "like171240",
  note: "添加时备注：门店诊断 / AI 获客 / 合作",
}

const stats = [
  { label: "美业一线经营", value: "10+ 年" },
  { label: "经营/参与门店", value: "3 家" },
  { label: "服务/代运营门店", value: "几十家" },
  { label: "当前方向", value: "AI × 实体店" },
]

const painPoints = [
  "每天都知道要发内容，但不知道从真实客户需求里拆什么选题。",
  "试过 AI 写文案，结果空、假、模板化，不像自己的门店。",
  "门店有项目、案例和反馈，却没有沉淀成可复用的内容资产。",
  "老板懂业务，员工不会表达、不会拍、不会讲、不会转化。",
  "平台流量越来越贵，需要一套低成本、能复盘、能复制的获客方法。",
]

const method = [
  {
    title: "搜索找需求",
    desc: "先看用户主动搜索什么，而不是老板想宣传什么。",
  },
  {
    title: "评论找人话",
    desc: "从真实好评、差评、顾虑里提炼客户语言。",
  },
  {
    title: "场景装情绪",
    desc: "把项目卖点放进具体的人、具体时刻、具体痛点里。",
  },
  {
    title: "内容做转译",
    desc: "把门店经验转成标题、选题、脚本、话术和成交理由。",
  },
  {
    title: "AI 做放大",
    desc: "用工具提升效率，但不把业务判断交给工具。",
  },
]

const services: Array<{
  icon: LucideIcon
  tag: string
  title: string
  desc: string
  output: string
}> = [
  {
    icon: Target,
    tag: "01 / 诊断",
    title: "实体店 AI 获客诊断",
    desc: "从项目结构、客群画像、点评评论、小红书内容、团购承接和到店转化链路入手，找到门店线上获客卡点。",
    output: "问题清单 / 优先级 / 30 天执行建议",
  },
  {
    icon: Workflow,
    tag: "02 / 系统",
    title: "AI 内容系统搭建",
    desc: "把真实评论、客户痛点、搜索词和门店案例，整理成可持续生产标题、选题、脚本、话术的工作流。",
    output: "选题库 / 脚本模板 / 员工执行 SOP",
  },
  {
    icon: Bot,
    tag: "03 / 工具",
    title: "IP内容工厂能力共创",
    desc: "面向实体店、本地生活商家和代运营团队，把内容生产、客户洞察、获客 Skill 做成可复用工具能力。",
    output: "工具场景 / 产品反馈 / 可复用模板",
  },
]

const deliverables = [
  { label: "真实评论", value: "客户语言库" },
  { label: "搜索词", value: "需求地图" },
  { label: "门店案例", value: "内容资产" },
  { label: "员工执行", value: "话术 SOP" },
]

const evidencePanels = [
  {
    label: "01",
    title: "真实信号",
    desc: "先把门店里已经存在的客户语言找出来，而不是凭空编文案。",
    items: ["点评好评", "差评顾虑", "搜索关键词", "私信问题"],
  },
  {
    label: "02",
    title: "内容转译",
    desc: "把老板脑子里的业务经验，转成平台能识别、客户能听懂的表达。",
    items: ["标题选题", "脚本结构", "案例包装", "成交话术"],
  },
  {
    label: "03",
    title: "执行闭环",
    desc: "让员工每天知道发什么、怎么拍、怎么接咨询、怎么复盘。",
    items: ["发布节奏", "员工 SOP", "咨询承接", "复盘迭代"],
  },
]

const proofPosts = [
  {
    label: "实践记录 01",
    meta: "真实评论 / 获客内容 / 拓客 Skill",
    href: LINKS.post1,
    title: "实体店如何用 AI 获客？以美容院为例，用 1 万条真实评论沉淀获客内容。",
    desc: "从真实客户评论中提炼痛点、需求、顾虑和成交理由，再把这些信息沉淀成可重复使用的 AI 获客能力。",
  },
  {
    label: "实践记录 02",
    meta: "低代码 / 小程序 / 门店赋能",
    href: LINKS.post2,
    title: "实体商家不写一行代码，如何搭建 AI 小程序赋能门店。",
    desc: "实体店老板如何用低代码、AI 工具、小程序等方式，搭建更适合自己门店的数字化工具，而不是被动依赖平台流量。",
  },
]

const goodFor = [
  "美业、养生、轻医美、本地生活等实体店老板",
  "小红书、抖音、大众点评等本地生活运营团队",
  "有门店资源、区域商家资源、社群资源的合作伙伴",
  "正在做 AI 产品、Agent、SaaS、工具站的产品和技术伙伴",
]

const notFor = [
  "只想听 AI 趋势，不愿意拿真实业务测试的人",
  "期待一个工具立刻解决所有经营问题的人",
  "没有门店、没有项目、没有客户场景，只想空聊概念的人",
]

const topics = [
  "美容院如何做小红书 / 点评获客",
  "实体店如何用 AI 生产内容",
  "如何把真实评论变成选题和脚本",
  "IP内容工厂如何承接门店内容生产",
  "AI + 美业是否值得长期下注",
]

export const metadata: Metadata = {
  title: "李可｜美业实体店 AI 获客实践者",
  description:
    "李可的个人介绍页：美业一线经营经验，专注实体店 AI 内容生产、客户洞察、门店获客和成交转化。",
  openGraph: {
    title: "李可｜美业实体店 AI 获客实践者",
    description: "把 AI 从新鲜工具，变成实体店真正能用的获客系统。",
    type: "profile",
  },
}

export default function LiKePersonalPage() {
  return (
    <main
      style={pageVars}
      className="min-h-screen overflow-x-hidden bg-[#f6f1e7] text-[#14120f] selection:bg-[#984714]/20 selection:text-[#14120f]"
    >
      <header className="sticky top-0 z-40 border-b border-[#14120f]/10 bg-[#f6f1e7]/94 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="#top" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#14120f] text-sm font-semibold text-white">
              李
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-none text-[#14120f]">李可</span>
              <span className="mt-1 block truncate text-xs text-[#635d52]">苏州 · 美业 AI 落地实践者</span>
            </span>
          </Link>

          <div className="hidden items-center gap-7 text-sm text-[#635d52] md:flex">
            <Link href="#method" className="transition hover:text-[#14120f]">
              方法
            </Link>
            <Link href="#proof" className="transition hover:text-[#14120f]">
              实践
            </Link>
            <Link href="#contact" className="transition hover:text-[#14120f]">
              联系
            </Link>
          </div>

          <Link
            href="#contact"
            className="hidden min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#14120f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#244d46] focus:outline-none focus:ring-2 focus:ring-[#244d46]/25 sm:inline-flex"
          >
            预约诊断
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <section id="top" className="relative overflow-hidden border-b border-[#14120f]/12">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(36,77,70,0.07)_1px,transparent_1px),linear-gradient(180deg,rgba(20,18,15,0.055)_1px,transparent_1px)] bg-[size:6rem_6rem] opacity-50"
        />
        <div
          aria-hidden="true"
          className="absolute right-[7%] top-24 -z-10 h-[28rem] w-28 rotate-6 bg-[linear-gradient(180deg,rgba(226,163,93,0.28),rgba(36,77,70,0.12))]"
        />
        <div
          aria-hidden="true"
          className="absolute left-[6%] top-40 -z-10 h-28 w-28 border border-[#244d46]/18"
        />

        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 md:grid-cols-[minmax(0,1fr)_minmax(23rem,31rem)] md:px-8 md:py-20 lg:gap-18 lg:py-24">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg border border-[#244d46]/20 bg-[#244d46]/10 px-3 py-2 text-sm font-semibold text-[#244d46]">
                <MapPin className="h-4 w-4" />
                苏州 · 美业一线经营
              </span>
              <span className="inline-flex rounded-lg border border-[#14120f]/12 bg-white/55 px-3 py-2 text-sm font-semibold text-[#635d52]">
                AI 获客系统实践者
              </span>
            </div>

            <h1 className="mt-10 max-w-5xl text-[4.25rem] font-semibold leading-[0.92] sm:text-[6rem] md:text-[7.5rem] lg:text-[8.75rem]">
              李可
            </h1>
            <p className="mt-8 max-w-4xl text-[2rem] font-semibold leading-tight sm:text-5xl md:text-[4.25rem]">
              把门店经验，翻译成 AI 能放大的获客系统。
            </p>
            <p className="mt-7 max-w-2xl text-lg leading-9 text-[#4e4940]">
              我在苏州深耕美业 10 多年，亲自经营美容院，也参与过多家门店的线上运营和获客实践。现在专注一件事：帮助实体店老板用 AI 做内容生产、客户洞察、门店获客和成交转化。
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#contact"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#14120f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#244d46] focus:outline-none focus:ring-2 focus:ring-[#244d46]/25"
              >
                带门店问题来聊
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#proof"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#14120f]/14 bg-white/60 px-6 py-3 text-sm font-semibold text-[#14120f] transition hover:bg-white"
              >
                看实践记录
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <aside className="relative self-center md:self-end">
            <div
              aria-hidden="true"
              className="absolute -left-5 top-8 hidden h-28 w-28 border border-[#984714]/24 md:block"
            />
            <div
              aria-hidden="true"
              className="absolute -right-4 bottom-20 hidden h-40 w-14 bg-[#244d46]/16 md:block"
            />

            <div className="relative overflow-hidden rounded-xl border border-[#14120f]/14 bg-[#14120f] text-white shadow-[0_28px_90px_rgba(20,18,15,0.22)]">
              <div className="relative min-h-[30rem] overflow-hidden sm:min-h-[35rem] md:min-h-[38rem]">
                <Image
                  src="/li-ke-profile.png"
                  alt="李可个人照片"
                  fill
                  priority
                  sizes="(min-width: 1024px) 31rem, (min-width: 768px) 23rem, 100vw"
                  className="object-cover object-[50%_38%]"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,18,15,0)_34%,rgba(20,18,15,0.38)_66%,rgba(20,18,15,0.92)_100%)]" />
                <div
                  aria-hidden="true"
                  className="absolute left-5 top-5 h-16 w-16 border-l border-t border-white/42"
                />
                <div
                  aria-hidden="true"
                  className="absolute bottom-5 right-5 h-16 w-16 border-b border-r border-white/42"
                />

                <div className="absolute bottom-5 left-5 right-5 rounded-lg border border-white/14 bg-[#14120f]/84 p-5 shadow-2xl shadow-black/20 backdrop-blur-md">
                  <p className="text-sm font-semibold text-[#e2a35d]">我的判断</p>
                  <p className="mt-3 text-2xl font-semibold leading-tight text-white">
                    AI 不是神药，AI 是放大器。
                  </p>
                  <p className="mt-4 leading-7 text-white/74">
                    我做的不是“让 AI 多写几篇文案”，而是把客户需求、门店经验和成交路径整理成可执行系统。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10">
                {stats.map((item) => (
                  <div key={item.label} className="bg-[#14120f] p-4">
                    <p className="text-2xl font-semibold text-white">{item.value}</p>
                    <p className="mt-1 text-xs leading-5 text-white/56">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-18 md:grid-cols-[0.82fr_1.18fr] md:px-8 md:py-24">
        <div className="md:sticky md:top-28 md:self-start">
          <p className="text-sm font-semibold text-[#984714]">真实问题</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight md:text-5xl">
            实体店不是缺工具，是缺一套能跑起来的获客系统。
          </h2>
          <p className="mt-6 text-lg leading-8 text-[#5b554b]">
            很多老板已经试过 AI，但大多停留在“让 AI 写几篇文案”。真正的问题在前面：有没有找到真实需求、真实人群、真实场景和可复用的转化路径。
          </p>
        </div>

        <div className="divide-y divide-[#14120f]/12 rounded-lg border border-[#14120f]/12 bg-white/64">
          {painPoints.map((item, index) => (
            <div key={item} className="grid grid-cols-[3.25rem_1fr] md:grid-cols-[4.5rem_1fr]">
              <div className="flex items-center justify-center border-r border-[#14120f]/12 text-sm font-semibold text-[#984714]">
                0{index + 1}
              </div>
              <p className="p-5 text-base leading-8 text-[#28241d] md:p-6 md:text-lg">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-[#14120f]/12 bg-[#191510] text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(247,241,230,0.045)_1px,transparent_1px),linear-gradient(180deg,rgba(247,241,230,0.04)_1px,transparent_1px)] bg-[size:5rem_5rem]"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-28 w-full bg-[linear-gradient(180deg,transparent,rgba(226,163,93,0.08))]"
        />

        <div className="relative mx-auto max-w-7xl px-5 py-18 md:px-8 md:py-24">
          <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-end">
            <div>
              <p className="text-sm font-semibold text-[#e2a35d]">我的工作方式</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight text-white md:text-5xl">
                把真实评论、搜索需求和门店经验，变成可执行的获客内容。
              </h2>
            </div>
            <p className="text-lg leading-8 text-white/66">
              我通常从点评评论、搜索词、咨询记录和门店案例入手，先判断客户为什么想买、为什么犹豫，再转成标题、脚本、话术和员工 SOP。
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-xl border border-white/12 bg-[#f8f2e8] p-6 text-[#14120f] md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#14120f]/10 pb-6">
                <div>
                  <p className="text-sm font-semibold text-[#984714]">拆解示例</p>
                  <h3 className="mt-2 text-3xl font-semibold leading-tight">从一句客户顾虑，拆出选题、脚本和承接话术</h3>
                </div>
                <div className="rounded-lg bg-[#14120f] px-4 py-3 text-sm font-semibold text-white">可复盘 / 可执行</div>
              </div>

              <div className="mt-7 grid gap-4 md:grid-cols-[0.92fr_1.08fr]">
                <div className="rounded-lg border border-[#14120f]/12 bg-white p-5">
                  <p className="text-sm font-semibold text-[#244d46]">客户原话</p>
                  <p className="mt-4 text-2xl font-semibold leading-snug">
                    “怕做完没效果，也怕被一直推项目。”
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {["效果顾虑", "信任门槛", "推销压力"].map((item) => (
                      <span key={item} className="rounded-md bg-[#244d46]/10 px-3 py-1.5 text-sm font-semibold text-[#244d46]">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  {[
                    ["选题", "第一次做美容项目，最应该先问清楚的 3 件事"],
                    ["脚本", "先承认顾虑，再讲判断标准，最后给到店理由"],
                    ["承接", "私信不急着报价，先问肤况、预算、做过什么项目"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[#14120f]/10 bg-[#f2eadc] p-4">
                      <p className="text-xs font-semibold text-[#984714]">{label}</p>
                      <p className="mt-2 text-lg font-semibold leading-snug">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {evidencePanels.map((item) => (
                <EvidencePanel key={item.label} item={item} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="method" className="bg-[#14120f] text-white">
        <div className="mx-auto max-w-7xl px-5 py-18 md:px-8 md:py-24">
          <div className="grid gap-10 md:grid-cols-[0.78fr_1.22fr]">
            <div>
              <p className="text-sm font-semibold text-[#e2a35d]">方法论</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight text-white md:text-5xl">
                内容不是卖产品，而是捕捉购买动机。
              </h2>
              <p className="mt-6 text-lg leading-8 text-white/68">
                我不会先问“这个项目怎么宣传”。我会先问：谁会在什么情况下突然想买这个服务？她搜索什么？她担心什么？她看完什么内容才会愿意到店？
              </p>
            </div>

            <div className="grid gap-3">
              {method.map((item, index) => (
                <div key={item.title} className="grid grid-cols-[3.5rem_1fr] rounded-lg border border-white/12 bg-white/[0.055]">
                  <div className="flex items-center justify-center border-r border-white/12 text-sm font-semibold text-[#e2a35d]">
                    {index + 1}
                  </div>
                  <div className="p-5">
                    <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 leading-7 text-white/68">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#14120f]/12 bg-[#efe7d8]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-18 md:px-8 md:py-24 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-lg bg-[#14120f] p-6 text-white md:p-8 lg:sticky lg:top-28 lg:self-start">
            <p className="text-sm font-semibold text-[#e2a35d]">交付方式</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white md:text-5xl">
              交付不是一份 PPT，而是一套每天能跑的门店工作流。
            </h2>
            <p className="mt-6 leading-8 text-white/68">
              我会把门店里本来散落的评论、项目、客户顾虑、员工经验，整理成老板能复盘、员工能执行、AI 能持续放大的内容系统。
            </p>
            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
              {deliverables.map((item) => (
                <div key={item.label} className="bg-[#14120f] p-4">
                  <p className="text-xs font-semibold text-[#e2a35d]">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            {services.map((item) => {
              const Icon = item.icon

              return (
                <article
                  key={item.title}
                  className="grid gap-5 rounded-lg border border-[#14120f]/12 bg-[#f9f6ef] p-6 md:grid-cols-[9rem_1fr] md:p-7"
                >
                  <div className="flex items-center justify-between gap-4 md:block">
                    <span className="text-sm font-semibold text-[#984714]">{item.tag}</span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#244d46]/10 text-[#244d46] md:mt-6">
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold leading-tight md:text-3xl">{item.title}</h3>
                    <p className="mt-4 leading-8 text-[#5b554b]">{item.desc}</p>
                    <div className="mt-6 rounded-lg border border-[#14120f]/10 bg-white/55 p-4 text-sm font-semibold text-[#28241d]">
                      输出：{item.output}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="proof" className="mx-auto grid max-w-7xl gap-10 px-5 py-18 md:grid-cols-[0.76fr_1.24fr] md:px-8 md:py-24">
        <div>
          <p className="text-sm font-semibold text-[#984714]">实践验证</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight md:text-5xl">
            两篇可以验证我思考路径的实践内容。
          </h2>
          <p className="mt-6 text-lg leading-8 text-[#5b554b]">
            不是 AI 概念分享，而是从真实门店评论、内容生产、小程序工具和获客 Skill 出发的实践记录。
          </p>
        </div>

        <div className="divide-y divide-[#14120f]/12 rounded-lg border border-[#14120f]/12 bg-white/64">
          {proofPosts.map((post) => (
            <a
              key={post.href}
              href={post.href}
              target="_blank"
              rel="noreferrer"
              className="group block p-6 transition hover:bg-white md:p-8"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-[#14120f] px-3 py-1.5 text-xs font-semibold text-white">
                  {post.label}
                </span>
                <span className="text-sm text-[#70695d]">{post.meta}</span>
              </div>
              <h3 className="mt-5 text-2xl font-semibold leading-snug text-[#14120f] transition group-hover:text-[#244d46] md:text-3xl">
                {post.title}
              </h3>
              <p className="mt-4 leading-8 text-[#5b554b]">{post.desc}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#984714]">
                查看文章
                <ExternalLink className="h-4 w-4" />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="border-y border-[#14120f]/12 bg-[#f9f6ef]">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-18 md:grid-cols-2 md:px-8 md:py-24">
          <AudiencePanel
            icon={Users}
            title="适合找我聊的人"
            items={goodFor}
            tone="positive"
          />
          <AudiencePanel
            icon={X}
            title="不适合找我聊的人"
            items={notFor}
            tone="negative"
          />
        </div>
      </section>

      <section id="contact" className="px-5 py-18 md:px-8 md:py-24">
        <div className="mx-auto grid max-w-7xl overflow-hidden rounded-lg bg-[#14120f] text-white md:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 md:p-10 lg:p-12">
            <p className="text-sm font-semibold text-[#e2a35d]">联系我</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white md:text-5xl">
              带着真实门店问题来聊，越具体，越有价值。
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-white/68">
              你可以带着门店项目、平台账号、点评评论、客户案例、内容卡点或工具想法来聊。我的判断标准很简单：什么内容能带来咨询，什么工具能提高效率，什么 AI 能降低老板的运营成本。
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="rounded-lg border border-white/12 bg-white/[0.06] p-5">
                <p className="text-sm text-white/50">微信</p>
                <p className="mt-2 break-all text-3xl font-semibold text-white">{contact.wechat}</p>
                <p className="mt-3 text-sm text-white/56">{contact.note}</p>
              </div>
              <a
                href="weixin://"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#14120f] transition hover:bg-[#e2a35d]"
              >
                打开微信
                <MessageCircle className="h-4 w-4" />
              </a>
            </div>
          </div>

          <aside className="border-t border-white/10 bg-white/[0.045] p-6 md:border-l md:border-t-0 md:p-10 lg:p-12">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-6 w-6 text-[#e2a35d]" />
              <h3 className="text-2xl font-semibold text-white">建议沟通主题</h3>
            </div>
            <div className="mt-6 grid gap-3">
              {topics.map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-white/[0.06] p-4 text-white/72">
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-[#14120f]/10 px-5 py-8 text-sm text-[#70695d] md:flex-row md:items-center md:justify-between md:px-8">
        <p>© 李可 · 美业 AI 落地实践者</p>
        <p>独立个人介绍页</p>
      </footer>
    </main>
  )
}

function AudiencePanel({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: LucideIcon
  title: string
  items: string[]
  tone: "positive" | "negative"
}) {
  const isPositive = tone === "positive"

  return (
    <div className={`rounded-lg border p-6 md:p-8 ${isPositive ? "border-[#244d46]/20 bg-white" : "border-[#14120f]/12 bg-[#14120f] text-white"}`}>
      <div className={`mb-6 flex h-11 w-11 items-center justify-center rounded-lg ${isPositive ? "bg-[#244d46]/10 text-[#244d46]" : "bg-white/10 text-white"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <h2 className={`text-3xl font-semibold ${isPositive ? "text-[#14120f]" : "text-white"}`}>{title}</h2>
      <div className="mt-6 grid gap-3">
        {items.map((item) => (
          <div
            key={item}
            className={`flex gap-3 rounded-lg border p-4 ${
              isPositive
                ? "border-[#14120f]/10 bg-[#f6f1e7] text-[#3c372f]"
                : "border-white/10 bg-white/[0.06] text-white/72"
            }`}
          >
            {isPositive ? (
              <Check className="mt-1 h-4 w-4 shrink-0 text-[#244d46]" />
            ) : (
              <X className="mt-1 h-4 w-4 shrink-0 text-[#e2a35d]" />
            )}
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EvidencePanel({ item }: { item: (typeof evidencePanels)[number] }) {
  return (
    <article className="rounded-xl border border-white/12 bg-white/[0.055] p-5">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e2a35d] text-sm font-semibold text-[#14120f]">
          {item.label}
        </span>
        <div>
          <h3 className="text-2xl font-semibold leading-tight text-white">{item.title}</h3>
          <p className="mt-2 leading-7 text-white/64">{item.desc}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {item.items.map((tag) => (
          <span key={tag} className="rounded-lg border border-white/10 bg-[#14120f] px-3 py-2 text-sm font-semibold text-white/76">
            {tag}
          </span>
        ))}
      </div>
    </article>
  )
}
