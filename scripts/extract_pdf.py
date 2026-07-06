"""Extract the counter-sales register from SALE FIGURE.pdf into JSON.

Pure-stdlib parser: decompresses the PDF content streams and walks the
text-show operators. Row layout in the register (font `/c`):
  <name fragments...> <opening> <closing> <sold> <rate> <amount>
followed by date + shop ID in font `/a`. Header text uses fonts /9 and /b.
"""

import json
import re
import sys
import zlib
from pathlib import Path

PDF_PATH = Path(r"C:\Users\ROG\Downloads\SALE FIGURE.pdf")
OUT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data")

ESCAPES = {"n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f",
           "(": "(", ")": ")", "\\": "\\"}


def unescape(s: str) -> str:
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            nxt = s[i + 1]
            if nxt in ESCAPES:
                out.append(ESCAPES[nxt])
                i += 2
                continue
            m = re.match(r"[0-7]{1,3}", s[i + 1:])
            if m:
                out.append(chr(int(m.group(0), 8)))
                i += 1 + len(m.group(0))
                continue
        out.append(c)
        i += 1
    return "".join(out)


# Token patterns inside a decompressed content stream.
TOKEN_RE = re.compile(
    r"/(?P<font>\w+)\s+[\d.]+\s+Tf"                      # font switch
    r"|\((?P<tj>(?:\\.|[^\\()])*)\)\s*Tj"                # (string) Tj
    r"|\[(?P<tjarr>(?:\((?:\\.|[^\\()])*\)|[^\]])*)\]\s*TJ"  # [ ... ] TJ
)
ARR_STR_RE = re.compile(r"\(((?:\\.|[^\\()])*)\)")


def text_runs(pdf_bytes: bytes):
    """Yield (font, text) pairs across all content streams, in order."""
    font = None
    for raw in re.findall(rb"stream\r?\n(.*?)endstream", pdf_bytes, re.S):
        try:
            content = zlib.decompress(raw).decode("latin-1")
        except zlib.error:
            continue
        for m in TOKEN_RE.finditer(content):
            if m.group("font"):
                font = m.group("font")
            elif m.group("tj") is not None:
                yield font, unescape(m.group("tj"))
            else:
                parts = [unescape(p) for p in ARR_STR_RE.findall(m.group("tjarr"))]
                yield font, "".join(parts)


NUM_RE = re.compile(r"^\s*\d+(?:\.\d+)?\s*$")


def _grouped(nums: list[str]):
    """Group numeric fragments into the 5 row values.

    A value can be split across adjacent show-ops by kerning (e.g. amount
    '14110.00' arriving as '14' + '110.00'). Try all adjacent-concatenation
    groupings into 5 values and keep one satisfying the register invariants:
    opening/closing/sold are ints, rate & amount are decimals, and
    amount == sold * rate.
    """
    def splits(tokens, parts):
        if parts == 1:
            yield ["".join(tokens)]
            return
        for cut in range(1, len(tokens) - parts + 2):
            for rest in splits(tokens[cut:], parts - 1):
                yield ["".join(tokens[:cut])] + rest

    for cand in splits(nums, 5):
        o, c, s, r, a = cand
        if "." in o or "." in c or "." in s or "." not in r or "." not in a:
            continue
        opening, closing, sold = int(o), int(c), int(s)
        rate, amount = float(r), float(a)
        if abs(amount - sold * rate) < 0.01:
            return opening, closing, sold, rate, amount
    return None


def parse_rows(pdf_bytes: bytes, debug: bool = False):
    rows = []
    run: list[str] = []

    def flush():
        if not run:
            return
        raw = [t for t in run if t.strip()]
        toks = [t.strip() for t in raw]
        # trailing run of numeric tokens holds the 5 row values
        i = len(toks)
        while i > 0 and NUM_RE.match(toks[i - 1]):
            i -= 1
        nums, name_toks = toks[i:], raw[:i]
        parsed = None
        if name_toks and len(nums) == 5 and "." in nums[3] and "." in nums[4] \
                and not any("." in n for n in nums[:3]):
            parsed = (int(nums[0]), int(nums[1]), int(nums[2]),
                      float(nums[3]), float(nums[4]))
        elif name_toks and len(nums) > 5:
            parsed = _grouped(nums)
        if parsed:
            # ops continue mid-word; explicit spaces are already in the text
            name = re.sub(r"\s+", " ", "".join(name_toks)).strip()
            opening, closing, sold, rate, amount = parsed
            rows.append({"name": name, "opening": opening, "closing": closing,
                         "sold": sold, "rate": rate, "amount": amount})
        elif debug:
            print("DISCARDED RUN:", toks)
        run.clear()

    for font, text in text_runs(pdf_bytes):
        if font == "c":
            run.append(text)
        else:
            flush()
    flush()
    return rows


