"""Turn the Seven Notes SKU sheet into structured products (brand, department, category, colour).

Usage: python3 scripts/classify.py sku.csv > scripts/products.raw.json
"""
import csv, json, re, sys

DEPARTMENTS = [
    # id, name, icon (artwork key in assets/js/art.js), blurb
    ("guitars", "Guitars & Basses", "acoustic", "Acoustic, electro-acoustic, classical, electric and bass guitars."),
    ("folk", "Ukuleles, Violins & Folk", "ukulele", "Ukuleles, violins, mandolins, harmonicas and recorders."),
    ("keys", "Keys & MIDI", "keyboard", "Portable keyboards, MIDI controllers and keyboard gear."),
    ("drums", "Drums & Percussion", "djembe", "Cajons, djembes, tongue drums, pads, sticks and shakers."),
    ("studio", "Studio & Live Sound", "mic", "Microphones, interfaces, headphones, monitors and mixers."),
    ("amps", "Amps & Effects", "amp", "Guitar amps, pedals, multi-effects and power supplies."),
    ("accessories", "Strings & Accessories", "strings", "Strings, cables, stands, capos, straps, cases and care."),
]

BRANDS = ["D'Addario", "Ernie Ball", "DR", "Olympia", "Elixir", "Martin", "Kadence", "Mahalo", "Hohner", "Granada",
          "Neowood", "Onstage", "Olive", "Hawk", "Shure", "Stagg", "TC Helicon", "IK Multimedia", "Hercules", "Rode",
          "Tycoon", "Behringer", "Audio-Technica", "Vox", "Mackie", "Valeton", "M-Vave", "NUX", "Laney", "Marshall",
          "König & Meyer", "Casio", "Yamaha", "Takamine", "Fender", "Squier", "Vic Firth", "ProMark", "Galux", "Cascha",
          "Aleen", "Stentor", "Gewa", "Ziko", "Aulos", "Tama", "Techno", "Akai", "Alesis", "ESP", "Vintage", "EKO",
          "Jackson", "Softline", "LAG", "Santana", "Kala", "ElectroFM", "Dolphin", "Westwood", "Seven Notes", "Aroma",
          "Cort", "Meinl", "Gappu", "M-Audio", "Jet", "OTO", "Ibanez", "Peavey", "Mantic", "Dunlop", "Apex", "Miraki",
          "Truecult", "Alice", "FGN", "PRS", "QTE", "Rosafeeling", "Yinyu", "Audfine", "Generic"]

BRAND_ALIASES = [
    (r"^d'?addario", "D'Addario"), (r"^ernie ball", "Ernie Ball"), (r"^dr ", "DR"), (r"^olympia", "Olympia"),
    (r"^elixir", "Elixir"), (r"^martin", "Martin"), (r"^kadence", "Kadence"), (r"^mahalo", "Mahalo"),
    (r"^hohner", "Hohner"), (r"^granada", "Granada"), (r"^neowood", "Neowood"), (r"^onstage", "Onstage"),
    (r"^olive", "Olive"), (r"^hawk", "Hawk"), (r"^shure", "Shure"), (r"^stagg", "Stagg"), (r"^tc helicon", "TC Helicon"),
    (r"^ik ", "IK Multimedia"), (r"^hercules", "Hercules"), (r"^rode", "Rode"), (r"^tycoon", "Tycoon"),
    (r"^behringer", "Behringer"), (r"^audio-?technica", "Audio-Technica"), (r"^vox", "Vox"), (r"^mackie", "Mackie"),
    (r"^valeton", "Valeton"), (r"^m-vave", "M-Vave"), (r"^nux", "NUX"), (r"^laney", "Laney"), (r"^marshall", "Marshall"),
    (r"^(konig|könig)", "König & Meyer"), (r"^casio", "Casio"), (r"^yamaha", "Yamaha"), (r"^takamine", "Takamine"),
    (r"^fender squi[er]+", "Squier"), (r"^fender", "Fender"), (r"^vic ?firth", "Vic Firth"), (r"^promark", "ProMark"),
    (r"^galux", "Galux"), (r"^cascha", "Cascha"), (r"^aleen", "Aleen"), (r"^stentor", "Stentor"), (r"^gewa", "Gewa"),
    (r"^ziko", "Ziko"), (r"^aulos", "Aulos"), (r"^tama", "Tama"), (r"^techno", "Techno"), (r"^akai", "Akai"),
    (r"^alesis", "Alesis"), (r"^esp", "ESP"), (r"^vintage", "Vintage"), (r"^eko", "EKO"), (r"^jackson", "Jackson"),
    (r"^softline", "Softline"), (r"^lag", "LAG"), (r"^santana", "Santana"), (r"^kala", "Kala"),
    (r"^electrofm", "ElectroFM"), (r"^dolphin", "Dolphin"), (r"^westwood", "Westwood"), (r"^self fabricated", "Seven Notes"),
    (r"^aroma", "Aroma"), (r"^cort", "Cort"), (r"^meinl", "Meinl"), (r"^gappu", "Gappu"), (r"^m-audio", "M-Audio"),
    (r"^jet", "Jet"), (r"^oto", "OTO"), (r"^ibanez", "Ibanez"), (r"^peavey", "Peavey"), (r"^mantic", "Mantic"),
    (r"^dunlop", "Dunlop"), (r"^apex", "Apex"), (r"^miraki", "Miraki"), (r"^truecult", "Truecult"), (r"^alice", "Alice"),
    (r"^fgn", "FGN"), (r"^prs", "PRS"), (r"^qte", "QTE"), (r"^rosafeeling", "Rosafeeling"), (r".*yinyu", "Yinyu"),
    (r".*audfine|^ah1772", "Audfine"), (r"^acoo3", "Audfine"),
]

