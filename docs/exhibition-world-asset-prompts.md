# 전시마을 꾸미기 이미지 목록과 프롬프트

2026-11-04. 우리 반 전시마을 3단계(학교 앞마당 → 교실 로비 → 전시실 안)를 더 예쁘고 귀엽게 꾸미기 위해 필요한 이미지 목록이다. 아직 만들지 않았고, 코드도 이 이미지를 쓰도록 바뀌지 않았다. 이미지를 만든 뒤 `src/components/exhibition-world.tsx`의 단색 재질(`matte(...)`)을 텍스처·스티커로 바꾸는 작업이 따로 필요하다.

## 0. 공통 원칙

- **화풍 하나로 통일**: 손으로 칠한 듯한 파스텔 과슈 + 살짝 말랑한 점토 느낌, 무광, 따뜻한 오후 빛, 낮은 대비. 지금 3D 캐릭터(고양이·곰)와 둥근 모서리 소품과 어울려야 한다.
- **글자 금지**: 반 이름·전시 제목은 앱이 그린다. 이미지에는 글자·로고·숫자·워터마크·사람·동물 캐릭터를 넣지 않는다.
- **종류별 규격**

| 종류 | 규격 | 배경 | 비고 |
|---|---|---|---|
| 반복 무늬(T) | 1024×1024 정사각형, 사방 이음매 없음 | 불투명 | 정면에서 평평하게, 그림자·원근·조명 금지 |
| 띠 무늬(S) | 2048×256 가로, 좌우 이음매 없음 | 투명 또는 불투명 | 벽 하단·상단 몰딩, 가랜드 |
| 스티커(D) | 1024×1024 안팎 | **투명 PNG** | 정면, 바닥 그림자 없음, 가장자리 6px 여백 |
| 9분할 틀(N) | 1024×1024 | 투명 PNG | 가운데는 비우고 네 모서리만 장식(늘려도 모서리 유지) |
| 풍경(P) | 1536×1024 | 불투명 | 창밖·하늘 |

- **테마 색**(코드의 `PALETTES`와 같게)

| 테마 | 벽 | 포인트 | 진한 색 | 산호 | 하늘 | 러그 |
|---|---|---|---|---|---|---|
| cozy 포근한 교실 | #fff7e9 | #bdd8c5 | #6c9d89 | #e99786 | #d9eeec | #f2cec1 |
| forest 숲속 | #f7f5df | #b6ce9e | #70936c | #e6b487 | #e4efd8 | #cddcb4 |
| sky 구름 하늘 | #f8f7ff | #c4d5e9 | #829dc5 | #dba9c0 | #e5effb | #d9d3ed |
| ocean 바다 | #f3faf5 | #a9d5cb | #5b9e9a | #eab0a0 | #d7eef2 | #bededb |

- **저장 위치 제안**: `public/exhibition-world/v1/{구역}/{이름}.webp`(투명은 `.webp` 알파). 테마별은 `-cozy`, `-forest`, `-sky`, `-ocean`을 붙인다.

### 공통 프롬프트 머리말 (모든 프롬프트 앞에 붙임)

```
Asset for a children's 3D classroom art-gallery app (elementary school). Style: soft hand-painted pastel gouache with a gentle clay-like softness, matte, rounded friendly shapes, warm afternoon light, low contrast, cozy and cute storybook charm, premium and tasteful, not childish clip-art. No text, no letters, no numbers, no logos, no watermark, no people, no animal characters.
```

반복 무늬에는 다음을 덧붙인다.

```
Seamless tileable texture, perfectly repeating on all four edges, viewed flat and straight-on, evenly lit, no perspective, no cast shadows, no vignette.
```

스티커에는 다음을 덧붙인다.

```
Single isolated object, front view, transparent background, no ground shadow, clean soft edge, centered with small margin.
```

---

## 1. 교실 로비 (포스터가 걸린 방)

