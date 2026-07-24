# What `listShoppingItems` does

This is a written agreement about the main list on the Items page.
Both the old local database and Supabase must give back the same item list.
This doc is the rulebook.

## Summary

**You ask:** "give me the items for the Items page."

**You get back:** a list of ingredient items.

Each item says:

- its saved id
- its name
- its variants
- where it lives at home
- whether it is food
- whether it is hidden
- whether it is removed
- grammar details used when the app writes shopping-list text
- tag names used by the Items page filters
- how many recipes use it
- how many store aisles use it

This only reads data.
It never creates, edits, removes, deletes, or saves an item.

## What you ask for

Nothing.
The Items page asks for the whole item list every time.

Shopping-plan quantities are not part of this function.
Those are handled separately.

## What you get back

You get a list.
Each item in the list has:

- **id** — the saved id for the ingredient item
- **name** — the ingredient name
- **variants** — a list of variant names, like `"whole wheat"` or `"low sodium"`
- **variantIdByName** — the saved id for each variant, when variant ids are available
- **removedVariants** — variant names that are marked removed
- **locationAtHome** — the item's main home location
- **variantHomeLocations** — home locations for specific variants
- **isFood** — true when this item is food, false when it is not food
- **isHidden** — true when this item is hidden
- **isRemoved** — true when this item is removed
- **lemma** — the dictionary form of the name, used for grammar
- **singularIfUnspecified** — true when any grouped row prefers singular wording with unspecified quantity (from `singular_if_unspecified`)
- **isMassNoun** — true for words like rice or milk that do not use a normal plural
- **pluralOverride** — a special plural word, if one is saved
- **tags** — tag names attached to this item
- **variantTagsByName** — per-variant tag names for planner add-by-tag and other variant-scoped flows. Keys are lowercase variant names; the base variant uses `"default"`. Tags are **not** inherited between base and named variants.
- **recipeUseCount** — how many recipes use this item
- **aisleUseCount** — how many store aisles use this item

Example:

```json
[
  {
    "id": 1,
    "name": "flour",
    "variants": ["all-purpose", "whole wheat"],
    "variantIdByName": {
      "all-purpose": 10,
      "whole wheat": 11
    },
    "removedVariants": [],
    "locationAtHome": "pantry",
    "variantHomeLocations": [
      {
        "variant": "whole wheat",
        "homeLocation": "freezer"
      }
    ],
    "isFood": true,
    "isHidden": false,
    "isRemoved": false,
    "lemma": "flour",
    "singularIfUnspecified": true,
    "isMassNoun": true,
    "pluralOverride": "",
    "tags": ["baking"],
    "variantTagsByName": {
      "default": ["baking"],
      "whole wheat": ["baking"]
    },
    "recipeUseCount": 3,
    "aisleUseCount": 1
  }
]
```

## Which Items Are Included

Include every saved ingredient item that has a real name.

Do not include rows where the name is missing, empty, or only spaces.

Hidden items are included.
Removed items are included.
Items marked "not food" are included.

The page needs those rows so it can show the hidden, removed, food, and not-food filters.

## One Row Per Item Name

The list has one row per ingredient name.

If the database has several saved rows with the same name, ignoring upper/lower case and extra spaces, they are combined into one item.

The item's id is the largest saved ingredient id among the rows that were combined.

## Item Names

The item name comes back as saved from the first row for that name.

The name is not trimmed for display.
But empty names are still skipped.

## Variants

Variant names come back in a list.

Missing variants, empty variants, and variants with only spaces are skipped.

Variant names are de-duplicated.
If two variants are the same word with different casing, only the first one in order is kept.

If the variant table exists, variant order follows the saved variant order.
If the variant table does not exist, variants are sorted alphabetically, ignoring upper/lower case.

The base variant named `"default"` is not shown as a normal variant.

## Variant Ids

When saved variant ids are available, `variantIdByName` gives the id for each variant.

The keys use the variant name in lowercase.

If variant ids are not available, `variantIdByName` is empty.

## Removed Variants

`removedVariants` lists variant names that are marked removed.

The names use the same text as the `variants` list.

If no variants are removed, this is an empty list.

## Home Locations

`locationAtHome` is the item's main home location.

If no home location is saved, it comes back as `"none"`.

`variantHomeLocations` gives home locations for specific variants.

Each entry has:

- **variant** — the variant name
- **homeLocation** — where that variant lives at home

If a variant has no saved home location, it uses `"none"`.

If the item has a main home location and a variant has `"none"`, the variant uses the item's main location instead.

## Food, Hidden, And Removed

`isFood` is true unless every saved row for this item says it is not food.

`isHidden` is true only when every saved row for this item is hidden.

