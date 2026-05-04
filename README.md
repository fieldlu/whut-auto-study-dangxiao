# WUT 网上党校 全能助手

[![version](https://img.shields.io/badge/version-1.4.1-blue)](https://gitee.com/fieldlu/wut_assistant)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

武汉理工大学网上党校（`wsdx.whut.edu.cn`）全自动学习 + 云端题库 + AI 答题油猴脚本。

## 功能

### 刷课区
- **始终自动运行**：打开培训班页面即自动开始，无需手动操作
- **全自动学习**：自动扫描课程列表 → 逐个进入 → 断点续播 → 完成后自动跳下一节
- **真人模拟**：10 种随机交互动作（鼠标移动/点击/双击/右键/拖拽/滚轮/悬停/移至视频/选中文字/触屏），每 8~35 秒触发，防挂机检测
- **进度看门狗**：监控 `/api/student/study/progress/save`，2 分钟无更新时三层递进恢复（强制上报 → 暂停重播 → 强刷）
- **视频接管**：自动播放、跳过已看部分、不静音（防反作弊）、断点续播
- **智能进度扫描**：自动跳过已完成课程，只处理 WLXX 模式未完成项
- **完善日志**：面板实时显示播放进度、服务端上报百分比、真人模拟动作、课程完成状态

### 题库区
- **云端题库**：Gitee 托管，自动合并上传、逐题比对查答案
- **三级级联搜索**：本地题库 → 云端批量 → AI 兜底
- **多 Provider AI**：支持 8 家主流大模型：DeepSeek / Kimi / ChatGPT / Claude / Gemini / 智谱GLM / 通义千问 / 自定义
- **强制自动捕获**：交卷后网络拦截器自动提取正确答案并上传云端
- **三步答题流程**：获取答案 → 填充 → 提交

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. [点击安装脚本](https://gitee.com/fieldlu/wut_assistant/raw/main/WUT%E7%BD%91%E4%B8%8A%E5%85%9A%E6%A0%A1%20%E5%85%A8%E8%83%BD%E5%8A%A9%E6%89%8B.user.js)

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)

## 许可证

MIT