| # | 이름 | 종류 | 어디에 | 설명 |
|---|---|---|---|---|
| L1 | 교실 벽지 | T | 뒷벽·옆벽 | 크림색 바탕에 아주 작은 점·꽃잎 무늬. 포스터가 주인공이라 무늬는 은은하게 |
| L2 | 징두리 판벽 | S | 벽 아래 1m | 민트 세로 판자 + 나무 몰딩. 지금 민트 띠를 대신함 |
| L3 | 천장 | T | 천장 | 크림 회벽 + 아주 옅은 나무 들보 |
| L4 | 천장 조명 | D | 천장 중앙 2~3개 | 동그란 종이 갓 펜던트 조명 |
| L5 | 바닥 | T | 바닥 | 밝은 참나무 헤링본 마루 |
| L6 | 둥근 러그 | D | 바닥 가운데 | 산호·민트 테두리 둥근 러그(위에서 본 모습) |
| L7 | 창밖 풍경 | P | 출입구 쪽 창문 | 운동장 나무, 뭉게구름, 먼 학교 지붕 |
| L8 | 창틀 커튼 | D | 창문 양옆 | 묶어 둔 리넨 커튼 한 쌍 |
| L9 | 포스터 판 | N | 전시 포스터 | 코르크 느낌 나무 판 + 위쪽 가운데 동그란 압정 자리 |
| L10 | 반 이름 현판 | D | 뒷벽 위 "OO반의 작은 전시회" 자리 | 나무 현판, 글자 들어갈 가운데는 비움 |
| L11 | 가랜드 | S | 현판 아래·벽 위쪽 | 파스텔 삼각 깃발 + 작은 전구 |
| L12 | 벽 스티커 묶음 | D | 포스터 사이 빈 벽 | 별, 하트, 무지개, 연필, 크레파스, 발자국(각각 따로) |
| L13 | 큰 화분 | D | 방 모서리 | 둥근 잎 몬스테라·고무나무 + 테라코타 화분 |
| L14 | 작은 화분 | D | 책장 위 | 다육이, 작은 꽃 화분 3종 |
| L15 | 책장 앞면 | D | 책장 | 색색 그림책이 꽂힌 낮은 책장 정면 |
| L16 | 창문 빛 | D | 바닥 | 창틀 모양으로 바닥에 떨어진 부드러운 햇빛(반투명) |

## 2. 전시실 안 (작품이 걸린 방, 테마 4종)

| # | 이름 | 종류 | 어디에 | 설명 |
|---|---|---|---|---|
| G1 | 전시실 벽 | T ×4 | 세 벽 | 테마 벽색 + 아주 옅은 질감(회벽·종이결) |
| G2 | 하단 몰딩 | S ×4 | 벽 아래 | 테마 포인트 색 판벽 |
| G3 | 상단 몰딩 | S ×4 | 천장 아래 | 가는 장식 띠(cozy 물결, forest 덩굴, sky 구름, ocean 물결) |
| G4 | 천장 | T ×4 | 천장 | cozy 나무 들보, forest 나뭇잎 그림자, sky 옅은 구름, ocean 물빛 일렁임 |
| G5 | 바닥 | T ×4 | 바닥 | cozy 참나무 마루, forest 이끼 낀 돌+나무, sky 연보라 테라조, ocean 모래빛 조약돌 테라조 |
| G6 | 러그 | D ×4 | 벤치 앞 | 테마 러그(둥글거나 구름·잎·조개 모양) |
| G7 | 작품 액자 | N ×4 | 작품 틀 | 테마 색 나무 액자, 모서리 장식 |
| G8 | 작품 이름표 | D | 액자 아래 | 작은 크림색 이름표 판(글자 자리는 비움) |
| G9 | 전시실 명패 | D ×4 | 뒷벽 위 제목 자리 | 테마 장식 현판, 가운데 비움 |
| G10 | 큰 화면 테두리 | N | 가운데 큰 화면 | 둥근 나무 테두리 + 작은 리본 |
| G11 | 벤치 쿠션 | T | 가운데 벤치 | 체크무늬 리넨 |
| G12 | 화분·식물 | D ×4 | 모서리 | cozy 올리브 나무, forest 고사리·버섯, sky 수국·풍선, ocean 해초 유리병 |
| G13 | 매다는 장식 | D ×4 | 천장 | cozy 종이 별, forest 나뭇잎 모빌, sky 구름 모빌, ocean 물고기 모빌 |
| G14 | 테마 벽 스티커 | D ×4 묶음 | 빈 벽 | 테마별 작은 장식 5개씩 |
| G15 | 스포트라이트 빛 | D | 액자 위 벽 | 작품 위로 떨어지는 부드러운 원뿔 빛(반투명) |

## 3. 학교 앞마당 (건물을 고르는 곳)