`isRemoved` is true only when every saved row for this item is removed.

If the database does not have a removed flag yet, the old hide-from-shopping-list flag counts as the removed flag.

If neither flag exists, the item is not removed.

## Grammar Fields

These fields come back as saved:

- `lemma`
- `singularIfUnspecified`
- `isMassNoun`
- `pluralOverride`

If several saved rows are combined into one item:

- `lemma` uses the first non-empty value
- `singularIfUnspecified` is true if any row says true
- `isMassNoun` is true if any row says true
- `pluralOverride` uses the first non-empty value

Missing text becomes an empty string.
Missing yes/no values become false.

## Tags

Tags come from visible tags attached to this item's variants.

Hidden tags are not included.

Tag names are trimmed.
Blank tag names are skipped.

Tag names are de-duplicated and sorted alphabetically, ignoring upper/lower case.

The flat **tags** list is the union of every variant's tags (used by Items browse filter chips).

**variantTagsByName** keeps the same tag names grouped by variant row:

- base variant key: `"default"`
- named variant keys: lowercase variant name (same rule as **variantIdByName**)

Variant tags do **not** inherit from the base row or from sibling variants.

If the tag tables do not exist, the item still comes back, but **tags** is empty and **variantTagsByName** is `{}`.

## Add by tag (Items planner)

When the user adds by tag, add a direct **unspecified** quantity (`some`) on each variant row whose own tags match **any** selected tag. Skip variants that already have a planner selection (direct count, direct `some`, or any recipe-contributed amount). The base row is included only when the base variant row carries a matching tag.

## Recipe Use Count

`recipeUseCount` is the number of different recipes that use this item.

Both regular recipe ingredients and substitute ingredients count.

If no recipes use the item, the count is `0`.

If the recipe-use count cannot be read, the count is `0`.

## Aisle Use Count

`aisleUseCount` is the number of different store aisles that use this item.

Both item-level aisle links and variant-level aisle links count.

If no aisles use the item, the count is `0`.

If the aisle-use count cannot be read, the count is `0`.

## Order Of The Returned List

The list is ordered alphabetically by item name, ignoring upper/lower case.

## When There Are No Items

You get an empty list: `[]`.

## When Something Goes Wrong

If the main item list cannot be read, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

If only tags or usage counts cannot be read, the item list still comes back.
Missing tags become an empty list.
Missing counts become `0`.

This preserves what the Items page does today.

## What This Function Does NOT Do

- It doesn't filter by the search box. The page does that.
- It doesn't filter hidden, removed, food, or not-food items. The page does that.
- It doesn't apply shopping-plan quantities.
- It doesn't decide which rows are selected for a shopping trip.
- It doesn't create items.
- It doesn't rename items.
- It doesn't remove items.
- It doesn't delete items.
- It doesn't edit variants.
- It doesn't edit tags.
- It doesn't edit home locations.
- It doesn't decide what happens when the user clicks an item.

## Test Scenarios

The test data will live in `js/data/fixtures/listShoppingItems.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios should cover:

1. **Empty database** — returns an empty list.
2. **One simple item** — basic check.
3. **Missing name is skipped** — nameless rows do not appear.
4. **Duplicate item names combine** — same names with different casing become one item.
5. **Variants return in saved order** — variant list order is preserved.
6. **Duplicate variants combine** — repeated variant names appear once.
7. **Default variant is skipped** — `"default"` is not shown as a normal variant.
8. **Variant ids return** — variant ids are available by lowercase variant name.
9. **Removed variants return** — removed variants are listed.
10. **Home location returns** — item-level home location is included.
11. **Variant home locations return** — variant-specific home locations are included.
12. **Variant uses item home location when needed** — `"none"` falls back to the item location.
13. **Food flag returns** — food and not-food items are both included.
14. **Hidden items are included** — hidden items come back with `isHidden` true.
15. **Removed items are included** — removed items come back with `isRemoved` true.
16. **Grammar fields return** — lemma and plural fields are included.
17. **Tags return** — visible variant tags are included.
18. **Hidden tags are skipped** — hidden tags do not appear.
19. **Recipe use count returns** — recipe references are counted.
20. **Substitute use count returns** — substitute references are counted.
21. **Aisle use count returns** — aisle references are counted.
22. **Alphabetical order** — item names are sorted alphabetically.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether duplicate item names should be cleaned up in the database.
- Decide whether hidden and removed items should be separate from the normal item list.
- Decide whether tags and usage counts should fail loudly instead of falling back.
- Decide whether `"default"` should be stored as a real variant or only as an internal marker.

These do NOT happen during migration.
They are separate jobs for later.