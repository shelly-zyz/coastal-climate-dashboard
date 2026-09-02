# 主题卡图片与配色

这次只调整表现层，不改变气象数值、统计口径或地图交互。

- 主题卡使用统一铺满尺寸的左侧主题图，通过透明度渐变融入右侧指标背景；没有图片分隔竖线，风场不再使用 contain 留白。下方保留对比和实际年均轨迹。
- 四幅配图由内置 image_gen 工具生成，属于写实主题素材，不是观测照片、实时监测画面或对应年份的天气实况。图片不随指标数值变成“实况”。
- 文件保存在 `public/images/weather/thermal.png`、`moisture.png`、`wind.png`、`solar.png`；保留生成原图，Next Image 自动按显示尺寸优化传输。
- 年月矩阵直接复用 `climate-map.ts` 的 `heatStops` 和 `heatColor`，取消透明度衰减。矩阵显示月均绝对值，因此不随地图的“变化率”模式切换成发散色带。矩阵仍按当前区域十年全月范围定标；配色一致不意味着地图年均值与矩阵月均值共用数值上下限。

## 最终生成提示词

### thermal

Use case: photorealistic-natural. Asset type: local raster image for left-side visual of a small dark teal climate dashboard metric card. A single photorealistic cinematic subject, real physical texture and lighting, not a line icon or illustration. Square image. Subject fills frame with clear silhouette readable at 80 pixels wide. Background near-black deep petrol teal #0b2328, subtle depth. No text, numbers, logos, UI, borders or watermark. Subject: macro photograph of a real glass environmental thermometer, rounded amber-red liquid reservoir prominently visible lower center and narrow glass stem running upward, fine unlabeled scale marks, realistic glass reflections. Warm golden light and subtle heat haze behind. Focus on reservoir and luminous stem, centered vertical composition. This is a conceptual still life, not a numerical temperature reading.

### moisture

Use case: photorealistic-natural. Asset type: local raster image for left-side visual of a small dark teal climate dashboard metric card. A single photorealistic cinematic subject, real physical texture and lighting, not a line icon or illustration. Square image. Subject fills frame with clear silhouette readable at 80 pixels wide. Background near-black deep petrol teal #0b2328, subtle depth. No text, numbers, logos, UI, borders or watermark. Subject: macro photograph of crystal-clear condensation water droplets on dark teal glass, one large spherical droplet in center lower frame and smaller droplets above and behind, silver cyan rim highlights and true water refraction. Cool turquoise lighting, black-green depth, richly detailed surface texture. Visually resembles a scientific humidity illustration but genuinely photographic.

### wind

Use case: photorealistic-natural. Asset type: local raster image for left-side visual of a small dark teal climate dashboard metric card. A single photorealistic cinematic subject, real physical texture and lighting, not a line icon or illustration. Square image. Subject fills frame with clear silhouette readable at 80 pixels wide. Background near-black deep petrol teal #0b2328, subtle depth. No text, numbers, logos, UI, borders or watermark. Subject: realistic close telephoto photograph of one elegant white three-bladed offshore wind turbine in sea mist, the nacelle and all three blades completely visible in upper-middle frame, short tower extends toward bottom edge, very subtle distant ocean. Silver-blue light, deep teal cloud background, crisp realistic brushed metal and atmospheric depth. No other foreground objects.

### solar

Use case: photorealistic-natural. Asset type: local raster image for left-side visual of a small dark teal climate dashboard metric card. A single photorealistic cinematic subject, real physical texture and lighting, not a line icon or illustration. Square image. Subject fills frame with clear silhouette readable at 80 pixels wide. Background near-black deep petrol teal #0b2328, subtle depth. No text, numbers, logos, UI, borders or watermark. Subject: cinematic photorealistic photograph of the bright golden sun breaking through sculptural dark clouds above the ocean, large luminous sun disk near upper center, amber rays of solar radiation and warm reflection on a narrow dark sea horizon at bottom. Detailed cloud texture, dark petrol teal edges, warm amber-gold highlights, strong single focal point. Not a cartoon sun, no drawn rays.
