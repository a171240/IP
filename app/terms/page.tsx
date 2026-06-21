import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "美业话镜用户协议",
  description: "美业话镜 APP 国内 production-cn 版本用户协议。",
  robots: {
    index: false,
    follow: false,
  },
}

const sections = [
  {
    title: "一、协议范围",
    body: [
      "本协议适用于美业话镜 APP 国内 production-cn 版本及其配套后端服务。",
      "你使用登录、门店协作、服务记录、长录音整理、话术训练、内容生成、顾客和项目资料管理等功能，即表示你已阅读并同意本协议。",
    ],
  },
  {
    title: "二、账号与权限",
    body: [
      "你应使用真实、合法、有效的账号信息，并妥善保管登录凭证。",
      "美业话镜按公司、门店、成员和角色授予功能权限。门店管理员应确保成员邀请、离职移除和权限调整及时准确。",
      "如发现账号被盗用、越权访问或异常操作，应立即通知运营者或门店管理员。",
    ],
  },
  {
    title: "三、服务记录与录音",
    body: [
      "你在使用服务记录、长录音、转写和复盘功能前，应确保已依法取得顾客、员工和相关人员的必要告知与授权。",
      "不得上传、录入或传播违法违规、侵犯他人权益、超出美容门店业务必要范围的音频、图片、文本或其他资料。",
      "服务记录输出、AI 总结和训练建议仅用于门店经营辅助，不替代医疗诊断、治疗建议、法律意见或其他专业结论。",
    ],
  },
  {
    title: "四、内容生成与使用边界",
    body: [
      "美业话镜可能基于门店资料、服务记录、顾客关注点和项目知识生成话术、复盘、内容草稿或经营建议。",
      "AI 生成内容可能存在不完整、不准确或不适合直接发布的情况。你应在使用、发布或对外发送前自行审核。",
      "你不得利用本服务生成或传播虚假宣传、违法广告、医疗功效承诺、侵权内容、骚扰信息或其他不当内容。",
    ],
  },
  {
    title: "五、费用与服务调整",
    body: [
      "第一版 APP 不包含 App 内购买、苹果 IAP、安卓支付 SDK 或数字功能的外部付款跳转解锁。",
      "如后续提供付费服务、服务包或权益展示，具体价格、有效期、使用限制和退款规则以运营者正式发布的规则为准。",
      "我们可能因产品迭代、安全维护、合规要求或云服务调整，对功能、接口或使用规则进行更新。",
    ],
  },
  {
    title: "六、数据与知识产权",
    body: [
      "你或你所在门店依法拥有其上传、录入或管理的业务资料相关权益，但应确保资料来源合法并已取得必要授权。",
      "美业话镜的产品界面、系统设计、软件代码、模型编排、模板和平台文档等由运营者或相关权利人依法享有权益。",
      "未经授权，不得反向工程、复制、出售、出租、转授权、绕过权限或以异常方式调用服务。",
    ],
  },
  {
    title: "七、责任限制",
    body: [
      "因你未取得必要授权、上传违法或侵权资料、越权使用账号、错误发布 AI 生成内容等产生的责任，由你或相应业务主体依法承担。",
      "因不可抗力、基础运营商故障、第三方云服务故障、网络攻击或依法监管要求导致服务中断或数据处理受限的，我们将尽力修复并降低影响。",
    ],
  },
  {
    title: "八、联系我们",
    body: [
      "运营者：吴江区美之约网络科技工作室（个体工商户）。",
      "如对本协议、账号权限、服务记录或数据处理有疑问，请通过 APP 内客服、门店管理员或运营者公开联系方式联系。",
    ],
  },
]

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-6 lg:py-16">
        <p className="text-sm font-medium text-zinc-500">美业话镜 APP 国内 production-cn</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-zinc-950">用户协议</h1>
        <div className="mt-4 space-y-1 text-sm text-zinc-600">
          <p>最近更新：2026-06-22</p>
          <p>生效日期：以首次正式上线公告为准</p>
          <p>版本说明：本页面为发布文本基础，正式上线前需由运营者复核确认，并与应用商店提交材料保持一致。</p>
        </div>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-zinc-950">{section.title}</h2>
              <div className="mt-3 space-y-3 text-base leading-7 text-zinc-700">
                {section.body.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
