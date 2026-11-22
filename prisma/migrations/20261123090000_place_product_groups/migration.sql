-- Optional heading for a product in a place's price list ("Vegetables",
-- "From the farm"). Products with the same heading are shown together.
-- Additive and nullable: existing products simply have no heading.
ALTER TABLE "place_products" ADD COLUMN "group_name" TEXT;