| # | 이름 | 종류 | 설명 |
|---|---|---|---|
| C1 | 하늘 배경 | P (2:1 파노라마 2048×1024) | 파스텔 하늘, 뭉게구름, 먼 언덕 |
| C2 | 잔디 | T | 짧은 잔디 + 작은 클로버·꽃 |
| C3 | 길 | T | 크림색 벽돌 보도 |
| C4 | 꽃밭·덤불 | D | 둥근 덤불, 튤립 무더기 |
| C5 | 학교 건물 정면 | D | 반 건물 정면(글자 없는 현판 자리) |

---

## 4. 프롬프트

각 프롬프트 앞에 공통 머리말과 종류별 문장(반복 무늬/스티커)을 붙인다. `{theme}` 자리는 아래 테마 문구로 바꾼다.

- cozy: `warm cream and soft mint with coral accents, cozy classroom`
- forest: `buttery cream and leafy sage green with honey orange accents, gentle woodland`
- sky: `airy lavender white and powder blue with rose pink accents, dreamy clouds`
- ocean: `seafoam white and aqua teal with coral pink accents, calm seaside`

### 교실 로비

- **L1 교실 벽지**: `Wallpaper pattern: creamy #fff7e9 paper with tiny scattered pastel dots and miniature five-petal flowers in mint #bdd8c5 and coral #e99786, very sparse and subtle so posters stand out.`
- **L2 징두리 판벽**: `Horizontal strip of classroom wainscoting: soft mint vertical beadboard planks with a rounded light oak top rail and a thin cream baseboard, seamless left to right.`
- **L3 천장**: `Ceiling texture: warm cream plaster with faint soft brush marks and very pale honey wooden beams running in one direction.`
- **L4 천장 조명**: `Round white paper lantern pendant lamp with a tiny honey wood cap and a short cord, softly glowing warm.`
- **L5 바닥**: `Floor texture: light natural oak herringbone parquet with soft warm grain, slightly rounded plank edges, gentle sheen-free finish.`
- **L6 둥근 러그**: `Top-down view of a round hand-tufted rug, cream center, scalloped coral and mint borders, tiny embroidered daisies.`
- **L7 창밖 풍경**: `View through a classroom window: sunny schoolyard with one round green tree, a low hedge, distant pastel school roofs, fluffy clouds in a pale aqua sky. Soft focus, no window frame.`
- **L8 커튼**: `A pair of tied-back natural linen curtains with a thin mint stripe hem, hanging straight, for both sides of a window.`
- **L9 포스터 판**: `Nine-slice frame: rounded light oak board with a soft cork-textured cream inner panel, a small coral push-pin mark at the top center, ornament only in the corners and edges, center left plain.`
- **L10 반 이름 현판**: `Wide wooden name plaque with rounded ends, a soft mint ribbon tied on each side and two tiny painted leaves, the center plain for text.`
- **L11 가랜드**: `Horizontal garland: a gently drooping twine with pastel triangle bunting flags (mint, coral, butter yellow, powder blue) alternating with tiny warm round bulbs, seamless left to right, transparent background.`
- **L12 벽 스티커**: `Sticker sheet set, each item separate: a puffy star, a small heart, a mini rainbow, a stubby crayon, a pencil, a paw print. Pastel colors, soft white sticker outline.`
- **L13 큰 화분**: `Tall rounded rubber plant with glossy soft green leaves in a terracotta pot with a cream band, standing upright.`
- **L14 작은 화분**: `Three small potted plants side by side as separate items: a round succulent, a tiny daisy pot, a trailing pothos in a mint pot.`
- **L15 책장 앞면**: `Front view of a low rounded light oak bookshelf with two shelves of colorful picture books and a small potted plant, cozy and tidy.`
- **L16 창문 빛**: `Soft warm sunlight patch shaped like a four-pane arched window, as cast on a floor, very soft blurred edges, semi-transparent warm white, transparent background.`

### 전시실 안 (테마마다 1장씩)

