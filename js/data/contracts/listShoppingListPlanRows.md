# What `listShoppingListPlanRows` does

This is a written agreement about the generated rows for the shopping-list page.
Both the old local database and Supabase must give back the same generated shopping-list rows.
This doc is the rulebook.

## Summary

**You ask:** "given the current shopping-plan selections, what item rows should the shopping list start from?"

**You get back:** generated item rows with display text, quantity text, and contribution details.

This only reads recipe and ingredient information.
It never creates, edits, removes, deletes, checks off, reorders, or saves shopping-list rows.

This function returns the item rows before store and aisle grouping.
Store and aisle grouping stays in `listShoppingListAssignments`.

## What you ask for

You give it:

- **selectedItems** — items directly added to the shopping plan
- **selectedRecipes** — recipes selected for the shopping plan

Each selected item may have:

- **key** — the shopping-plan item key
- **name** — the item name
- **variantName** — the item variant, or an empty string
- **quantity** — how many were directly added

Each selected recipe may have:

- **recipeId** — the saved recipe id
- **title** — the title saved with the selection, if there is one
- **quantity** — how many times the recipe was selected
- **servings** — the selected servings value, if there is one

Bad entries are skipped.

## What you get back

You get a list of generated item rows.

Each row has:

- **key** — the shopping-list item key
- **name** — the item name
- **variantName** — the item variant, or an empty string
- **variantIsRemoved** — whether the chosen variant is removed
- **label** — the item label without quantities
- **detailText** — the quantity part, such as `2`, `1 cup`, or `some`
- **text** — the full text shown for the row
- **contributionRows** — where the quantities came from

Rows with no display text are skipped.

## Directly Added Items

Directly added items come from `selectedItems`.

A directly added item is included when:

- it has a non-empty name
- it has a positive quantity **or** `quantityUnspecified` is true
- the item exists and is visible in the current ingredient list

Directly added item rows get one contribution source:

- **sourceType** is `manual`
- **title** is `Directly added`

When `quantityUnspecified` is true, the quantity is shown as `some`. Otherwise the quantity is shown as a simple count.

## Recipe Items

Recipe items come from `selectedRecipes`.

A selected recipe is used only when:

- it has a positive recipe id
- it has a positive selected quantity
- the recipe still exists

Recipe ingredient rows are included even if the master ingredient is hidden from the normal item picker.
This keeps alternate ingredients and recipe-only ingredients from disappearing.

Recipe heading rows are skipped.

Recipe rows that point to another recipe are expanded as linked recipes.

## Linked Recipes

Linked recipes may expand up to 2 levels deep.

If a linked recipe points back to a recipe that is already being expanded, it is skipped.
This prevents loops.

If a linked recipe is missing, it is skipped.

If the linked-recipe line has a positive quantity, that quantity multiplies the linked recipe's ingredients.
If it has no positive quantity, it counts as `1`.

## Quantity Rules

For recipe ingredient lines, the quantity comes from this order:

1. max quantity, if it is positive
2. min quantity, if it is positive
3. the normal quantity, if it is a positive number
4. no quantity

If an ingredient line has no positive quantity, it still appears as `some`.

Selected recipe quantity multiplies every ingredient from that recipe.

If selected servings are provided, quantities are scaled like this:

`selected servings / default servings`

If the recipe has no saved default serving amount, **default servings are treated as 1** for this ratio (so “2” means double the written ingredient amounts).

If selected servings are missing or not positive, use the recipe's saved default when there is one; otherwise use **1**, matching the planner's neutral baseline.

## Combining Rows

Rows with the same item key are combined.

For directly added counts, counts add together.

For recipe counts, counts add together when they are the same kind of quantity.

Measured units combine by family:

- weights combine together
- volumes combine together

Exact units combine only when the unit and size match.

Examples:

- `1 cup sugar` plus `2 cup sugar` becomes one sugar row with `3 cup`
- `1 can beans` plus `2 can beans` becomes one beans row with `3 can`
- `1 cup milk` and `2 tbsp milk` combine as a volume amount
- `1 can tomatoes` and `1 jar tomatoes` stay as separate quantity parts

## Quantity Text

The quantity part of a row is `detailText`.

It is built from the row's quantity parts.

Quantity parts are shown in this order:

1. `some`
2. direct counts and recipe counts
3. measured or exact amounts

Multiple quantity parts are joined with `+`.

Examples:

- `some`
- `2`
- `3 cup`
- `2 can`
- `some + 2 can`

## Full Row Text

The full row text is:

- just the item label when there is no quantity text
- `label (quantity text)` when there is quantity text

Examples:

- `flour`
- `flour (2 cup)`
- `whole wheat flour (some + 1 bag)`

## Contribution Rows

Each generated item row includes contribution rows so the UI can show where the row came from.

Each contribution row has:

- **sourceType** — `manual` or `recipe`
- **sourceKey** — `manual:selected` or `recipe:N`
- **recipeId** — the recipe id for recipe rows, or nothing for manual rows
- **title** — the source title
- **detailText** — the quantity text for that source
- **sortValue** — the number used to sort source rows

Contribution rows with no detail text are skipped.

Recipe contribution rows come before manual contribution rows.
Within the same source type, larger quantities come first.
If quantities match, titles sort alphabetically.

## Removed Variants

If a row has a variant and that variant is marked removed for the item, `variantIsRemoved` is true.

If the row has no variant, `variantIsRemoved` is false.

If the item or variant cannot be found, `variantIsRemoved` is false.

## Sorting

This function does not add store or aisle section rows.

It returns generated item rows in the order they are first created:

1. directly selected items first, in the order they are provided
2. recipe items after that, in the order selected recipes are provided
3. linked-recipe items appear where their linked recipe is expanded

Store and aisle sorting happens later.

## When There Are No Rows

If there are no valid selected items and no valid selected recipes, the answer is an empty list.

If selected recipes exist but all are missing or have no usable ingredients, the answer is an empty list.

## When Something Goes Wrong

If recipe or ingredient information cannot be read, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

Bad input entries are not considered data failures.
They are skipped.

## What This Function Does NOT Do

- It doesn't group rows by store or aisle.
- It doesn't read selected stores.
- It doesn't save the shopping plan.
- It doesn't save the shopping-list document.
- It doesn't merge generated rows with user-edited checklist rows.
- It doesn't check off rows.
- It doesn't create, edit, or delete ingredients.
- It doesn't create, edit, or delete recipes.

## Test Scenarios

The test data will live in `js/data/fixtures/listShoppingListPlanRows.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios should cover:

1. **No selections** — returns an empty list.
2. **Bad selected items and recipes** — bad entries are skipped.
3. **Direct item row** — a directly selected visible item creates one row.
4. **Hidden direct item skipped** — hidden or removed picker items are not included as direct rows.
5. **Recipe item row** — a selected recipe creates ingredient rows.
6. **Recipe quantity multiplies** — selecting a recipe more than once multiplies quantities.
7. **Serving scaling** — selected servings scale recipe quantities.
8. **No recipe quantity** — an ingredient with no quantity displays as `some`.
9. **Same item combines** — matching item rows combine.
10. **Different variants stay separate** — variants produce separate rows.
11. **Measured units combine** — compatible weights or volumes combine.
12. **Exact units combine only when unit and size match**.
13. **Contribution rows** — manual and recipe sources are returned and sorted correctly.
14. **Linked recipe expands** — linked recipe ingredients are included.
15. **Linked recipe loop is skipped** — loops do not repeat forever.
16. **Removed variant flag** — removed variants are marked.