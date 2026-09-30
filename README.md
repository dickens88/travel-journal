# 走呗 Zoubee

把一段旅程的照片、随手记和聊天收进来，由大模型整理成图文游记，再导出成长图或小红书卡片分享出去。

基于 Expo（SDK 57）+ Expo Router，数据全部存在手机本地（SQLite），AI 调用直接从客户端发往你自己配置的模型服务。

## 功能

- **旅行与照片**：新建旅行后从相册导入照片。内置相册会按旅行日期筛选，并保留 GPS 信息；导入时读取 EXIF 里的拍摄时间和位置，反查地名，再根据太阳高度和曝光参数推算光线（黄金时刻、蓝调时刻、夜景等）。
- **照片识别**：视觉模型分批描述照片的场景、地标、氛围和图注，并判断是否适合当封面。
- **随手记**：随时写一段文字，自动记下当时所在的位置。
- **旅行搭子**：每段旅行都有一个 AI 搭子，支持流式回复和 Markdown，也可以朗读回复。一键技能包括当导游、讲照片里的故事、附近美食、出片机位、接下来去哪、回顾、冷知识、学句当地话。聊天中提到的要点可以存成随手记。用 Claude 时会自动联网搜索实时信息。搭子的人设（system prompt）和头像都可以自定义。
- **游记生成**：把照片分析、随手记、聊天记录和每日天气（Open-Meteo）整理成按天分节的游记，并附带小红书文案。之后有新内容可以增量更新，也可以手动编辑。
- **地图与足迹**：旅行地图按停留点连成路线，飞行航段画成弧线。「足迹」页汇总所有旅行去过的国家、省份和城市。地图用内嵌的 Leaflet 渲染，不依赖 CDN。
- **分享**：导出游记长图或小红书风格卡片，保存到相册或调起系统分享。

## 模型配置

在 app 的「设置」页填写，密钥存在系统安全存储（expo-secure-store）里：

| 提供方 | 需要填写 | 说明 |
| --- | --- | --- |
| Anthropic（默认） | API Key，可选 Base URL、模型 | 默认模型 `claude-opus-5-5`，可选 Sonnet 5.5、Haiku 4.5、Fable 5.1 或手填模型 ID。支持联网搜索。 |
| OpenAI 兼容接口 | Base URL、API Key、模型名 | 适用于华为云 MaaS、DeepSeek、通义千问等。可另外指定视觉模型及其 Base URL（例如 MaaS 的部分模型在 `/v1`、部分在 `/v2`）。不支持联网搜索。 |

没有配置模型时，导入照片、写随手记、看地图等本地功能仍然可以用。

## 开发

```bash
npm install
npx expo start          # 启动 Metro，用 Expo Go 或开发构建打开
```

常用脚本：

```bash
npm run lint            # expo lint
npm run typecheck       # tsc --noEmit
npm test                # jest（jest-expo）
npm run emu             # 启动本机 redroid 模拟器 + scrcpy + Metro，并在 Expo Go 里打开
npm run gen:leaflet     # 升级 leaflet 后重新生成 src/map/leafletAssets.ts
node scripts/gen-icons.js  # 重新生成 Phosphor 图标模块和底部标签栏 PNG（需要 inkscape）
```

`scripts/android-emu.sh` 里的 Docker 容器名、adb/scrcpy 路径都按本机环境写死，换机器需要先改脚本。

`scripts/test-maas-vision.py` 用于排查华为云 MaaS 视觉模型的调用问题，用法见文件头注释。

提交前请跑一遍 lint 和 typecheck。

## 目录结构

```
src/
  app/          Expo Router 路由（(tabs) 为 旅行 / 足迹 / 设置；trip/[id]/ 为单个旅行的各页面）
  ai/           模型客户端（Anthropic / OpenAI 兼容）、照片分析、游记生成、搭子聊天与技能
  components/   UI 组件（buddy、trip、share、map、common）
  db/           SQLite 表结构、查询和 useQuery
  photos/       导入、EXIF 解析、存储和缩略图
  geo/          聚类停留点、距离、交通方式推断、光线、地名
  trip/         动态流、后台任务、识别、随手记
  stats/        单次旅行统计和总足迹
  weather/      Open-Meteo 天气
  settings/     设置存取
scripts/        模拟器、打包、资源生成脚本
```

`ios/` 和 `android/` 由 Continuous Native Generation 生成，已加入 `.gitignore`。原生配置请改 `app.json`。

## 打包与发布

目前只配置了 Android（包名 `com.lvji.traveljournal`）。签名密钥托管在 Expo 云端，所以本地和 CI 打出来的 APK 签名一致。

**本地打包**：需要 JDK 17 和 Android SDK（脚本默认读取 `~/Android/jdk`、`~/Android/Sdk`），并已登录 EAS。

```bash
npm run build:apk       # 先跑类型检查和 lint，再执行 eas build --local
# 产物：build-output/travel-journal.apk
```

**CI 发布**：推送 `v*` 标签会触发 [.github/workflows/android-release.yml](.github/workflows/android-release.yml)，构建 APK 并上传到 GitHub Releases。仓库需要在 Secrets 中配置 `EXPO_TOKEN`。

```bash
# 先在 app.json 里更新 expo.version
git tag v0.0.3 && git push origin v0.0.3
```

## 许可

[MIT](LICENSE)
