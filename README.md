# WUT 网上党校全自动刷课脚本

[![version](https://img.shields.io/badge/version-1.6.0-blue)](https://gitee.com/fieldlu/wut_assistant)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

武汉理工大学网上党校（`wsdx.whut.edu.cn`）全自动刷课油猴脚本。脚本只负责课程学习自动化，不包含题库、AI 答题或答案捕获功能。

## 功能

- **始终自动运行**：打开培训班页面后自动开始学习，无需手动操作
- **全自动学习**：自动扫描课程列表，逐个进入未完成课程，完成后自动跳转
- **视频接管**：自动播放、断点续播、跳过已观看部分；优先保持正常音量，若浏览器自动播放策略阻止则自动回退为静音播放
- **进度看门狗**：监控学习进度上报，卡住时自动尝试恢复播放或刷新页面
- **真人模拟**：随机执行鼠标移动、点击、滚轮、悬停、拖拽等交互动作
- **状态面板**：显示当前课程、视频进度、课程完成进度和运行日志

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. [点击安装脚本](https://gitee.com/fieldlu/wut_assistant/raw/main/WUT%E7%BD%91%E4%B8%8A%E5%85%9A%E6%A0%A1%20%E5%85%A8%E8%83%BD%E5%8A%A9%E6%89%8B.user.js)

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)

---

## 开源协议

本项目采用 **GPL-3.0** 协议开源，详见 [LICENSE](LICENSE)。

- 你可以自由使用、修改、再分发本脚本；
- 若你修改后对外分发，必须同样采用 GPL-3.0 协议并保留版权声明；
- 本脚本按「原样」提供，不附带任何明示或暗示的担保。