# (regex on lowercased name, department, category). First match wins.
RULES = [
    # ---- accessories: strings -------------------------------------------------
    (r"d'?addario (ez9|nb1|xsa|xta|ej16)|d'addario .*(xsapb|xsabr)", "accessories", "Acoustic Guitar Strings"),
    (r"d'?addario (exl|nyxl)", "accessories", "Electric Guitar Strings"),
    (r"d'?addario ej27", "accessories", "Classical Guitar Strings"),
    (r"ernie ball ebl 200[46]", "accessories", "Acoustic Guitar Strings"),
    (r"ernie ball .*ebl 2(0|2)\d\d", "accessories", "Electric Guitar Strings"),
    (r"^dr ha", "accessories", "Acoustic Guitar Strings"),
    (r"olympia.*(-a1|xp-a|pf-a|art-a)", "accessories", "Acoustic Guitar Strings"),
    (r"olympia.*(-e0|-e1)", "accessories", "Electric Guitar Strings"),
    (r"olympia.*(c28|hqc)", "accessories", "Classical Guitar Strings"),
    (r"olympia.*(xp-u|uks)", "accessories", "Ukulele & Other Strings"),
    (r"olympia.*(vi310|mds)", "accessories", "Ukulele & Other Strings"),
    (r"elixir.*acoustic", "accessories", "Acoustic Guitar Strings"),
    (r"elixir.*electric", "accessories", "Electric Guitar Strings"),
    (r"martin.*string", "accessories", "Acoustic Guitar Strings"),
    (r"(acoustic guitar string|ab11|str-phb|str-a\b|ziko|alice \d)", "accessories", "Acoustic Guitar Strings"),
    (r"(violin strings|ukulele strings|str -uk)", "accessories", "Ukulele & Other Strings"),
    (r"neowood (nw200|bs-)", "accessories", "Acoustic Guitar Strings"),
    # ---- accessories: care, parts, cables, stands ---------------------------------
    (r"(detailer|carnauba|spray clear|xlr8|lemon oil|string cutter|winder)", "accessories", "Care & Maintenance"),
    (r"(bridge|tailpiece)", "folk", "Violin Accessories"),
    (r"(volume 2x tone|2 way|3 way|5 way)", "accessories", "Spare Parts"),
    (r"(aroma tg|aroma aru|aroma tm|tuner|metronome)", "accessories", "Tuners & Metronomes"),
    (r"(xlr m|xlr f)", "accessories", "Cables & Connectors"),
    (r"(connector|spekon)", "accessories", "Cables & Connectors"),
    (r"(cable|jack to jack|xlr to xlr|patch|trs to trs|trs male|roll)", "accessories", "Cables & Connectors"),
    (r"(capo|cp10)", "accessories", "Capos"),
    (r"strap", "accessories", "Straps"),
    (r"(picks)", "accessories", "Picks"),
    (r"(hardcase|guitar bag|bag|gig|agb512|egob|ec-501)", "accessories", "Bags & Cases"),
    (r"(flexlight)", "accessories", "Lights & Holders"),
    (r"(smart phone holder)", "accessories", "Lights & Holders"),
    (r"(sound hole cover)", "accessories", "Care & Maintenance"),
    (r"(foot rest)", "accessories", "Stands & Hangers"),
    (r"(guitar stand|nk09|nk15|nk51|xcg-4|gs401|17591|wall mount|hanger|gs054)", "accessories", "Stands & Hangers"),
    # ---- folk ---------------------------------------------------------------
    (r"(shoulder rest|bow|rosin)", "folk", "Violin Accessories"),
    (r"(violin|stentor|kadence v00|kadence v100)", "folk", "Violins"),
    (r"(ubass|u-bass)", "folk", "Bass Ukuleles"),
    (r"(ukelele|ukulele|ukbe|u23-tw|kadence uk|^kala |mahalo)", "folk", "Ukuleles"),
    (r"mandolin", "folk", "Mandolins"),
    (r"(harmonica|harmonca|ocean star)", "folk", "Harmonicas"),
    (r"(recorder|melodica|kazoo)", "folk", "Recorders, Melodicas & Kazoos"),
    # ---- drums --------------------------------------------------------------
    (r"(dje-|djembe)", "drums", "Djembes & Darbukas"),
    (r"(darbuka)", "drums", "Djembes & Darbukas"),
    (r"(cajon)", "drums", "Cajons"),
    (r"galux", "drums", "Steel Tongue Drums"),
    (r"(drum ?stick|drumsticks|la special)", "drums", "Drumsticks"),
    (r"(bass drum pedal)", "drums", "Drum Hardware"),
    (r"(spd|multipad|xps30|drumpads|drum kit|tad-004)", "drums", "Electronic Drums & Pads"),
    (r"(shaker|jingle|tftb)", "drums", "Hand Percussion"),
    # ---- keys ---------------------------------------------------------------
    (r"(keyboard stand|ks030|nk1[234])", "keys", "Keyboard Stands & Pedals"),
    (r"(sustain pedal)", "keys", "Keyboard Stands & Pedals"),
    (r"(midi|mpk|v25|keystation)", "keys", "MIDI Controllers"),
    (r"casio adaptor", "amps", "Power Supplies"),
    (r"(keyboard|casiotone|ct-s|ctk|ct-x|psr|k-tone|tme620|tm-480)", "keys", "Portable Keyboards"),
    # ---- studio -------------------------------------------------------------
    (r"(mic stand|microphone stand|nk30|nk40|nk93|ms00\dt)", "studio", "Mic Stands & Mounts"),
    (r"(shock mount|pop filter)", "studio", "Mic Stands & Mounts"),
    (r"(go vocal|go guitar|irig|m track|solo 2|interface)", "studio", "Audio Interfaces"),
    (r"(headphone|m50x|hpm1000|hlc660)", "studio", "Headphones"),
    (r"(studio monitor|cr3|cr4)", "studio", "Studio Monitors"),
    (r"(mixer|xenyx|xam802)", "studio", "Mixers"),
    (r"(wireless|kb02|c-5rc)", "studio", "Wireless Systems"),
    (r"(microphone|condensor|sv 200|sdm-60|nt-usb|atr|mb1k|hm50|apex)", "studio", "Microphones"),
    # ---- amps & fx ----------------------------------------------------------
    (r"(9v|9\.5v|12v)", "amps", "Power Supplies"),
    (r"(amp|vt20x|vx15gt|vmg10|mighty|lx15|ms-2c|cm15r|backstage|rage|vypyr|aroma ag|tank mini|blackbox|ol-10)", "amps", "Guitar Amplifiers"),
    (r"(m-vave|valeton|nux mg|gx100|pod-go|pedal go|bod400|fx600|ol-p100|olive ol-egt)", "amps", "Effects & Multi-FX"),
    (r"(aroma tg|aroma aru|aroma tm|ol-r600)", "amps", "Effects & Multi-FX"),
    # ---- guitars ------------------------------------------------------------
    (r"(bass guitar|trbx|v40)", "guitars", "Bass Guitars"),
    (r"(classical|c40|eko-cs|hqc|softline|cm-)", "guitars", "Classical Guitars"),
    (r"(travel|34inch|36\"|36gs|mini full)", "guitars", "Travel & Junior Guitars"),
    (r"(electric guitar|astroman|sonic start|ec-256|mh-10|v20|v60|js11|grg|js-[34]00|hss|lp-2|st-50|ol-gt pro|ol-gt strat|odyssey|ch44|pf-?d|fgn|prs)", "guitars", "Electric Guitars"),
    (r"(eq|ce\b|sce|-ace|ace |dce|vec300|t70ace|t88dce|gd11mce|-e |8e |10se|05r|slowhand.*semi|electro|fishman|fr01)", "guitars", "Electro-Acoustic Guitars"),
    (r"(acoustic|f280|fx280|fs80c|fg800|cd60s|slg200|a281|a03|a06|slowhand|kfr|westwood|oto|mantic|miraki|granada gl|gt38|qte|frontier|aroma)", "guitars", "Acoustic Guitars"),
]

