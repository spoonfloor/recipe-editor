// Ingredient paste parser helpers (qty/unit/name/prep/optional + range/approx).
(function () {
  'use strict';

  const OPTIONAL_PATTERNS = [
    /\boptional\b/i,
    /\bif desired\b/i,
  ];
  const QUALITATIVE_AMOUNT_PATTERNS = [/\bto taste\b/i, /\bas needed\b/i];
  const LEADING_VARIANT_PREFIXES = new Set(['raw', 'frozen', 'smoked', 'fresh', 'dried', 'uncooked']);
  const INFERRED_LEADING_UNITS = new Set([
    'head',
    'heads',
    'crown',
    'crowns',
    'package',
    'packages',
    'pkg',
    'pkgs',
    'bag',
    'bags',
    'shake',
    'shakes',
    'stalk',
    'stalks',
    'sprig',
    'sprigs',
    'handful',
    'handfuls',
  ]);
  const PREP_TRAILING_TERMS = [
    'chopped',
    'minced',
    'diced',
    'sliced',
    'crushed',
    'grated',
    'shredded',
    'peeled',
    'cubed',
    'julienned',
    'halved',
    'cut',
  ];
  const PREP_TRAILING_MODIFIERS = ['finely', 'coarsely', 'roughly', 'thinly', 'thickly', 'freshly'];
  const PREP_TRAILING_TAIL_ADJECTIVES = ['thin', 'thick', 'fine', 'coarse', 'lengthwise', 'crosswise'];
  // Product-driven compounds that should stay as full ingredient names.
  // These are lexicalized ingredients, not adjective+base variant pairs.
  const PROTECTED_COMPOUND_NAMES = new Set(
    [
      'green onion',
      'spring onion',
      'bell pepper',
      'chile pepper',
      'jalapeno pepper',
      'serrano pepper',
      'sweet potato',
      'green bean',
      'snap pea',
      'snow pea',
      'bok choy',
      'brussels sprout',
      'baby spinach',
      'garbanzo bean',
      'black-eyed pea',
      'soy sauce',
      'fish sauce',
      'worcestershire sauce',
      'coconut milk',
      'peanut butter',
      'black pepper',
      'white pepper',
      'red pepper',
      'corn syrup',
      'baking soda',
      'baking powder',
      'vanilla extract',
      'orange extract',
    ].map((v) => String(v || '').toLowerCase())
  );
  const SPICE_FORM_BASES = new Set(
    [
      'nutmeg',
      'cumin',
      'cumin seed',
      'coriander',
      'coriander seed',
      'cardamom',
      'clove',
      'fennel seed',
      'mustard seed',
      'cinnamon',
      'allspice',
      'paprika',
    ].map((v) => String(v || '').toLowerCase())
  );
  const HERB_FRESHNESS_BASES = new Set(
    [
      'basil',
      'oregano',
      'thyme',
      'rosemary',
      'parsley',
      'dill',
      'cilantro',
      'sage',
      'mint',
    ].map((v) => String(v || '').toLowerCase())
  );
  const VINEGAR_TYPES = new Set(
    [
      'apple cider',
      'rice',
      'red wine',
      'white wine',
      'white',
      'balsamic',
      'malt',
      'sherry',
      'champagne',
      'distilled',
    ].map((v) => String(v || '').toLowerCase())
  );
  const SODIUM_QUALIFIED_BASES = new Set(
    [
      'soy sauce',
      'broth',
      'stock',
      'chicken broth',
      'beef broth',
      'vegetable broth',
      'chicken stock',
      'beef stock',
      'vegetable stock',
    ].map((v) => String(v || '').toLowerCase())
  );
  const DRY_BEAN_VARIANTS = new Set(
    [
      'pinto',
      'black',
      'kidney',
      'red kidney',
      'navy',
      'cannellini',
      'great northern',
      'cranberry',
      'borlotti',
      'adzuki',
      'mung',
      'white',
    ].map((v) => String(v || '').toLowerCase())
  );
  const TOFU_TEXTURE_VARIANTS = new Set(['silken', 'firm', 'extra firm', 'extra-firm']);
  const SHELLED_VARIANT_BASES = new Set(['peanut', 'peanuts', 'edamame']);
  const PRODUCE_COLOR_PREFIXES = new Set(['purple', 'red', 'green', 'yellow', 'white']);
  const COLOR_VARIANT_BASES = new Set(
    ['cabbage', 'onion', 'carrot', 'potato', 'cauliflower', 'zucchini', 'broccoli'].map((v) =>
      String(v || '').toLowerCase()
    )
  );
  const LETTUCE_VARIETIES = new Set(
    [
      'butter',
      'romaine',
      'iceberg',
      'bibb',
      'boston',
      'butterhead',
      'oak leaf',
      'red leaf',
      'green leaf',
      'leaf',
      'little gem',
    ].map((v) => String(v || '').toLowerCase())
  );

  function normalizeDash(text) {
    return String(text || '')
      .replace(/[‐‑–—]/g, '-')
      .replace(/\s*-\s*/g, '-');
  }

  function singularizeSimpleNoun(noun) {
    const n = String(noun || '').trim().toLowerCase();
    if (!n) return '';
    if (n === 'tomatoes') return 'tomato';
    if (n === 'potatoes') return 'potato';
    if (n.endsWith('ies') && n.length > 3) return `${n.slice(0, -3)}y`;
    if (n.endsWith('es') && /(ches|shes|xes|zes|ses)$/.test(n)) {
      return n.slice(0, -2);
    }
    if (n.endsWith('s') && !n.endsWith('ss')) return n.slice(0, -1);
    return n;
  }

  function splitColorQualifiedProduce(text) {
    const src = normalizeDash(normalizeWhitespace(String(text || '').toLowerCase()));
    if (!src) return null;
    const m = src.match(/^([a-z][a-z-]*)\s+(.+)$/);
    if (!m) return null;
    const color = m[1];
    const baseRaw = normalizeWhitespace(m[2] || '');
    const base = singularizeSimpleNoun(baseRaw);
    if (!PRODUCE_COLOR_PREFIXES.has(color)) return null;
    if (!COLOR_VARIANT_BASES.has(base)) return null;
    return { name: base, variant: color };
  }

  function splitLettuceVariety(text) {
    const raw = normalizeWhitespace(text);
    const m = raw.match(/^(.+?)\s+lettuce$/i);
    if (!m) return null;
    const varietyRaw = normalizeWhitespace(m[1] || '');
    const varietyKey = varietyRaw.toLowerCase();
    if (!LETTUCE_VARIETIES.has(varietyKey)) return null;
    return { name: 'lettuce', variant: varietyKey };
  }

  function splitIngredientNameAndVariant(nameText) {
    const raw = normalizeWhitespace(nameText);
    if (!raw) return { name: '', variant: '', size: '' };
    const lower = raw.toLowerCase();
    const singularizedLower = singularizeSimpleNoun(lower);
    const normalizedLower = normalizeDash(lower);
    if (PROTECTED_COMPOUND_NAMES.has(lower) || PROTECTED_COMPOUND_NAMES.has(singularizedLower)) {
      return { name: raw, variant: '', size: '' };
    }

    const colorProduceSplit = splitColorQualifiedProduce(raw);
    if (colorProduceSplit) {
      return { name: colorProduceSplit.name, variant: colorProduceSplit.variant, size: '' };
    }

    const lettuceVarietySplit = splitLettuceVariety(raw);
    if (lettuceVarietySplit) {
      return {
        name: lettuceVarietySplit.name,
        variant: lettuceVarietySplit.variant,
        size: '',
      };
    }

    // Keep these as distinct ingredients, not "oil" variants.
    if (lower === 'olive oil' || lower === 'sesame oil') {
      return { name: lower, variant: '', size: '' };
    }

    // High-confidence targeted split: olive oil style variants.
    const oliveMatch = normalizeDash(lower).match(
      /^(extra-virgin|virgin|light)\s+olive oil$/
    );
    if (oliveMatch) {
      return {
        name: 'olive oil',
        variant: oliveMatch[1],
        size: '',
      };
    }

    // High-confidence targeted split: sesame oil style variants.
    const sesameMatch = normalizeDash(lower).match(/^(toasted|dark|light)\s+sesame oil$/);
    if (sesameMatch) {
      return {
        name: 'sesame oil',
        variant: sesameMatch[1],
        size: '',
      };
    }

    // High-confidence tofu texture descriptors.
    const tofuTextureMatch = normalizedLower.match(/^([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)\s+tofu$/);
    if (tofuTextureMatch) {
      const normalizedTexture = normalizeWhitespace(normalizeDash(tofuTextureMatch[1] || ''));
      if (TOFU_TEXTURE_VARIANTS.has(normalizedTexture)) {
        return {
          name: 'tofu',
          variant: normalizedTexture,
          size: '',
        };
      }
    }

    // High-confidence sesame seed prep descriptor.
    const toastedSesameSeedMatch = normalizedLower.match(/^toasted\s+sesame seeds?$/);
    if (toastedSesameSeedMatch) {
      return {
        name: 'sesame seed',
        variant: 'toasted',
        size: '',
      };
    }

    // High-confidence pickled ginger descriptor.
    const pickledGingerMatch = normalizedLower.match(/^pickled\s+ginger$/);
    if (pickledGingerMatch) {
      return {
        name: 'ginger',
        variant: 'pickled',
        size: '',
      };
    }

    // High-confidence shelled nut/legume descriptor.
    const shelledMatch = normalizedLower.match(/^shelled\s+(.+)$/);
    if (shelledMatch) {
      const shelledBase = singularizeSimpleNoun(normalizeWhitespace(shelledMatch[1] || ''));
      if (SHELLED_VARIANT_BASES.has(shelledBase)) {
        return {
          name: shelledBase,
          variant: 'shelled',
          size: '',
        };
      }
    }

    // Group generic oils under "oil", preserving source modifier as variant.
    // e.g., "canola oil" -> { name: "oil", variant: "canola" }
    const genericOilMatch = lower.match(/^([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)\s+oil$/);
    if (genericOilMatch) {
      const oilType = normalizeWhitespace(genericOilMatch[1] || '');
      if (oilType && oilType !== 'olive' && oilType !== 'sesame') {
        return {
          name: 'oil',
          variant: oilType,
          size: '',
        };
      }
    }

    // High-confidence tomato processing descriptors.
    const tomatoMatch = normalizeDash(lower).match(
      /^(crushed|diced|whole|peeled|stewed|fire-roasted|roasted|sun-dried)\s+tomatoes?$/
    );
    if (tomatoMatch) {
      return {
        name: 'tomato',
        variant: tomatoMatch[1],
        size: '',
      };
    }

    // High-confidence herb freshness descriptors.
    const herbFreshnessMatch = normalizedLower.match(/^(fresh|dried)\s+(.+)$/);
    if (herbFreshnessMatch) {
      const herbBase = singularizeSimpleNoun(herbFreshnessMatch[2]);
      if (HERB_FRESHNESS_BASES.has(herbBase)) {
        return {
          name: herbBase,
          variant: herbFreshnessMatch[1],
          size: '',
        };
      }
    }

    // High-confidence spice prep descriptors.
    const spiceFormMatch = normalizedLower.match(/^(ground|whole|crushed)\s+(.+)$/);
    if (spiceFormMatch) {
      const spiceBase = singularizeSimpleNoun(spiceFormMatch[2]);
      if (SPICE_FORM_BASES.has(spiceBase)) {
        return {
          name: spiceBase,
          variant: spiceFormMatch[1],
          size: '',
        };
      }
    }

    // High-confidence sodium qualifiers.
    const sodiumMatch = normalizedLower.match(/^(low-sodium|reduced-sodium|no-salt-added)\s+(.+)$/);
    if (sodiumMatch) {
      const sodiumBase = normalizeWhitespace(sodiumMatch[2] || '');
      if (SODIUM_QUALIFIED_BASES.has(sodiumBase)) {
        return {
          name: sodiumBase,
          variant: sodiumMatch[1],
          size: '',
        };
      }
    }

    // Common butter salt-level descriptor.
    const butterMatch = normalizedLower.match(/^(unsalted|salted)\s+butter$/);
    if (butterMatch) {
      return {
        name: 'butter',
        variant: butterMatch[1],
        size: '',
      };
    }

    // Common brown sugar intensity descriptor.
    const brownSugarMatch = normalizedLower.match(/^(light|dark)\s+brown sugar$/);
    if (brownSugarMatch) {
      return {
        name: 'brown sugar',
        variant: brownSugarMatch[1],
        size: '',
      };
    }

    // Common rice style descriptors (single- and multi-word).
    const RICE_VARIANTS = new Set(
      [
        'white',
        'brown',
        'jasmine',
        'basmati',
        'dry white',
        'dry brown',
        'long grain',
        'long-grain',
        'short grain',
        'short-grain',
      ].map((v) => String(v || '').toLowerCase())
    );
    const riceVariantMatch = normalizedLower.match(/^(.+)\s+rice$/);
    if (riceVariantMatch) {
      const variant = normalizeWhitespace(riceVariantMatch[1] || '');
      if (RICE_VARIANTS.has(variant)) {
        return {
          name: 'rice',
          variant,
          size: '',
        };
      }
    }

    // High-confidence dry bean variety descriptors.
    const beanVariantMatch = normalizedLower.match(/^(.+)\s+beans?$/);
    if (beanVariantMatch) {
      const beanVariant = normalizeWhitespace(beanVariantMatch[1] || '');
      if (DRY_BEAN_VARIANTS.has(beanVariant)) {
        return {
          name: 'bean',
          variant: beanVariant,
          size: '',
        };
      }
    }

    // Egg size descriptors.
    const eggMatch = normalizedLower.match(/^(small|medium|large|extra-large)\s+eggs?$/);
    if (eggMatch) {
      return {
        name: singularizeSimpleNoun('eggs'),
        variant: '',
        size: eggMatch[1],
      };
    }

    // Generic produce size descriptors.
    const produceSizeMatch = normalizedLower.match(/^(small|medium|large|extra-large)\s+(.+)$/);
    if (produceSizeMatch) {
      const produceBase = normalizeWhitespace(produceSizeMatch[2] || '');
      const produceColorSplit = splitColorQualifiedProduce(produceBase);
      if (produceColorSplit) {
        return {
          name: produceColorSplit.name,
          variant: produceColorSplit.variant,
          size: produceSizeMatch[1],
        };
      }
      return {
        name: singularizeSimpleNoun(produceBase),
        variant: '',
        size: produceSizeMatch[1],
      };
    }

    const potatoTypeMatch = normalizedLower.match(/^(gold|yukon gold|red|yellow|russet)\s+potatoes?$/);
    if (potatoTypeMatch) {
      return {
        name: 'potato',
        variant: potatoTypeMatch[1],
        size: '',
      };
    }

    const brothLikeMatch = normalizedLower.match(
      /^([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)\s+(broth|stock|bouillon|bullion)$/
    );
    if (brothLikeMatch) {
      return {
        name: brothLikeMatch[2],
        variant: brothLikeMatch[1],
        size: '',
      };
    }

    if (normalizedLower === 'bay leaves' || normalizedLower === 'bay leaf') {
      return {
        name: 'bay leaf',
        variant: '',
        size: '',
      };
    }

    // Cooking wine colors: red wine / white wine -> wine + color variant.
    const wineColorMatch = normalizedLower.match(/^(red|white)\s+wine$/);
    if (wineColorMatch) {
      return {
        name: 'wine',
        variant: wineColorMatch[1],
        size: '',
      };
    }

    // Normalize common vinegar source styles.
    const vinegarMatch = normalizedLower.match(/^([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)\s+vinegar$/);
    if (vinegarMatch) {
      const vinegarType = normalizeWhitespace(vinegarMatch[1] || '');
      if (VINEGAR_TYPES.has(vinegarType)) {
        return {
          name: 'vinegar',
          variant: vinegarType,
          size: '',
        };
      }
    }

    // Dietary qualifier as a prefix modifier.
    const veganMatch = normalizedLower.match(/^vegan\s+(.+)$/);
    if (veganMatch) {
      const veganBase = normalizeWhitespace(veganMatch[1] || '');
      if (veganBase && veganBase.split(' ').length >= 2) {
        return {
          name: veganBase,
          variant: 'vegan',
          size: '',
        };
      }
    }

    const noodleVariantMatch = normalizedLower.match(/^(.+)\s+noodles?$/);
    if (noodleVariantMatch) {
      const variant = normalizeWhitespace(noodleVariantMatch[1] || '');
      if (variant) {
        return {
          name: 'noodle',
          variant,
          size: '',
        };
      }
    }

    const leadingVariantMatch = normalizedLower.match(/^([a-z][a-z-]*)\s+(.+)$/);
    if (leadingVariantMatch) {
      const prefix = leadingVariantMatch[1];
      const base = normalizeWhitespace(leadingVariantMatch[2] || '');
      const baseLower = base.toLowerCase();
      if (
        LEADING_VARIANT_PREFIXES.has(prefix) &&
        base &&
        !PROTECTED_COMPOUND_NAMES.has(baseLower)
      ) {
        return {
          name: base,
          variant: prefix,
          size: '',
        };
      }
    }

    return { name: raw, variant: '', size: '' };
  }

  const UNIT_ALIASES = {
    t: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    tsp: 'tsp',
    'tsp.': 'tsp',
    tb: 'tbsp',
    tbl: 'tbsp',
    tbspn: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    tbs: 'tbsp',
    tbsp: 'tbsp',
    'tbsp.': 'tbsp',
    floz: 'fl oz',
    'fl.oz': 'fl oz',
    'fl oz': 'fl oz',
    fluidounce: 'fl oz',
    fluidounces: 'fl oz',
    c: 'cup',
    ounce: 'oz',
    ounces: 'oz',
    oz: 'oz',
    pound: 'lb',
    pounds: 'lb',
    lb: 'lb',
    lbs: 'lb',
    pt: 'pt',
    pint: 'pt',
    pints: 'pt',
    qt: 'qt',
    quart: 'qt',
    quarts: 'qt',
    gal: 'gal',
    gallon: 'gal',
    gallons: 'gal',
    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    g: 'g',
    gram: 'g',
    grams: 'g',
    kg: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    cup: 'cup',
    cups: 'cup',
    clove: 'clove',
    cloves: 'clove',
    can: 'can',
    cans: 'can',
    bunch: 'bunch',
    bunches: 'bunch',
    // Colloquial count units (e.g., "3 shakes soy sauce").
    bag: 'bag',
    bags: 'bag',
    head: 'head',
    heads: 'head',
    package: 'package',
    packages: 'package',
    pkg: 'package',
    pkgs: 'package',
    shake: 'shake',
    shakes: 'shake',
    stalk: 'stalk',
    stalks: 'stalk',
    crown: 'crown',
    crowns: 'crown',
    sprig: 'sprig',
    sprigs: 'sprig',
    leaf: 'leaf',
    leaves: 'leaf',
    handful: 'handful',
    handfuls: 'handful',
    pinch: 'pinch',
    pinches: 'pinch',
    dash: 'dash',
    dashes: 'dash',
  };

  const UNICODE_FRACTIONS = {
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75,
    '⅓': 1 / 3,
    '⅔': 2 / 3,
    '⅛': 0.125,
    '⅜': 0.375,
    '⅝': 0.625,
    '⅞': 0.875,
  };

  function normalizeWhitespace(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toFractionAscii(ch) {
    const val = UNICODE_FRACTIONS[ch];
    if (val == null) return null;
    const map = {
      0.25: '1/4',
      0.5: '1/2',
      0.75: '3/4',
      0.3333333333333333: '1/3',
      0.6666666666666666: '2/3',
      0.125: '1/8',
      0.375: '3/8',
      0.625: '5/8',
      0.875: '7/8',
    };
    return map[val] || null;
  }

  function normalizeUnicodeFractionsInText(text) {
    let out = String(text || '');
    out = out.replace(
      /(\d)\s*([¼½¾⅓⅔⅛⅜⅝⅞])/g,
      (_, whole, frac) => `${whole} ${toFractionAscii(frac) || frac}`
    );
    out = out.replace(/([¼½¾⅓⅔⅛⅜⅝⅞])/g, (m) => toFractionAscii(m) || m);
    return out;
  }

  function detectOptional(rawLine) {
    const line = String(rawLine || '');
    return OPTIONAL_PATTERNS.some((rx) => rx.test(line));
  }

  function extractQualitativeAmountPhrases(text) {
    let src = normalizeWhitespace(text);
    const phrases = [];
    if (!src) return { text: '', phrases: [] };

    const addPhrase = (value) => {
      const next = normalizeWhitespace(value || '').toLowerCase();
      if (!next) return;
      if (!phrases.includes(next)) phrases.push(next);
    };

    const leading = src.match(/^(as needed|to taste)\s*,?\s+(.+)$/i);
    if (leading) {
      addPhrase(leading[1]);
      src = normalizeWhitespace(leading[2]);
    }

    const trailing = src.match(/^(.+?)\s+(to taste|as needed)$/i);
    if (trailing) {
      src = normalizeWhitespace(trailing[1]);
      addPhrase(trailing[2]);
    }

    return { text: src, phrases };
  }

  function stripOptionalLanguage(text) {
    let out = String(text || '');
    OPTIONAL_PATTERNS.forEach((rx) => {
      out = out.replace(new RegExp(rx.source, 'gi'), '');
    });
    out = out.replace(/\(\s*,*\s*\)/g, '');
    out = out.replace(/\s+,/g, ',');
    return normalizeWhitespace(out).replace(/^[,;:\-]\s*/, '').trim();
  }

  function parseFractionText(token) {
    const t = normalizeUnicodeFractionsInText(String(token || '')).trim();
    if (!t) return null;

    if (UNICODE_FRACTIONS[t] != null) return UNICODE_FRACTIONS[t];

    const mixed = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      const whole = Number(mixed[1]);
      const num = Number(mixed[2]);
      const den = Number(mixed[3]);
      if (den !== 0) return whole + num / den;
      return null;
    }

    const frac = t.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (frac) {
      const num = Number(frac[1]);
      const den = Number(frac[2]);
      if (den !== 0) return num / den;
      return null;
    }

    if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(t)) return Number(t);
    return null;
  }

  function parseLeadingQuantity(text) {
    const src = normalizeUnicodeFractionsInText(String(text || '').trim());
    if (!src) return { quantity: '', rest: '' };

    const qtyMatch = src.match(
      /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?|\.\d+|[¼½¾⅓⅔⅛⅜⅝⅞])\b\s*(.*)$/
    );
    if (!qtyMatch) return { quantity: '', rest: src };

    const quantity = parseFractionText(qtyMatch[1]);
    return {
      quantity: quantity == null ? '' : quantity,
      rest: String(qtyMatch[2] || '').trim(),
    };
  }

  function parseGluedQuantityAndUnit(text, options) {
    const src = normalizeUnicodeFractionsInText(String(text || '').trim());
    if (!src) return null;

    const registry = getIngredientPasteUnitRegistry(options);
    const m = src.match(/^(\d+(?:\.\d+)?|\.\d+)([A-Za-z]+(?:\.[A-Za-z]+)*)(.*)$/);
    if (!m) return null;

    const quantity = parseFractionText(m[1]);
    const qNum = quantity == null ? null : Number(quantity);
    if (!Number.isFinite(qNum)) return null;

    const unit = registry.resolve(m[2]);
    if (!unit) return null;

    return {
      quantity: qNum,
      quantityMin: qNum,
      quantityMax: qNum,
      unit,
      rest: String(m[3] || '').trim(),
    };
  }

  function parseQuantityDescriptor(text, options) {
    const src = normalizeUnicodeFractionsInText(
      String(text || '')
        .replace(/[–—]/g, '-')
        .trim()
    );
    if (!src) {
      return {
        quantity: '',
        quantityMin: null,
        quantityMax: null,
        quantityIsApprox: false,
        rest: '',
      };
    }

    const approxRegex = /^(about|approx(?:\.|imately)?|around|roughly|~)\s+/i;
    let rest = src;
    let isApprox = false;
    const approxMatch = rest.match(approxRegex);
    if (approxMatch) {
      isApprox = true;
      rest = rest.slice(approxMatch[0].length).trim();
    }

    const numToken =
      '(\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?|\\.\\d+|[¼½¾⅓⅔⅛⅜⅝⅞])';
    const plusRx = new RegExp(`^${numToken}\\s*\\+\\s*${numToken}\\b\\s*(.*)$`, 'i');
    const plusMatch = rest.match(plusRx);
    if (plusMatch) {
      const left = parseFractionText(plusMatch[1]);
      const right = parseFractionText(plusMatch[2]);
      const sum =
        Number.isFinite(left) && Number.isFinite(right)
          ? Number(left) + Number(right)
          : null;
      const tail = String(plusMatch[3] || '').trim();
      return {
        quantity: `${isApprox ? 'about ' : ''}${plusMatch[1]} + ${plusMatch[2]}`.trim(),
        quantityMin: Number.isFinite(sum) ? sum : null,
        quantityMax: Number.isFinite(sum) ? sum : null,
        quantityIsApprox: isApprox,
        rest: tail,
      };
    }

    const rangeRx = new RegExp(`^${numToken}\\s*(?:to|or|-)\\s*${numToken}\\b\\s*(.*)$`, 'i');
    const rangeMatch = rest.match(rangeRx);
    if (rangeMatch) {
      const min = parseFractionText(rangeMatch[1]);
      const max = parseFractionText(rangeMatch[2]);
      const tail = String(rangeMatch[3] || '').trim();
      const normalizedMin = Number.isFinite(min) ? min : null;
      const normalizedMax = Number.isFinite(max) ? max : null;
      const qtyText = `${isApprox ? 'about ' : ''}${rangeMatch[1]} to ${rangeMatch[2]}`;
      return {
        quantity: qtyText.trim(),
        quantityMin: normalizedMin,
        quantityMax: normalizedMax,
        quantityIsApprox: isApprox,
        rest: tail,
      };
    }

    const glued = parseGluedQuantityAndUnit(rest, options);
    if (glued) {
      const qtyText = isApprox ? `about ${glued.quantity}` : glued.quantity;
      return {
        quantity: qtyText,
        quantityMin: glued.quantityMin,
        quantityMax: glued.quantityMax,
        quantityIsApprox: isApprox,
        unit: glued.unit || '',
        rest: glued.rest,
      };
    }

    const single = parseLeadingQuantity(rest);
    if (single.quantity !== '') {
      const qtyText = `${isApprox ? 'about ' : ''}${String(rest).match(
        /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?|\.\d+|[¼½¾⅓⅔⅛⅜⅝⅞])/
      )?.[1] || ''}`.trim();
      const qNum = Number(single.quantity);
      const asNumber = Number.isFinite(qNum) ? qNum : null;
      return {
        quantity: isApprox ? qtyText : single.quantity,
        quantityMin: asNumber,
        quantityMax: asNumber,
        quantityIsApprox: isApprox,
        rest: single.rest,
      };
    }

    return {
      quantity: '',
      quantityMin: null,
      quantityMax: null,
      quantityIsApprox: false,
      rest: src,
    };
  }

  function normalizeUnitToken(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/\.$/, '')
      .trim();
  }

  function catalogUnitPluralTokens(row) {
    const useOverride = !!row.usePluralOverride;
    if (useOverride) {
      const override = String(row.pluralOverride || '').trim();
      if (override) return [override];
      const stored = String(row.namePlural || '').trim();
      return stored ? [stored] : [];
    }
    const plural = String(row.namePlural || '').trim();
    return plural ? [plural] : [];
  }

  function createIngredientPasteUnitRegistry(catalogUnits) {
    const tokenToCode = Object.create(null);

    const reg =
      typeof window !== 'undefined' ? window.favoriteEatsMeasuredUnitRegistry : null;
    if (reg && reg.MEASURED_UNIT_ALIASES) {
      Object.keys(reg.MEASURED_UNIT_ALIASES).forEach((token) => {
        const key = normalizeUnitToken(token);
        if (key) tokenToCode[key] = reg.MEASURED_UNIT_ALIASES[token];
      });
    }

    Object.keys(UNIT_ALIASES).forEach((token) => {
      const key = normalizeUnitToken(token);
      if (key) tokenToCode[key] = UNIT_ALIASES[token];
    });

    INFERRED_LEADING_UNITS.forEach((token) => {
      const key = normalizeUnitToken(token);
      if (key && !tokenToCode[key]) {
        tokenToCode[key] = UNIT_ALIASES[key] || key;
      }
    });

    (Array.isArray(catalogUnits) ? catalogUnits : []).forEach((row) => {
      if (!row || row.isRemoved) return;
      const code = String(row.code || '').trim();
      if (!code) return;
      tokenToCode[normalizeUnitToken(code)] = code;
      const singular = String(row.nameSingular || '').trim();
      if (singular) tokenToCode[normalizeUnitToken(singular)] = code;
      catalogUnitPluralTokens(row).forEach((name) => {
        const key = normalizeUnitToken(name);
        if (key) tokenToCode[key] = code;
      });
    });

    return {
      resolve(raw) {
        const key = normalizeUnitToken(raw);
        if (!key) return '';
        return tokenToCode[key] || '';
      },
      has(raw) {
        return !!this.resolve(raw);
      },
    };
  }

  let activeUnitRegistry = createIngredientPasteUnitRegistry();

  function getIngredientPasteUnitRegistry(options) {
    return (options && options.unitRegistry) || activeUnitRegistry;
  }

  function resolveUnitAliasToken(raw, unitRegistry) {
    return getIngredientPasteUnitRegistry(
      unitRegistry ? { unitRegistry } : null
    ).resolve(raw);
  }

  function isKnownUnitToken(raw, unitRegistry) {
    return getIngredientPasteUnitRegistry(
      unitRegistry ? { unitRegistry } : null
    ).has(raw);
  }

  const BARE_UNIT_OF_IMPLICIT_COUNT = new Set(
    [
      'pinch',
      'pinches',
      'dash',
      'dashes',
      'handful',
      'handfuls',
      'sprig',
      'sprigs',
      'stalk',
      'stalks',
      'shake',
      'shakes',
      'bunch',
      'bunches',
      'clove',
      'cloves',
      'head',
      'heads',
      'crown',
      'crowns',
      'bag',
      'bags',
    ].map((v) => String(v || '').toLowerCase())
  );

  /** "a pinch of pepper" / "pinch of pepper" → qty 1, unit pinch, rest pepper */
  function parseUnitOfPhrase(text) {
    const src = normalizeWhitespace(text);
    if (!src) return null;

    const articleMatch = src.match(/^(?:a|an)\s+([A-Za-z]+)\s+of\s+(.+)$/i);
    const bareMatch = !articleMatch && src.match(/^([A-Za-z]+)\s+of\s+(.+)$/i);
    const m = articleMatch || bareMatch;
    if (!m) return null;

    const unitRaw = String(m[1] || '').toLowerCase();
    if (articleMatch) {
      if (!isKnownUnitToken(unitRaw)) return null;
    } else if (!BARE_UNIT_OF_IMPLICIT_COUNT.has(unitRaw)) {
      return null;
    }
    const unit = resolveUnitAliasToken(unitRaw) || unitRaw;
    const rest = normalizeWhitespace(m[2]);
    if (!rest) return null;

    return {
      quantity: 1,
      quantityMin: 1,
      quantityMax: 1,
      quantityIsApprox: false,
      unit,
      rest,
    };
  }

  function peelLeadingUnit(text, unitRegistry) {
    const src = String(text || '').trim();
    if (!src) return { unit: '', rest: '' };
    const registry = getIngredientPasteUnitRegistry(
      unitRegistry ? { unitRegistry } : null
    );

    const m2 = src.match(/^([A-Za-z]+\.?)\s+([A-Za-z]+\.?)(?:\s+|$)(.*)$/);
    if (m2) {
      const twoWordRaw = `${m2[1]} ${m2[2]}`
        .toLowerCase()
        .replace(/\./g, '')
        .trim();
      const twoWordMapped = registry.resolve(twoWordRaw);
      if (twoWordMapped) {
        return {
          unit: twoWordMapped,
          rest: String(m2[3] || '').trim(),
        };
      }
    }

    const m1 = src.match(/^([A-Za-z]+\.?)(?:\s+|$)(.*)$/);
    if (!m1) return { unit: '', rest: src };
    const mapped = registry.resolve(m1[1]);
    if (!mapped) return { unit: '', rest: src };

    return {
      unit: mapped,
      rest: String(m1[2] || '').trim(),
    };
  }

  function splitPrepNotes(text) {
    const src = String(text || '');
    const commaIdx = src.indexOf(',');
    if (commaIdx === -1) {
      return { head: normalizeWhitespace(src), prepNotes: '' };
    }
    const head = normalizeWhitespace(src.slice(0, commaIdx));
    const prep = normalizeWhitespace(src.slice(commaIdx + 1));
    return { head, prepNotes: prep };
  }

  function extractParenthetical(text) {
    const src = String(text || '');
    const m = src.match(/\(([^)]*)\)/);
    if (!m) return { text: src, parenthetical: '' };
    const inner = normalizeWhitespace(m[1]);
    const next = normalizeWhitespace(src.replace(m[0], ' '));
    return {
      text: next,
      parenthetical: inner,
    };
  }

  function extractLoosePrepNotes(text) {
    let src = normalizeWhitespace(text);
    if (!src) return { text: '', prepNotes: '' };
    let prepNotes = '';
    const modifierPart = `(?:${PREP_TRAILING_MODIFIERS.join('|')})`;
    const prepTermPart = `(?:${PREP_TRAILING_TERMS.join('|')})`;
    const prepTailAdjPart = `(?:${PREP_TRAILING_TAIL_ADJECTIVES.join('|')})`;
    const prepTermWithOptionalTail = `(?:${prepTermPart}(?:\\s+${prepTailAdjPart})?)`;

    const leadingGroundMatch = src.match(/^(freshly|finely|coarsely)\s+ground\s+(.+)$/i);
    if (leadingGroundMatch) {
      const remainder = normalizeWhitespace(leadingGroundMatch[2]);
      if (PROTECTED_COMPOUND_NAMES.has(remainder.toLowerCase())) {
        prepNotes = normalizeWhitespace(`${leadingGroundMatch[1]} ground`);
        src = remainder;
      }
    }

    const leadingPrepRx = new RegExp(
      `^((?:${modifierPart}\\s+)?${prepTermPart}(?:\\s+and\\s+(?:${modifierPart}\\s+)?${prepTermPart})*)\\s+(.+)$`,
      'i'
    );
    const leadingPrepMatch = src.match(leadingPrepRx);
    if (leadingPrepMatch) {
      const normalizedSrcLower = normalizeDash(src.toLowerCase());
      const keepAsVariant =
        /^(crushed|diced|whole|peeled|stewed|fire-roasted|roasted|sun-dried)\s+tomatoes?$/.test(
          normalizedSrcLower
        );
      const remainder = normalizeWhitespace(leadingPrepMatch[2]);
      if (remainder && !keepAsVariant) {
        src = remainder;
        prepNotes = normalizeWhitespace(
          [prepNotes, normalizeWhitespace(leadingPrepMatch[1])].filter(Boolean).join(', ')
        );
      }
    }

    const trailingPrepRx = new RegExp(
      `^(.+?)\\s+((?:${modifierPart}\\s+)?${prepTermWithOptionalTail}(?:\\s+and\\s+(?:${modifierPart}\\s+)?${prepTermWithOptionalTail})*)$`,
      'i'
    );
    const trailingPrepMatch = src.match(trailingPrepRx);
    if (trailingPrepMatch) {
      src = normalizeWhitespace(trailingPrepMatch[1]);
      prepNotes = normalizeWhitespace(
        [prepNotes, normalizeWhitespace(trailingPrepMatch[2])].filter(Boolean).join(', ')
      );
    } else {
      const trailingPrepExtendedRx = new RegExp(
        `^(.+?)\\s+((?:${modifierPart}\\s+)?${prepTermPart})\\s+(.+)$`,
        'i'
      );
      const trailingPrepExtendedMatch = src.match(trailingPrepExtendedRx);
      if (trailingPrepExtendedMatch) {
        const tail = normalizeWhitespace(trailingPrepExtendedMatch[3] || '');
        if (
          tail &&
          /\b(?:then|and|into|with|using|to make|made into)\b/i.test(tail)
        ) {
          src = normalizeWhitespace(trailingPrepExtendedMatch[1]);
          prepNotes = normalizeWhitespace(
            [
              prepNotes,
              normalizeWhitespace(
                `${trailingPrepExtendedMatch[2]} ${tail}`
              ),
            ]
              .filter(Boolean)
              .join(', ')
          );
        }
      }
    }

    return { text: src, prepNotes };
  }

  function extractInPrepNotes(text) {
    const src = normalizeWhitespace(text);
    if (!src) return { text: '', prepNotes: '' };
    const inPrepMatch = src.match(/^(.+?)\s+(in|into)\s+(.+)$/i);
    if (!inPrepMatch) return { text: src, prepNotes: '' };
    const tail = normalizeWhitespace(inPrepMatch[3] || '');
    if (!tail) return { text: src, prepNotes: '' };
    // Limit "in/into ..." extraction to known cutting/shape cues.
    if (
      !/\b(?:eighths?|sixths?|fourths?|thirds?|quarters?|halves?|quarter|half|moons?|slices?|sliced|florets?|rings?|strips?|batons?|matchsticks?|spears?|chunks?|pieces?|dice|diced|mince|minced|chop|chopped|wedges?|shred|shredded)\b/i.test(
        tail
      )
    ) {
      return { text: src, prepNotes: '' };
    }

    let namePart = normalizeWhitespace(inPrepMatch[1]);
    let prepPart = normalizeWhitespace(`${inPrepMatch[2]} ${tail}`);

    // "mushrooms sliced into strips" → name mushrooms, prep sliced into strips
    const modifierPart = `(?:${PREP_TRAILING_MODIFIERS.join('|')})`;
    const prepTermPart = `(?:${PREP_TRAILING_TERMS.join('|')})`;
    const trailingPrepBeforeInRx = new RegExp(
      `^(.+?)\\s+((?:${modifierPart}\\s+)?${prepTermPart})$`,
      'i'
    );
    const trailingPrepMatch = namePart.match(trailingPrepBeforeInRx);
    if (trailingPrepMatch) {
      namePart = normalizeWhitespace(trailingPrepMatch[1]);
      prepPart = normalizeWhitespace(`${trailingPrepMatch[2]} ${prepPart}`);
    }

    return {
      text: namePart,
      prepNotes: prepPart,
    };
  }

  function normalizeLeadingPrepTail(text) {
    const src = normalizeWhitespace(text);
    if (!src) return '';
    const modifierPart = `(?:${PREP_TRAILING_MODIFIERS.join('|')})`;
    const prepTermPart = `(?:${PREP_TRAILING_TERMS.join('|')})`;
    const leadingPrepRx = new RegExp(
      `^((?:${modifierPart}\\s+)?${prepTermPart}(?:\\s+and\\s+(?:${modifierPart}\\s+)?${prepTermPart})*)\\s+(.+)$`,
      'i'
    );
    const m = src.match(leadingPrepRx);
    if (!m) return src;
    return normalizeWhitespace(`${m[2]} ${m[1]}`);
  }

  function inferUnitAndInlineNoteFromName(text, options) {
    let src = normalizeWhitespace(text);
    if (!src) return { name: '', unit: '', parentheticalNote: '' };
    let unit = '';
    let note = '';
    const unitRegistry = getIngredientPasteUnitRegistry(options);

    const packageOfMatch = src.match(/^(package|packages|pkg|pkgs)\s+of\s+(.+)$/i);
    if (packageOfMatch) {
      unit = 'package';
      src = normalizeWhitespace(packageOfMatch[2]);
    }

    if (!unit) {
      const peeled = peelLeadingUnit(src, unitRegistry);
      if (peeled.unit) {
        unit = peeled.unit;
        src = peeled.rest;
      }
    }

    const weightMatch = src.match(
      /^(.+?)\s+(about\s+\d+\s+\d+\s*\/\s*\d+\s*(?:lb|oz|g|kg)|about\s+\d+(?:\.\d+)?\s*(?:lb|oz|g|kg)|\d+\s+\d+\s*\/\s*\d+\s*(?:lb|oz|g|kg)|\d+(?:\.\d+)?\s*(?:lb|oz|g|kg))$/i
    );
    if (weightMatch) {
      src = normalizeWhitespace(weightMatch[1]);
      note = normalizeWhitespace(weightMatch[2]);
    }

    return { name: src, unit, parentheticalNote: note };
  }

  function extractHeapingQualifier(text) {
    const src = String(text || '').trim();
    const m = src.match(/^heaping\s+(.*)$/i);
    if (!m) return { text: src, heaping: '' };
    return {
      text: String(m[1] || '').trim(),
      heaping: 'heaping',
    };
  }

  function parseContainerMultiplier(quantityParsed) {
    if (!quantityParsed || quantityParsed.quantityMin == null) return null;
    const src = String(quantityParsed.rest || '').trim();
    if (!src) return null;

    const m = src.match(
      /^(?:x|×)\s+(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s+([A-Za-z]+\.?)\s+(cans?|bottles?|jars?|boxes?|packages?|pkgs?)\b\s*(.*)$/i
    );
    if (!m) return null;

    const packQtyRaw = String(m[1] || '').trim();
    const packUnitRaw = String(m[2] || '')
      .toLowerCase()
      .replace(/\.$/, '');
    const containerRaw = String(m[3] || '')
      .toLowerCase()
      .replace(/\.$/, '');
    const tail = String(m[4] || '').trim();
    const packUnit = UNIT_ALIASES[packUnitRaw] || packUnitRaw;
    const containerUnit = UNIT_ALIASES[containerRaw] || containerRaw;
    const size = normalizeWhitespace(`${packQtyRaw} ${packUnit}`);

    return {
      quantityText: String(quantityParsed.quantity || '').trim(),
      quantityMin: quantityParsed.quantityMin,
      quantityMax: quantityParsed.quantityMax,
      quantityIsApprox: !!quantityParsed.quantityIsApprox,
      unit: containerUnit,
      size,
      rest: tail,
    };
  }

  function parseSingleSizedContainer(quantityParsed) {
    if (!quantityParsed || quantityParsed.quantityMin == null) return null;
    const src = String(quantityParsed.rest || '').trim();
    if (!src) return null;

    const m = src.match(
      /^([A-Za-z]+\.?)\s+(cans?|bottles?|jars?|boxes?|packages?|pkgs?)\b\s*(.*)$/i
    );
    if (!m) return null;

    const sizeUnitRaw = String(m[1] || '')
      .toLowerCase()
      .replace(/\.$/, '');
    const containerRaw = String(m[2] || '')
      .toLowerCase()
      .replace(/\.$/, '');
    const tail = String(m[3] || '').trim();

    const sizeUnit = UNIT_ALIASES[sizeUnitRaw] || sizeUnitRaw;
    const containerUnit = UNIT_ALIASES[containerRaw] || containerRaw;
    const sizeAmount = String(quantityParsed.quantity || '').trim();
    const size = normalizeWhitespace(`${sizeAmount} ${sizeUnit}`);

    return {
      quantityText: '1',
      quantityMin: 1,
      quantityMax: 1,
      quantityIsApprox: false,
      unit: containerUnit,
      size,
      rest: tail,
    };
  }

  function parseParentheticalQuantitySize(parentheticalText) {
    const src = normalizeWhitespace(parentheticalText);
    if (!src) return null;
    const qtyParsed = parseQuantityDescriptor(src);
    if (qtyParsed.quantityMin == null || qtyParsed.quantityMax == null) return null;
    const sizeToken = normalizeDash(String(qtyParsed.rest || '').toLowerCase());
    if (!/^(small|medium|large|extra-large)$/.test(sizeToken)) return null;
    return {
      quantity: qtyParsed.quantity,
      quantityMin: qtyParsed.quantityMin,
      quantityMax: qtyParsed.quantityMax,
      quantityIsApprox: !!qtyParsed.quantityIsApprox,
      size: sizeToken,
    };
  }

  function repairUnclosedParensInLine(line) {
    const s = String(line || '');
    const opens = (s.match(/\(/g) || []).length;
    const closes = (s.match(/\)/g) || []).length;
    if (opens <= closes) return s;
    return s + ')'.repeat(opens - closes);
  }

  function shouldParentheticalBeVariant(inner, baseName) {
    const src = normalizeWhitespace(inner);
    if (!src) return false;
    if (/^(to taste|as needed)$/i.test(src)) return false;
    if (
      /\d/.test(src) &&
      /\b(about|approx|roughly|lb|lbs|oz|g|kg|ml|cup|cups)\b/i.test(src)
    ) {
      return false;
    }

    const modifierPart = `(?:${PREP_TRAILING_MODIFIERS.join('|')})\\s+`;
    const prepTermPart = `(?:${PREP_TRAILING_TERMS.join('|')})`;
    const prepOnlyRx = new RegExp(
      `^(?:${modifierPart})?${prepTermPart}(?:\\b|$)`,
      'i',
    );
    const segments = src.split(',').map((part) => normalizeWhitespace(part)).filter(Boolean);
    if (segments.length && segments.every((seg) => prepOnlyRx.test(seg))) {
      return false;
    }

    const firstWord = String(segments[0] || src).toLowerCase().split(/\s+/)[0];
    if (LEADING_VARIANT_PREFIXES.has(firstWord)) return true;

    const herbBase = singularizeSimpleNoun(String(baseName || '').toLowerCase());
    if (HERB_FRESHNESS_BASES.has(herbBase) && /^(fresh|dried)$/i.test(src)) {
      return true;
    }

    if (!/\d/.test(src) && src.length <= 48) {
      const lower = src.toLowerCase();
      const hasPrepWord = PREP_TRAILING_TERMS.some((term) =>
        new RegExp(`\\b${term}\\b`, 'i').test(lower),
      );
      if (!hasPrepWord) return true;
    }

    return false;
  }

  function resolveParentheticalVariant(parenthetical, baseName, existingVariant) {
    const inner = normalizeWhitespace(parenthetical);
    if (!inner || String(existingVariant || '').trim()) {
      return {
        variant: String(existingVariant || '').trim(),
        noteRemainder: inner,
      };
    }
    if (parseParentheticalQuantitySize(inner)) {
      return { variant: '', noteRemainder: '' };
    }
    if (!shouldParentheticalBeVariant(inner, baseName)) {
      return { variant: '', noteRemainder: inner };
    }
    const segments = inner
      .split(',')
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);
    const variant = segments.length > 1 ? segments[0] : inner;
    return { variant, noteRemainder: '' };
  }

  function parseIngredientLine(line, options) {
    const raw = normalizeWhitespace(repairUnclosedParensInLine(line));
    if (!raw) return null;
    const unitRegistry = getIngredientPasteUnitRegistry(options);

    const optional = detectOptional(raw);
    const qualitative = extractQualitativeAmountPhrases(raw);
    const split = splitPrepNotes(qualitative.text || raw);
    const parentheticalSplit = extractParenthetical(split.head);
    const heapingSplit = extractHeapingQualifier(parentheticalSplit.text);
    let qtyParsed = parseQuantityDescriptor(heapingSplit.text, options);
    const unitOfParsed =
      qtyParsed.quantityMin == null && !String(qtyParsed.quantity || '').trim()
        ? parseUnitOfPhrase(heapingSplit.text)
        : null;
    if (unitOfParsed) {
      qtyParsed = {
        quantity: unitOfParsed.quantity,
        quantityMin: unitOfParsed.quantityMin,
        quantityMax: unitOfParsed.quantityMax,
        quantityIsApprox: unitOfParsed.quantityIsApprox,
        rest: unitOfParsed.rest,
      };
    }
    const multiplierParsed = parseContainerMultiplier(qtyParsed);
    const sizedContainerParsed = multiplierParsed
      ? null
      : parseSingleSizedContainer(qtyParsed);
    const parentheticalQtySize = parseParentheticalQuantitySize(parentheticalSplit.parenthetical);
    const unitParsed = multiplierParsed || sizedContainerParsed
      ? {
          unit: (multiplierParsed || sizedContainerParsed).unit,
          rest: (multiplierParsed || sizedContainerParsed).rest,
        }
      : unitOfParsed
      ? { unit: unitOfParsed.unit, rest: unitOfParsed.rest }
      : String(qtyParsed.unit || '').trim()
      ? { unit: qtyParsed.unit, rest: qtyParsed.rest }
      : peelLeadingUnit(qtyParsed.rest, unitRegistry);
    const combinedPrep = normalizeWhitespace(
      [split.prepNotes, heapingSplit.heaping].filter(Boolean).join(', ')
    );

    const normalizedNameRaw = stripOptionalLanguage(
      unitParsed.rest || (multiplierParsed && multiplierParsed.rest) || qtyParsed.rest || split.head
    );
    const normalizedName = unitParsed.unit
      ? normalizeWhitespace(normalizedNameRaw.replace(/^of\s+/i, ''))
      : normalizedNameRaw;
    const loosePrepSplit = extractLoosePrepNotes(normalizedName);
    const inPrepSplit = extractInPrepNotes(loosePrepSplit.text);
    const nameVariant = splitIngredientNameAndVariant(inPrepSplit.text);
    const inferredNameData = inferUnitAndInlineNoteFromName(
      nameVariant.name || raw,
      options
    );
    const hasPrimaryQuantity =
      qtyParsed.quantityMin != null ||
      qtyParsed.quantityMax != null ||
      String(qtyParsed.quantity || '').trim() !== '';
    const hasPrimarySize = String(nameVariant.size || '').trim() !== '';
    const canPromoteParentheticalQtySize =
      !multiplierParsed &&
      !sizedContainerParsed &&
      !hasPrimaryQuantity &&
      !hasPrimarySize &&
      !!parentheticalQtySize;
    const prep = stripOptionalLanguage(
      normalizeWhitespace(
        [loosePrepSplit.prepNotes, inPrepSplit.prepNotes, combinedPrep]
          .filter(Boolean)
          .join(', ')
      )
    );

    const resolvedName =
      inferredNameData.name || nameVariant.name || raw;
    const parentheticalVariant = resolveParentheticalVariant(
      parentheticalSplit.parenthetical,
      resolvedName,
      nameVariant.variant || '',
    );
    const resolvedVariant =
      parentheticalVariant.variant || nameVariant.variant || '';

    return {
      quantity: multiplierParsed || sizedContainerParsed
        ? (multiplierParsed || sizedContainerParsed).quantityText
        : canPromoteParentheticalQtySize
        ? parentheticalQtySize.quantity
        : qtyParsed.quantity,
      quantityMin: multiplierParsed || sizedContainerParsed
        ? (multiplierParsed || sizedContainerParsed).quantityMin
        : canPromoteParentheticalQtySize
        ? parentheticalQtySize.quantityMin
        : qtyParsed.quantityMin,
      quantityMax: multiplierParsed || sizedContainerParsed
        ? (multiplierParsed || sizedContainerParsed).quantityMax
        : canPromoteParentheticalQtySize
        ? parentheticalQtySize.quantityMax
        : qtyParsed.quantityMax,
      quantityIsApprox: multiplierParsed || sizedContainerParsed
        ? !!(multiplierParsed || sizedContainerParsed).quantityIsApprox
        : canPromoteParentheticalQtySize
        ? !!parentheticalQtySize.quantityIsApprox
        : !!qtyParsed.quantityIsApprox,
      unit: unitParsed.unit || inferredNameData.unit || '',
      name: resolvedName,
      variant: resolvedVariant,
      size: multiplierParsed || sizedContainerParsed
        ? (multiplierParsed || sizedContainerParsed).size
        : canPromoteParentheticalQtySize
        ? parentheticalQtySize.size
        : nameVariant.size || '',
      prepNotes: prep,
      parentheticalNote: normalizeWhitespace(
        [
          inferredNameData.parentheticalNote || '',
          stripOptionalLanguage(
            canPromoteParentheticalQtySize
              ? ''
              : parentheticalVariant.noteRemainder || '',
          ),
          ...qualitative.phrases.filter(
            (phrase) => !QUALITATIVE_AMOUNT_PATTERNS.every((rx) => !rx.test(phrase))
          ),
        ]
          .filter(Boolean)
          .join(', ')
      ),
      isOptional: !!optional,
      substitutes: [],
      locationAtHome: '',
      isRecipe: false,
      linkedRecipeId: null,
      recipeText: '',
      isDeprecated: false,
      isAlt: false,
    };
  }

  function altRowHasOwnAmount(row) {
    if (!row) return false;
    if (row.quantityMin != null || row.quantityMax != null) return true;
    if (String(row.quantity || '').trim()) return true;
    if (String(row.unit || '').trim()) return true;
    return false;
  }

  function primaryRowHasShareableAmount(row) {
    if (!row) return false;
    return (
      row.quantityMin != null ||
      row.quantityMax != null ||
      !!String(row.quantity || '').trim() ||
      !!String(row.unit || '').trim()
    );
  }

  /** When "A or B" shares one measure, copy qty/unit onto the alt row if B omitted them. */
  function inheritSharedAmountFieldsFromPrimary(primary, alt) {
    if (!primary || !alt || altRowHasOwnAmount(alt) || !primaryRowHasShareableAmount(primary)) {
      return alt;
    }
    alt.quantity = primary.quantity;
    alt.quantityMin = primary.quantityMin;
    alt.quantityMax = primary.quantityMax;
    alt.quantityIsApprox = !!primary.quantityIsApprox;
    alt.unit = primary.unit || '';
    if (!String(alt.size || '').trim() && String(primary.size || '').trim()) {
      alt.size = primary.size;
    }
    return alt;
  }

  function parseIngredientLineWithAlternates(line, options) {
    const src = normalizeWhitespace(line);
    if (!src) return [];

    const leadingAlt = src.match(/^or\s+(.+)$/i);
    if (leadingAlt) {
      const altRow = parseIngredientLine(leadingAlt[1], options);
      if (!altRow) return [];
      altRow.isAlt = true;
      return [altRow];
    }

    const numToken =
      '(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])';
    const quantityOrRangeRx = new RegExp(`^(${numToken})\\s+or\\s+(${numToken})\\b\\s+(.+)$`, 'i');
    const quantityOrRangeMatch = src.match(quantityOrRangeRx);
    if (quantityOrRangeMatch) {
      const normalized = `${quantityOrRangeMatch[1]} to ${quantityOrRangeMatch[2]} ${quantityOrRangeMatch[3]}`;
      const single = parseIngredientLine(normalized, options);
      return single ? [single] : [];
    }

    const sizeToken = '(?:small|medium|large|extra-large)';
    const sizedAltWithSharedTailRx = new RegExp(
      `^((${numToken})\\s+${sizeToken})\\s+or\\s+((${numToken})\\s+${sizeToken})\\s+(.+)$`,
      'i'
    );
    const sizedAltWithSharedTailMatch = src.match(sizedAltWithSharedTailRx);
    if (sizedAltWithSharedTailMatch) {
      const sharedTail = normalizeLeadingPrepTail(sizedAltWithSharedTailMatch[5] || '');
      const firstExpanded = normalizeWhitespace(`${sizedAltWithSharedTailMatch[1]} ${sharedTail}`);
      const secondExpanded = normalizeWhitespace(`${sizedAltWithSharedTailMatch[3]} ${sharedTail}`);
      const first = parseIngredientLine(firstExpanded, options);
      const second = parseIngredientLine(secondExpanded, options);
      if (first && second) {
        second.isAlt = true;
        return [first, second];
      }
    }

    const altParts = src.split(/\s+\bor\b\s+/i).map(normalizeWhitespace).filter(Boolean);
    if (altParts.length === 2) {
      const first = parseIngredientLine(altParts[0], options);
      const second = parseIngredientLine(altParts[1], options);
      if (first && second) {
        second.isAlt = true;
        inheritSharedAmountFieldsFromPrimary(first, second);
        return [first, second];
      }
    }

    const parsed = parseIngredientLine(src, options);
    return parsed ? [parsed] : [];
  }

  function parseIngredientLines(multilineText, options) {
    return String(multilineText || '')
      .split(/\r?\n/)
      .map((line) => repairUnclosedParensInLine(line))
      .flatMap((line) => parseIngredientLineWithAlternates(line, options))
      .filter((row) => !!row && !!String(row.name || '').trim());
  }

  function setIngredientPasteParserUnitRegistry(registry) {
    activeUnitRegistry =
      registry && typeof registry.resolve === 'function'
        ? registry
        : createIngredientPasteUnitRegistry();
  }

  async function refreshIngredientPasteParserUnitRegistry() {
    const listUnits =
      window.dataService && typeof window.dataService.listUnits === 'function'
        ? window.dataService.listUnits.bind(window.dataService)
        : null;
    if (!listUnits) return activeUnitRegistry;
    try {
      const rows = await listUnits();
      activeUnitRegistry = createIngredientPasteUnitRegistry(rows);
    } catch (_) {}
    return activeUnitRegistry;
  }

  window.parseIngredientLine = parseIngredientLine;
  window.parseIngredientLines = parseIngredientLines;
  window.repairUnclosedParensInIngredientPasteLine = repairUnclosedParensInLine;
  window.parseIngredientQuantityDescriptor = parseQuantityDescriptor;
  window.createIngredientPasteUnitRegistry = createIngredientPasteUnitRegistry;
  window.setIngredientPasteParserUnitRegistry = setIngredientPasteParserUnitRegistry;
  window.getIngredientPasteUnitRegistry = getIngredientPasteUnitRegistry;
  window.refreshIngredientPasteParserUnitRegistry =
    refreshIngredientPasteParserUnitRegistry;
})();