- **G1 벽**: `Gallery wall texture in {theme}: plain wall color with a very fine paper-plaster grain, almost flat, calm museum-like background for artworks.`
- **G2 하단 몰딩**: `Horizontal strip of low wall paneling in {theme}: rounded panels in the accent color with a light wooden top rail, seamless left to right.`
- **G3 상단 몰딩**: `Thin decorative crown molding strip in {theme}: cozy = gentle scallops; forest = a fine leafy vine; sky = little puffy clouds; ocean = soft wave curls. Seamless left to right, transparent background.`
- **G4 천장**: `Gallery ceiling texture in {theme}: cozy = cream plaster with honey wooden beams; forest = pale ceiling with soft dappled leaf shadows; sky = faint wisps of cloud on lavender white; ocean = gentle caustic water-light ripples on seafoam white.`
- **G5 바닥**: `Gallery floor texture in {theme}: cozy = light oak planks; forest = rounded flagstones with moss in the gaps mixed with oak boards; sky = pale lilac terrazzo with tiny white and blue chips; ocean = sand-colored terrazzo with tiny shell and pebble chips.`
- **G6 러그**: `Top-down rug in {theme}: cozy = round scalloped rug; forest = leaf-shaped rug; sky = cloud-shaped rug; ocean = scallop-shell-shaped rug. Soft tufted texture.`
- **G7 작품 액자**: `Nine-slice picture frame in {theme}: rounded painted wooden frame in the accent color with a cream inner mat line and a tiny motif in each corner (cozy flower, forest leaf, sky star, ocean shell). Center fully transparent.`
- **G8 작품 이름표**: `Small rounded cream label plate with a thin brass-free wooden rim, plain center for text.`
- **G9 전시실 명패**: `Exhibition title plaque in {theme}: wide rounded wooden sign with themed ornaments on both ends (cozy ribbon and flowers, forest leaves and acorns, sky little clouds and stars, ocean shells and a starfish), center plain for text.`
- **G10 큰 화면 테두리**: `Nine-slice frame for a large display screen: thick rounded honey wood border with a small ribbon bow at the top center, corners softly carved, center transparent.`
- **G11 벤치 쿠션**: `Fabric texture: soft linen gingham check in cream and the theme accent color, gentle woven grain.`
- **G12 화분·식물**: `Decorative corner plant in {theme}: cozy = small olive tree in a cream pot; forest = lush fern with two tiny red-cap mushrooms in a wooden planter; sky = pastel hydrangea bush with one floating heart balloon tied to the pot; ocean = tall glass jar with swaying seaweed and pebbles.`
- **G13 매다는 장식**: `Hanging ceiling mobile in {theme}: cozy = folded paper stars; forest = felt leaves; sky = little clouds and raindrops; ocean = felt fish. Thin strings, light and balanced.`
- **G14 테마 벽 스티커**: `Sticker set of five separate small wall decorations in {theme} (cozy: flower, heart, crayon, star, sun; forest: leaf, acorn, mushroom, butterfly, pinecone; sky: cloud, star, moon, rainbow, kite; ocean: shell, starfish, bubble, fish, wave).`
- **G15 스포트라이트 빛**: `Soft gallery spotlight glow as cast on a wall: a gentle cone of warm light fading downward, semi-transparent, very soft edges, transparent background.`

### 학교 앞마당

- **C1 하늘**: `Equirectangular 2:1 panorama sky: pastel blue sky with soft fluffy cumulus clouds, a faint rainbow on one side, gentle green rolling hills along the horizon. Seamless left to right.`
- **C2 잔디**: `Grass texture: short soft lawn in fresh pastel green with scattered tiny clovers and a few white daisies.`
- **C3 길**: `Path texture: cream and light butter rounded paving bricks in a running bond pattern, soft worn edges.`
- **C4 꽃밭·덤불**: `Separate items: a round trimmed bush, a cluster of pastel tulips, a low flowering hedge segment.`
- **C5 학교 건물 정면**: `Front view of a small cute two-story school building with a rounded roof, arched windows, a little clock-free gable and a blank name board above the door.`

---

## 5. 우선순위 제안

1. **바로 효과가 큰 것**: L1·L2·L5(교실 벽·판벽·바닥), G1·G5(전시실 벽·바닥 4테마), L9·G7(포스터 판·작품 액자).
2. **분위기**: L4·L11·L13·G12·G13(조명·가랜드·화분·모빌), L7(창밖 풍경).
3. **마무리**: 스티커 묶음, 빛 효과(L16·G15), 학교 앞마당(C1~C5).

## 6. 만든 뒤 확인할 것

- 반복 무늬는 2×2로 붙여 이음매가 보이지 않는지 확인한다.
- 투명 PNG는 가장자리 흰 테두리(헤일로)가 없는지 확인한다.
- 큰 텍스처는 WebP로 줄인다(바닥·벽 1024px이면 충분하고, 휴대폰에서는 512px로도 충분하다).
- 전시 작품이 주인공이므로 벽·바닥 무늬가 작품보다 눈에 띄지 않는지 실제 화면에서 본다.