COLOURS = {"black": "Black", "blk": "Black", "bk": "Black", "nat": "Natural", "natural": "Natural", "ns": "Natural",
           "sb": "Sunburst", "sunburst": "Sunburst", "brn": "Brown", "brown": "Brown", "mah": "Mahogany",
           "mahogany": "Mahogany", "red": "Red", "rd": "Red", "blue": "Blue", "blu": "Blue", "green": "Green",
           "yellow": "Yellow", "purple": "Purple", "pink": "Pink", "white": "White", "gold": "Gold", "grey": "Grey",
           "gy": "Grey", "silver": "Silver", "orange": "Orange", "or": "Orange", "wr": "Wine Red", "tbk": "Trans Black",
           "tbs": "Tobacco Sunburst", "nt": "Natural", "walnut": "Walnut"}


def clean_name(raw):
    n = re.sub(r"\s+", " ", raw.replace("\n", " ")).strip()
    fixes = {"Oiginal": "Original", "Harmonca": "Harmonica", "Ukelele": "Ukulele", "Condensor": "Condenser",
             "Tripple": "Triple", "kayboard": "Keyboard", "Sonic Start": "Sonic Strat", "Squire": "Squier",
             "Audiotechnica": "Audio-Technica", "Vicfirth": "Vic Firth", "sting": "string", "Konig & Meyer": "König & Meyer",
             "ElectroFm": "ElectroFM", "TODUAL": "to Dual"}
    for a, b in fixes.items():
        n = re.sub(a, b, n)
    n = re.sub(r"^kadence", "Kadence", n)
    n = n.replace("Kala-", "Kala ").replace("Olympia-", "Olympia ").replace("Stentor-", "Stentor ")
    n = n.replace("VOX- ", "Vox ").replace("VOX-", "Vox ").replace("Mantic MTC", "Mantic")
    # Title-case shouting names (QTE, ROSAFEELING, YINYU...) but keep model codes.
    if sum(c.isupper() for c in n) > 0.6 * sum(c.isalpha() for c in n):
        n = " ".join(w if re.search(r"\d", w) or len(w) <= 3 else w.capitalize() for w in n.split())
    # Upper-case model codes (Fs80c -> FS80C) and spell out a trailing colour code (Nat -> Natural).
    words = n.split(" ")
    words = [w.upper() if re.search(r"\d", w) and re.search(r"[a-z]", w) and not re.search(r"\d(m|ft|w|v|a|ma|mm|kg)$", w, re.I) and "/" not in w else w for w in words]
    tail = {"nat": "Natural", "bk": "Black", "blk": "Black", "sb": "Sunburst", "brn": "Brown", "mah": "Mahogany", "or": "Orange",
            "tbk": "Trans Black", "tbs": "Tobacco Sunburst", "gy": "Grey", "bu": "Blue", "trd": "Trans Red", "tcf": "Coffee"}
    if len(words) > 2 and words[-1].lower() in tail:
        words[-1] = tail[words[-1].lower()]
    return " ".join(words)