CATEGORY_RULES = [
    ("RTD", ["BREEZER", "SMIRNOFF ICE", "COOLER", "RIO ", "PARTY DRINK",
             "SELTZER", "BRO CODE", "BROSE", "BRO LIGHT", "MISFIT"]),
    ("WHISKY", ["WHISKY", "WHISKEY", "WISHKY", "WHYSKY", "WHISHKY", "SCOTCH",
                "SCOTH", "PIPER", "MCDOWELL", "ROYAL STAG", "IMPERIAL BLUE",
                "BLENDERS PRIDE", "SIGNATURE", "ANTIQUITY", "TEACHER", "VAT 69",
                "BLACK DOG", "JAMESON", "GLENLIVET", "GLENFIDDICH",
                "JOHNNIE WALKER", "JOHNIE", "RED LABEL", "BLACK LABEL",
                "CHIVAS", "BALLANTINE", "JACK DANIEL", "8 PM", "ROYAL CHALLENGE",
                "OAK SMITH", "STERLING RESERVE", "ROYAL GREEN", "AMERICAN PRIDE",
                "AFTER DARK", "ROCKFORD", "100 PIPERS", "DEWAR", "DEEWAR",
                "GLENMORANGIE", "MONKEY SHOULDER", "TALISKER", "SINGLETON",
                "LABEL 5", "GRANTS", "GRANT'S", "PASSPORT", "SOMETHING SPECIAL",
                "OFFICERS CHOICE", "OFFICER'S CHOICE", "BUSHMILLS", "MACALLAN",
                "JIM BEAM", "WILLIAM LAWSON", "SINGLE MALT", "AMRUT",
                "IB FINEST", "ROYAL ENVY", "CLIFF HANGER", "ROULETTE PEATED",
                "GLEN PARKER", "IRISH WHI", "BOURBON", "BOURBOON"]),
    ("BEER", ["BEER", "KINGFISHER", "K FISHER", "KF ", "BUDWEISER", "TUBORG",
              "TUBERG", "CARLSBERG", "HEINEKEN", "BIRA", "CORONA", "HAYWARD",
              "KNOCK OUT", "KNOCKOUT", "HUNTER", "FOSTER", "GODFATHER",
              "MILLER", "ULTRA MAX", "MAGNUM", "DANSBERG", "SIMBA", "LAGER",
              "STRONG", "WHEAT AC", "MAHARANI BLUE", "STORMM"]),
    ("RUM", ["RUM", "OLD MONK", "CAPTAIN MORGAN", "BACARDI", "MCDOWELL NO.1 CEL",
             "CELEBRATION"]),
    ("VODKA", ["VODKA", "MAGIC MOMENT", "SMIRNOFF", "ABSOLUT", "GREY GOOSE",
               "ROMANOV", "WHITE MISCHIEF", "MAGIC MMTS"]),
    ("BRANDY", ["BRANDY", "BRAND Y", "MANSION HOUSE", "MORPHEUS", "HONEY BEE",
                "COURRIER", "NAPOLEON"]),
    ("GIN", ["GIN", "BLUE RIBAND", "GREATER THAN", "STRANGER & SONS",
             "BEEFEATER", "BEE FEATER", "MONKEY 47"]),
    ("WINE", ["WINE", "PORT ", "SULA", "FRATELLI", "BIG BANYAN", "SHIRAZ",
              "SHIRAJ", "CABERNET", "CARBENET", "CHENIN", "SAUVIGNON",
              "ZINFANDEL", "MOSCATO", "CHARDONNAY", "PINOT", "MERLOT",
              "MEROLT", "ROSE", "RIOJA", "BRUT", "SPARKLING", "JACOB",
              "HARDYS", "GROVER", "MATEUS", "TILT", "SYRAH", "GRANACHE",
              "MULLED"]),
]


def categorize(name: str) -> str:
    up = " " + name.upper() + " "
    for cat, keys in CATEGORY_RULES:
        for k in keys:
            if k in up:
                return cat
    return "OTHER"


PACK_RE = re.compile(r"\(?0*(\d{2,4})\)?\s*(?:ML)?\s*$", re.I)


def pack_size(name: str) -> int | None:
    m = PACK_RE.search(name.strip())
    if m:
        v = int(m.group(1))
        if 50 <= v <= 2000:
            return v
    return None


def slugify(name: str, seen: set[str]) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    base, n = s, 2
    while s in seen:
        s = f"{base}-{n}"
        n += 1
    seen.add(s)
    return s


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    pdf = PDF_PATH.read_bytes()
    rows = parse_rows(pdf, debug="--debug" in sys.argv)

    seen: set[str] = set()
    products, inventory = [], []
    for r in rows:
        pid = slugify(r["name"], seen)
        products.append({
            "id": pid,
            "name": r["name"],
            "category": categorize(r["name"]),
            "packSizeMl": pack_size(r["name"]),
            "mrp": r["rate"],
        })
        inventory.append({
            "productId": pid,
            "openingQty": r["opening"],
            "closingQty": r["closing"],
            "soldQty": r["sold"],
            "rate": r["rate"],
            "amount": r["amount"],
        })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "products.json").write_text(
        json.dumps(products, indent=1), encoding="utf-8")
    (OUT_DIR / "four-friends-inventory.json").write_text(
        json.dumps(inventory, indent=1), encoding="utf-8")

    # ---- sanity report vs. research-report figures ----
    units = sum(r["sold"] for r in rows)
    gmv = sum(r["amount"] for r in rows)
    nonzero = sum(1 for r in rows if r["sold"] > 0)
    print(f"rows/SKUs        : {len(rows)}   (expected ~706)")
    print(f"non-zero-sale SKU: {nonzero}   (expected 332)")
    print(f"units sold       : {units}   (expected 44595)")
    print(f"GMV              : {gmv:,.2f}   (expected 13,049,470)")

    by_cat: dict[str, float] = {}
    for p, inv in zip(products, inventory):
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + inv["amount"]
    print("\ncategory GMV mix:")
    for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"  {cat:8s} {amt/gmv*100:5.1f}%  ₹{amt:,.0f}")

    uncat = [p["name"] for p in products if p["category"] == "OTHER"]
    print(f"\nOTHER category: {len(uncat)} SKUs")
    for n in uncat[:25]:
        print("   ", n)


if __name__ == "__main__":
    main()
