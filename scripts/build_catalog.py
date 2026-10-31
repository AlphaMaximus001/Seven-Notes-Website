"""Merge classified products + downloaded photos into assets/data/catalog.js.

Usage: python3 scripts/build_catalog.py products.raw.json images.json
"""
import json, re, sys, collections

ART = {  # category -> artwork used when no verified photo exists
    "Acoustic Guitars": "acoustic", "Electro-Acoustic Guitars": "acoustic", "Classical Guitars": "acoustic",
    "Travel & Junior Guitars": "acoustic", "Electric Guitars": "electric", "Bass Guitars": "bass",
    "Ukuleles": "ukulele", "Bass Ukuleles": "ukulele", "Violins": "violin", "Violin Accessories": "bow",
    "Mandolins": "ukulele", "Harmonicas": "harmonica", "Recorders, Melodicas & Kazoos": "recorder",
    "Portable Keyboards": "keyboard", "MIDI Controllers": "keyboard", "Keyboard Stands & Pedals": "stand",
    "Cajons": "cajon", "Djembes & Darbukas": "djembe", "Steel Tongue Drums": "tongue", "Drumsticks": "sticks",
    "Drum Hardware": "pedal", "Electronic Drums & Pads": "pads", "Hand Percussion": "shaker",
    "Microphones": "mic", "Mic Stands & Mounts": "micstand", "Audio Interfaces": "interface", "Headphones": "headphones",
    "Studio Monitors": "monitor", "Mixers": "mixer", "Wireless Systems": "mic",
    "Guitar Amplifiers": "amp", "Effects & Multi-FX": "pedal", "Power Supplies": "plug",
    "Acoustic Guitar Strings": "strings", "Electric Guitar Strings": "strings", "Classical Guitar Strings": "strings",
    "Ukulele & Other Strings": "strings", "Cables & Connectors": "cable", "Capos": "capo", "Straps": "strap",
    "Picks": "pick", "Bags & Cases": "bag", "Care & Maintenance": "care", "Spare Parts": "parts",
    "Stands & Hangers": "stand", "Lights & Holders": "light", "Tuners & Metronomes": "tuner",
}
COLOUR_TOKENS = set("black blk bk nat natural sb sunburst brn brown mah mahogany or red rd blue blu bl green gn yellow yel "
                    "purple pul pink pk white wh gold grey gy silver orange wr tbk tbs nt walnut trd bu tcf c ns ca mb "
                    "r plm lpb sea foam placid plum burgundy chinamon wine coffee".split())
KNOWN_GAUGE = {"EXL110": "10–46", "EXL120": "09–42", "EXL165": "10–52", "EZ900": "10–50", "EZ910": "11–52", "EZ920": "12–54",
               "EJ16": "12–53", "EBL 2004": "11–52", "EBL 2006": "10–50", "EBL 2221": "10–46", "EBL 2222": "09–46",
               "EBL 2223": "09–42", "EBL 2246": "10–46", "EBL 2248": "09–42", "EBL 2249": "08–38", "EBL 2022": "10–46",
               "HA10": "10–48", "HA11": "11–50", "M170": "10–47", "M175": "11–52", "MA170": "10–47", "MA175": "11–52"}

BLURB = {
    "guitars": "Set up and checked at our Lucknow store before it leaves, so it plays well out of the box.",
    "folk": "Inspected and tuned in-store. We can help with sizing for younger players.",
    "keys": "Comes with what the manufacturer ships in the box. Ask us for the right stand, bag or adaptor.",
    "drums": "Play-tested in-store. We can help you pick sticks, heads and stands to match.",
    "studio": "Sealed retail stock with full manufacturer warranty where applicable.",
    "amps": "Sealed retail stock. Ask us for a matching power supply, cable or patch lead.",
    "accessories": "Genuine stock from authorised distributors.",
}
INTRO = {
    "Acoustic Guitar Strings": "A set of steel acoustic guitar strings{g}. Swap them every two to three months of regular playing to keep tuning stable and the tone bright.",
    "Electric Guitar Strings": "A set of electric guitar strings{g}. Lighter gauges bend easily; heavier gauges give more output and sustain.",
    "Classical Guitar Strings": "Nylon strings for classical guitars{g}. Give new nylon strings a day or two to settle in tune.",
    "Ukulele & Other Strings": "Replacement strings{g}. Check the instrument and size before you order; we're happy to confirm the fit.",
    "Acoustic Guitars": "An acoustic guitar from {b}{s}.",
    "Electro-Acoustic Guitars": "An electro-acoustic guitar from {b}{s} with a built-in pickup so you can plug straight into an amp or PA.",
    "Classical Guitars": "A nylon-string classical guitar from {b}{s}, with a wide neck that suits fingerstyle and beginners.",
    "Travel & Junior Guitars": "A compact guitar from {b}{s}, sized for travel, younger players and smaller hands.",
    "Electric Guitars": "An electric guitar from {b}. Pair it with an amp, cable and strap to start playing.",
    "Bass Guitars": "A bass guitar from {b}. Pair it with a bass amp or a headphone amp for practice.",
    "Ukuleles": "A ukulele from {b}{s}, light and easy for first-time players.",
    "Bass Ukuleles": "A U-Bass from Kala: the deep tone of a bass guitar in a ukulele-sized body.",
    "Violins": "A violin outfit from {b}{s}.",
    "Portable Keyboards": "A portable keyboard from {b}{s}.",
    "MIDI Controllers": "A USB MIDI controller from {b}{s} for playing virtual instruments in your DAW.",
    "Cables & Connectors": "A {b} cable or connector{s}.",
    "Guitar Amplifiers": "A guitar amplifier from {b}{s}.",
    "Effects & Multi-FX": "An effects unit from {b} to shape your guitar tone.",
}

