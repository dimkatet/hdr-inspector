1. Glitch / Signal Corruption
1.1. Scanline Glitch

Идея: построчные смещения

noise = Noise(freq = high, axis = Y)
offset = noise * strength

warped = Warp(image, offset.x)
output = warped

👉 усиление:

квантовать noise → дискретные линии
добавить mask → редкие строки
1.2. Line Tearing

Идея: случайные разрывы строк

noise = Noise(freq = low)
mask = step(noise, threshold)

offset = mask * largeShift
output = Warp(image, offset.x)
1.3. RGB Glitch (Chromatic Desync)
r = Warp(image, offsetR)
g = Warp(image, offsetG)
b = Warp(image, offsetB)

output = Combine(r, g, b)

👉 offsets:

константные → aberration
noise-based → glitch
1.4. Block Glitch (Compression-like)
blockCoord = floor(uv / blockSize)
noise = hash(blockCoord)

offset = noise * strength
output = Warp(image, offset)
1.5. Data Corruption
noise = Noise(freq = medium)
quant = floor(image * levels) / levels

mask = step(noise, threshold)
output = Mix(image, quant, mask)
2. Distortion / Warping
2.1. Liquid Distortion
noise = FBM(freq = medium)

warp1 = Warp(image, noise * s1)
warp2 = Warp(warp1, noise * s2)

output = warp2

👉 ключ:

несколько warp подряд
2.2. Swirl
centered = uv - center
angle = length(centered) * strength

rotated = rotate(centered, angle)
output = sample(image, rotated + center)

(как отдельный node или warp-вариант)

2.3. Heat Distortion
noise = Noise(freq = high, animated)

offset = vec2(noise, 0) * strength
output = Warp(image, offset)
2.4. Flow Field Distortion
flow = vec2(
  Noise(x,y),
  Noise(x+offset,y)
)

output = Warp(image, flow * strength)
3. Color & Stylization
3.1. Gradient Mapping
luma = Luminance(image)
output = GradientMap(luma, gradient)
3.2. Posterization
quant = floor(image * levels) / levels
output = quant
3.3. High Contrast / Cyberpunk
color = ColorTransform(image, contrast↑, saturation↑)
gradient = GradientMap(luma, neonGradient)

output = Mix(color, gradient, factor)
3.4. Duotone
luma = Luminance(image)
output = GradientMap(luma, [colorA, colorB])
3.5. Channel Matrix (Film look)
output = ChannelMix(image, matrix4x4)
4. Noise-Based Effects
4.1. Film Grain
noise = Noise(freq = veryHigh)
grain = noise * intensity

output = image + grain

👉 лучше:

в gamma space
4.2. Dirt / Dust
noise = Noise(freq = low)
mask = smoothstep(a, b, noise)

output = Mix(image, dirtColor, mask)
4.3. Vignette (procedural)
d = distance(uv, center)
mask = smoothstep(r1, r2, d)

output = image * (1 - mask * strength)
5. Masks & Compositing Patterns
5.1. Edge Mask (если добавишь Sobel)
edges = EdgeDetect(image)
mask = threshold(edges)

output = Mix(image, effect, mask)
5.2. Noise Masked Effect
noise = Noise(freq = low)
mask = smoothstep(a, b, noise)

output = Mix(image, effect(image), mask)
5.3. Split Screen
mask = step(uv.x, 0.5)
output = Mix(effectA(image), effectB(image), mask)
6. Temporal (если добавишь позже)
6.1. Frame Ghosting
output = Mix(current, previousFrame, alpha)
6.2. Jitter
offset = random(frame) * strength
output = Warp(image, offset)
7. Композитные “стили” (готовые рецепты)
7.1. Analog VHS
scanlineWarp
→ lineTearing
→ channelOffset
→ noiseGrain
→ colorFade
7.2. Liquid Glitch
fbm → warp → warp
→ mask(noise)
→ mix(original, distorted)
→ channelOffset
7.3. Cyberpunk Stylization
contrast↑
→ gradientMap(neon)
→ channelOffset
→ bloom (если добавишь)
8. Универсальные строительные блоки (must-have)

Если хочешь максимальную выразительность, тебе нужны:

FBM (обязательно)
smoothstep (для мягких масок)
luminance node
vec2 noise (flow fields)
gradient mapping
9. Главный паттерн (сводка)

Почти любой эффект:

image
 → warp (optional)
 → stylize (color / quantization)
 → glitch (channel / displacement)
 → mix (через mask)
10. Как этим пользоваться

Не реализуй эффекты как “готовые штуки”.

👉 Делай:

presets = графы
nodes = примитивы