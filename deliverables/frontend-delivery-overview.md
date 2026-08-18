# 云帆志愿前端交付概览

## 完成内容

- 已依据 PRD、线稿与 HTML 原型生成 React + TypeScript 前端项目。
- 已实现首页、六步采集向导、推荐结果、志愿表、个人中心、404 与非法步骤恢复。
- 已实现广东演示数据、612 分反查位次 15230、选科和偏好校验、权重恒和 100、四梯度推荐、降级说明、志愿持久化及预测免责声明。
- 已按移动端优先适配 320/440/768/1280px，并补充键盘操作、错误焦点、Tabs、Dialog、ARIA 与减少动画支持。

## 技术与实现决策

- 技术栈：React 18.3.1、TypeScript 5.5.4、Vite 5.4.2、React Router 6.26.1、Lucide React。
- 状态：React Context + useReducer；样式：CSS Variables + CSS Modules。
- 数据：确定性本地 Mock 经 Service Adapter 暴露；页面不直接读取 fixture。
- 持久化：`yunfan:app-state:v1` 仅保存草稿、完成步骤和已选志愿 ID。
- 未引入 MUI、Tailwind、Redux/Zustand、Axios、React Hook Form、Zod 或图表库。

## 验证结论

- `pnpm typecheck`：通过。
- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm test:run`：9 个文件、43 项测试全部通过。
- `pnpm build`：通过，已生成 `dist/`。
- 已修复构建产物在 HTTP 无缓存深链下误请求 `/wizard/assets/...` 的问题：构建后入口使用协议感知的动态资源启动器，`file://` 加载 `./assets/`，HTTP(S) 加载 `/assets/`。
- 独立 QA 使用两个全新无缓存 Chrome profile 验证：双击 `dist/index.html` 可进入 `#/wizard/1`；首次直达 HTTP `/wizard/1` 无资源 404，首页、结果、志愿表与个人页均可渲染。
- 构建入口含 `data:,` favicon，且最终 classic bundle 不含 `import`、`export` 或 `import.meta`；QA 最终路由判定：`NoOne`。

## 后续说明

- 正确打开方式：普通用户双击 `dist/index.html`；开发调试执行 `pnpm dev` 后访问开发服务器地址。根目录 `index.html` 是源码入口，直接打开会显示引导链接。
- 当前为纯前端广东演示版；其他省真实数据、后端招生 API、账号、支付和专家服务不在本期范围。
- 项目声明 Node 20.15.1；当前验证环境为 Node 22.22.2，虽全部门禁通过，发布 CI 建议使用 Node 20.15.1 复验。
- 尚未执行真实屏幕阅读器、200% 文本缩放和所有页面的多设备像素级人工回归。