def strip_colour(name):
    toks = re.split(r"[\s]+|-(?=[A-Za-z]+$)", re.sub(r"\(.*?\)", "", name).strip())
    while len(toks) > 2 and toks[-1].lower().strip('-') in COLOUR_TOKENS:
        toks.pop()
    return " ".join(toks)

def derive_specs(p):
    n = p["name"]; s = collections.OrderedDict()
    for k, v in KNOWN_GAUGE.items():
        if re.search(re.escape(k) + r"\b", n):
            s["Gauge"] = v
    if "Gauge" not in s and "Strings" in (p["category"] or ""):
        m = re.search(r"(?<!\d)(0\d|1[0-3])(\d{2})(?!\d)", n)
        if m: s["Gauge"] = f"{m.group(1)}–{m.group(2)}"
    m = re.search(r"(\d+(?:\.\d+)?)\s?(m|ft)\b", n, re.I)
    if m and p["category"] == "Cables & Connectors": s["Length"] = f"{m.group(1)} {m.group(2).lower()}"
    m = re.search(r"(\d{2})\s?(?:\"|inch)", n, re.I)
    if m and p["department"] in ("guitars", "drums"): s["Size"] = f"{m.group(1)}″"
    m = re.search(r"(\d{2})[- ]keys?", n, re.I)
    if m: s["Keys"] = m.group(1)
    m = re.search(r"\b([1-4]/[2-4])\b", n)
    if m and p["department"] == "folk": s["Size"] = m.group(1)
    m = re.search(r"(\d+)\s?w\b", n, re.I)
    if m and p["department"] == "amps": s["Power"] = f"{m.group(1)} W"
    m = re.search(r"key\s?([A-G])\b|\(([A-G])\)", n, re.I)
    if m and p["category"] == "Harmonicas": s["Key"] = (m.group(1) or m.group(2)).upper()
    m = re.search(r"(\d+(?:\.\d+)?)v\s?(\d+(?:\.\d+)?m?a)", n, re.I)
    if m: s["Output"] = f"{m.group(1)} V, {m.group(2).upper().replace('MA', ' mA').replace('A',' A') if not m.group(2).lower().endswith('ma') else m.group(2)[:-2] + ' mA'}"
    m = re.search(r"(\d+)\s?ohms", n, re.I)
    if m: s["Impedance"] = f"{m.group(1)} Ω"
    if re.search(r"left handed", n, re.I): s["Orientation"] = "Left-handed"
    if re.search(r"\b(eq|ce|sce|ace|dce|e)\b|eq\b", n, re.I) and p["department"] == "guitars" and p["category"] == "Electro-Acoustic Guitars":
        s["Electronics"] = "Built-in pickup and preamp"
    return s

def main(raw_path, img_path):
    raw = json.load(open(raw_path)); imgs = json.load(open(img_path))
    prods = raw["products"]
    fam = collections.defaultdict(list)
    for p in prods:
        p["family"] = (p["brand"] + "|" + strip_colour(p["name"])).lower()
        fam[p["family"]].append(p["id"])
    out = []
    for p in prods:
        im = imgs.get(p["id"], {})
        specs = derive_specs(p)
        gauge = f", gauge {specs['Gauge']}" if "Gauge" in specs else ""
        size = f", {specs['Size']}" if "Size" in specs else ""
        by = "" if p["brand"] in ("Generic", "Seven Notes") else f" from {p['brand']}"
        fallback = "Part of our " + p["category"].lower() + " range" + by + "."
        intro = INTRO.get(p["category"], fallback).format(g=gauge, b=p["brand"], s=size)
        out.append({
            "id": p["id"], "name": p["name"], "brand": p["brand"], "dept": p["department"], "cat": p["category"],
            "colour": p["colour"], "stock": p["stock"], "images": im.get("images", []),
            "art": ART.get(p["category"], "strings"), "specs": specs,
            "desc": intro + " " + BLURB[p["department"]],
            "variants": [v for v in fam[p["family"]] if v != p["id"]] if len(fam[p["family"]]) > 1 else [],
            "price": None,
        })
    data = {"departments": raw["departments"], "products": out}
    with open("assets/data/catalog.js", "w", encoding="utf-8") as f:
        f.write("/* Generated by scripts/build_catalog.py from the Seven Notes SKU sheet. Edit prices/stock in the sheet and rebuild. */\n")
        f.write("window.CATALOG = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(len(out), "products;", sum(1 for o in out if o["images"]), "with photos")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
