"""Build walk.html, the walkable underwater museum, from this kit.

Needs Python 3 with Pillow and NumPy (used only to measure the clear opening of
portal, window and aquarium images). The output is one offline HTML file.
"""
import argparse
import base64
import gzip
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

THEMES = ["coral", "kelp", "abyss", "lagoon"]
SUBTITLES = {
    "coral": "테라코타 아치 아래, 산호 정원을 마주한 전시실",
    "kelp": "금빛 빛줄기가 내려오는 해중림 유리 회랑",
    "abyss": "푸른 심해를 내다보는 원형 관측창",
    "lagoon": "얕은 모래바다 위 진주빛 전시관",
}
MATERIALS = ["wall", "floor", "ceiling", "trim", "shell", "hull", "tread", "seabed"]
ARCH = {"artBay": "art-bay", "portal": "portal", "viewport": "viewport", "jamb": "jamb-return",
        "frame": "frame", "bench": "bench", "bollard": "bollard", "rail": "rail", "gasket": "gasket",
        "spot": "spot", "hallTank": "hall-tank"}
# Approximate real widths (m) for swimmers, and heights (m) for things that grow from the floor.
SWIM_SIZE = {"green-turtle": 1.25, "sperm-whale": 11.0, "spotted-eagle-ray": 1.9, "lyretail-anthias": .19,
             "bluestripe-snapper": .32, "pacific-sardine": .9, "marine-hatchetfish": .5,
             "raccoon-butterflyfish": .55, "garibaldi": .34, "abyss-snipe-eel": .9, "abyss-dragonfish": .45,
             "abyss-viperfish": .4, "kelp-sheephead": .55, "kelp-kelp-bass": .5, "kelp-rockfish": .45,
             "coral-moorish-idol": .26, "lagoon-longnose": .3}
SCHOOL = {"lyretail-anthias": 14, "bluestripe-snapper": 9, "pacific-sardine": 6, "marine-hatchetfish": 5,
          "coral-chromis": 12, "kelp-topsmelt": 10, "kelp-blacksmith": 7, "abyss-lanternfish": 9,
          "abyss-bristlemouth": 9, "lagoon-striped-sergeant": 7, "lagoon-threadfin": 4,
          "coral-sixline-wrasse": 3, "lagoon-yellow-tang": 3, "coral-regal-tang": 2}
GROW_SIZE = {"giant-kelp": 7.5, "kelp-bull-kelp": 5.0, "kelp-ribbon-kelp": 3.6, "feather-kelp": 2.4,
             "eelgrass": .9, "lagoon-turtlegrass": .6, "lagoon-shoalgrass": .55, "lagoon-manatee-grass": .7,
             "staghorn-coral": 1.0, "vermilion-sea-fan": 1.5, "pale-sea-fan": 1.6, "abyss-glass-sponge": 1.1,
             "abyss-bamboo-coral": 1.5, "abyss-whip-coral": 1.7, "abyss-sea-pen": .9, "coral-table-coral": .75}
FOG = {"coral": "#2f93ad", "kelp": "#2b5e46", "abyss": "#06213d", "lagoon": "#5ec3cf"}
# Light and colour per theme: outdoor sky/fog/light, label ink, seat fabric, particles and caustics.
LOOK = {
    "coral": {"light": {"sky": 1.0, "fogNear": 9, "fogFar": 62, "hemi": "#cdf1ff", "ground": "#d9b98f", "hemiPower": 1.55,
                        "indoor": 1.6, "sun": "#fff2dc", "sunPower": 2.3, "exposure": 1.0},
              "ink": "#6b3420", "seat": "#d8b38b", "particle": "#dff7ff", "causticColor": "#d6fbff"},
    "kelp": {"light": {"sky": .95, "fogNear": 7, "fogFar": 52, "hemi": "#c8e6b8", "ground": "#5d5532", "hemiPower": 1.45,
                       "indoor": 1.55, "sun": "#ffe2a4", "sunPower": 2.4, "exposure": 1.05},
             "ink": "#3d4a28", "seat": "#5e6a38", "particle": "#f1e7c2", "causticColor": "#ffeec0"},
    "abyss": {"light": {"sky": .9, "fogNear": 6, "fogFar": 52, "hemi": "#7aa8e6", "ground": "#22303f", "hemiPower": 2.0,
                        "indoor": 1.5, "sun": "#b4d4ff", "sunPower": 1.6, "exposure": 1.2},
              "ink": "#3b3a36", "seat": "#4a4f58", "particle": "#cfe6ff", "causticColor": "#9cc8ff",
              "causticsOutdoor": .16, "causticsIndoor": .08},
    "lagoon": {"light": {"sky": 1.0, "fogNear": 11, "fogFar": 70, "hemi": "#e2fbff", "ground": "#efe1c6", "hemiPower": 1.7,
                         "indoor": 1.65, "sun": "#fffaf0", "sunPower": 2.5, "exposure": .98},
               "ink": "#3e5f66", "seat": "#efe5d8", "particle": "#ffffff", "causticColor": "#e6ffff"},
}


