# 垚垚 · 立体书页登录页

一本摊开的书：左页是会跟鼠标动眼睛的垚垚，右页是登录表单。
在表单里打字时，墨迹会在纸面上晕开，慢慢透出书页下压着的唐宫图。

纯静态项目，无构建步骤、无依赖，双击 `index.html` 即可运行。

## 运行

- **直接打开**：双击 `index.html`
- **Live Server**：VSCode 装 Live Server 插件 → 右键 `index.html` → Open with Live Server
- **命令行**：`python -m http.server 5500`，访问 http://localhost:5500

## 交互

| 操作 | 效果 |
| --- | --- |
| 鼠标在书上划过 | 沿轨迹晕出墨迹，露出书页下的唐宫图 |
| 输入框聚焦 / 打字 / 删除 | 输入框所在位置晕开一圈墨 |
| 提交校验失败 | 在出错的输入框后晕一圈 |
| 提交成功 | 整张书页大面积晕开 |
| 鼠标移动 | 垚垚双眼追随（有幅度限制），静止后缓慢游移，每 1.6~4.8 秒眨一次（双眼同步） |

## 目录

```
mimo-code-clone/
├── index.html        页面结构（书 = 封皮 / 纸页 / 书脊 / 场景 / 遮罩画布）
├── styles.css        全部样式，配色与遮罩变量集中在 :root
├── main.js           墨迹晕开（Canvas）+ 眼睛动画 + 表单校验
├── README.md
└── assets/
    ├── avatar-base.png   垚垚立绘底图（虹膜已挖空并修补）
    ├── avatar.png        原始立绘（未使用，保留作源文件）
    ├── eye-l.png / eye-r.png  从原图抠出的虹膜圆片
    └── tang-bg.png       书页下压着的唐宫图
```

## 实现要点

**墨迹晕开**：书页里从下往上是 `.book__scene`（图）→ `#bookMask`（canvas，铺一层纸色渐变 + 中缝暗影）
→ 页面内容。canvas 用 `globalCompositeOperation = "destination-out"` 画墨点，画过的地方纸被"浸透"，
露出下面的场景图。`ResizeObserver` 让画布尺寸始终跟着纸页走。

**书的形态**（`styles.css`）：

- `.book__cover` 外扩 14px 露出茶色包边，`--cover-mask` 让包边上下沿在中缝处轻微下凹；
- `.book__paper` 的 `--paper-mask` 在上下沿中缝处裁出与纸边相切的 V 口，透出的就是真实封皮颜色；
- `.book__notch` 是一张与纸页同坐标的 SVG，只画 V 口的纸厚亮边和接触阴影，几何同源不会错位；
- `.book__spine` 是单道连续暗谷，`::after` 一道极细折痕亮线。

**眼睛**：立绘里虹膜被挖空，`eye-l/eye-r.png` 圆片按百分比定位盖在原眼位上，JS 只做位移 + 眨眼皮的
`transform`，不重绘贴图。