def brand_of(lower):
    for pat, b in BRAND_ALIASES:
        if re.search(pat, lower):
            return b
    return "Generic"


def classify(lower):
    for pat, dep, cat in RULES:
        if re.search(pat, lower):
            return dep, cat
    return None, None


def colour_of(name):
    words = re.findall(r"[a-z]+", name.lower())
    for w in reversed(words):
        if w in COLOURS:
            return COLOURS[w]
    return None


def slugify(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def main(path):
    rows = list(csv.reader(open(path, encoding="utf-8")))
    out, seen = [], set()
    for row in rows[2:]:
        if not row or not row[0].strip():
            continue
        raw = row[0]
        name = clean_name(raw)
        lower = name.lower()
        try:
            qty = int(float(row[2]))
        except (ValueError, IndexError):
            qty = 0
        dep, cat = classify(lower)
        slug = slugify(raw.strip())
        while slug in seen:
            slug += "-2"
        seen.add(slug)
        out.append({"id": slug, "sheetName": raw.strip(), "name": name, "brand": brand_of(lower),
                    "department": dep, "category": cat, "colour": colour_of(name), "stock": max(qty, 0)})
    json.dump({"departments": [dict(zip(["id", "name", "icon", "blurb"], d)) for d in DEPARTMENTS],
               "products": out}, sys.stdout, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1])