def packed(text):
    return json.dumps(base64.b64encode(gzip.compress(text.encode("utf-8"), compresslevel=7, mtime=0)).decode("ascii"))


def data_url(path):
    mime = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg"}[path.suffix.lower()]
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def flood(mask, seeds):
    seen = np.zeros_like(mask)
    queue = deque()
    for y, x in seeds:
        if mask[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x))
    sh, sw = mask.shape
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < sh and 0 <= nx < sw and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def aperture(path, clear, open_bottom, rows=40):
    """Transparent openings enclosed by the frame, as row extents normalised to the image.

    Returns a list of loops (largest first). Each loop is [[v,u0,u1], ...] from top to
    bottom. For a door the bottom rows are closed off while measuring, so the opening
    that reaches the floor counts as enclosed; its loop then ends at v = 1.
    """
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    step = 2
    alpha = np.array(im.resize((w // step, h // step), Image.BILINEAR))[:, :, 3]
    sh, sw = alpha.shape
    clear_px = alpha < 110
    if open_bottom:
        clear_px[int(sh * .975):, :] = False
    border = [(0, x) for x in range(sw)] + [(sh - 1, x) for x in range(sw)] + \
             [(y, 0) for y in range(sh)] + [(y, sw - 1) for y in range(sh)]
    enclosed = clear_px & ~flood(clear_px, border)
    # Openings separated only by a thin rail are measured as one, so their wall
    # holes can never overlap (overlapping holes cannot be triangulated).
    grown = enclosed.copy()
    for _ in range(5):
        g = grown.copy()
        g[1:, :] |= grown[:-1, :]; g[:-1, :] |= grown[1:, :]; g[:, 1:] |= grown[:, :-1]; g[:, :-1] |= grown[:, 1:]
        grown = g
    loops = []
    remaining = grown.copy()
    while remaining.any():
        ys, xs = np.nonzero(remaining)
        part = flood(remaining, [(ys[0], xs[0])])
        remaining &= ~part
        part = part & enclosed
        if part.sum() < sh * sw * .004:
            continue
        py = np.nonzero(part.any(axis=1))[0]
        top, bottom = py.min(), py.max()
        out = []
        for i in range(rows + 1):
            y = int(round(top + (bottom - top) * i / rows))
            xs = np.nonzero(part[y])[0]
            if len(xs):
                out.append([round(y / sh, 4), round(xs.min() / sw, 4), round((xs.max() + 1) / sw, 4)])
        out[0][0] = round(top / sh, 4)
        out[-1][0] = round((bottom + 1) / sh, 4)
        loops.append((int(part.sum()), out))
    loops.sort(key=lambda item: -item[0])
    loops = [loop for _, loop in loops]
    if open_bottom and loops:
        loops = loops[:1]
        loops[0].append([1.0, loops[0][-1][1], loops[0][-1][2]])
    return {"loops": loops, "size": [w, h]}


def build(root, output):
    root = root.resolve()
    src = Path(__file__).resolve().parent
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    layout = json.loads((root / "layouts" / "exhibition.json").read_text(encoding="utf-8"))
    life = json.loads((root / "life" / "manifest.json").read_text(encoding="utf-8"))
    rooms_info = {r["id"]: r for r in json.loads((root / "shared" / "rooms.json").read_text(encoding="utf-8"))}
    assets = {a["id"]: a for a in manifest["assets"]}
    life_by_id = {a["id"]: a for a in life["assets"]}
    images, sizes = {}, {}

    def use_webp(rel, quality):
        """Embed a large PNG map (normal or roughness) as WebP to keep walk.html small."""
        rel = rel.replace("\\", "/")
        if rel not in images:
            import io
            buf = io.BytesIO()
            with Image.open(root / rel) as im:
                im = im.convert("RGB")
                sizes[rel] = list(im.size)
                im.save(buf, "WEBP", quality=quality, method=5)
            images[rel] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
        return rel

    def use_display(rel, max_side=1600, quality=82):
        """Embed a large sheet or master for display, scaled down, keeping transparency."""
        rel = rel.replace("\\", "/")
        if rel not in images:
            import io
            buf = io.BytesIO()
            with Image.open(root / rel) as im:
                sizes[rel] = list(im.size)
                im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
                im.thumbnail((max_side, max_side), Image.LANCZOS)
                im.save(buf, "WEBP", quality=quality, method=5)
            images[rel] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
        return rel

    def use(rel):
        rel = rel.replace("\\", "/")
        if rel not in images:
            path = root / rel
            images[rel] = data_url(path)
            with Image.open(path) as im:
                sizes[rel] = list(im.size)
        return rel

    themes = {}
    for t in THEMES:
        meta = manifest["themes"][t]
        binding = layout["themeBindings"][t]
        imgs = {k: use(f"materials/{t}/{k}.webp") for k in MATERIALS}
        for k in MATERIALS:
            imgs[k + "N"] = use_webp(f"materials/{t}/{k}-normal.png", 88)
            imgs[k + "R"] = use_webp(f"materials/{t}/{k}-roughness.png", 80)
        imgs["panorama"] = use(f"environment/{t}-panorama.webp")
        for key, name in ARCH.items():
            imgs[key] = use(f"architecture/{t}/{name}.webp")
        for plate in ["exterior", "hall", "gallery"]:
            imgs[plate + "Plate"] = use(f"scenes/{t}/{plate}.webp")
        for prop in ["vase", "plinth", "chair"]:
            imgs[prop] = use(f"furnishings/props/{t}-{prop}.webp")
        for side in ["front", "side", "rear", "roof"]:
            imgs[side] = use(f"architecture/{t}/{side}.webp")
        number = THEMES.index(t) + 1
        for stage in ["exterior", "hall", "gallery"]:
            imgs["ref" + stage.capitalize()] = use_display(f"references/{number:02d}-{t}-{stage}.png")
        apertures = {}
        for key, open_bottom in [("portal", True), ("viewport", False), ("hallTank", False)]:
            rec = assets[f"{t}-{ARCH[key]}"]
            apertures[key] = aperture(root / rec["src"], rec["aperture"], open_bottom)
        frame = assets[f"{t}-frame"]
        swimmers, growers = [], []
        for a in manifest["assets"]:
            if t not in a.get("themes", []) or a["kind"] not in ("fish", "swimmer", "benthos", "plant"):
                continue
            if a["kind"] in ("fish", "swimmer"):
                frames = life_by_id[a["id"]]["frames"] if a["id"] in life_by_id else [a["src"]]
                fps = life_by_id.get(a["id"], {}).get("fps", 0)
                swimmers.append({"id": a["id"], "frames": [use(f) for f in frames], "fps": fps,
                                 "anchor": a["anchor"], "aspect": a["width"] / a["height"],
                                 "size": SWIM_SIZE.get(a["id"], .3), "school": SCHOOL.get(a["id"], 1)})
            else:
                growers.append({"id": a["id"], "src": use(a["src"]), "anchor": a["anchor"],
                                "aspect": a["width"] / a["height"], "height": GROW_SIZE.get(a["id"], .8)})
        themes[t] = {
            "title": meta["title"], "subtitle": SUBTITLES[t], "fog": FOG[t], "images": imgs,
            "apertures": apertures, "doorSkin": binding["doorSkin"],
            "windowAspect": binding["windowSourceAspect"],
            "frameSlice": binding["frameNineSlicePixelsLTRB"], "frameSize": [frame["width"], frame["height"]],
            "life": {"swimmers": swimmers, "growers": growers},
            **LOOK[t],
        }
    effects = {k: use(f"water/{k}.png") for k in ["caustics", "shafts", "snow", "ripples"]}
    artworks = []
    for a in manifest["assets"]:
        if a["kind"] == "artwork":
            artworks.append({"id": a["id"], "title": a["title"], "medium": a.get("medium", ""),
                             "width": a["width"], "height": a["height"], "image": use(a["src"])})
    # The archive: every sheet, master, reference and source image of the kit, hung per theme.
    archive, hall_extras, profiles = {}, {}, dict(layout["artProfiles"])
    STAGE_KO = {"exterior": "외관", "hall": "중앙 홀", "gallery": "전시실"}
    SIDE_KO = {"front": "정면도", "side": "측면도", "rear": "배면도", "roof": "지붕 평면도"}
    SHARED = {
        "coral": [("architecture/sheets/hall-tanks.png", "중앙 홀 수조 4종 · 부품 시트"), ("furnishings/atlases/reef-forest.png", "산호·해중림 가구 시트")],
        "kelp": [("architecture/masters/hall-tanks.png", "중앙 홀 수조 4종 · 생성 원본"), ("furnishings/masters/reef-forest.png", "산호·해중림 가구 · 생성 원본")],
        "abyss": [("furnishings/atlases/trench-lagoon.png", "심해·라군 가구 시트"), ("scene-masters/water-optics.png", "물빛 효과 4종 · 생성 원본")],
        "lagoon": [("furnishings/masters/trench-lagoon.png", "심해·라군 가구 · 생성 원본"), ("preview.jpg", "수중 미술관 키트 한눈에 보기")],
    }
    EXTRAS = {
        "coral": [("life/atlases/reef-fish.png", "산호초 어류 시트"), ("life/originals/reef.png", "산호초 어류 · 생성 원본"), ("life/originals/turtle.png", "푸른바다거북 유영 · 생성 원본")],
        "kelp": [("life/atlases/fish-swim.png", "어류 유영 동작 시트"), ("life/originals/silver.png", "은빛 무리 어류 · 생성 원본"), ("life/originals/flora.png", "해조·산호 · 생성 원본")],
        "abyss": [("life/atlases/megafauna-swim.png", "대형 해양 생물 유영 동작 시트"), ("life/originals/whale.png", "향유고래 유영 · 생성 원본"), ("life/atlases/benthic-specimens.png", "해저 고착 생물 시트")],
        "lagoon": [("life/originals/ray.png", "매가오리 유영 · 생성 원본"), ("life/originals/duo.png", "나비고기 · 생성 원본"), ("shared/character/cat-sheet.png", "관람 고양이 · 캐릭터 시트")],
    }
    BIO = {"coral": "biodiversity/masters/coral-fish-clean.png", "lagoon": "biodiversity/masters/lagoon-growth-clean.png"}

    def archive_art(t, rel, title, medium, display=True):
        aid = "arc-" + t + "-" + str(len(archive.setdefault(t, [])) + 1)
        path = use_display(rel) if display else use(rel)
        w, h = sizes[path]
        artworks.append({"id": aid, "title": title, "medium": medium, "width": w, "height": h, "image": path})
        a = w / h
        aw, ah = (1.42, 1.42 / a) if a > 1.42 / 1.26 else (1.26 * a, 1.26)
        profiles[aid] = {"artSize": [round(aw, 4), round(ah, 4)], "outerFrameSize": [round(aw + .22, 4), round(ah + .22, 4)]}
        archive[t].append(aid)

    for t in THEMES:
        title, n = manifest["themes"][t]["title"], THEMES.index(t) + 1
        for stage in ["exterior", "hall", "gallery"]:
            archive_art(t, f"references/{n:02d}-{t}-{stage}.png", f"{title} 설계 시안 · {STAGE_KO[stage]}", "선택된 설계 시안")
        for side in ["front", "side", "rear", "roof"]:
            archive_art(t, f"architecture/{t}/{side}.webp", f"{title} {SIDE_KO[side]}", "외관 입면 부품", display=False)
        for kind, ko in [("elevations", "외관 입면"), ("fixtures", "설비·가구"), ("interior", "실내 부품")]:
            archive_art(t, f"architecture/sheets/{t}-{kind}.png", f"{ko} 부품 시트", "투명 부품 시트")
            archive_art(t, f"architecture/masters/{t}-{kind}.png", f"{ko} · 생성 원본", "생성 원본")
        for kind, ko in [("fish", "어류"), ("growth", "해조·산호")]:
            archive_art(t, f"biodiversity/atlases/{t}-{kind}.png", f"{ko} 도감 시트", "생물 6종 투명 시트")
            master = BIO.get(t) if (t == "coral" and kind == "fish") or (t == "lagoon" and kind == "growth") else f"biodiversity/masters/{t}-{kind}.png"
            archive_art(t, master, f"{ko} 도감 · 생성 원본", "생성 원본")
        for kind, ko in [("clean-exterior", "합성용 외관 배경"), ("clean-hall", "합성용 홀 배경"), ("clean-gallery", "합성용 전시실 배경"),
                         ("inside", "실내 재질"), ("outer", "외장 재질"), ("panorama", "360° 바다 파노라마")]:
            archive_art(t, f"scene-masters/{t}-{kind}.png", f"{ko} · 원본", "장면 원본")
        for rel, ko in SHARED[t]:
            archive_art(t, rel, ko, "공용 원본")
        hall_extras[t] = []
        for rel, ko in EXTRAS[t]:
            hall_extras[t].append({"image": use_display(rel, 1400), "title": ko})
    cat_frames = [use(f"shared/character/cat-{v}-{i}.webp") for v in ["front", "right", "rear", "left"] for i in range(1, 5)]
    rooms = []
    for r in layout["rooms"]:
        info = rooms_info.get(r["id"], {})
        rooms.append({"id": r["id"], "title": r["title"], "subject": info.get("subject", ""),
                      "artIds": r["artIdsBySlot"]})
    rooms.append({"id": "archive", "title": "바다 아카이브", "subject": "설계 시안 · 도면 · 생물 도감 · 원본", "artIds": []})
    keep = ["hall", "gallery", "pagination"]
    lay = {k: layout[k] for k in keep}
    lay["artProfiles"] = profiles
    bundle = {"themes": themes, "effects": effects, "artworks": artworks, "rooms": rooms, "archive": archive,
              "hallExtras": hall_extras, "catFrames": cat_frames,
              "layout": lay, "sizes": sizes, "images": images,
              "cat": use("shared/character/cat.webp"),
              "cutouts": {"cat": {"rects": json.loads((src / "cat-rects.json").read_text(encoding="utf-8"))}}}
    vendor = src / "vendor"
    boot = """
const moduleUrl = body => URL.createObjectURL(new Blob([body], {type:'text/javascript'}));
async function unzipSource(blob) {
  const bytes = Uint8Array.from(atob(blob), char => char.charCodeAt(0));
  return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
const coreUrl = moduleUrl(await unzipSource(__CORE__));
const moduleSource = (await unzipSource(__RENDERER__)).replaceAll("'./three.core.js'", JSON.stringify(coreUrl));
const T = await import(moduleUrl(moduleSource));
""".replace("__CORE__", packed((vendor / "three.core.js").read_text(encoding="utf-8"))) \
       .replace("__RENDERER__", packed((vendor / "three.module.js").read_text(encoding="utf-8")))
    scripts = [boot, "const BUNDLE=" + json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c") + ";"]
    for module in ["photo-character.mjs", "parts.mjs", "coral.mjs", "kelp.mjs", "abyss.mjs", "lagoon.mjs", "room.mjs", "arrival.mjs", "runtime.mjs"]:
        text = (src / module).read_text(encoding="utf-8-sig")
        scripts.append(text.replace("export function ", "function ").replace("export const ", "const "))
    html = (src / "shell.html").read_text(encoding="utf-8-sig")
    html = html.replace("<script>{{SCRIPT}}", '<script type="module">{{SCRIPT}}')
    html = html.replace("{{STYLE}}", (src / "style.css").read_text(encoding="utf-8-sig")).replace("{{SCRIPT}}", "\n".join(scripts))
    html = html.replace("</body>", '<script type="text/plain" id="three-license">' + (vendor / "THREE-LICENSE.txt").read_text(encoding="utf-8") + "</script></body>")
    output.write_text(html, encoding="utf-8")
    print(output, round(output.stat().st_size / 1e6, 1), "MB,", len(images), "images")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    build(args.root, args.output or args.root / "walk.html")
