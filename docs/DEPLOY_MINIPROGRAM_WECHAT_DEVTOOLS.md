# 微信开发者工具：运行/预览/上传（mini-program-ui）

本项目小程序代码在：`mini-program-ui/`

你在微信开发者工具里做的事分三类：

1. 本地运行调试（编译 + 模拟器/真机）
2. 预览（生成预览二维码给测试）
3. 上传（提交一个版本到微信后台，再走审核/发布）

---

## 1) 导入项目

1. 打开微信开发者工具
2. 选择「导入项目」
3. 项目目录选择：`d:\IP网站\mini-program-ui`
4. AppID：
   - 如果你要联调登录/支付：必须用你自己的真实小程序 AppID
   - 本仓库当前 `mini-program-ui/project.config.json` 里写的是 `wx2fab2dc6ebe442c4`，可按你实际情况改
5. 点击「导入」

---

## 2) 运行前的关键配置（决定能不能请求后端）

### 2.1 生产联调（推荐）

前提：

- 后端已部署为 HTTPS 域名（例如：`https://ip.ipgongchang.xin`）
- 微信小程序后台已经把合法域名配置完成（见下面 2.3）

检查小程序 baseUrl：

- `mini-program-ui/utils/config.js` 里默认是：
  - `IP_FACTORY_BASE_URL = "https://ip.ipgongchang.xin"`

这时你直接点「编译」即可。

### 2.2 纯本地联调（只建议开发阶段）

目的：后端跑在本机 `http://localhost:3000`，小程序也打本机。

1. 微信开发者工具：勾选「不校验合法域名、web-view(业务域名)、TLS 版本以及 HTTPS 证书」
2. 临时修改 `mini-program-ui/utils/config.js`：
   - `IP_FACTORY_BASE_URL` 改成 `http://localhost:3000`
3. 本仓库根目录启动后端：
   - `pnpm dev`

注意：提测/上线前必须把 `IP_FACTORY_BASE_URL` 改回备案域名。

### 2.3 微信小程序后台（上线必做）

在微信公众平台 -> 小程序 -> 开发管理 -> 开发设置：

把下面都配置成同一个域名（推荐都填 `https://ip.ipgongchang.xin`）：

- request 合法域名
- uploadFile 合法域名
- downloadFile 合法域名

说明：

- 必须是 `https://`，不能有路径、不能有端口
- 域名必须备案且证书合规

---

## 3) 编译与调试

1. 点「编译」
2. 如果模拟器启动失败：
   - 先看工具下方「调试器 -> Console」的第一条报错
   - 再看「编译」面板里提示的具体文件路径（通常是 `*.json` 语法错误）

常见报错 1：`SyntaxError: Unexpected token in JSON at position 0`

- 说明某个 `*.json` 文件开头有非法字符（常见是 BOM）或文件内容不是合法 JSON
- 处理方式：
  - 用 VSCode 打开报错的那个 `*.json`，确认是标准 JSON（不能有注释、不能有多余逗号）
  - 重新保存为 UTF-8（无 BOM）

常见报错 2：网络请求失败

- 先确认 `mini-program-ui/utils/config.js` 的 baseUrl
- 再确认微信后台合法域名是否已配置（生产联调）
- 再确认后端域名 HTTPS 证书是否正常

常见报错 3：页面弹出一段 `<!DOCTYPE html ...` 之类的字符

- 含义：小程序请求接口时，后端返回了 **HTML 页面**（通常是 Next.js 的 404/500 错误页），被当成错误信息展示出来了。
- 最常见原因：后端还没部署到包含该接口的最新版本（例如新加的 `/api/mp/store-profiles`、`/api/mp/xhs/generate-v4`）。
- 快速验证（在电脑上执行）：
  - `curl https://你的域名/api/mp/store-profiles`
  - 正常情况：返回 `401` 且 `Content-Type: application/json`
  - 异常情况：返回 `404` 且 `Content-Type: text/html`（就会出现你看到的那段 HTML）
- 解决：
  1. 先把后端部署更新到最新版（见 `docs/DEPLOY_BACKEND.md`）
  2. 再回到开发者工具重新编译/刷新

---

## 4) 预览（给测试扫码）

1. 点右上角「预览」
2. 生成预览二维码
3. 用测试微信扫码（需测试人员在该小程序的体验成员里，或按你的小程序权限体系）

---

## 5) 上传（提审前必须做）

1. 点右上角「上传」
2. 填版本号与备注（建议与 git 变更对应）
3. 上传成功后到微信公众平台 -> 版本管理：
   - 找到刚上传的版本
   - 提交审核
   - 审核通过后发布

---

## 6) 联调验收（建议你用这 6 条快速判断是否“后端 + 小程序”都通了）

1. 小程序能静默登录（`POST /api/wechat/login`）
2. 「我的」页能显示 plan/credits（`GET /api/mp/profile`）
3. 小红书发文页能生成（`POST /api/mp/xhs/generate-v4`）
4. 草稿页能列表（`GET /api/mp/xhs/drafts`）
5. 门店档案能 CRUD（`/api/mp/store-profiles*`）
6. （如启用支付）支付能拉起并回调成功（`/api/wechatpay/*`）
