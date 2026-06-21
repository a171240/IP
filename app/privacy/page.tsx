import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "美业话镜隐私政策",
  description: "美业话镜 APP 国内 production-cn 版本隐私政策。",
  robots: {
    index: false,
    follow: false,
  },
}

const sections = [
  {
    title: "一、适用范围",
    body: [
      "本政策适用于美业话镜 APP 国内 production-cn 版本及其配套后端服务。",
      "美业话镜面向美容门店经营场景，提供账号登录、门店与成员管理、服务记录、长录音整理、话术训练、顾客和项目资料管理等能力。",
    ],
  },
  {
    title: "二、我们可能处理的信息",
    body: [
      "账号与身份信息：包括微信开放平台授权标识、账号 ID、门店/公司/角色、成员邀请和权限状态。",
      "业务资料：包括门店资料、顾客档案、项目卡、场景卡、员工训练记录、服务记录、服务复盘和相关操作记录。",
      "录音与转写信息：当你主动使用服务记录长录音能力时，我们会处理音频片段、上传状态、转写文本、摘要和质检结果。",
      "设备与日志信息：包括设备标识、网络状态、请求日志、错误日志、版本号和安全审计信息，用于保障服务稳定和排查故障。",
    ],
  },
  {
    title: "三、使用目的",
    body: [
      "为你提供登录、权限判断、门店协作、服务记录整理、员工训练、内容生成和经营复盘等功能。",
      "保障账号安全、接口安全、服务稳定性和问题追踪。",
      "在你授权或业务必要范围内，调用语音识别、大模型总结、对象存储和微信开放平台等基础能力完成相应服务。",
    ],
  },
  {
    title: "四、第三方服务与云资源",
    body: [
      "国内正式版后端目标部署在阿里云中国内地资源，可能使用阿里云 OSS、百炼/通义、火山引擎语音、DeepSeek、微信开放平台等能力。",
      "当前 production-cn 桥接准备阶段仍需要运营者在正式上线前确认第三方服务清单、数据处理边界、跨境传输安排和用户告知内容。",
      "如新增第三方 SDK、跨境传输或敏感个人信息处理场景，我们将按适用法律法规完成告知、同意、备案或评估要求。",
    ],
  },
  {
    title: "五、存储与保护",
    body: [
      "我们会根据实现功能所必需的最小范围保存相关信息，并通过访问控制、最小权限、日志审计和传输加密等措施保护数据安全。",
      "服务记录音频、转写和复盘结果会根据门店业务需要保存；超过必要期限或你依法要求删除时，我们将按产品能力和法律要求处理。",
    ],
  },
  {
    title: "六、你的权利",
    body: [
      "你可以依法请求访问、更正、复制、删除个人信息，或撤回授权、注销账号、限制或拒绝部分处理。",
      "如你所在门店或公司是实际业务数据控制方，请先联系门店管理员；涉及平台账号和系统安全的问题可联系美业话镜运营方。",
    ],
  },
  {
    title: "七、未成年人保护",
    body: [
      "美业话镜面向美容门店经营和员工协作场景，不面向未成年人提供独立消费服务。",
      "如业务资料中涉及未成年人个人信息，应由门店和相关监护人依法取得必要授权，并避免录入非必要信息。",
    ],
  },
  {
    title: "八、联系我们",
    body: [
      "运营者：吴江区美之约网络科技工作室（个体工商户）。",
      "如需行使个人信息权利或反馈隐私问题，请通过 APP 内客服、门店管理员或运营者公开联系方式提交请求。",
    ],
  },
]

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-6 lg:py-16">
        <p className="text-sm font-medium text-zinc-500">美业话镜 APP 国内 production-cn</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-zinc-950">隐私政策</h1>
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
